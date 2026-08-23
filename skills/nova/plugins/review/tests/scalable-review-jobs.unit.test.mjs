import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { buildReviewGraph } from '../src/review-graph.ts';
import { relationKey } from '../src/review-map-artifacts.ts';
import { buildScalableReviewPlan } from '../src/review-scale-slicing.ts';
import { parseReviewSnapshotInventory } from '../src/review-snapshot-inventory.ts';
import { buildScalableReviewDispatchPayload, buildScalableReviewJobs,
  expandScalableReviewJob, scalableReviewTask } from '../src/scalable-review-jobs.ts';
import { executeScalableReviewJobs } from '../src/scalable-review-execution.ts';
import { resolveRepositoryReviewProfile } from '../src/repository-review-profile.ts';

const digest = (character) => `sha256:${character.repeat(64)}`;
const runtimeIdentity = { targetId: 'echo', runtime: 'subagent', agentId: 'codex',
  model: 'gpt-5.6-terra', thinking: 'high' };
const runtimeEvidence = { schemaVersion: 'runtime-agent-attestation.v1', ...runtimeIdentity,
  identityDigest: sha256Text(canonicalJson(runtimeIdentity)) };

const documents = [
  { path: 'a.ts', content: 'export const a = 1;\n' },
  { path: 'b.ts', content: "import { a } from './a.js';\nvoid a;\n" },
];
const files = documents.map((document, index) => ({ path: document.path,
  objectId: String(index + 1).repeat(40), mode: '100644', sizeBytes: Buffer.byteLength(document.content) }));
const snapshot = parseReviewSnapshotInventory({ head: 'a'.repeat(40), files,
  inventoryDigest: sha256Text(canonicalJson(files)) });
const relations = [{ type: 'imports', from: 'b.ts', to: 'a.ts', extractor: 'fixture', confidence: 'exact', provenance: 'b.ts:1' }];
const graph = buildReviewGraph(snapshot, relations);
assert.equal(relationKey(relations[0]).endsWith('\0exact'), true);
const tokenCounts = new Map(documents.map(({ path }) => [path, 10]));
const budget = { maxFiles: 2, maxBytes: 1000, maxTokens: 1000 };
const plan = buildScalableReviewPlan(snapshot, graph, tokenCounts,
  { ...budget, maxFiles: 1 });
const first = buildScalableReviewJobs({ plan, graph, documents, tokenCounts, budget });
const second = buildScalableReviewJobs({ plan, graph: buildReviewGraph(snapshot, [...relations].reverse()),
  documents: [...documents].reverse(), tokenCounts, budget });
assert.deepEqual(first, second);
assert.equal(first.filter(({ kind }) => kind === 'component').length, 2);
assert.equal(first.every((value) => value.taskDigest === sha256Text(scalableReviewTask(value.kind))), true);
const boundary = first.find(({ kind }) => kind === 'boundary');
assert.deepEqual(boundary.source.map(({ path }) => path), ['a.ts', 'b.ts']);
assert.equal(boundary.source.every(({ complete }) => !complete), true);
assert.equal(boundary.source.find(({ path }) => path === 'b.ts').ranges
  .some(({ startLine, endLine }) => startLine <= 1 && endLine >= 1), true);
const boundaryPayload = buildScalableReviewDispatchPayload(boundary);
assert.equal(boundaryPayload.task.includes('Do not report formatting'), true);
assert.equal(JSON.stringify(boundaryPayload).split(boundary.source[0].digest).length - 1, 1);
assert.equal(boundaryPayload.task.includes(boundary.source[0].content), false);
assert.equal(boundaryPayload.review.job.source[0].content, boundary.source[0].content);
const completeSources = new Map(first.filter(({ kind }) => kind === 'component')
  .flatMap(({ source }) => source.map((value) => [value.path, value])));
