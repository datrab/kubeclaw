import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { test } from 'node:test';

// Actual child protocol tests. Full Runner tests separately prove the sandboxed path.
async function startChild(t, source) {
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
  child = spawn(process.execPath,
    [path.resolve('skills/buster/engine/test-gates/provider-child.mjs')],
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
  send({ kind: 'initialize', modulePath, exportName: 'provider', invocation: {}, workspaceRoot: directory });
  return { send, next, closed, remaining: () => structuredClone(messages) };
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
  `);
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
    `);
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
  `);
  await session.next((m) => m.kind === 'initialized');
  session.send({ kind: 'execute' });
  await session.next((m) => m.kind === 'capability');
  assert.equal((await session.next((m) => m.kind === 'error')).error, 'TEST_PROVIDER_UNAWAITED_CAPABILITIES');
  assert.deepEqual(await session.closed, { code: 1, signal: null });
  assert.deepEqual(session.remaining(), [], 'failure must not also publish a successful result');
});
