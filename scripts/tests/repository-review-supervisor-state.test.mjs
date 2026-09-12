import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fixture } from './fixtures/review-supervisor.mjs';
import { FileMutex } from '../../skills/nova/core/state/file-mutex.ts';
import { acquireLease, releaseLease } from '../lib/repository-review-supervisor-state.mjs';

test('dead owner is replaced and a late release cannot delete the successor lease', async t => {
  const f = fixture(t);
  const module = new URL('../lib/repository-review-supervisor-state.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    'const {acquireLease}=await import(process.argv[1]); const lease=acquireLease(process.argv[2],"crash-run");'
    + 'process.send(lease); setInterval(()=>{},1000);', module, f.lease],
  { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; });
  const [old] = await once(child, 'message');
  const inode = fs.statSync(`${f.lease}.lock`).ino;
  assert.throws(() => acquireLease(f.lease, 'contender'), /REVIEW_SUPERVISOR_ALREADY_ACTIVE/u);
  child.kill('SIGKILL'); await exited;
  const next = acquireLease(f.lease, 'successor');
  releaseLease(old);
  assert.equal(JSON.parse(fs.readFileSync(f.lease, 'utf8')).instanceId, next.instanceId);
  releaseLease(next);
  assert.equal(fs.existsSync(f.lease), false);
  assert.equal(fs.statSync(`${f.lease}.lock`).ino, inode);
});

test('supervisor cannot replace a stale lease during an actual concurrent ownership transaction', t => {
  const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
  // This PID cannot be allocated by Linux (pid_max is bounded below 2^22).
  const content = JSON.stringify({ schemaVersion: 'repository-review-supervisor-lease.v1',
    instanceId: 'stale-owner', runId: 'supervisor-status-regression', supervisorPid: 2147483647 });
  fs.writeFileSync(f.lease, content);
  const mutex = new FileMutex(`${f.lease}.lock`, 1000, 'TEST_LOCK_BUSY');
  mutex.withLock(() => {
    const result = f.invoke();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /REVIEW_SUPERVISOR_LEASE_BUSY/u);
    assert.equal(fs.readFileSync(f.lease, 'utf8'), content);
    assert.equal(result.stdout, '');
  });
  const inode = fs.statSync(`${f.lease}.lock`).ino;
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'succeeded');
  assert.equal(fs.existsSync(f.lease), false);
  assert.equal(fs.statSync(`${f.lease}.lock`).ino, inode, 'stable lock inode survives release');
});

for (const [name, content] of [['malformed JSON', '{broken'], ['unknown owner', '{}']]) {
  test(`supervisor preserves ${name} lease and refuses admission`, t => {
    const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
    fs.writeFileSync(f.lease, content);
    const result = f.invoke();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /REVIEW_SUPERVISOR_(?:JSON_READ_FAILED|LEASE_INVALID)/u);
    assert.equal(result.stdout, '');
    assert.equal(fs.readFileSync(f.lease, 'utf8'), content);
    assert.equal(fs.existsSync(path.join(f.root, 'pipeline.log')), false);
  });
}

test('supervisor preserves malformed heartbeat and releases only its newly acquired lease', t => {
  const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
  const heartbeat = path.join(f.root, 'heartbeat.json');
  fs.writeFileSync(heartbeat, '{broken');
  const result = f.invoke();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_JSON_READ_FAILED/u);
  assert.equal(result.stdout, '');
  assert.equal(fs.readFileSync(heartbeat, 'utf8'), '{broken');
  assert.equal(fs.existsSync(f.lease), false);
});

test('supervisor refuses a lease held by an actual live process', t => {
  const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
  const content = JSON.stringify({ schemaVersion: 'repository-review-supervisor-lease.v1',
    instanceId: 'actual-live-owner', runId: 'supervisor-status-regression', supervisorPid: process.pid,
    acquiredAt: new Date().toISOString() });
  fs.writeFileSync(f.lease, content);
  const result = f.invoke();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_ALREADY_ACTIVE/u);
  assert.equal(fs.readFileSync(f.lease, 'utf8'), content);
});

test('supervisor records an actual missing npm launch and releases its own lease', t => {
  const f = fixture(t); f.writePlatform();
  const emptyPath = path.join(f.root, 'empty-path'); fs.mkdirSync(emptyPath);
  // No replacement executable: the absolute original Node status reader works,
  // while the actual operating-system npm lookup must fail with ENOENT.
  const result = f.invoke({ ...process.env, PATH: emptyPath });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_LAUNCH_FAILED/u);
  assert.match(result.stderr, /ENOENT/u);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(f.lease), false);
  const diagnostic = JSON.parse(fs.readFileSync(path.join(f.root, 'diagnostics/attempt-1-exit.json'), 'utf8'));
  assert.equal(diagnostic.exit.code, null);
  assert.equal(diagnostic.exit.signal, null);
  assert.equal(diagnostic.launchError.code, 'ENOENT');
  assert.equal(diagnostic.sample.pipelineAlive, false);
});

for (const terminal of [false, true]) {
test(`supervisor refuses an unconfirmed live heartbeat owner with terminal journal=${terminal}`, t => {
  const f = fixture(t); f.writePlatform();
  if (terminal) f.terminal('succeeded');
  const heartbeat = path.join(f.root, 'heartbeat.json');
  // This is the actual test process, not a replacement procfs reader or pipeline.
  // Its command may be unreadable in constrained hosts; on ordinary hosts it is
  // readable but is not the requested pipeline. Both must refuse a new owner.
  const content = JSON.stringify({ pipelinePid: process.pid, attempt: 1 });
  fs.writeFileSync(heartbeat, content);
  const emptyPath = path.join(f.root, 'empty-path'); fs.mkdirSync(emptyPath);
  const result = f.invoke({ ...process.env, PATH: emptyPath });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_PROCESS_OWNERSHIP_UNCONFIRMED/u);
  assert.equal(result.stdout, '');
  assert.equal(fs.readFileSync(heartbeat, 'utf8'), content);
  assert.equal(fs.existsSync(path.join(f.root, 'pipeline.log')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'resources.jsonl')), false);
  assert.equal(fs.existsSync(f.lease), false);
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});
}

test('a confirmed absent heartbeat process does not obstruct original terminal status', t => {
  const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
  fs.writeFileSync(path.join(f.root, 'heartbeat.json'), JSON.stringify({ pipelinePid: 2147483647 }));
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'succeeded');
  assert.equal(fs.existsSync(f.lease), false);
});
