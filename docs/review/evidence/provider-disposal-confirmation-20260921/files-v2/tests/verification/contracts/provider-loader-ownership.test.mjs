import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { ProviderCapabilities } from '../../../skills/buster/engine/test-gates/provider-capabilities.ts';
import { ProviderProcessSession } from '../../../skills/buster/engine/test-gates/provider-process-session.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Serial module only. Spawn arguments and environment are forwarded unchanged.
// Tests require the genuine compiled plugin sandbox, like the original Runner suite.
function fixture(t, source, options = {}) {
  const realSpawn = childProcess.spawn;
  const realKill = process.kill;
  const realRead = fs.readFileSync;
  const closed = deferred();
  let child;
  let actualClose;
  let withheldClose;
  let emit;
  let signalErrors = 0;
  let observationErrors = 0;
  let stdoutBytes = 0;
  let session;
  let spawnMock;
  let killMock;
  let readMock;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-ownership-'));
  t.after(async () => {
    spawnMock?.mock.restore(); syncBuiltinESMExports();
    killMock?.mock.restore(); readMock?.mock.restore();
    if (child) {
      let signalFailure;
      if (!actualClose) {
        try {
          // Same detached group as the real session; never the injected kill.
          if (process.platform !== 'win32' && child.pid) realKill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') signalFailure = error;
        }
        let timer;
        try {
          await Promise.race([closed.promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('FIXTURE_CHILD_CLOSE_TIMEOUT')), 2000);
          })]);
        } finally { clearTimeout(timer); }
      }
      child.emit = emit;
      if (withheldClose) Reflect.apply(emit, child, ['close', ...withheldClose]);
      assert(actualClose, 'real child closure required before removing fixture');
      if (signalFailure) throw signalFailure;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (const name of ['repository', 'scratch', 'evidence']) fs.mkdirSync(path.join(directory, name));
  fs.writeFileSync(path.join(directory, 'provider.mjs'), source);
  spawnMock = t.mock.method(childProcess, 'spawn', function (...args) {
    assert.equal(child, undefined, 'exactly one actual provider spawn');
    child = Reflect.apply(realSpawn, childProcess, args);
    child.stdout.on('data', chunk => { stdoutBytes += chunk.byteLength; });
    emit = child.emit;
    // Observe the actual ChildProcess close event. In the timeout case only
    // delivery to session listeners is withheld; the real child is already dead.
    child.emit = function (event, ...values) {
      if (event === 'close') {
        actualClose = { values, at: performance.now() };
        closed.resolve(actualClose);
        if (options.withholdClose) { withheldClose = values; return false; }
      }
      return Reflect.apply(emit, this, [event, ...values]);
    };
    return child;
  });
  syncBuiltinESMExports();
  killMock = t.mock.method(process, 'kill', function (pid, signal) {
    if (options.signalFailure && child?.pid && pid === -child.pid && signal === 'SIGTERM') {
      signalErrors++;
      throw Object.assign(new Error('injected exact-child SIGTERM EPERM'), { code: 'EPERM' });
    }
    return Reflect.apply(realKill, process, [pid, signal]);
  });
  readMock = t.mock.method(fs, 'readFileSync', function (...args) {
    if (options.observationFailure && child?.pid && args[0] === `/proc/${child.pid}/status`) {
      observationErrors++;
      throw Object.assign(new Error('injected exact-child /proc EACCES'), { code: 'EACCES' });
    }
    return Reflect.apply(realRead, fs, args);
  });
  const controller = new AbortController();
  const context = { workspaceRoot: directory, signal: controller.signal, log() {},
    invoke: async () => { throw new Error('unexpected capability'); } };
  session = new ProviderProcessSession({ package: { root: directory }, registration: {
    registrationId: 'ownership-provider', entrypoint: { module: 'provider.mjs', export: 'provider' },
  } }, { workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' }, inputs: [],
    limits: { memoryBytes: 512 * 1024 * 1024, cpuMillis: 10000, artifactFiles: 16, processes: 16 },
  }, directory, { provider: { ...runnerExecutionPolicy.provider, ...options.providerPolicy }, observation: runnerExecutionPolicy.observation });
  return { session, context, controller, closed: closed.promise,
    releaseClose() {
      assert(actualClose && withheldClose, 'only an actual held close may be released');
      const values = withheldClose; withheldClose = undefined;
      Reflect.apply(emit, child, ['close', ...values]);
    },
    stdoutBytes: () => stdoutBytes,
    signalErrors: () => signalErrors, observationErrors: () => observationErrors };
}

const rpcProvider = `export function provider() { return {
  async execute(_invocation, context) { await context.invoke('test.rpc', {}); return { value: 'done' }; },
}; }`;

