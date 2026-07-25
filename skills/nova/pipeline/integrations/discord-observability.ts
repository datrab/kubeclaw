import { log } from '../core/logger.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from '../services/observability.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { normalizeDiscordCorrelation, normalizeDiscordLevel, requiredBoolean, requiredText } from './discord-values.ts';

export function reportDiscordIncident(config: any = {}, classification: any, message: any, error: any = null, options: any = {}) {
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

function formatDiscordDeliveryFailureDetail(err: any) {
  if (typeof err?.status === 'number') {
    return `discord webhook delivery failed: HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`;
  }
  if (err?.cause?.code) return `discord webhook delivery failed: ${String(err.cause.code)}`;
  if (err?.code && err.code !== 'DISCORD_WEBHOOK_DELIVERY_FAILED') return `discord webhook delivery failed: ${String(err.code)}`;
  if (err?.message) return `discord webhook delivery failed: ${String(err.message)}`;
  return 'discord webhook delivery failed';
}

function discordDeliveryFailurePayload(err: any) {
  const failurePayload = {
    failure_class: 'webhook_delivery_failed',
    http_status: typeof err?.status === 'number' ? err.status : null,
    error_code: selectTruthyValue(() => (selectTruthyValue(() => (err?.cause?.code), () => (err?.code))), () => (null)),
    body_preview: typeof err?.bodyPreview === 'string' && err.bodyPreview.trim() ? err.bodyPreview.trim().slice(0, 500) : null,
  };
  return Object.fromEntries(Object.entries(failurePayload).filter(([, value]: any) => value !== null && value !== undefined && value !== ''));
}

function formatDiscordAuditFailureDetail(err: any) {
  if (err?.code) return `discord audit log write failed: ${String(err.code)}`;
  if (err?.message) return `discord audit log write failed: ${String(err.message)}`;
  return 'discord audit log write failed';
}

export async function recordDiscordWebhookDegraded(config: any = {}, correlation: any = {}, err: any) {
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

export async function recordDiscordWebhookMissing(config: any = {}, correlation: any = {}) {
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

export async function recordDiscordWebhookRestored(config: any = {}, correlation: any = {}) {
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

export async function recordDiscordAuditDegraded(config: any = {}, correlation: any = {}, err: any) {
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

export async function recordDiscordAuditRestored(config: any = {}, correlation: any = {}) {
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
