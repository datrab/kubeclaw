import { getRunId } from '../core/runtime.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../core/constants.ts';
import { discord, discordEmbeds } from '../integrations/discord.ts';
import { appendStructuredEventMirror, recordObservabilityDegraded, recordObservabilityRestored } from './observability.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';
import { deepClone } from './serialization.ts';

type UnknownRecord = Record<string, any>;

export const NOTIFICATION_HOOK_IDS: readonly string[] = Object.freeze([
  'pipeline.started',
  'pipeline.completed',
  'module.started',
  'module.completed',
  'gate.started',
  'gate.completed',
]);

const NOTIFICATION_SINK_PRIORITIES: Record<string, number> = Object.freeze({
  telemetry: 100,
  structured_event_artifact: 200,
  discord: 300,
});
function canonicalRef(prefix: string, value: unknown): string | null {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.startsWith(`${prefix}:`) ? normalized : `${prefix}:${normalized}`;
}

async function readNotificationConfig(ctx: UnknownRecord = {}): Promise<UnknownRecord> {
  if (typeof ctx?.coreRuntime?.readConfig === 'function') return ctx.coreRuntime.readConfig();
  throw new Error('Notification plugin requires explicit coreRuntime config; public PluginContextV1 does not expose read.config()');
}

function normalizeNotificationIds(hookId: string, ctx: UnknownRecord = {}, envelope: UnknownRecord = {}): UnknownRecord {
  const config = ctx?.config || {};
  const explicitIds = envelope?.ids || {};
  const eventPayload = envelope?.event?.payload || {};
  const runId = explicitIds.runId || explicitIds.run_id || ctx?.runId || getRunId(config) || config?._runId || config?.run_id || null;
  const moduleId = explicitIds.moduleId || explicitIds.module_id || eventPayload.module_id || null;
  const gateId = explicitIds.gateId || explicitIds.gate_id || eventPayload.gate_id || null;
  const gateType = explicitIds.gateType || explicitIds.gate_type || eventPayload.gate_type || null;
  const attempt = explicitIds.attempt ?? eventPayload.attempt ?? null;
  return {
    hookId,
    runId,
    moduleId,
    attempt,
    gateId,
    gateType,
    stageId: explicitIds.stageId || explicitIds.stage_id || hookId,
  };
}

function normalizeNotificationRefs(ids: UnknownRecord = {}, envelope: UnknownRecord = {}): UnknownRecord {
  const explicitRefs = envelope?.refs || {};
  const runRef = explicitRefs.runRef || explicitRefs.run_ref || canonicalRef('run', ids.runId);
  const moduleAttemptRef = explicitRefs.moduleAttemptRef || explicitRefs.module_attempt_ref
    || (ids.runId && ids.moduleId && ids.attempt != null ? `module_attempt:${ids.runId}:${ids.moduleId}:${ids.attempt}` : null);
  const gateEvaluationRef = explicitRefs.gateEvaluationRef || explicitRefs.gate_evaluation_ref
    || (ids.runId && ids.gateId ? `gate_evaluation:${ids.runId}:${ids.gateId}:${ids.attempt || 1}` : null);
  const primaryRef = explicitRefs.primaryRef || explicitRefs.primary_ref
    || moduleAttemptRef
    || gateEvaluationRef
    || canonicalRef('module', ids.moduleId)
    || canonicalRef('gate', ids.gateId)
    || runRef
    || canonicalRef('stage', ids.stageId);
  return {
    runRef,
    moduleAttemptRef,
    gateEvaluationRef,
    primaryRef,
  };
}

function normalizeFieldName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function hasActionableValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  return false;
}

function collectDiscordFields(discordPresentation: UnknownRecord = {}): UnknownRecord[] {
  const fields: UnknownRecord[] = [];
  if (Array.isArray(discordPresentation.fields)) fields.push(...discordPresentation.fields);
  if (Array.isArray(discordPresentation.embeds)) {
    for (const embed of discordPresentation.embeds) {
      if (Array.isArray(embed?.fields)) fields.push(...embed.fields);
    }
  }
  return fields;
}

function discordPresentationRequiresActionableContract(discordPresentation: UnknownRecord = {}): boolean {
  const explicitFlags = [
    discordPresentation.critical,
    discordPresentation.require_actionable,
    discordPresentation.requires_actionable_contract,
  ];
  if (explicitFlags.some((value) => value === true)) return true;
  const level = String(discordPresentation.level ?? '').trim().toUpperCase();
  return ['WARN', 'WARNING', 'ERROR', 'CRITICAL', 'FAIL', 'FAILED', 'BLOCKED', 'DEGRADED'].includes(level);
}

function discordPresentationRequiresNextAction(discordPresentation: UnknownRecord = {}): boolean {
  return discordPresentation.critical === true
    || discordPresentation.require_actionable === true
    || discordPresentation.requires_actionable_contract === true;
}

