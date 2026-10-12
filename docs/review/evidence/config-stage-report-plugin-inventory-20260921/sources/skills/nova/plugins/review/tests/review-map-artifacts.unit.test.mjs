import assert from 'node:assert/strict';

import { buildReviewMapArtifacts, validateReviewMapArtifacts } from '../src/review-map-artifacts.ts';
import { parseReviewSnapshotInventory } from '../src/review-snapshot-inventory.ts';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

const files = [
  { path: 'src/b.ts', objectId: '2'.repeat(40), mode: '100644', sizeBytes: 20 },
  { path: 'src/a.ts', objectId: '1'.repeat(40), mode: '100644', sizeBytes: 10 },
  { path: 'logo.png', objectId: '3'.repeat(40), mode: '100644', sizeBytes: 30 },
];
const snapshot = parseReviewSnapshotInventory({
  head: 'a'.repeat(40), files, inventoryDigest: sha256Text(canonicalJson(files)),
});
const relations = [
  { type: 'imports', from: 'src/b.ts', to: 'src/a.ts', extractor: 'typescript', confidence: 'exact', provenance: 'src/b.ts:1' },
];
const first = buildReviewMapArtifacts(snapshot, { relations });
const second = buildReviewMapArtifacts(snapshot, { relations: [...relations].reverse() });
assert.equal(first.manifest.digest, second.manifest.digest);
assert.equal(first.manifest.streams.files.count, 3);
assert.equal(first.manifest.streams.exclusions.count, 1);
assert.equal(first.manifest.streams.relations.count, 1);
assert.doesNotThrow(() => validateReviewMapArtifacts(first));
assert.throws(() => validateReviewMapArtifacts({ ...first, filesJsonl: `${first.filesJsonl}{}\n` }), /digest/u);
assert.throws(() => validateReviewMapArtifacts({ ...first,
  filesJsonl: first.filesJsonl.trimEnd() }), /digest|newline/u);

console.log(JSON.stringify({ ok: true, suite: 'review-map-artifacts' }));
