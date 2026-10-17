import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { SourceProcessLifecycle } from '../../../skills/nova/core/test-gates/source-process-lifecycle.ts';

const realKill = process.kill.bind(process);
async function ownedChild(t, program, closeDelay = 0) {
  let child;
  let release;
  let actualClose = false;
  let notification;
  let closed;
  t.after(async () => {
    try {
      if (child && !actualClose) {
        try { realKill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
        let timer;
        try { await Promise.race([closed, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('OWNED_CHILD_CLOSE_TIMEOUT')), 2000);
        })]); } finally { clearTimeout(timer); }
      }
    } finally { clearTimeout(notification); release?.(); }
  });
  child = spawn(process.execPath, ['-e', program], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let acknowledge;
  closed = new Promise(resolve => { acknowledge = resolve; });
  const notified = new Promise(resolve => { release = resolve; });
  child.once('close', () => {
    actualClose = true; acknowledge();
    if (closeDelay) notification = setTimeout(release, closeDelay);
    else release();
  });
  let timer;
  try { await Promise.race([
    new Promise((resolve, reject) => { child.stdout.once('data', bytes => {
      try { assert.equal(bytes.toString(), 'ready'); resolve(); } catch (error) { reject(error); }
    }); child.once('error', reject); }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OWNED_CHILD_READY_TIMEOUT')), 2000); }),
  ]); } finally { clearTimeout(timer); }
  return { child, notified, hasClosed: () => actualClose };
}
function contains(error, expected) {
  return error === expected || (error instanceof AggregateError && error.errors.some(item => contains(item, expected)))
    || (error?.cause !== undefined && contains(error.cause, expected));
}
const ignoreTerm = "process.on('SIGTERM',()=>{}); process.stdout.write('ready'); setInterval(()=>{},1000);";

test('Nova TERM failure retains ownership until actual child close', { timeout: 10000 }, async t => {
  const owned = await ownedChild(t, ignoreTerm);
  const failure = Object.assign(new Error('injected TERM denial'), { code: 'EPERM' });
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === -owned.child.pid && signal === 'SIGTERM') throw failure;
    return realKill(pid, signal);
  });
  const lifecycle = new SourceProcessLifecycle(owned.child, owned.notified);
  await assert.rejects(lifecycle.cleanup(), error => contains(error, failure));
  assert.equal(owned.hasClosed(), true, 'a rejected cleanup still awaits actual close within its bound');
});

test('Nova timed KILL failure remains visible after natural child close', { timeout: 10000 }, async t => {
  const owned = await ownedChild(t,
    "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),400)); process.stdout.write('ready'); setInterval(()=>{},1000);");
  const failure = Object.assign(new Error('injected KILL denial'), { code: 'EPERM' });
  let observedKill = false;
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === -owned.child.pid && signal === 'SIGKILL') { observedKill = true; throw failure; }
    return realKill(pid, signal);
  });
  const lifecycle = new SourceProcessLifecycle(owned.child, owned.notified);
  await assert.rejects(lifecycle.cleanup(), error => contains(error, failure));
  assert.equal(observedKill, true);
  assert.equal(owned.hasClosed(), true);
});

test('Nova group observation failure is retained with a later close-notification timeout', { timeout: 10000 }, async t => {
  const owned = await ownedChild(t, ignoreTerm, 2000);
  const failure = Object.assign(new Error('injected proc denial'), { code: 'EACCES' });
  const scan = fs.promises.readdir.bind(fs.promises);
  t.mock.method(fs.promises, 'readdir', (...args) => {
    if (args[0] === '/proc' && new Error().stack?.includes('linuxProcessGroupRunning')) throw failure;
    return scan(...args);
  });
  const lifecycle = new SourceProcessLifecycle(owned.child, owned.notified);
  await assert.rejects(lifecycle.cleanup(), error => {
    assert(contains(error, failure));
    assert(error instanceof AggregateError);
    assert(error.errors.some(item => item.message === 'NOVA_SOURCE_PROCESS_CLEANUP_TIMEOUT'));
    return true;
  });
  assert.equal(owned.hasClosed(), true, 'notification is held only after actual OS close');
});


test('selected source force-kill delay is captured before author mutation and awaits real close', { timeout: 10000 }, async t => {
  const { LEGACY_SOURCE_ACQUISITION_POLICY: legacy } = await import('../../../skills/nova/core/test-gates/source-acquisition-policy.ts');
  const owned = await ownedChild(t, ignoreTerm);
  const authored = { ...legacy, cleanupTimeoutMs: 2500, forceKillAfterMs: 500, pollIntervalMs: 5 };
  let killAt;
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === -owned.child.pid && signal === 'SIGKILL') killAt = performance.now();
    return realKill(pid, signal);
  });
  const lifecycle = new SourceProcessLifecycle(owned.child, owned.notified, authored);
  authored.forceKillAfterMs = 1;
  const started = performance.now();
  const cleanup = lifecycle.cleanup();
  assert.equal(lifecycle.cleanup(), cleanup, 'concurrent cleanup callers share ownership');
  await cleanup;
  assert.equal(owned.hasClosed(), true);
  assert(killAt - started >= 450, 'selected 500ms delay, not mutated 1ms or legacy 250ms');
});

test('selected cleanup bound retains missing-close failure after actual child termination', { timeout: 10000 }, async t => {
  const { LEGACY_SOURCE_ACQUISITION_POLICY: legacy } = await import('../../../skills/nova/core/test-gates/source-acquisition-policy.ts');
  const owned = await ownedChild(t, ignoreTerm, 2000);
  const authored = { ...legacy, cleanupTimeoutMs: 150, forceKillAfterMs: 20, pollIntervalMs: 5 };
  const lifecycle = new SourceProcessLifecycle(owned.child, owned.notified, authored);
  authored.cleanupTimeoutMs = 5000;
  const started = performance.now();
  await assert.rejects(lifecycle.cleanup(), /NOVA_SOURCE_PROCESS_CLEANUP_TIMEOUT/);
  assert.equal(owned.hasClosed(), true, 'real child was killed, only close notification is withheld');
  assert(performance.now() - started < 1200, 'selected 150ms bound, not legacy 1500ms or mutated 5000ms');
});
