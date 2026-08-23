import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-artifacts-'));
const { activate } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
const { FileDurableRecordStore } = await import('@kubeclaw/plugin-foundation/observability/durable-records');
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
  const pendingMetadata = new FileDurableRecordStore(temporary, {
    maximumRecords: 100_000,
    maximumBytes: 256 * 1024 * 1024,
    maximumRecordBytes: 64 * 1024,
  });
  await pendingMetadata.append('artifacts/kubeclaw.test', 'pending-without-blob', {
    ...first.artifact,
    digest: `sha256:${'0'.repeat(64)}`,
    sizeBytes: 1,
  });
  const latest = await adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:latest',
      idempotencyKey: 'latest',
      attempt,
      capability: 'artifacts.read',
      operation: 'get_latest_json',
      resource: { type: 'artifact.object', canonicalId: first.artifact.artifactId },
      payload: { namespace: 'kubeclaw.test' },
    },
    signal,
  });
  assert.deepEqual(latest.value, { a: ['stable'], z: 1 });
  assert.equal(latest.artifact.digest, first.artifact.digest);
  const foreignAttempt = {
    ...attempt,
    runId: 'run:foreign',
    attemptId: 'attempt:foreign',
  };
  await adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:foreign-write',
      idempotencyKey: 'foreign-write',
      attempt: foreignAttempt,
      capability: 'artifacts.write',
      operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: first.artifact.artifactId },
      payload: {
        namespace: 'kubeclaw.test',
        mediaType: 'application/json',
        value: { foreign: true },
      },
    },
    signal,
  });
  const runScopedLatest = await adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:run-scoped-latest',
      idempotencyKey: 'run-scoped-latest',
      attempt,
      capability: 'artifacts.read',
      operation: 'get_latest_json',
      resource: { type: 'artifact.object', canonicalId: first.artifact.artifactId },
      payload: { namespace: 'kubeclaw.test' },
    },
    signal,
  });
  assert.deepEqual(runScopedLatest.value, { a: ['stable'], z: 1 });

  await assert.rejects(write({ value: 'x'.repeat(2048) }), /ARTIFACT_SIZE_EXCEEDED/);

  const boundedRoot = path.join(temporary, 'bounded');
  const bounded = activate({
    registration: {},
    config: {
      artifactRoot: boundedRoot,
      maxArtifactBytes: 1024,
      maximumRecords: 1,
      maximumStoreBytes: 64 * 1024,
    },
    async emit() {},
    async invoke() { throw new Error('unexpected dependency'); },
  });
  const boundedWrite = (idempotencyKey, value) => bounded.invoke({
    ...fenced,
    request: {
      requestId: `request:${idempotencyKey}`,
      idempotencyKey,
      attempt,
      capability: 'artifacts.write',
      operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: `artifact:${idempotencyKey}` },
      payload: { namespace: 'bounded.test', mediaType: 'application/json', value },
    },
    signal,
  });
  await boundedWrite('bounded-first', { value: 'first' });
  await assert.rejects(boundedWrite('bounded-second', { value: 'second' }), /DURABLE_RECORD_STORE_FULL/);
  const rejectedBytes = Buffer.from(JSON.stringify({ value: 'second' }));
  const rejectedHash = crypto.createHash('sha256').update(rejectedBytes).digest('hex');
  assert.equal(
    fs.existsSync(path.join(boundedRoot, 'blobs', 'sha256', rejectedHash.slice(0, 2), rejectedHash.slice(2))),
    false,
    'rejected metadata admission must not leave an unreferenced blob',
  );
  await bounded.shutdown();

  const maximumNamespace = 'n'.repeat(246);
  const maximumNamespaceResult = await adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:maximum-namespace',
      idempotencyKey: 'maximum-namespace',
      attempt,
      capability: 'artifacts.write',
      operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: 'artifact:maximum-namespace' },
      payload: { namespace: maximumNamespace, mediaType: 'application/json', value: { valid: true } },
    },
    signal,
  });
  assert.equal(maximumNamespaceResult.artifact.namespace, maximumNamespace);
  await assert.rejects(adapter.invoke({
    ...fenced,
    request: {
      requestId: 'request:oversize-namespace',
      idempotencyKey: 'oversize-namespace',
      attempt,
      capability: 'artifacts.write',
      operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: 'artifact:oversize-namespace' },
      payload: { namespace: 'n'.repeat(247), mediaType: 'application/json', value: { valid: false } },
    },
    signal,
  }), /ARTIFACT_NAMESPACE_INVALID/);

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
  const blob = path.join(temporary, 'blobs', 'sha256', hash.slice(0, 2), hash.slice(2));
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
