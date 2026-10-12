import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { test } from 'node:test';

// Actual child protocol tests. Full Runner tests separately prove the sandboxed path.
async function startChild(t, source, observation) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-session-'));
  let child;
  let closed;
  let lines;
  let terminal = false;
  t.after(async () => {
    try {
      if (child && !terminal) child.kill('SIGKILL');
      if (closed) await closed;
    } finally {
      lines?.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  const modulePath = path.join(directory, 'provider.mjs');
  await fs.writeFile(modulePath, source);
  const trace = path.join(directory, 'intervals.jsonl');
  const observer = path.join(directory, 'observe-intervals.mjs');
  await fs.writeFile(trace, '');
  await fs.writeFile(observer, `
    import fs from 'node:fs';
    const original = globalThis.setInterval;
    const record = (event) => fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify(event) + '\\n');
    globalThis.setInterval = function (callback, delay, ...args) {
      record({ kind: 'scheduled', delay });
      return Reflect.apply(original, this, [function (...values) {
        record({ kind: 'fired', delay });
        return Reflect.apply(callback, this, values);
      }, delay, ...args]);
    };
  `);
  child = spawn(process.execPath,
    ['--import', observer, "/tmp/child-observation-control-sac7x5ib/provider-child.mjs"],
    { stdio: ['pipe', 'pipe', 'pipe'] });
  const messages = [];
  const waiters = new Set();
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { terminal = true; resolve({ code, signal }); });
  });
  lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    messages.push(message);
    for (const notify of waiters) notify();
  });
  function next(predicate) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`Child message missing; stderr=${stderr}; messages=${JSON.stringify(messages)}`));
      }, 5000);
      function check() {
        const index = messages.findIndex(predicate);
        if (index < 0) return;
        clearTimeout(timeout);
        waiters.delete(check);
        resolve(messages.splice(index, 1)[0]);
      }
      waiters.add(check);
      check();
    });
  }
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const initialize = (policy) => send({ kind: 'initialize', modulePath, exportName: 'provider',
    invocation: {}, workspaceRoot: directory, observation: policy });
  initialize(observation);
  return { send, next, closed, initialize, remaining: () => structuredClone(messages),
    intervals: async () => (await fs.readFile(trace, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)) };
}

test('real child preserves detached invoke, concurrent replies, instance state and import logs', { timeout: 10000 }, async (t) => {
  const session = await startChild(t, `
    console.log('provider imported');
    export function provider() {
      return {
        values: null,
        async execute(invocation, context) {
          const { invoke } = context;
          this.values = await Promise.all([
            invoke('test.rpc', { ordinal: 1 }), invoke('test.rpc', { ordinal: 2 }),
          ]);
          return { values: this.values };
        },
        async cleanup(invocation, context) {
          if (JSON.stringify(this.values) !== '["first","second"]') throw new Error('INSTANCE_STATE_LOST');
          context.log('stdout', 'cleanup retained instance state');
        },
      };
    }
  `, { resourceSampleIntervalMs: 10 });
  const imported = await session.next((m) => m.kind === 'log');
  assert.equal(imported.content, 'provider imported\n');
  assert.equal(imported.stream, 'stdout');
  assert.equal((await session.next((m) => m.kind === 'initialized')).supportsCleanup, true);
  session.send({ kind: 'execute' });
  const first = await session.next((m) => m.kind === 'capability' && m.request.ordinal === 1);
  const second = await session.next((m) => m.kind === 'capability' && m.request.ordinal === 2);
  assert.notEqual(first.id, second.id);
  session.send({ kind: 'capability-result', id: second.id, ok: true, value: 'second' });
  session.send({ kind: 'capability-result', id: first.id, ok: true, value: 'first' });
  assert.deepEqual((await session.next((m) => m.kind === 'result')).value, { values: ['first', 'second'] });
  session.send({ kind: 'cleanup' });
  assert.equal((await session.next((m) => m.kind === 'log')).content, 'cleanup retained instance state');
  await session.next((m) => m.kind === 'cleanup-result');
  assert.deepEqual(await session.closed, { code: 0, signal: null });
  assert.deepEqual(session.remaining(), [], 'no extra protocol messages after all expected replies and closure');
});

