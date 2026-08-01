import { resolveDiscordWebhookUrl } from './runtime.js';
import { requireTelemetryStreamMaxLenFromConfig } from '../telemetry.js';
import {
  createTelemetryContext,
  emitEvent,
  closeTelemetry,
} from './telemetry.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.js';
import { sanitizeDiscordMessage } from '../egress.js';
import { postDiscordWebhook } from '../integrations/discord-webhook.js';
import { createObservabilityHealthState } from './observability-health.js';
import { loadBusterDiscordWebhookTimeoutMs, loadBusterPlatformConfig } from './runtime-policy.js';
import { readBusterEnvironment } from '../buster-environment.js';
import {
  appendDiscordCorrelation,
  persistDiscordArtifact,
  persistDiscordAuditReceipt,
  persistDiscordDeliveryReceipt,
  resolveDiscordAuditTargets,
  resolveDiscordDeliveryReceiptTargets,
} from './discord-artifacts.js';
import type { DiscordCorrelation as CorrelationContext, DiscordEmbed, DiscordPayload } from './discord-artifacts.js';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
declare const process: { stderr: { write(text: string): void } };

type AnyRecord = Record<string, any>;

interface DiscordIncidentOptions {
  scope?: string;
  includeErrorDetail?: boolean;
  level?: string;
}

interface DiscordContext extends AnyRecord {
  module_id?: unknown;
  gate_id?: unknown;
  gate_type?: unknown;
  project?: unknown;
  run_id?: unknown;
  attempt?: unknown;
  dispatch_id?: unknown;
  session_key?: unknown;
  log_dir?: unknown;
  pipeline_log_path?: unknown;
  pipeline_run_log_path?: unknown;
  telemetry_context?: AnyRecord | null;
  telemetry_enabled?: boolean;
  impact?: unknown;
  action?: unknown;
  evidence?: unknown;
  actionability?: AnyRecord | null;
  webhook_url?: unknown;
  disableDiscordWebhooks?: boolean;
}

const _discordHealth = createObservabilityHealthState();

function firstDefined<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function reportBusterDiscordIncident(context: DiscordContext | CorrelationContext = {}, classification: string, error: unknown, message: string, options: DiscordIncidentOptions = {}): void {
  reportClassifiedNonBlockingError({
    reporter: 'buster-discord',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'buster-discord',
      selectTruthyValue(() => (context?.project), () => ('missing_project')),
      selectTruthyValue(() => (context?.run_id), () => ('missing_run_id')),
      selectTruthyValue(() => (context?.module_id), () => ('scope_global')),
      classification,
      selectTruthyValue(() => (options.scope), () => ('scope_global'))
    ),
    message,
    error,
    includeErrorDetail: options.includeErrorDetail !== false,
    level: typeof options.level === 'string' && options.level.trim() ? options.level : 'WARN',
    fallback: (_level: string, line: string) => process.stderr.write(`${line}\n`),
  });
}

function normalizeIdentity(value: unknown): string | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  return String(value);
}

function normalizeAttempt(value: unknown): string | number | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : normalizeIdentity(value);
}

function hasExplicitDiscordPayload(message: AnyRecord): boolean {
  return selectTruthyValue(() => (selectTruthyValue(() => (Array.isArray(message?.embeds)), () => (message?.content !== undefined))), () => (message?.files !== undefined));
}

function normalizeMessage(message: AnyRecord): DiscordPayload {
  if (Array.isArray(message?.files) && message.files.length > 0) {
    throw new Error('Discord file attachments are not supported by sendDiscord');
  }

  return sanitizeDiscordMessage(
    hasExplicitDiscordPayload(message)
      ? {
          content: selectTruthyValue(() => (message.content), () => (undefined)),
          embeds: Array.isArray(message.embeds) ? message.embeds : undefined,
          files: [],
        }
      : { content: undefined, embeds: [message], files: [] }
  ) as DiscordPayload;
}

type ActionabilityKey = 'impact' | 'action' | 'evidence';

function contextActionabilityField(context: DiscordContext, actionability: AnyRecord, key: ActionabilityKey): string | null {
  return normalizeIdentity(firstDefined(context[key], actionability[key]));
}

