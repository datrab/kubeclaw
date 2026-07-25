import { selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { onGateFail } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
import { readGateRemediationSpec } from '../services/remediation-handoff.ts';
import { emitGateRetryExhausted } from '../services/rate-limit.ts';
import { GATE_CONTROL_ACTIONS, buildTypedGateControlResult, cloneSerializable } from '../services/contracts/gate-control-result.ts';
import { arrayValue, objectRecord, selectPresent } from '../value-boundary.ts';
import { buildBusterIssueFindings } from './buster-gate-control.ts';

interface ExhaustedCallbacks {
  gateType: (gate: any) => any;
  gateStartedAtAuthority: (opts: any, remediation: any) => number;
  gateMaxFixCyclesAuthority: (remediation: any, metadata: any, defaults: any) => number;
  telemetryCtx: (config: any, deps?: any) => any;
}

export async function buildBusterRemediationExhaustedControlResult(
  config: any,
  gateId: any,
  gate: any,
  controlResult: any,
  opts: any,
  callbacks: ExhaustedCallbacks,
) {
  const remediation = objectRecord(readGateRemediationSpec(controlResult));
  const metadata = objectRecord(controlResult?.diagnostics?.metadata);
  const gateStartedAt = callbacks.gateStartedAtAuthority(opts, remediation);
  const maxFixCycles = callbacks.gateMaxFixCyclesAuthority(remediation, metadata, getPipelineDefaultsConfig(config));
  const issues = arrayValue(selectPresent(remediation?.diagnostics?.issues, metadata?.remaining_issues));
  const latestGateDispatchId = selectTruthyValue(() => remediation?.correlation?.dispatch_id, () => metadata?.dispatch_id, () => null);
  const latestGateGatewayLabel = selectTruthyValue(() => remediation?.correlation?.gateway_label, () => metadata?.gateway_label, () => null);
  const latestGateSessionKey = selectTruthyValue(() => remediation?.correlation?.session_key, () => metadata?.session_key, () => null);
  const failReason = selectPresent(issues.map((issue: any = {}) => issue.title).filter(Boolean).join('; '), 'missing_error_detail');
  const context = { config, gateId, gate, opts, gateStartedAt, maxFixCycles, issues, failReason, latestGateDispatchId, latestGateGatewayLabel, latestGateSessionKey };
  log('ERROR', `Gate '${gateId}' fix loop exhausted (${maxFixCycles} attempts)`);
  getRunStats(config).gates_failed.push(gateId);
  await emitBusterRemediationExhausted(context, callbacks.telemetryCtx);
  return buildBusterRemediationExhaustedResult(context, callbacks.gateType);
}

async function emitBusterRemediationExhausted(context: any, telemetryCtx: ExhaustedCallbacks['telemetryCtx']) {
  const { config, gateId, gate, opts, gateStartedAt, maxFixCycles, issues, failReason, latestGateDispatchId, latestGateGatewayLabel, latestGateSessionKey } = context;
  await onGateFail(telemetryCtx(config, opts.deps), gateId, {
    gate_type: gate.type,
    issues_count: issues.length,
    fix_cycle: maxFixCycles,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason: `Fix loop exhausted after ${maxFixCycles} attempts`,
    dispatch_id: latestGateDispatchId,
    session_key: latestGateSessionKey,
    presentation: { discord: { level: 'CRITICAL', title: `Gate '${gateId}' BLOCKED`, description: `Fix loop exhausted after ${maxFixCycles} attempts. Issues: ${failReason}`, fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: maxFixCycles, dispatch_id: latestGateDispatchId, gateway_label: latestGateGatewayLabel, session_key: latestGateSessionKey }) } },
  });
  emitGateRetryExhausted(telemetryCtx(config, opts.deps), gateId, { gateType: gate.type, phase: 'buster_gate_fix', attempt: maxFixCycles, maxAttempts: maxFixCycles, reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`, sessionKey: latestGateSessionKey, dispatchId: latestGateDispatchId, gatewayLabel: latestGateGatewayLabel });
}

function buildBusterRemediationExhaustedResult(context: any, gateType: ExhaustedCallbacks['gateType']) {
  const { config, gateId, gate, maxFixCycles, issues, latestGateDispatchId, latestGateGatewayLabel, latestGateSessionKey } = context;
  return buildTypedGateControlResult({
    producerType: 'buster', nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'code',
    summary: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
    findings: buildBusterIssueFindings(issues),
    metadata: { gate_id: gateId, gate_type: gateType(gate), run_id: selectTruthyValue(() => getRunId(config), () => config?._runId, () => config?.run_id, () => null), gate: gateId, reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`, failure_class: 'fix_loop_exhausted', fix_attempts: maxFixCycles, remaining_issues: cloneSerializable(issues), dispatch_id: latestGateDispatchId, gateway_label: latestGateGatewayLabel, session_key: latestGateSessionKey },
    gateRunStatus: STATUS.FAIL, outcomeClass: 'needs_nova', recommendation: 'stop',
    metrics: { fix_attempts: maxFixCycles, issues_count: Array.isArray(issues) ? issues.length : 0 },
  });
}
