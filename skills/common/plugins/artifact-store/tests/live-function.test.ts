import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-artifacts-'));
const { activate } = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
const adapter = activate({
  registration: {},
  config: { artifactRoot: temporary, maxArtifactBytes: 1024 },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const signal = new AbortController().signal;
const fenced = { fence: { assertCurrent() {} } };
const write = (value) => adapter.invoke({
  ...fenced,
  request: {
    requestId: 'request:write',
    idempotencyKey: 'write',
    attempt,
    capability: 'artifacts.write',
    operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: 'report:lint/unsafe-looking' },
    payload: { namespace: 'kubeclaw.test', mediaType: 'application/json', value },
  },
  signal,
});

try {
  await adapter.ready();
  const first = await write({ z: 1, a: ['stable'] });
  const second = await write({ a: ['stable'], z: 1 });
  assert.equal(first.artifact.digest, second.artifact.digest);
  assert.equal(first.artifact.sizeBytes, second.artifact.sizeBytes);

  const read = await adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:read',
      idempotencyKey: 'read',
      attempt,
      capability: 'artifacts.read',
      operation: 'get_json',
      resource: { type: 'artifact.object', canonicalId: first.artifact.artifactId },
      payload: { digest: first.artifact.digest, namespace: 'kubeclaw.test' },
    },
    signal,
  });
  assert.deepEqual(read.value, { a: ['stable'], z: 1 });

  await assert.rejects(write({ value: 'x'.repeat(2048) }), /ARTIFACT_SIZE_EXCEEDED/);
  await assert.rejects(adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:bad',
      idempotencyKey: 'bad',
      attempt,
      capability: 'artifacts.read',
      operation: 'get_json',
      resource: { type: 'artifact.object', canonicalId: 'missing' },
      payload: { digest: `sha256:${'0'.repeat(64)}`, namespace: 'kubeclaw.test' },
    },
    signal,
  }), /ARTIFACT_NOT_FOUND/);

  const hash = first.artifact.digest.slice(7);
  const blob = path.join(temporary, 'blobs', 'sha256', hash.slice(0, 2), `${hash.slice(2)}.json`);
  fs.writeFileSync(blob, '{}');
  await assert.rejects(adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:corrupt',
      idempotencyKey: 'corrupt',
      attempt,
      capability: 'artifacts.read',
      operation: 'get_json',
      resource: { type: 'artifact.object', canonicalId: first.artifact.artifactId },
      payload: { digest: first.artifact.digest, namespace: 'kubeclaw.test' },
    },
    signal,
  }), /ARTIFACT_INTEGRITY_FAILED/);

  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:cancel',
      idempotencyKey: 'cancel',
      attempt,
      capability: 'artifacts.write',
      operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: 'cancelled' },
      payload: { namespace: 'kubeclaw.test', mediaType: 'application/json', value: {} },
    },
    signal: cancelled.signal,
  }), /ADAPTER_CANCELLED/);
} finally {
  await adapter.shutdown();
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.artifact-store', suite: 'live-function' }));
