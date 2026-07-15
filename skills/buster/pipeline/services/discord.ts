// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { resolveDiscordWebhookUrl } from './runtime.ts';
import { requireTelemetryStreamMaxLenFromConfig } from '../telemetry.ts';
import {
  createTelemetryContext,
  emitEvent,
  closeTelemetry,
} from './telemetry.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeDiscordMessage } from '../egress.ts';
import { postDiscordWebhook } from '../integrations/discord-webhook.ts';
import { createObservabilityHealthState } from './observability-health.ts';
import { loadBusterPlatformConfig } from './runtime-policy.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

function discordWebhookTimeoutMs(): number {
  const config = loadBusterPlatformConfig();
  if (selectTruthyValue(() => (selectTruthyValue(() => (!config?.discord), () => (typeof config.discord !== 'object'))), () => (Array.isArray(config.discord)))) {
    throw new Error('config.discord: required platform config object in swarm.config.json');
  }
  const timeoutMs = config.discord.webhook_timeout_ms;
  if (selectTruthyValue(() => (!Number.isInteger(timeoutMs)), () => (timeoutMs <= 0))) {
    throw new Error('config.discord.webhook_timeout_ms: required positive integer in swarm.config.json');
  }
  return timeoutMs;
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

function truncateDiscordField(value: unknown, maxLength = 1024): string {
  const text = normalizeOperatorStatusText(value).trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeOperatorStatusText(value: unknown): string {
  return value == null ? '' : String(value);
}

function normalizeOperatorModelText(value: unknown): string {
  return normalizeOperatorStatusText(value)
    .replace(/\bopenai-codex\//gi, 'openai/')
    .replace(/\bcodex-(\d[\w.-]*)\b/gi, 'gpt-$1');
}

function normalizeOperatorFieldValue(field: DiscordField = {}): string {
  const statusNormalized = normalizeOperatorStatusText(field.value);
  return normalizeOperatorStatusText(field.name).trim().toLowerCase() === 'model'
    ? normalizeOperatorModelText(statusNormalized)
    : statusNormalized;
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
    telemetry_context: selectTruthyValue(() => (context.telemetry_context), () => (null)),
    telemetry_enabled: context.telemetry_enabled,
    impact: contextActionabilityField(context, actionability, 'impact'),
    action: contextActionabilityField(context, actionability, 'action'),
    evidence: contextActionabilityField(context, actionability, 'evidence'),
    webhook_url: resolveDiscordWebhookUrl(selectDefinedValue(() => (context.webhook_url), () => (null))),
  };
}

function defaultImpact(correlation: Partial<CorrelationContext> = {}): string {
  if (correlation.gate_id) return `Buster reported a pipeline event for gate ${correlation.gate_id}.`;
  if (correlation.module_id) return `Buster reported a pipeline event for module ${correlation.module_id}.`;
  return 'Buster reported a pipeline event.';
}

function defaultAction(correlation: Partial<CorrelationContext> = {}): string {
  if (correlation.run_id) return `Read the notification content for run ${correlation.run_id}, then fix or resume according to the listed status.`;
  return 'Read the notification content, then fix or resume according to the listed status.';
}

function defaultEvidence(_correlation: Partial<CorrelationContext> = {}): string {
  return 'No structured embed fields were provided; use the notification content as the operator-visible evidence.';
}

function discordHealthKey(correlation: Partial<CorrelationContext> = {}, surface = 'webhook'): string {
  const project = correlation.project ? correlation.project : 'missing_project';
  const runId = correlation.run_id ? correlation.run_id : 'missing_run_id';
  return `${surface}:${project}:${runId}`;
}

function resolveDiscordAuditTargets(correlation: Partial<CorrelationContext> = {}): string[] {
  const targets: string[] = [];
  if (correlation.log_dir) targets.push(path.join(correlation.log_dir, 'discord.jsonl'));
  if (correlation.pipeline_log_path) targets.push(path.join(path.dirname(correlation.pipeline_log_path), 'discord.jsonl'));
  if (correlation.pipeline_run_log_path) targets.push(path.join(path.dirname(correlation.pipeline_run_log_path), 'discord.jsonl'));
  return [...new Set(targets)];
}

function resolveDiscordDeliveryReceiptTargets(correlation: Partial<CorrelationContext> = {}): string[] {
  const targets: string[] = [];
  if (correlation.pipeline_log_path) targets.push(path.join(path.dirname(correlation.pipeline_log_path), 'discord-deliveries.jsonl'));
  if (correlation.pipeline_run_log_path) targets.push(path.join(path.dirname(correlation.pipeline_run_log_path), 'discord-deliveries.jsonl'));
  return [...new Set(targets)];
}

function buildTelemetryContext(correlation: CorrelationContext): { ctx: AnyRecord | null; owned: boolean } {
  if (correlation.telemetry_context) return { ctx: correlation.telemetry_context, owned: false };
  if (selectTruthyValue(() => (!correlation.project), () => (!correlation.run_id))) return { ctx: null, owned: false };
  return {
    ctx: createTelemetryContext({
      project: correlation.project,
      module_id: correlation.module_id ? correlation.module_id : correlation.gate_id ? correlation.gate_id : 'buster-discord',
      run_id: correlation.run_id,
      enabled: correlation.telemetry_enabled,
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

function existingFieldNames(embed: DiscordEmbed = {}): Set<string> {
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  return new Set(fields.map((field) => normalizeOperatorStatusText(field?.name).trim().toLowerCase()));
}

function fieldValue(embed: DiscordEmbed = {}, name: string): string | null {
  const target = name.trim().toLowerCase();
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const field = fields.find((candidate) => normalizeOperatorStatusText(candidate?.name).trim().toLowerCase() === target);
  const value = field ? normalizeOperatorFieldValue(field).trim() : '';
  return value ? value : null;
}

function actionabilityEvidenceFromEmbed(embed: DiscordEmbed = {}): string {
  const skipNames = new Set(['impact', 'action', 'evidence', 'run', 'run id', 'attempt', 'dispatch', 'session']);
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const lines = fields
    .filter((field) => !skipNames.has(normalizeOperatorStatusText(field?.name).trim().toLowerCase()))
    .map((field) => {
      const name = selectTruthyValue(() => (normalizeOperatorStatusText(field?.name).trim()), () => ('Missing field name'));
      const value = normalizeOperatorFieldValue(field).trim();
      return value ? `${name}: ${value}` : null;
    })
    .filter(Boolean);
  if (lines.length) return truncateDiscordField(lines.join('\n'));
  const title = embed.title ? embed.title : 'Notification';
  const description = embed.description ? embed.description : 'No additional details provided.';
  return truncateDiscordField(`${normalizeOperatorStatusText(title)}: ${normalizeOperatorStatusText(description)}`);
}

function actionabilityImpactFromEmbed(embed: DiscordEmbed = {}, correlation: Partial<CorrelationContext> = {}): string {
  const status = fieldValue(embed, 'Status');
  const summaryField = fieldValue(embed, 'Summary');
  const issueField = fieldValue(embed, 'Issue');
  const description = embed.description ? embed.description : '';
  const summary = summaryField ? summaryField : issueField ? issueField : normalizeOperatorStatusText(description);
  const subject = correlation.gate_id
    ? `gate ${correlation.gate_id}`
    : correlation.module_id
      ? `module ${correlation.module_id}`
      : 'this run';
  const title = embed.title ? embed.title : 'Buster notification';
  return truncateDiscordField(`${normalizeOperatorStatusText(title)} for ${subject}${status ? ` reported ${status}` : ''}.${summary ? ` ${summary}` : ''}`);
}

function actionabilityActionFromEmbed(embed: DiscordEmbed = {}): string {
  const statusField = fieldValue(embed, 'Status');
  const status = (statusField ? statusField : '').toUpperCase();
  if (status === 'PASS') return 'No operator action required; continue with the next pipeline step.';
  if (status === 'FAIL') return 'Fix the listed failed suite or infrastructure issue, then resume or rerun the pipeline step.';
  if (/spawned/i.test(String(embed.title ? embed.title : ''))) return 'Wait for the spawned Buster session to finish, then inspect the completion notification.';
  return 'Read the notification fields and act on the listed status, issue, or failure reason.';
}

function actionabilityFieldNeedsReplacement(name: string, value: unknown): boolean {
  const normalizedName = normalizeOperatorStatusText(name).trim().toLowerCase();
  const text = normalizeOperatorStatusText(value).trim();
  if (!text) return true;
  if (normalizedName === 'impact' && /^Buster reported an operator-visible event/i.test(text)) return true;
  if (normalizedName === 'action' && /(open latest\.json|inspect the run-scoped pipeline and Discord artifacts?|inspect.*artifacts?)/i.test(text)) return true;
  if (normalizedName === 'evidence' && /(run pipeline:|run discord:|buster diagnostic:|latest\.json|discord\.jsonl)/i.test(text)) return true;
  return false;
}

function upsertActionabilityField(fields: DiscordField[], names: Set<string>, name: 'Impact' | 'Action' | 'Evidence', value: string): void {
  const normalizedName = name.toLowerCase();
  const index = fields.findIndex((field) => normalizeOperatorStatusText(field?.name).trim().toLowerCase() === normalizedName);
  if (index >= 0 && !actionabilityFieldNeedsReplacement(normalizedName, fields[index]?.value)) return;
  const field = { name, value: truncateDiscordField(value), inline: false };
  if (index >= 0) fields[index] = { ...fields[index], ...field };
  else fields.push(field);
  names.add(normalizedName);
}

function actionabilityFieldFromPayload(payload: DiscordPayload, name: string): string | null {
  const embed = Array.isArray(payload.embeds) ? payload.embeds[0] : null;
  if (!embed) return null;
  return fieldValue(embed, name);
}

function appendCorrelationFields(embed: DiscordEmbed = {}, correlation: CorrelationContext): DiscordEmbed {
  const fields = Array.isArray(embed.fields)
    ? embed.fields.map((field) => ({ ...field, value: normalizeOperatorFieldValue(field) }))
    : [];
  const names = existingFieldNames(embed);
  const normalizedEmbed = {
    ...embed,
    title: normalizeOperatorStatusText(embed.title),
    description: normalizeOperatorStatusText(embed.description),
    fields,
  };

  const impact = !actionabilityFieldNeedsReplacement('impact', correlation.impact)
    ? String(correlation.impact)
    : actionabilityImpactFromEmbed(normalizedEmbed, correlation);
  const action = !actionabilityFieldNeedsReplacement('action', correlation.action)
    ? String(correlation.action)
    : actionabilityActionFromEmbed(normalizedEmbed);
  const evidence = !actionabilityFieldNeedsReplacement('evidence', correlation.evidence)
    ? String(correlation.evidence)
    : actionabilityEvidenceFromEmbed(normalizedEmbed);
  upsertActionabilityField(fields, names, 'Impact', impact);
  upsertActionabilityField(fields, names, 'Action', action);
  upsertActionabilityField(fields, names, 'Evidence', evidence);

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

  return { ...normalizedEmbed, fields };
}

function resolvedActionabilityField(
  payload: DiscordPayload,
  correlation: CorrelationContext,
  key: ActionabilityKey,
  label: string,
  defaultValue: (correlation: Partial<CorrelationContext>) => string
): string {
  if (!actionabilityFieldNeedsReplacement(key, correlation[key])) return correlation[key] as string;
  const fromPayload = actionabilityFieldFromPayload(payload, label);
  return fromPayload ? fromPayload : defaultValue(correlation);
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
      impact: resolvedActionabilityField(payload, correlation, 'impact', 'Impact', defaultImpact),
      action: resolvedActionabilityField(payload, correlation, 'action', 'Action', defaultAction),
      evidence: resolvedActionabilityField(payload, correlation, 'evidence', 'Evidence', defaultEvidence),
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
      failures.push(`${target}: ${selectTruthyValue(() => (selectTruthyValue(() => (err.code), () => (err.message))), () => ('missing_error_detail'))}`);
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

function firstEmbedTitle(payload: DiscordPayload): string | null {
  const embed = Array.isArray(payload.embeds) ? payload.embeds[0] : null;
  const title = normalizeOperatorStatusText(embed?.title).trim();
  return title ? title : null;
}

function persistDiscordDeliveryReceipt(payload: DiscordPayload, correlation: CorrelationContext, level: string, result: AnyRecord = {}): void {
  const targets = resolveDiscordDeliveryReceiptTargets(correlation);
  if (!targets.length) return;
  const receipt = {
    ts: new Date().toISOString(),
    source: 'buster',
    project: correlation.project,
    run_id: correlation.run_id,
    level,
    ok: true,
    http_status: selectDefinedValue(() => (result.status), () => (200)),
    status_text: selectDefinedValue(() => (result.statusText), () => ('OK')),
    message_id: selectTruthyValue(() => (result.body?.id), () => (result.message_id || null)),
    channel_id: selectTruthyValue(() => (result.body?.channel_id), () => (result.channel_id || null)),
    webhook_message_returned: Boolean(result.body?.id || result.message_id),
    title: firstEmbedTitle(payload),
    correlation: {
      run_id: correlation.run_id,
      session_key: correlation.session_key,
      attempt: correlation.attempt,
      module_id: correlation.module_id,
      gate_id: correlation.gate_id,
      gate_type: correlation.gate_type,
      dispatch_id: correlation.dispatch_id,
    },
  };
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, JSON.stringify(receipt) + '\n');
    } catch (error) {
      reportBusterDiscordIncident(correlation, 'delivery_receipt_write_failed', error, 'Buster Discord delivery receipt write failed', {
        level: 'DEBUG',
        scope: 'delivery_receipt',
      });
    }
  }
}

function persistDiscordAuditReceipt(payload: DiscordPayload, correlation: CorrelationContext, level: string, reason: string): void {
  persistDiscordDeliveryReceipt(payload, correlation, level, {
    status: 0,
    statusText: reason,
    message_id: null,
    channel_id: null,
    body: null,
  });
}

function discordWebhookDeliveryMuted(context: DiscordContext = {}): boolean {
  // STRICTIFY_TS_SLICE: context mute uses one canonical typed option. Legacy
  // `_disable_discord_webhooks`/`disable_discord_webhooks` aliases are not
  // accepted inside the Buster Discord owner.
  if (context.disableDiscordWebhooks === true) return true;
  const rawEnv = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  const env = selectTruthyValue(() => (rawEnv === undefined), () => (rawEnv === null)) ? '' : String(rawEnv).trim().toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (env === '1'), () => (env === 'true'))), () => (env === 'yes'));
}

export function sendDiscord(message: AnyRecord | null | undefined, context: DiscordContext = {}): DiscordPayload | null {
  if (!message) return null;

  const correlation = buildCorrelationContext(context);
  const normalized = normalizeMessage(message);
  const payload = {
    content: normalized.content,
    embeds: (Array.isArray(normalized.embeds) ? normalized.embeds : []).map((embed: DiscordEmbed) => appendCorrelationFields(embed, correlation)),
  };

  persistDiscordArtifact(payload, correlation);

  if (discordWebhookDeliveryMuted(context)) {
    persistDiscordAuditReceipt(payload, correlation, normalizeIdentity(context.level) || 'INFO', 'muted');
    return payload;
  }
  if (!correlation.webhook_url) {
    persistDiscordAuditReceipt(payload, correlation, normalizeIdentity(context.level) || 'INFO', 'missing_webhook');
    return payload;
  }

  void postDiscordWebhook(correlation.webhook_url, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: discordWebhookTimeoutMs(),
  })
    .then((result) => {
      persistDiscordDeliveryReceipt(payload, correlation, normalizeIdentity(context.level) || 'INFO', result || {});
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
  if (!Number.isFinite(transportOptions.timeoutMs)) transportOptions.timeoutMs = discordWebhookTimeoutMs();

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
