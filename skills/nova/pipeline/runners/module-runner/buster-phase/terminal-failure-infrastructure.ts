import { STATUS } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { transitionModuleStatus } from '../../../lifecycle-state.ts';
import { resolveResultDispatchId, resolveResultGatewayLabel, resolveResultSessionKey } from '../../../services/correlation.ts';
import { buildTerminalBusterCrashFailEvent, emitTerminalBusterCrashTelemetry, emitTerminalModuleFailTelemetry } from '../../module-runner-shared.ts';
import { applyModuleRunnerCompletion } from '../completions.ts';
import { buildModuleBlockedTerminalResult, buildModuleErrorTerminalResult } from '../terminal-results.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function required(value: unknown, field: string): string {
  const normalized = text(value);
  if (!normalized) throw new Error(`Buster terminal failure requires ${field}`);
  return normalized;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return null;
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function resultIdentity(context: AnyRecord) {
  const { resultRedisEntry, completionIdentity, terminalSessionKey } = context;
  const resultDispatchId = text(resolveResultDispatchId(resultRedisEntry));
  const resultGatewayLabel = text(resolveResultGatewayLabel(resultRedisEntry));
  return {
    dispatchId: required(firstText(resultDispatchId, completionIdentity.dispatchId, completionIdentity.dispatch_id), 'output artifact failure dispatch id'),
    gatewayLabel: required(firstText(resultGatewayLabel, completionIdentity.gateway_label, completionIdentity.gatewayLabel), 'output artifact failure gateway label'),
    sessionKey: firstText(resolveResultSessionKey(resultRedisEntry), terminalSessionKey, completionIdentity.sessionKey, completionIdentity.session_key),
    authority: resultDispatchId && resultGatewayLabel ? 'redis_result' : 'completion_identity',
  };
}

function outputFailureDetails(failureClass: string) {
  if (failureClass === 'output_file_missing') return {
    label: 'Buster output_file missing',
    action: 'Inspect why Buster did not write buster-output.json, then resume Buster.',
    description: 'This is a Buster/runtime output artifact failure, not an app-code verdict. Forge output preserved.',
  };
  return {
    label: 'Buster output_file identity mismatch',
    action: 'Inspect Buster output_file identity/correlation state, then resume Buster.',
    description: 'This is an infrastructure/correlation failure, not an app-code verdict. Forge output preserved.',
  };
}

export async function handleOutputArtifactTerminalFailure(context: AnyRecord) {
  const { config, moduleId, mod, dir, status, deps, resultRedisEntry, completionIdentity, failureClass, source, runId, attempt, busterModel, statusName } = context;
  const identity = resultIdentity(context);
  const details = outputFailureDetails(failureClass);
  const reason = firstText(resultRedisEntry?.summary, status?.completion_summary, details.label);
  log('ERROR', `Module ${moduleId}: ${reason} — completion contract failure, not routing to Forge`);
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId, phase: 'buster', attempt, completionStatus: 'ERROR',
    authority: { kind: 'redis', dispatch_id: identity.dispatchId }, reasonCode: failureClass,
    summary: `${reason}. Completion contract failure — Forge cannot fix Buster output artifact failures.`,
    dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { failure_class: failureClass, redis_source: source, identity_authority: identity.authority },
  });
  const correlation = { run_id: runId, module_id: moduleId, attempt, dispatch_id: identity.dispatchId, gateway_label: identity.gatewayLabel, session_key: identity.sessionKey };
  await deps.discord(config, 'CRITICAL', `Module ${moduleId} FAILED — ${details.label}`, `${reason}. ${details.description}`, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
      ...correlation, model: completionIdentity.model ?? null, model_source: completionIdentity.model_source ?? null,
      reasoning_level: completionIdentity.reasoning_level ?? null, thinking_source: completionIdentity.thinking_source ?? null,
      runtime: completionIdentity.runtime ?? null,
    }),
    { name: 'Action', value: details.action, inline: false },
  ], { correlation });
  emitTerminalModuleFailTelemetry({ config, moduleId, status, mod, phase: 'buster', model: busterModel, oldStatus: statusName, reason: `${details.label} — Forge output preserved: ${reason}`, correlation: { dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey } });
  return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
    reason: `${details.label} — completion contract failure (not sent to Forge)`, issueType: 'environment',
    runId, moduleDir: dir, attempt, phase: 'buster', dispatchId: identity.dispatchId,
    gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { failure_class: failureClass, redis_source: source, identity_authority: identity.authority, forge_preserved: true, output_file_reason: firstDefined(resultRedisEntry?.reason, status?.reason) },
  }) };
}

