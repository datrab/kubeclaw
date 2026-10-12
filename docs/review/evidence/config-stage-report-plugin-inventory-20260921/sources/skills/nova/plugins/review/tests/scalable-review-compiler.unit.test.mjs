import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { compileScalableReview } from '../src/scalable-review-compiler.ts';
import { parseReviewSnapshotInventory } from '../src/review-snapshot-inventory.ts';
import { resolveRepositoryReviewProfile } from '../src/repository-review-profile.ts';

function fixture(documents, head = 'a'.repeat(40)) {
  const files = documents.map((document) => ({ path: document.path,
    objectId: createHash('sha1').update(`blob ${Buffer.byteLength(document.content)}\0`).update(document.content).digest('hex'), mode: '100644',
    sizeBytes: Buffer.byteLength(document.content) }));
  const snapshot = parseReviewSnapshotInventory({ head, files, inventoryDigest: sha256Text(canonicalJson(files)) });
  const sourceDigests = new Map(documents.map(({ path, content }) => [path, sha256Text(content)]));
  return { snapshot, documents, sourceDigests, budget: { maxFiles: 20, maxBytes: 2_000_000, maxTokens: 500_000 } };
}

const documents = [
  { path: 'src/a.ts', content: 'export const a = 1;\n' },
  { path: 'src/b.ts', content: "import { a } from './a.js';\nvoid a;\n" },
];
const first = compileScalableReview(fixture(documents));
const secondValues = fixture([...documents].reverse());
const second = compileScalableReview(secondValues);
assert.equal(first.digest, second.digest);
assert.equal(first.plan.coverage.complete, true);
assert.equal(first.artifacts.manifest.streams.files.count, 2);
assert.throws(() => compileScalableReview({ ...fixture(documents), documents: [
  { path: 'src/a.ts', content: 'export const a = 2;\n' }, documents[1],
] }), /does not match frozen source proof/u);
const empty = fixture([{ path: 'src/empty.ts', content: '' }]);
assert.equal(compileScalableReview(empty).plan.coverage.complete, true);
assert.throws(() => compileScalableReview(fixture([
  { path: 'src/unresolved.ts', content: "import './missing.js';\n" },
])), /unresolvedRelations/u);
const scoped = fixture([{ path: 'skills/nova/plugins/review/src/scoped.ts',
  content: "import '../../../../outside.js';\n" }]);
const scopedProfile = resolveRepositoryReviewProfile({ grade: 'standard',
  scope: { kind: 'plugin', names: ['review'] }, overrides: { enabledLenses: [], maxPrimaryJobs: 10 } });
const scopedCompilation = compileScalableReview({ ...scoped, profile: scopedProfile });
assert.equal(scopedCompilation.plan.coverage.complete, true);
assert.equal(scopedCompilation.graph.relations[0].to.startsWith('resource:external-file:'), true);
assert.equal(scopedCompilation.accounting.serializedPromptBytes > 0, true);
assert.equal(scopedCompilation.accounting.reservedPromptBytes > scopedCompilation.accounting.serializedPromptBytes, true);
assert.equal(scopedCompilation.accounting.estimatedInputTokens
  > scopedCompilation.accounting.serializedPayloadTokens, true);
assert.equal(scopedCompilation.accounting.estimatedInputTokens > 0, true);
assert.equal(scopedCompilation.accounting.sourceAssignments >= scopedCompilation.accounting.uniqueSourcePayloads, true);
assert.equal(scopedCompilation.accounting.sourcePayloadTokens
  >= scopedCompilation.accounting.uniqueSourcePayloadTokens, true);
assert.equal(scopedCompilation.accounting.relationAssignments
  >= scopedCompilation.accounting.uniqueRelationAssignments, true);
assert.equal(scopedCompilation.accounting.relationAssignments,
  scopedCompilation.accounting.directRelationAssignments
    + scopedCompilation.accounting.compactTopologyRelationAssignments);
assert.equal(scopedCompilation.accounting.repeatedRelationAssignments,
  scopedCompilation.accounting.relationAssignments - scopedCompilation.accounting.uniqueRelationAssignments);
assert.equal(scopedCompilation.accounting.maximumJobTokens >= scopedCompilation.accounting.medianJobTokens, true);
assert.equal(scopedCompilation.accounting.p95JobTokens >= scopedCompilation.accounting.medianJobTokens, true);
const siblingScope = fixture([{ path: 'src/a.ts', content: "import '../src2/b.js';\n" }]);
const siblingCompilation = compileScalableReview({ ...siblingScope,
  profile: resolveRepositoryReviewProfile({ grade: 'standard', scope: { kind: 'path', prefixes: ['src'] },
    overrides: { enabledLenses: [], maxPrimaryJobs: 10 } }) });
assert.equal(siblingCompilation.graph.relations[0].to.startsWith('resource:external-file:'), true);
assert.throws(() => compileScalableReview({ ...scoped,
  profile: resolveRepositoryReviewProfile({ grade: 'standard', scope: { kind: 'plugin', names: ['review'] },
    overrides: { enabledLenses: [], maxPrimaryJobs: 10, maxInitialInputTokens: 1 } }) }), /input token budget/u);
for (const [overrides, expected] of [
  [{ enabledLenses: [], maxPrimaryJobs: 1 }, /primary job budget/u],
  [{ enabledLenses: [], maxPrimaryJobs: 10, maxEstimatedCostUsd: 0.000_001 }, /cost budget/u],
  [{ enabledLenses: [], maxPrimaryJobs: 10, maxWallTimeSeconds: 1 }, /wall time budget/u],
]) assert.throws(() => compileScalableReview({ ...scoped,
  profile: resolveRepositoryReviewProfile({ grade: 'standard', scope: { kind: 'plugin', names: ['review'] },
    overrides }) }), expected);

const fileCount = 2_000, linesPerFile = 500;
const largeDocuments = Array.from({ length: fileCount }, (_, index) => {
  const name = `large/file-${String(index).padStart(5, '0')}.ts`;
  const previous = index === 0 ? '' : `import './file-${String(index - 1).padStart(5, '0')}.js';\n`;
  return { path: name, content: `${previous}${'export const value = 1;\n'.repeat(linesPerFile - (previous ? 1 : 0))}` };
});
const started = performance.now();
const large = compileScalableReview(fixture(largeDocuments, 'b'.repeat(40)));
const elapsedMs = performance.now() - started;
assert.equal(large.plan.coverage.filesTotal, fileCount);
assert.equal(large.plan.coverage.filesAssigned, fileCount);
assert.equal(large.plan.coverage.complete, true);
assert.equal(large.plan.coverage.slices, 100);
assert.equal(large.plan.coverage.boundaries > 0, true);
assert.equal(fileCount * linesPerFile, 1_000_000);
assert.equal(elapsedMs < 45_000, true, `million-line compile took ${elapsedMs}ms`);
process.stdout.write(`${JSON.stringify({ ok: true, suite: 'scalable-review-compiler',
  millionLines: fileCount * linesPerFile, files: fileCount, slices: large.plan.coverage.slices,
  boundaries: large.plan.coverage.boundaries, elapsedMs: Math.round(elapsedMs) })}\n`);
