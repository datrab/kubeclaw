import fs from 'fs';
import path from 'path';

import { log, getActiveContext } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import { sessionSendGatewayPolicy } from '../../core/session-policy.ts';
import { getPipelineArtifactBundle } from '../artifact-bundle.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultCorrelation,
  resolveResultReadModelCorrelationProvenance,
} from '../correlation.ts';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../discord-fields.ts';
import { normalizeFailureClass } from '../failure-semantics.ts';
import { formatRateLimitEmbed as formatSharedRateLimitEmbed } from '../rate-limit-contract.ts';
import { getSuiteFailureDetail, parsePreTestVerdict } from './classification.ts';
import { reportFailureSurfaceIncident } from './incidents.ts';
import {
  AGENT_SESSION_HANDOFF_SURFACE,
  normalizeAgentSessionTarget,
  sendAgentSessionHandoff,
} from '../../agents/session-handoff.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
import { readNovaEnvironment } from '../../core/runtime-environment.ts';
type AnyRecord = Record<string, any>;
function telemetryCtx(config: any) {
  const active = getActiveContext();
  if (active) return active;
  const runId = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (getRunId(config)), () => (config?.run_id))), () => (config?._runId))), () => (null));
  return { config, runId };
}

function firstDefined(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function errorMessage(error: any) {
  return error instanceof Error ? error.message : String(error);
}

function injectionRunId(config: any) {
  return firstDefined(config?._runId, config?.run_id, getRunId(config));
}

function computeElapsedSeconds(fromIso: any, toIso: any = new Date().toISOString()) {
  if (!fromIso) return null;
  const delta = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : null;
}

function buildFailureDiscordFields(identity: any = {}, extra: any = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.PHASE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.STEP_TYPE,
    DISCORD_FIELD_SPECS.STEP_ID,
  ], extra);
}

function buildFailureDiscordCorrelation(identity: any = {}) {
  return {
    run_id: selectTruthyValue(() => (identity.run_id), () => (null)),
    module_id: selectTruthyValue(() => (identity.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (identity.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (identity.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (identity.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (identity.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (identity.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (identity.session_key), () => (null)),
  };
}

function buildModuleFailureTelemetry(status: any, phase: any, reason: any, oldStatus: any, opts: any = {}) {
  const startedAt = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.phase_started_at), () => (status?.attempt_started_at))), () => (status?.started_at))), () => (null));
  return {
    title: selectTruthyValue(() => (selectTruthyValue(() => (status?.title), () => (opts.moduleTitle))), () => (null)),
    old_status: selectTruthyValue(() => (oldStatus), () => (null)),
    attempt: selectDefinedValue(() => (status?.fail_count), () => (null)),
    dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null))),
    gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null))),
    phase: selectTruthyValue(() => (selectTruthyValue(() => (phase), () => (status?.current_phase))), () => (null)),
    model: selectDefinedValue(() => (selectDefinedValue(() => (opts.model), () => (status?.active_agent?.model))), () => (null)),
    duration_seconds: computeElapsedSeconds(startedAt),
    cost_estimate_usd: null,
    session_key: (selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null))),
    commit_hash: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.commit_hash), () => (status?.forge_commit_hash))), () => (status?.buster_commit_hash))), () => (status?.forge_commit))), () => (status?.buster_commit))), () => (null)),
    failure_class: normalizeFailureClass(selectTruthyValue(() => (selectTruthyValue(() => (phase), () => (status?.current_phase))), () => (null)), reason, {
      isTimeout: opts.isTimeout === true,
      monitorReason: selectTruthyValue(() => (opts.monitorReason), () => (null)),
    }),
    reason: selectTruthyValue(() => (reason), () => (null)),
  };
}

export function buildPreTestDiscordFields(redisEntry: any) {
  const suites = selectDefinedValue(() => (parsePreTestVerdict(redisEntry).suites), () => ({}));
  const passed: any[] = [];
  const failed: any[] = [];
  const skipped: any[] = [];

  for (const [name, suite] of Object.entries(suites)) {
    const suiteRecord = suite as AnyRecord;
    const status = String(selectDefinedValue(() => suiteRecord.status, () => '')).toUpperCase();
    if (status === 'PASS') passed.push(name);
    else if (status === 'SKIP') skipped.push(name);
    else if (selectTruthyValue(() => status === 'FAIL', () => status === 'ERROR')) failed.push({ name, detail: selectDefinedValue(() => getSuiteFailureDetail(suiteRecord), () => 'failed') });
  }

  const fields = [
    { name: 'Passed Suites', value: passed.length ? truncateForDiscord(passed.join(', '), 1024) : '—', inline: true },
    { name: 'Failed Suites', value: failed.length ? truncateForDiscord(failed.map((s: any) => s.name).join(', '), 1024) : '—', inline: true },
  ];

  if (skipped.length) {
    fields.push({ name: 'Skipped Suites', value: truncateForDiscord(skipped.join(', '), 1024), inline: true });
  }

  if (failed.length) {
    fields.push({
      name: 'Issue',
      value: truncateForDiscord(
        failed.slice(0, 3).map(({ name, detail }: any) => `${name}: ${detail}`).join('\n'),
        1024,
      ),
      inline: false,
    });
  }

  return fields;
}

