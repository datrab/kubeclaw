import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve(new URL('../../..', import.meta.url).pathname);
const moduleUrl = pathToFileURL(path.join(
  repository,
  'skills/common/plugin-runtime/foundation/observability/durable-records.ts',
)).href;
const { FileDurableBlobStore, FileDurableRecordStore } = await import(moduleUrl);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-durable-cutover-'));
const limits = {
  maximumRecords: 1_000,
  maximumBytes: 4 * 1024 * 1024,
  maximumRecordBytes: 16 * 1024,
};

try {
  const first = new FileDurableRecordStore(root, limits);
  const second = new FileDurableRecordStore(root, limits);
  await Promise.all(Array.from({ length: 100 }, (_, index) => {
    const store = index % 2 === 0 ? first : second;
    return store.append('proof/concurrent', `record:${index}`, { index });
  }));
  const records = await new FileDurableRecordStore(root, limits).read('proof/concurrent');
  assert.equal(records.length, 100);
  assert.deepEqual(records.map((record) => record.sequence), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.deepEqual(new Set(records.map((record) => record.payload.index)).size, 100);

  const duplicate = await new FileDurableRecordStore(root, limits)
    .append('proof/concurrent', 'record:10', { index: 10 });
  assert.equal(duplicate.appended, false);
  await assert.rejects(
    new FileDurableRecordStore(root, limits).append('proof/concurrent', 'record:10', { index: 999 }),
    /DURABLE_RECORD_IDEMPOTENCY_CONFLICT/,
  );
  const pending = await first.append('proof/transitions', 'transition:one', { state: 'pending' });
  const completed = await second.transition(
    'proof/transitions',
    'transition:one',
    pending.record.payloadDigest,
    { state: 'completed' },
  );
  assert.deepEqual(completed.payload, { state: 'completed' });
  await assert.rejects(
    first.transition('proof/transitions', 'transition:one', pending.record.payloadDigest, { state: 'stale' }),
    /DURABLE_RECORD_TRANSITION_CONFLICT/,
  );

  const blobs = new FileDurableBlobStore(root, 1024);
  const concurrentBlobs = await Promise.all(Array.from({ length: 20 }, () =>
    new FileDurableBlobStore(root, 1024).put(Buffer.from('durable evidence'))));
  assert.equal(new Set(concurrentBlobs.map((blob) => blob.digest)).size, 1);
  const [stored] = concurrentBlobs;
  assert.equal((await new FileDurableBlobStore(root, 1024).get(stored.digest)).toString(), 'durable evidence');
  const hash = stored.digest.slice('sha256:'.length);
  fs.writeFileSync(path.join(root, 'blobs', 'sha256', hash.slice(0, 2), hash.slice(2)), 'changed');
  await assert.rejects(new FileDurableBlobStore(root, 1024).get(stored.digest), /DURABLE_BLOB_INTEGRITY_FAILED/);

  const legacyChecks = [
    ['skills/common/plugins/artifact-store/src/adapter.ts', /catalog\.jsonl/],
    ['skills/common/plugins/state-store/src/adapter.ts', /\.jsonl/],
    ['skills/common/plugins/wait-store/src/adapter.ts', /journalPath|\.jsonl/],
    ['skills/common/plugins/telemetry-store/src/adapter.ts', /journalPath|\.jsonl/],
  ];
  for (const [file, pattern] of legacyChecks) {
    assert.doesNotMatch(fs.readFileSync(path.join(repository, file), 'utf8'), pattern, `${file} retains a legacy local path`);
  }
  for (const file of [
    'skills/common/plugins/operator-messaging/src/adapter.ts',
    'skills/common/plugins/transport-publisher/src/adapter.ts',
  ]) {
    const source = fs.readFileSync(path.join(repository, file), 'utf8');
    assert.match(source, /notification-delivery-request|transport-publication-request/);
    assert.match(source, /terminalRecordKey/);
    assert.match(source, /records\.transition/);
    assert.match(source, /delivery-reservation|publication-reservation/);
    assert.match(source, /delivery-receipt|publication-receipt/);
    assert.match(source, /delivery-failure|publication-failure/);
    assert.match(source, /idempotencyKey: request\.idempotencyKey/);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  suite: 'pipeline-observability-legacy-cutover',
  concurrentRecords: 100,
  migratedPaths: ['artifact-store', 'state-store', 'wait-store', 'telemetry-store', 'notification-delivery'],
}));
