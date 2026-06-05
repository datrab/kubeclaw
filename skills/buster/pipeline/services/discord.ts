// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { resolveDiscordWebhookUrl } from './runtime.ts';
import {
  createTelemetryContext,
  emitEvent,
  closeTelemetry,
} from './telemetry.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeDiscordMessage } from '../redaction.ts';
import { postDiscordWebhook } from '../integrations/discord-webhook.ts';
import { createObservabilityHealthState } from './observability-health.ts';

declare const process: {
  env: Record<string, string | undefined>;
  stderr: { write(text: string): void };
};

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

interface CorrelationContext extends AnyRecord {
  module_id: string | null;
  gate_id: string | null;
  gate_type: string | null;
  project: string | null;
  run_id: string | null;
  attempt: string | number | null;
  dispatch_id: string | null;
  session_key: string | null;
  log_dir: string | null;
  pipeline_log_path: string | null;
  pipeline_run_log_path: string | null;
  telemetry_context: AnyRecord | null;
  telemetry_enabled: boolean | undefined;
  impact: string | null;
  action: string | null;
  evidence: string | null;
  webhook_url: string | null;
}

interface DiscordField {
  name?: unknown;
  value?: unknown;
  inline?: boolean;
}

interface DiscordEmbed extends AnyRecord {
  fields?: DiscordField[];
}

interface DiscordPayload {
  content?: unknown;
  embeds?: DiscordEmbed[];
  files?: unknown[];
}

const _discordHealth = createObservabilityHealthState();

function reportBusterDiscordIncident(context: DiscordContext | CorrelationContext = {}, classification: string, error: unknown, message: string, options: DiscordIncidentOptions = {}): void {
  reportClassifiedNonBlockingError({
    reporter: 'buster-discord',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'buster-discord',
      context?.project || 'unknown',
      context?.run_id || 'unknown',
      context?.module_id || 'global',
      classification,
      options.scope || 'global'
    ),
    message,
    error,
    includeErrorDetail: options.includeErrorDetail ?? true,
    level: options.level || 'WARN',
    fallback: (_level: string, line: string) => process.stderr.write(`${line}\n`),
  });
}

