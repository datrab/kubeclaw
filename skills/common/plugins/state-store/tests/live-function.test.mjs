import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-state-store-'));
const { activate } = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
const adapter = activate({
  registration: {},
  config: { root, maxEntryBytes: 512 },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
const signal = new AbortController().signal;
const request = (capability, operation, idempotencyKey, payload = {}) => adapter.invoke({
  request: {
    requestId: `request:${idempotencyKey}`,
    idempotencyKey,
    attempt,
    capability,
    operation,
    resource: { type: 'state.namespace', canonicalId: 'plugin.test/run' },
    payload,
  },
  signal,
});

try {
  await adapter.ready();
  const first = await request('state.append', 'append', 'append:one', { status: 'started' });
  assert.equal(first.appended, true);
  assert.equal(first.entry.sequence, 1);
  const duplicate = await request('state.append', 'append', 'append:one', { status: 'started' });
  assert.equal(duplicate.appended, false);
  await assert.rejects(
    request('state.append', 'append', 'append:one', { status: 'different' }),
    /STATE_IDEMPOTENCY_CONFLICT/,
  );
  const second = await request('state.append', 'append', 'append:two', { status: 'done' });
  assert.equal(second.entry.sequence, 2);
  const read = await request('state.read', 'read', 'read:one');
  assert.deepEqual(read.entries.map((entry) => entry.value), [{ status: 'started' }, { status: 'done' }]);
  assert.equal(fs.statSync(path.join(root, 'plugin.test__run.jsonl')).mode & 0o777, 0o600);
  await assert.rejects(
    adapter.invoke({
      request: {
        requestId: 'bad',
        idempotencyKey: 'bad',
        attempt,
        capability: 'state.read',
        operation: 'read',
        resource: { type: 'state.namespace', canonicalId: '../escape' },
        payload: {},
      },
      signal,
    }),
    /STATE_NAMESPACE_INVALID/,
  );
  await assert.rejects(request('state.append', 'append', 'large', { value: 'x'.repeat(600) }), /STATE_ENTRY_SIZE_EXCEEDED/);
  await assert.rejects(request('network.http', 'read', 'wrong'), /STATE_OPERATION_UNSUPPORTED/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(adapter.invoke({
    request: {
      requestId: 'cancel',
      idempotencyKey: 'cancel',
      attempt,
      capability: 'state.read',
      operation: 'read',
      resource: { type: 'state.namespace', canonicalId: 'plugin.test/run' },
      payload: {},
    },
    signal: cancelled.signal,
  }), /ADAPTER_CANCELLED/);
} finally {
  await adapter.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.state-store', suite: 'live-function' }));
