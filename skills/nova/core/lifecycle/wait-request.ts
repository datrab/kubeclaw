import { canonicalJson, sha256Text, type WaitRequest } from '@kubeclaw/plugin-sdk';
import type { LifecycleDecision } from './reducer.ts';

/** Live decisions and completed-attempt replay must name the same wait. */
export function decisionWait(decision: LifecycleDecision, runId: string, issuer: string): WaitRequest | undefined {
  const action = decision.action;
  if (action.type === 'persist_wait') return action.wait;
  if (action.type !== 'pause_for_orchestrator' && action.type !== 'request_orchestrator') return undefined;
  const request = action.type === 'request_orchestrator' ? { afterAttempt: action.afterAttempt } : action.wait.request;
  const identity = canonicalJson([runId, decision.state.stageId, decision.state.attemptNumber]);
  return {
    schemaVersion: 'wait-request.v2',
    waitId: `wait:orchestrator:${sha256Text(identity).slice('sha256:'.length)}`,
    kind: 'orchestrator', signalType: 'core.orchestrator.resume',
    authorizedIssuer: { type: 'orchestrator', id: issuer }, expiresAt: null,
    ...(request ? { request } : {}),
  };
}