const expanded = expandScalableReviewJob(boundary, ['a.ts'], completeSources);
assert.equal(expanded.taskDigest, boundary.taskDigest);
assert.equal(expanded.source.find(({ path }) => path === 'a.ts').complete, true);
assert.throws(() => expandScalableReviewJob(boundary, ['missing.ts'], completeSources), /unavailable/u);
assert.throws(() => buildScalableReviewJobs({ plan, graph, documents: documents.slice(0, 1), tokenCounts, budget }), /source is missing/u);
assert.throws(() => buildScalableReviewJobs({ plan: { ...plan, coverage: { ...plan.coverage, complete: false } },
  graph, documents, tokenCounts, budget }), /incomplete/u);
assert.throws(() => buildScalableReviewJobs({ plan, graph, documents, tokenCounts,
  budget: { ...budget, maxFiles: 1 } }), /boundary relation exceeds budget/u);

const denseDocuments = ['a', 'b', 'c', 'd'].map((name) => ({ path: `${name}.ts`, content: `export const ${name} = 1;\n` }));
const denseFiles = denseDocuments.map((document, index) => ({ path: document.path,
  objectId: String(index + 1).repeat(40), mode: '100644', sizeBytes: Buffer.byteLength(document.content) }));
const denseSnapshot = parseReviewSnapshotInventory({ head: 'b'.repeat(40), files: denseFiles,
  inventoryDigest: sha256Text(canonicalJson(denseFiles)) });
const denseRelations = [relations[0], { ...relations[0], from: 'd.ts', to: 'c.ts', provenance: 'd.ts:1' }];
const denseGraph = buildReviewGraph(denseSnapshot, denseRelations);
const denseTokens = new Map(denseDocuments.map(({ path }) => [path, 10]));
const densePlan = { slices: [
  { id: 'slice-left', componentIds: [], files: ['a.ts', 'c.ts'], digest: digest('e') },
  { id: 'slice-right', componentIds: [], files: ['b.ts', 'd.ts'], digest: digest('f') },
], boundaries: [{ id: 'boundary-dense', fromSlice: 'slice-left', toSlice: 'slice-right',
  relationKeys: denseRelations.map(relationKey), digest: digest('g') }],
coverage: { ...plan.coverage, filesTotal: 4, filesIncluded: 4, filesAssigned: 4, slices: 2,
  boundaries: 1, uncoveredFiles: [], complete: true } };
const denseJobs = buildScalableReviewJobs({ plan: densePlan, graph: denseGraph, documents: denseDocuments,
  tokenCounts: denseTokens, budget: { maxFiles: 2, maxBytes: 1000, maxTokens: 1000 } });
assert.equal(denseJobs.filter(({ kind }) => kind === 'boundary').length, 2);
assert.equal(denseJobs.filter(({ kind }) => kind === 'boundary').every(({ source: values }) => values.length === 2), true);
const batchedProfile = resolveRepositoryReviewProfile({ grade: 'standard', overrides: {
  boundaryBudget: { maxFiles: 4, maxBytes: 1000, maxTokens: 1000, maxRelations: 10, maxSlices: 4 },
  enabledLenses: ['contracts', 'security'], maxPrimaryJobs: 10,
} });
const batchedJobs = buildScalableReviewJobs({ plan: densePlan, graph: denseGraph, documents: denseDocuments,
  tokenCounts: denseTokens, budget: batchedProfile.componentBudget, profile: batchedProfile });
const batchedBoundaries = batchedJobs.filter(({ kind }) => kind === 'boundary');
const holistic = batchedJobs.filter(({ kind }) => kind === 'system-lens');
assert.equal(batchedBoundaries.length, 1);
assert.deepEqual(batchedBoundaries.flatMap(({ relationKeys }) => relationKeys).sort(), denseRelations.map(relationKey).sort());
const aggregate = batchedJobs.filter(({ kind }) => kind === 'system-path');
assert.equal(aggregate.length, 0, 'one topology region has no cross-region path to review');
assert.equal(holistic.length, 1);
assert.equal(holistic.every(({ source, relationKeys, relatedIds }) =>
  source.length === 0 && relationKeys.length === 0 && relatedIds.length === 0), true);
