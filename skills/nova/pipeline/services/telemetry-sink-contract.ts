import { getRunId } from '../core/runtime.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../core/constants.ts';
import { discord } from '../integrations/discord.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';
import { deepClone } from './serialization.ts';
import { canonicalExplicitRef, canonicalRef } from './contract-reference.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type UnknownRecord = Record<string, any>;

import { TELEMETRY_SINK_HOOK_FAMILY, TELEMETRY_SINK_STAGE_ID } from './telemetry-sink-constants.ts';
export { TELEMETRY_SINK_HOOK_FAMILY, TELEMETRY_SINK_STAGE_ID } from './telemetry-sink-constants.ts';
export { assertTelemetrySinkInput, validateTelemetrySinkInput } from './telemetry-sink-validation.ts';
const TELEMETRY_EMITTER = 'nova/pipeline/services/telemetry';
const TELEMETRY_SOURCE = 'pipeline';
const DISCORD_LEVEL_INFO = 'INFO';
const DISCORD_TITLE_TELEMETRY = 'telemetry';

function objectRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function normalizedText(value: unknown): string {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim();
}

function normalizedFieldName(value: unknown): string {
  return normalizedText(value).toLowerCase().replace(/[_-]+/g, ' ');
}

function selectPresentValue(...values: unknown[]): unknown {
  return values.find((value: any) => value !== undefined && value !== null && value !== '');
}

function stateSnapshotRecord(options: UnknownRecord): UnknownRecord {
  const stateSnapshot = objectRecord(options.stateSnapshot);
  return Object.keys(stateSnapshot).length ? stateSnapshot : objectRecord(options.snapshot);
}

const TELEMETRY_SINK_PRIORITIES: Record<string, number> = Object.freeze({
  redis: 100,
  discord: 300,
});
function telemetrySinkPriority(sinkId: string): number {
  const priority = TELEMETRY_SINK_PRIORITIES[sinkId];
  if (typeof priority !== 'number') {
    throw new Error(`Telemetry sink priority missing for '${sinkId}'`);
  }
  return priority;
}

async function readTelemetrySinkConfig(ctx: UnknownRecord = {}): Promise<UnknownRecord> {
  if (typeof ctx?.coreRuntime?.readConfig === 'function') return ctx.coreRuntime.readConfig();
  throw new Error('Telemetry sink plugin requires explicit coreRuntime config; public PluginContextV1 does not expose read.config()');
}

function normalizeTelemetrySinkIds(ctx: UnknownRecord = {}, eventType: string, payload: UnknownRecord = {}, options: UnknownRecord = {}): UnknownRecord {
  const config = objectRecord(ctx?.config);
  return {
    runId: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (options.runId), () => (getRunId(config)))), () => (ctx?.runId))), () => (config?._runId))), () => (config?.run_id))), () => (payload.run_id))), () => (null)),
    moduleId: selectTruthyValue(() => (selectTruthyValue(() => (options.moduleId), () => (payload.module_id))), () => (null)),
    gateId: selectTruthyValue(() => (selectTruthyValue(() => (options.gateId), () => (payload.gate_id))), () => (null)),
    gateType: selectTruthyValue(() => (selectTruthyValue(() => (options.gateType), () => (payload.gate_type))), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (options.attempt), () => (payload.attempt))), () => (null)),
    eventType,
    stageId: TELEMETRY_SINK_STAGE_ID,
  };
}

