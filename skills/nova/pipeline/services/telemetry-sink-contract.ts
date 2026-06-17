import { getRunId } from '../core/runtime.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../core/constants.ts';
import { discord } from '../integrations/discord.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';
import { deepClone } from './serialization.ts';

type UnknownRecord = Record<string, any>;

export const TELEMETRY_SINK_HOOK_FAMILY = 'telemetry.sink';
export const TELEMETRY_SINK_STAGE_ID = 'telemetry.sink';

const TELEMETRY_SINK_PRIORITIES: Record<string, number> = Object.freeze({
  redis: 100,
  discord: 300,
});

function canonicalRef(prefix: string, value: unknown): string | null {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.startsWith(`${prefix}:`) ? normalized : `${prefix}:${normalized}`;
}

async function readTelemetrySinkConfig(ctx: UnknownRecord = {}): Promise<UnknownRecord> {
  if (typeof ctx?.coreRuntime?.readConfig === 'function') return ctx.coreRuntime.readConfig();
  throw new Error('Telemetry sink plugin requires explicit coreRuntime config; public PluginContextV1 does not expose read.config()');
}

function normalizeTelemetrySinkIds(ctx: UnknownRecord = {}, eventType: string, payload: UnknownRecord = {}, options: UnknownRecord = {}): UnknownRecord {
  const config = ctx?.config || {};
  return {
    runId: options.runId || getRunId(config) || ctx?.runId || config?._runId || config?.run_id || payload.run_id || null,
    moduleId: options.moduleId || payload.module_id || null,
    gateId: options.gateId || payload.gate_id || null,
    gateType: options.gateType || payload.gate_type || null,
    attempt: options.attempt ?? payload.attempt ?? null,
    eventType,
    stageId: TELEMETRY_SINK_STAGE_ID,
  };
}

