import { coveragePassed, type GateCoverageResultV1 } from './coverage-result.ts';
import { validatePipelineTestGateContract } from './validation.ts';
import { remotePlanDigest } from './digest.ts';

export type GateDecisionState = 'passed' | 'failed' | 'execution_error' | 'review_required' | 'cancelled';
export type GateNodeEffect = 'passed' | 'failed' | 'advisory_failure' | 'execution_error' | 'review_required' | 'skipped';

export interface GateNodeDecisionV1 {
  readonly nodeId: string;
  readonly kind: 'test' | 'fixture';
  readonly mode: 'blocking' | 'advisory' | null;
  readonly effect: GateNodeEffect;
  readonly reason: string;
}

export interface AgentEvidenceReviewRequestV1 {
  readonly schemaVersion: 'agent-evidence-review-request.v1';
  readonly agent: string;
  readonly planId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly attemptId: string;
  readonly evidenceDigests: string[];
}

export interface GateDecisionV1 {
  readonly schemaVersion: 'test-gate-decision.v1' | 'test-gate-decision.v2';
  readonly coverage?: GateCoverageResultV1;
  readonly jobId: string;
  readonly planId: string;
  readonly runId: string;
  readonly state: GateDecisionState;
  readonly nodes: GateNodeDecisionV1[];
  readonly reviews: AgentEvidenceReviewRequestV1[];
  readonly resultDigest: string | null;
  readonly decisionDigest: string;
}

export function gateDecisionStageResult(decision: GateDecisionV1) {
  const details = { jobId: decision.jobId, planId: decision.planId, decisionDigest: decision.decisionDigest,
    failedNodes: decision.nodes.filter((node) => ['failed', 'execution_error'].includes(node.effect)).map((node) => node.nodeId),
    advisoryFailures: decision.nodes.filter((node) => node.effect === 'advisory_failure').map((node) => node.nodeId),
    ...(decision.coverage ? { coverageDigest: decision.coverage.coverageDigest, coverageChecks: decision.coverage.checks } : {}) };
  if (decision.state === 'passed') return { schemaVersion: 'stage-result.v2' as const, outcome: 'passed' as const, artifacts: [],
    facts: { 'test_gate.decision_digest': decision.decisionDigest, 'test_gate.advisory_failures': details.advisoryFailures.length } };
  if (decision.state === 'failed') return { schemaVersion: 'stage-result.v2' as const, outcome: 'request_fix' as const, artifacts: [],
    reason: { code: 'test_gate.failed', message: 'Blocking test checks failed or mandatory coverage was not executed.', details } };
  return { schemaVersion: 'stage-result.v2' as const, outcome: decision.state === 'cancelled' ? 'cancelled' as const : 'blocked' as const, artifacts: [],
    reason: { code: `test_gate.${decision.state}`,
      message: decision.state === 'review_required' ? 'Configured evidence review is required.' : 'The remote test gate did not complete safely.', details } };
}


function assertDecisionShape(d: GateDecisionV1): void {
  const fields = ['schemaVersion', 'jobId', 'planId', 'runId', 'state', 'nodes', 'reviews', 'resultDigest', 'decisionDigest'];
  if (d.schemaVersion === 'test-gate-decision.v2') fields.push('coverage');
  if (Object.keys(d).length !== fields.length || fields.some(key => !Object.hasOwn(d, key))
    || !['test-gate-decision.v1', 'test-gate-decision.v2'].includes(d.schemaVersion)
    || ![d.jobId, d.planId, d.runId].every(id => typeof id === 'string' && id.length > 0)
    || !['passed', 'failed', 'execution_error', 'review_required', 'cancelled'].includes(d.state)
    || !Array.isArray(d.nodes) || !Array.isArray(d.reviews)
    || !(d.resultDigest === null || /^sha256:[a-f0-9]{64}$/u.test(d.resultDigest))) throw new Error('TEST_GATE_DECISION_INVALID');
}

function assertDecisionNodes(nodes: readonly GateNodeDecisionV1[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || typeof node.nodeId !== 'string' || !node.nodeId || ids.has(node.nodeId)
      || !['test', 'fixture'].includes(node.kind) || !['blocking', 'advisory', null].includes(node.mode)
      || !['passed', 'failed', 'advisory_failure', 'execution_error', 'review_required', 'skipped'].includes(node.effect)
      || typeof node.reason !== 'string') throw new Error('TEST_GATE_DECISION_INVALID');
    ids.add(node.nodeId);
  }
  return ids;
}

function assertDecisionReviews(d: GateDecisionV1, ids: ReadonlySet<string>): void {
  for (const review of d.reviews) {
    if (!review || review.schemaVersion !== 'agent-evidence-review-request.v1' || review.runId !== d.runId || review.planId !== d.planId
      || !ids.has(review.nodeId) || typeof review.agent !== 'string' || !review.agent || typeof review.attemptId !== 'string'
      || !Array.isArray(review.evidenceDigests) || review.evidenceDigests.some(v => !/^sha256:[a-f0-9]{64}$/u.test(v))) throw new Error('TEST_GATE_REVIEW_INVALID');
  }
}

function assertDecisionCoverage(d: GateDecisionV1): void {
  if (d.schemaVersion !== 'test-gate-decision.v2') return;
  validatePipelineTestGateContract('gateCoverageResult', d.coverage);
  const coverage = d.coverage!;
  const nodes = new Map(d.nodes.map(node => [node.nodeId, node]));
  for (const check of coverage.checks) {
    if (check.state !== 'passed') continue;
    const node = check.nodeId === null ? undefined : nodes.get(check.nodeId);
    if (!node || node.kind !== 'test' || node.mode !== 'blocking' || node.effect !== 'passed') {
      throw new Error('TEST_GATE_COVERAGE_NODE_CONTRADICTION');
    }
  }
  if (d.state === 'passed' && !coveragePassed(coverage)) throw new Error('TEST_GATE_COVERAGE_INCOMPLETE');
}

/** Validate the native, integrity-bound decision at the adapter boundary. */
export function parseGateDecision(value: unknown): GateDecisionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TEST_GATE_DECISION_INVALID');
  const d = value as GateDecisionV1;
  assertDecisionShape(d);
  assertDecisionReviews(d, assertDecisionNodes(d.nodes));
  assertDecisionCoverage(d);
  const { decisionDigest, ...unsigned } = d;
  if (decisionDigest !== remotePlanDigest(unsigned)) throw new Error('TEST_GATE_DECISION_DIGEST_MISMATCH');
  const contradictions = [d.resultDigest === null, d.reviews.length > 0,
    d.nodes.some(n => ['failed', 'execution_error', 'review_required'].includes(n.effect))];
  if (d.state === 'passed' && contradictions.some(Boolean)) throw new Error('TEST_GATE_DECISION_CONTRADICTION');
  return structuredClone(d);
}


export function gateDecisionEvidence(decision: GateDecisionV1) {
  return [{ suite: 'provider-plan', passed: decision.state === 'passed', summary: `provider decision=${decision.state}; digest=${decision.decisionDigest}` },
    ...decision.nodes.map((node) => ({ suite: node.nodeId,
      passed: ['passed', 'advisory_failure', 'skipped'].includes(node.effect), summary: `${node.effect}: ${node.reason}` }))];
}
