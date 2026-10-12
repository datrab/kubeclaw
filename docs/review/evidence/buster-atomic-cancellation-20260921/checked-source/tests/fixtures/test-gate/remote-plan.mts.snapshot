// Contract-valid result fixtures; no engine, transport or store implementation.
import crypto from 'node:crypto';
import {
  attemptResultDigest, nodeResultDigest, remotePlanDigest, remotePlanResultDigest,
  remotePlanResultReceipt, resolvedTestPlanDigest,
  stableTestIdentity,
  type ArtifactRefV1, type AttemptResultV1, type NodeResultV1,
  type RemotePlanJobV1, type RemotePlanResultV1, type RemotePlanStatusV1, type ResolvedTestPlanV1,
} from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
const digest = `sha256:${'a'.repeat(64)}`;
const provider = { packageId: 'provider', packageVersion: '1.0.0', contentDigest: digest,
  registrationId: 'provider.test', contractId: 'provider.test@1' };
const limits = { cpuMillis: 1000, memoryBytes: 1024, logBytes: 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 10, processes: 2 };

export function plan(mode: 'blocking' | 'advisory', reviewAgent: string | null): ResolvedTestPlanV1 {
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

export function completed(job: RemotePlanJobV1, options: {
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
  const resultUnsigned = { schemaVersion: 'buster-plan-result.v1' as const,
    workerRevision: 'a'.repeat(40), jobId: job.jobId,
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
