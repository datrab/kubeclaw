import { log } from '../core/logger.ts';
import { recordApprovalGateOutcome } from '../services/governance-context.ts';
import { onApprovalResolved } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { APPROVAL_STATUS, APPROVAL_TIMEOUT_POLICY, resolveApprovalTimeoutPolicyFromState } from './approval-gate-shared.ts';
import { buildApprovalGateControlResult } from './approval-gate-control.ts';
import { approvalDecisionVia, approvalGateType, approvalRunId, emitApprovalGateVerdict, optionalApprovalText } from './approval-gate-telemetry.ts';

export async function resolveApprovalTimeout(config: any, gateId: any, gate: any, state: any, _timeoutPolicy: any, _deps: any) {
  const timeoutPolicy = resolveApprovalTimeoutPolicyFromState(state, gateId);
  const gateType = approvalGateType(gate, gateId);
  const reason = `No decision received within ${state.timeout_minutes} minutes`;
  recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.TIMED_OUT, null, reason, { gate_type: gateType, run_id: approvalRunId(config, state), project: optionalApprovalText(config.project), decision_via: approvalDecisionVia(state) ?? 'timeout', timeout_policy: timeoutPolicy, continued: timeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE });
  onApprovalResolved({ config }, gateId, APPROVAL_STATUS.TIMED_OUT, null, { gate_type: gateType });
  if (timeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE) return resolveContinue(config, gateId, gate, state, gateType);
  return resolveBlock(config, gateId, gate, state, gateType);
}

function resolveContinue(config: any, gateId: any, gate: any, state: any, gateType: any) {
  emitApprovalGateVerdict(config, gateId, gate, 'PASS', `Approval timed out after ${state.timeout_minutes} minutes; auto-continued`, { presentation: { discord: { level: 'WARN', title: `Approval Timeout (auto-continue): ${gate.title}`, description: `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Configured to auto-continue.`, action: 'continue', next_action: 'continue', fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: state.run_id, gate_id: gateId, gate_type: gateType }, [{ name: 'Gate ID', value: gateId }, { name: 'Policy', value: APPROVAL_TIMEOUT_POLICY.CONTINUE }, { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` }]) } } });
  log('WARN', `Approval gate '${gateId}' timed out — timeout_policy=${APPROVAL_TIMEOUT_POLICY.CONTINUE}, proceeding`);
  return buildApprovalGateControlResult(config, gateId, gate, { status: APPROVAL_STATUS.TIMED_OUT, outcome_class: 'passed', timed_out: true, continued: true, gate_id: gateId }, { approvalState: state });
}

function resolveBlock(config: any, gateId: any, gate: any, state: any, gateType: any) {
  emitApprovalGateVerdict(config, gateId, gate, 'FAIL', `Approval timed out after ${state.timeout_minutes} minutes`, { presentation: { discord: { level: 'CRITICAL', title: `Approval Timeout (blocked): ${gate.title}`, description: `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Pipeline halted — operator approval required.`, fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: state.run_id, gate_id: gateId, gate_type: gateType }, [{ name: 'Gate ID', value: gateId }, { name: 'Policy', value: APPROVAL_TIMEOUT_POLICY.BLOCK }, { name: 'To Approve', value: `\`APPROVE gate:${gateId}\`` }, { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` }]) } } });
  log('ERROR', `Approval gate '${gateId}' timed out — timeout_policy=${APPROVAL_TIMEOUT_POLICY.BLOCK}, halting pipeline`);
  return buildApprovalGateControlResult(config, gateId, gate, { status: APPROVAL_STATUS.TIMED_OUT, outcome_class: 'needs_nova', reason: `Approval gate '${gateId}' timed out after ${state.timeout_minutes} minutes`, gate_id: gateId, timed_out: true }, { approvalState: state });
}
