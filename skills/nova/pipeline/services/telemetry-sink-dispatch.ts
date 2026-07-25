import { log } from '../core/logger.ts';
import { createPluginContext, narrowPluginInputForCapabilities } from '../core/context.ts';
import { getPluginRegistry, resolveHookListeners } from '../core/registry-access.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from './observability.ts';
import {
  TELEMETRY_SINK_HOOK_FAMILY,
  TELEMETRY_SINK_STAGE_ID,
  assertTelemetrySinkInput,
  buildTelemetrySinkInput,
} from './telemetry-sink-contract.ts';
import { deepClone, deepFreeze } from './serialization.ts';
import { arrayValue, objectRecord, selectPresentValue, textValue } from '../value-boundary.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const MISSING_SINK_REASONS = Object.freeze([
  'telemetry_sink_registry_missing',
  'telemetry_sink_registry_disabled',
  'telemetry_sink_listener_missing',
]);
const TELEMETRY_SINK_FAILED_REASON = 'telemetry_sink_failed';
const TELEMETRY_SINK_ID_MISSING = 'missing_sink_id';

function buildTelemetrySinkInvocation(input: any = {}) {
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

function telemetrySinkPayload(input: any = {}, sinkId: any = TELEMETRY_SINK_ID_MISSING, reason: any = TELEMETRY_SINK_FAILED_REASON, detail: any = null, extra: any = {}) {
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

function isMissingDiscordWebhook(config: any = {}) {
  return !textValue(config?.discord_webhook_url).trim();
}

function isDiscordTelemetrySink(moduleId: any) {
  return moduleId === 'builtin.telemetry.discord';
}

function discordWebhookMissingPayload(input: any = {}) {
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

function isCanonicalDiscordWebhookMissing(moduleId: any, config: any = {}) {
  return isDiscordTelemetrySink(moduleId) && isMissingDiscordWebhook(config);
}

function resolveMissingSinkIncident(config: any, input: any) {
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

async function reportMissingSink(ctx: any = {}, input: any = {}) {
  const config = objectRecord(ctx?.config);
  const incident = resolveMissingSinkIncident(config, input);
  await recordObservabilityDegraded(ctx, telemetrySinkPayload(input, 'registry', incident.reason, incident.detail));
  log('WARN', `[telemetry] ${incident.detail}`);
  return incident;
}

async function restoreMissingSinkIfNeeded(ctx: any = {}, input: any = {}) {
  for (const reason of MISSING_SINK_REASONS) {
    await recordObservabilityRestored(ctx, telemetrySinkPayload(input, 'registry', reason, 'telemetry sink registry/listener availability restored'));
  }
}

function resolveTelemetrySinkTimeoutMs(ctx: any = {}, options: any = {}) {
  const configured = telemetrySinkTimeoutAuthority(ctx, options);
  const timeoutMs = Number(configured);
  if (selectTruthyValue(() => (!Number.isInteger(timeoutMs)), () => (timeoutMs <= 0))) {
    throw new Error('config.telemetry.sink_timeout_ms: required positive integer in swarm.config.json');
  }
  return timeoutMs;
}

function telemetrySinkTimeoutAuthority(ctx: any = {}, options: any = {}) {
  if (options.telemetrySinkTimeoutMs !== undefined && options.telemetrySinkTimeoutMs !== null) return options.telemetrySinkTimeoutMs;
  return ctx?.config?.telemetry?.sink_timeout_ms;
}

function observeWithTimeout(observePromise: any, timeoutMs: any, moduleId: any) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise((_: any, reject: any) => {
    timeout = setTimeout(() => {
      const error = new Error(`telemetry sink '${moduleId}' timed out after ${timeoutMs}ms`) as Error & { code?: string };
      error.code = 'TELEMETRY_SINK_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([observePromise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function telemetrySinkInjectedDeps(context: any) {
  if (context.options.deps !== undefined && context.options.deps !== null) return context.options.deps;
  return context.ctx?.deps ?? null;
}

function telemetrySinkErrorStreamKey(error: any, state: any) {
  if (error?.streamKey !== undefined && error?.streamKey !== null) return error.streamKey;
  return state.redisStreamKey ?? null;
}

async function dispatchTelemetrySink(record: any, context: any) {
  const moduleId = record.manifest.moduleId;
  try {
    const sinkInput = narrowPluginInputForCapabilities(context.input, arrayValue(record.manifest.capabilities));
    const pluginContext = createPluginContext({
      config: context.config, progress: context.progress,
      hookFamily: TELEMETRY_SINK_HOOK_FAMILY, stageId: TELEMETRY_SINK_STAGE_ID,
      record, invocation: context.invocation,
      stateSnapshot: objectRecord(sinkInput.stateSnapshot),
      environmentMetadata: { telemetryEventType: sinkInput?.event?.type ?? null, telemetrySinkModuleId: moduleId },
      injectedDeps: telemetrySinkInjectedDeps(context),
    });
    Object.defineProperty(pluginContext, 'telemetrySinkState', {
      value: context.telemetrySinkState, enumerable: false, configurable: true,
    });
    await observeWithTimeout(record.implementation.observe(sinkInput, pluginContext), context.timeoutMs, moduleId);
    await recordObservabilityRestored(context.ctx, telemetrySinkPayload(context.input, moduleId, 'telemetry_sink_failed', `telemetry sink '${moduleId}' restored`, {
      streamKey: context.telemetrySinkState.redisStreamKey ?? null,
    }));
    return { moduleId, ok: true };
  } catch (error: any) {
    const detail = selectPresentValue(error?.message, `telemetry sink '${moduleId}' failed`);
    log('WARN', `[telemetry] sink '${moduleId}' degraded on '${context.eventType}': ${detail}`);
    const payload = isCanonicalDiscordWebhookMissing(moduleId, context.config)
      ? discordWebhookMissingPayload(context.input)
      : telemetrySinkPayload(context.input, moduleId, 'telemetry_sink_failed', detail, {
        streamKey: telemetrySinkErrorStreamKey(error, context.telemetrySinkState),
      });
    await recordObservabilityDegraded(context.ctx, payload);
    return { moduleId, ok: false, error: detail };
  }
}

export async function dispatchTelemetrySinks(ctx: any = {}, eventType: any, payload: any = {}, options: any = {}) {
  const config = ctx?.config;
  const progress = selectDefinedValue(() => (ctx?.progress), () => (null));
  const input = assertTelemetrySinkInput(buildTelemetrySinkInput(ctx, eventType, payload, options));
  const allListeners = resolveHookListeners(config, TELEMETRY_SINK_HOOK_FAMILY, TELEMETRY_SINK_STAGE_ID);
  const allowedModuleIds = Array.isArray(options.sinkModuleIds)
    ? new Set(options.sinkModuleIds.filter(Boolean).map(String))
    : null;
  const listeners = allowedModuleIds
    ? allListeners.filter((record: any) => allowedModuleIds.has(record?.manifest?.moduleId))
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
  const telemetrySinkState: any = {};
  const results: any[] = [];
  const sinkTimeoutMs = resolveTelemetrySinkTimeoutMs(ctx, options);

  for (const record of listeners) results.push(await dispatchTelemetrySink(record, {
    ctx, config, progress, input: frozenInput, invocation, telemetrySinkState,
    timeoutMs: sinkTimeoutMs, options, eventType,
  }));

  return {
    input: frozenInput,
    listeners: listeners.map((record: any) => record.manifest.moduleId),
    results,
    listenerMissing: false,
    telemetrySinkState,
  };
}
