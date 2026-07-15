import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getOptionalRunStats } from '../core/runtime.ts';
import { selectDeps } from '../core/deps.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from '../services/observability.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeDiscordMessage, sanitizeJsonEgress } from '../egress.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { postDiscordWebhook } from './discord-webhook.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const DISCORD_LEVEL_STYLE = Object.freeze({
  INFO: { icon: 'ℹ️', color: 0x3498db },
  WARN: { icon: '⚠️', color: 0xe67e22 },
  CRITICAL: { icon: '🚨', color: 0xe74c3c },
  OK: { icon: '✅', color: 0x2ecc71 },
  DEBUG: { icon: 'ℹ️', color: 0x95a5a6 },
});

const DISCORD_LEVELS = new Set(Object.keys(DISCORD_LEVEL_STYLE));
const DISCORD_PAYLOAD_LIMITS = Object.freeze({
  embeds: 10,
  fields: 25,
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  embedTotal: 6000,
});

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordOrEmpty(value) {
  return isPlainRecord(value) ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function optionalText(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  return String(value);
}

function textOrEmpty(value) {
  return selectDefinedValue(() => (optionalText(value)), () => (''));
}

function requiredText(value, label) {
  const text = optionalText(value)?.trim();
  if (!text) throw new Error(`${label}: required non-empty string`);
  return text;
}

function requiredBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label}: required boolean`);
  return value;
}

function normalizedFieldName(value) {
  return textOrEmpty(value).trim().toLowerCase();
}

function normalizeDiscordLevel(value, label = 'discord.level') {
  const level = requiredText(value, label).toUpperCase();
  if (!DISCORD_LEVELS.has(level)) {
    throw new Error(`${label}: unsupported Discord level '${level}'`);
  }
  return level;
}

function discordStyle(level) {
  const style = DISCORD_LEVEL_STYLE[level];
  if (!style) throw new Error(`discord.level: style missing for '${level}'`);
  return style;
}

function requireSanitizedEmbeds(payload, label) {
  const embeds = payload?.embeds;
  if (selectTruthyValue(() => (!Array.isArray(embeds)), () => (!embeds.length))) {
    throw new Error(`${label}: sanitizer did not return Discord embeds`);
  }
  return embeds;
}

function discordPayloadLimitError(label, detail) {
  const error: any = new Error(`${label}: ${detail}`);
  error.code = 'DISCORD_PAYLOAD_INVALID';
  error.bodyPreview = detail;
  return error;
}

function assertTextLimit(value, max, label) {
  const text = optionalText(value);
  if (text !== null && text.length > max) {
    throw discordPayloadLimitError('discord.payload', `${label} length ${text.length} exceeds ${max}`);
  }
  return text ? text.length : 0;
}

function assertDiscordPayloadWithinLimits(payload = {}, label = 'discord.payload') {
  const embeds = arrayOrEmpty(payload.embeds);
  if (embeds.length > DISCORD_PAYLOAD_LIMITS.embeds) {
    throw discordPayloadLimitError(label, `embeds count ${embeds.length} exceeds ${DISCORD_PAYLOAD_LIMITS.embeds}`);
  }
  for (const [index, embed] of embeds.entries()) {
    const embedRecord = recordOrEmpty(embed);
    const fields = arrayOrEmpty(embedRecord.fields);
    if (fields.length > DISCORD_PAYLOAD_LIMITS.fields) {
      throw discordPayloadLimitError(label, `embeds.${index}.fields count ${fields.length} exceeds ${DISCORD_PAYLOAD_LIMITS.fields}`);
    }
    let total = 0;
    total += assertTextLimit(embedRecord.title, DISCORD_PAYLOAD_LIMITS.title, `embeds.${index}.title`);
    total += assertTextLimit(embedRecord.description, DISCORD_PAYLOAD_LIMITS.description, `embeds.${index}.description`);
    total += assertTextLimit(recordOrEmpty(embedRecord.footer).text, DISCORD_PAYLOAD_LIMITS.footerText, `embeds.${index}.footer.text`);
    for (const [fieldIndex, field] of fields.entries()) {
      const fieldRecord = recordOrEmpty(field);
      total += assertTextLimit(fieldRecord.name, DISCORD_PAYLOAD_LIMITS.fieldName, `embeds.${index}.fields.${fieldIndex}.name`);
      total += assertTextLimit(fieldRecord.value, DISCORD_PAYLOAD_LIMITS.fieldValue, `embeds.${index}.fields.${fieldIndex}.value`);
    }
    if (total > DISCORD_PAYLOAD_LIMITS.embedTotal) {
      throw discordPayloadLimitError(label, `embeds.${index} text length ${total} exceeds ${DISCORD_PAYLOAD_LIMITS.embedTotal}`);
    }
  }
}

function truncateDiscordText(value, max, marker = '…') {
  const text = textOrEmpty(value);
  if (text.length <= max) return text;
  if (max <= marker.length) return marker.slice(0, Math.max(0, max));
  return `${text.slice(0, max - marker.length)}${marker}`;
}

function compactDiscordEmbed(embed = {}) {
  const embedRecord = recordOrEmpty(embed);
  const compact = {
    ...embedRecord,
    title: truncateDiscordText(embedRecord.title, DISCORD_PAYLOAD_LIMITS.title),
    description: truncateDiscordText(embedRecord.description, DISCORD_PAYLOAD_LIMITS.description),
    footer: embedRecord.footer ? {
      ...recordOrEmpty(embedRecord.footer),
      text: truncateDiscordText(recordOrEmpty(embedRecord.footer).text, DISCORD_PAYLOAD_LIMITS.footerText),
    } : embedRecord.footer,
    fields: [],
  };
  const maxTotal = DISCORD_PAYLOAD_LIMITS.embedTotal - 100;
  let total = textOrEmpty(compact.title).length
    + textOrEmpty(compact.description).length
    + textOrEmpty(recordOrEmpty(compact.footer).text).length;
  for (const rawField of arrayOrEmpty(embedRecord.fields).slice(0, DISCORD_PAYLOAD_LIMITS.fields)) {
    const name = truncateDiscordText(recordOrEmpty(rawField).name || 'Field', DISCORD_PAYLOAD_LIMITS.fieldName);
    const remaining = maxTotal - total - name.length;
    if (remaining <= 16) break;
    const value = truncateDiscordText(
      recordOrEmpty(rawField).value || '—',
      Math.min(DISCORD_PAYLOAD_LIMITS.fieldValue, remaining),
    ) || '—';
    compact.fields.push({ ...recordOrEmpty(rawField), name, value, inline: recordOrEmpty(rawField).inline === true });
    total += name.length + value.length;
  }
  return compact;
}

function buildCanonicalDiscordPayload(embed = {}) {
  const payload = sanitizeDiscordMessage({
    embeds: [compactDiscordEmbed(embed)],
  });
  assertDiscordPayloadWithinLimits(payload, 'discord.embed');
  return payload;
}

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
  if (selectTruthyValue(() => (value == null), () => (value === ''))) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function discordWebhookTimeoutMs(config) {
  const timeoutMs = Number(config?.discord?.webhook_timeout_ms);
  if (selectTruthyValue(() => (!Number.isInteger(timeoutMs)), () => (timeoutMs <= 0))) {
    throw new Error('config.discord.webhook_timeout_ms: required positive integer in swarm.config.json');
  }
  return timeoutMs;
}

function discordReceiptWebhookUrl(value) {
  const url = new URL(requiredText(value, 'config.discord_webhook_url'));
  url.searchParams.set('wait', 'true');
  return url.toString();
}

function normalizeDiscordCorrelation(source = {}) {
  const record = recordOrEmpty(source);
  return {
    run_id: optionalText(record.run_id),
    session_key: optionalText(record.session_key),
    gateway_label: optionalText(record.gateway_label),
    attempt: normalizeAttempt(record.attempt),
    module_id: optionalText(record.module_id),
    gate_id: optionalText(record.gate_id),
    gate_type: optionalText(record.gate_type),
    dispatch_id: optionalText(record.dispatch_id),
  };
}

function mergeDiscordCorrelation(base = {}, extra = {}) {
  const normalizedBase = normalizeDiscordCorrelation(base);
  const normalizedExtra = normalizeDiscordCorrelation(extra);
  return {
    run_id: selectDefinedValue(() => (normalizedExtra.run_id), () => (normalizedBase.run_id)),
    session_key: selectDefinedValue(() => (normalizedExtra.session_key), () => (normalizedBase.session_key)),
    gateway_label: selectDefinedValue(() => (normalizedExtra.gateway_label), () => (normalizedBase.gateway_label)),
    attempt: selectDefinedValue(() => (normalizedExtra.attempt), () => (normalizedBase.attempt)),
    module_id: selectDefinedValue(() => (normalizedExtra.module_id), () => (normalizedBase.module_id)),
    gate_id: selectDefinedValue(() => (normalizedExtra.gate_id), () => (normalizedBase.gate_id)),
    gate_type: selectDefinedValue(() => (normalizedExtra.gate_type), () => (normalizedBase.gate_type)),
    dispatch_id: selectDefinedValue(() => (normalizedExtra.dispatch_id), () => (normalizedBase.dispatch_id)),
  };
}

function normalizeOperatorStatusText(value) {
  return textOrEmpty(value);
}

function normalizeOperatorModelText(value) {
  return textOrEmpty(value)
    .replace(/\bopenai-codex\//gi, 'openai/')
    .replace(/\bcodex-(\d[\w.-]*)\b/gi, 'gpt-$1');
}

function normalizeOperatorFieldValue(field) {
  const fieldRecord = recordOrEmpty(field);
  const raw = textOrEmpty(fieldRecord.value);
  const statusNormalized = normalizeOperatorStatusText(raw);
  return normalizedFieldName(fieldRecord.name) === 'model'
    ? normalizeOperatorModelText(statusNormalized)
    : statusNormalized;
}

function actionabilityFieldNeedsReplacement(name, value) {
  const normalizedName = normalizedFieldName(name);
  const text = textOrEmpty(value).trim();
  if (!text) return true;
  if (normalizedName === 'impact' && /^Buster reported an operator-visible event/i.test(text)) return true;
  if (normalizedName === 'action' && /(open latest\.json|inspect the run-scoped pipeline and Discord artifacts?|inspect.*artifacts?)/i.test(text)) return true;
  if (normalizedName === 'evidence' && /(run pipeline:|run discord:|buster diagnostic:|latest\.json|discord\.jsonl)/i.test(text)) return true;
  return false;
}

function operatorEmbedEvidenceSummary(embed = {}) {
  const skipNames = new Set(['impact', 'action', 'evidence', 'run', 'run id', 'attempt', 'dispatch', 'session']);
  const embedRecord = recordOrEmpty(embed);
  const lines = arrayOrEmpty(embedRecord.fields)
    .filter((field) => !skipNames.has(normalizedFieldName(recordOrEmpty(field).name)))
    .map((field) => {
      const fieldRecord = recordOrEmpty(field);
      const name = selectDefinedValue(() => (optionalText(fieldRecord.name)?.trim()), () => ('field_name_missing'));
      const value = normalizeOperatorFieldValue(field).trim();
      return value ? `${name}: ${value}` : null;
    })
    .filter(Boolean);
  const title = optionalText(embedRecord.title)?.trim();
  const description = optionalText(embedRecord.description)?.trim();
  if (lines.length) return lines.join('\n');
  if (title && description) return `${title}\n${description}`;
  if (title) return title;
  if (description) return description;
  return 'discord_evidence_fields_missing';
}

function replacementActionabilityValue(name, embed = {}) {
  const evidenceSummary = operatorEmbedEvidenceSummary(embed);
  const embedRecord = recordOrEmpty(embed);
  const normalizedName = normalizedFieldName(name);
  if (normalizedName === 'impact') {
    const title = optionalText(embedRecord.title)?.trim();
    const description = optionalText(embedRecord.description)?.trim();
    if (title && description) return `${title}: ${description}`;
    if (title) return title;
    if (description) return description;
    return 'discord_impact_fields_missing';
  }
  if (normalizedName === 'action') return 'Read the notification fields and act on the listed status, issue, or failure reason.';
  if (normalizedName === 'evidence') return evidenceSummary;
  return evidenceSummary;
}

function normalizeOperatorEmbed(embed = {}) {
  const embedRecord = recordOrEmpty(embed);
  const normalized = {
    ...embedRecord,
    title: normalizeOperatorStatusText(embedRecord.title),
    description: normalizeOperatorStatusText(embedRecord.description),
    fields: Array.isArray(embedRecord.fields)
      ? embedRecord.fields.map((field) => ({
          ...field,
          value: normalizeOperatorFieldValue(field),
        }))
      : embedRecord.fields,
  };
  if (!Array.isArray(normalized.fields)) return normalized;
  normalized.fields = normalized.fields.map((field) => {
    const name = normalizedFieldName(recordOrEmpty(field).name);
    if (!['impact', 'action', 'evidence'].includes(name)) return field;
    if (!actionabilityFieldNeedsReplacement(name, field?.value)) return field;
    return { ...field, value: replacementActionabilityValue(name, normalized), inline: false };
  });
  return normalized;
}

function reportDiscordIncident(config = {}, classification, message, error = null, options = {}) {
  const incidentLevel = normalizeDiscordLevel(options.level, 'discord.incident.level');
  const project = requiredText(config?.project, 'config.project');
  const runId = requiredText(selectDefinedValue(() => (config?._runId), () => (config?.run_id)), 'config.run_id');
  const scope = requiredText(options.scope, 'discord.incident.scope');
  const includeErrorDetail = requiredBoolean(options.includeErrorDetail, 'discord.incident.includeErrorDetail');
  reportClassifiedNonBlockingError({
    log,
    reporter: 'discord',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'discord',
      project,
      runId,
      classification,
      scope
    ),
    message,
    error,
    includeErrorDetail,
    level: incidentLevel,
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

function discordDeliveryFailurePayload(err) {
  const failurePayload = {
    failure_class: 'webhook_delivery_failed',
    http_status: typeof err?.status === 'number' ? err.status : null,
    error_code: selectTruthyValue(() => (selectTruthyValue(() => (err?.cause?.code), () => (err?.code))), () => (null)),
    body_preview: typeof err?.bodyPreview === 'string' && err.bodyPreview.trim() ? err.bodyPreview.trim().slice(0, 500) : null,
  };
  return Object.fromEntries(Object.entries(failurePayload).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function formatDiscordAuditFailureDetail(err) {
  if (err?.code) return `discord audit log write failed: ${String(err.code)}`;
  if (err?.message) return `discord audit log write failed: ${String(err.message)}`;
  return 'discord audit log write failed';
}

async function recordDiscordWebhookDegraded(config = {}, correlation = {}, err) {
  const normalizedCorrelation = normalizeDiscordCorrelation(correlation);
  await recordObservabilityDegraded({ config }, {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_delivery_failed',
    detail: formatDiscordDeliveryFailureDetail(err),
    gateway_label: normalizedCorrelation.gateway_label,
    module_id: normalizedCorrelation.module_id,
    gate_id: normalizedCorrelation.gate_id,
    gate_type: normalizedCorrelation.gate_type,
    session_key: normalizedCorrelation.session_key,
    attempt: normalizedCorrelation.attempt,
    dispatch_id: normalizedCorrelation.dispatch_id,
    payload: discordDeliveryFailurePayload(err),
  });
}

async function recordDiscordWebhookMissing(config = {}, correlation = {}) {
  const normalizedCorrelation = normalizeDiscordCorrelation(correlation);
  await recordObservabilityDegraded({ config }, {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_url_missing',
    detail: 'discord webhook delivery skipped: config.discord_webhook_url is missing',
    gateway_label: normalizedCorrelation.gateway_label,
    module_id: normalizedCorrelation.module_id,
    gate_id: normalizedCorrelation.gate_id,
    gate_type: normalizedCorrelation.gate_type,
    session_key: normalizedCorrelation.session_key,
    attempt: normalizedCorrelation.attempt,
    dispatch_id: normalizedCorrelation.dispatch_id,
  });
}

async function recordDiscordWebhookRestored(config = {}, correlation = {}) {
  const normalizedCorrelation = normalizeDiscordCorrelation(correlation);
  await recordObservabilityRestored({ config }, {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_delivery_failed',
    detail: 'discord webhook delivery restored',
    gateway_label: normalizedCorrelation.gateway_label,
    module_id: normalizedCorrelation.module_id,
    gate_id: normalizedCorrelation.gate_id,
    gate_type: normalizedCorrelation.gate_type,
    session_key: normalizedCorrelation.session_key,
    attempt: normalizedCorrelation.attempt,
    dispatch_id: normalizedCorrelation.dispatch_id,
  });
}

async function recordDiscordAuditDegraded(config = {}, correlation = {}, err) {
  const normalizedCorrelation = normalizeDiscordCorrelation(correlation);
  await recordObservabilityDegraded({ config }, {
    component: 'discord',
    surface: 'audit_log',
    reason: 'audit_write_failed',
    detail: formatDiscordAuditFailureDetail(err),
    gateway_label: normalizedCorrelation.gateway_label,
    module_id: normalizedCorrelation.module_id,
    gate_id: normalizedCorrelation.gate_id,
    gate_type: normalizedCorrelation.gate_type,
    session_key: normalizedCorrelation.session_key,
    attempt: normalizedCorrelation.attempt,
    dispatch_id: normalizedCorrelation.dispatch_id,
  });
}

async function recordDiscordAuditRestored(config = {}, correlation = {}) {
  const normalizedCorrelation = normalizeDiscordCorrelation(correlation);
  await recordObservabilityRestored({ config }, {
    component: 'discord',
    surface: 'audit_log',
    reason: 'audit_write_failed',
    detail: 'discord audit log writes restored',
    gateway_label: normalizedCorrelation.gateway_label,
    module_id: normalizedCorrelation.module_id,
    gate_id: normalizedCorrelation.gate_id,
    gate_type: normalizedCorrelation.gate_type,
    session_key: normalizedCorrelation.session_key,
    attempt: normalizedCorrelation.attempt,
    dispatch_id: normalizedCorrelation.dispatch_id,
  });
}

async function appendDiscordAuditEntries(config = {}, level, embeds = [], opts = {}) {
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
  } catch (err) {
    await recordDiscordAuditDegraded(config, correlation, err);
    log('WARN', 'Discord audit log write failed (details suppressed for security)');
    return { ok: false, correlation, error: err };
  }
}

function deliveryReceiptTargets(config = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  return [
    artifacts.pipeline_dir ? path.join(artifacts.pipeline_dir, 'discord-deliveries.jsonl') : null,
    artifacts.run_log_dir ? path.join(artifacts.run_log_dir, 'discord-deliveries.jsonl') : null,
  ].filter(Boolean);
}

function deliveryReceiptFromResult(config = {}, level, correlation = {}, result = {}, embeds = []) {
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

function appendDiscordDeliveryReceipt(config = {}, level, correlation = {}, result = {}, embeds = []) {
  const targets = deliveryReceiptTargets(config);
  if (!targets.length) return;
  const receipt = deliveryReceiptFromResult(config, level, correlation, result, embeds);
  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${JSON.stringify(receipt)}\n`);
  }
}

