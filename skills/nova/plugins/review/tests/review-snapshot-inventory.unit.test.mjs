import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { parseReviewSnapshotInventory } from '../src/review-snapshot-inventory.ts';

const head = 'a'.repeat(40);
const files = [
  { path: 'src/main.ts', objectId: '1'.repeat(40), mode: '100644', sizeBytes: 10 },
  { path: 'tests/main.test.ts', objectId: '2'.repeat(40), mode: '100644', sizeBytes: 11 },
  { path: 'vendor/library.go', objectId: '3'.repeat(40), mode: '100644', sizeBytes: 12 },
  { path: 'assets/logo.png', objectId: '4'.repeat(40), mode: '100644', sizeBytes: 13 },
  { path: 'tests/fixtures/screenshot.png', objectId: 'a'.repeat(40), mode: '100644', sizeBytes: 19 },
  { path: 'linked.ts', objectId: '5'.repeat(40), mode: '120000', sizeBytes: 14 },
  { path: 'go.mod', objectId: '6'.repeat(40), mode: '100644', sizeBytes: 15 },
  { path: 'services/api/go.mod', objectId: '7'.repeat(40), mode: '100644', sizeBytes: 16 },
  { path: 'web/index.html', objectId: '8'.repeat(40), mode: '100644', sizeBytes: 17 },
  { path: '.dockerignore', objectId: '9'.repeat(40), mode: '100644', sizeBytes: 18 },
];
const proof = { head, files, inventoryDigest: sha256Text(canonicalJson(files)) };
const first = parseReviewSnapshotInventory(proof);
const reversed = [...files].reverse();
const second = parseReviewSnapshotInventory({ ...proof, files: reversed,
  inventoryDigest: sha256Text(canonicalJson(reversed)) });
assert.equal(first.digest, second.digest);
assert.deepEqual(first.files.map(({ path, role, included }) => ({ path, role, included })), [
  { path: '.dockerignore', role: 'configuration', included: true },
  { path: 'assets/logo.png', role: 'binary', included: false },
  { path: 'go.mod', role: 'configuration', included: true },
  { path: 'linked.ts', role: 'symlink', included: false },
  { path: 'services/api/go.mod', role: 'configuration', included: true },
  { path: 'src/main.ts', role: 'source', included: true },
  { path: 'tests/fixtures/screenshot.png', role: 'binary', included: false },
  { path: 'tests/main.test.ts', role: 'test', included: true },
  { path: 'vendor/library.go', role: 'vendor', included: false },
  { path: 'web/index.html', role: 'source', included: true },
]);
assert.throws(() => parseReviewSnapshotInventory({ ...proof, inventoryDigest: 'sha256:bad' }), /digest/u);
const duplicated = [...files, files[0]];
assert.throws(() => parseReviewSnapshotInventory({ ...proof, files: duplicated,
  inventoryDigest: sha256Text(canonicalJson(duplicated)) }), /duplicated/u);
const escaping = [{ ...files[0], path: '../escape' }];
assert.throws(() => parseReviewSnapshotInventory({ ...proof, files: escaping,
  inventoryDigest: sha256Text(canonicalJson(escaping)) }), /path/u);

console.log(JSON.stringify({ ok: true, suite: 'review-snapshot-inventory' }));