async function runningCapability(f, settleAfterClose) {
  const entered = deferred();
  const settlement = deferred();
  let settled = false;
  f.context.invoke = async (_capability, _request, signal) => {
    entered.resolve();
    await f.closed;
    assert.equal(signal.aborted, true);
    if (!settleAfterClose) await new Promise(() => {});
    await delay(80);
    settled = true;
    settlement.resolve();
    return 'settled after real close';
  };
  await f.session.initialize(f.context);
  // Handle the expected execute rejection immediately; no unhandled rejection.
  const execution = f.session.execute(f.context).then(value => ({ value }), error => ({ error }));
  await entered.promise;
  return { execution, settled: () => settled, settlement: settlement.promise };
}

test('signal failure still drains capability settlement after actual child close', { timeout: 10000 }, async t => {
  const f = fixture(t, rpcProvider, { signalFailure: true });
  const pending = await runningCapability(f, true);
  await assert.rejects(f.session.terminate(), { message: 'TEST_PROVIDER_SIGNAL_FAILED' });
  assert.equal(f.signalErrors(), 1);
  await f.closed;
  assert.equal(pending.settled(), true);
  assert.equal(f.session.disposalConfirmed, true);
  assert((await pending.execution).error instanceof Error);
});

test('actual close with nonsettling capability reports bounded drain failure', { timeout: 10000 }, async t => {
  const f = fixture(t, rpcProvider, { signalFailure: true });
  const pending = await runningCapability(f, false);
  const starting = performance.now();
  await assert.rejects(f.session.terminate(), { message: 'TEST_PROVIDER_CAPABILITY_DRAIN_TIMEOUT' });
  const closed = await f.closed;
  assert.equal(f.signalErrors(), 1);
  assert.equal(pending.settled(), false);
  assert.equal(f.session.disposalConfirmed, false);
  assert(performance.now() - closed.at >= 900, 'drain must await its existing 1000ms budget');
  assert(performance.now() - starting < 5000, 'no unbounded drain');
  assert((await pending.execution).error instanceof Error);
});

test('withheld close notification retains termination bound without entering capability drain', { timeout: 10000 }, async t => {
  let drains = 0;
  const originalDrain = ProviderCapabilities.prototype.drain;
  t.mock.method(ProviderCapabilities.prototype, 'drain', function (...args) {
    drains++;
    return Reflect.apply(originalDrain, this, args);
  });
  const f = fixture(t, rpcProvider, { withholdClose: true });
  const pending = await runningCapability(f, false);
  const starting = performance.now();
  await assert.rejects(f.session.terminate(), { message: 'TEST_PROVIDER_TERMINATION_TIMEOUT' });
  assert.equal(f.session.disposalConfirmed, false);
  await f.closed; // actual OS child has ended; only session notification was withheld
  assert.equal(drains, 0, 'no close confirmation means no capability drain');
  assert(performance.now() - starting >= 900);
  assert(performance.now() - starting < 5000);
  assert.equal(pending.settled(), false);
  // The child normally reports the aborted RPC before close. Do not require
  // protocol delivery ordering: cleanup replays close and rejects pending work.
});

test('constructor observation error is retained for later initialize', { timeout: 10000 }, async t => {
  const f = fixture(t, rpcProvider, { observationFailure: true });
  assert(f.observationErrors() >= 1, 'must reach the injected real child /proc read');
  await assert.rejects(f.session.initialize(f.context), { message: 'TEST_PROVIDER_OBSERVATION_FAILED' });
  await f.session.terminate();
  await f.closed;
  await assert.rejects(f.session.initialize(f.context), { message: 'TEST_PROVIDER_OBSERVATION_FAILED' });
});

test('aborted initialization rejects and a distinct healthy session completes real cleanup', { timeout: 10000 }, async t => {
  await t.test('already aborted context', async childTest => {
    const f = fixture(childTest, rpcProvider);
    const reason = new Error('owned initialization abort');
    f.controller.abort(reason);
    await assert.rejects(f.session.initialize(f.context), error => error === reason);
    await f.session.terminate();
    await f.closed;
  });
  await t.test('healthy positive control', async childTest => {
    const f = fixture(childTest, `export function provider() { return {
      execute() { return { value: 'healthy' }; },
      cleanup(_invocation, context) { context.log('stdout', 'actual cleanup'); },
    }; }`);
    const logs = [];
    f.context.log = (stream, content) => logs.push({ stream, content });
    assert.equal(await f.session.initialize(f.context), true);
    assert.deepEqual(await f.session.execute(f.context), { value: 'healthy' });
    await f.session.cleanup(f.context, 'incomplete');
    await f.closed;
    assert(logs.some(row => row.stream === 'stdout' && row.content === 'actual cleanup'));
    await f.session.terminate();
  });
});


for (const terminationTimeoutMs of [100, 500]) test(`real session termination bound ${terminationTimeoutMs} with delayed actual-close delivery`, { timeout: 10000 }, async t => {
  const f = fixture(t, `export function provider() { return { execute() { return {}; } }; }`,
    { withholdClose: true, providerPolicy: { terminationGraceMs: 20, terminationTimeoutMs } });
  await f.session.initialize(f.context);
  const terminating = f.session.terminate().then(() => ({ ok: true }), error => ({ error }));
  await f.closed; // OS process and pipes closed first; no fake process/event.
  await delay(200);
  f.releaseClose();
  const outcome = await terminating;
  if (terminationTimeoutMs === 100) assert.equal(outcome.error?.message, 'TEST_PROVIDER_TERMINATION_TIMEOUT');
  else assert.deepEqual(outcome, { ok: true });
});

