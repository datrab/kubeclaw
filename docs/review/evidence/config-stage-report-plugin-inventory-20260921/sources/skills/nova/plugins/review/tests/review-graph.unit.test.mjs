import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { buildReviewGraph } from '../src/review-graph.ts';
import { parseReviewSnapshotInventory } from '../src/review-snapshot-inventory.ts';

const files = ['a.ts', 'b.ts', 'c.ts'].map((file, index) => ({
  path: file, objectId: String(index + 1).repeat(40), mode: '100644', sizeBytes: 10 + index,
})).concat({ path: 'package-lock.json', objectId: '4'.repeat(40), mode: '100644', sizeBytes: 20 });
const snapshot = parseReviewSnapshotInventory({
  head: 'a'.repeat(40), files, inventoryDigest: sha256Text(canonicalJson(files)),
});
const relation = (type, from, to) => ({ type, from, to, extractor: 'fixture', confidence: 'exact', provenance: from });
const relations = [
  relation('imports', 'a.ts', 'b.ts'), relation('imports', 'b.ts', 'a.ts'),
  relation('imports', 'c.ts', 'a.ts'), relation('reads_secret', 'c.ts', 'resource:secrets'),
  relation('builds', 'a.ts', 'package-lock.json'),
  relation('imports', 'missing.ts', 'a.ts'),
];
const first = buildReviewGraph(snapshot, relations);
const second = buildReviewGraph(snapshot, [...relations].reverse());
assert.equal(first.digest, second.digest);
const cycle = first.components.find(({ filePaths }) => filePaths.includes('a.ts'));
assert.deepEqual(cycle.filePaths, ['a.ts', 'b.ts']);
assert.equal(first.components.find(({ filePaths }) => filePaths.includes('c.ts')).riskTags.includes('reads_secret'), true);
assert.equal(first.componentEdges.some(({ fromComponent, toComponent }) => (
  fromComponent !== toComponent && fromComponent === first.components.find(({ filePaths }) => filePaths.includes('c.ts')).id
)), true);
assert.equal(first.unresolvedRelations.length, 1);
assert.equal(first.unresolvedRelations[0].from, 'missing.ts');
assert.deepEqual(first.nodes.find(({ id }) => id === 'package-lock.json'), {
  id: 'package-lock.json', kind: 'resource', sizeBytes: 0,
});

const deepFiles = Array.from({ length: 20_000 }, (_, index) => ({
  path: `deep/${String(index).padStart(5, '0')}.ts`, objectId: (index % 10).toString().repeat(40),
  mode: '100644', sizeBytes: 1,
}));
const deepSnapshot = parseReviewSnapshotInventory({ head: 'b'.repeat(40), files: deepFiles,
  inventoryDigest: sha256Text(canonicalJson(deepFiles)) });
const deepRelations = deepFiles.slice(1).map((file, index) => relation('imports', file.path, deepFiles[index].path));
assert.equal(buildReviewGraph(deepSnapshot, deepRelations).components.length, deepFiles.length);

console.log(JSON.stringify({ ok: true, suite: 'review-graph' }));
