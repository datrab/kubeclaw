import { canonicalJson, type ResumeSignal, type StageDefinition } from '@kubeclaw/plugin-sdk';
import type { StageRuntimeState } from './reducer.ts';
import { repairDisposition, repairOrder } from './repair-budget.ts';
import type { RepairRequest } from './remediation.ts';

function authorizationReason(signal: ResumeSignal, digest: string): string {
  const value = signal.payload.repairAuthorization;
  if (Object.keys(signal.payload).length !== 1 || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('REPAIR_AUTHORIZATION_INVALID');
  const authorization = value as Record<string, unknown>;
  if (Object.keys(authorization).sort().join(',') !== 'pendingDigest,reason'
    || authorization.pendingDigest !== digest || typeof authorization.reason !== 'string'
    || !authorization.reason.trim() || authorization.reason.length > 8192) throw new Error('REPAIR_AUTHORIZATION_INVALID');
  return authorization.reason;
}

/** Validate before recording the signal; replay derives the same order from it. */
export function authorizedRepair(
  stages: readonly StageDefinition[], states: ReadonlyMap<string, StageRuntimeState>,
  waiting: StageRuntimeState, signal: ResumeSignal,
): RepairRequest | undefined {
  const pending = waiting.pendingRepair;
  if (!pending) return undefined;
  const reason = authorizationReason(signal, pending.digest);
  if (canonicalJson(states.get(pending.request.targetStageId)?.repairLedger ?? []) !== canonicalJson(pending.history)) throw new Error('REPAIR_AUTHORIZATION_STALE');
  if (repairDisposition(stages, pending) !== 'authorize') throw new Error('REPAIR_AUTHORIZATION_EXHAUSTED');
  if (signal.signalType !== 'core.orchestrator.resume' || signal.issuer.type !== 'orchestrator'
    || waiting.wait?.waitId !== signal.waitId || waiting.wait.authorizedIssuer.id !== signal.issuer.id) throw new Error('REPAIR_AUTHORIZATION_ISSUER_INVALID');
  return { ...pending.request, budgetOrder: { ...repairOrder(pending, waiting.attemptNumber),
    authorization: { signalId: signal.signalId, reason } } };
}
