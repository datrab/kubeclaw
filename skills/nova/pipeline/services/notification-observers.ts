import { getRunId } from '../core/runtime.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../core/constants.ts';
import { discord, discordEmbeds } from '../integrations/discord.ts';
import { appendStructuredEventMirror, recordObservabilityDegraded, recordObservabilityRestored } from './observability.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';
import {
  canonicalNotificationEmitter,
  firstNotificationText,
  notificationRecord,
  notificationEventPayload,
  optionalNotificationText,
  readNotificationConfig,
  requiredNotificationText,
} from './notification-values.ts';

type UnknownRecord = Record<string, any>;

const SINK_PRIORITIES: Record<string, number> = Object.freeze({
  telemetry: 100,
  structured_event_artifact: 200,
  discord: 300,
});

async function handleTelemetryResult(
  config: UnknownRecord,
  eventType: string,
  result: UnknownRecord,
): Promise<void> {
  if (!result.ok && !result.skipped) {
    const telemetryError = result.error as Error | undefined;
    await recordObservabilityDegraded({ config }, {
      component: 'telemetry',
      surface: 'redis_stream',
      reason: 'redis_emit_failed',
      detail: optionalNotificationText(telemetryError?.message) ?? 'redis_telemetry_error_message_missing',
      impacted_event_type: eventType,
      stream_key: optionalNotificationText(result.streamKey),
    });
    throw telemetryError ?? new Error(`telemetry sink failed for ${eventType}`);
  }
  if (!result.ok) return;
  await recordObservabilityRestored({ config }, {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: 'redis telemetry emission restored',
    impacted_event_type: eventType,
    stream_key: result.streamKey ?? null,
  });
}

async function observeTelemetryNotification(
  input: UnknownRecord,
  ctx: UnknownRecord = {},
): Promise<void> {
  const config = await readNotificationConfig(ctx);
  const eventType = requiredNotificationText(
    firstNotificationText(input?.event?.type, input?.ids?.hookId),
    'notification.event.type',
  );
  const result = await emitTelemetryStreamEvent(config, eventType, notificationEventPayload(input), {
    emittedAt: input?.occurredAt,
    emitter: canonicalNotificationEmitter(input?.event?.emitter),
    runId: input?.ids?.runId,
  });
  if (ctx.notificationState) {
    ctx.notificationState.telemetryResult = result ?? null;
    ctx.notificationState.telemetryEvent = result?.event ?? null;
  }
  await handleTelemetryResult(config, eventType, result);
}

async function observeStructuredEventNotification(
  input: UnknownRecord,
  ctx: UnknownRecord = {},
): Promise<void> {
  const config = await readNotificationConfig(ctx);
  const eventType = requiredNotificationText(
    firstNotificationText(input?.event?.type, input?.ids?.hookId),
    'notification.event.type',
  );
  const payload = notificationEventPayload(input);
  const mirrorEvent = buildStructuredMirrorEvent(config, input, ctx, payload);
  const ok = await appendStructuredEventMirror(config, eventType, mirrorEvent);
  if (!ok) throw new Error(`structured event artifact sink failed for ${eventType}`);
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value;
}

function buildStructuredMirrorEvent(
  config: UnknownRecord,
  input: UnknownRecord,
  ctx: UnknownRecord,
  payload: UnknownRecord,
): UnknownRecord {
  const ids = notificationRecord(input.ids);
  const event = notificationRecord(input.event);
  const notificationState = notificationRecord(ctx.notificationState);
  const telemetryEvent = notificationRecord(notificationState.telemetryEvent);
  const sequence = telemetryEvent.seq;
  const sequenceField = sequence === undefined || sequence === null ? {} : { seq: sequence };
  return {
    ...sequenceField,
    ...payload,
    ts: input.occurredAt,
    run_id: firstNotificationText(ids.runId, payload.run_id),
    project: requiredNotificationText(firstNotificationText(config.project, payload.project), 'notification.project'),
    source: requiredNotificationText(payload.source, 'notification.event.payload.source'),
    emitter: canonicalNotificationEmitter(firstNotificationText(event.emitter, payload.emitter)),
  };
}

export async function observeDiscordNotification(
  input: UnknownRecord,
  ctx: UnknownRecord = {},
): Promise<void> {
  const presentation = notificationRecord(notificationRecord(input.presentation).discord);
  const hasPresentation = Object.keys(presentation).length > 0;
  if (!hasPresentation) return;
  const config = await readNotificationConfig(ctx);
  const ids = notificationRecord(input.ids);
  const correlation = {
    run_id: nullable(ids.runId),
    module_id: nullable(ids.moduleId),
    gate_id: nullable(ids.gateId),
    gate_type: nullable(ids.gateType),
    attempt: nullable(ids.attempt),
  };
  const level = requiredNotificationText(presentation.level, 'notification.presentation.discord.level');
  if (Array.isArray(presentation.embeds) && presentation.embeds.length > 0) {
    await discordEmbeds(config, presentation.embeds, { level, correlation });
    return;
  }
  await discord(
    config,
    level,
    requiredNotificationText(presentation.title, 'notification.presentation.discord.title'),
    optionalNotificationText(presentation.description),
    Array.isArray(presentation.fields) ? presentation.fields : [],
    { correlation },
  );
}

function buildNotificationDefinition(
  { sinkId, hookId, displayName, description, defaultEnabled = true, capabilities = [], observe }: UnknownRecord,
): UnknownRecord {
  const priority = SINK_PRIORITIES[sinkId];
  if (typeof priority !== 'number') throw new Error(`Notification sink priority missing for '${sinkId}'`);
  const moduleSuffix = requiredNotificationText(hookId, 'notification.hookId')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
      priority,
    },
    implementation: { observe },
  };
}

export function getBuiltinNotificationPluginDefinitions(hookIds: readonly string[]): UnknownRecord[] {
  return hookIds.flatMap((hookId) => [
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
      capabilities: ['write.artifacts', 'notify.operator'],
      observe: observeDiscordNotification,
    }),
  ]);
}