export function validateDiscordOperatorPresentation(discordPresentation: UnknownRecord = {}, ids: UnknownRecord = {}): string[] {
  const errors: string[] = [];
  if (!discordPresentationRequiresActionableContract(discordPresentation)) return errors;

  const fields = collectDiscordFields(discordPresentation);
  const fieldByName = new Map(fields.map((field) => [normalizeFieldName(field?.name), field?.value]));
  const verdictValues = [
    discordPresentation.verdict,
    discordPresentation.status,
    discordPresentation.outcome,
    discordPresentation.terminal_status,
    ...['verdict', 'status', 'outcome', 'terminal status', 'result'].map((name) => fieldByName.get(name)),
  ];
  const actionValues = [
    discordPresentation.next_action,
    discordPresentation.nextAction,
    discordPresentation.action,
    ...['next action', 'action', 'operator action'].map((name) => fieldByName.get(name)),
  ];
  const hasVerdict = verdictValues.some(hasActionableValue);
  const hasAction = actionValues.some(hasActionableValue);

  if (!hasVerdict) errors.push('critical Discord notification must include verdict/status/outcome');
  if (discordPresentationRequiresNextAction(discordPresentation) && !hasAction) {
    errors.push('critical Discord notification must include next action/action');
  }

  const hookId = ids?.hookId ?? '';
  if (String(hookId).startsWith('module.') && !ids?.moduleId) {
    errors.push('module Discord notification must include ids.moduleId');
  }
  if (String(hookId).startsWith('gate.') && !ids?.gateId) {
    errors.push('gate Discord notification must include ids.gateId');
  }

  return errors;
}

export function buildNotificationEventInput(ctx: UnknownRecord = {}, hookId: string, envelope: UnknownRecord = {}): UnknownRecord {
  const ids = normalizeNotificationIds(hookId, ctx, envelope);
  const refs = normalizeNotificationRefs(ids, envelope);
  return {
    refs,
    ids,
    snapshot: deepClone(envelope?.snapshot || {}),
    artifacts: deepClone(envelope?.artifacts),
    summaries: deepClone(envelope?.summaries),
    stateSnapshot: deepClone(envelope?.stateSnapshot || {}),
    executionContext: deepClone(envelope?.executionContext || {}),
    event: deepClone(envelope?.event || {
      type: hookId,
      payload: {},
      emitter: 'nova/pipeline/services/telemetry',
    }),
    presentation: deepClone(envelope?.presentation || {}),
    occurredAt: envelope?.occurredAt || new Date().toISOString(),
  };
}

export function validateNotificationEventInput(input: UnknownRecord = {}): string[] {
  const errors: string[] = [];
  const hookId = input?.ids?.hookId;
  if (!NOTIFICATION_HOOK_IDS.includes(hookId)) {
    errors.push(`notification hookId must be one of: ${NOTIFICATION_HOOK_IDS.join(', ')}`);
  }
  if (!input?.ids?.stageId || input.ids.stageId !== hookId) {
    errors.push('notification stageId must match hookId');
  }
  if (!input?.ids?.runId || typeof input.ids.runId !== 'string') {
    errors.push('notification ids.runId must be a non-empty string');
  }
  if (!input?.refs?.runRef || typeof input.refs.runRef !== 'string') {
    errors.push('notification refs.runRef must be a non-empty string');
  }
  if (!input?.refs?.primaryRef || typeof input.refs.primaryRef !== 'string') {
    errors.push('notification refs.primaryRef must be a non-empty string');
  }
  if (!input?.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) {
    errors.push('notification occurredAt must be an ISO-8601 timestamp');
  }
  if (input?.event !== undefined && (typeof input.event !== 'object' || Array.isArray(input.event))) {
    errors.push('notification event must be an object when provided');
  }
  if (input?.event && typeof input.event.type !== 'string') {
    errors.push('notification event.type must be a string when provided');
  }
  if (input?.presentation !== undefined && (typeof input.presentation !== 'object' || Array.isArray(input.presentation))) {
    errors.push('notification presentation must be an object when provided');
  }
  if (input?.presentation?.discord !== undefined) {
    if (typeof input.presentation.discord !== 'object' || Array.isArray(input.presentation.discord)) {
      errors.push('notification presentation.discord must be an object when provided');
    } else {
      errors.push(...validateDiscordOperatorPresentation(input.presentation.discord, input.ids ?? {}));
    }
  }
  return errors;
}

export function assertNotificationEventInput(input: UnknownRecord = {}): UnknownRecord {
  const errors = validateNotificationEventInput(input);
  if (errors.length) {
    throw new Error(`Invalid notification event input: ${errors.join('; ')}`);
  }
  return input;
}

