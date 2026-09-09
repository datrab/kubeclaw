import {
  attemptResultDigest, nodeResultDigest, remotePlanDigest, remotePlanResultDigest, remotePlanResultReceipt,
  validatePipelineTestGateContract, bindGateCoverage, coveragePassed,
  type ArtifactRefV1, type RemotePlanJobV1, type RemotePlanResultV1, type RemotePlanStatusV1,
  type GateDecisionV1, type GateDecisionState, type GateNodeDecisionV1, type GateNodeEffect,
  type AgentEvidenceReviewRequestV1, type ResolvedPlanNodeV1, type AttemptResultV1, type NodeResultV1,
} from '@kubeclaw/pipeline-test-gate-contract';

export function same(left: unknown, right: unknown): boolean {
  return remotePlanDigest(left) === remotePlanDigest(right);
}

function nodeAuthorityReceipt(planDigest: string, receipt: { receiptId: string; receiptDigest: string }, resultDigest: string): boolean {
  return receipt.receiptDigest === remotePlanDigest({ authorityId: `test-runner:${planDigest}`, receiptId: receipt.receiptId, resultDigest });
}

export function artifacts(result: RemotePlanResultV1 | null): ArtifactRefV1[] {
  if (!result) return [];
  const found = result.attempts.flatMap((attempt) => [
    ...attempt.evidence.map((item) => item.artifact),
    ...attempt.outputs.filter((item) => item.kind === 'artifact').map((item) => item.artifact),
    ...attempt.reports.map((item) => item.sourceArtifact),
  ]);
  const byDigest = new Map<string, ArtifactRefV1>();
  for (const artifact of found) {
    const prior = byDigest.get(artifact.contentDigest);
    if (prior && prior.sizeBytes !== artifact.sizeBytes) {
      throw new Error('NOVA_REMOTE_EVIDENCE_IDENTITY_CONFLICT');
    }
    byDigest.set(artifact.contentDigest, artifact);
  }
  return [...byDigest.values()].sort((a, b) => a.contentDigest.localeCompare(b.contentDigest));
}

export function verifyCompletedResult(job: RemotePlanJobV1, status: RemotePlanStatusV1, result: RemotePlanResultV1): void {
  validatePipelineTestGateContract('remotePlanStatus', status);
  if (status.jobId !== job.jobId || status.requestDigest !== job.requestDigest || status.state !== 'completed' || !status.result) {
    throw new Error('NOVA_REMOTE_RESULT_STATUS_INVALID');
  }
  validatePipelineTestGateContract('remotePlanResult', result);
  if (status.result.resultDigest !== result.resultDigest) throw new Error('NOVA_REMOTE_RESULT_REFERENCE_MISMATCH');
  verifyResult(job, result);
}

function verifyAttempt(job: RemotePlanJobV1, planNode: ResolvedPlanNodeV1, attempt: AttemptResultV1): void {
  validatePipelineTestGateContract('attemptResult', attempt);
  if (attemptResultDigest(attempt) !== attempt.resultDigest
    || !nodeAuthorityReceipt(job.plan.planDigest, attempt.receipt, attempt.resultDigest)
    || attempt.executionId !== planNode.executionId || attempt.testIdentity !== planNode.testIdentity
    || attempt.nodeKind !== planNode.kind
    || attempt.mode !== planNode.mode || !same(attempt.provider, planNode.provider)
    || attempt.moduleId !== job.plan.scope.moduleId || attempt.gateId !== job.plan.scope.gateId
    || attempt.suiteInstanceId !== planNode.suiteInstanceId) {
    throw new Error(`NOVA_REMOTE_RESULT_ATTEMPT_IDENTITY_MISMATCH:${attempt.attemptId}`);
  }
}

function verifyNode(job: RemotePlanJobV1, planNode: ResolvedPlanNodeV1, node: NodeResultV1): void {
  validatePipelineTestGateContract('nodeResult', node);
  if (nodeResultDigest(node) !== node.resultDigest
    || !nodeAuthorityReceipt(job.plan.planDigest, node.receipt, node.resultDigest)
    || node.executionId !== planNode.executionId || node.testIdentity !== planNode.testIdentity
    || node.nodeKind !== planNode.kind || node.mode !== planNode.mode
    || node.moduleId !== job.plan.scope.moduleId || node.gateId !== job.plan.scope.gateId
    || node.suiteInstanceId !== planNode.suiteInstanceId) {
    throw new Error(`NOVA_REMOTE_RESULT_NODE_IDENTITY_MISMATCH:${node.nodeId}`);
  }
}

