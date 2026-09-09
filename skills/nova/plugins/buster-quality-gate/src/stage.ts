import { resolveSourceRevision } from '@kubeclaw/plugin-sdk';
import { parseGateDecision, gateDecisionEvidence, gateDecisionStageResult } from '@kubeclaw/pipeline-test-gate-contract/gate-decision';
import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { buildRequest, parseVerdict, type GateInput } from './protocol.ts';

export async function execute(input: GateInput, context: PluginInvocationContext): Promise<StageResult> {
  const agent = context.contract.config.agent;
  if (typeof agent !== 'string' || !agent.trim()) throw new Error('quality evaluator agent is not configured');
  // Only a verified remote import may supply gate evidence.
  if (!input.providerPlan) throw new Error('QUALITY_PROVIDER_PLAN_REQUIRED');
  const sourceRevision = await resolveSourceRevision(input.providerPlan, context);
  const execution = await context.invoke('test.plan.execute', {
    operation: 'run', resource: { type: 'test.resolved-plan', canonicalId: input.providerPlan.repositoryRoot },
    payload: { ...input.providerPlan, revision: sourceRevision },
  });
  const decision = parseGateDecision(execution);
  if (decision.runId !== context.contract.lease.attempt.runId) throw new Error('QUALITY_GATE_RUN_MISMATCH');
  const nativeResult = gateDecisionStageResult(decision);
  const storedDecision = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `buster-quality:${input.gateId}:decision:${context.contract.lease.attempt.attemptNumber}` },
    payload: { namespace: 'kubeclaw.buster-quality-gate', mediaType: 'application/json', value: decision },
  });
  const artifacts = [storedDecision.artifact as ArtifactRef];
  if (decision.state !== 'passed') return { ...nativeResult, artifacts };
  const judgedInput = {
    gateId: input.gateId, task: input.task,
    runId: context.contract.lease.attempt.runId, attempt: context.contract.lease.attempt.attemptNumber,
    suiteEvidence: gateDecisionEvidence(decision),
  };
  // Invocation failures retain the core's external-effect reconciliation policy.
  const response = await context.invoke('runtime.dispatch', {
    operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
    payload: buildRequest(agent, judgedInput),
  });
  let verdict;
  try { verdict = parseVerdict(response.result, judgedInput); }
  catch (error) {
    return { schemaVersion: 'stage-result.v2', outcome: 'blocked', artifacts,
      reason: { code: 'buster_quality.invalid_verdict', message: error instanceof Error ? error.message : String(error) } };
  }
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `buster-quality:${input.gateId}:${judgedInput.attempt}` },
    payload: { namespace: 'kubeclaw.buster-quality-gate', mediaType: 'application/json', value: { verdict, sourceRevision, decisionDigest: decision.decisionDigest, suiteEvidence: judgedInput.suiteEvidence } },
  });
  artifacts.push(stored.artifact as ArtifactRef);
  if (verdict.outcome === 'passed') return { ...nativeResult, artifacts };
  return { schemaVersion: 'stage-result.v2', outcome: verdict.outcome, artifacts,
    reason: { code: `buster_quality.${verdict.failureClass}`, message: verdict.summary, details: { findings: verdict.findings, decisionDigest: decision.decisionDigest } } };
}