for (const maximumPendingCapabilities of [1, 2]) test(`actual session IPC consumes pending-capability count ${maximumPendingCapabilities}`, { timeout: 10000 }, async t => {
  const f = fixture(t, `export function provider() { return { async execute(_i, c) {
    await Promise.all([c.invoke('test.rpc', { n: 1 }), c.invoke('test.rpc', { n: 2 })]); return { value: 'both completed' };
  } }; }`, { providerPolicy: { maximumPendingCapabilities } });
  const entered = deferred(); const release = deferred(); let calls = 0;
  f.context.invoke = async (_name, _request, signal) => {
    calls++; if (calls === maximumPendingCapabilities) entered.resolve();
    await Promise.race([release.promise, new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))]);
    signal.throwIfAborted(); return 'actual parent capability';
  };
  await f.session.initialize(f.context);
  const execution = f.session.execute(f.context).then(value => ({ value }), error => ({ error }));
  try {
    await entered.promise;
    if (maximumPendingCapabilities === 1) {
      const outcome = await execution;
      assert.equal(outcome.error?.message, 'TEST_PROVIDER_CAPABILITY_LIMIT');
      assert.equal(calls, 1);
    } else {
      release.resolve();
      assert.deepEqual((await execution).value, { value: 'both completed' });
      assert.equal(calls, 2);
    }
  } finally { release.resolve(); await f.session.terminate(); await execution; await f.closed; }
});

for (const capabilityDrainTimeoutMs of [10, 500]) test(`actual session IPC consumes capability drain ${capabilityDrainTimeoutMs}`, { timeout: 10000 }, async t => {
  const f = fixture(t, rpcProvider, { providerPolicy: { capabilityDrainTimeoutMs } });
  const pending = await runningCapability(f, true);
  if (capabilityDrainTimeoutMs === 10) {
    await assert.rejects(f.session.terminate(), { message: 'TEST_PROVIDER_CAPABILITY_DRAIN_TIMEOUT' });
    assert.equal(pending.settled(), false, 'timeout does not declare pending IPC work settled');
    await pending.settlement;
  } else await f.session.terminate();
  await f.closed;
  assert.equal(pending.settled(), true);
  assert((await pending.execution).error instanceof Error);
});


for (const maximumProtocolBytes of [512, 4096]) test(`initialized idle session retains actual protocol overflow at ${maximumProtocolBytes} bytes`, { timeout: 10000 }, async t => {
  const content = 'idle overflow payload '.repeat(60);
  const f = fixture(t, `import fs from 'node:fs';
    export function provider() {
      const trigger = new URL('./scratch/overflow-go', import.meta.url);
      const timer = setInterval(() => {
        if (!fs.existsSync(trigger)) return;
        clearInterval(timer);
        process.stdout.write(JSON.stringify({ kind: 'log', stream: 'stdout', content: ${JSON.stringify(content)} }) + String.fromCharCode(10));
      }, 10);
      return { execute() { return { value: 'after idle log' }; }, cleanup() {} };
    }`, { providerPolicy: { maximumProtocolBytes } });
  const received = deferred();
  const logs = [];
  f.context.log = (stream, value) => { logs.push({ stream, value }); if (value === content) received.resolve(); };
  assert.equal(await f.session.initialize(f.context), true);
  assert(f.stdoutBytes() > 0 && f.stdoutBytes() <= 512, 'real initialization completed within the low budget');
  // Only now may the child emit its next frame; no execute/cleanup is pending.
  fs.writeFileSync(path.join(f.context.workspaceRoot, 'scratch/overflow-go'), 'go');
  if (maximumProtocolBytes === 512) {
    await f.closed;
    assert(f.stdoutBytes() > maximumProtocolBytes, 'actual child bytes crossed the selected cap');
    assert.equal(logs.length, 0, 'over-budget frame must not dispatch a log');
    await assert.rejects(f.session.execute(f.context), { message: 'TEST_PROVIDER_PROTOCOL_LIMIT' });
    await assert.rejects(f.session.cleanup(f.context, 'incomplete'), { message: 'TEST_PROVIDER_PROTOCOL_LIMIT' });
    await assert.rejects(f.session.initialize(f.context), { message: 'TEST_PROVIDER_PROTOCOL_LIMIT' });
    await f.session.terminate();
  } else {
    await received.promise;
    assert(f.stdoutBytes() > 512 && f.stdoutBytes() <= maximumProtocolBytes);
    assert.deepEqual(logs, [{ stream: 'stdout', value: content }]);
    assert.deepEqual(await f.session.execute(f.context), { value: 'after idle log' });
    await f.session.cleanup(f.context, 'incomplete');
    await f.closed;
    await f.session.terminate();
  }
});