function verifyNodeAttempts(planNode: ResolvedPlanNodeV1, node: NodeResultV1, attempts: readonly AttemptResultV1[]): void {
  const expectedAttemptIds = attempts.map((item) => item.attemptId);
  const finalAttempt = attempts.at(-1) ?? null;
  const attemptsContiguous = attempts.every((attempt, index) => attempt.attemptNumber === index + 1);
  const terminalMatchesAttempt = node.state === 'skipped'
    ? finalAttempt === null && node.outcome === 'skipped'
    : finalAttempt !== null && node.state === finalAttempt.executionState && node.outcome === finalAttempt.outcome;
  if (!same(node.attemptIds, expectedAttemptIds) || node.finalAttemptId !== (expectedAttemptIds.at(-1) ?? null)
    || !attemptsContiguous || attempts.length > planNode.retryCount + 1 || !terminalMatchesAttempt) {
    throw new Error(`NOVA_REMOTE_RESULT_NODE_IDENTITY_MISMATCH:${node.nodeId}`);
  }
}

export function verifyResult(job: RemotePlanJobV1, result: RemotePlanResultV1): void {
  validatePipelineTestGateContract('remotePlanResult', result);
  if (result.jobId !== job.jobId || result.planId !== job.plan.planId
    || result.planDigest !== job.plan.planDigest || result.runId !== job.plan.runId) {
    throw new Error('NOVA_REMOTE_RESULT_OWNERSHIP_MISMATCH');
  }
  if (remotePlanResultDigest(result) !== result.resultDigest
    || !same(result.receipt, remotePlanResultReceipt(job.jobId, result.resultDigest))) {
    throw new Error('NOVA_REMOTE_RESULT_RECEIPT_INVALID');
  }
  const planNodes = new Map(job.plan.nodes.map((node) => [node.id, node]));
  const resultNodes = new Map(result.nodes.map((node) => [node.nodeId, node]));
  if (planNodes.size !== resultNodes.size || [...planNodes.keys()].some((id) => !resultNodes.has(id))) {
    throw new Error('NOVA_REMOTE_RESULT_NODE_SET_MISMATCH');
  }
  const attemptsByNode = new Map<string, typeof result.attempts>();
  for (const attempt of result.attempts) {
    const planNode = planNodes.get(attempt.nodeId);
    if (!planNode) throw new Error('NOVA_REMOTE_RESULT_ATTEMPT_NODE_UNKNOWN');
    verifyAttempt(job, planNode, attempt);
    const list = attemptsByNode.get(attempt.nodeId) ?? [];
    attemptsByNode.set(attempt.nodeId, [...list, attempt]);
  }
  for (const [nodeId, planNode] of planNodes) {
    const node = resultNodes.get(nodeId)!;
    verifyNode(job, planNode, node);
    const attempts = [...(attemptsByNode.get(nodeId) ?? [])].sort((a, b) => a.attemptNumber - b.attemptNumber);
    verifyNodeAttempts(planNode, node, attempts);
  }
  if (result.cleanupErrors.some((item) => !planNodes.has(item.nodeId))) {
    throw new Error('NOVA_REMOTE_RESULT_CLEANUP_NODE_UNKNOWN');
  }
}

function failedReport(nodeId: string, result: RemotePlanResultV1): boolean {
  return result.attempts
    .filter((attempt) => attempt.nodeId === nodeId && attempt.attemptId === result.nodes.find((node) => node.nodeId === nodeId)?.finalAttemptId)
    .some((attempt) => attempt.reports.some((report) => report.counts.failed > 0 || report.counts.errored > 0));
}

function coveredDecision(job: RemotePlanJobV1, decision: Omit<GateDecisionV1, 'decisionDigest'>): GateDecisionV1 {
  const coverage = bindGateCoverage(job, decision.nodes);
  const unsigned = coverage ? { ...decision, schemaVersion: 'test-gate-decision.v2' as const, coverage,
    state: decision.state === 'passed' && !coveragePassed(coverage) ? 'failed' as const : decision.state } : decision;
  return { ...unsigned, decisionDigest: remotePlanDigest(unsigned) };
}

