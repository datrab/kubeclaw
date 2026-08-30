import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  attemptResultDigest, nodeResultDigest, remotePlanDigest, remotePlanResultDigest,
  remotePlanResultReceipt, resolvedTestPlanDigest,
  stableTestIdentity,
  attestSourceSnapshot,
  type ArtifactRefV1, type AttemptResultV1, type NodeResultV1,
  type RemotePlanJobV1, type RemotePlanResultV1, type RemotePlanStatusV1, type ResolvedTestPlanV1,
} from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import { createRemotePlanJob } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import {
  FileNovaGateImportStore, FileNovaTestExecutionGraphStore, NovaRemoteGateImporter, NovaRemoteTestGate, gateDecisionStageResult,
} from '../../../skills/nova/core/test-gates/remote-result-import.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const provider = { packageId: 'provider', packageVersion: '1.0.0', contentDigest: digest,
  registrationId: 'provider.test', contractId: 'provider.test@1' };
const limits = { cpuMillis: 1000, memoryBytes: 1024, logBytes: 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 10, processes: 2 };

function plan(mode: 'blocking' | 'advisory', reviewAgent: string | null): ResolvedTestPlanV1 {
  const unsigned = { schemaVersion: 'resolved-test-plan.v1' as const, planId: 'plan:import', runId: 'run:import',
    project: 'project', scope: { moduleId: 'module', gateId: null }, registrySnapshotDigest: digest,
    createdAt: '2026-08-10T03:00:00.000Z', suites: [], nodes: [{ id: 'test', executionId: 'execution:test',
      testIdentity: stableTestIdentity({ project: 'project', moduleId: 'module', gateId: null,
        suiteInstanceId: null, nodeId: 'test', variation: {} }),
      suiteInstanceId: null, kind: 'test' as const, provider, reportAdapters: [], mode, reviewAgent,
      configuration: { schemaVersion: 'provider-configuration.v1' as const, contractId: provider.contractId,
        schemaDigest: digest, values: {} }, dependencies: [], timeoutMs: 1000, limits, retryCount: 0,
      concurrencyGroup: null, parentNodeId: null, variation: {},
      evidence: { onPass: ['log'], onFail: ['log'], onError: ['log'] }, skipReason: null }],
    links: [], concurrencyLimits: { default: 1 } };
  return { ...unsigned, planDigest: resolvedTestPlanDigest(unsigned) };
}

function authorityReceipt(planDigest: string, resultDigest: string, suffix: string) {
  const receiptId = `receipt:${suffix}`;
  return { receiptId, receiptDigest: remotePlanDigest({ authorityId: `test-runner:${planDigest}`, receiptId, resultDigest }) };
}