assert.deepEqual(holistic[0].requirements.map(({ id }) => id), ['system.contracts', 'system.security']);
assert.equal(holistic[0].systemContext.relationCount, denseRelations.length);
assert.equal(holistic[0].systemContext.topology.relations.length, denseRelations.length);
assert.equal(holistic[0].systemContext.topology.relations.every((value) => value[5] === 'exact'), true);
assert.equal(new Set(batchedBoundaries.flatMap(({ relationKeys }) => relationKeys)).size,
  batchedBoundaries.flatMap(({ relationKeys }) => relationKeys).length);

const longRelations = Array.from({ length: 40 }, (_value, index) => ({
  type: 'imports', from: 'b.ts', to: 'a.ts',
  extractor: `adversarial-${index}-${'x'.repeat(200)}`, confidence: 'exact',
  provenance: 'b.ts:1',
}));
const longGraph = buildReviewGraph(denseSnapshot, longRelations);
const longPlan = { ...densePlan, boundaries: [{ ...densePlan.boundaries[0],
  relationKeys: longRelations.map(relationKey) }] };
const payloadAwareProfile = resolveRepositoryReviewProfile({ grade: 'standard', overrides: {
  boundaryBudget: { maxFiles: 4, maxBytes: 100_000, maxTokens: 20_000, maxRelations: 100, maxSlices: 4 },
  enabledLenses: ['contracts'], maxPrimaryJobs: 20, maxPromptBytesPerJob: 30_000,
} });
const payloadAwareJobs = buildScalableReviewJobs({ plan: longPlan, graph: longGraph, documents: denseDocuments,
  tokenCounts: denseTokens, budget: payloadAwareProfile.componentBudget, profile: payloadAwareProfile });
const payloadAwareHolistic = payloadAwareJobs.filter(({ kind }) => kind === 'system-lens');
const payloadAwarePaths = payloadAwareJobs.filter(({ kind }) => kind === 'system-path');
assert.equal(payloadAwareHolistic.length > 1, true, 'holistic topology must split on its final prompt size');
assert.equal(payloadAwarePaths.length > 0, true, 'split topology must retain cross-region path review');
assert.equal(payloadAwarePaths.every(({ systemContext }) => (
  systemContext.topologyScope === 'region-connection-graph'
  && systemContext.topology.portRows.length > 0
)), true);
assert.equal(payloadAwareHolistic.flatMap(({ systemContext }) => systemContext.topology.relations).length,
  longRelations.length);
assert.equal(payloadAwareHolistic.every(({ systemContext }) => (
  systemContext.topologyEvidence.kind === 'reviewed-topology'
)), true);

let dispatches = 0;
const context = { async invoke(capability, request) {
  assert.equal(capability, 'runtime.dispatch'); dispatches += 1;
  const dispatched = request.payload.review.job;
  const evidence = dispatched.source.map(({ digest }) => ({ kind: 'reviewed-source', digest }));
  return { runtimeEvidence, result: { schemaVersion: 'echo-review-output.v1', summary: 'Reviewed exact source.',
    inspectedEvidence: evidence,
    requirementAssessments: Object.fromEntries(dispatched.requirements.map(({ id }) => [id, {
      assessment: 'satisfied', explanation: 'The supplied source satisfies this requirement.', evidence,
    }])), proposedFindings: [] } };
} };
const executed = await executeScalableReviewJobs(first, 'echo', context, 2);
assert.deepEqual(executed.map(({ jobId }) => jobId), first.map(({ id }) => id));
assert.equal(executed.every(({ parsed }) => parsed.ok), true);
assert.equal(dispatches, first.length);

const originalNow = Date.now;
let now = 1_000;
Date.now = () => now;
let deadlineDispatches = 0;
const deadlineContext = { async invoke() {
  deadlineDispatches += 1; now = 2_001; throw new Error('transient dispatch failure');
} };
await assert.rejects(() => executeScalableReviewJobs(first.slice(0, 1), 'echo', deadlineContext, {
  concurrency: 1, maxRetries: 1, deadlineEpochMs: 2_000,
}), /wall time budget exhausted/u);
Date.now = originalNow;
assert.equal(deadlineDispatches, 1);

console.log(JSON.stringify({ ok: true, suite: 'scalable-review-jobs' }));
