import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { runProcessInput } from '../../../skills/buster/engine/test-gates/process-input.ts';
import { validateBusterProcessInputSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';

const selected = { cleanupTimeoutMs: 1500, terminationGraceMs: 250, acknowledgementPollMs: 10 };
function observe(t, delayedClose = false) {
  const realSpawn = childProcess.spawn;
  const realKill = process.kill;
  const realScan = fs.promises.readdir;
  let row;
  const signals = [];
  const scans = [];
  let releaseTimer;
  let spawnHook;
  let killHook;
  let scanHook;
  t.after(async () => {
    try {
      if (row && !row.actualClose) {
        let signalError;
        try { realKill(-row.child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') signalError = error; }
        let timer;
        try { await Promise.race([row.closed, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('OWNED_TEST_CHILD_CLOSE_TIMEOUT')), 2000);
        })]); } finally { clearTimeout(timer); }
        if (signalError) throw signalError;
      }
      if (row?.heldClose) { row.emit.call(row.child, 'close', ...row.heldClose); row.heldClose = null; }
      clearTimeout(releaseTimer);
    } finally {
      spawnHook?.mock.restore(); killHook?.mock.restore(); scanHook?.mock.restore(); syncBuiltinESMExports();
    }
  });
  spawnHook = t.mock.method(childProcess, 'spawn', function (...args) {
    assert.equal(row, undefined, 'one exact actual child');
    assert.equal(args[2]?.detached, true);
    const child = Reflect.apply(realSpawn, childProcess, args);
    let close;
    row = { child, actualClose: false, heldClose: null, emit: child.emit,
      closed: new Promise(resolve => { close = resolve; }), stdout: '' };
    child.stdout.on('data', bytes => { row.stdout += bytes.toString(); });
    child.emit = function (event, ...values) {
      if (event === 'close') {
        row.actualClose = true; close();
        if (delayedClose) {
          row.heldClose = values;
          releaseTimer = setTimeout(() => { row.heldClose = null; row.emit.call(child, event, ...values); }, 200);
          return false;
        }
      }
      return Reflect.apply(row.emit, child, [event, ...values]);
    };
    return child;
  });
  syncBuiltinESMExports();
  killHook = t.mock.method(process, 'kill', function (pid, signal) {
    if (row && pid === -row.child.pid && signal !== 0) signals.push({ signal, at: performance.now() });
    return Reflect.apply(realKill, process, [pid, signal]);
  });
  scanHook = t.mock.method(fs.promises, 'readdir', function (...args) {
    if (args[0] === '/proc' && new Error().stack?.includes('linuxProcessGroupRunning')) scans.push(performance.now());
    return Reflect.apply(realScan, fs.promises, args);
  });
  return { signals, scans, child: () => row };
}

const ignoreTerm = `process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000);`;
function options(policy) {
  return { processInputPolicy: policy, prefix: 'POLICY', timeoutMs: 500, maximumOutputBytes: 4096 };
}

test('required process-input policy and explicit command bounds fail before spawn', t => {
  let spawns = 0;
  t.mock.method(childProcess, 'spawn', () => { spawns++; throw new Error('UNEXPECTED_SPAWN'); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  for (const key of Object.keys(selected)) {
    for (const value of [undefined, null, '10', 0, -1, 1.5, 2147483648]) {
      const policy = { ...selected, [key]: value };
      assert.throws(() => runProcessInput(process.execPath, ['-e', ''], options(policy)), /SWARM_CONFIG_BUSTER_PROCESS_INPUT/);
    }
  }
  assert.throws(() => runProcessInput(process.execPath, [], options(undefined)), /SWARM_CONFIG_BUSTER_PROCESS_INPUT/);
  assert.throws(() => runProcessInput(process.execPath, [], { ...options(selected), timeoutMs: undefined }), /PROCESS_INPUT_TIMEOUT_INVALID/);
  assert.throws(() => runProcessInput(process.execPath, [], { ...options(selected), maximumOutputBytes: undefined }), /PROCESS_INPUT_OUTPUT_LIMIT_INVALID/);
  assert.throws(() => validateBusterProcessInputSettings({ ...selected, terminationGraceMs: 1500 }), /TIMING_INVALID/);
  assert.throws(() => validateBusterProcessInputSettings({ ...selected, acknowledgementPollMs: 1501 }), /TIMING_INVALID/);
  assert.equal(spawns, 0);
});

for (const terminationGraceMs of [50, 400]) test(`actual escalation consumes ${terminationGraceMs}ms`, { timeout: 10000 }, async t => {
  const observed = observe(t);
  const policy = { ...selected, terminationGraceMs };
  const running = runProcessInput(process.execPath, ['-e', ignoreTerm], options(policy));
  policy.terminationGraceMs = 1200; // caller mutation cannot alter the captured policy
  await assert.rejects(running, { message: 'POLICY_TIMEOUT' });
  assert.equal(observed.child().stdout, 'ready');
  assert.equal(observed.child().actualClose, true);
  const term = observed.signals.find(row => row.signal === 'SIGTERM');
  const kill = observed.signals.find(row => row.signal === 'SIGKILL');
  assert(term && kill);
  const elapsed = kill.at - term.at;
  assert(elapsed >= terminationGraceMs - 15);
  if (terminationGraceMs === 50) assert(elapsed < 300, 'must distinguish the longer authored grace');
});

for (const cleanupTimeoutMs of [100, 600]) test(`cleanup close bound consumes ${cleanupTimeoutMs}ms`, { timeout: 10000 }, async t => {
  const observed = observe(t, true);
  const policy = { cleanupTimeoutMs, terminationGraceMs: 20, acknowledgementPollMs: 10 };
  const running = runProcessInput(process.execPath, ['-e', 'process.stdout.write("ready")'], options(policy));
  if (cleanupTimeoutMs === 100) {
    await assert.rejects(running, error => error.message === 'POLICY_CLEANUP_FAILED'
      && error.errors.some(cause => cause.message === 'PROCESS_INPUT_CLEANUP_TIMEOUT'));
  } else assert.equal((await running).code, 0);
  assert.equal(observed.child().stdout, 'ready');
  assert.equal(observed.child().actualClose, true, 'only notification was held, actual process ended');
});

for (const acknowledgementPollMs of [10, 100]) test(`actual group scan intervals consume ${acknowledgementPollMs}ms`, { timeout: 10000 }, async t => {
  const observed = observe(t);
  await assert.rejects(runProcessInput(process.execPath, ['-e', ignoreTerm], options({
    cleanupTimeoutMs: 2000, terminationGraceMs: 600, acknowledgementPollMs,
  })), { message: 'POLICY_TIMEOUT' });
  assert.equal(observed.child().stdout, 'ready');
  assert.equal(observed.child().actualClose, true);
  assert(observed.scans.length >= 3, 'actual repeated group checks required');
  const gaps = observed.scans.slice(1).map((value, index) => value - observed.scans[index]);
  if (acknowledgementPollMs === 100) assert(gaps.every(gap => gap >= 90));
  else assert(gaps.some(gap => gap < 90), 'must distinguish the long polling profile');
});