function normalizeIdentity(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeAttempt(value: unknown): string | number | null {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : normalizeIdentity(value);
}

function truncateDiscordField(value: unknown, maxLength = 1024): string {
  const text = String(value || '').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeMessage(message: AnyRecord): DiscordPayload {
  if (Array.isArray(message?.files) && message.files.length > 0) {
    throw new Error('Discord file attachments are not supported by sendDiscord');
  }

  return sanitizeDiscordMessage(
    (message?.embeds || message?.content || message?.files)
      ? {
          content: message.content || undefined,
          embeds: Array.isArray(message.embeds) ? message.embeds : undefined,
          files: [],
        }
      : { content: undefined, embeds: [message], files: [] }
  ) as DiscordPayload;
}

function buildCorrelationContext(context: DiscordContext = {}): CorrelationContext {
  const actionability = context.actionability || {};
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
    telemetry_context: context.telemetry_context || null,
    telemetry_enabled: context.telemetry_enabled,
    impact: normalizeIdentity(context.impact ?? actionability.impact),
    action: normalizeIdentity(context.action ?? actionability.action),
    evidence: normalizeIdentity(context.evidence ?? actionability.evidence),
    webhook_url: resolveDiscordWebhookUrl(context.webhook_url ?? null),
  };
}

function defaultImpact(correlation: Partial<CorrelationContext> = {}): string {
  if (correlation.gate_id) return `Buster reported an operator-visible event for gate ${correlation.gate_id}.`;
  if (correlation.module_id) return `Buster reported an operator-visible event for module ${correlation.module_id}.`;
  return 'Buster reported an operator-visible event.';
}

function defaultAction(correlation: Partial<CorrelationContext> = {}): string {
  if (correlation.run_id) return `Open latest.json for run ${correlation.run_id}, then inspect the run-scoped pipeline and Discord artifacts.`;
  return 'Inspect the run-scoped pipeline and Discord artifacts, then use the Buster diagnostic copy if run artifacts are unavailable.';
}

function defaultEvidence(correlation: Partial<CorrelationContext> = {}): string {
  const evidence: string[] = [];
  if (correlation.pipeline_run_log_path) evidence.push(`run pipeline: ${correlation.pipeline_run_log_path}`);
  if (correlation.pipeline_run_log_path) evidence.push(`run discord: ${path.join(path.dirname(correlation.pipeline_run_log_path), 'discord.jsonl')}`);
  if (correlation.log_dir) evidence.push(`buster diagnostic: ${path.join(correlation.log_dir, 'discord.jsonl')}`);
  return evidence.length ? evidence.join('\n') : 'Run-scoped Discord artifact; Buster diagnostic discord.jsonl if run path is unavailable.';
}

function discordHealthKey(correlation: Partial<CorrelationContext> = {}, surface = 'webhook'): string {
  return `${surface}:${correlation.project || 'unknown'}:${correlation.run_id || 'unknown'}`;
}

function resolveDiscordAuditTargets(correlation: Partial<CorrelationContext> = {}): string[] {
  const targets: string[] = [];
  if (correlation.log_dir) targets.push(path.join(correlation.log_dir, 'discord.jsonl'));
  if (correlation.pipeline_log_path) targets.push(path.join(path.dirname(correlation.pipeline_log_path), 'discord.jsonl'));
  if (correlation.pipeline_run_log_path) targets.push(path.join(path.dirname(correlation.pipeline_run_log_path), 'discord.jsonl'));
  return [...new Set(targets)];
}

function buildTelemetryContext(correlation: CorrelationContext): { ctx: AnyRecord | null; owned: boolean } {
  if (correlation.telemetry_context) return { ctx: correlation.telemetry_context, owned: false };
  if (!correlation.project || !correlation.run_id) return { ctx: null, owned: false };
  return {
    ctx: createTelemetryContext({
      project: correlation.project,
      module_id: correlation.module_id || correlation.gate_id || 'buster-discord',
      run_id: correlation.run_id,
      enabled: correlation.telemetry_enabled,
      log_dir: correlation.log_dir || null,
      pipeline_log_path: correlation.pipeline_log_path || null,
      pipeline_run_log_path: correlation.pipeline_run_log_path || null,
      attempt: correlation.attempt ?? null,
      dispatch_id: correlation.dispatch_id || null,
      session_key: correlation.session_key || null,
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
  return `Buster Discord webhook delivery failed: ${err.cause?.code || err.code || err.message || 'unknown'}`;
}

function emitDiscordHealthChange(correlation: CorrelationContext, type: string, payload: AnyRecord): void {
  emitDiscordObservability(correlation, type, {
    component: 'buster_discord',
    surface: payload.surface,
    reason: payload.reason,
    detail: payload.detail,
    module_id: correlation.module_id || null,
    gate_id: correlation.gate_id || null,
    gate_type: correlation.gate_type || null,
    attempt: correlation.attempt ?? null,
    dispatch_id: correlation.dispatch_id || null,
    session_key: correlation.session_key || null,
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
    module_id: correlation.module_id || null,
    gate_id: correlation.gate_id || null,
    gate_type: correlation.gate_type || null,
    attempt: correlation.attempt ?? null,
    dispatch_id: correlation.dispatch_id || null,
    session_key: correlation.session_key || null,
    degraded_at: transition.degradedAt,
    restored_at: transition.restoredAt,
    restored_after_ms: transition.restoredAfterMs,
  });
}

function existingFieldNames(embed: DiscordEmbed = {}): Set<string> {
  return new Set((embed.fields || []).map((field) => String(field?.name || '').trim().toLowerCase()));
}

function appendCorrelationFields(embed: DiscordEmbed = {}, correlation: CorrelationContext): DiscordEmbed {
  const fields = Array.isArray(embed.fields) ? [...embed.fields] : [];
  const names = existingFieldNames(embed);

  if (!names.has('impact')) {
    fields.push({ name: 'Impact', value: truncateDiscordField(correlation.impact || defaultImpact(correlation)), inline: false });
  }
  if (!names.has('action')) {
    fields.push({ name: 'Action', value: truncateDiscordField(correlation.action || defaultAction(correlation)), inline: false });
  }
  if (!names.has('evidence')) {
    fields.push({ name: 'Evidence', value: truncateDiscordField(correlation.evidence || defaultEvidence(correlation)), inline: false });
  }

  if (correlation.run_id && !names.has('run') && !names.has('run id') && !names.has('run_id')) {
    fields.push({ name: 'Run', value: `\`${correlation.run_id}\``, inline: true });
  }
  if (correlation.attempt != null && !names.has('attempt')) {
    fields.push({ name: 'Attempt', value: `\`${correlation.attempt}\``, inline: true });
  }
  if (correlation.dispatch_id && !names.has('dispatch')) {
    fields.push({ name: 'Dispatch', value: `\`${correlation.dispatch_id}\``, inline: true });
  }
  if (correlation.gate_id && !names.has('gate')) {
    fields.push({ name: 'Gate', value: `\`${correlation.gate_id}\``, inline: true });
  }
  if (correlation.gate_type && !names.has('gate type') && !names.has('gate_type')) {
    fields.push({ name: 'Gate Type', value: `\`${correlation.gate_type}\``, inline: true });
  }
  if (correlation.session_key && !names.has('session')) {
    fields.push({ name: 'Session', value: `\`${correlation.session_key}\``, inline: false });
  }

  return { ...embed, fields };
}

function persistDiscordArtifact(payload: DiscordPayload, correlation: CorrelationContext): void {
  const targets = resolveDiscordAuditTargets(correlation);
  if (!targets.length) return;

  const entry = {
    ts: new Date().toISOString(),
    channel: 'discord',
    source: 'buster',
    module_id: correlation.module_id,
    gate_id: correlation.gate_id,
    gate_type: correlation.gate_type,
    project: correlation.project,
    run_id: correlation.run_id,
    attempt: correlation.attempt,
    dispatch_id: correlation.dispatch_id,
    session_key: correlation.session_key,
    actionability: {
      impact: correlation.impact || defaultImpact(correlation),
      action: correlation.action || defaultAction(correlation),
      evidence: correlation.evidence || defaultEvidence(correlation),
    },
    payload,
  };
  const failures: string[] = [];

  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, JSON.stringify(entry) + '\n');
    } catch (error) {
      const err = errorRecord(error);
      failures.push(`${target}: ${err.code || err.message || 'unknown'}`);
    }
  }

  if (failures.length) {
    const error = new Error(failures.join('; '));
    markDiscordDegraded(correlation, 'audit_log', 'audit_write_failed', `Buster Discord audit write failed: ${failures.join('; ')}`);
    reportBusterDiscordIncident(correlation, 'artifact_write_failed', error, 'Buster Discord artifact write failed', {
      level: 'DEBUG',
      scope: 'artifact',
    });
    return;
  }

  emitDiscordRestoredIfNeeded(correlation, 'audit_log', 'audit_write_failed', 'Buster Discord audit writes restored');
}

function discordWebhookDeliveryMuted(context: DiscordContext = {}): boolean {
  // STRICTIFY_TS_SLICE: context mute uses one canonical typed option. Legacy
  // `_disable_discord_webhooks`/`disable_discord_webhooks` aliases are not
  // accepted inside the Buster Discord owner.
  if (context.disableDiscordWebhooks === true) return true;
  const env = String(process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS || '').trim().toLowerCase();
  return env === '1' || env === 'true' || env === 'yes';
}

export function sendDiscord(message: AnyRecord | null | undefined, context: DiscordContext = {}): DiscordPayload | null {
  if (!message) return null;

  const correlation = buildCorrelationContext(context);
  const normalized = normalizeMessage(message);
  const payload = {
    content: normalized.content,
    embeds: (normalized.embeds || []).map((embed: DiscordEmbed) => appendCorrelationFields(embed, correlation)),
  };

  persistDiscordArtifact(payload, correlation);

  if (discordWebhookDeliveryMuted(context)) return payload;
  if (!correlation.webhook_url) return payload;

  void postDiscordWebhook(correlation.webhook_url, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(() => {
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
  const normalizedRequest = request || {};
  const correlation = buildCorrelationContext({
    ...context,
    webhook_url: normalizedRequest.webhook_url ?? context.webhook_url ?? null,
  });

  if (discordWebhookDeliveryMuted(context)) return { ok: true, skipped: true, muted: true };
  if (!correlation.webhook_url) return { ok: true, skipped: true, reason: 'missing_webhook' };

  const {
    webhook_url: _webhook_url,
    ...transportOptions
  } = normalizedRequest;

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