function normalizeTelemetrySinkRefs(ids: UnknownRecord = {}, options: UnknownRecord = {}): UnknownRecord {
  const explicitRefs = options.refs || {};
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
    || canonicalRef('event', ids.eventType);
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
  return {
    ...deepClone(record),
    discord: {
      ...(typeof discordRecord.level === 'string' ? { level: discordRecord.level } : {}),
      ...(typeof discordRecord.title === 'string' ? { title: discordRecord.title } : {}),
      ...(typeof discordRecord.description === 'string' ? { description: discordRecord.description } : {}),
      ...(typeof discordRecord.verdict === 'string' ? { verdict: discordRecord.verdict } : {}),
      ...(typeof discordRecord.status === 'string' ? { status: discordRecord.status } : {}),
      ...(typeof discordRecord.outcome === 'string' ? { outcome: discordRecord.outcome } : {}),
      ...(typeof discordRecord.terminal_status === 'string' ? { terminal_status: discordRecord.terminal_status } : {}),
      ...(typeof discordRecord.next_action === 'string' ? { next_action: discordRecord.next_action } : {}),
      ...(typeof discordRecord.nextAction === 'string' ? { nextAction: discordRecord.nextAction } : {}),
      ...(typeof discordRecord.action === 'string' ? { action: discordRecord.action } : {}),
      ...(discordRecord.embeds !== undefined ? { embeds: deepClone(discordRecord.embeds) } : {}),
      ...(Array.isArray(discordRecord.fields) ? { fields: deepClone(discordRecord.fields) } : {}),
    },
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

function telemetryDiscordLevelRequiresActionableContract(discordPresentation: UnknownRecord = {}): boolean {
  const explicitFlags = [
    discordPresentation.critical,
    discordPresentation.require_actionable,
    discordPresentation.requires_actionable_contract,
  ];
  if (explicitFlags.some((value) => value === true)) return true;
  const level = String(discordPresentation.level ?? '').trim().toUpperCase();
  return ['WARN', 'WARNING', 'ERROR', 'CRITICAL', 'FAIL', 'FAILED', 'BLOCKED', 'DEGRADED'].includes(level);
}

function validateTelemetryDiscordOperatorPresentation(
  discordPresentation: UnknownRecord = {},
  input: UnknownRecord = {},
): string[] {
  const errors: string[] = [];
  if (!telemetryDiscordLevelRequiresActionableContract(discordPresentation)) return errors;

  const fields = Array.isArray(discordPresentation.fields) ? discordPresentation.fields : [];
  const fieldByName = new Map(fields.map((field) => [normalizeFieldName(field?.name), field?.value]));
  const payload = input?.event?.payload || {};
  const ids = input?.ids || {};
  const verdictValues = [
    discordPresentation.verdict,
    discordPresentation.status,
    discordPresentation.outcome,
    discordPresentation.terminal_status,
    payload.verdict,
    payload.status,
    payload.new_status,
    payload.outcome,
    payload.terminal_status,
    ...['verdict', 'status', 'outcome', 'terminal status', 'result'].map((name) => fieldByName.get(name)),
  ];
  const actionValues = [
    discordPresentation.next_action,
    discordPresentation.nextAction,
    discordPresentation.action,
    payload.next_action,
    payload.nextAction,
    payload.action,
    payload.operator_action,
    ...['next action', 'action', 'operator action'].map((name) => fieldByName.get(name)),
  ];
  const identityValues = [
    ids.runId,
    payload.run_id,
    payload.module_id,
    payload.gate_id,
    payload.dispatch_id,
    payload.gateway_label,
    payload.session_key,
    ...['run id', 'run', 'module', 'module id', 'gate', 'gate id', 'dispatch', 'dispatch id', 'gateway', 'gateway label', 'session', 'session key'].map((name) => fieldByName.get(name)),
  ];

  if (!verdictValues.some(hasActionableValue)) {
    errors.push('telemetry sink severe Discord alert must include verdict/status/outcome');
  }
  if (!actionValues.some(hasActionableValue)) {
    errors.push('telemetry sink severe Discord alert must include next action/action');
  }
  if (!identityValues.some(hasActionableValue)) {
    errors.push('telemetry sink severe Discord alert must include run/module/gate identity');
  }
  return errors;
}

export function buildTelemetrySinkInput(ctx: UnknownRecord = {}, eventType: string, payload: UnknownRecord = {}, options: UnknownRecord = {}): UnknownRecord {
  const ids = normalizeTelemetrySinkIds(ctx, eventType, payload, options);
  const refs = normalizeTelemetrySinkRefs(ids, options);
  return {
    refs,
    ids,
    event: {
      type: eventType,
      payload: deepClone(payload || {}),
      emitter: options.emitter || payload.emitter || 'nova/pipeline/services/telemetry',
      source: options.source || payload.source || 'pipeline',
    },
    presentation: normalizeTelemetrySinkPresentation(options.presentation),
    stateSnapshot: deepClone(options.stateSnapshot ?? options.snapshot ?? {}),
    executionContext: deepClone(options.executionContext || {}),
    occurredAt: options.occurredAt || new Date().toISOString(),
  };
}

export function validateTelemetrySinkInput(input: unknown = {}): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push('telemetry sink input must be an object');
    return errors;
  }
  const record = input as UnknownRecord;
  if (record?.ids?.stageId !== TELEMETRY_SINK_STAGE_ID) {
    errors.push(`telemetry sink ids.stageId must be '${TELEMETRY_SINK_STAGE_ID}'`);
  }
  if (!record?.ids?.runId || typeof record.ids.runId !== 'string') {
    errors.push('telemetry sink ids.runId must be a non-empty string');
  }
  if (!record?.refs?.runRef || typeof record.refs.runRef !== 'string') {
    errors.push('telemetry sink refs.runRef must be a non-empty string');
  }
  if (!record?.refs?.primaryRef || typeof record.refs.primaryRef !== 'string') {
    errors.push('telemetry sink refs.primaryRef must be a non-empty string');
  }
  if (!record?.event || typeof record.event !== 'object' || Array.isArray(record.event)) {
    errors.push('telemetry sink event must be an object');
  } else {
    if (!record.event.type || typeof record.event.type !== 'string') errors.push('telemetry sink event.type must be a non-empty string');
    if (record.event.payload !== undefined && (typeof record.event.payload !== 'object' || Array.isArray(record.event.payload))) {
      errors.push('telemetry sink event.payload must be an object when provided');
    }
  }
  if (record?.presentation?.discord !== undefined) {
    const discordPresentation = record.presentation.discord;
    if (!discordPresentation || typeof discordPresentation !== 'object' || Array.isArray(discordPresentation)) {
      errors.push('telemetry sink presentation.discord must be an object when provided');
    } else {
      if (discordPresentation.embeds !== undefined) errors.push('telemetry sink presentation.discord.embeds is not supported; use title/description/fields');
      for (const key of ['level', 'title', 'description']) {
        if (discordPresentation[key] !== undefined && typeof discordPresentation[key] !== 'string') {
          errors.push(`telemetry sink presentation.discord.${key} must be a string when provided`);
        }
      }
      if (discordPresentation.fields !== undefined && !Array.isArray(discordPresentation.fields)) {
        errors.push('telemetry sink presentation.discord.fields must be an array when provided');
      }
      if (Array.isArray(discordPresentation.fields)) {
        for (const [index, field] of discordPresentation.fields.entries()) {
          if (!field || typeof field !== 'object' || Array.isArray(field)) {
            errors.push(`telemetry sink presentation.discord.fields[${index}] must be an object`);
            continue;
          }
          if (typeof field.name !== 'string' || typeof field.value !== 'string') {
            errors.push(`telemetry sink presentation.discord.fields[${index}] must include string name and value`);
          }
        }
      }
      errors.push(...validateTelemetryDiscordOperatorPresentation(discordPresentation, record));
    }
  }
  if (!record?.occurredAt || Number.isNaN(Date.parse(record.occurredAt))) {
    errors.push('telemetry sink occurredAt must be an ISO-8601 timestamp');
  }
  return errors;
}