for (const replyBeforeAbort of [false, true]) {
  test(`real child settles outstanding RPCs and ignores late replies; early reply=${replyBeforeAbort}`, { timeout: 10000 }, async (t) => {
    const session = await startChild(t, `
      export function provider() {
        return { async execute(invocation, context) {
          const { invoke } = context;
          const results = await Promise.allSettled([
            invoke('test.rpc', { ordinal: 1 }), invoke('test.rpc', { ordinal: 2 }),
          ]);
          return { statuses: results.map((result) => result.status), aborted: context.signal.aborted };
        } };
      }
    `, { resourceSampleIntervalMs: 10 });
    await session.next((m) => m.kind === 'initialized');
    session.send({ kind: 'execute' });
    const first = await session.next((m) => m.kind === 'capability' && m.request.ordinal === 1);
    const second = await session.next((m) => m.kind === 'capability' && m.request.ordinal === 2);
    if (replyBeforeAbort) session.send({ kind: 'capability-result', id: first.id, ok: true, value: 'first' });
    session.send({ kind: 'abort', reason: 'TEST_CANCEL' });
    await session.next((m) => m.kind === 'capability-abort' && m.id === second.id);
    if (!replyBeforeAbort) await session.next((m) => m.kind === 'capability-abort' && m.id === first.id);
    assert.deepEqual((await session.next((m) => m.kind === 'result')).value,
      { statuses: [replyBeforeAbort ? 'fulfilled' : 'rejected', 'rejected'], aborted: true });
    session.send({ kind: 'capability-result', id: second.id, ok: true, value: 'late' });
    session.send({ kind: 'cleanup' });
    await session.next((m) => m.kind === 'cleanup-result');
    assert.deepEqual(await session.closed, { code: 0, signal: null });
  assert.deepEqual(session.remaining(), [], 'no extra protocol messages after all expected replies and closure');
  });
}

test('real child rejects an unawaited RPC and exits with failure', { timeout: 10000 }, async (t) => {
  const session = await startChild(t, `
    export function provider() {
      return { async execute(invocation, context) {
        void context.invoke('test.rpc', { ordinal: 1 });
        return { unexpected: 'success' };
      } };
    }
  `, { resourceSampleIntervalMs: 10 });
  await session.next((m) => m.kind === 'initialized');
  session.send({ kind: 'execute' });
  await session.next((m) => m.kind === 'capability');
  assert.equal((await session.next((m) => m.kind === 'error')).error, 'TEST_PROVIDER_UNAWAITED_CAPABILITIES');
  assert.deepEqual(await session.closed, { code: 1, signal: null });
  assert.deepEqual(session.remaining(), [], 'failure must not also publish a successful result');
});

for (const observation of [undefined, null, {}, [], { resourceSampleIntervalMs: 0 },
  { resourceSampleIntervalMs: 1.5 }, { resourceSampleIntervalMs: '10' },
  { resourceSampleIntervalMs: 2147483648 }, { resourceSampleIntervalMs: 10, extra: 1 }]) {
  test(`real child rejects invalid observation before provider import: ${JSON.stringify(observation)}`,
    { timeout: 10000 }, async (t) => {
      const session = await startChild(t, "throw new Error('PROVIDER_SHOULD_NOT_LOAD');", observation);
      assert.equal((await session.next((m) => m.kind === 'error')).error, 'TEST_PROVIDER_OBSERVATION_INVALID');
      assert.deepEqual(await session.closed, { code: 1, signal: null });
      assert.deepEqual(session.remaining(), []);
      assert.deepEqual(await session.intervals(), [], 'invalid policy must not start a sampler');
    });
}

for (const resourceSampleIntervalMs of [10, 40]) {
  test(`real child uses authored sample interval ${resourceSampleIntervalMs}`, { timeout: 10000 }, async (t) => {
    const session = await startChild(t, `
      export function provider() {
        return { async execute() {
          await new Promise((resolve) => setTimeout(resolve, 240));
          return { completed: true };
        } };
      }
    `, { resourceSampleIntervalMs });
    await session.next((m) => m.kind === 'initialized');
    session.send({ kind: 'execute' });
    const result = await session.next((m) => m.kind === 'result');
    assert.deepEqual(result.value, { completed: true });
    assert.ok(result.resources.maximumMemoryBytes > 0);
    session.send({ kind: 'cleanup' });
    await session.next((m) => m.kind === 'cleanup-result');
    assert.deepEqual(await session.closed, { code: 0, signal: null });
    assert.deepEqual(session.remaining(), []);
    const intervals = await session.intervals();
    assert.deepEqual(intervals.filter((item) => item.kind === 'scheduled'),
      [{ kind: 'scheduled', delay: resourceSampleIntervalMs }]);
    const fired = intervals.filter((item) => item.kind === 'fired');
    assert.ok(fired.length > 0, 'the actual timer must invoke the real sampling callback');
    assert.ok(fired.every((item) => item.delay === resourceSampleIntervalMs));
  });
}

test('real child reuses an identical sampling policy and rejects a changed policy', { timeout: 10000 }, async (t) => {
  const session = await startChild(t, `
    export function provider() { return { async execute() { return {}; } }; }
  `, { resourceSampleIntervalMs: 40 });
  await session.next((m) => m.kind === 'initialized');
  session.initialize({ resourceSampleIntervalMs: 40 });
  await session.next((m) => m.kind === 'initialized');
  session.initialize({ resourceSampleIntervalMs: 10 });
  assert.equal((await session.next((m) => m.kind === 'error')).error, 'TEST_PROVIDER_OBSERVATION_CHANGED');
  assert.deepEqual(await session.closed, { code: 1, signal: null });
  assert.deepEqual(session.remaining(), []);
  const scheduled = (await session.intervals()).filter((item) => item.kind === 'scheduled');
  assert.deepEqual(scheduled, [{ kind: 'scheduled', delay: 40 }], 'identical policy must reuse the one sampler');
});
