import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DirectCommandCapabilityInvoker } from '@kubeclaw/buster-engine';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-command-runtime-'));
const runtimeReadRoots = [path.dirname(process.execPath), '/lib/x86_64-linux-gnu', '/lib64', '/etc/ssl'];
const runner = new DirectCommandCapabilityInvoker({ workspaceRoot: root,
  executableCatalog: new Map([['node', process.execPath]]), executableSearchPath: [path.dirname(process.execPath)],
  runtimeReadRoots,
  maximumOutputBytes: 1024 * 1024,
  maximumExecutionMs: 5_000, maximumProcesses: 8, maximumMemoryBytes: 512 * 1024 * 1024,
  maximumCpuMillis: 5_000, terminationGraceMs: 50, allowSampledProcessLimit: true });
const limits = { maxOutputBytes: 1024 * 1024, maxExecutionMs: 5_000, maximumProcesses: 8,
  memoryBytes: 512 * 1024 * 1024, cpuMillis: 5_000, openFiles: 64 };
const request = (args: string[], extra: Record<string, unknown> = {}) => ({ operation: 'run',
  resource: { type: 'command.executable', canonicalId: 'catalog:node' },
  payload: { args, workingDirectory: root, writableRoot: root, environment: { CI: 'true' }, limits, ...extra } });

