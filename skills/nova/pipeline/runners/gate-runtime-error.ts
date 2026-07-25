import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { log, getActiveContext } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { onGateFail, onGateStarted } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { PIPELINE_STEP_ACTIONS, PIPELINE_STEP_OUTCOMES, PIPELINE_STEP_TYPES, buildPipelineStepResult } from '../services/contracts/pipeline-step-result.ts';
import { PIPELINE_TERMINAL_ACTIONS, PIPELINE_TERMINAL_SCOPES } from '../services/contracts/terminal-decision.ts';

type AnyRecord = Record<string, any>;

export function activeGateRunnerContext(config: any) {
  return selectTruthyValue(() => getActiveContext(), () => ({ config, stats: { errors: [] } }));
}

function buildGateStepCorrelation(config: any, gateId: any, gateOrIdentity: any = {}) {
  return { run_id: selectTruthyValue(() => config?._runId, () => config?.run_id, () => getRunId(config), () => null), gate_id: gateId, gate_type: selectTruthyValue(() => gateOrIdentity?.type, () => gateOrIdentity?.gate_type, () => gateOrIdentity?.gateType, () => null) };
}

function gateRuntimeTitle(gateOrIdentity: any, gateId: any) {
  if (typeof gateOrIdentity?.title === 'string' && gateOrIdentity.title.trim()) return gateOrIdentity.title.trim();
  if (typeof gateId === 'string' && gateId.trim()) return gateId.trim();
  throw new Error('Gate runtime error control requires gate title or gate id');
}

function isTimeoutError(error: any) {
  return /\btimeout\b|timed? out/i.test([error?.code, error?.name, error?.message].filter(Boolean).join(' '));
}

export async function buildGateRuntimeErrorControl(config: any, ctx: any, gateId: any, gateOrIdentity: any = {}, options: AnyRecord = {}) {
  const { reason, diagnostics, titlePrefix, emitStarted, reviewers }: AnyRecord = { diagnostics: {}, titlePrefix: 'Gate Execution Failed', emitStarted: false, reviewers: null, ...options };
  const gateType = selectTruthyValue(() => gateOrIdentity?.type, () => gateOrIdentity?.gate_type, () => gateOrIdentity?.gateType, () => null);
  const title = gateRuntimeTitle(gateOrIdentity, gateId);
  if (emitStarted === true) await onGateStarted(ctx, gateId, { title, type: gateType, reviewers });
  onGateFail(ctx, gateId, { gate_type: gateType, reason, presentation: { discord: { level: 'CRITICAL', title: `${titlePrefix}: ${title}`, description: reason, fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_DISPATCH, { run_id: selectTruthyValue(() => config?._runId, () => config?.run_id, () => 'missing_run_id'), gate_id: gateId, gate_type: gateType }) } } });
  const timedOut = diagnostics?.timed_out === true;
  return buildPipelineStepResult({ stepType: PIPELINE_STEP_TYPES.GATE, stepId: gateId, nextAction: PIPELINE_STEP_ACTIONS.HALT, outcome: timedOut ? PIPELINE_STEP_OUTCOMES.TIMEOUT : PIPELINE_STEP_OUTCOMES.ERROR, issueType: 'environment', reason, diagnostics, correlation: buildGateStepCorrelation(config, gateId, gateOrIdentity), terminalAction: timedOut ? PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF : PIPELINE_TERMINAL_ACTIONS.STOP, terminalScope: PIPELINE_TERMINAL_SCOPES.GATE, terminalReasonCode: timedOut ? 'timeout' : diagnostics?.contract_invalid === true ? 'gate_control_result_invalid' : 'gate_execution_error', terminalSource: 'gate_runner', terminalMetadata: diagnostics });
}

export function buildGateExecutionErrorControl(config: any, ctx: any, gateId: any, gate: any, label: any, error: any, { emitStarted = true }: any = {}) {
  const gateLabel = selectDefinedValue(() => label, () => gate?.type, () => 'Gate');
  const reason = `${gateLabel} gate execution failed: ${error.message}`;
  log('ERROR', reason);
  return buildGateRuntimeErrorControl(config, ctx, gateId, gate, { reason, diagnostics: { ...(error?.diagnostics ? { contract_invalid: true, contract_diagnostic: error.diagnostics } : {}), ...(isTimeoutError(error) ? { timed_out: true } : {}) }, emitStarted, reviewers: Array.isArray(gate?.reviewers) ? gate.reviewers : null });
}
