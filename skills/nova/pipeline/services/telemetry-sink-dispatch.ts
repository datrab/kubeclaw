import { log } from '../core/logger.ts';
import { createPluginContext, narrowPluginInputForCapabilities } from '../core/context.ts';
import { getPluginRegistry, resolveHookListeners } from '../core/registry.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from './observability.ts';
import {
  TELEMETRY_SINK_HOOK_FAMILY,
  TELEMETRY_SINK_STAGE_ID,
  assertTelemetrySinkInput,
  buildTelemetrySinkInput,
} from './telemetry-sink-contract.ts';
import { deepClone, deepFreeze } from './serialization.ts';

const MISSING_SINK_REASONS = Object.freeze([
  'telemetry_sink_registry_missing',
  'telemetry_sink_registry_disabled',
  'telemetry_sink_listener_missing',
]);

function buildTelemetrySinkInvocation(input = {}) {
  return {
    runId: input?.ids?.runId || null,
    moduleId: input?.ids?.moduleId || null,
    gateId: input?.ids?.gateId || null,
    gateType: input?.ids?.gateType || null,
    attempt: input?.ids?.attempt ?? null,
    eventType: input?.event?.type || null,
    runRef: input?.refs?.runRef || null,
    primaryRef: input?.refs?.primaryRef || null,
    moduleAttemptRef: input?.refs?.moduleAttemptRef || null,
    gateEvaluationRef: input?.refs?.gateEvaluationRef || null,
  };
}

function telemetrySinkPayload(input = {}, sinkId = 'unknown', reason = 'telemetry_sink_failed', detail = null, extra = {}) {
  return {
    component: 'telemetry_sink',
    surface: sinkId,
    reason,
    detail: detail || `telemetry sink '${sinkId}' failed`,
    impacted_event_type: input?.event?.type || null,
    module_id: input?.ids?.moduleId || null,
    gate_id: input?.ids?.gateId || null,
    gate_type: input?.ids?.gateType || null,
    attempt: input?.ids?.attempt ?? null,
    stream_key: extra.streamKey || null,
  };
}

function resolveMissingSinkIncident(config, input) {
  const registry = getPluginRegistry(config);
  if (!registry) {
    return {
      reason: 'telemetry_sink_registry_missing',
      detail: 'Telemetry sink dispatch could not run because the startup-frozen plugin registry is missing.',
    };
  }
  if (registry.enabled === false) {
    return {
      reason: 'telemetry_sink_registry_disabled',
      detail: 'Telemetry sink dispatch could not run because the startup-frozen plugin registry is disabled.',
    };
  }
  return {
    reason: 'telemetry_sink_listener_missing',
    detail: `Telemetry sink stage '${TELEMETRY_SINK_STAGE_ID}' has no enabled listeners in the startup-frozen plugin registry.`,
  };
}

async function reportMissingSink(ctx = {}, input = {}) {
  const config = ctx?.config || {};
  const incident = resolveMissingSinkIncident(config, input);
  await recordObservabilityDegraded(ctx, telemetrySinkPayload(input, 'registry', incident.reason, incident.detail));
  log('WARN', `[telemetry] ${incident.detail}`);
  return incident;
}

async function restoreMissingSinkIfNeeded(ctx = {}, input = {}) {
  for (const reason of MISSING_SINK_REASONS) {
    await recordObservabilityRestored(ctx, telemetrySinkPayload(input, 'registry', reason, 'telemetry sink registry/listener availability restored'));
  }
}

function resolveTelemetrySinkTimeoutMs(ctx = {}, options = {}) {
  const configured = options.telemetrySinkTimeoutMs
    ?? ctx?.config?.telemetry?.sink_timeout_ms;
  const timeoutMs = Number(configured);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('config.telemetry.sink_timeout_ms: required positive number in swarm.config.json');
  }
  return timeoutMs;
}

function observeWithTimeout(observePromise, timeoutMs, moduleId) {
  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`telemetry sink '${moduleId}' timed out after ${timeoutMs}ms`);
      error.code = 'TELEMETRY_SINK_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([observePromise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export async function dispatchTelemetrySinks(ctx = {}, eventType, payload = {}, options = {}) {
  const config = ctx?.config;
  const progress = ctx?.progress || null;
  const input = assertTelemetrySinkInput(buildTelemetrySinkInput(ctx, eventType, payload, options));
  const allListeners = resolveHookListeners(config, TELEMETRY_SINK_HOOK_FAMILY, TELEMETRY_SINK_STAGE_ID);
  const allowedModuleIds = Array.isArray(options.sinkModuleIds)
    ? new Set(options.sinkModuleIds.filter(Boolean).map(String))
    : null;
  const listeners = allowedModuleIds
    ? allListeners.filter((record) => allowedModuleIds.has(record?.manifest?.moduleId))
    : allListeners;

  if (!listeners.length) {
    const incident = await reportMissingSink(ctx, input);
    return {
      input,
      listeners: [],
      results: [],
      listenerMissing: true,
      reason: incident.reason,
      telemetrySinkState: {},
    };
  }

  await restoreMissingSinkIfNeeded(ctx, input);

  const frozenInput = deepFreeze(deepClone(input));
  const invocation = buildTelemetrySinkInvocation(frozenInput);
  const telemetrySinkState = {};
  const results = [];
  const sinkTimeoutMs = resolveTelemetrySinkTimeoutMs(ctx, options);

  for (const record of listeners) {
    const moduleId = record.manifest.moduleId;
    try {
      const sinkInput = narrowPluginInputForCapabilities(frozenInput, record.manifest.capabilities || []);
      const pluginContext = createPluginContext({
        config,
        progress,
        hookFamily: TELEMETRY_SINK_HOOK_FAMILY,
        stageId: TELEMETRY_SINK_STAGE_ID,
        record,
        invocation,
        stateSnapshot: sinkInput.stateSnapshot || {},
        environmentMetadata: {
          telemetryEventType: sinkInput?.event?.type || null,
          telemetrySinkModuleId: moduleId,
        },
        injectedDeps: options.deps || ctx?.deps || null,
      });
      Object.defineProperty(pluginContext, 'telemetrySinkState', {
        value: telemetrySinkState,
        enumerable: false,
        configurable: true,
      });
      await observeWithTimeout(record.implementation.observe(sinkInput, pluginContext), sinkTimeoutMs, moduleId);
      await recordObservabilityRestored(ctx, telemetrySinkPayload(frozenInput, moduleId, 'telemetry_sink_failed', `telemetry sink '${moduleId}' restored`, {
        streamKey: telemetrySinkState.redisStreamKey || null,
      }));
      results.push({ moduleId, ok: true });
    } catch (error) {
      const detail = error?.message || `telemetry sink '${moduleId}' failed`;
      log('WARN', `[telemetry] sink '${moduleId}' degraded on '${eventType}': ${detail}`);
      await recordObservabilityDegraded(ctx, telemetrySinkPayload(frozenInput, moduleId, 'telemetry_sink_failed', detail, {
        streamKey: error?.streamKey || telemetrySinkState.redisStreamKey || null,
      }));
      results.push({ moduleId, ok: false, error: detail });
    }
  }

  return {
    input: frozenInput,
    listeners: listeners.map((record) => record.manifest.moduleId),
    results,
    listenerMissing: false,
    telemetrySinkState,
  };
}