function completed(job: RemotePlanJobV1, options: {
  outcome: 'passed' | 'failed'; state?: 'completed' | 'errored'; artifact?: ArtifactRefV1;
  reportFailure?: boolean; cleanup?: boolean;
}): { status: RemotePlanStatusV1; result: RemotePlanResultV1 } {
  const node = job.plan.nodes[0]!;
  const attemptUnsigned = { schemaVersion: 'attempt-result.v1' as const, planId: job.plan.planId,
    runId: job.plan.runId, moduleId: job.plan.scope.moduleId, gateId: job.plan.scope.gateId,
    suiteInstanceId: null, nodeId: node.id, executionId: node.executionId, testIdentity: node.testIdentity, nodeKind: node.kind,
    attemptId: 'attempt:test:1', attemptNumber: 1, provider: node.provider, mode: node.mode,
    executionState: options.state ?? 'completed', outcome: options.state === 'errored' ? null : options.outcome,
    startedAt: '2026-08-10T03:00:01.000Z', completedAt: '2026-08-10T03:00:02.000Z', durationMs: 1000,
    summary: options.outcome, counts: { total: 1, passed: options.outcome === 'passed' ? 1 : 0,
      failed: options.outcome === 'failed' ? 1 : 0, skipped: 0 }, findings: [], metrics: [],
    reports: options.reportFailure && options.artifact ? [{ schemaVersion: 'report-adapter-result.v1' as const,
      adapter: { adapterId: 'junit', format: 'junit', contractVersion: 1,
        package: { packageId: 'adapter', packageVersion: '1.0.0', contentDigest: digest } },
      sourceArtifact: options.artifact, counts: { total: 1, passed: 0, failed: 1, errored: 0, skipped: 0 },
      durationMs: 1, cases: [], casesTruncated: true, omittedCaseCount: 1, findings: [],
      findingsTruncated: false, omittedFindingCount: 0 }] : [],
    evidence: options.artifact ? [{ evidenceId: 'log', type: 'log', artifact: options.artifact }] : [],
    outputs: [], resources: { logBytes: 0, artifactBytes: options.artifact?.sizeBytes ?? 0 },
    exitCode: options.state === 'errored' ? null : options.outcome === 'passed' ? 0 : 1,
    signal: null, providerDetails: null };
  const attemptDigest = attemptResultDigest(attemptUnsigned);
  const attempt: AttemptResultV1 = { ...attemptUnsigned, resultDigest: attemptDigest,
    receipt: authorityReceipt(job.plan.planDigest, attemptDigest, 'attempt') };
  const nodeUnsigned = { schemaVersion: 'node-result.v1' as const, planId: job.plan.planId, runId: job.plan.runId,
    moduleId: job.plan.scope.moduleId, gateId: job.plan.scope.gateId, suiteInstanceId: null,
    nodeId: node.id, executionId: node.executionId, testIdentity: node.testIdentity, nodeKind: node.kind, mode: node.mode,
    state: options.state ?? 'completed', outcome: options.state === 'errored' ? null : options.outcome,
    attemptIds: [attempt.attemptId], finalAttemptId: attempt.attemptId, unstable: false, skipReason: null };
  const nodeDigest = nodeResultDigest(nodeUnsigned);
  const resultNode: NodeResultV1 = { ...nodeUnsigned, resultDigest: nodeDigest,
    receipt: authorityReceipt(job.plan.planDigest, nodeDigest, 'node') };
  const resultUnsigned = { schemaVersion: 'buster-plan-result.v1' as const, jobId: job.jobId,
    planId: job.plan.planId, planDigest: job.plan.planDigest, runId: job.plan.runId,
    attempts: [attempt], nodes: [resultNode], cleanupErrors: options.cleanup ? [{ nodeId: node.id, message: 'cleanup' }] : [],
    completedAt: '2026-08-10T03:00:03.000Z' };
  const resultDigest = remotePlanResultDigest(resultUnsigned);
  const result: RemotePlanResultV1 = { ...resultUnsigned, resultDigest, receipt: remotePlanResultReceipt(job.jobId, resultDigest) };
  const bytes = Buffer.from(JSON.stringify(result));
  const contentDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  return { result, status: { schemaVersion: 'buster-plan-status.v1', jobId: job.jobId, requestDigest: job.requestDigest,
    state: 'completed', submittedAt: job.submittedAt, updatedAt: result.completedAt,
    result: { schemaVersion: 'buster-plan-result-ref.v1', resultDigest, contentDigest, sizeBytes: bytes.byteLength }, error: null } };
}

