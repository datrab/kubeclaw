import { selectDefinedValue } from '../optional-absence.ts';
import { buildGovernanceEmbedFields } from '../services/governance-context.ts';
import { isApprovalTimeoutContinue, normalizeApprovalGateState } from './approval-gate-shared.ts';

function optionalApprovalText(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function approvalGateDescription(gate: any, gateId: any) {
  return selectDefinedValue(() => optionalApprovalText(gate.description), () => `Pipeline paused at approval gate \`${gateId}\`. Explicit operator decision required to continue.`);
}

export function buildApprovalEmbed(config: any, gateId: any, gate: any, rawState: any, progress: any) {
  const state: any = normalizeApprovalGateState(rawState);
  const deadline = state.deadline ? new Date(state.deadline).toUTCString() : 'approval_deadline_missing';
  const timeoutNote = isApprovalTimeoutContinue(state.timeout_policy)
    ? `AUTO-CONTINUE after ${state.timeout_minutes}min`
    : `BLOCK after ${state.timeout_minutes}min`;
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const gateIndex = executionOrder.indexOf(`gate:${gateId}`);
  const completed = gateIndex > 0 ? executionOrder.slice(0, gateIndex).filter((step: any) => !step.startsWith('gate:')) : [];
  const remaining = gateIndex >= 0 ? executionOrder.slice(gateIndex + 1).filter((step: any) => !step.startsWith('gate:')) : [];
  const completedSummary = completed.length > 0
    ? completed.slice(-3).join(', ') + (completed.length > 3 ? ` (+${completed.length - 3} earlier)` : '')
    : 'none';
  const remainingSummary = remaining.length > 0
    ? remaining.slice(0, 3).join(', ') + (remaining.length > 3 ? ` (+${remaining.length - 3} more)` : '')
    : 'none (gate is near end of pipeline)';
  return {
    description: approvalGateDescription(gate, gateId),
    fields: [
      { name: 'Gate', value: `\`${gateId}\` — ${gate.title}`, inline: false },
      { name: 'Project', value: selectDefinedValue(() => optionalApprovalText(state.project), () => optionalApprovalText(config.project), () => 'project_missing'), inline: true },
      { name: 'Run ID', value: selectDefinedValue(() => optionalApprovalText(state.run_id), () => 'recovery_target_id_missing'), inline: true },
      { name: 'Deadline', value: deadline, inline: false },
      { name: 'On Timeout', value: timeoutNote, inline: true },
      { name: 'Completed Steps', value: completedSummary, inline: false },
      { name: 'Remaining Steps', value: remainingSummary, inline: false },
      ...buildGovernanceEmbedFields(config),
      { name: 'To Approve', value: `\`APPROVE gate:${gateId}\``, inline: true },
      { name: 'To Reject', value: `\`REJECT gate:${gateId} reason: ...\``, inline: true },
      { name: 'Artifacts', value: `\`.swarm/logs/gates/${gateId}/\``, inline: false },
    ],
  };
}