function incrementDiscordNotificationStats(config = {}) {
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


function discordWebhookDeliveryMuted(config = {}) {
  if (config?._disable_discord_webhooks) return true;
  const rawEnv = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  const env = selectTruthyValue(() => (rawEnv === undefined), () => (rawEnv === null)) ? '' : String(rawEnv).trim().toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (env === '1'), () => (env === 'true'))), () => (env === 'yes'));
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
    const normalizedLevel = normalizeDiscordLevel(level);
    const runId = optionalText(selectDefinedValue(() => (config?._runId), () => (config?.run_id)));
    const normalizedEmbed = normalizeOperatorEmbed({ title, description, fields });
    const safeEmbed = requireSanitizedEmbeds(sanitizeDiscordMessage({
      embeds: [normalizedEmbed],
    }), 'discord.embed')[0];
    const correlation = mergeDiscordCorrelation(
      emptyDiscordCorrelation(),
      normalizeDiscordCorrelation(opts.correlation),
    );
    await appendDiscordAuditEntries(config, normalizedLevel, [{ ...safeEmbed, fields: arrayOrEmpty(safeEmbed.fields) }], { correlation });
    const injectedDiscord = resolveInjectedDiscord(opts, 'discord');
    if (typeof injectedDiscord === 'function') {
      await injectedDiscord(config, normalizedLevel, safeEmbed.title, safeEmbed.description, arrayOrEmpty(safeEmbed.fields), { correlation });
      return;
    }
    if (discordWebhookDeliveryMuted(config)) return;
    if (!config.discord_alerts?.[normalizedLevel.toLowerCase()]) return;
    if (!config.discord_webhook_url) {
      await recordDiscordWebhookMissing(config, correlation);
      return;
    }
    const style = discordStyle(normalizedLevel);
    const payload = buildCanonicalDiscordPayload({
        title: `${style.icon} ${safeEmbed.title}`,
        description: safeEmbed.description,
        color: style.color,
        fields: arrayOrEmpty(safeEmbed.fields).map(f => ({ name: f.name, value: String(f.value), inline: selectDefinedValue(() => (f.inline), () => (true)) })),
        footer: { text: `KubeClaw Pipeline · ${config.project}${runId ? ` · ${runId}` : ''}` },
        timestamp: new Date().toISOString(),
      });
    try {
      const result = await postDiscordWebhook(discordReceiptWebhookUrl(config.discord_webhook_url), {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: discordWebhookTimeoutMs(config),
      });
      appendDiscordDeliveryReceipt(config, normalizedLevel, correlation, result, arrayOrEmpty(payload.embeds));
      await recordDiscordWebhookRestored(config, correlation);
    } catch (err) {
      await recordDiscordWebhookDegraded(config, correlation, err);
      log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
      return;
    }
    try {
      incrementDiscordNotificationStats(config);
    } catch (error) {
      reportDiscordIncident(config, 'stats_update_failed', 'Discord delivery stats update failed', error, {
        level: 'DEBUG',
        scope: 'discord',
        includeErrorDetail: true,
      });
    }
  } catch (error) {
    reportDiscordIncident(config, 'notification_wrapper_failed', 'Discord notification handling failed (details suppressed for security)', error, {
      scope: 'discord',
      level: 'WARN',
      includeErrorDetail: false,
    });
  }
}