export async function handleInfraTerminalFailure(context: AnyRecord) {
  const { config, moduleId, mod, dir, status, deps, resultRedisEntry, completionIdentity, source, runId, attempt, busterModel, statusName, completionGatewayLabel, terminalSessionKey } = context;
  const dispatchId = required(resolveResultDispatchId(resultRedisEntry), 'Buster infra result dispatch id');
  const gatewayLabel = text(resolveResultGatewayLabel(resultRedisEntry)) ?? completionGatewayLabel;
  const sessionKey = text(resolveResultSessionKey(resultRedisEntry)) ?? terminalSessionKey;
  const reason = firstText(resultRedisEntry?.summary, status?.completion_summary, 'Buster infrastructure failure');
  log('ERROR', `Module ${moduleId}: ${reason} — Buster infrastructure issue, not routing to Forge`);
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId, phase: 'buster', attempt, completionStatus: 'BLOCKED',
    authority: { kind: 'redis', dispatch_id: dispatchId }, reasonCode: 'infra_error',
    summary: `${reason}. Infrastructure issue — Forge cannot fix this.`, dispatchId, gatewayLabel, sessionKey,
    metadata: { failure_class: 'infra_error', redis_source: source, forge_preserved: true },
  });
  const correlation = { run_id: runId, module_id: moduleId, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey };
  await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster infrastructure`,
    `${reason}. This is a Buster infrastructure issue, not an app-code problem. Manual intervention required.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...correlation, model: completionIdentity.model ?? null, model_source: completionIdentity.model_source ?? null, reasoning_level: completionIdentity.reasoning_level ?? null, thinking_source: completionIdentity.thinking_source ?? null, runtime: completionIdentity.runtime ?? null }),
      { name: 'Action', value: 'Fix Buster worker / queue / sandbox infrastructure, then resume Buster.', inline: false },
    ], { correlation });
  emitTerminalModuleFailTelemetry({ config, moduleId, status, mod, phase: 'buster', model: busterModel, oldStatus: statusName, reason: `Buster infrastructure issue — Forge output preserved: ${reason}`, correlation: { dispatchId, gatewayLabel, sessionKey } });
  return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
    reason: `Buster infrastructure issue — Forge output preserved: ${reason}`, issueType: 'environment',
    runId, moduleDir: dir, attempt, phase: 'buster', dispatchId, gatewayLabel, sessionKey,
    metadata: { failure_class: 'infra_error', redis_source: source, forge_preserved: true },
  }) };
}

export async function retryCrashTerminalFailure(context: AnyRecord) {
  const { config, moduleId, dir, status, deps, completionIdentity, source, runId, attempt, completionDispatchId, completionGatewayLabel, terminalSessionKey, busterAttempt, maxBusterCrashRetries } = context;
  log('WARN', `Buster subagent crashed (source: ${source}, attempt ${busterAttempt}/${maxBusterCrashRetries + 1}) — retrying Buster`);
  const correlation = { run_id: runId, module_id: moduleId, attempt, dispatch_id: completionDispatchId, gateway_label: completionGatewayLabel, session_key: terminalSessionKey };
  await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
    `Subagent crashed (source: ${source}). Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: terminalSessionKey }), { correlation });
  const transition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
    note: `Buster subagent crashed (source: ${source}) — retrying (${busterAttempt}/${maxBusterCrashRetries})`,
  });
  deps.saveStatus(config, dir, status, transition);
  return { retry: true, status };
}

export async function exhaustCrashTerminalFailure(context: AnyRecord) {
  const { config, moduleId, mod, dir, status, deps, completionIdentity, source, runId, attempt, completionDispatchId, completionGatewayLabel, terminalSessionKey, maxBusterCrashRetries, busterModel } = context;
  const budget = maxBusterCrashRetries + 1;
  log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);
  const event = buildTerminalBusterCrashFailEvent(status, mod, busterModel, 'TESTING', `Buster subagent crashed (${source})`, {
    sessionKey: terminalSessionKey, dispatchId: completionDispatchId, gatewayLabel: completionGatewayLabel,
  });
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId, phase: 'buster', attempt, completionStatus: 'BLOCKED',
    authority: { kind: 'redis', dispatch_id: completionDispatchId }, reasonCode: 'buster_infra_crash_retries_exhausted',
    summary: `Buster subagent crashed ${budget} times (source: ${source}). Infrastructure issue — Forge cannot fix this.`,
    dispatchId: completionDispatchId, gatewayLabel: completionGatewayLabel, sessionKey: terminalSessionKey,
    metadata: { fail_count: status.fail_count },
  });
  const correlation = { run_id: runId, module_id: moduleId, attempt, dispatch_id: completionDispatchId, gateway_label: completionGatewayLabel, session_key: terminalSessionKey };
  await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
    `Buster subagent crashed ${budget} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: terminalSessionKey }),
      { name: 'Source', value: source }, { name: 'Crash Retries', value: String(maxBusterCrashRetries) },
    ], { correlation });
  await emitTerminalBusterCrashTelemetry(config, moduleId, event,
    `Buster crash retries exhausted after ${budget} attempt${budget === 1 ? '' : 's'} (${source})`, budget);
  return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
    reason: `Buster subagent crashed ${budget} times — infrastructure issue (not sent to Forge)`,
    runId, moduleDir: dir, attempt: event.attempt, phase: 'buster', dispatchId: event.dispatch_id,
    gatewayLabel: event.gateway_label, sessionKey: terminalSessionKey,
  }) };
}
