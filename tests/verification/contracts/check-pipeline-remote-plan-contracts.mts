import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkPipelineTestGateContract,
  attestSourceSnapshot,
  remotePlanJobDigest,
  nodeResultDigest,
  remotePlanResultDigest,
  resolvedTestPlanDigest,
  stableTestIdentity,
  type RemotePlanResultV1,
  type RemotePlanStatusV1,
  type ResolvedTestPlanV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import { createRemotePlanJob, FileNovaRemotePlanStore } from '@kubeclaw/nova-core';

const digest = `sha256:${'1'.repeat(64)}`;
const receipt = { receiptId: 'receipt:test', receiptDigest: digest };
const planUnsigned = {
  schemaVersion: 'resolved-test-plan.v1',
  planId: 'plan:remote',
  runId: 'run:remote',
  project: 'remote-test',
  scope: { moduleId: 'module-1', gateId: null },
  registrySnapshotDigest: digest,
  createdAt: '2026-08-10T00:00:00.000Z',
  suites: [],
  nodes: [{
    id: 'unit', executionId: 'execution:unit', testIdentity: stableTestIdentity({ project: 'remote-test',
      moduleId: 'module-1', gateId: null, suiteInstanceId: null, nodeId: 'unit', variation: {} }), suiteInstanceId: null, kind: 'test',
    provider: { packageId: 'provider', packageVersion: '1.0.0', contentDigest: digest,
      registrationId: 'provider.unit', contractId: 'provider.unit@1' },
    reportAdapters: [], mode: 'blocking', reviewAgent: null,
    configuration: { schemaVersion: 'provider-configuration.v1', contractId: 'provider.unit@1',
      schemaDigest: digest, values: {} },
    dependencies: [], timeoutMs: 60_000,
    limits: { cpuMillis: 1_000, memoryBytes: 1024, logBytes: 1024, artifactBytes: 1024,
      artifactFiles: 1, processes: 1 },
    retryCount: 0, concurrencyGroup: null, parentNodeId: null, variation: {},
    evidence: { onPass: [], onFail: [], onError: [] }, skipReason: null,
  }],
  links: [], concurrencyLimits: {},
};
const plan: ResolvedTestPlanV1 = { ...planUnsigned, planDigest: resolvedTestPlanDigest(planUnsigned) };

