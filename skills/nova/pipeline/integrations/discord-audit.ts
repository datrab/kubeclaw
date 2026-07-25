import fs from 'node:fs';
import path from 'node:path';
import { log } from '../core/logger.ts';
import { getOptionalRunStats } from '../core/runtime.ts';
import { selectDeps } from '../core/deps.ts';
import { sanitizeJsonEgress } from '../egress.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { readNovaEnvironment } from '../core/runtime-environment.ts';
import { recordDiscordAuditDegraded, recordDiscordAuditRestored } from './discord-observability.ts';
import { arrayOrEmpty, normalizeDiscordCorrelation, normalizeDiscordLevel, optionalText, recordOrEmpty, mergeDiscordCorrelation } from './discord-values.ts';

export async function appendDiscordAuditEntries(config: any = {}, level: any, embeds: any = [], opts: any = {}) {
  const normalizedLevel = normalizeDiscordLevel(level);
  const runId = selectDefinedValue(() => (config?._runId), () => (null));
  const batchCorrelation = normalizeDiscordCorrelation(opts.correlation);
  const embedCorrelations = arrayOrEmpty(opts.correlations);
  const correlation = batchCorrelation;
  const normalizedEmbeds = arrayOrEmpty(embeds);
  if (!normalizedEmbeds.length) return { ok: true, correlation };
  const targets = Array.isArray(opts.auditTargets)
    ? opts.auditTargets.filter(Boolean)
    : [getPipelineArtifactBundle(config).global_discord_jsonl_path, getPipelineArtifactBundle(config).run_discord_jsonl_path].filter(Boolean);
  if (!targets.length) return { ok: true, correlation };
  try {
    for (const [index, rawEmbed] of normalizedEmbeds.entries()) {
      const safeEmbed = sanitizeJsonEgress(rawEmbed, 'discord_audit_embed');
      const entryCorrelation = mergeDiscordCorrelation(
        normalizeDiscordCorrelation(embedCorrelations[index]),
        batchCorrelation,
      );
      const entry = sanitizeJsonEgress({
        ts: new Date().toISOString(),
        project: selectDefinedValue(() => (config?.project), () => (null)),
        run_id: runId,
        session_key: entryCorrelation.session_key,
        gateway_label: entryCorrelation.gateway_label,
        attempt: entryCorrelation.attempt,
        module_id: entryCorrelation.module_id,
        gate_id: entryCorrelation.gate_id,
        gate_type: entryCorrelation.gate_type,
        dispatch_id: entryCorrelation.dispatch_id,
        level: normalizedLevel,
        title: safeEmbed.title,
        description: safeEmbed.description,
        fields: arrayOrEmpty(safeEmbed.fields),
      }, 'discord_audit_entry');
      for (const target of targets) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.appendFileSync(target, JSON.stringify(entry) + '\n');
      }
    }
    await recordDiscordAuditRestored(config, correlation);
    return { ok: true, correlation };
  } catch (err: any) {
    await recordDiscordAuditDegraded(config, correlation, err);
    log('WARN', 'Discord audit log write failed (details suppressed for security)');
    return { ok: false, correlation, error: err };
  }
}

function deliveryReceiptTargets(config: any = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  return [
    artifacts.pipeline_dir ? path.join(artifacts.pipeline_dir, 'discord-deliveries.jsonl') : null,
    artifacts.run_log_dir ? path.join(artifacts.run_log_dir, 'discord-deliveries.jsonl') : null,
  ].filter(Boolean);
}

function deliveryReceiptFromResult(config: any = {}, level: any, correlation: any = {}, result: any = {}, embeds: any = []) {
  const normalizedLevel = normalizeDiscordLevel(level);
  const resultRecord = recordOrEmpty(result);
  const message = recordOrEmpty(resultRecord.body);
  const normalizedEmbeds = arrayOrEmpty(embeds);
  const firstEmbed = recordOrEmpty(normalizedEmbeds[0]);
  return sanitizeJsonEgress({
    ts: new Date().toISOString(),
    project: optionalText(config?.project),
    run_id: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => (correlation.run_id))), () => (null)),
    level: normalizedLevel,
    ok: resultRecord.ok === true,
    http_status: selectDefinedValue(() => (resultRecord.status), () => (null)),
    status_text: optionalText(resultRecord.statusText),
    message_id: optionalText(message.id),
    channel_id: optionalText(message.channel_id),
    webhook_message_returned: Boolean(message.id),
    title: optionalText(firstEmbed.title),
    correlation: normalizeDiscordCorrelation(correlation),
  }, 'discord_delivery_receipt');
}

export function appendDiscordDeliveryReceipt(config: any = {}, level: any, correlation: any = {}, result: any = {}, embeds: any = []) {
  const targets = deliveryReceiptTargets(config);
  if (!targets.length) return;
  const receipt = deliveryReceiptFromResult(config, level, correlation, result, embeds);
  for (const target of targets) {
    if (typeof target !== 'string' || !target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${JSON.stringify(receipt)}\n`);
  }
}

export function incrementDiscordNotificationStats(config: any = {}) {
  const stats = getOptionalRunStats(config);
  if (!stats) return { counted: false, reason: 'run_stats_context_absent' };
  if (stats.discord_notifications_sent === undefined) {
    stats.discord_notifications_sent = 1;
    return { counted: true };
  }
  if (Number.isInteger(stats.discord_notifications_sent)) {
    stats.discord_notifications_sent += 1;
    return { counted: true };
  }
  throw new Error('run_stats.discord_notifications_sent: expected integer counter when present');
}


export function discordWebhookDeliveryMuted(config: any = {}) {
  if (config?._disable_discord_webhooks) return true;
  const rawEnv = readNovaEnvironment('KUBECLAW_DISABLE_DISCORD_WEBHOOKS');
  const env = selectTruthyValue(() => (rawEnv === undefined), () => (rawEnv === null)) ? '' : String(rawEnv).trim().toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (env === '1'), () => (env === 'true'))), () => (env === 'yes'));
}

export function resolveInjectedDiscord(opts: any = {}, method: any = 'discord') {
  if (typeof opts?.discordClient === 'function' && method === 'discord') return opts.discordClient;
  const deps = selectDeps(opts?.deps, 'discord');
  if (typeof deps?.[method] === 'function') return deps[method];
  for (const scope of [
    'pipelineRunner',
    'moduleRunner',
    'gateRunner',
    'reviewGate',
    'busterGate',
    'approvalGate',
    'failures',
    'rateLimit',
    'pipelineReview',
    'caseStudy',
  ]) {
    const scoped = opts?.deps?.[scope];
    if (scoped && typeof scoped[method] === 'function') return scoped[method];
  }
  return null;
}
