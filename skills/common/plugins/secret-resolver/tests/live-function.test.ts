import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.KUBECLAW_TEST_SECRET = 'private-value';
process.env.KUBECLAW_EMPTY_SECRET = '';
const { activate } = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
const adapter = activate({
  registration: {},
  config: { environment: { 'runtime.token': 'KUBECLAW_TEST_SECRET', empty: 'KUBECLAW_EMPTY_SECRET' } },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
const fenced = { fence: { assertCurrent() {} } };
const invoke = (canonicalId, signal = new AbortController().signal) => adapter.invoke({
  ...fenced,
  request: {
    requestId: `request:${canonicalId}`,
    idempotencyKey: `secret:${canonicalId}`,
    attempt,
    capability: 'secrets.read',
    operation: 'resolve',
    resource: { type: 'secret.name', canonicalId },
    payload: {},
  },
  signal,
});
try {
  await adapter.ready();
  assert.deepEqual(await invoke('runtime.token'), { value: 'private-value' });
  await assert.rejects(invoke('unknown'), /SECRET_DENIED/);
  await assert.rejects(invoke('empty'), /SECRET_UNAVAILABLE/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(invoke('runtime.token', cancelled.signal), /ADAPTER_CANCELLED/);
} finally {
  delete process.env.KUBECLAW_TEST_SECRET;
  delete process.env.KUBECLAW_EMPTY_SECRET;
  await adapter.shutdown();
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.secret-resolver', suite: 'live-function' }));
