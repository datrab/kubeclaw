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

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const TELEMETRY_SOURCE_PIPELINE = 'pipeline';
const TELEMETRY_EMITTER = 'nova/pipeline/services/telemetry';
const TELEMETRY_PAYLOAD_VALIDATION_FAILED = 'telemetry payload validation failed';
const TELEMETRY_SINK_DISPATCH_FAILED = 'telemetry sink dispatch failed';
const OPERATOR_ALERT_SINK_DISPATCH_FAILED = 'operator alert sink dispatch failed';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function errorDetail(error) {
  return typeof error?.message === 'string' && error.message ? error.message : String(error);
}

function telemetryAppendFailureError(result) {
  return selectDefinedValue(() => (result?.error), () => (new Error('core telemetry disk append failed')));
}

function appendCoreTelemetryEvent(ctx, eventType, payload = {}, options = {}, sinkResult = null) {
  const config = objectRecord(ctx?.config);
  const redisEvent = selectTruthyValue(() => (sinkResult?.telemetrySinkState?.redisEvent), () => (null));
  const diskPayload = redisEvent && typeof redisEvent === 'object'
    ? redisEvent
    : {
        ...objectRecord(payload),
        source: selectPresentValue(options.source, payload?.source, TELEMETRY_SOURCE_PIPELINE),
        emitter: selectPresentValue(options.emitter, payload?.emitter, TELEMETRY_EMITTER),
      };
  const result = appendStructuredEvent(config, eventType, diskPayload);
  if (!result?.ok) {
    reportTelemetryWrapperFailure(ctx, eventType, telemetryAppendFailureError(result));
  }
  return result;
}

function reportTelemetryWrapperFailure(ctx, eventType, error) {
  const config = objectRecord(ctx?.config);
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (getRunId(config)), () => (ctx?.runId))), () => (config?.run_id))), () => (config?._runId))), () => ('missing_run_id'));
  reportClassifiedNonBlockingError({
    log,
    reporter: 'telemetry',
    classification: 'event_emit_failed',
    incidentKey: buildNonBlockingIncidentKey('telemetry', selectTruthyValue(() => (config?.project), () => ('missing_project')), runId, eventType, 'event_emit_failed'),
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
      detail: selectPresentValue(error?.message, TELEMETRY_PAYLOAD_VALIDATION_FAILED),
      impacted_event_type: selectTruthyValue(() => (eventType), () => (null)),
      validation_errors: Array.isArray(error?.validationErrors) ? error.validationErrors : [],
    });
    return {
      input: null,
      listeners: [],
      results: [],
      listenerMissing: false,
      telemetrySinkState: {},
      validationError: errorDetail(error),
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
      detail: selectPresentValue(error?.message, TELEMETRY_SINK_DISPATCH_FAILED),
      impacted_event_type: selectTruthyValue(() => (eventType), () => (null)),
    });
  }
  const diskResult = appendCoreTelemetryEvent(ctx, eventType, payload, options, sinkResult);
  return {
    ...objectRecord(sinkResult),
    event: selectTruthyValue(() => (diskResult?.event), () => (null)),
    disk: selectTruthyValue(() => (diskResult), () => (null)),
  };
}

export async function emitOperatorAlert(ctx, eventType, payload = {}, options = {}) {
  const durable = appendDurableOperatorAlert(objectRecord(ctx?.config), eventType, payload, options);
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
      detail: selectPresentValue(error?.message, OPERATOR_ALERT_SINK_DISPATCH_FAILED),
      impacted_event_type: selectTruthyValue(() => (eventType), () => (null)),
    });
    return { input: null, listeners: [], results: [], dispatchError: errorDetail(error), durable };
  }
}