export function assertTelemetrySinkInput(input: UnknownRecord = {}): UnknownRecord {
  const errors = validateTelemetrySinkInput(input);
  if (errors.length) throw new Error(`Invalid telemetry sink input: ${errors.join('; ')}`);
  return input;
}

export async function observeRedisTelemetrySink(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const config = await readTelemetrySinkConfig(ctx);
  const eventType = input?.event?.type;
  const payload = input?.event?.payload || {};
  const result = await emitTelemetryStreamEvent(config, eventType, payload, {
    emittedAt: input?.occurredAt,
    emitter: input?.event?.emitter || 'nova/pipeline/services/telemetry',
    runId: input?.ids?.runId,
  });
  if (ctx?.telemetrySinkState) {
    ctx.telemetrySinkState.redisResult = result || null;
    ctx.telemetrySinkState.redisEvent = result?.event || null;
    ctx.telemetrySinkState.redisStreamKey = result?.streamKey || null;
  }
  if (!result?.ok && !result?.skipped) {
    const error = (result?.error || new Error(`telemetry Redis sink failed for ${eventType}`)) as Error & { streamKey?: string | null };
    error.streamKey = result?.streamKey || null;
    throw error;
  }
}

export async function observeDiscordTelemetrySink(input: UnknownRecord, ctx: UnknownRecord = {}): Promise<void> {
  const presentation = input?.presentation?.discord;
  if (!presentation) return;
  const config = await readTelemetrySinkConfig(ctx);
  if (presentation.embeds !== undefined) {
    throw new Error('telemetry sink presentation.discord.embeds is not supported; use title/description/fields');
  }
  const payload = input?.event?.payload || {};
  await discord(
    config,
    presentation.level || 'INFO',
    presentation.title || input?.event?.type || 'telemetry',
    presentation.description || '',
    Array.isArray(presentation.fields) ? presentation.fields : [],
    {
      deps: ctx?.coreRuntime?.readDeps?.() || null,
      correlation: {
        run_id: payload.run_id ?? input?.ids?.runId ?? null,
        module_id: payload.module_id ?? input?.ids?.moduleId ?? null,
        gate_id: payload.gate_id ?? input?.ids?.gateId ?? null,
        gate_type: payload.gate_type ?? input?.ids?.gateType ?? null,
        attempt: payload.attempt ?? input?.ids?.attempt ?? null,
        dispatch_id: payload.dispatch_id ?? null,
        gateway_label: payload.gateway_label ?? null,
        session_key: payload.session_key ?? null,
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
      priority: TELEMETRY_SINK_PRIORITIES[sinkId] ?? 1000,
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
