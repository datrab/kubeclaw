import { canonicalJson, portableJson, sha256Text, type PORTABLE_JSON_ENCODING, type StageDefinition, type StageResult } from '@kubeclaw/plugin-sdk';
import { reconcileRepairProjection, type RepairIdentityContext } from './repair-projection.ts';
import { repairRequest, type RepairRequest } from './remediation.ts';
import type { LifecycleDecision, StageRuntimeState } from './reducer.ts';

export interface RepairOrder {
  readonly repairIdentityEncoding?: typeof PORTABLE_JSON_ENCODING;
  readonly id: string;
  readonly category: string;
  readonly requesterStageId: string;
  readonly requesterAttempt: number;
  readonly requestDigest: string;
  readonly request: RepairRequest;
  readonly sourceFacts: Readonly<Record<string, string | number | boolean | null>>;
  readonly authorization?: Readonly<{ signalId: string; reason: string }>;
}

export interface PendingRepair {
  readonly repairIdentityEncoding?: typeof PORTABLE_JSON_ENCODING;
  readonly digest: string;
  readonly category: string;
  readonly request: RepairRequest;
  readonly history: readonly RepairOrder[];
  readonly sourceFacts: Readonly<Record<string, string | number | boolean | null>>;
}

export function repairOrder(pending: PendingRepair, attempt: number): RepairOrder {
  return { ...(pending.repairIdentityEncoding ? { repairIdentityEncoding: pending.repairIdentityEncoding } : {}),
    id: pending.digest, category: pending.category, requesterStageId: pending.request.requesterStageId,
    requesterAttempt: attempt, requestDigest: pending.digest, request: pending.request, sourceFacts: pending.sourceFacts };
}

export function pendingRepair(
  stages: readonly StageDefinition[], states: ReadonlyMap<string, StageRuntimeState>,
  requester: StageDefinition, state: StageRuntimeState, result: StageResult, runId: string,
  repairIdentityEncoding?: typeof PORTABLE_JSON_ENCODING,
): PendingRepair {
  const target = requester.on!.request_fix!;
  const request = repairRequest(stages, requester.id, target, state.remediationCyclesUsed, result);
  const category = requester.execution.repairCategory!;
  const history = states.get(target)?.repairLedger ?? [];
  const sourceFacts = states.get(target)?.facts ?? {};
  const identity = { ...(repairIdentityEncoding ? { repairIdentityEncoding } : {}), category, request, history, sourceFacts };
  const serialize = repairIdentityEncoding ? portableJson : canonicalJson;
  return { digest: sha256Text(serialize({ runId, ...identity })), ...identity };
}

export function repairDisposition(stages: readonly StageDefinition[], pending: PendingRepair): 'allowed' | 'authorize' | 'blocked' {
  const policy = stages.find(stage => stage.id === pending.request.targetStageId)?.execution.repairBudget;
  if (!policy || policy.categories[pending.category] === undefined) throw new Error('REPAIR_BUDGET_UNDECLARED');
  const authorized = pending.history.filter(order => order.authorization).length;
  // Once an extra order was issued, any later repair requires operator action.
  if (authorized > 0) return 'blocked';
  if (pending.history.filter(order => order.category === pending.category).length < policy.categories[pending.category]!) return 'allowed';
  return authorized < policy.maximumOrchestratorOrders ? 'authorize' : 'blocked';
}

/** The same policy projects an original completion in live execution and replay. */
export function budgetedRepairDecision(
  stages: readonly StageDefinition[], states: ReadonlyMap<string, StageRuntimeState>, requester: StageDefinition,
  decision: LifecycleDecision, result: StageResult, runId: string,
  identity: RepairIdentityContext = {},
): LifecycleDecision {
  const owner = requester.execution.repairBudget ? requester.id : requester.on?.request_fix;
  if (decision.state.status === 'failed' && owner
    && states.get(owner)?.repairLedger?.some(order => order.authorization)) {
    return { state: { ...decision.state, status: 'blocked' }, action: { type: 'stop' } };
  }
  if (!requester.execution.repairCategory || decision.action.type !== 'schedule_remediation') return decision;
  const calculated = pendingRepair(stages, states, requester, decision.state, result, runId, identity.encoding);
  const disposition = repairDisposition(stages, calculated);
  const pending = reconcileRepairProjection(calculated, identity, decision.state.attemptNumber, disposition);
  if (disposition === 'allowed') return { ...decision, action: { ...decision.action,
    repairRequest: { ...pending.request, budgetOrder: repairOrder(pending, decision.state.attemptNumber) } } };
  const { remediationTarget: _target, ...withoutTarget } = decision.state;
  return { state: { ...withoutTarget, status: disposition === 'authorize' ? 'waiting' : 'blocked', pendingRepair: pending },
    action: disposition === 'authorize' ? { type: 'request_repair_authorization', pending } : { type: 'stop' } };
}

export function recordRepairOrder(states: Map<string, StageRuntimeState>, request: RepairRequest): void {
  if (!request.budgetOrder) return;
  const target = states.get(request.targetStageId)!;
  const ledger = target.repairLedger ?? [];
  const existing = ledger.find(order => order.id === request.budgetOrder!.id);
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(request.budgetOrder)) throw new Error('REPAIR_ORDER_IDENTITY_CONFLICT');
    return;
  }
  states.set(request.targetStageId, { ...target, repairLedger: [...ledger, request.budgetOrder] });
}