export async function observeTelemetryNotification(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const config = await readNotificationConfig(ctx);
  const eventType = input?.event?.type || input?.ids?.hookId;
  const payload = input?.event?.payload || {};
  const emitter = input?.event?.emitter || 'nova/pipeline/services/telemetry';
  const result = await emitTelemetryStreamEvent(config, eventType, payload, {
    emittedAt: input?.occurredAt,
    emitter,
    runId: input?.ids?.runId,
  });
  if (ctx?.notificationState) {
    ctx.notificationState.telemetryResult = result || null;
    ctx.notificationState.telemetryEvent = result?.event || null;
  }
  if (!result.ok && !result.skipped) {
    const telemetryError = result?.error as Error | undefined;
    await recordObservabilityDegraded({ config }, {
      component: 'telemetry',
      surface: 'redis_stream',
      reason: 'redis_emit_failed',
      detail: telemetryError?.message || 'redis telemetry emission failed',
      impacted_event_type: eventType,
      stream_key: result?.streamKey || null,
    });
    throw telemetryError || new Error(`telemetry sink failed for ${eventType}`);
  }

  if (result.ok) {
    await recordObservabilityRestored({ config }, {
      component: 'telemetry',
      surface: 'redis_stream',
      reason: 'redis_emit_failed',
      detail: 'redis telemetry emission restored',
      impacted_event_type: eventType,
      stream_key: result?.streamKey || null,
    });
  }
}

export async function observeStructuredEventNotification(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const config = await readNotificationConfig(ctx);
  const eventType = input?.event?.type || input?.ids?.hookId;
  const payload = input?.event?.payload || {};
  const telemetryEvent = ctx?.notificationState?.telemetryEvent || null;
  const ok = await appendStructuredEventMirror(config, eventType, {
    ...(telemetryEvent?.seq == null ? {} : { seq: telemetryEvent.seq }),
    ...payload,
    ts: input?.occurredAt,
    run_id: input?.ids?.runId || payload?.run_id || null,
    project: config?.project || payload?.project || '',
    source: payload?.source || 'pipeline',
    emitter: input?.event?.emitter || payload?.emitter || 'nova/pipeline/services/telemetry',
  });
  if (!ok) {
    throw new Error(`structured event artifact sink failed for ${eventType}`);
  }
}

export async function observeDiscordNotification(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const presentation = input?.presentation?.discord;
  if (!presentation) return;
  const config = await readNotificationConfig(ctx);
  const correlation = {
    run_id: input?.ids?.runId || null,
    module_id: input?.ids?.moduleId || null,
    gate_id: input?.ids?.gateId || null,
    gate_type: input?.ids?.gateType || null,
    attempt: input?.ids?.attempt ?? null,
  };
  if (Array.isArray(presentation.embeds) && presentation.embeds.length) {
    await discordEmbeds(config, presentation.embeds, { level: presentation.level || 'INFO', correlation });
    return;
  }
  await discord(
    config,
    presentation.level || 'INFO',
    presentation.title || input?.event?.type || input?.ids?.hookId,
    presentation.description || '',
    Array.isArray(presentation.fields) ? presentation.fields : [],
    { correlation },
  );
}

function sanitizeHookIdForModuleId(hookId: unknown): string {
  return String(hookId || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildNotificationDefinition({ sinkId, hookId, displayName, description, defaultEnabled = true, capabilities = [], observe }: UnknownRecord): UnknownRecord {
  const moduleSuffix = sanitizeHookIdForModuleId(hookId);
  return {
    manifest: {
      moduleId: `builtin.notification.${sinkId}.${moduleSuffix}`,
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'notification',
      hookFamily: hookId,
      stageIds: [hookId],
      capabilities: ['read.state', 'emit.stream', ...capabilities],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName,
      description,
      defaultEnabled,
      priority: NOTIFICATION_SINK_PRIORITIES[sinkId] ?? 1000,
    },
    implementation: { observe },
  };
}

export function getBuiltinNotificationPluginDefinitions(): UnknownRecord[] {
  const definitions: UnknownRecord[] = [];
  for (const hookId of NOTIFICATION_HOOK_IDS) {
    definitions.push(
      buildNotificationDefinition({
        sinkId: 'telemetry',
        hookId,
        displayName: `Built-in telemetry sink (${hookId})`,
        description: 'Registry-driven Redis stream telemetry listener for canonical notification hooks.',
        capabilities: ['emit.telemetry'],
        observe: observeTelemetryNotification,
      }),
      buildNotificationDefinition({
        sinkId: 'structured_event_artifact',
        hookId,
        displayName: `Built-in structured event artifact sink (${hookId})`,
        description: 'Registry-driven pipeline.jsonl mirror listener for canonical notification hooks.',
        capabilities: ['write.artifacts'],
        observe: observeStructuredEventNotification,
      }),
      buildNotificationDefinition({
        sinkId: 'discord',
        hookId,
        displayName: `Built-in Discord listener (${hookId})`,
        description: 'Registry-driven Discord listener for canonical notification hooks. It only delivers when the hook envelope includes explicit Discord presentation metadata.',
        defaultEnabled: true,
        capabilities: ['write.artifacts', 'notify.operator'],
        observe: observeDiscordNotification,
      }),
    );
  }
  return definitions;
}
