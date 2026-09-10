import { assertCoveragePlan, assertCoverageExecution, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { resolveSourceRevision } from '@kubeclaw/plugin-sdk';
import { parseGateDecision, gateDecisionEvidence, gateDecisionStageResult } from '@kubeclaw/pipeline-test-gate-contract/gate-decision';
import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { buildRequest, parseVerdict, type GateInput } from './protocol.ts';

function coveragePlan(input: GateInput): ResolvedTestPlanV1 {
  const plan = input.providerPlan.plan as unknown as ResolvedTestPlanV1;
  if (plan.coverage && !input.expectedCoverage) throw new Error('QUALITY_EXPECTED_COVERAGE_REQUIRED');
  if (input.expectedCoverage) assertCoveragePlan(plan, input.expectedCoverage);
  return plan;
}

export async function execute(input: GateInput, context: PluginInvocationContext): Promise<StageResult> {
  const agent = context.contract.config.agent;
  const testAgentEnabled = context.contract.config.testAgentEnabled !== false;
  if (testAgentEnabled && (typeof agent !== 'string' || !agent.trim())) throw new Error('quality evaluator agent is not configured');
  // Only a verified remote import may supply gate evidence.
  if (!input.providerPlan) throw new Error('QUALITY_PROVIDER_PLAN_REQUIRED');
  const plan = coveragePlan(input);
  const sourceRevision = await resolveSourceRevision(input.providerPlan, context);
  const execution = await context.invoke('test.plan.execute', {
    operation: 'run', resource: { type: 'test.resolved-plan', canonicalId: input.providerPlan.repositoryRoot },
    payload: { ...input.providerPlan, revision: sourceRevision, gateId: input.gateId,
      ...(input.expectedCoverage ? { expectedCoverage: input.expectedCoverage } : {}) },
  });
  const decision = parseGateDecision(execution);
  if (decision.runId !== context.contract.lease.attempt.runId) throw new Error('QUALITY_GATE_RUN_MISMATCH');
  if (input.expectedCoverage) assertCoverageExecution(plan, decision, input.expectedCoverage, sourceRevision, context.contract.lease.attempt.stageId);
  const nativeResult = gateDecisionStageResult(decision);
  const storedDecision = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `buster-quality:${input.gateId}:decision:${context.contract.lease.attempt.attemptNumber}` },
    payload: { namespace: 'kubeclaw.buster-quality-gate', mediaType: 'application/json', value: decision },
  });
  const artifacts = [storedDecision.artifact as ArtifactRef];
  if (decision.state !== 'passed') return { ...nativeResult, artifacts };
  if (!testAgentEnabled) {
    const stored = await context.invoke('artifacts.write', {
      operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `buster-quality:${input.gateId}:${context.contract.lease.attempt.attemptNumber}` },
      payload: { namespace: 'kubeclaw.buster-quality-gate', mediaType: 'application/json', value: {
        testAgent: { enabled: false }, nativeOutcome: decision.state, sourceRevision, decisionDigest: decision.decisionDigest,
      } },
    });
    return { ...nativeResult, artifacts: [...artifacts, stored.artifact as ArtifactRef] };
  }
  const judgedInput = {
    gateId: input.gateId, task: input.task,
    runId: context.contract.lease.attempt.runId, attempt: context.contract.lease.attempt.attemptNumber,
    suiteEvidence: gateDecisionEvidence(decision),
  };
  // Invocation failures retain the core's external-effect reconciliation policy.
  const response = await context.invoke('runtime.dispatch', withRuntimeDispatchProfile({
    operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent as string },
    payload: buildRequest(agent as string, judgedInput),
  }, context.contract.runtimeDispatchProfile));
  let verdict;
  try { verdict = parseVerdict(response.result, judgedInput); }
  catch (error) {
    return { schemaVersion: 'stage-result.v2', outcome: 'blocked', artifacts,
      reason: { code: 'buster_quality.invalid_verdict', message: error instanceof Error ? error.message : String(error) } };
  }
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `buster-quality:${input.gateId}:${judgedInput.attempt}` },
    payload: { namespace: 'kubeclaw.buster-quality-gate', mediaType: 'application/json', value: { testAgent: { enabled: true }, verdict, sourceRevision, decisionDigest: decision.decisionDigest, suiteEvidence: judgedInput.suiteEvidence } },
  });
  artifacts.push(stored.artifact as ArtifactRef);
  if (verdict.outcome === 'passed') return { ...nativeResult, artifacts };
  return { schemaVersion: 'stage-result.v2', outcome: verdict.outcome, artifacts,
    reason: { code: `buster_quality.${verdict.failureClass}`, message: verdict.summary, details: { findings: verdict.findings, decisionDigest: decision.decisionDigest } } };
}
import { withRuntimeDispatchProfile } from '@kubeclaw/plugin-sdk';