export async function discordEmbeds(config: any, embeds: any[] = [], opts: any = {}) {
  try {
    const normalizedEmbeds = arrayOrEmpty(embeds);
    if (!normalizedEmbeds.length) return;
    const runId = optionalText(selectDefinedValue(() => (config?._runId), () => (config?.run_id)));
    const level = normalizeDiscordLevel(opts.level);
    const safeEmbeds = requireSanitizedEmbeds(sanitizeDiscordMessage({
      embeds: normalizedEmbeds.map((embed) => ({
        ...normalizeOperatorEmbed(embed),
        footer: isPlainRecord(embed?.footer)
          ? embed.footer
          : { text: `KubeClaw Pipeline · ${requiredText(config?.project, 'config.project')}${runId ? ` · ${runId}` : ''}` },
        timestamp: selectDefinedValue(() => (optionalText(embed?.timestamp)), () => (new Date().toISOString())),
      })),
    }), 'discord.embeds');
    const correlation = mergeDiscordCorrelation(
      emptyDiscordCorrelation(),
      normalizeDiscordCorrelation(opts.correlation),
    );
    await appendDiscordAuditEntries(config, level, safeEmbeds.map((safeEmbed) => ({
      ...safeEmbed,
      fields: arrayOrEmpty(safeEmbed.fields),
    })), { correlation, correlations: opts.correlations, auditTargets: opts.auditTargets });
    const injectedDiscordEmbeds = resolveInjectedDiscord(opts, 'discordEmbeds');
    if (typeof injectedDiscordEmbeds === 'function') {
      await injectedDiscordEmbeds(config, safeEmbeds, opts);
      return;
    }
    if (discordWebhookDeliveryMuted(config)) return;
    if (!config.discord_alerts?.[String(level).toLowerCase()]) return;
    if (!config?.discord_webhook_url) {
      await recordDiscordWebhookMissing(config, correlation);
      return;
    }
    try {
      assertDiscordPayloadWithinLimits({ embeds: safeEmbeds }, 'discord.embeds');
      const result = await postDiscordWebhook(discordReceiptWebhookUrl(config.discord_webhook_url), {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: safeEmbeds }),
        timeoutMs: discordWebhookTimeoutMs(config),
      });
      appendDiscordDeliveryReceipt(config, level, correlation, result, safeEmbeds);
      await recordDiscordWebhookRestored(config, correlation);
    } catch (err) {
      await recordDiscordWebhookDegraded(config, correlation, err);
      log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
      return;
    }
    try {
      incrementDiscordNotificationStats(config);
    } catch (error) {
      reportDiscordIncident(config, 'stats_update_failed', 'Discord embed delivery stats update failed', error, {
        level: 'DEBUG',
        scope: 'discordEmbeds',
        includeErrorDetail: true,
      });
    }
  } catch (error) {
    reportDiscordIncident(config, 'notification_wrapper_failed', 'Discord embed handling failed (details suppressed for security)', error, {
      scope: 'discordEmbeds',
      level: 'WARN',
      includeErrorDetail: false,
    });
  }
}
