import { log } from '../core/logger.ts';
import { createPluginContext, narrowPluginInputForCapabilities } from '../core/context.ts';
import { getPluginRegistry, resolveHookListeners } from '../core/registry.ts';
import { assertNotificationEventInput, buildNotificationEventInput } from './notification-contract.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from './observability.ts';
import { deepClone, deepFreeze } from './serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const MISSING_NOTIFICATION_REASONS = Object.freeze([
  'notification_registry_missing',
  'notification_registry_disabled',
  'notification_listener_missing',
]);

function buildNotificationInvocation(input = {}) {
  return {
    runId: selectTruthyValue(() => (input?.ids?.runId), () => (null)),
    moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
    gateId: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
    gateType: selectTruthyValue(() => (input?.ids?.gateType), () => (null)),
    attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
    runRef: selectTruthyValue(() => (input?.refs?.runRef), () => (null)),
    primaryRef: selectTruthyValue(() => (input?.refs?.primaryRef), () => (null)),
    moduleAttemptRef: selectTruthyValue(() => (input?.refs?.moduleAttemptRef), () => (null)),
    gateEvaluationRef: selectTruthyValue(() => (input?.refs?.gateEvaluationRef), () => (null)),
  };
}

function notificationPayload(input = {}, surface = 'listener_registry', reason = 'notification_listener_missing', detail = null) {
  return {
    component: 'notification',
    surface,
    reason,
    detail,
    impacted_event_type: selectTruthyValue(() => (selectTruthyValue(() => (input?.event?.type), () => (input?.ids?.hookId))), () => (null)),
    hook_id: selectTruthyValue(() => (input?.ids?.hookId), () => (null)),
    stage_id: selectTruthyValue(() => (input?.ids?.stageId), () => (null)),
    module_id: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
    gate_id: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
    gate_type: selectTruthyValue(() => (input?.ids?.gateType), () => (null)),
    attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
  };
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
  const config = selectDefinedValue(() => (ctx?.config), () => ({}));
  const incident = resolveMissingListenerIncident(config, input);
  await recordObservabilityDegraded(ctx, notificationPayload(input, 'listener_registry', incident.reason, incident.detail));
  log('WARN', `[notification] ${incident.detail}`);
  return incident;
}

async function restoreMissingListenersIfNeeded(ctx, input) {
  for (const reason of MISSING_NOTIFICATION_REASONS) {
    await recordObservabilityRestored(ctx, notificationPayload(input, 'listener_registry', reason, 'notification listener registry availability restored'));
  }
}

function ensureBuiltinNotificationRuntime(pluginContext, record, config, progress) {
  if (record?.manifest?.sourceType !== 'builtin') return;
  if (typeof pluginContext?.coreRuntime?.readConfig === 'function') return;
  Object.defineProperty(pluginContext, 'coreRuntime', {
    value: Object.freeze({
      readConfig: () => config,
      readProgress: () => progress,
      readDeps: () => null,
      signal: null,
    }),
    enumerable: false,
    configurable: false,
  });
}

export async function dispatchNotificationHook(ctx = {}, hookId, envelope = {}) {
  const config = ctx?.config;
  const progress = selectTruthyValue(() => (ctx?.progress), () => (null));
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

  await restoreMissingListenersIfNeeded(ctx, input);

  const frozenInput = deepFreeze(deepClone(input));
  const invocation = buildNotificationInvocation(frozenInput);
  const notificationState = {};
  const results = [];

  for (const record of listeners) {
    const moduleId = record.manifest.moduleId;
    try {
      const listenerInput = narrowPluginInputForCapabilities(frozenInput, selectDefinedValue(() => (record.manifest.capabilities), () => ([])));
      const pluginContext = createPluginContext({
        config,
        progress,
        hookFamily: hookId,
        stageId: listenerInput.ids.stageId,
        record,
        invocation,
        stateSnapshot: selectDefinedValue(() => (listenerInput.stateSnapshot), () => ({})),
        environmentMetadata: {
          notificationHook: hookId,
          notificationEventType: selectTruthyValue(() => (listenerInput?.event?.type), () => (null)),
        },
      });
      ensureBuiltinNotificationRuntime(pluginContext, record, config, progress);
      Object.defineProperty(pluginContext, 'notificationState', {
        value: notificationState,
        enumerable: false,
        configurable: true,
      });
      await record.implementation.observe(listenerInput, pluginContext);
      await recordObservabilityRestored(ctx, notificationPayload(frozenInput, moduleId, 'notification_listener_failed', `notification listener '${moduleId}' restored`));
      results.push({ moduleId, ok: true });
    } catch (error) {
      const detail = selectDefinedValue(() => (error?.message), () => (`notification listener '${moduleId}' failed`));
      log('WARN', `[notification] listener '${moduleId}' degraded on '${hookId}': ${detail}`);
      await recordObservabilityDegraded(ctx, notificationPayload(frozenInput, moduleId, 'notification_listener_failed', detail));
      results.push({ moduleId, ok: false, error: detail });
    }
  }

  return {
    input: frozenInput,
    listeners: listeners.map((record) => record.manifest.moduleId),
    results,
    listenerMissing: false,
  };
}
