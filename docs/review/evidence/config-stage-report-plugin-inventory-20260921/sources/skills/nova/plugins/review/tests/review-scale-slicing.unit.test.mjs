import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { buildReviewGraph } from '../src/review-graph.ts';
import { buildScalableReviewPlan } from '../src/review-scale-slicing.ts';
import { parseReviewSnapshotInventory } from '../src/review-snapshot-inventory.ts';

const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts'].map((file, index) => ({
  path: file, objectId: String(index + 1).repeat(40), mode: '100644', sizeBytes: 10,
}));
const snapshot = parseReviewSnapshotInventory({ head: 'a'.repeat(40), files,
  inventoryDigest: sha256Text(canonicalJson(files)) });
const relation = (from, to) => ({ type: 'imports', from, to, extractor: 'fixture', confidence: 'exact', provenance: from });
const relations = [relation('a.ts', 'b.ts'), relation('b.ts', 'a.ts'), relation('c.ts', 'a.ts'), relation('d.ts', 'c.ts')];
const graph = buildReviewGraph(snapshot, relations);
const tokens = new Map(files.map(({ path }) => [path, 10]));
const first = buildScalableReviewPlan(snapshot, graph, tokens, { maxFiles: 2, maxBytes: 25, maxTokens: 25 });
const second = buildScalableReviewPlan(snapshot, buildReviewGraph(snapshot, [...relations].reverse()), tokens,
  { maxFiles: 2, maxBytes: 25, maxTokens: 25 });
assert.deepEqual(first, second);
assert.equal(first.coverage.complete, true);
assert.equal(first.coverage.filesAssigned, 4);
assert.equal(first.slices.length, 2);
assert.equal(first.boundaries.length > 0, true);
const cycleSlice = first.slices.find(({ files: members }) => members.includes('a.ts'));
assert.deepEqual(cycleSlice.files, ['a.ts', 'b.ts']);

const overflowed = buildScalableReviewPlan(snapshot, graph, tokens, { maxFiles: 1, maxBytes: 25, maxTokens: 25 });
assert.equal(overflowed.coverage.complete, false);
assert.equal(overflowed.coverage.overflows.length, 1);
assert.deepEqual(overflowed.coverage.uncoveredFiles, ['a.ts', 'b.ts']);
assert.throws(() => buildScalableReviewPlan(snapshot, graph, new Map(),
  { maxFiles: 2, maxBytes: 25, maxTokens: 25 }), /token count is missing/u);

console.log(JSON.stringify({ ok: true, suite: 'review-scale-slicing' }));
