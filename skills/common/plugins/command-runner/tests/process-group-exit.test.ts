import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CommandProcessGroup } from '../src/process-group.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-group-exit-'));
function running(hostPid) {
  try {
    const stat = fs.readFileSync(`/proc/${hostPid}/stat`, 'utf8');
    return !['Z', 'X'].includes(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]);
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return false;
    throw error;
  }
}
try {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const directory = path.join(root, String(iteration)); fs.mkdirSync(directory);
    const identity = path.join(directory, 'identity.json');
    const childCode = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({pid:process.pid,hostPid:Number(fs.readFileSync('/proc/self/stat','utf8').split(' ')[0])}));fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);setTimeout(()=>{},5000);`;
    const code = `const fs=require('node:fs'),cp=require('node:child_process');const children=[];for(let i=0;i<3;i++){const file=${JSON.stringify(directory)}+'/'+i+'.json';const child=cp.spawn(process.execPath,['-e',${JSON.stringify(childCode)},file],{stdio:'ignore'});children.push({pid:child.pid,file});child.unref();}const timer=setInterval(()=>{if(children.every(c=>fs.existsSync(c.file))){fs.writeFileSync(${JSON.stringify(identity)},JSON.stringify({leader:process.pid,children:children.map(c=>JSON.parse(fs.readFileSync(c.file,'utf8')))}));clearInterval(timer);}},5);`;
    const leader = spawn(process.execPath, ['-e', code], { cwd: directory, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let leaderStderr = '';
    leader.stderr.setEncoding('utf8');
    leader.stderr.on('data', (chunk) => { leaderStderr += chunk; });
    const processGroup = new CommandProcessGroup(leader, 25);
    try {
      const [exitCode] = await once(leader, 'close');
      await processGroup.cleanup();
      assert.equal(exitCode, 0, `iteration ${iteration}: leader failed: ${leaderStderr}`);
      // No wait after result: the API itself must acknowledge all descendants.
      const group = JSON.parse(fs.readFileSync(identity, 'utf8'));
      const live = group.children.filter(({ hostPid }) => running(hostPid));
      assert.deepEqual(live, [], `iteration ${iteration}: descendants must be nonrunning at settlement`);
    } finally {
      if (fs.existsSync(identity)) {
        const group = JSON.parse(fs.readFileSync(identity, 'utf8'));
        try { process.kill(-group.leader, 'SIGKILL'); } catch { /* Already gone. */ }
        for (const child of group.children) {
          try { process.kill(child.pid, 'SIGKILL'); } catch { /* Already gone. */ }
        }
      }
      await processGroup.cleanup();
    }
  }
  console.log(JSON.stringify({ ok: true, iterations: 8, descendantsPerIteration: 3, assertion: 'nonrunning-at-settlement' }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