export function decide(job: RemotePlanJobV1, status: RemotePlanStatusV1, result: RemotePlanResultV1 | null): GateDecisionV1 {
  if (status.state !== 'completed' || !result) {
    const state: GateDecisionState = status.state === 'cancelled' ? 'cancelled' : 'execution_error';
    const unsigned = { schemaVersion: 'test-gate-decision.v1' as const, jobId: job.jobId,
      planId: job.plan.planId, runId: job.plan.runId, state, nodes: [], reviews: [], resultDigest: null };
    return coveredDecision(job, unsigned);
  }
  return decideResult(job, result);
}

function missingJUnitExecution(planNode: ResolvedPlanNodeV1, finalAttempt: AttemptResultV1 | undefined): boolean {
  return planNode.mode === 'blocking'
    && planNode.provider.contractId === 'kubeclaw.direct-command@1'
    && planNode.configuration.values.resultMode === 'junit-required'
    && !(finalAttempt?.reports.some((report) => report.adapter.format === 'junit'
      && report.counts.passed + report.counts.failed + report.counts.errored > 0));
}

function decideNode(job: RemotePlanJobV1, result: RemotePlanResultV1, planNode: ResolvedPlanNodeV1,
  node: NodeResultV1, finalAttempt: AttemptResultV1 | undefined, reviews: AgentEvidenceReviewRequestV1[]): GateNodeDecisionV1 {
    let effect: GateNodeEffect;
    let reason: string;
    if (node.state === 'skipped') { effect = 'skipped'; reason = node.skipReason ?? 'condition skipped'; }
    else if (node.state !== 'completed' || result.cleanupErrors.some((item) => item.nodeId === node.nodeId)) {
      effect = 'execution_error';
      reason = node.state !== 'completed' ? `execution ${node.state}` : 'cleanup failed';
    } else {
      const failed = node.outcome === 'failed' || failedReport(node.nodeId, result);
      const missingExecution = missingJUnitExecution(planNode, finalAttempt);
      if (missingExecution) {
        effect = 'failed'; reason = 'TEST_REPORT_NO_EXECUTED_CASES: blocking JUnit requires at least one executed case';
      } else if (!failed) { effect = 'passed'; reason = 'all declared checks passed'; }
      else if (planNode.mode === 'advisory') { effect = 'advisory_failure'; reason = 'advisory checks failed'; }
      else if (planNode.reviewAgent && node.outcome === 'failed' && !failedReport(node.nodeId, result) && finalAttempt) {
        effect = 'review_required'; reason = `evidence review by ${planNode.reviewAgent}`;
        reviews.push({ schemaVersion: 'agent-evidence-review-request.v1', agent: planNode.reviewAgent,
          planId: job.plan.planId, runId: job.plan.runId, nodeId: node.nodeId, attemptId: finalAttempt.attemptId,
          evidenceDigests: finalAttempt.evidence.map((item) => item.artifact.contentDigest).sort() });
      } else { effect = 'failed'; reason = 'blocking checks failed'; }
    }
    return { nodeId: planNode.id, kind: planNode.kind, mode: planNode.mode, effect, reason };
}

export function decideResult(job: RemotePlanJobV1, result: RemotePlanResultV1): GateDecisionV1 {
  const resultNodes = new Map(result.nodes.map((node) => [node.nodeId, node]));
  const attempts = new Map(result.attempts.map((attempt) => [attempt.attemptId, attempt]));
  const nodes: GateNodeDecisionV1[] = [];
  const reviews: AgentEvidenceReviewRequestV1[] = [];
  for (const planNode of job.plan.nodes) {
    const node = resultNodes.get(planNode.id)!;
    const finalAttempt = node.finalAttemptId ? attempts.get(node.finalAttemptId) : undefined;
    nodes.push(decideNode(job, result, planNode, node, finalAttempt, reviews));
  }
  const state: GateDecisionState = nodes.some((node) => node.effect === 'execution_error') ? 'execution_error'
    : nodes.some((node) => node.effect === 'review_required') ? 'review_required'
      : nodes.some((node) => node.effect === 'failed') ? 'failed' : 'passed';
  const unsigned = { schemaVersion: 'test-gate-decision.v1' as const, jobId: job.jobId,
    planId: job.plan.planId, runId: job.plan.runId, state, nodes, reviews,
    resultDigest: result.resultDigest };
  return coveredDecision(job, unsigned);
}
