import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getRunStats } from '../core/runtime.ts';
import { selectDeps } from '../core/deps.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from '../services/observability.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeDiscordMessage, sanitizeJsonEgress } from '../redaction.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { postDiscordWebhook } from './discord-webhook.ts';

function emptyDiscordCorrelation() {
  return {
    run_id: null,
    session_key: null,
    gateway_label: null,
    attempt: null,
    module_id: null,
    gate_id: null,
    gate_type: null,
    dispatch_id: null,
  };
}

function normalizeAttempt(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeDiscordCorrelation(source = {}) {
  return {
    run_id: source?.run_id || null,
    session_key: source?.session_key || null,
    gateway_label: source?.gateway_label || null,
    attempt: normalizeAttempt(source?.attempt),
    module_id: source?.module_id || null,
    gate_id: source?.gate_id || null,
    gate_type: source?.gate_type || null,
    dispatch_id: source?.dispatch_id || null,
  };
}

function mergeDiscordCorrelation(base = {}, extra = {}) {
  return {
    run_id: extra.run_id || base.run_id || null,
    session_key: extra.session_key || base.session_key || null,
    gateway_label: extra.gateway_label || base.gateway_label || null,
    attempt: extra.attempt ?? base.attempt ?? null,
    module_id: extra.module_id || base.module_id || null,
    gate_id: extra.gate_id || base.gate_id || null,
    gate_type: extra.gate_type || base.gate_type || null,
    dispatch_id: extra.dispatch_id || base.dispatch_id || null,
  };
}

function reportDiscordIncident(config = {}, classification, message, error = null, options = {}) {
  reportClassifiedNonBlockingError({
    log,
    reporter: 'discord',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'discord',
      config?.project || 'unknown',
      config?._runId || config?.run_id || 'unknown',
      classification,
      options.scope || 'global'
    ),
    message,
    error,
    includeErrorDetail: options.includeErrorDetail ?? true,
    level: options.level || 'WARN',
  });
}

function formatDiscordDeliveryFailureDetail(err) {
  if (typeof err?.status === 'number') {
    return `discord webhook delivery failed: HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`;
  }
  if (err?.cause?.code) return `discord webhook delivery failed: ${String(err.cause.code)}`;
  if (err?.code && err.code !== 'DISCORD_WEBHOOK_DELIVERY_FAILED') return `discord webhook delivery failed: ${String(err.code)}`;
  if (err?.message) return `discord webhook delivery failed: ${String(err.message)}`;
  return 'discord webhook delivery failed';
}

function formatDiscordAuditFailureDetail(err) {
  if (err?.code) return `discord audit log write failed: ${String(err.code)}`;
  if (err?.message) return `discord audit log write failed: ${String(err.message)}`;
  return 'discord audit log write failed';
}

async function recordDiscordWebhookDegraded(config = {}, correlation = {}, err) {
  await recordObservabilityDegraded({ config }, {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_delivery_failed',
    detail: formatDiscordDeliveryFailureDetail(err),
    gateway_label: correlation.gateway_label || null,
    module_id: correlation.module_id || null,
    gate_id: correlation.gate_id || null,
    gate_type: correlation.gate_type || null,
    session_key: correlation.session_key || null,
    attempt: correlation.attempt ?? null,
    dispatch_id: correlation.dispatch_id || null,
  });
}

async function recordDiscordWebhookRestored(config = {}, correlation = {}) {
  await recordObservabilityRestored({ config }, {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_delivery_failed',
    detail: 'discord webhook delivery restored',
    gateway_label: correlation.gateway_label || null,
    module_id: correlation.module_id || null,
    gate_id: correlation.gate_id || null,
    gate_type: correlation.gate_type || null,
    session_key: correlation.session_key || null,
    attempt: correlation.attempt ?? null,
    dispatch_id: correlation.dispatch_id || null,
  });
}

async function recordDiscordAuditDegraded(config = {}, correlation = {}, err) {
  await recordObservabilityDegraded({ config }, {
    component: 'discord',
    surface: 'audit_log',
    reason: 'audit_write_failed',
    detail: formatDiscordAuditFailureDetail(err),
    gateway_label: correlation.gateway_label || null,
    module_id: correlation.module_id || null,
    gate_id: correlation.gate_id || null,
    gate_type: correlation.gate_type || null,
    session_key: correlation.session_key || null,
    attempt: correlation.attempt ?? null,
    dispatch_id: correlation.dispatch_id || null,
  });
}

