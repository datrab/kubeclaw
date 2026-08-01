import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-telemetry-store-'));
const journalPath = path.join(root, 'telemetry.jsonl');
const { activate } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
const adapter = activate({
  registration: {},
  config: { journalPath, maxRecordBytes: 1024 },
  async emit() {},
  async invoke() { throw new Error('unexpected dependency'); },
});
const attempt = { runId: 'run:test', stageId: 'observer:test', attemptId: 'attempt:test', attemptNumber: 1 };
const fenced = { fence: { assertCurrent() {} } };
const invoke = (idempotencyKey, payload, signal = new AbortController().signal) => adapter.invoke({
  ...fenced,
  request: {
    requestId: `request:${idempotencyKey}`,
    idempotencyKey,
    attempt,
    capability: 'telemetry.emit',
    operation: 'append',
    resource: { type: 'telemetry.event', canonicalId: 'run.succeeded' },
    payload,
  },
  signal,
});

try {
  await adapter.ready();
  assert.deepEqual(await invoke('one', { eventId: 'event:1', token: 'private', nested: { password: 'hidden' } }), {
    accepted: true,
    sequence: 1,
  });
  assert.deepEqual(await invoke('one', { eventId: 'event:1' }), { accepted: false, sequence: 1 });
  assert.deepEqual(await invoke('two', { eventId: 'event:2' }), { accepted: true, sequence: 2 });
  const records = fs.readFileSync(journalPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.length, 2);
  assert.equal(records[0].payload.token, '[REDACTED]');
  assert.equal(records[0].payload.nested.password, '[REDACTED]');
  assert.equal(fs.statSync(journalPath).mode & 0o777, 0o600);
  await assert.rejects(invoke('large', { value: 'x'.repeat(2000) }), /TELEMETRY_RECORD_SIZE_EXCEEDED/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(invoke('cancel', {}, cancelled.signal), /ADAPTER_CANCELLED/);
} finally {
  await adapter.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.telemetry-store', suite: 'live-function' }));
