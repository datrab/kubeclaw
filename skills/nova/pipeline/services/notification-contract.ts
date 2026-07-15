import { getRunId } from '../core/runtime.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../core/constants.ts';
import { discord, discordEmbeds } from '../integrations/discord.ts';
import { appendStructuredEventMirror, recordObservabilityDegraded, recordObservabilityRestored } from './observability.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';
import { deepClone } from './serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
function notificationSinkPriority(sinkId: string): number {
  const priority = NOTIFICATION_SINK_PRIORITIES[sinkId];
  if (typeof priority !== 'number') {
    throw new Error(`Notification sink priority missing for '${sinkId}'`);
  }
  return priority;
}
function canonicalRef(prefix: string, value: unknown): string | null {
  if (selectTruthyValue(() => (value == null), () => (value === ''))) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.startsWith(`${prefix}:`) ? normalized : `${prefix}:${normalized}`;
}

function canonicalExplicitRef(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function cloneRecordOrEmpty(value: unknown): UnknownRecord {
  return deepClone(recordOrEmpty(value));
}

function optionalText(value: unknown): string | null {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label}: required non-empty string`);
  return text;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = optionalText(value);
    if (text !== null) return text;
  }
  return null;
}

function eventPayload(input: UnknownRecord): UnknownRecord {
  return recordOrEmpty(input?.event?.payload);
}

function canonicalNotificationEmitter(value: unknown): string {
  return requiredText(value, 'notification.event.emitter');
}

async function readNotificationConfig(ctx: UnknownRecord = {}): Promise<UnknownRecord> {
  if (typeof ctx?.coreRuntime?.readConfig === 'function') return ctx.coreRuntime.readConfig();
  throw new Error('Notification plugin requires explicit coreRuntime config; public PluginContextV1 does not expose read.config()');
}

function normalizeNotificationIds(hookId: string, ctx: UnknownRecord = {}, envelope: UnknownRecord = {}): UnknownRecord {
  const config = recordOrEmpty(ctx?.config);
  const explicitIds = recordOrEmpty(envelope?.ids);
  const payload = recordOrEmpty(envelope?.event?.payload);
  const runId = firstText(explicitIds.runId, explicitIds.run_id, ctx?.runId, getRunId(config), config?._runId, config?.run_id);
  const moduleId = firstText(explicitIds.moduleId, explicitIds.module_id, payload.module_id);
  const gateId = firstText(explicitIds.gateId, explicitIds.gate_id, payload.gate_id);
  const gateType = firstText(explicitIds.gateType, explicitIds.gate_type, payload.gate_type);
  const attempt = selectDefinedValue(() => (selectDefinedValue(() => (explicitIds.attempt), () => (payload.attempt))), () => (null));
  return {
    hookId,
    runId,
    moduleId,
    attempt,
    gateId,
    gateType,
    stageId: firstText(explicitIds.stageId, explicitIds.stage_id, hookId),
  };
}

function normalizeNotificationRefs(ids: UnknownRecord = {}, envelope: UnknownRecord = {}): UnknownRecord {
  const explicitRefs = recordOrEmpty(envelope?.refs);
  const runRef = selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.runRef)), () => (canonicalRef('run', ids.runId)));
  const moduleAttemptRef = selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.moduleAttemptRef)), () => ((ids.runId && ids.moduleId && ids.attempt != null ? `module_attempt:${ids.runId}:${ids.moduleId}:${ids.attempt}` : null)));
  const gateEvaluationRef = selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.gateEvaluationRef)), () => ((ids.runId && ids.gateId && ids.attempt != null ? `gate_evaluation:${ids.runId}:${ids.gateId}:${ids.attempt}` : null)));
  const primaryRef = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.primaryRef)), () => (moduleAttemptRef))), () => (gateEvaluationRef))), () => (canonicalRef('module', ids.moduleId)))), () => (canonicalRef('gate', ids.gateId)))), () => (runRef))), () => (canonicalRef('stage', ids.stageId)));
  return {
    runRef,
    moduleAttemptRef,
    gateEvaluationRef,
    primaryRef,
  };
}

function normalizeFieldName(value: unknown): string {
  return String(selectDefinedValue(() => (optionalText(value)), () => (''))).toLowerCase().replace(/[_-]+/g, ' ');
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
  const level = String(selectDefinedValue(() => (optionalText(discordPresentation.level)), () => (''))).toUpperCase();
  return ['WARN', 'WARNING', 'ERROR', 'CRITICAL', 'FAIL', 'FAILED', 'BLOCKED', 'DEGRADED'].includes(level);
}

function discordPresentationRequiresNextAction(discordPresentation: UnknownRecord = {}): boolean {
  return selectTruthyValue(() => (selectTruthyValue(() => (discordPresentation.critical === true), () => (discordPresentation.require_actionable === true))), () => (discordPresentation.requires_actionable_contract === true));
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

  const hookId = optionalText(ids?.hookId);
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
  const event = isRecord(envelope?.event)
    ? deepClone(envelope.event)
    : {
        type: hookId,
        payload: {},
        emitter: 'nova/pipeline/services/telemetry',
      };
  return {
    refs,
    ids,
    snapshot: cloneRecordOrEmpty(envelope?.snapshot),
    artifacts: deepClone(envelope?.artifacts),
    summaries: deepClone(envelope?.summaries),
    stateSnapshot: cloneRecordOrEmpty(envelope?.stateSnapshot),
    executionContext: cloneRecordOrEmpty(envelope?.executionContext),
    event,
    presentation: cloneRecordOrEmpty(envelope?.presentation),
    occurredAt: selectDefinedValue(() => (optionalText(envelope?.occurredAt)), () => (new Date().toISOString())),
  };
}

export function validateNotificationEventInput(input: UnknownRecord = {}): string[] {
  const errors: string[] = [];
  const hookId = input?.ids?.hookId;
  if (!NOTIFICATION_HOOK_IDS.includes(hookId)) {
    errors.push(`notification hookId must be one of: ${NOTIFICATION_HOOK_IDS.join(', ')}`);
  }
  if (selectTruthyValue(() => (!input?.ids?.stageId), () => (input.ids.stageId !== hookId))) {
    errors.push('notification stageId must match hookId');
  }
  if (selectTruthyValue(() => (!input?.ids?.runId), () => (typeof input.ids.runId !== 'string'))) {
    errors.push('notification ids.runId must be a non-empty string');
  }
  if (selectTruthyValue(() => (!input?.refs?.runRef), () => (typeof input.refs.runRef !== 'string'))) {
    errors.push('notification refs.runRef must be a non-empty string');
  }
  if (selectTruthyValue(() => (!input?.refs?.primaryRef), () => (typeof input.refs.primaryRef !== 'string'))) {
    errors.push('notification refs.primaryRef must be a non-empty string');
  }
  if (selectTruthyValue(() => (!input?.occurredAt), () => (Number.isNaN(Date.parse(input.occurredAt))))) {
    errors.push('notification occurredAt must be an ISO-8601 timestamp');
  }
  if (input?.event !== undefined && (selectTruthyValue(() => (typeof input.event !== 'object'), () => (Array.isArray(input.event))))) {
    errors.push('notification event must be an object when provided');
  }
  if (input?.event && typeof input.event.type !== 'string') {
    errors.push('notification event.type must be a string when provided');
  }
  if (input?.presentation !== undefined && (selectTruthyValue(() => (typeof input.presentation !== 'object'), () => (Array.isArray(input.presentation))))) {
    errors.push('notification presentation must be an object when provided');
  }
  if (input?.presentation?.discord !== undefined) {
    if (selectTruthyValue(() => (typeof input.presentation.discord !== 'object'), () => (Array.isArray(input.presentation.discord)))) {
      errors.push('notification presentation.discord must be an object when provided');
    } else {
      errors.push(...validateDiscordOperatorPresentation(input.presentation.discord, recordOrEmpty(input.ids)));
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
  const eventType = requiredText(firstText(input?.event?.type, input?.ids?.hookId), 'notification.event.type');
  const payload = eventPayload(input);
  const emitter = canonicalNotificationEmitter(input?.event?.emitter);
  const result = await emitTelemetryStreamEvent(config, eventType, payload, {
    emittedAt: input?.occurredAt,
    emitter,
    runId: input?.ids?.runId,
  });
  if (ctx?.notificationState) {
    ctx.notificationState.telemetryResult = selectTruthyValue(() => (result), () => (null));
    ctx.notificationState.telemetryEvent = selectTruthyValue(() => (result?.event), () => (null));
  }
  if (!result.ok && !result.skipped) {
    const telemetryError = result?.error as Error | undefined;
    await recordObservabilityDegraded({ config }, {
      component: 'telemetry',
      surface: 'redis_stream',
      reason: 'redis_emit_failed',
      detail: selectDefinedValue(() => (optionalText(telemetryError?.message)), () => ('redis_telemetry_error_message_missing')),
      impacted_event_type: eventType,
      stream_key: optionalText(result?.streamKey),
    });
    throw telemetrySinkFailureAuthority(telemetryError, eventType);
  }

  if (result.ok) {
    await recordObservabilityRestored({ config }, {
      component: 'telemetry',
      surface: 'redis_stream',
      reason: 'redis_emit_failed',
      detail: 'redis telemetry emission restored',
      impacted_event_type: eventType,
      stream_key: selectTruthyValue(() => (result?.streamKey), () => (null)),
    });
  }
}

function telemetrySinkFailureAuthority(telemetryError: Error | undefined, eventType: string): Error {
  if (telemetryError) return telemetryError;
  return new Error(`telemetry sink failed for ${eventType}`);
}

export async function observeStructuredEventNotification(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const config = await readNotificationConfig(ctx);
  const eventType = requiredText(firstText(input?.event?.type, input?.ids?.hookId), 'notification.event.type');
  const payload = eventPayload(input);
  const telemetryEvent = selectDefinedValue(() => (ctx?.notificationState?.telemetryEvent), () => (null));
  const ok = await appendStructuredEventMirror(config, eventType, {
    ...(telemetryEvent?.seq == null ? {} : { seq: telemetryEvent.seq }),
    ...payload,
    ts: input?.occurredAt,
    run_id: firstText(input?.ids?.runId, payload?.run_id),
    project: requiredText(firstText(config?.project, payload?.project), 'notification.project'),
    source: requiredText(payload?.source, 'notification.event.payload.source'),
    emitter: canonicalNotificationEmitter(firstText(input?.event?.emitter, payload?.emitter)),
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
    run_id: selectTruthyValue(() => (input?.ids?.runId), () => (null)),
    module_id: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
    gate_id: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
    gate_type: selectTruthyValue(() => (input?.ids?.gateType), () => (null)),
    attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
  };
  if (Array.isArray(presentation.embeds) && presentation.embeds.length) {
    await discordEmbeds(config, presentation.embeds, { level: requiredText(presentation.level, 'notification.presentation.discord.level'), correlation });
    return;
  }
  await discord(
    config,
    requiredText(presentation.level, 'notification.presentation.discord.level'),
    requiredText(presentation.title, 'notification.presentation.discord.title'),
    optionalText(presentation.description),
    Array.isArray(presentation.fields) ? presentation.fields : [],
    { correlation },
  );
}

function sanitizeHookIdForModuleId(hookId: unknown): string {
  return requiredText(hookId, 'notification.hookId').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
      priority: notificationSinkPriority(sinkId),
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