async function recordDiscordAuditRestored(config = {}, correlation = {}) {
  await recordObservabilityRestored({ config }, {
    component: 'discord',
    surface: 'audit_log',
    reason: 'audit_write_failed',
    detail: 'discord audit log writes restored',
    gateway_label: correlation.gateway_label || null,
    module_id: correlation.module_id || null,
    gate_id: correlation.gate_id || null,
    gate_type: correlation.gate_type || null,
    session_key: correlation.session_key || null,
    attempt: correlation.attempt ?? null,
    dispatch_id: correlation.dispatch_id || null,
  });
}

async function appendDiscordAuditEntries(config = {}, level = 'INFO', embeds = [], opts = {}) {
  const runId = config?._runId || config?.run_id || null;
  const batchCorrelation = normalizeDiscordCorrelation(opts.correlation || {});
  const embedCorrelations = Array.isArray(opts.correlations) ? opts.correlations : [];
  const correlation = batchCorrelation;
  if (!Array.isArray(embeds) || !embeds.length) return { ok: true, correlation };
  const targets = Array.isArray(opts.auditTargets) ? opts.auditTargets.filter(Boolean) : [getPipelineArtifactBundle(config).global_discord_jsonl_path, getPipelineArtifactBundle(config).run_discord_jsonl_path].filter(Boolean);
  if (!targets.length) return { ok: true, correlation };
  try {
    for (const [index, rawEmbed] of embeds.entries()) {
      const safeEmbed = sanitizeJsonEgress(rawEmbed, 'discord_audit_embed');
      const entryCorrelation = mergeDiscordCorrelation(
        normalizeDiscordCorrelation(embedCorrelations[index] || {}),
        batchCorrelation,
      );
      const entry = sanitizeJsonEgress({
        ts: new Date().toISOString(),
        project: config?.project || null,
        run_id: runId || entryCorrelation.run_id,
        session_key: entryCorrelation.session_key,
        gateway_label: entryCorrelation.gateway_label,
        attempt: entryCorrelation.attempt,
        module_id: entryCorrelation.module_id,
        gate_id: entryCorrelation.gate_id,
        gate_type: entryCorrelation.gate_type,
        dispatch_id: entryCorrelation.dispatch_id,
        level,
        title: safeEmbed.title,
        description: safeEmbed.description,
        fields: safeEmbed.fields || [],
      }, 'discord_audit_entry');
      for (const target of targets) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.appendFileSync(target, JSON.stringify(entry) + '\n');
      }
    }
    await recordDiscordAuditRestored(config, correlation);
    return { ok: true, correlation };
  } catch (err) {
    await recordDiscordAuditDegraded(config, correlation, err);
    log('WARN', 'Discord audit log write failed (details suppressed for security)');
    return { ok: false, correlation, error: err };
  }
}


function discordWebhookDeliveryMuted(config = {}) {
  if (config?._disable_discord_webhooks) return true;
  const env = String(process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS || '').trim().toLowerCase();
  return env === '1' || env === 'true' || env === 'yes';
}

