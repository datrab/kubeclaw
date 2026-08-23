import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '@kubeclaw/plugin-sdk';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-wait-store-'));
const { activate } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
const adapter = activate({
  registration: {},
  config: { root, maxEntryBytes: 2048 },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
const signal = new AbortController().signal;
const payload = {
  kind: 'signal',
  signalType: 'approval.decided',
  authorizedIssuer: { type: 'operator', id: 'operator:test' },
  expiresAt: '2030-01-01T00:00:00.000Z',
  request: { question: 'approve?' },
};
const fenced = { fence: { assertCurrent() {} } };
const invoke = (operation, idempotencyKey, value = payload) => adapter.invoke({
  ...fenced,
  request: {
    requestId: `request:${idempotencyKey}`,
    idempotencyKey,
    attempt,
    capability: 'signal.wait',
    operation,
    resource: { type: 'wait.journal', canonicalId: 'pipeline' },
    payload: value,
  },
  signal,
});

try {
  await adapter.ready();
  const first = await invoke('create', 'wait:one');
  assert.equal(first.created, true);
  assert.match(first.wait.waitId, /^wait:/);
  const duplicate = await invoke('create', 'wait:one');
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.wait.waitId, first.wait.waitId);
  await assert.rejects(invoke('create', 'wait:one', { ...payload, signalType: 'approval.other' }), /WAIT_IDEMPOTENCY_CONFLICT/);
  const read = await invoke('read', 'read:one', {});
  assert.equal(read.waits.length, 1);
  const parallel = await Promise.all(Array.from({ length: 10 }, () => invoke('create', 'wait:parallel')));
  assert.equal(parallel.filter((result) => result.created).length, 1);
  assert.equal(new Set(parallel.map((result) => result.wait.waitId)).size, 1);
  const maximumKey = `w${'a'.repeat(255)}`;
  assert.equal((await invoke('create', maximumKey)).created, true);
  assert.equal((await invoke('read', 'read:maximum-key', {})).waits.length, 3);
  const storePath = path.join(root, 'records', 'store.json');
  assert.equal(fs.statSync(storePath).mode & 0o777, 0o600);
  await assert.rejects(invoke('create', 'bad-expiry', { ...payload, expiresAt: 'not-a-date' }), /WAIT_EXPIRY_INVALID/);
  await assert.rejects(invoke('create', 'non-rfc-expiry', { ...payload, expiresAt: '1' }), /WAIT_EXPIRY_INVALID/);
  await assert.rejects(invoke('create', 'impossible-expiry', {
    ...payload, expiresAt: '2026-02-30T00:00:00Z',
  }), /WAIT_EXPIRY_INVALID/);
  await assert.rejects(invoke('create', 'invalid-hour', {
    ...payload, expiresAt: '2026-01-01T24:00:00Z',
  }), /WAIT_EXPIRY_INVALID/);
  await assert.rejects(invoke('create', 'bad-kind', { ...payload, kind: 'human' }), /WAIT_REQUEST_INVALID/);
  await assert.rejects(invoke('create', 'bad-signal', { ...payload, signalType: 'approval' }), /WAIT_REQUEST_INVALID/);
  await assert.rejects(invoke('create', 'bad-issuer-type', {
    ...payload, authorizedIssuer: { type: 'human', id: 'operator:test' },
  }), /WAIT_REQUEST_INVALID/);
  await assert.rejects(invoke('create', 'bad-issuer-shape', {
    ...payload, authorizedIssuer: { type: 'operator', id: 'operator:test', token: 'secret' },
  }), /WAIT_REQUEST_INVALID/);
  await assert.rejects(invoke('create', 'unknown-field', { ...payload, unexpected: true }), /WAIT_REQUEST_INVALID/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(adapter.invoke({
    ...fenced,
    request: {
      requestId: 'cancel',
      idempotencyKey: 'cancel',
      attempt,
      capability: 'signal.wait',
      operation: 'read',
      resource: { type: 'wait.journal', canonicalId: 'pipeline' },
      payload: {},
    },
    signal: cancelled.signal,
  }), /ADAPTER_CANCELLED/);
  const state = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  state.records[0].payload.wait = {
      schemaVersion: 'wait-request.v2',
      waitId: 'wait:malformed',
      kind: 'human',
      signalType: 'approval.resolved',
      authorizedIssuer: { type: 'operator', id: 'operator:test' },
      expiresAt: null,
  };
  state.records[0].payloadDigest = `sha256:${crypto.createHash('sha256').update(canonicalJson(state.records[0].payload)).digest('hex')}`;
  fs.writeFileSync(storePath, JSON.stringify(state));
  await assert.rejects(invoke('read', 'read:malformed', {}), /WAIT_RECORD_INVALID/);
} finally {
  await adapter.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.wait-store', suite: 'live-function' }));
