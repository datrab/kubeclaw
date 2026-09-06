import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectReceipts } from '../../../scripts/updates/release-images.mjs';

test('release selection rejects missing, duplicate and cross-commit build receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-receipts-'));
  const commit = 'a'.repeat(40);
  const receipt = { name: 'nova', commit, image: `ghcr.io/datrab/kubeclaw-nova@sha256:${'b'.repeat(64)}` };
  // These exercise manifest validation; they are never published as build evidence.
  try {
    assert.throws(() => collectReceipts(root, commit, ['nova']), /missing/);
    fs.writeFileSync(path.join(root, 'nova.json'), JSON.stringify(receipt));
    assert.equal(collectReceipts(root, commit, ['nova']).images.nova, receipt.image);
    assert.throws(() => collectReceipts(root, 'c'.repeat(40), ['nova']), /cross-commit/);
    fs.writeFileSync(path.join(root, 'duplicate.json'), JSON.stringify(receipt));
    assert.throws(() => collectReceipts(root, commit, ['nova']), /duplicate/);
    fs.unlinkSync(path.join(root, 'duplicate.json'));
    receipt.image = 'ghcr.io/datrab/kubeclaw-nova:latest';
    fs.writeFileSync(path.join(root, 'nova.json'), JSON.stringify(receipt));
    assert.throws(() => collectReceipts(root, commit, ['nova']), /Invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
