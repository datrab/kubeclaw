import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { recordApprovalGateOutcome } from '../services/governance-context.ts';
import { onApprovalResolved, onGatePass, onGateFail } from '../services/telemetry.ts';

export function approvalGateType(gate: any, gateId: any) {
  if (selectTruthyValue(() => typeof gate?.type !== 'string', () => !gate.type.trim())) throw new Error(`approval gate '${gateId}' requires progress.gates.${gateId}.type`);
  return gate.type.trim();
}
export function approvalStatusValue(state: any) { return String(selectDefinedValue(() => state?.status, () => '')).trim().toUpperCase(); }
export function optionalApprovalText(value: any) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
export function approvalTextOrReason(value: any, missingReason: any) { return selectDefinedValue(() => optionalApprovalText(value), () => missingReason); }
export function approvalRunId(config: any, state: any = null) { return selectDefinedValue(() => optionalApprovalText(state?.run_id), () => optionalApprovalText(config._runId), () => optionalApprovalText(config.run_id), () => null); }
export function requireApprovalRunId(config: any, gateId: any) { const runId = approvalRunId(config); if (!runId) throw new Error(`approval gate '${gateId}' requires config._runId or config.run_id`); return runId; }
export function approvalDecisionVia(state: any) { return optionalApprovalText(state?.decision_via); }
export function emitApprovalGateVerdict(config: any, gateId: any, gate: any, verdict: any, reason: any = null, options: any = {}) {
  const payload = { gate_type: approvalGateType(gate, gateId), duration_seconds: null, reason, presentation: selectDefinedValue(() => options.presentation, () => ({})) };
  if (verdict === 'PASS') onGatePass({ config }, gateId, payload); else onGateFail({ config }, gateId, payload);
}
export function replayResolvedApprovalTelemetry(config: any, gateId: any, gate: any, state: any, { verdict, fallbackReason = null }: any = {}) {
  const gateType = approvalGateType(gate, gateId);
  const resolutionStatus = optionalApprovalText(approvalStatusValue(state));
  const resolvedBy = optionalApprovalText(state?.decision_by);
  const reason = selectDefinedValue(() => optionalApprovalText(state?.reason), () => fallbackReason);
  recordApprovalGateOutcome(config, gateId, gate?.title, resolutionStatus, resolvedBy, reason, { gate_type: gateType, run_id: approvalRunId(config, state), project: optionalApprovalText(config.project), decision_via: approvalDecisionVia(state), timeout_policy: selectDefinedValue(() => state?.timeout_policy, () => null), continued: state?.continued });
  onApprovalResolved({ config }, gateId, resolutionStatus, resolvedBy, { gate_type: gateType });
  emitApprovalGateVerdict(config, gateId, gate, verdict, reason);
}
