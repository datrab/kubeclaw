import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { getRunStats } from '../core/runtime.js';
import { emitObservabilityDegraded, emitObservabilityRestored } from '../services/telemetry.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../../../common/pipeline/noncritical-reporting.js';
import { sanitizeDiscordMessage } from '../../../common/pipeline/redaction.js';

const _discordWebhookHealth = new Map();
const _discordAuditHealth = new Map();

function normalizeFieldName(value) {
  return String(value || '').trim().toLowerCase();
}

function stripInlineCode(value) {
  return String(value || '').replace(/`/g, '').trim();
}

function parseAttemptValue(value) {
  const match = String(value || '').trim().match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function extractDiscordCorrelation(fields = []) {
  const correlation = {
    run_id: null,
    session_key: null,
    gateway_label: null,
    attempt: null,
    module_id: null,
    gate_id: null,
    gate_type: null,
    dispatch_id: null,
  };

  for (const field of Array.isArray(fields) ? fields : []) {
    const name = normalizeFieldName(field?.name);
    const value = stripInlineCode(field?.value);
    if (!value) continue;

    if ((name === 'run id' || name === 'run_id') && !correlation.run_id) correlation.run_id = value;
    else if ((name === 'session' || name === 'session key' || name === 'session_key') && !correlation.session_key) correlation.session_key = value;
    else if ((name === 'label' || name === 'gateway label' || name === 'gateway_label') && !correlation.gateway_label) correlation.gateway_label = value;
    else if (name === 'attempt' && correlation.attempt == null) correlation.attempt = parseAttemptValue(value);
    else if ((name === 'module' || name === 'module id' || name === 'module_id') && !correlation.module_id) correlation.module_id = value;
    else if ((name === 'gate' || name === 'gate id' || name === 'gate_id') && !correlation.gate_id) correlation.gate_id = value.split(' — ')[0].trim();
    else if ((name === 'gate type' || name === 'gate_type') && !correlation.gate_type) correlation.gate_type = value;
    else if ((name === 'dispatch' || name === 'dispatch id' || name === 'dispatch_id') && !correlation.dispatch_id) correlation.dispatch_id = value;
  }

  return correlation;
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

function extractDiscordBatchCorrelation(embeds = []) {
  return (Array.isArray(embeds) ? embeds : []).reduce(
    (merged, embed) => mergeDiscordCorrelation(merged, extractDiscordCorrelation(embed?.fields || [])),
    {
      run_id: null,
      session_key: null,
      gateway_label: null,
      attempt: null,
      module_id: null,
      gate_id: null,
      gate_type: null,
      dispatch_id: null,
    },
  );
}

function discordHealthKey(config = {}, surface = 'webhook') {
  return `${surface}:${config?.project || 'unknown'}:${config?._runId || config?.run_id || 'unknown'}`;
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
  if (typeof err?.status === 'number') return `discord webhook delivery failed: curl exited with status ${err.status}`;
  if (err?.signal) return `discord webhook delivery failed: curl terminated by signal ${err.signal}`;
  if (err?.code) return `discord webhook delivery failed: ${String(err.code)}`;
  return 'discord webhook delivery failed';
}

function formatDiscordAuditFailureDetail(err) {
  if (err?.code) return `discord audit log write failed: ${String(err.code)}`;
  if (err?.message) return `discord audit log write failed: ${String(err.message)}`;
  return 'discord audit log write failed';
}

function markDiscordWebhookDegraded(config = {}, correlation = {}, err) {
  const key = discordHealthKey(config, 'webhook');
  const prev = _discordWebhookHealth.get(key);
  if (prev?.degraded) return;

  const startedAt = new Date().toISOString();
  _discordWebhookHealth.set(key, {
    degraded: true,
    startedAt,
    correlation,
    reason: 'webhook_delivery_failed',
  });

  emitObservabilityDegraded({ config }, {
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
    degraded_at: startedAt,
  });
}

function emitDiscordWebhookRestoredIfNeeded(config = {}, correlation = {}) {
  const key = discordHealthKey(config, 'webhook');
  const prev = _discordWebhookHealth.get(key);
  if (!prev?.degraded) return;

  const restoredAt = new Date().toISOString();
  const restoredAfterMs = prev.startedAt ? Math.max(0, Date.now() - new Date(prev.startedAt).getTime()) : null;
  const restoredCorrelation = mergeDiscordCorrelation(prev.correlation || {}, correlation || {});
  _discordWebhookHealth.set(key, {
    degraded: false,
    restoredAt,
    correlation: restoredCorrelation,
    reason: prev.reason || 'webhook_delivery_failed',
  });

  emitObservabilityRestored({ config }, {
    component: 'discord',
    surface: 'webhook',
    reason: prev.reason || 'webhook_delivery_failed',
    detail: 'discord webhook delivery restored',
    gateway_label: restoredCorrelation.gateway_label || null,
    module_id: restoredCorrelation.module_id || null,
    gate_id: restoredCorrelation.gate_id || null,
    gate_type: restoredCorrelation.gate_type || null,
    session_key: restoredCorrelation.session_key || null,
    attempt: restoredCorrelation.attempt ?? null,
    dispatch_id: restoredCorrelation.dispatch_id || null,
    degraded_at: prev.startedAt || null,
    restored_at: restoredAt,
    restored_after_ms: restoredAfterMs,
  });
}

function markDiscordAuditDegraded(config = {}, correlation = {}, err) {
  const key = discordHealthKey(config, 'audit_log');
  const prev = _discordAuditHealth.get(key);
  if (prev?.degraded) return;

  const startedAt = new Date().toISOString();
  _discordAuditHealth.set(key, {
    degraded: true,
    startedAt,
    correlation,
    reason: 'audit_write_failed',
  });

  emitObservabilityDegraded({ config }, {
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
    degraded_at: startedAt,
  });
}

function emitDiscordAuditRestoredIfNeeded(config = {}, correlation = {}) {
  const key = discordHealthKey(config, 'audit_log');
  const prev = _discordAuditHealth.get(key);
  if (!prev?.degraded) return;

  const restoredAt = new Date().toISOString();
  const restoredAfterMs = prev.startedAt ? Math.max(0, Date.now() - new Date(prev.startedAt).getTime()) : null;
  const restoredCorrelation = mergeDiscordCorrelation(prev.correlation || {}, correlation || {});
  _discordAuditHealth.set(key, {
    degraded: false,
    restoredAt,
    correlation: restoredCorrelation,
    reason: prev.reason || 'audit_write_failed',
  });

  emitObservabilityRestored({ config }, {
    component: 'discord',
    surface: 'audit_log',
    reason: prev.reason || 'audit_write_failed',
    detail: 'discord audit log writes restored',
    gateway_label: restoredCorrelation.gateway_label || null,
    module_id: restoredCorrelation.module_id || null,
    gate_id: restoredCorrelation.gate_id || null,
    gate_type: restoredCorrelation.gate_type || null,
    session_key: restoredCorrelation.session_key || null,
    attempt: restoredCorrelation.attempt ?? null,
    dispatch_id: restoredCorrelation.dispatch_id || null,
    degraded_at: prev.startedAt || null,
    restored_at: restoredAt,
    restored_after_ms: restoredAfterMs,
  });
}

function appendDiscordAuditEntries(config = {}, level = 'INFO', embeds = []) {
  const runId = config?._runId || config?.run_id || null;
  const correlation = extractDiscordBatchCorrelation(embeds);
  if (!Array.isArray(embeds) || !embeds.length) return { ok: true, correlation };
  if (!(config._runLogDir || config._logDir)) return { ok: true, correlation };
  try {
    const targets = [];
    if (config._logDir) targets.push(path.join(config._logDir, 'pipeline', 'discord.jsonl'));
    if (config._runLogDir) targets.push(path.join(config._runLogDir, 'discord.jsonl'));
    for (const safeEmbed of embeds) {
      const entryCorrelation = extractDiscordCorrelation(safeEmbed.fields || []);
      const entry = {
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
      };
      for (const target of targets) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.appendFileSync(target, JSON.stringify(entry) + '\n');
      }
    }
    emitDiscordAuditRestoredIfNeeded(config, correlation);
    return { ok: true, correlation };
  } catch (err) {
    markDiscordAuditDegraded(config, correlation, err);
    log('WARN', 'Discord audit log write failed (details suppressed for security)');
    return { ok: false, correlation, error: err };
  }
}

function curlPost(url, jsonPayload, opts = {}) {
  execFileSync('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', jsonPayload, url], { stdio: 'ignore', timeout: 10000, ...opts });
}

function discordWebhookDeliveryMuted(config = {}) {
  if (config?._disable_discord_webhooks) return true;
  const env = String(process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS || '').trim().toLowerCase();
  return env === '1' || env === 'true' || env === 'yes';
}

function resolveDiscordTestOverride(config = {}, method = 'discord') {
  const overrides = config?._testOverrides;
  if (!overrides || typeof overrides !== 'object') return null;

  const priority = [
    'discord',
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
  ];

  for (const key of priority) {
    const candidate = key === 'discord' ? overrides : overrides[key];
    if (candidate && typeof candidate[method] === 'function') return candidate[method];
  }

  for (const candidate of Object.values(overrides)) {
    if (candidate && typeof candidate === 'object' && typeof candidate[method] === 'function') return candidate[method];
  }

  return null;
}

// Discord embed limits: field name ≤ 256 chars, field value ≤ 1024 chars,
// description ≤ 4096 chars (keep under 500 for readability), title ≤ 256 chars.
// Use truncateForDiscord() from services/failures.js when building field values.
export async function discord(config, level, title, description, fields = []) {
  try {
    const runId = config?._runId || config?.run_id || null;
    const safeEmbed = sanitizeDiscordMessage({
      embeds: [{ title, description, fields }],
    }).embeds?.[0] || { title, description, fields };
    const correlation = extractDiscordCorrelation(safeEmbed.fields || []);
    appendDiscordAuditEntries(config, level, [safeEmbed]);
    const testOverride = resolveDiscordTestOverride(config, 'discord');
    if (testOverride) {
      await testOverride(config, level, title, description, safeEmbed.fields || []);
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
      curlPost(config.discord_webhook_url, JSON.stringify(payload));
      emitDiscordWebhookRestoredIfNeeded(config, correlation);
    } catch (err) {
      markDiscordWebhookDegraded(config, correlation, err);
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

export async function discordEmbeds(config, embeds = [], opts = {}) {
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
    const correlation = extractDiscordBatchCorrelation(safeEmbeds);
    appendDiscordAuditEntries(config, level, safeEmbeds);
    const testOverride = resolveDiscordTestOverride(config, 'discordEmbeds');
    if (testOverride) {
      await testOverride(config, safeEmbeds, opts);
      return;
    }
    if (discordWebhookDeliveryMuted(config)) return;
    if (!config?.discord_webhook_url) return;
    try {
      curlPost(config.discord_webhook_url, JSON.stringify({ embeds: safeEmbeds }));
      emitDiscordWebhookRestoredIfNeeded(config, correlation);
    } catch (err) {
      markDiscordWebhookDegraded(config, correlation, err);
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
export { curlPost };