try {
  const literal = ['a b', '&&', '$HOME', '*', '"quoted"'];
  const result: any = await runner.invoke('command.execute', request(['-e',
    'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write("stderr")', ...literal]),
    new AbortController().signal);
  assert.equal(result.exitCode, 0); assert.deepEqual(JSON.parse(result.stdout), literal);
  assert.equal(result.stderr, 'stderr'); assert.deepEqual(result.records.map((item: any) => item.stream), ['stdout', 'stderr']);
  assert.equal(result.resources.maximumProcesses >= 1, true);
  const singleProcess: any = await runner.invoke('command.execute', request(['-e', 'process.stdout.write("one")'],
    { limits: { ...limits, maximumProcesses: 1 } }), new AbortController().signal);
  assert.equal(singleProcess.exitCode, 0, JSON.stringify(singleProcess));
  assert.equal(singleProcess.resources.maximumProcesses, 1);
  const sanitized: any = await runner.invoke('command.execute', request(['-e',
    'const {spawnSync}=require("node:child_process");const c=spawnSync("node",["--version"],{encoding:"utf8"});process.stdout.write(JSON.stringify({status:c.status,path:!!process.env.PATH,home:process.env.HOME,tmp:process.env.TMPDIR}))']),
  new AbortController().signal);
  const sanitizedEnvironment = JSON.parse(sanitized.stdout);
  assert.equal(sanitizedEnvironment.status, 0); assert.equal(sanitizedEnvironment.path, true);
  assert.equal(sanitizedEnvironment.home, path.join(root, '.kubeclaw-home'));
  assert.equal(sanitizedEnvironment.tmp, path.join(root, '.kubeclaw-tmp'));
  assert.throws(() => runner.invoke('command.execute', request([], { environment: { LD_PRELOAD: '/tmp/attack.so' } }),
    new AbortController().signal), /DIRECT_COMMAND_ENVIRONMENT_INVALID/u);

  const network: any = await runner.invoke('command.execute', request(['-e',
    'const d=require("node:dgram").createSocket("udp4");d.once("error",e=>{process.stdout.write(e.code||e.message);process.exit(0)});d.once("listening",()=>process.exit(9));d.bind(0)']),
    new AbortController().signal);
  assert.equal(network.exitCode, 0); assert.match(network.stdout, /EPERM|operation not permitted/iu);
  const outside = path.join(path.dirname(root), `direct-command-denied-${process.pid}`);
  const filesystem: any = await runner.invoke('command.execute', request(['-e',
    `try{require('node:fs').writeFileSync(${JSON.stringify(outside)},'denied');process.exit(9)}catch(e){process.stdout.write(e.code||e.message)}`]),
  new AbortController().signal);
  assert.equal(filesystem.exitCode, 0); assert.match(filesystem.stdout, /EACCES|EPERM|permission denied/iu);
  assert.equal(fs.existsSync(outside), false);
  const hostRead: any = await runner.invoke('command.execute', request(['-e',
    `try{require('node:fs').readFileSync('/etc/passwd');process.exit(9)}catch(e){process.stdout.write(e.code||e.message)}`]),
  new AbortController().signal);
  assert.equal(hostRead.exitCode, 0); assert.match(hostRead.stdout, /EACCES|EPERM|permission denied/iu);
  const hostDirectory: any = await runner.invoke('command.execute', request(['-e',
    `try{require('node:fs').readdirSync('/etc');process.exit(9)}catch(e){process.stdout.write(e.code||e.message)}`]),
  new AbortController().signal);
  assert.equal(hostDirectory.exitCode, 0); assert.match(hostDirectory.stdout, /EACCES|EPERM|permission denied/iu);
  const backgroundMarker = path.join(root, 'background-marker');
  const background: any = await runner.invoke('command.execute', request(['-e',
    `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(backgroundMarker)},'escaped'),200)`) }],{stdio:'ignore'});c.unref();`]),
  new AbortController().signal);
  assert.equal(background.exitCode, 0, JSON.stringify(background));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(fs.existsSync(backgroundMarker), false);
  const detachedMarker = path.join(root, 'detached-marker');
  const detached: any = await runner.invoke('command.execute', request(['-e',
    `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(detachedMarker)},'escaped'),200)`) }],{detached:true,stdio:'ignore'});c.on('error',()=>{});c.unref();setTimeout(()=>{},30);`]),
  new AbortController().signal);
  assert.equal(detached.exitCode, 0, JSON.stringify(detached));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(fs.existsSync(detachedMarker), false);
  const timedDetachedMarker = path.join(root, 'timed-detached-marker');
  const timedDetached: any = await runner.invoke('command.execute', request(['-e',
    `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(timedDetachedMarker)},'escaped'),300)`) }],{detached:true,stdio:'ignore'});c.unref();setTimeout(()=>{},10000);`],
  { limits: { ...limits, maxExecutionMs: 100 } }), new AbortController().signal);
  assert.equal(timedDetached.errorCode, 'COMMAND_TIMEOUT');
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(fs.existsSync(timedDetachedMarker), false);
  assert.throws(() => runner.invoke('command.execute', { ...request([]),
    resource: { type: 'command.executable', canonicalId: 'catalog:unknown' } }, new AbortController().signal),
  /DIRECT_COMMAND_EXECUTABLE_DENIED/u);
  assert.throws(() => runner.invoke('command.execute', request([], { workingDirectory: path.dirname(root) }),
    new AbortController().signal), /DIRECT_COMMAND_WORKING_DIRECTORY_DENIED/u);
  const outputLimited: any = await runner.invoke('command.execute', request(['-e', 'process.stdout.write("x".repeat(1000))'],
    { limits: { ...limits, maxOutputBytes: 10 } }), new AbortController().signal);
  assert.equal(outputLimited.errorCode, 'COMMAND_OUTPUT_LIMIT_EXCEEDED');
  assert.equal(outputLimited.stdout.length, 0);
  const timedOut: any = await runner.invoke('command.execute', request(['-e', 'process.stdout.write("before-timeout");setTimeout(()=>{},10000)'],
    { limits: { ...limits, maxExecutionMs: 200 } }), new AbortController().signal);
  assert.equal(timedOut.errorCode, 'COMMAND_TIMEOUT');
  assert.equal(timedOut.stdout, 'before-timeout');
  const controller = new AbortController();
  const pending = runner.invoke('command.execute', request(['-e', 'setTimeout(()=>{},10000)']), controller.signal);
  setTimeout(() => controller.abort(), 20);
  assert.equal((await pending as any).errorCode, 'ADAPTER_CANCELLED');
} finally { await runner.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'direct-command', literalArguments: true,
  network: 'denied', filesystemWrites: 'attempt-only', limits: true }));
