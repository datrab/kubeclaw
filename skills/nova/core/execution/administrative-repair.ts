import type { AdministrativeReopenDecision, LifecycleEvent, PipelineDefinition, PluginDomainEvent, StageResult } from '@kubeclaw/plugin-sdk';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { repairRequest, type RepairRequest } from '../lifecycle/remediation.ts';
import type { FileJournal } from '../state/journal.ts';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import { pendingRepair, repairDisposition, repairOrder } from '../lifecycle/repair-budget.ts';

/** The authorized repair carries the original durable findings, not a synthetic pass. */
export function administrativeRepairRequest(definition: PipelineDefinition, decision: AdministrativeReopenDecision,
  events: FileJournal<LifecycleEvent | PluginDomainEvent>, generation: number, states?: ReadonlyMap<string, StageRuntimeState>): RepairRequest {
  if (decision.continuation !== 'remediation') throw new Error('ADMIN_REMEDIATION_DECISION_REQUIRED');
  const completion = [...events.records()].reverse().find(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2'
    && entry.identity.runId === decision.runId && entry.identity.stageId === decision.stageId
    && ['attempt.completed', 'attempt.cancelled', 'attempt.timed_out'].includes(entry.type));
  const result = completion?.entry.payload.result;
  if (!result) throw new Error(`ADMIN_REMEDIATION_EVIDENCE_MISSING:${decision.stageId}`);
  validateContractValue('stageResult', result);
  const stage = definition.stages.find(candidate => candidate.id === decision.stageId)!;
  if (stage.execution.repairCategory) {
    const current = states?.get(stage.id);
    if (!current) throw new Error('ADMIN_REPAIR_STATE_REQUIRED');
    const pending = pendingRepair(definition.stages, states!, stage, { ...current, remediationCyclesUsed: generation }, result as StageResult, decision.runId);
    if (repairDisposition(definition.stages, pending) !== 'allowed') throw new Error('ADMIN_REPAIR_BUDGET_EXHAUSTED');
    return { ...pending.request, budgetOrder: repairOrder(pending, current.attemptNumber) };
  }
  return repairRequest(definition.stages, decision.stageId, decision.remediationStageId, generation, result as StageResult);
}