function resolveInjectedDiscord(opts = {}, method = 'discord') {
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

// Discord embed limits: field name ≤ 256 chars, field value ≤ 1024 chars,
// description ≤ 4096 chars (keep under 500 for readability), title ≤ 256 chars.
// Use truncateForDiscord() from services/failures/presentation.ts when building field values.
export async function discord(config: any, level: any, title: any, description: any, fields: any[] = [], opts: any = {}) {
  try {
    const runId = config?._runId || config?.run_id || null;
    const safeEmbed = sanitizeDiscordMessage({
      embeds: [{ title, description, fields }],
    }).embeds?.[0] || { title, description, fields };
    const correlation = mergeDiscordCorrelation(
      emptyDiscordCorrelation(),
      normalizeDiscordCorrelation(opts.correlation || {}),
    );
    await appendDiscordAuditEntries(config, level, [{ ...safeEmbed, fields }], { correlation });
    const injectedDiscord = resolveInjectedDiscord(opts, 'discord');
    if (typeof injectedDiscord === 'function') {
      await injectedDiscord(config, level, safeEmbed.title, safeEmbed.description, safeEmbed.fields || [], { correlation });
      return;
    }
    if (discordWebhookDeliveryMuted(config)) return;
    if (!config.discord_webhook_url) return;
    if (!config.discord_alerts?.[level.toLowerCase()]) return;
    const colors = { INFO: 0x3498db, WARN: 0xe67e22, CRITICAL: 0xe74c3c, OK: 0x2ecc71 };
    const icons = { INFO: 'ℹ️', WARN: '⚠️', CRITICAL: '🚨', OK: '✅' };
    const payload = sanitizeDiscordMessage({
      embeds: [{
        title: `${icons[level] || ''} ${title}`,
        description,
        color: colors[level] || 0x95a5a6,
        fields: fields.map(f => ({ name: f.name, value: String(f.value), inline: f.inline ?? true })),
        footer: { text: `KubeClaw Pipeline · ${config.project}${runId ? ` · ${runId}` : ''}` },
        timestamp: new Date().toISOString(),
      }],
    });
    try {
      await postDiscordWebhook(config.discord_webhook_url, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await recordDiscordWebhookRestored(config, correlation);
    } catch (err) {
      await recordDiscordWebhookDegraded(config, correlation, err);
      log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
      return;
    }
    try {
      const stats = getRunStats(config);
      if (stats) stats.discord_notifications_sent = (stats.discord_notifications_sent || 0) + 1;
    } catch (error) {
      reportDiscordIncident(config, 'stats_update_failed', 'Discord delivery stats update failed', error, {
        level: 'DEBUG',
        scope: 'discord',
      });
    }
  } catch (error) {
    reportDiscordIncident(config, 'notification_wrapper_failed', 'Discord notification handling failed (details suppressed for security)', error, {
      scope: 'discord',
      includeErrorDetail: false,
    });
  }
}

export async function discordEmbeds(config: any, embeds: any[] = [], opts: any = {}) {
  try {
    if (!Array.isArray(embeds) || !embeds.length) return;
    const runId = config?._runId || config?.run_id || null;
    const level = opts.level || 'INFO';
    const safeEmbeds = sanitizeDiscordMessage({
      embeds: embeds.map((embed) => ({
        ...embed,
        footer: embed?.footer || { text: `KubeClaw Pipeline · ${config?.project || 'unknown'}${runId ? ` · ${runId}` : ''}` },
        timestamp: embed?.timestamp || new Date().toISOString(),
      })),
    }).embeds || [];
    const correlation = mergeDiscordCorrelation(
      emptyDiscordCorrelation(),
      normalizeDiscordCorrelation(opts.correlation || {}),
    );
    await appendDiscordAuditEntries(config, level, safeEmbeds.map((safeEmbed, index) => ({
      ...safeEmbed,
      fields: embeds[index]?.fields || safeEmbed.fields,
    })), { correlation, correlations: opts.correlations, auditTargets: opts.auditTargets });
    const injectedDiscordEmbeds = resolveInjectedDiscord(opts, 'discordEmbeds');
    if (typeof injectedDiscordEmbeds === 'function') {
      await injectedDiscordEmbeds(config, safeEmbeds, opts);
      return;
    }
    if (discordWebhookDeliveryMuted(config)) return;
    if (!config?.discord_webhook_url) return;
    if (!config.discord_alerts?.[String(level).toLowerCase()]) return;
    try {
      await postDiscordWebhook(config.discord_webhook_url, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: safeEmbeds }),
      });
      await recordDiscordWebhookRestored(config, correlation);
    } catch (err) {
      await recordDiscordWebhookDegraded(config, correlation, err);
      log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
      return;
    }
    try {
      const stats = getRunStats(config);
      if (stats) stats.discord_notifications_sent = (stats.discord_notifications_sent || 0) + 1;
    } catch (error) {
      reportDiscordIncident(config, 'stats_update_failed', 'Discord embed delivery stats update failed', error, {
        level: 'DEBUG',
        scope: 'discordEmbeds',
      });
    }
  } catch (error) {
    reportDiscordIncident(config, 'notification_wrapper_failed', 'Discord embed handling failed (details suppressed for security)', error, {
      scope: 'discordEmbeds',
      includeErrorDetail: false,
    });
  }
}