function buildCorrelationContext(context: DiscordContext = {}): CorrelationContext {
  const actionability = context.actionability && typeof context.actionability === 'object' ? context.actionability : {};
  return {
    module_id: normalizeIdentity(context.module_id),
    gate_id: normalizeIdentity(context.gate_id),
    gate_type: normalizeIdentity(context.gate_type),
    project: normalizeIdentity(context.project),
    run_id: normalizeIdentity(context.run_id),
    attempt: normalizeAttempt(context.attempt),
    dispatch_id: normalizeIdentity(context.dispatch_id),
    session_key: normalizeIdentity(context.session_key),
    log_dir: normalizeIdentity(context.log_dir),
    pipeline_log_path: normalizeIdentity(context.pipeline_log_path),
    pipeline_run_log_path: normalizeIdentity(context.pipeline_run_log_path),
    telemetry_context: context.telemetry_context ? context.telemetry_context : null,
    telemetry_enabled: context.telemetry_enabled,
    impact: contextActionabilityField(context, actionability, 'impact'),
    action: contextActionabilityField(context, actionability, 'action'),
    evidence: contextActionabilityField(context, actionability, 'evidence'),
    webhook_url: resolveDiscordWebhookUrl(selectDefinedValue(() => (context.webhook_url), () => (null))),
  };
}

function discordHealthKey(correlation: Partial<CorrelationContext> = {}, surface = 'webhook'): string {
  const project = correlation.project ? correlation.project : 'missing_project';
  const runId = correlation.run_id ? correlation.run_id : 'missing_run_id';
  return `${surface}:${project}:${runId}`;
}

function buildTelemetryContext(correlation: CorrelationContext): { ctx: AnyRecord | null; owned: boolean } {
  if (correlation.telemetry_context) return { ctx: correlation.telemetry_context, owned: false };
  if (!correlation.project || !correlation.run_id) return { ctx: null, owned: false };
  return {
    ctx: createTelemetryContext({
      project: correlation.project,
      module_id: correlation.module_id ? correlation.module_id : correlation.gate_id ? correlation.gate_id : 'buster-discord',
      run_id: correlation.run_id,
      ...(correlation.telemetry_enabled === undefined ? {} : { enabled: correlation.telemetry_enabled }),
      log_dir: correlation.log_dir ? correlation.log_dir : null,
      pipeline_log_path: correlation.pipeline_log_path ? correlation.pipeline_log_path : null,
      pipeline_run_log_path: correlation.pipeline_run_log_path ? correlation.pipeline_run_log_path : null,
      attempt: selectDefinedValue(() => (correlation.attempt), () => (null)),
      dispatch_id: correlation.dispatch_id ? correlation.dispatch_id : null,
      session_key: correlation.session_key ? correlation.session_key : null,
      streamMaxLen: requireTelemetryStreamMaxLenFromConfig(loadBusterPlatformConfig()),
      emitter: 'buster/pipeline/services/discord',
    }),
    owned: true,
  };
}

function emitDiscordObservability(correlation: CorrelationContext, type: string, payload: AnyRecord = {}): void {
  const { ctx, owned } = buildTelemetryContext(correlation);
  if (!ctx) return;
  void (async () => {
    try { await emitEvent(ctx, type, payload); }
    finally { if (owned) await closeTelemetry(ctx); }
  })().catch((error) => {
    reportBusterDiscordIncident(correlation, 'telemetry_emit_failed', error, 'Buster Discord observability telemetry failed', {
      level: 'DEBUG',
      scope: 'telemetry',
    });
  });
}

function errorRecord(error: unknown): AnyRecord {
  return error && typeof error === 'object' ? error as AnyRecord : {};
}

function formatWebhookDeliveryDetail(error: unknown): string {
  const err = errorRecord(error);
  if (typeof err.status === 'number') {
    return `Buster Discord webhook delivery failed: HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`;
  }
  return `Buster Discord webhook delivery failed: ${selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (err.cause?.code), () => (err.code))), () => (err.message))), () => ('missing_delivery_error_detail'))}`;
}

