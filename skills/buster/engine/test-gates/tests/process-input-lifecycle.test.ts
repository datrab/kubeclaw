import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureLinuxProcessGroup, linuxProcessGroupRunning } from '@kubeclaw/plugin-foundation/processes/linux-process-group';
const { runProcessInput } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : '../process-input.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-process-lifetime-'));
function running(hostPid: number): boolean {
  try { const stat = fs.readFileSync(`/proc/${hostPid}/stat`, 'utf8'); return !['Z', 'X'].includes(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]!); }
  catch (error) { if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return false; throw error; }
}
const childCode = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({pid:process.pid,hostPid:Number(fs.readFileSync('/proc/self/stat','utf8').split(' ')[0])}));fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);setTimeout(()=>{},5000);`;
try {
  assert.throws(() => captureLinuxProcessGroup(2_147_483_647), /IDENTITY_UNAVAILABLE/);
  await assert.rejects(linuxProcessGroupRunning(2_147_483_647, Date.now() - 1), /CLEANUP_TIMEOUT/);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const dir = path.join(root, String(iteration)); fs.mkdirSync(dir);
    const code = `const fs=require('node:fs'),cp=require('node:child_process');const files=[];for(let i=0;i<3;i++){const f=${JSON.stringify(dir)}+'/'+i+'.json';files.push(f);cp.spawn(process.execPath,['-e',${JSON.stringify(childCode)},f],{stdio:'ignore'}).unref();}const timer=setInterval(()=>{if(files.every(f=>fs.existsSync(f))){clearInterval(timer);}},5);`;
    try {
      const result = await runProcessInput(process.execPath, ['-e', code], { prefix: 'LIFETIME', timeoutMs: 2_000, maximumOutputBytes: 4096 });
      assert.equal(result.code, 0, result.stderr.toString());
      const identities = [0, 1, 2].map((id) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')));
      assert.deepEqual(identities.filter(({ hostPid }) => running(hostPid)), [], `iteration ${iteration}: live descendants at settlement`);
    } finally {
      for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
        const { pid } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        try { process.kill(pid, 'SIGKILL'); } catch { /* Already gone. */ }
      }
    }
  }
  // A real supervisor process must receive TERM and reap its escaped child
  // before the host resorts to killing the original process group.
  const supervised = path.join(root, 'supervised.json');
  const acknowledged = path.join(root, 'term-ack');
  const supervisor = `const fs=require('node:fs'),cp=require('node:child_process');const child=cp.spawn(process.execPath,['-e',${JSON.stringify(childCode)},${JSON.stringify(supervised)}],{detached:true,stdio:'ignore'});process.on('SIGTERM',()=>{child.once('close',()=>{fs.writeFileSync(${JSON.stringify(acknowledged)},'reaped');process.exit(0);});child.kill('SIGKILL');});setInterval(()=>{},1000);`;
  try {
    await assert.rejects(runProcessInput(process.execPath, ['-e', supervisor], { prefix: 'LIFETIME', timeoutMs: 500, maximumOutputBytes: 4096 }), /LIFETIME_TIMEOUT/);
    assert.equal(fs.readFileSync(acknowledged, 'utf8'), 'reaped');
    assert.equal(running(JSON.parse(fs.readFileSync(supervised, 'utf8')).hostPid), false);
  } finally {
    if (fs.existsSync(supervised)) { const { pid } = JSON.parse(fs.readFileSync(supervised, 'utf8')); try { process.kill(pid, 'SIGKILL'); } catch { /* Already gone. */ } }
  }
  // A setsid child retaining a pipe must produce bounded cleanup failure, not a
  // false claim that the escaped child was killed. The fixture owns its cleanup.
  const identity = path.join(root, 'escaped.json');
  const code = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)},${JSON.stringify(identity)}],{detached:true,stdio:['ignore','inherit','inherit']}).unref();`;
  const started = Date.now();
  try {
    await assert.rejects(runProcessInput(process.execPath, ['-e', code], { prefix: 'LIFETIME', timeoutMs: 100, maximumOutputBytes: 4096 }), /LIFETIME_CLEANUP_FAILED/);
    assert.ok(Date.now() - started < 2_500, 'escaped pipe must not hold the caller indefinitely');
  } finally {
    if (fs.existsSync(identity)) { const { pid } = JSON.parse(fs.readFileSync(identity, 'utf8')); try { process.kill(pid, 'SIGKILL'); } catch { /* Already gone. */ } }
  }
  console.log(JSON.stringify({ ok: true, iterations: 8, descendants: 24, escapedPipe: 'bounded-explicit-failure', supervisorTerm: 'acknowledged' }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