const archive = Buffer.from('archive');
const sourceSnapshotPrivateKey = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceSnapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1' as const, sourceType: 'git-commit' as const,
  pipelineStageId: 'stage:test-gate',
  repositoryId: 'repository:import', revision: `git:${'a'.repeat(40)}`, tree: `git:${'b'.repeat(40)}`,
  archiveContentDigest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`,
  archiveSizeBytes: archive.byteLength, creatorAuthority: 'nova:test' }, sourceSnapshotPrivateKey);
const evidenceBytes = Buffer.from('durable evidence');
const evidenceDigest = `sha256:${crypto.createHash('sha256').update(evidenceBytes).digest('hex')}`;
const artifact: ArtifactRefV1 = { artifactId: 'artifact:log', type: 'log', mediaType: 'text/plain',
  contentDigest: evidenceDigest, sizeBytes: evidenceBytes.byteLength, storageUrl: 'file:///buster/evidence' };
const recordLimits = { maximumRecords: 100, maximumBytes: 4 * 1024 * 1024, maximumRecordBytes: 1024 * 1024 };

async function scenario(mode: 'blocking' | 'advisory', reviewAgent: string | null,
  options: Parameters<typeof completed>[1]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gate-import-'));
  const job = createRemotePlanJob({ idempotencyKey: `import:${mode}:${reviewAgent ?? 'none'}:${options.outcome}:${options.reportFailure ?? false}:${options.state ?? 'completed'}`,
    pipelineStageId: 'stage:test-gate',
    plan: plan(mode, reviewAgent), sourceSnapshot, repositoryArchive: archive, grants: new Map([['test', []]]),
    maximumConcurrency: 1, submittedAt: '2026-08-10T03:00:00.000Z' });
  const { status, result } = completed(job, options);
  const importer = new NovaRemoteGateImporter({
    store: new FileNovaGateImportStore(root, { recordLimits, maximumEvidenceStoreBytes: 1024 * 1024 }),
    evidence: { evidence: async (_jobId, contentDigest) => {
      assert.equal(contentDigest, evidenceDigest); return evidenceBytes;
    } }, results: { result: async () => result }, maximumEvidenceBytes: 1024 * 1024,
    maximumResultBytes: 1024 * 1024,
  });
  try { return { job, status, decision: await importer.import(job, status), importer }; }
  finally { if (!process.env.KEEP_TEST_TMP) fs.rmSync(root, { recursive: true, force: true }); }
}

const passed = await scenario('blocking', null, { outcome: 'passed', artifact });
assert.equal(passed.decision.state, 'passed');
assert.equal(gateDecisionStageResult(passed.decision).outcome, 'passed');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-canonical-test-graph-'));
  const graphStore = new FileNovaTestExecutionGraphStore(path.join(root, 'graph'), recordLimits);
  const job = createRemotePlanJob({ idempotencyKey: 'import:canonical-graph', pipelineStageId: 'stage:test-gate', plan: plan('blocking', 'buster'),
    sourceSnapshot, repositoryArchive: archive, grants: new Map([['test', []]]), maximumConcurrency: 1,
    submittedAt: '2026-08-10T03:00:00.000Z' });
  const terminal = completed(job, { outcome: 'failed', artifact });
  const importer = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(path.join(root, 'imports'),
    { recordLimits, maximumEvidenceStoreBytes: 1024 * 1024, graphStore }),
    evidence: { evidence: async () => evidenceBytes }, results: { result: async () => terminal.result },
    maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024 });
  const seedImporter = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(path.join(root, 'seed-import'),
    { recordLimits, maximumEvidenceStoreBytes: 1024 * 1024 }),
    evidence: { evidence: async () => evidenceBytes }, results: { result: async () => terminal.result },
    maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024 });
  const expectedDecision = await seedImporter.import(job, terminal.status);
  await graphStore.record(job, terminal.result, expectedDecision);
  const decision = await importer.import(job, terminal.status);
  const [graph] = await graphStore.read();
  assert.equal(graph?.runId, job.plan.runId);
  assert.equal(graph?.parentStageId, job.pipelineStageId);
  assert.equal(graph?.planDigest, job.plan.planDigest);
  assert.deepEqual(graph?.nodes.map((node) => node.id), ['test']);
  assert.deepEqual(graph?.attempts.map((attempt) => attempt.attemptId), ['attempt:test:1']);
  assert.deepEqual(graph?.results.map((node) => node.nodeId), ['test']);
  assert.deepEqual(graph?.reviews.map((review) => review.nodeId), ['test']);
  assert.equal(graph?.decisionDigest, decision.decisionDigest);
  await importer.import(job, terminal.status);
  assert.equal((await graphStore.read()).length, 1, 'graph projection must be idempotent');
  await assert.rejects(() => graphStore.record(job, terminal.result,
    { ...decision, decisionDigest: digest }), /NOVA_TEST_EXECUTION_GRAPH_CONFLICT/u,
  'a divergent graph projection must not replace the durable winner');
  fs.rmSync(root, { recursive: true, force: true });
}
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-complete-import-graph-backfill-'));
  const job = createRemotePlanJob({ idempotencyKey: 'import:graph-backfill', pipelineStageId: 'stage:test-gate',
    plan: plan('blocking', null), sourceSnapshot, repositoryArchive: archive,
    grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-08-10T03:00:00.000Z' });
  const terminal = completed(job, { outcome: 'passed', artifact });
  const importRoot = path.join(root, 'imports');
  const transport = { evidence: async () => evidenceBytes };
  const results = { result: async () => terminal.result };
  const original = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(importRoot,
    { recordLimits, maximumEvidenceStoreBytes: 1024 * 1024 }), evidence: transport, results,
    maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024 });
  await original.import(job, terminal.status);
  const graphStore = new FileNovaTestExecutionGraphStore(path.join(root, 'graph'), recordLimits);
  const upgraded = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(importRoot,
    { recordLimits, maximumEvidenceStoreBytes: 1024 * 1024, graphStore }), evidence: transport, results,
    maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024 });
  await upgraded.import(job, terminal.status);
  assert.equal((await graphStore.read()).length, 1,
    'replaying an import completed before D-091 must backfill the canonical graph');
  fs.rmSync(root, { recursive: true, force: true });
}
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gate-executor-'));
  const importer = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(root,
    { recordLimits, maximumEvidenceStoreBytes: 1024 * 1024 }), evidence: { evidence: async () => evidenceBytes },
    results: { result: async () => completed(passed.job, { outcome: 'passed', artifact }).result },
    maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024 });
  const gate = new NovaRemoteTestGate({ dispatcher: { dispatch: async () => passed.status }, importer, legacyLedger: {} });
  const executed = await gate.execute(passed.job, { timeoutMs: 1000, legacySuites: [] });
  assert.equal(executed.stageResult.outcome, 'passed', 'terminal dispatch must flow through import and stage policy');
  fs.rmSync(root, { recursive: true, force: true });
}
const failed = await scenario('blocking', null, { outcome: 'failed', artifact });
assert.equal(failed.decision.state, 'failed');
assert.equal(gateDecisionStageResult(failed.decision).outcome, 'request_fix');
const advisory = await scenario('advisory', null, { outcome: 'failed', artifact });
assert.equal(advisory.decision.state, 'passed');
assert.equal(advisory.decision.nodes[0]?.effect, 'advisory_failure');
const review = await scenario('blocking', 'buster', { outcome: 'failed', artifact });
assert.equal(review.decision.state, 'review_required');
assert.equal(review.decision.reviews[0]?.agent, 'buster');
const report = await scenario('blocking', 'buster', { outcome: 'passed', artifact, reportFailure: true });
assert.equal(report.decision.state, 'failed', 'structured report failures are deterministic and do not start an agent');
assert.equal(report.decision.reviews.length, 0);
const errored = await scenario('blocking', null, { outcome: 'failed', state: 'errored', artifact });
assert.equal(errored.decision.state, 'execution_error');
const advisoryError = await scenario('advisory', null, { outcome: 'failed', state: 'errored', artifact });
assert.equal(advisoryError.decision.state, 'execution_error');
const cleanup = await scenario('blocking', null, { outcome: 'passed', artifact, cleanup: true });
assert.equal(cleanup.decision.state, 'execution_error');

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gate-contradiction-'));
  const job = createRemotePlanJob({ idempotencyKey: 'import:contradiction', pipelineStageId: 'stage:test-gate', plan: plan('blocking', null),
    sourceSnapshot, repositoryArchive: archive, grants: new Map([['test', []]]), maximumConcurrency: 1,
    submittedAt: '2026-08-10T03:00:00.000Z' });
  const { status, result: original } = completed(job, { outcome: 'failed' });
  const nodeUnsigned = { ...original.nodes[0]!, state: 'completed' as const, outcome: 'passed' as const };
  const { resultDigest: _oldNodeDigest, receipt: _oldNodeReceipt, ...unsignedNode } = nodeUnsigned;
  const changedNodeDigest = nodeResultDigest(unsignedNode);
  const changedNode = { ...unsignedNode, resultDigest: changedNodeDigest,
    receipt: authorityReceipt(job.plan.planDigest, changedNodeDigest, 'changed-node') };
  const { resultDigest: _oldResultDigest, receipt: _oldResultReceipt, ...unsignedResult } = original;
  const changedUnsigned = { ...unsignedResult, nodes: [changedNode] };
  const changedResultDigest = remotePlanResultDigest(changedUnsigned);
  const changedResult = { ...changedUnsigned, resultDigest: changedResultDigest,
    receipt: remotePlanResultReceipt(job.jobId, changedResultDigest) };
  const changedStatus = { ...status, result: { ...status.result!, resultDigest: changedResultDigest } };
  const importer = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(root,
    { recordLimits, maximumEvidenceStoreBytes: 1024 }), evidence: { evidence: async () => Buffer.alloc(0) },
    results: { result: async () => changedResult }, maximumEvidenceBytes: 1024, maximumResultBytes: 1024 * 1024 });
  await assert.rejects(() => importer.import(job, changedStatus), /NODE_IDENTITY_MISMATCH/u);
  fs.rmSync(root, { recursive: true, force: true });
}

await assert.rejects(async () => {
  const item = await scenario('blocking', null, { outcome: 'passed', artifact });
  await item.importer.import(item.job, { ...item.status, result: { ...item.status.result!, sizeBytes: 0 } });
}, /Invalid pipeline test-gate remotePlanStatus/u);

console.log(JSON.stringify({ ok: true, phase: '7-D', decisions: 7, evidence: 'verified-before-import' }));
