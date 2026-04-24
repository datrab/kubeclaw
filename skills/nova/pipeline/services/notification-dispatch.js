import { log } from '../core/logger.js';
import { createPluginContext } from '../core/context.js';
import { getPluginRegistry, resolveHookListeners } from '../core/registry.js';
import { assertNotificationEventInput, buildNotificationEventInput } from './notification-contract.js';
import { appendStructuredEvent } from './observability.js';
import { emitTelemetryStreamEvent } from './telemetry-stream.js';

const _notificationDispatchIncidents = new Set();

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function buildNotificationInvocation(input = {}) {
  return {
    runId: input?.ids?.runId || null,
    moduleId: input?.ids?.moduleId || null,
    gateId: input?.ids?.gateId || null,
    gateType: input?.ids?.gateType || null,
    attempt: input?.ids?.attempt ?? null,
    runRef: input?.refs?.runRef || null,
    primaryRef: input?.refs?.primaryRef || null,
    moduleAttemptRef: input?.refs?.moduleAttemptRef || null,
    gateEvaluationRef: input?.refs?.gateEvaluationRef || null,
  };
}

function notificationIncidentKey(config = {}, input = {}, reason = 'unknown') {
  return [
    config?.project || 'unknown',
    input?.ids?.runId || 'unknown',
    input?.ids?.stageId || input?.ids?.hookId || 'unknown',
    reason,
  ].join(':');
}

function resolveMissingListenerIncident(config, input) {
  const registry = getPluginRegistry(config);
  if (!registry) {
    return {
      reason: 'notification_registry_missing',
      detail: `Notification hook '${input?.ids?.hookId}' could not dispatch because the startup-frozen plugin registry is missing.`,
    };
  }
  if (registry.enabled === false) {
    return {
      reason: 'notification_registry_disabled',
      detail: `Notification hook '${input?.ids?.hookId}' could not dispatch because the startup-frozen plugin registry is disabled.`,
    };
  }
  return {
    reason: 'notification_listener_missing',
    detail: `Notification hook '${input?.ids?.hookId}' stage '${input?.ids?.stageId}' has no enabled listeners in the startup-frozen plugin registry.`,
  };
}

async function reportMissingListeners(ctx, input) {
  const config = ctx?.config || {};
  const incident = resolveMissingListenerIncident(config, input);
  const incidentKey = notificationIncidentKey(config, input, incident.reason);
  if (_notificationDispatchIncidents.has(incidentKey)) {
    return incident;
  }
  _notificationDispatchIncidents.add(incidentKey);

  const payload = {
    component: 'notification',
    surface: 'listener_registry',
    reason: incident.reason,
    detail: incident.detail,
    impacted_event_type: input?.event?.type || input?.ids?.hookId || null,
    hook_id: input?.ids?.hookId || null,
    stage_id: input?.ids?.stageId || null,
    module_id: input?.ids?.moduleId || null,
    gate_id: input?.ids?.gateId || null,
    gate_type: input?.ids?.gateType || null,
    attempt: input?.ids?.attempt ?? null,
  };

  appendStructuredEvent(config, 'observability.degraded', payload);
  await emitTelemetryStreamEvent(config, 'observability.degraded', payload, {
    emittedAt: input?.occurredAt,
    emitter: 'nova/pipeline/services/notification-dispatch',
    runId: input?.ids?.runId || null,
  });
  log('WARN', `[notification] ${incident.detail}`);
  return incident;
}

export async function dispatchNotificationHook(ctx = {}, hookId, envelope = {}) {
  const config = ctx?.config;
  const progress = ctx?.progress || null;
  const input = assertNotificationEventInput(buildNotificationEventInput(ctx, hookId, envelope));
  const listeners = resolveHookListeners(config, hookId, input.ids.stageId);

  if (!listeners.length) {
    const incident = await reportMissingListeners(ctx, input);
    return {
      input,
      listeners: [],
      results: [],
      listenerMissing: true,
      reason: incident.reason,
    };
  }

  const frozenInput = deepFreeze(deepClone(input));
  const invocation = buildNotificationInvocation(frozenInput);
  const notificationState = {};
  const results = [];

  for (const record of listeners) {
    try {
      const pluginContext = createPluginContext({
        config,
        progress,
        hookFamily: hookId,
        stageId: frozenInput.ids.stageId,
        record,
        invocation,
        stateSnapshot: frozenInput.stateSnapshot || {},
        environmentMetadata: {
          notificationHook: hookId,
          notificationEventType: frozenInput?.event?.type || null,
        },
      });
      Object.defineProperty(pluginContext, 'notificationState', {
        value: notificationState,
        enumerable: false,
        configurable: true,
      });
      await record.implementation.observe(frozenInput, pluginContext);
      results.push({ moduleId: record.manifest.moduleId, ok: true });
    } catch (error) {
      log('WARN', `[notification] listener '${record.manifest.moduleId}' degraded on '${hookId}': ${error.message}`);
      results.push({ moduleId: record.manifest.moduleId, ok: false, error: error.message });
    }
  }

  return {
    input: frozenInput,
    listeners: listeners.map((record) => record.manifest.moduleId),
    results,
    listenerMissing: false,
  };
}