const archive = Buffer.from('archive');
const sourceAttestationPrivateKey = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceSnapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1' as const, sourceType: 'git-commit' as const,
  pipelineStageId: 'stage:test-gate',
  repositoryId: 'repository:remote-test', revision: `git:${'a'.repeat(40)}`, tree: `git:${'b'.repeat(40)}`,
  archiveContentDigest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`,
  archiveSizeBytes: archive.byteLength, creatorAuthority: 'nova:test' }, sourceAttestationPrivateKey);
const job = createRemotePlanJob({
  idempotencyKey: 'dispatch:remote', pipelineStageId: 'stage:test-gate', plan,
  sourceSnapshot, repositoryArchive: archive, grants: new Map([['unit', []]]),
  maximumConcurrency: 1, submittedAt: '2026-08-10T00:00:00.000Z',
});
assert.equal(checkPipelineTestGateContract('remotePlanJob', job).ok, true);
assert.equal(checkPipelineTestGateContract('remotePlanJob', { ...job, maximumConcurrency: 2 }).ok, false,
  'changed jobs must fail their request digest');
assert.equal(checkPipelineTestGateContract('remotePlanJob', {
  ...job, repositoryArchive: { ...job.repositoryArchive, data: Buffer.from('changed').toString('base64') },
}).ok, false, 'changed archives must fail validation');
assert.equal(checkPipelineTestGateContract('remotePlanJob', {
  ...job, repositoryArchive: { ...job.repositoryArchive, data: `${job.repositoryArchive.data}\n` },
}).ok, false, 'non-canonical base64 must fail validation');
assert.equal(checkPipelineTestGateContract('remotePlanJob', {
  ...job, sourceSnapshot: { ...job.sourceSnapshot, archiveSizeBytes: job.sourceSnapshot.archiveSizeBytes + 1 },
}).ok, false, 'the source statement must bind the exact archive');
assert.equal(checkPipelineTestGateContract('remotePlanJob', {
  ...job, sourceSnapshot: { ...job.sourceSnapshot, revision: `git:${'a'.repeat(41)}` },
}).ok, false, 'Git object identities must use an exact supported hash length');
const wrongStageUnsigned = { ...job, pipelineStageId: 'stage:other' };
const { requestDigest: _wrongStageDigest, ...wrongStageContent } = wrongStageUnsigned;
assert.equal(checkPipelineTestGateContract('remotePlanJob', {
  ...wrongStageContent, requestDigest: remotePlanJobDigest(wrongStageContent),
}).ok, false, 'the source statement must bind the owning pipeline stage');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-remote-plan-'));
try {
  const store = new FileNovaRemotePlanStore(root, {
    recordLimits: { maximumRecords: 10, maximumBytes: 1024 * 1024, maximumRecordBytes: 512 * 1024 },
    maximumArchiveBytes: 1024,
    maximumArchiveStoreBytes: 1024 * 1024,
  });
  assert.deepEqual(await store.persistBeforeDispatch(job), job);
  assert.deepEqual(await store.persistBeforeDispatch(job), job, 'same job must be idempotent');
  await assert.rejects(() => store.persistBeforeDispatch({
    ...job,
    repositoryArchive: { ...job.repositoryArchive, sizeBytes: 1025 },
  }), /NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED/u);
  const changedUnsigned = { ...job, submittedAt: '2026-08-10T00:00:01.000Z' };
  await assert.rejects(() => store.persistBeforeDispatch({
    ...changedUnsigned, requestDigest: remotePlanJobDigest(changedUnsigned),
  }), /DURABLE_RECORD_IDEMPOTENCY_CONFLICT/u);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

const nodeUnsigned = {
  schemaVersion: 'node-result.v1' as const,
  planId: plan.planId, runId: plan.runId, moduleId: 'module-1', gateId: null,
  suiteInstanceId: null, nodeId: 'unit', executionId: 'execution:unit', testIdentity: plan.nodes[0]!.testIdentity, nodeKind: 'test' as const,
  mode: 'blocking' as const, state: 'skipped' as const, outcome: 'skipped' as const,
  attemptIds: [], finalAttemptId: null, unstable: false, skipReason: 'not selected',
};
const node = { ...nodeUnsigned, resultDigest: nodeResultDigest(nodeUnsigned), receipt };
const unsigned = {
  schemaVersion: 'buster-plan-result.v1' as const,
  jobId: job.jobId, planId: plan.planId, planDigest: plan.planDigest, runId: plan.runId,
  attempts: [], nodes: [node], cleanupErrors: [], completedAt: '2026-08-10T00:01:00.000Z',
};
const result: RemotePlanResultV1 = {
  ...unsigned, resultDigest: remotePlanResultDigest(unsigned), receipt,
};
assert.equal(checkPipelineTestGateContract('remotePlanResult', result).ok, true);
const completed: RemotePlanStatusV1 = {
  schemaVersion: 'buster-plan-status.v1', jobId: job.jobId, requestDigest: job.requestDigest,
  state: 'completed', submittedAt: job.submittedAt, updatedAt: result.completedAt,
  result: { schemaVersion: 'buster-plan-result-ref.v1', resultDigest: result.resultDigest,
    contentDigest: digest, sizeBytes: 1024 }, error: null,
};
assert.equal(checkPipelineTestGateContract('remotePlanStatus', completed).ok, true);
assert.equal(checkPipelineTestGateContract('remotePlanStatus', { ...completed, result: null }).ok, false);
assert.equal(checkPipelineTestGateContract('remotePlanStatus', {
  ...completed, result: { ...completed.result!, sizeBytes: 0 },
}).ok, false, 'status validation must include bounded result-reference semantics');

console.log(JSON.stringify({ ok: true, phase: '7-B', contracts: 3 }));