function normalizeTelemetrySinkRefs(ids: UnknownRecord = {}, options: UnknownRecord = {}): UnknownRecord {
  const explicitRefs = options.refs && typeof options.refs === 'object' && !Array.isArray(options.refs)
    ? options.refs
    : {};
  const runRef = canonicalRef('run', selectDefinedValue(() => (explicitRefs.runRef), () => (ids.runId)));
  const moduleAttemptRef = selectDefinedValue(() => (canonicalRef('module_attempt', explicitRefs.moduleAttemptRef)), () => ((ids.runId && ids.moduleId && ids.attempt != null ? `module_attempt:${ids.runId}:${ids.moduleId}:${ids.attempt}` : null)));
  const gateEvaluationRef = selectDefinedValue(() => (canonicalRef('gate_evaluation', explicitRefs.gateEvaluationRef)), () => ((ids.runId && ids.gateId && ids.attempt != null ? `gate_evaluation:${ids.runId}:${ids.gateId}:${ids.attempt}` : null)));
  const primaryRef = selectDefinedValue(() => ([
    canonicalExplicitRef(explicitRefs.primaryRef),
    moduleAttemptRef,
    gateEvaluationRef,
    canonicalRef('module', ids.moduleId),
    canonicalRef('gate', ids.gateId),
    runRef,
    canonicalRef('event', ids.eventType),
].find((ref: any): ref is string => typeof ref === 'string')), () => (null));
  return { runRef, moduleAttemptRef, gateEvaluationRef, primaryRef };
}

function normalizeTelemetrySinkPresentation(presentation: unknown): UnknownRecord {
  if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) return {};
  const record = presentation as UnknownRecord;
  if (!record.discord) return deepClone(record);
  const discordPresentation = record.discord;
  if (!discordPresentation || typeof discordPresentation !== 'object' || Array.isArray(discordPresentation)) {
    return { ...deepClone(record), discord: discordPresentation };
  }
  const discordRecord = discordPresentation as UnknownRecord;
  const normalizedDiscord: UnknownRecord = {};
  for (const key of ['level', 'title', 'description', 'verdict', 'status', 'outcome', 'terminal_status', 'next_action', 'nextAction', 'action']) {
    if (typeof discordRecord[key] === 'string') normalizedDiscord[key] = discordRecord[key];
  }
  if (discordRecord.embeds !== undefined) normalizedDiscord.embeds = deepClone(discordRecord.embeds);
  if (Array.isArray(discordRecord.fields)) normalizedDiscord.fields = deepClone(discordRecord.fields);
  return {
    ...deepClone(record),
    discord: normalizedDiscord,
  };
}

export function buildTelemetrySinkInput(ctx: UnknownRecord = {}, eventType: string, payload: UnknownRecord = {}, options: UnknownRecord = {}): UnknownRecord {
  const ids = normalizeTelemetrySinkIds(ctx, eventType, payload, options);
  const refs = normalizeTelemetrySinkRefs(ids, options);
  return {
    refs,
    ids,
    event: {
      type: eventType,
      payload: deepClone(objectRecord(payload)),
      emitter: selectPresentValue(options.emitter, payload.emitter, TELEMETRY_EMITTER),
      source: selectPresentValue(options.source, payload.source, TELEMETRY_SOURCE),
    },
    presentation: normalizeTelemetrySinkPresentation(options.presentation),
    stateSnapshot: deepClone(stateSnapshotRecord(options)),
    executionContext: deepClone(objectRecord(options.executionContext)),
    occurredAt: telemetrySinkOccurredAt(options),
  };
}

async function observeRedisTelemetrySink(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const config = await readTelemetrySinkConfig(ctx);
  const request = redisSinkRequest(input);
  const result = await emitTelemetryStreamEvent(config, request.eventType, request.payload, request.options);
  updateRedisSinkState(ctx?.telemetrySinkState, result);
  if (!result?.ok && !result?.skipped) {
    const error = telemetryRedisSinkErrorAuthority(result, request.eventType) as Error & { streamKey?: string | null };
    error.streamKey = result?.streamKey ?? null;
    throw error;
  }
}

function redisSinkRequest(input: UnknownRecord) {
  return {
    eventType: input?.event?.type,
    payload: objectRecord(input?.event?.payload),
    options: {
      emittedAt: input?.occurredAt,
      emitter: selectPresentValue(input?.event?.emitter, TELEMETRY_EMITTER),
      runId: input?.ids?.runId,
    },
  };
}

