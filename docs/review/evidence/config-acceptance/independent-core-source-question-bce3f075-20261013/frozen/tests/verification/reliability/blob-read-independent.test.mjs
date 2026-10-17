import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { FileDurableBlobStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';

const digest = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
async function exercise() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-blob-read-'));
  try {
    const bytes = Buffer.alloc(33, 97), hash = digest(bytes);
    const file = path.join(root, 'blobs/sha256', hash.slice(7, 9), hash.slice(9));
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
    const store = new FileDurableBlobStore(root, 16);
    for (let index = 0; index < 160; index++) await assert.rejects(store.get(hash), /DURABLE_BLOB_SIZE_EXCEEDED/u);
    const valid = Buffer.alloc(16, 1), ref = await store.put(valid);
    for (let index = 0; index < 160; index++) assert.deepEqual(await store.get(ref.digest), valid);
    console.log(JSON.stringify({ maximumBytes: 16, storedBytes: 33, oversizedReadsRejected: 160,
      exactBoundaryReadsSucceeded: 160, descriptorSoftLimit: 64 }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

if (process.argv[2] === '--descriptor-child') await exercise();
else test('independent real low-descriptor process rejects oversized reads repeatedly and still reads exact-boundary bytes', () => {
  const result = spawnSync('bash', ['-c', 'ulimit -n 64 && exec "$@"', 'blob-reader-review',
    process.execPath, fileURLToPath(import.meta.url), '--descriptor-child'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.signal, null);
  const evidence = JSON.parse(result.stdout.trim());
  assert.equal(evidence.oversizedReadsRejected, 160);
  assert.equal(evidence.exactBoundaryReadsSucceeded, 160);
  console.log(result.stdout.trim());
});
