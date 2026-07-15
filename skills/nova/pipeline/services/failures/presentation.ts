import fs from 'fs';
import path from 'path';

import { log, getActiveContext } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import { gatewayInvokePolicy } from '../../core/session-policy.ts';
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
function telemetryCtx(config) {
  const active = getActiveContext();
  if (active) return active;
  const runId = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (getRunId(config)), () => (config?.run_id))), () => (config?._runId))), () => (null));
  return { config, runId };
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function injectionRunId(config) {
  return firstDefined(config?._runId, config?.run_id, getRunId(config));
}

function computeElapsedSeconds(fromIso, toIso = new Date().toISOString()) {
  if (!fromIso) return null;
  const delta = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : null;
}

function buildFailureDiscordFields(identity = {}, extra = []) {
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

function buildFailureDiscordCorrelation(identity = {}) {
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

function buildModuleFailureTelemetry(status, phase, reason, oldStatus, opts = {}) {
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

export function buildPreTestDiscordFields(redisEntry) {
  const suites = selectDefinedValue(() => (parsePreTestVerdict(redisEntry).suites), () => ({}));
  const passed = [];
  const failed = [];
  const skipped = [];

  for (const [name, suite] of Object.entries(suites)) {
    const status = String(selectDefinedValue(() => (suite?.status), () => (''))).toUpperCase();
    if (status === 'PASS') passed.push(name);
    else if (status === 'SKIP') skipped.push(name);
    else if (selectTruthyValue(() => (status === 'FAIL'), () => (status === 'ERROR'))) failed.push({ name, detail: selectDefinedValue(() => (getSuiteFailureDetail(suite)), () => ('failed')) });
  }

  const fields = [
    { name: 'Passed Suites', value: passed.length ? truncateForDiscord(passed.join(', '), 1024) : '—', inline: true },
    { name: 'Failed Suites', value: failed.length ? truncateForDiscord(failed.map(s => s.name).join(', '), 1024) : '—', inline: true },
  ];

  if (skipped.length) {
    fields.push({ name: 'Skipped Suites', value: truncateForDiscord(skipped.join(', '), 1024), inline: true });
  }

  if (failed.length) {
    fields.push({
      name: 'Issue',
      value: truncateForDiscord(
        failed.slice(0, 3).map(({ name, detail }) => `${name}: ${detail}`).join('\n'),
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
export function truncateForDiscord(text, maxLength = 1024) {
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
export function formatRateLimitEmbed(config, context, pauseCount, maxPauses, cooldownMs) {
  return formatSharedRateLimitEmbed(context, pauseCount, maxPauses, cooldownMs);
}

export async function injectNeedsNova(config, result, novaChannel, stepType = 'module', stepId = null, opts = {}) {
  const configuredChannel = novaChannel !== undefined && novaChannel !== null && String(novaChannel).trim()
    ? novaChannel
    : process.env.NOVA_CHANNEL !== undefined && process.env.NOVA_CHANNEL !== null && String(process.env.NOVA_CHANNEL).trim()
      ? process.env.NOVA_CHANNEL
      : null;
  const sessionTarget = normalizeAgentSessionTarget(configuredChannel);
  const sessionSender = opts?.sendGatewaySessionMessage;
  const targetId = selectTruthyValue(() => (selectTruthyValue(() => (stepId), () => (result?.module))), () => ('missing_step_target'));
  const terminalStatus = selectDefinedValue(() => (selectDefinedValue(() => (result?.terminal_status), () => (result?.terminal?.status))), () => ('action_required'));
  const terminalDecision = selectTruthyValue(() => (selectTruthyValue(() => (result?.terminal_decision), () => (result?.terminal?.decision))), () => (null));
  const terminalAction = selectTruthyValue(() => (terminalDecision?.action), () => (null));
  if (!terminalAction) {
    throw new Error('Nova injection requires an explicit terminal decision action');
  }
  const runId = injectionRunId(config);
  const injectionCorrelation = resolveResultCorrelation(result);
  const injectionCorrelationProvenance = resolveResultReadModelCorrelationProvenance(result);
  const attempt = injectionCorrelation.attempt;
  const dispatchId = injectionCorrelation.dispatch_id;
  const gatewayLabel = injectionCorrelation.gateway_label;
  const childSessionKey = injectionCorrelation.session_key;
  const gateId = stepType === 'gate' ? firstDefined(result?.gate_id, targetId) : null;
  const gateType = stepType === 'gate' ? injectionCorrelation.gate_type : null;
  const artifactBundle = getPipelineArtifactBundle(config);
  const injectionLogPaths = [
    artifactBundle.global_nova_injections_jsonl_path,
    artifactBundle.run_nova_injections_jsonl_path,
  ].filter(Boolean);

  const entry = {
    ts: new Date().toISOString(),
    run_id: runId,
    status: 'prepared',
    session_key: sessionTarget,
    delivery_surface: AGENT_SESSION_HANDOFF_SURFACE,
    step_type: stepType,
    step_id: targetId,
    module: selectTruthyValue(() => (result?.module), () => (null)),
    gate_id: stepType === 'gate' ? gateId : undefined,
    gate_type: stepType === 'gate' ? gateType : undefined,
    terminal_status: terminalStatus,
    terminal_decision: terminalDecision,
    terminal_action: terminalAction,
    reason: String(selectDefinedValue(() => (result?.reason), () => (''))).slice(0, 500),
    attempt,
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    child_session_key: childSessionKey,
    correlation_provenance: injectionCorrelationProvenance,
    fail_count: selectDefinedValue(() => (result?.fail_count), () => (null)),
    max_fails: selectDefinedValue(() => (result?.max_fails), () => (null)),
    remaining_attempts: selectDefinedValue(() => (result?.remaining_attempts), () => (null)),
  };

  const appendInjectionLog = () => {
    for (const injectionLogPath of injectionLogPaths) {
      try {
        fs.mkdirSync(path.dirname(injectionLogPath), { recursive: true });
        fs.appendFileSync(injectionLogPath, JSON.stringify(entry) + '\n');
      } catch (error) {
        reportFailureSurfaceIncident(config, 'nova_injection_log_write_failed', error, 'Nova injection log write failed', {
          scope: injectionLogPath,
        });
      }
    }
  };

  if (!sessionTarget) {
    log('INFO', `${terminalStatus} — no --nova-channel set, skipping Nova handoff notification`);
    entry.status = 'skipped_no_session';
    entry.delivery_status = 'skipped_no_session';
    entry.delivery_content_known = false;
    entry.delivery_acknowledged = false;
    appendInjectionLog();
    return;
  }

  const messageLines = [
    `Project: ${config.project}`,
    `${stepType === 'gate' ? 'Gate' : 'Module'}: ${targetId}`,
    `Status: ${terminalStatus}`,
    `Action: ${terminalAction}`,
  ];
  if (runId) messageLines.push(`Run ID: ${runId}`);
  if (stepType === 'gate' && gateType) messageLines.push(`Gate Type: ${gateType}`);
  if (dispatchId) messageLines.push(`Dispatch: ${dispatchId}`);
  if (gatewayLabel && gatewayLabel !== dispatchId) messageLines.push(`Label: ${gatewayLabel}`);
  if (childSessionKey) messageLines.push(`Session: ${childSessionKey}`);
  if (result?.reason) messageLines.push(`Reason: ${String(result.reason).slice(0, 300)}`);
  if (attempt != null && result?.max_fails != null) {
    messageLines.push(`Attempts: ${attempt}/${result.max_fails}`);
  } else if (attempt != null) {
    messageLines.push(`Attempt: ${attempt}`);
  } else if (result?.fail_count != null && result?.max_fails != null) {
    messageLines.push(`Attempts: ${result.fail_count}/${result.max_fails}`);
  } else if (result?.fail_count != null) {
    messageLines.push(`Attempt: ${result.fail_count}`);
  }
  if (result?.resume_command) {
    messageLines.push(`Resume: ${String(result.resume_command).slice(0, 400)}`);
  }
  const message = messageLines.join('\n');
  const title = `Nova handoff required: ${targetId}`;
  entry.intent_status = 'recorded';
  entry.delivery_content_known = true;

  try {
    const sendPolicy = gatewayInvokePolicy(config, 'session_send');
    const receipt = await sendAgentSessionHandoff({
      sessionKey: sessionTarget,
      message: `${title}\n${message}`,
      timeoutMs: sendPolicy.timeoutMs,
      policy: sendPolicy,
      ...(sessionSender ? { sendSessionMessage: sessionSender } : {}),
    });
    entry.delivery_acknowledged = receipt.acknowledged;
    entry.delivery_status = receipt.delivery_status;
    entry.raw_delivery_status = receipt.raw_delivery_status;
    entry.gateway_run_id = receipt.gateway_run_id;
    entry.delivery_session_key = receipt.session_key;
    entry.turn_id = receipt.turn_id;
    entry.response_status = receipt.response_status;
    entry.status = entry.delivery_acknowledged ? 'ok' : 'failed';
    entry.notification_status = entry.delivery_acknowledged ? 'ok' : 'failed';
    if (!entry.delivery_acknowledged) {
      entry.error = 'gateway sessions_send delivery receipt missing';
      log('WARN', `Nova session handoff delivery was not acknowledged for ${stepType} ${targetId}: ${entry.error}`);
    } else {
      log('OK', `${terminalStatus} Nova handoff delivered to session ${sessionTarget} for ${stepType} ${targetId}`);
    }
  } catch (sendError) {
    const sendErrMsg = selectTruthyValue(() => (sendError?.message?.split('\n')[0]), () => ('missing_error_detail'));
    entry.status = 'failed';
    entry.notification_status = 'failed';
    entry.delivery_status = 'gateway_sessions_send_failed';
    entry.delivery_acknowledged = false;
    entry.error = sendErrMsg;
    log('WARN', `Nova session handoff failed for ${stepType} ${targetId}: ${sendErrMsg}`);
  } finally {
    appendInjectionLog();
  }
}

export {
  buildFailureDiscordFields,
  buildModuleFailureTelemetry,
  telemetryCtx,
};