function updateRedisSinkState(state: UnknownRecord | undefined, result: any) {
  if (!state) return;
  state.redisResult = result ?? null;
  state.redisEvent = result?.event ?? null;
  state.redisStreamKey = result?.streamKey ?? null;
}

function telemetrySinkOccurredAt(options: Record<string, any>): string {
  if (options.occurredAt) return options.occurredAt;
  return new Date().toISOString();
}

function telemetryRedisSinkErrorAuthority(result: Record<string, any> | null | undefined, eventType: string): Error {
  if (result?.error) return result.error;
  return new Error(`telemetry Redis sink failed for ${eventType}`);
}

async function observeDiscordTelemetrySink(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const presentation = input?.presentation?.discord;
  if (!presentation) return;
  const config = await readTelemetrySinkConfig(ctx);
  if (presentation.embeds !== undefined) {
    throw new Error('telemetry sink presentation.discord.embeds is not supported; use title/description/fields');
  }
  const payload = objectRecord(input?.event?.payload);
  await discord(
    config,
    selectPresentValue(presentation.level, DISCORD_LEVEL_INFO),
    selectPresentValue(presentation.title, input?.event?.type, DISCORD_TITLE_TELEMETRY),
    selectPresentValue(presentation.description, ''),
    Array.isArray(presentation.fields) ? presentation.fields : [],
    {
      deps: selectTruthyValue(() => (ctx?.coreRuntime?.readDeps?.()), () => (null)),
      correlation: {
        run_id: selectDefinedValue(() => (selectDefinedValue(() => (payload.run_id), () => (input?.ids?.runId))), () => (null)),
        module_id: selectDefinedValue(() => (selectDefinedValue(() => (payload.module_id), () => (input?.ids?.moduleId))), () => (null)),
        gate_id: selectDefinedValue(() => (selectDefinedValue(() => (payload.gate_id), () => (input?.ids?.gateId))), () => (null)),
        gate_type: selectDefinedValue(() => (selectDefinedValue(() => (payload.gate_type), () => (input?.ids?.gateType))), () => (null)),
        attempt: selectDefinedValue(() => (selectDefinedValue(() => (payload.attempt), () => (input?.ids?.attempt))), () => (null)),
        dispatch_id: selectDefinedValue(() => (payload.dispatch_id), () => (null)),
        gateway_label: selectDefinedValue(() => (payload.gateway_label), () => (null)),
        session_key: selectDefinedValue(() => (payload.session_key), () => (null)),
      },
    },
  );
}

function buildTelemetrySinkDefinition({ sinkId, displayName, description, capabilities = [], observe }: UnknownRecord): UnknownRecord {
  return {
    manifest: {
      moduleId: `builtin.telemetry.${sinkId}`,
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'telemetry',
      hookFamily: TELEMETRY_SINK_HOOK_FAMILY,
      stageIds: [TELEMETRY_SINK_STAGE_ID],
      capabilities: ['read.state', 'emit.stream', ...capabilities],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName,
      description,
      defaultEnabled: true,
      priority: telemetrySinkPriority(sinkId),
    },
    implementation: { observe },
  };
}

export function getBuiltinTelemetrySinkPluginDefinitions(): UnknownRecord[] {
  return [
    buildTelemetrySinkDefinition({
      sinkId: 'redis',
      displayName: 'Built-in Redis telemetry sink',
      description: 'Registry-owned full-firehose telemetry sink for ClawDeck and live consumers.',
      capabilities: ['emit.telemetry'],
      observe: observeRedisTelemetrySink,
    }),
    buildTelemetrySinkDefinition({
      sinkId: 'discord',
      displayName: 'Built-in Discord telemetry sink',
      description: 'Registry-owned filtered Discord telemetry sink. Sends only explicit presentation payloads.',
      capabilities: ['write.artifacts', 'notify.operator'],
      observe: observeDiscordTelemetrySink,
    }),
  ];
}