/**
 * Truncate text safely for Discord, appending "…" if truncated.
 * Discord limits: field value ≤ 1024 chars, description ≤ 4096 chars.
 */
export function truncateForDiscord(text: any, maxLength: any = 1024) {
  const s = String(selectDefinedValue(() => (text), () => ('')));
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength - 1) + '…';
}

/**
 * Format fields for a rate-limit Discord embed.
 * Returns { title, description, fields } to spread into a discord() call.
 *
 * @param {object} config - Pipeline config (for rate_limit settings)
 * @param {object} context - { detail?: string } — transcript detail from classifier
 * @param {number} pauseCount - current pause number (1-based)
 * @param {number} maxPauses - max allowed pauses
 * @param {number} cooldownMs - cooldown duration in milliseconds
 */
export function formatRateLimitEmbed(config: any, context: any, pauseCount: any, maxPauses: any, cooldownMs: any) {
  return formatSharedRateLimitEmbed(context, pauseCount, maxPauses, cooldownMs);
}

function configuredNovaChannel(novaChannel: any) {
  if (novaChannel !== undefined && novaChannel !== null && String(novaChannel).trim()) return novaChannel;
  const environmentChannel = readNovaEnvironment('NOVA_CHANNEL');
  return environmentChannel !== undefined && String(environmentChannel).trim() ? environmentChannel : null;
}

function prepareNovaHandoff(config: AnyRecord, result: AnyRecord, novaChannel: any, stepType: string, stepId: any) {
  const sessionTarget = normalizeAgentSessionTarget(configuredNovaChannel(novaChannel));
  const targetId = selectTruthyValue(() => stepId, () => result?.module, () => 'missing_step_target');
  const terminalStatus = selectDefinedValue(() => result?.terminal_status, () => result?.terminal?.status, () => 'action_required');
  const terminalDecision = selectTruthyValue(() => result?.terminal_decision, () => result?.terminal?.decision, () => null);
  const terminalAction = selectTruthyValue(() => terminalDecision?.action, () => null);
  if (!terminalAction) throw new Error('Nova injection requires an explicit terminal decision action');
  const correlation = resolveResultCorrelation(result);
  const gateId = stepType === 'gate' ? firstDefined(result?.gate_id, targetId) : null;
  const artifactBundle = getPipelineArtifactBundle(config);
  const injectionLogPaths = [artifactBundle.global_nova_injections_jsonl_path, artifactBundle.run_nova_injections_jsonl_path]
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return {
    sessionTarget, targetId, terminalStatus, terminalDecision, terminalAction, stepType,
    runId: injectionRunId(config), attempt: correlation.attempt,
    dispatchId: correlation.dispatch_id, gatewayLabel: correlation.gateway_label,
    childSessionKey: correlation.session_key, gateId,
    gateType: stepType === 'gate' ? correlation.gate_type : null,
    correlationProvenance: resolveResultReadModelCorrelationProvenance(result), injectionLogPaths,
  };
}

function createNovaInjectionEntry(context: AnyRecord, result: AnyRecord): AnyRecord {
  return {
    ts: new Date().toISOString(), run_id: context.runId, status: 'prepared',
    session_key: context.sessionTarget, delivery_surface: AGENT_SESSION_HANDOFF_SURFACE,
    step_type: context.stepType, step_id: context.targetId, module: result?.module ?? null,
    gate_id: context.stepType === 'gate' ? context.gateId : undefined,
    gate_type: context.stepType === 'gate' ? context.gateType : undefined,
    terminal_status: context.terminalStatus, terminal_decision: context.terminalDecision,
    terminal_action: context.terminalAction, reason: String(result?.reason ?? '').slice(0, 500),
    attempt: context.attempt, dispatch_id: context.dispatchId, gateway_label: context.gatewayLabel,
    child_session_key: context.childSessionKey, correlation_provenance: context.correlationProvenance,
    fail_count: result?.fail_count ?? null, max_fails: result?.max_fails ?? null,
    remaining_attempts: result?.remaining_attempts ?? null,
  };
}

function appendNovaInjectionLogs(config: AnyRecord, paths: string[], entry: AnyRecord) {
  for (const injectionLogPath of paths) {
    try {
      fs.mkdirSync(path.dirname(injectionLogPath), { recursive: true });
      fs.appendFileSync(injectionLogPath, `${JSON.stringify(entry)}\n`);
    } catch (error: any) {
      reportFailureSurfaceIncident(config, 'nova_injection_log_write_failed', error, 'Nova injection log write failed', { scope: injectionLogPath });
    }
  }
}

