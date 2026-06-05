import fs from 'fs';
import path from 'path';

import { log, getActiveContext } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import { discord } from '../../integrations/discord.ts';
import { sendGatewaySessionMessage } from '../../integrations/gateway.ts';
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

const EXIT_TIMEOUT = 30;

function telemetryCtx(config) {
  return getActiveContext() || { config, runId: getRunId(config) || config?.run_id || config?._runId || '' };
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

function buildModuleFailureTelemetry(status, phase, reason, oldStatus, opts = {}) {
  const startedAt = status?.phase_started_at || status?.attempt_started_at || status?.started_at || null;
  return {
    title: status?.title || opts.moduleTitle || null,
    old_status: oldStatus || null,
    attempt: status?.fail_count ?? null,
    dispatch_id: (opts.dispatch_id ?? resolveStatusDispatchId(status) ?? null),
    gateway_label: (opts.gateway_label ?? resolveStatusGatewayLabel(status) ?? null),
    phase: phase || status?.current_phase || null,
    model: opts.model ?? status?.active_agent?.model ?? null,
    duration_seconds: computeElapsedSeconds(startedAt),
    cost_estimate_usd: null,
    session_key: (opts.session_key ?? resolveStatusSessionKey(status) ?? null),
    commit_hash: status?.commit_hash || status?.forge_commit_hash || status?.buster_commit_hash || status?.forge_commit || status?.buster_commit || null,
    failure_class: normalizeFailureClass(phase || status?.current_phase || null, reason, {
      isTimeout: opts.isTimeout === true,
      monitorReason: opts.monitorReason || null,
    }),
    reason: reason || null,
  };
}

export function buildPreTestDiscordFields(redisEntry) {
  const suites = parsePreTestVerdict(redisEntry).suites || {};
  const passed = [];
  const failed = [];
  const skipped = [];

  for (const [name, suite] of Object.entries(suites)) {
    const status = String(suite?.status || '').toUpperCase();
    if (status === 'PASS') passed.push(name);
    else if (status === 'SKIP') skipped.push(name);
    else if (status === 'FAIL' || status === 'ERROR') failed.push({ name, detail: getSuiteFailureDetail(suite) || 'failed' });
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
  const s = String(text || '');
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
  const channelId = novaChannel || process.env.NOVA_CHANNEL || null;
  const gatewaySend = opts?.sendGatewaySessionMessage || sendGatewaySessionMessage;
  const discordNotify = opts?.discord || discord;
  const targetId = stepId || result?.module || 'unknown';
  const exitCode = result?.exit;
  const exitLabel = exitCode === EXIT_TIMEOUT ? 'TIMEOUT' : 'NEEDS_NOVA';
  const runId = config?._runId || config?.run_id || getRunId(config);
  const injectionCorrelation = resolveResultCorrelation(result);
  const injectionCorrelationProvenance = resolveResultReadModelCorrelationProvenance(result);
  const attempt = injectionCorrelation.attempt;
  const dispatchId = injectionCorrelation.dispatch_id;
  const gatewayLabel = injectionCorrelation.gateway_label;
  const childSessionKey = injectionCorrelation.session_key;
  const gateId = stepType === 'gate' ? result?.gate_id || targetId : null;
  const gateType = stepType === 'gate' ? injectionCorrelation.gate_type : null;
  const artifactBundle = getPipelineArtifactBundle(config);
  const injectionLogPaths = [
    artifactBundle.global_nova_injections_jsonl_path,
    artifactBundle.run_nova_injections_jsonl_path,
  ].filter(Boolean);

  const entry = {
    ts: new Date().toISOString(),
    run_id: runId,
    status: 'skipped',
    channel: channelId,
    step_type: stepType,
    step_id: targetId,
    module: result?.module || null,
    gate_id: stepType === 'gate' ? gateId : undefined,
    gate_type: stepType === 'gate' ? gateType : undefined,
    exit: exitCode,
    exit_label: exitLabel,
    reason: (result?.reason || '').slice(0, 500),
    attempt,
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    session_key: childSessionKey,
    correlation_provenance: injectionCorrelationProvenance,
    fail_count: result?.fail_count ?? null,
    max_fails: result?.max_fails ?? null,
    remaining_attempts: result?.remaining_attempts ?? null,
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

  if (!channelId) {
    log('INFO', 'EXIT 10/TIMEOUT — no --nova-channel set, skipping Nova session injection');
    entry.status = 'skipped_no_channel';
    appendInjectionLog();
    return;
  }

  const targetSessionKey = `agent:main:discord:channel:${channelId}`;
  const messageLines = [
    '⚠️ Cronjob injected — Nova working on resolution.',
    `Project: ${config.project}`,
    `${stepType === 'gate' ? 'Gate' : 'Module'}: ${targetId}`,
    `Exit: ${exitLabel}`,
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

  try {
    try {
      await gatewaySend(targetSessionKey, message, 15000);
    } catch (e) {
      const errMsg = e?.message?.split('\n')[0] || 'unknown error';
      const isAbort = /aborted|abort/i.test(errMsg);
      if (isAbort) {
        entry.status = 'delivery_unknown_aborted';
        entry.error = errMsg;
        entry.delivery_acknowledged = false;
        log('WARN', `${exitLabel} Nova injection delivery unknown for channel ${channelId} and ${stepType} ${targetId} (Gateway response aborted before acknowledgement)`);
        await discordNotify(config, 'CRITICAL', `Nova injection delivery UNKNOWN: ${targetId}`, `Cronjob could not confirm Nova injection delivery for ${stepType} ${targetId}; Gateway response aborted before acknowledgement. Manual verification required.`, [
          ...buildFailureDiscordFields({ run_id: runId, step_type: stepType, step_id: targetId, gate_id: gateId, gate_type: gateType, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: childSessionKey }),
          { name: 'Exit', value: exitLabel },
          { name: 'Channel', value: channelId },
          { name: 'Target', value: `${stepType}:${targetId}` },
          { name: 'Delivery', value: 'unknown_aborted' },
          { name: 'Error', value: errMsg.slice(0, 200) },
        ]).catch((discordError) => {
          log('DEBUG', `Nova injection unknown-delivery Discord notice failed: ${discordError?.message || discordError}`);
        });
      } else {
        entry.status = 'failed';
        entry.error = errMsg;
        log('WARN', `Failed to inject ${exitLabel} into Nova channel ${channelId}: ${errMsg}`);
        await discordNotify(config, 'CRITICAL', `Nova injection FAILED: ${targetId}`, `Cronjob could not inject Nova into Discord for ${stepType} ${targetId}. Manual intervention required.`, [
          ...buildFailureDiscordFields({ run_id: runId, step_type: stepType, step_id: targetId, gate_id: gateId, gate_type: gateType, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: childSessionKey }),
          { name: 'Exit', value: exitLabel },
          { name: 'Channel', value: channelId },
          { name: 'Target', value: `${stepType}:${targetId}` },
          { name: 'Error', value: errMsg.slice(0, 200) },
        ]).catch((discordError) => {
          log('DEBUG', `Nova injection failure Discord notice failed: ${discordError?.message || discordError}`);
        });
      }
      return;
    }

    entry.status = 'ok';
    log('OK', `${exitLabel} injected into Nova channel ${channelId} for ${stepType} ${targetId}`);
    try {
      await discordNotify(config, 'WARN', `Nova injection sent: ${targetId}`, `Cronjob injected Nova into Discord channel for ${stepType} ${targetId}.`, [
        ...buildFailureDiscordFields({ run_id: runId, step_type: stepType, step_id: targetId, gate_id: gateId, gate_type: gateType, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: childSessionKey }),
        { name: 'Exit', value: exitLabel },
        { name: 'Channel', value: channelId },
        { name: 'Target', value: `${stepType}:${targetId}` },
      ]);
      entry.notification_status = 'ok';
    } catch (discordError) {
      const discordErrMsg = discordError?.message?.split('\n')[0] || 'unknown error';
      entry.notification_status = 'failed';
      entry.notification_error = discordErrMsg;
      log('WARN', `Nova injection confirmation Discord notice failed for ${stepType} ${targetId}: ${discordErrMsg}`);
    }
  } finally {
    appendInjectionLog();
  }
}

export {
  buildFailureDiscordFields,
  buildModuleFailureTelemetry,
  telemetryCtx,
};
