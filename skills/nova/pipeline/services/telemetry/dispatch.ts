import { log } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import {
  buildNonBlockingIncidentKey,
  reportClassifiedNonBlockingError,
} from '../../noncritical-reporting.ts';
import { appendStructuredEvent, recordObservabilityDegraded } from '../observability.ts';
import { dispatchTelemetrySinks } from '../telemetry-sink-dispatch.ts';
import { appendDurableOperatorAlert } from '../durable-operator-alert.ts';
import { assertTelemetryEventPayload } from './payload-schema.ts';

function appendCoreTelemetryEvent(ctx, eventType, payload = {}, options = {}, sinkResult = null) {
  const config = ctx?.config || {};
  const redisEvent = sinkResult?.telemetrySinkState?.redisEvent || null;
  const diskPayload = redisEvent && typeof redisEvent === 'object'
    ? redisEvent
    : {
        ...(payload || {}),
        source: options.source || payload?.source || 'pipeline',
        emitter: options.emitter || payload?.emitter || 'nova/pipeline/services/telemetry',
      };
  const result = appendStructuredEvent(config, eventType, diskPayload);
  if (!result?.ok) {
    reportTelemetryWrapperFailure(ctx, eventType, result?.error || new Error('core telemetry disk append failed'));
  }
  return result;
}

function reportTelemetryWrapperFailure(ctx, eventType, error) {
  const config = ctx?.config || {};
  const runId = getRunId(config) || ctx?.runId || config?.run_id || config?._runId || 'unknown';
  reportClassifiedNonBlockingError({
    log,
    reporter: 'telemetry',
    classification: 'event_emit_failed',
    incidentKey: buildNonBlockingIncidentKey('telemetry', config?.project || 'unknown', runId, eventType, 'event_emit_failed'),
    message: `non-blocking telemetry emission failed for '${eventType}'`,
    error,
    level: 'DEBUG',
  });
}

export function emitEventNonBlocking(ctx, eventType, payload = {}, options = {}) {
  return emitEvent(ctx, eventType, payload, options).catch((error) => {
    reportTelemetryWrapperFailure(ctx, eventType, error);
  });
}

/**
 * Emit a structured pipeline event through the core telemetry spine.
 *
 * Core owns the durable disk audit append. Redis and Discord delivery are
 * registry-owned telemetry sink plugins. Sink failure records degraded
 * observability instead of rerouting to another network sink.
 */
export async function emitEvent(ctx, eventType, payload = {}, options = {}) {
  try {
    assertTelemetryEventPayload(eventType, payload);
  } catch (error) {
    reportTelemetryWrapperFailure(ctx, eventType, error);
    await recordObservabilityDegraded(ctx, {
      component: 'telemetry_spine',
      surface: 'core_emit',
      reason: 'telemetry_payload_invalid',
      detail: error?.message || 'telemetry payload validation failed',
      impacted_event_type: eventType || null,
      validation_errors: Array.isArray(error?.validationErrors) ? error.validationErrors : [],
    });
    return {
      input: null,
      listeners: [],
      results: [],
      listenerMissing: false,
      telemetrySinkState: {},
      validationError: error?.message || String(error),
      event: null,
      disk: null,
    };
  }

  let sinkResult = null;
  try {
    sinkResult = await dispatchTelemetrySinks(ctx, eventType, payload, options);
  } catch (error) {
    reportTelemetryWrapperFailure(ctx, eventType, error);
    await recordObservabilityDegraded(ctx, {
      component: 'telemetry_spine',
      surface: 'core_emit',
      reason: 'telemetry_sink_dispatch_failed',
      detail: error?.message || 'telemetry sink dispatch failed',
      impacted_event_type: eventType || null,
    });
  }
  const diskResult = appendCoreTelemetryEvent(ctx, eventType, payload, options, sinkResult);
  return {
    ...(sinkResult || {}),
    event: diskResult?.event || null,
    disk: diskResult || null,
  };
}

export async function emitOperatorAlert(ctx, eventType, payload = {}, options = {}) {
  const durable = appendDurableOperatorAlert(ctx?.config || {}, eventType, payload, options);
  try {
    const sinkResult = await dispatchTelemetrySinks(ctx, eventType, payload, {
      ...options,
      sinkModuleIds: ['builtin.telemetry.discord'],
    });
    return { ...sinkResult, durable };
  } catch (error) {
    reportTelemetryWrapperFailure(ctx, eventType, error);
    await recordObservabilityDegraded(ctx, {
      component: 'telemetry_spine',
      surface: 'core_emit',
      reason: 'operator_alert_sink_dispatch_failed',
      detail: error?.message || 'operator alert sink dispatch failed',
      impacted_event_type: eventType || null,
    });
    return { input: null, listeners: [], results: [], dispatchError: error?.message || String(error), durable };
  }
}