function attemptLine(context: AnyRecord, result: AnyRecord): string | null {
  if (context.attempt != null && result?.max_fails != null) return `Attempts: ${context.attempt}/${result.max_fails}`;
  if (context.attempt != null) return `Attempt: ${context.attempt}`;
  if (result?.fail_count != null && result?.max_fails != null) return `Attempts: ${result.fail_count}/${result.max_fails}`;
  if (result?.fail_count != null) return `Attempt: ${result.fail_count}`;
  return null;
}

function buildNovaHandoffMessage(config: AnyRecord, context: AnyRecord, result: AnyRecord) {
  const lines = [
    `Project: ${config.project}`,
    `${context.stepType === 'gate' ? 'Gate' : 'Module'}: ${context.targetId}`,
    `Status: ${context.terminalStatus}`,
    `Action: ${context.terminalAction}`,
  ];
  if (context.runId) lines.push(`Run ID: ${context.runId}`);
  if (context.stepType === 'gate' && context.gateType) lines.push(`Gate Type: ${context.gateType}`);
  if (context.dispatchId) lines.push(`Dispatch: ${context.dispatchId}`);
  if (context.gatewayLabel && context.gatewayLabel !== context.dispatchId) lines.push(`Label: ${context.gatewayLabel}`);
  if (context.childSessionKey) lines.push(`Session: ${context.childSessionKey}`);
  if (result?.reason) lines.push(`Reason: ${String(result.reason).slice(0, 300)}`);
  const attempt = attemptLine(context, result);
  if (attempt) lines.push(attempt);
  if (result?.resume_command) lines.push(`Resume: ${String(result.resume_command).slice(0, 400)}`);
  return `Nova handoff required: ${context.targetId}\n${lines.join('\n')}`;
}

async function deliverNovaHandoff(config: AnyRecord, context: AnyRecord, result: AnyRecord, entry: AnyRecord, sessionSender: any) {
  entry.intent_status = 'recorded';
  entry.delivery_content_known = true;
  try {
    const sendPolicy = sessionSendGatewayPolicy(config);
    const receipt = await sendAgentSessionHandoff({
      sessionKey: context.sessionTarget,
      message: buildNovaHandoffMessage(config, context, result),
      timeoutMs: sendPolicy.timeoutMs,
      policy: sendPolicy,
      ...(sessionSender ? { sendSessionMessage: sessionSender } : {}),
    });
    Object.assign(entry, {
      delivery_acknowledged: receipt.acknowledged, delivery_status: receipt.delivery_status,
      raw_delivery_status: receipt.raw_delivery_status, gateway_run_id: receipt.gateway_run_id,
      delivery_session_key: receipt.session_key, turn_id: receipt.turn_id,
      response_status: receipt.response_status, status: receipt.acknowledged ? 'ok' : 'failed',
      notification_status: receipt.acknowledged ? 'ok' : 'failed',
    });
    if (!receipt.acknowledged) {
      entry.error = 'gateway sessions_send delivery receipt missing';
      log('WARN', `Nova session handoff delivery was not acknowledged for ${context.stepType} ${context.targetId}: ${entry.error}`);
    } else log('OK', `${context.terminalStatus} Nova handoff delivered to session ${context.sessionTarget} for ${context.stepType} ${context.targetId}`);
  } catch (error: any) {
    const detail = error?.message?.split('\n')[0] ?? 'missing_error_detail';
    Object.assign(entry, { status: 'failed', notification_status: 'failed', delivery_status: 'gateway_sessions_send_failed', delivery_acknowledged: false, error: detail });
    log('WARN', `Nova session handoff failed for ${context.stepType} ${context.targetId}: ${detail}`);
  }
}

export async function injectNeedsNova(config: AnyRecord, result: AnyRecord, novaChannel: any, stepType = 'module', stepId: any = null, opts: AnyRecord = {}) {
  const context = prepareNovaHandoff(config, result, novaChannel, stepType, stepId);
  const entry = createNovaInjectionEntry(context, result);
  if (!context.sessionTarget) {
    log('INFO', `${context.terminalStatus} — no --nova-channel set, skipping Nova handoff notification`);
    Object.assign(entry, { status: 'skipped_no_session', delivery_status: 'skipped_no_session', delivery_content_known: false, delivery_acknowledged: false });
    appendNovaInjectionLogs(config, context.injectionLogPaths, entry);
    return;
  }
  await deliverNovaHandoff(config, context, result, entry, opts.sendGatewaySessionMessage);
  appendNovaInjectionLogs(config, context.injectionLogPaths, entry);
}

export {
  buildFailureDiscordFields,
  buildModuleFailureTelemetry,
  telemetryCtx,
};
