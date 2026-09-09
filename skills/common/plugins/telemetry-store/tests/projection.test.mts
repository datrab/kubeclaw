import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activate } from '../src/adapter.ts';
import { TELEMETRY_JSON_MAX_DEPTH, TELEMETRY_JSON_MAX_NODES } from '../src/projection.ts';
import { FileResourceLockManager } from '../../../../nova/core/effects/locks.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-projection-'));
const root = path.join(temporary, 'telemetry');
const locks = new FileResourceLockManager(path.join(temporary, 'locks'));
const resource = { type: 'telemetry.event', canonicalId: 'run.diagnostic' };
const attempt = { runId: 'run:projection', stageId: 'observer:telemetry', attemptId: 'attempt:projection', attemptNumber: 1 };
const lock = locks.acquire(resource, attempt.attemptId, 60000);
// Direct adapter boundary uses the production file-backed fence and durable store.
// No dependency callbacks or substitute adapter runtime are involved.
const adapter = activate({ config: { root, maxRecordBytes: 2 * 1024 * 1024 } } as any);
const invoke = (key: string, payload: any) => adapter.invoke({
  request: { idempotencyKey: key, attempt, capability: 'telemetry.emit', operation: 'append', resource, payload },
  fence: { token: lock.fencingToken, assertCurrent: () => locks.assertCurrent(lock.lockId, attempt.attemptId) },
  signal: new AbortController().signal,
} as any);
const stored = () => JSON.parse(fs.readFileSync(path.join(root, 'records/store.json'), 'utf8')).records;
try {
  await adapter.ready();
  const originalLog = path.join(temporary, 'canonical-diagnostic.log');
  const diagnostic = 'HTTP 503 from registry; retry after 7 seconds.\n'.repeat(3000);
  fs.writeFileSync(originalLog, diagnostic, { mode: 0o600 });
  const originalBytes = fs.readFileSync(originalLog);
  const ref = { storageUrl: new URL(`file://${originalLog}`).href,
    contentDigest: `sha256:${crypto.createHash('sha256').update(originalBytes).digest('hex')}`, sizeBytes: originalBytes.length };
  await invoke('fields', { api_key: 'platform-a', apiKey: 'platform-b', API_KEY: 'platform-c', credential: 'platform-d',
    nested: [{ apiKey: 'platform-e', private_key: 'platform-f', clientSecret: 'platform-g', email: 'real-person@example.invalid' }],
    password: 'platform-h', access_token: 'platform-i', demo: { provenance: 'pipeline-generated', password: 'unproven-demo' },
    key: 'stage-key', eventId: 'event:projection', operation: 'registry.verify', status: 503, message: diagnostic,
    sourceArtifact: ref, display: { text: 'HTTP 503…', truncated: true, sourceArtifact: ref } });
  const first = stored()[0].payload;
  for (const key of ['api_key', 'apiKey', 'API_KEY', 'credential', 'password', 'access_token']) assert.equal(first[key], '[REDACTED]');
  assert.deepEqual(first.nested, [{ apiKey: '[REDACTED]', private_key: '[REDACTED]', clientSecret: '[REDACTED]', email: '[REDACTED]' }]);
  assert.equal(first.demo.password, '[REDACTED]', 'self-asserted provenance does not prove demo ownership');
  assert.equal(first.key, 'stage-key'); assert.equal(first.status, 503); assert.equal(first.message, diagnostic);
  assert.deepEqual(first.sourceArtifact, ref); assert.deepEqual(first.display, { text: 'HTTP 503…', truncated: true, sourceArtifact: ref });
  assert.deepEqual(fs.readFileSync(originalLog), originalBytes, 'sink does not modify the producer-owned canonical source log');
  assert.equal(fs.statSync(path.join(root, 'records/store.json')).mode & 0o777, 0o600);

  const shared = { harmless: 'shared' };
  await invoke('shared', { left: shared, right: shared });
  assert.deepEqual(stored()[1].payload, { left: shared, right: shared });
  const cycle: any = {}; cycle.self = cycle;
  const deep: any = {}; let cursor = deep;
  for (let index = 0; index < TELEMETRY_JSON_MAX_DEPTH + 1; index++) { cursor.child = {}; cursor = cursor.child; }
  let getterCalls = 0;
  const getter = Object.defineProperty({}, 'apiKey', { enumerable: true, get() { getterCalls++; return 'never'; } });
  const invalid: Array<[string, any, RegExp]> = [
    ['cycle', cycle, /TELEMETRY_JSON_CYCLE/u], ['deep', deep, /TELEMETRY_JSON_DEPTH_LIMIT/u],
    ['getter', getter, /TELEMETRY_JSON_PROPERTY_INVALID/u],
    ['nodes', { values: Array.from({ length: TELEMETRY_JSON_MAX_NODES }, () => null) }, /TELEMETRY_JSON_NODE_LIMIT/u],
    ['proxy', new Proxy({}, {}), /TELEMETRY_JSON_PROXY_INVALID/u],
    ['secret-cycle', { password: cycle }, /TELEMETRY_JSON_CYCLE/u],
    ['large', { message: 'x'.repeat(2 * 1024 * 1024) }, /TELEMETRY_RECORD_SIZE_EXCEEDED/u],
  ];
  for (const [key, payload, expected] of invalid) {
    await assert.rejects(invoke(key, payload), (error: any) => { assert(!(error instanceof RangeError)); assert.match(error.message, expected); return true; });
    assert.equal(stored().length, 2, 'rejected graph must not partially append');
  }
  assert.equal(getterCalls, 0);
  const boundary: any = {}; let boundaryCursor = boundary;
  for (let index = 0; index < TELEMETRY_JSON_MAX_DEPTH; index++) { boundaryCursor.child = {}; boundaryCursor = boundaryCursor.child; }
  await invoke('depth-boundary', boundary);
  assert.deepEqual(stored()[2].payload, boundary);
  await invoke('node-boundary', { values: Array.from({ length: TELEMETRY_JSON_MAX_NODES - 2 }, () => null) });
  assert.equal(stored()[3].payload.values.length, TELEMETRY_JSON_MAX_NODES - 2);
  // Exactly the byte limit remains accepted; oversize is rejected, never truncated.
  const exactRoot = path.join(temporary, 'exact');
  const exact = activate({ config: { root: exactRoot, maxRecordBytes: 1024 } } as any);
  try {
    await exact.ready();
    const exactPayload = { message: 'x'.repeat(1010) };
    assert.equal(Buffer.byteLength(JSON.stringify(exactPayload)), 1024);
    await exact.invoke({ request: { idempotencyKey: 'exact', attempt, capability: 'telemetry.emit', operation: 'append', resource, payload: exactPayload },
      fence: { token: lock.fencingToken, assertCurrent: () => locks.assertCurrent(lock.lockId, attempt.attemptId) }, signal: new AbortController().signal } as any);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(exactRoot, 'records/store.json'), 'utf8')).records[0].payload, exactPayload);
  } finally { await exact.shutdown(new AbortController().signal); }
} finally {
  await adapter.shutdown(new AbortController().signal);
  locks.release(lock.lockId, attempt.attemptId);
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, suite: 'telemetry-store-projection', persistence: 'real-file-store', fence: 'file-resource-lock' }));
