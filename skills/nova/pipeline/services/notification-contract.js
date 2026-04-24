import { getRunId } from '../core/runtime.js';
import { PLUGIN_CONTRACT_VERSION } from '../core/constants.js';
import { discord, discordEmbeds } from '../integrations/discord.js';
import { appendStructuredEvent, appendStructuredEventMirror } from './observability.js';
import { emitTelemetryStreamEvent } from './telemetry-stream.js';

export const NOTIFICATION_HOOK_IDS = Object.freeze([
  'pipeline.started',
  'pipeline.completed',
  'module.started',
  'module.completed',
  'gate.started',
  'gate.completed',
]);

const NOTIFICATION_SINK_PRIORITIES = Object.freeze({
  telemetry: 100,
  structured_event_artifact: 200,
  discord: 300,
});
const _telemetrySinkHealth = new Map();

function canonicalRef(prefix, value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.startsWith(`${prefix}:`) ? normalized : `${prefix}:${normalized}`;
}

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

async function readNotificationConfig(ctx = {}) {
  if (typeof ctx?.read?.config === 'function') return ctx.read.config();
  return ctx?.config || null;
}

function normalizeNotificationIds(hookId, ctx = {}, envelope = {}) {
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

function normalizeNotificationRefs(ids = {}, envelope = {}) {
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

export function buildNotificationEventInput(ctx = {}, hookId, envelope = {}) {
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

export function validateNotificationEventInput(input = {}) {
  const errors = [];
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
  return errors;
}

export function assertNotificationEventInput(input = {}) {
  const errors = validateNotificationEventInput(input);
  if (errors.length) {
    throw new Error(`Invalid notification event input: ${errors.join('; ')}`);
  }
  return input;
}

export async function observeTelemetryNotification(input, ctx = {}) {
  const config = await readNotificationConfig(ctx);
  const eventType = input?.event?.type || input?.ids?.hookId;
  const payload = input?.event?.payload || {};
  const emitter = input?.event?.emitter || 'nova/pipeline/services/telemetry';
  const healthKey = `${config?.project || 'unknown'}:${input?.ids?.runId || 'unknown'}`;
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
    const prev = _telemetrySinkHealth.get(healthKey);
    if (!prev?.degraded) {
      const startedAt = new Date().toISOString();
      _telemetrySinkHealth.set(healthKey, {
        degraded: true,
        startedAt,
        reason: 'redis_emit_failed',
        streamKey: result?.streamKey || null,
      });
      appendStructuredEvent(config, 'observability.degraded', {
        component: 'telemetry',
        surface: 'redis_stream',
        reason: 'redis_emit_failed',
        detail: result?.error?.message || 'redis telemetry emission failed',
        impacted_event_type: eventType,
        stream_key: result?.streamKey || null,
        degraded_at: startedAt,
      });
    }
    throw result.error || new Error(`telemetry sink failed for ${eventType}`);
  }

  const prev = _telemetrySinkHealth.get(healthKey);
  if (prev?.degraded) {
    const restoredAt = new Date().toISOString();
    const restoredPayload = {
      component: 'telemetry',
      surface: 'redis_stream',
      reason: prev.reason || 'redis_emit_failed',
      detail: 'redis telemetry emission restored',
      stream_key: result?.streamKey || prev.streamKey || null,
      degraded_at: prev.startedAt || null,
      restored_at: restoredAt,
      restored_after_ms: prev.startedAt ? Math.max(0, Date.now() - new Date(prev.startedAt).getTime()) : null,
    };
    _telemetrySinkHealth.set(healthKey, { degraded: false, restoredAt, reason: prev.reason || 'redis_emit_failed' });
    appendStructuredEvent(config, 'observability.restored', restoredPayload);
    await emitTelemetryStreamEvent(config, 'observability.restored', restoredPayload, {
      emittedAt: restoredAt,
      emitter: 'nova/pipeline/services/telemetry',
      runId: input?.ids?.runId,
    });
  }
}

export async function observeStructuredEventNotification(input, ctx = {}) {
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

export async function observeDiscordNotification(input, ctx = {}) {
  const presentation = input?.presentation?.discord;
  if (!presentation) return;
  const config = await readNotificationConfig(ctx);
  if (Array.isArray(presentation.embeds) && presentation.embeds.length) {
    await discordEmbeds(config, presentation.embeds, { level: presentation.level || 'INFO' });
    return;
  }
  await discord(
    config,
    presentation.level || 'INFO',
    presentation.title || input?.event?.type || input?.ids?.hookId,
    presentation.description || '',
    Array.isArray(presentation.fields) ? presentation.fields : [],
  );
}

function sanitizeHookIdForModuleId(hookId) {
  return String(hookId || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildNotificationDefinition({ sinkId, hookId, displayName, description, defaultEnabled = true, capabilities = [], observe }) {
  const moduleSuffix = sanitizeHookIdForModuleId(hookId);
  return {
    manifest: {
      moduleId: `builtin.notification.${sinkId}.${moduleSuffix}`,
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'notification',
      hookFamily: hookId,
      stageIds: [hookId],
      capabilities: ['read.state', 'emit.stream', ...capabilities],
      configSchema: { type: 'object', additionalProperties: true },
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

export function getBuiltinNotificationPluginDefinitions() {
  const definitions = [];
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
