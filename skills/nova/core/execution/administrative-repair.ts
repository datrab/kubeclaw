import type { AdministrativeReopenDecision, LifecycleEvent, PipelineDefinition, PluginDomainEvent, StageResult } from '@kubeclaw/plugin-sdk';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { repairRequest, type RepairRequest } from '../lifecycle/remediation.ts';
import type { FileJournal } from '../state/journal.ts';

/** The authorized repair carries the original durable findings, not a synthetic pass. */
export function administrativeRepairRequest(definition: PipelineDefinition, decision: AdministrativeReopenDecision,
  events: FileJournal<LifecycleEvent | PluginDomainEvent>, generation: number): RepairRequest {
  if (decision.continuation !== 'remediation') throw new Error('ADMIN_REMEDIATION_DECISION_REQUIRED');
  const completion = [...events.records()].reverse().find(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2'
    && entry.identity.runId === decision.runId && entry.identity.stageId === decision.stageId
    && ['attempt.completed', 'attempt.cancelled', 'attempt.timed_out'].includes(entry.type));
  const result = completion?.entry.payload.result;
  if (!result) throw new Error(`ADMIN_REMEDIATION_EVIDENCE_MISSING:${decision.stageId}`);
  validateContractValue('stageResult', result);
  return repairRequest(definition.stages, decision.stageId, decision.remediationStageId, generation, result as StageResult);
}
