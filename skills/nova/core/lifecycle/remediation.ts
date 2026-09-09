import type { StageDefinition, StageResult } from '@kubeclaw/plugin-sdk';
import type { StageRuntimeState } from './reducer.ts';

export interface RepairRequest {
  readonly schemaVersion: 'repair-request.v1';
  readonly requesterStageId: string;
  readonly targetStageId: string;
  readonly generation: number;
  readonly requesterResult: StageResult;
  readonly invalidatedStageIds: readonly string[];
}

export function repairRequest(stages: readonly StageDefinition[], requester: string, target: string,
  generation: number, result: StageResult): RepairRequest {
  const affected = new Set<string>([requester]);
  const pending = [target];
  while (pending.length) {
    const parent = pending.pop()!;
    for (const stage of stages) {
      if (stage.id !== target && stage.dependsOn.includes(parent) && !affected.has(stage.id)) {
        affected.add(stage.id); pending.push(stage.id);
      }
    }
  }
  // The requester may already have been added; still traverse its descendants.
  pending.push(requester);
  while (pending.length) {
    const parent = pending.pop()!;
    for (const stage of stages) if (stage.id !== target && stage.dependsOn.includes(parent) && !affected.has(stage.id)) {
      affected.add(stage.id); pending.push(stage.id);
    }
  }
  return { schemaVersion: 'repair-request.v1', requesterStageId: requester, targetStageId: target,
    generation, requesterResult: structuredClone(result), invalidatedStageIds: [...affected].sort() };
}

/** Applied identically during live recording and replay of the durable request. */
export function applyRepair(states: Map<string, StageRuntimeState>, request: RepairRequest): void {
  const target = states.get(request.targetStageId);
  if (!target) throw new Error('REPAIR_TARGET_MISSING');
  if (target.remediationReturnTo && target.remediationReturnTo !== request.requesterStageId) throw new Error('REPAIR_TARGET_BUSY');
  for (const id of request.invalidatedStageIds) {
    const old = states.get(id);
    if (!old) throw new Error(`REPAIR_DEPENDENCY_MISSING:${id}`);
    const { facts: _facts, wait: _wait, retryAt: _retry, continuationGuidance: _guidance, remediationTarget: _target, remediationReturnTo: _return, ...state } = old;
    states.set(id, { ...state, status: id === request.requesterStageId ? 'waiting' : 'pending',
      ...(id === request.requesterStageId ? { remediationTarget: request.targetStageId } : {}) });
  }
  const { facts: _facts, wait: _wait, retryAt: _retry, continuationGuidance: _guidance,
    remediationTarget: _target, remediationReturnTo: _return, ...withoutDecision } = target;
  states.set(request.targetStageId, { ...withoutDecision, status: 'pending',
    remediationReturnTo: request.requesterStageId, continuationGuidance: { repairRequest: request } });
}