function emitDiscordHealthChange(correlation: CorrelationContext, type: string, payload: AnyRecord): void {
  emitDiscordObservability(correlation, type, {
    component: 'buster_discord',
    surface: payload.surface,
    reason: payload.reason,
    detail: payload.detail,
    module_id: selectTruthyValue(() => (correlation.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (correlation.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (correlation.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (correlation.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (correlation.dispatch_id), () => (null)),
    session_key: selectTruthyValue(() => (correlation.session_key), () => (null)),
    ...payload,
  });
}

function markDiscordDegraded(correlation: CorrelationContext, surface: string, reason: string, detail: string): void {
  const key = discordHealthKey(correlation, surface);
  const transition = _discordHealth.markDegraded(key);
  if (!transition.shouldEmit) return;
  emitDiscordHealthChange(correlation, 'observability.degraded', {
    surface,
    reason,
    detail,
    degraded_at: transition.degradedAt,
  });
}

function emitDiscordRestoredIfNeeded(correlation: CorrelationContext, surface: string, reason: string, detail: string): void {
  const key = discordHealthKey(correlation, surface);
  const transition = _discordHealth.markRestored(key);
  if (!transition.shouldEmit) return;
  emitDiscordObservability(correlation, 'observability.restored', {
    component: 'buster_discord',
    surface,
    reason,
    detail,
    module_id: selectTruthyValue(() => (correlation.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (correlation.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (correlation.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (correlation.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (correlation.dispatch_id), () => (null)),
    session_key: selectTruthyValue(() => (correlation.session_key), () => (null)),
    degraded_at: transition.degradedAt,
    restored_at: transition.restoredAt,
    restored_after_ms: transition.restoredAfterMs,
  });
}

const discordArtifactCallbacks = {
  auditTargets: resolveDiscordAuditTargets,
  receiptTargets: resolveDiscordDeliveryReceiptTargets,
  degraded: markDiscordDegraded,
  restored: emitDiscordRestoredIfNeeded,
  incident: reportBusterDiscordIncident,
};
function discordWebhookDeliveryMuted(context: DiscordContext = {}): boolean {
  // STRICTIFY_TS_SLICE: context mute uses one canonical typed option. Legacy
  // `_disable_discord_webhooks`/`disable_discord_webhooks` aliases are not
  // accepted inside the Buster Discord owner.
  if (context.disableDiscordWebhooks === true) return true;
  const rawEnv = readBusterEnvironment('KUBECLAW_DISABLE_DISCORD_WEBHOOKS');
  const env = selectTruthyValue(() => (rawEnv === undefined), () => (rawEnv === null)) ? '' : String(rawEnv).trim().toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (env === '1'), () => (env === 'true'))), () => (env === 'yes'));
}

export function sendDiscord(message: AnyRecord | null | undefined, context: DiscordContext = {}): DiscordPayload | null {
  if (!message) return null;

  const correlation = buildCorrelationContext(context);
  const normalized = normalizeMessage(message);
  const payload = {
    content: normalized.content,
    embeds: (Array.isArray(normalized.embeds) ? normalized.embeds : []).map((embed: DiscordEmbed) => appendDiscordCorrelation(embed, correlation)),
  };

  persistDiscordArtifact(payload, correlation, discordArtifactCallbacks);

  if (discordWebhookDeliveryMuted(context)) {
    persistDiscordAuditReceipt(payload, correlation, normalizeIdentity(context.level) || 'INFO', 'muted', discordArtifactCallbacks);
    return payload;
  }
  if (!correlation.webhook_url) {
    persistDiscordAuditReceipt(payload, correlation, normalizeIdentity(context.level) || 'INFO', 'missing_webhook', discordArtifactCallbacks);
    return payload;
  }

  void postDiscordWebhook(correlation.webhook_url, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: loadBusterDiscordWebhookTimeoutMs(),
  })
    .then((result) => {
      persistDiscordDeliveryReceipt(payload, correlation, normalizeIdentity(context.level) || 'INFO', result || {}, discordArtifactCallbacks);
      emitDiscordRestoredIfNeeded(correlation, 'webhook', 'webhook_delivery_failed', 'Buster Discord webhook delivery restored');
    })
    .catch((error) => {
      markDiscordDegraded(correlation, 'webhook', 'webhook_delivery_failed', formatWebhookDeliveryDetail(error));
      reportBusterDiscordIncident(correlation, 'webhook_delivery_failed', error, 'Buster Discord webhook delivery failed', {
        scope: 'webhook',
      });
    });

  return payload;
}

export async function deliverDiscordWebhookRequest(request: AnyRecord = {}, context: DiscordContext = {}): Promise<AnyRecord> {
  const normalizedRequest = request;
  const correlation = buildCorrelationContext({
    ...context,
    webhook_url: selectDefinedValue(() => (normalizedRequest.webhook_url), () => (null)),
  });

  if (discordWebhookDeliveryMuted(context)) return { ok: true, skipped: true, muted: true };
  if (!correlation.webhook_url) return { ok: true, skipped: true, reason: 'missing_webhook' };

  const {
    webhook_url: _webhook_url,
    ...transportOptions
  } = normalizedRequest;
  if (!Number.isFinite(transportOptions.timeoutMs)) transportOptions.timeoutMs = loadBusterDiscordWebhookTimeoutMs();

  try {
    const result = await postDiscordWebhook(correlation.webhook_url, transportOptions);
    emitDiscordRestoredIfNeeded(correlation, 'webhook', 'webhook_delivery_failed', 'Buster Discord webhook delivery restored');
    return result;
  } catch (error) {
    markDiscordDegraded(correlation, 'webhook', 'webhook_delivery_failed', formatWebhookDeliveryDetail(error));
    reportBusterDiscordIncident(correlation, 'webhook_delivery_failed', error, 'Buster Discord webhook delivery failed', {
      scope: 'webhook',
    });
    throw error;
  }
}
