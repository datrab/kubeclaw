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

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const MISSING_SINK_REASONS = Object.freeze([
  'telemetry_sink_registry_missing',
  'telemetry_sink_registry_disabled',
  'telemetry_sink_listener_missing',
]);
const TELEMETRY_SINK_FAILED_REASON = 'telemetry_sink_failed';
const TELEMETRY_SINK_ID_MISSING = 'missing_sink_id';

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function textValue(value) {
  return typeof value === 'string' ? value : '';
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function buildTelemetrySinkInvocation(input = {}) {
  return {
    runId: selectTruthyValue(() => (input?.ids?.runId), () => (null)),
    moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
    gateId: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
    gateType: selectTruthyValue(() => (input?.ids?.gateType), () => (null)),
    attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
    eventType: selectTruthyValue(() => (input?.event?.type), () => (null)),
    runRef: selectTruthyValue(() => (input?.refs?.runRef), () => (null)),
    primaryRef: selectTruthyValue(() => (input?.refs?.primaryRef), () => (null)),
    moduleAttemptRef: selectTruthyValue(() => (input?.refs?.moduleAttemptRef), () => (null)),
    gateEvaluationRef: selectTruthyValue(() => (input?.refs?.gateEvaluationRef), () => (null)),
  };
}

function telemetrySinkPayload(input = {}, sinkId = TELEMETRY_SINK_ID_MISSING, reason = TELEMETRY_SINK_FAILED_REASON, detail = null, extra = {}) {
  return {
    component: 'telemetry_sink',
    surface: sinkId,
    reason,
    detail: selectPresentValue(detail, `telemetry sink '${sinkId}' failed`),
    impacted_event_type: selectTruthyValue(() => (input?.event?.type), () => (null)),
    module_id: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
    gate_id: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
    gate_type: selectTruthyValue(() => (input?.ids?.gateType), () => (null)),
    attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
    stream_key: selectTruthyValue(() => (extra.streamKey), () => (null)),
  };
}

function isMissingDiscordWebhook(config = {}) {
  return !textValue(config?.discord_webhook_url).trim();
}

function isDiscordTelemetrySink(moduleId) {
  return moduleId === 'builtin.telemetry.discord';
}

function discordWebhookMissingPayload(input = {}) {
  return {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_url_missing',
    detail: 'discord webhook delivery skipped: config.discord_webhook_url is missing',
    impacted_event_type: selectTruthyValue(() => (input?.event?.type), () => (null)),
    module_id: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
    gate_id: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
    gate_type: selectTruthyValue(() => (input?.ids?.gateType), () => (null)),
    attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
  };
}

function isCanonicalDiscordWebhookMissing(moduleId, config = {}) {
  return isDiscordTelemetrySink(moduleId) && isMissingDiscordWebhook(config);
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
  const config = objectRecord(ctx?.config);
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
  const configured = telemetrySinkTimeoutAuthority(ctx, options);
  const timeoutMs = Number(configured);
  if (selectTruthyValue(() => (!Number.isInteger(timeoutMs)), () => (timeoutMs <= 0))) {
    throw new Error('config.telemetry.sink_timeout_ms: required positive integer in swarm.config.json');
  }
  return timeoutMs;
}

function telemetrySinkTimeoutAuthority(ctx = {}, options = {}) {
  if (options.telemetrySinkTimeoutMs !== undefined && options.telemetrySinkTimeoutMs !== null) return options.telemetrySinkTimeoutMs;
  return ctx?.config?.telemetry?.sink_timeout_ms;
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
  const progress = selectDefinedValue(() => (ctx?.progress), () => (null));
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
      const sinkInput = narrowPluginInputForCapabilities(frozenInput, arrayValue(record.manifest.capabilities));
      const pluginContext = createPluginContext({
        config,
        progress,
        hookFamily: TELEMETRY_SINK_HOOK_FAMILY,
        stageId: TELEMETRY_SINK_STAGE_ID,
        record,
        invocation,
        stateSnapshot: objectRecord(sinkInput.stateSnapshot),
        environmentMetadata: {
          telemetryEventType: selectTruthyValue(() => (sinkInput?.event?.type), () => (null)),
          telemetrySinkModuleId: moduleId,
        },
        injectedDeps: selectTruthyValue(() => (selectTruthyValue(() => (options.deps), () => (ctx?.deps))), () => (null)),
      });
      Object.defineProperty(pluginContext, 'telemetrySinkState', {
        value: telemetrySinkState,
        enumerable: false,
        configurable: true,
      });
      await observeWithTimeout(record.implementation.observe(sinkInput, pluginContext), sinkTimeoutMs, moduleId);
      await recordObservabilityRestored(ctx, telemetrySinkPayload(frozenInput, moduleId, 'telemetry_sink_failed', `telemetry sink '${moduleId}' restored`, {
        streamKey: selectTruthyValue(() => (telemetrySinkState.redisStreamKey), () => (null)),
      }));
      results.push({ moduleId, ok: true });
    } catch (error) {
      const detail = selectPresentValue(error?.message, `telemetry sink '${moduleId}' failed`);
      log('WARN', `[telemetry] sink '${moduleId}' degraded on '${eventType}': ${detail}`);
      if (isCanonicalDiscordWebhookMissing(moduleId, config)) {
        await recordObservabilityDegraded(ctx, discordWebhookMissingPayload(frozenInput));
        results.push({ moduleId, ok: false, error: detail });
        continue;
      }
      await recordObservabilityDegraded(ctx, telemetrySinkPayload(frozenInput, moduleId, 'telemetry_sink_failed', detail, {
        streamKey: selectTruthyValue(() => (selectTruthyValue(() => (error?.streamKey), () => (telemetrySinkState.redisStreamKey))), () => (null)),
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
