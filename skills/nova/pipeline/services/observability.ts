import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { costLogDir } from '../core/paths.ts';
import { createOpaqueId } from '../core/runtime.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { appendDurableOperatorAlert } from './durable-operator-alert.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { buildRunFacts } from './run-facts.ts';
import { buildTelemetryStreamEvent, emitTelemetryStreamEvent } from './telemetry-stream.ts';
import { TelemetryPayloadInvalidError, validateTelemetryEventPayload } from './telemetry/payload-schema.ts';
import { createObservabilityHealthState } from './observability-health.ts';
import { objectRecord, selectPresentValue, textValue } from '../value-boundary.ts';
import { observabilityRunId } from './observability-identity.ts';
export {
  aggregateUsage, checkBudgetThresholds, emitBudgetWarnings, isBudgetExceeded, writeCostReport,
} from './observability-usage.ts';
export { hasUsageSnapshotEvent, recordUsageSnapshot } from './observability-snapshots.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const _observabilityHealth = createObservabilityHealthState();
const OBSERVABILITY_HEALTH_SCOPE_DEFAULT = 'default';
const OBSERVABILITY_SOURCE_PIPELINE = 'pipeline';
const OBSERVABILITY_PROJECT_MISSING = 'missing_project';
const STRUCTURED_EVENT_APPEND_FAILED_DETAIL = 'structured event append failed';
const USAGE_COUNT_MISSING = 0;
const ESTIMATED_COST_MISSING = null;

function numericCount(value: any) {
  const count = Number(value);
  return Number.isFinite(count) ? count : USAGE_COUNT_MISSING;
}

function budgetThresholdConfig(config: any) {
  return objectRecord(config?.observability?.budget);
}

function payloadForSchemaValidation(payload: any = {}) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!payload), () => (typeof payload !== 'object'))), () => (Array.isArray(payload)))) return payload;
  const {
    v, schema_version: schemaVersion, event_id: eventId,source_event_id:sourceEventId,authority_class:authorityClass,
    type,
    ts, occurred_at: occurredAt, emitted_at: emittedAt, cursor, causation_id: causationId,
    run_id: runId,
    project,session_id:sessionId,parent_session_id:parentSessionId,trace_id:traceId,span_id:spanId,parent_span_id:parentSpanId,
    seq, source, emitter, producer, work_id: workId, work_type: workType,
    ...eventPayload
  } = payload;
  return eventPayload;
}

function resolveConfig(input: any = {}) {
  return objectRecord(selectDefinedValue(() => (input?.config), () => (input)));
}

function requireHealthKeyPart(value: any, field: any) {
  const normalized = textValue(value).trim();
  if (normalized.length > 0) return normalized;
  throw new TypeError(`observability health key requires ${field}`);
}

function observabilityHealthKey(config: any = {}, data: any = {}, options: any = {}) {
  if (options.healthKey) return String(options.healthKey);
  const runId = observabilityRunId(config, data, options);
  const scope = selectPresentValue(options.scope, data.scope, OBSERVABILITY_HEALTH_SCOPE_DEFAULT);
  return [
    requireHealthKeyPart(config?.project, 'config.project'),
    requireHealthKeyPart(runId, 'run_id'),
    requireHealthKeyPart(data.component, 'component'),
    requireHealthKeyPart(data.surface, 'surface'),
    requireHealthKeyPart(data.reason, 'reason'),
    requireHealthKeyPart(scope, 'scope'),
  ].join(':');
}

function buildObservabilityPayload(type: any, config: any = {}, data: any = {}, timestamps: any = {}) {
  const base = {
    component: selectTruthyValue(() => (data.component), () => (null)),
    surface: selectTruthyValue(() => (data.surface), () => (null)),
    reason: selectTruthyValue(() => (data.reason), () => (null)),
    detail: selectTruthyValue(() => (data.detail), () => (null)),
    module_id: selectTruthyValue(() => (data.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (data.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (data.gate_id != null), () => (data.gate_type != null)) ? (selectDefinedValue(() => (data.gate_type), () => (null))) : undefined,
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (data.dispatch_id), () => (null)),
    agent_type: selectTruthyValue(() => (data.agent_type), () => (null)),
    impacted_event_type: selectTruthyValue(() => (data.impacted_event_type), () => (null)),
    stream_key: selectTruthyValue(() => (data.stream_key), () => (null)),
    hook_id: selectTruthyValue(() => (data.hook_id), () => (null)),
    stage_id: selectTruthyValue(() => (data.stage_id), () => (null)),
    validation_errors: selectTruthyValue(() => (data.validation_errors), () => (null)),
    stdout: selectTruthyValue(() => (data.stdout), () => (null)),
    error: selectTruthyValue(() => (data.error), () => (null)),
    authorization: selectTruthyValue(() => (data.authorization), () => (null)),
    payload: selectTruthyValue(() => (data.payload), () => (null)),
    transcript: selectTruthyValue(() => (data.transcript), () => (null)),
  };

  if (type === 'observability.restored') {
    return {
      ...base,
      degraded_at: selectTruthyValue(() => (selectTruthyValue(() => (timestamps.degradedAt), () => (data.degraded_at))), () => (null)),
      restored_at: selectTruthyValue(() => (selectTruthyValue(() => (timestamps.restoredAt), () => (data.restored_at))), () => (null)),
      restored_after_ms: selectDefinedValue(() => (timestamps.restoredAfterMs), () => (null)),
    };
  }

  return {
    ...base,
    degraded_at: selectTruthyValue(() => (selectTruthyValue(() => (timestamps.degradedAt), () => (data.degraded_at))), () => (null)),
  };
}

function appendObservabilityDiskEvent(config: any = {}, eventType: any, payload: any = {}) {
  const result = appendStructuredEvent(config, eventType, payload);
  if (!result?.ok) {
    reportClassifiedNonBlockingError({
      log,
      reporter: 'observability',
      classification: `${eventType}_disk_append_failed`,
      incidentKey: buildNonBlockingIncidentKey(
        'observability',
        selectDefinedValue(() => (config?.project), () => ('missing_project')),
        selectDefinedValue(() => (observabilityRunId(config)), () => ('missing_run_id')),
        eventType,
        selectDefinedValue(() => (payload?.component), () => ('missing_observability_component')),
        selectDefinedValue(() => (payload?.surface), () => ('missing_observability_surface')),
      ),
      message: `${eventType} disk append failed`,
      error: result?.error,
      level: 'DEBUG',
    });
  }
  return result;
}

async function emitObservabilityTransition(config: any = {}, eventType: any, payload: any = {}, options: any = {}) {
  const severity = eventType === 'observability.restored' ? 'OK' : 'WARN';
  const durable = appendDurableOperatorAlert(config, eventType, payload, {
    severity,
    level: severity,
    source: selectPresentValue(options.source, OBSERVABILITY_SOURCE_PIPELINE),
    emitter: 'nova/pipeline/services/observability',
    occurredAt: eventType === 'observability.restored' ? payload.restored_at : payload.degraded_at,
    runId: observabilityRunId(config, payload, options),
    moduleId: selectTruthyValue(() => (payload.module_id), () => (null)),
    gateId: selectTruthyValue(() => (payload.gate_id), () => (null)),
    gateType: selectTruthyValue(() => (payload.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (payload.attempt), () => (null)),
  });
  const disk = appendObservabilityDiskEvent(config, eventType, payload);
  const stream = await emitTelemetryStreamEvent(config, eventType, payload, {
    emittedAt: eventType === 'observability.restored' ? payload.restored_at : payload.degraded_at,
    emitter: 'nova/pipeline/services/observability',
    runId: observabilityRunId(config, payload, options),
  });
  return { durable, disk, stream };
}

export async function recordObservabilityDegraded(ctxOrConfig: any = {}, data: any = {}, options: any = {}) {
  const config = resolveConfig(ctxOrConfig);
  const key = observabilityHealthKey(config, data, options);
  const transition = _observabilityHealth.markDegraded(key, {
    degraded_at: selectTruthyValue(() => (data.degraded_at), () => (null)),
    reason: selectTruthyValue(() => (data.reason), () => (null)),
    component: selectTruthyValue(() => (data.component), () => (null)),
    surface: selectTruthyValue(() => (data.surface), () => (null)),
    streamKey: selectTruthyValue(() => (data.stream_key), () => (null)),
  });
  if (!transition.shouldEmit) {
    return { emitted: false, duplicate: transition.duplicate, restored: false, key, degradedAt: selectTruthyValue(() => (transition.degradedAt), () => (null)) };
  }

  const { degradedAt } = transition;
  const payload = buildObservabilityPayload('observability.degraded', config, data, { degradedAt });
  const outputs = await emitObservabilityTransition(config, 'observability.degraded', payload, options);
  return { emitted: true, duplicate: false, restored: false, key, degradedAt, payload, ...outputs };
}

export async function recordObservabilityRestored(ctxOrConfig: any = {}, data: any = {}, options: any = {}) {
  const config = resolveConfig(ctxOrConfig);
  const key = observabilityHealthKey(config, data, options);
  const transition = _observabilityHealth.markRestored(key, data);
  if (!transition.shouldEmit) return { emitted: false, duplicate: false, restored: false, key, degradedAt: null };

  const { degradedAt, restoredAt, restoredAfterMs } = transition;
  const prev = objectRecord(transition.previous);
  const payload = buildObservabilityPayload('observability.restored', config, {
    ...data,
    stream_key: selectTruthyValue(() => (selectTruthyValue(() => (data.stream_key), () => (prev.streamKey))), () => (null)),
    reason: selectTruthyValue(() => (selectTruthyValue(() => (data.reason), () => (prev.reason))), () => (null)),
    component: selectTruthyValue(() => (selectTruthyValue(() => (data.component), () => (prev.component))), () => (null)),
    surface: selectTruthyValue(() => (selectTruthyValue(() => (data.surface), () => (prev.surface))), () => (null)),
  }, { degradedAt, restoredAt, restoredAfterMs });
  const outputs = await emitObservabilityTransition(config, 'observability.restored', payload, options);
  return { emitted: true, duplicate: false, restored: true, key, degradedAt, restoredAt, payload, ...outputs };
}

// ── Structured event appending to pipeline.jsonl ─────────────────────────────

function buildStructuredEvent(config: any, eventType: any, payload: any, artifacts: any) {
  if (isCanonicalTelemetryEnvelope(payload)) return payload;
  const priorCount = structuredEventPriorCount(artifacts);
  return buildTelemetryStreamEvent(eventType, payloadForSchemaValidation(payload), {
    project: selectPresentValue(config.project, OBSERVABILITY_PROJECT_MISSING), runId: observabilityRunId(config),
  }, priorCount + 1, structuredEventOptions(payload));
}

function isCanonicalTelemetryEnvelope(payload: any): boolean {
  return payload?.schema_version === 'telemetry_envelope.v1' && Boolean(payload?.event_id);
}

function structuredEventPriorCount(artifacts: any): number {
  const primary = artifacts.run_pipeline_jsonl_path ?? artifacts.global_pipeline_jsonl_path;
  return primary && fs.existsSync(primary) ? fs.readFileSync(primary, 'utf8').split('\n').filter(Boolean).length : 0;
}

function structuredEventOptions(payload: any) {
  return {
    source: selectPresentValue(payload?.source, OBSERVABILITY_SOURCE_PIPELINE),
    emitter: selectPresentValue(payload?.producer, payload?.emitter, 'nova/pipeline/services/observability'),
    occurredAt: payload?.occurred_at ?? payload?.ts, causationId: payload?.causation_id,
    sourceEventId: payload?.source_event_id, authorityClass: payload?.authority_class,
  };
}

function appendEventToTargets(targets: string[], event: any) {
  for (const pipelineJsonl of targets) {
    fs.mkdirSync(path.dirname(pipelineJsonl), { recursive: true });
    fs.appendFileSync(pipelineJsonl, `${JSON.stringify(event)}\n`);
  }
}

/**
 * Append a structured lifecycle event to pipeline.jsonl.
 * Distinct from log() entries: these are explicitly typed pipeline events
 * (event schema, not free-text log messages) for post-run inspection tools.
 */
export function appendStructuredEvent(config: any, eventType: any, payload: any = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  const targets = [artifacts.global_pipeline_jsonl_path, artifacts.run_pipeline_jsonl_path]
    .filter((target: any): target is string => typeof target === 'string' && target.length > 0);
  if (!targets.length) return { ok: true, skipped: true, event: null };
  const validationErrors = validateTelemetryEventPayload(eventType, payloadForSchemaValidation(payload));
  if (validationErrors.length > 0) {
    const error = new TelemetryPayloadInvalidError(eventType, validationErrors);
    log('DEBUG', `[observability] appendStructuredEvent rejected invalid telemetry payload (non-critical): ${error.message}`);
    return { ok: false, skipped: false, error };
  }
  try {
    const event = buildStructuredEvent(config, eventType, payload, artifacts);
    appendEventToTargets(targets, event);
    return { ok: true, skipped: false, event };
  } catch (e: any) {
    log('DEBUG', `[observability] appendStructuredEvent failed (non-critical): ${e.message}`);
    return { ok: false, skipped: false, error: e };
  }
}

export async function appendStructuredEventMirror(config: any, eventType: any, payload: any = {}) {
  const result = appendStructuredEvent(config, eventType, payload);
  if (result?.ok) {
    await recordObservabilityRestored(config, {
      component: 'observability',
      surface: 'pipeline_jsonl',
      reason: 'structured_event_append_failed',
      detail: 'structured event append restored',
      impacted_event_type: selectTruthyValue(() => (eventType), () => (null)),
    });
    return true;
  }
  await recordObservabilityDegraded(config, {
    component: 'observability',
    surface: 'pipeline_jsonl',
    reason: 'structured_event_append_failed',
    detail: selectPresentValue(result?.error?.message, STRUCTURED_EVENT_APPEND_FAILED_DETAIL),
    impacted_event_type: selectTruthyValue(() => (eventType), () => (null)),
  });
  return false;
}

/**
 * Record a usage/cost snapshot under .swarm/logs/cost/usage-snapshots.jsonl.
 * Each snapshot represents one agent session's contribution, scoped to module/gate.
 * Mark partial=true when the snapshot is known to be incomplete.
 *
 * @param {object} config
 * @param {object} opts
 * @param {string} opts.agentType - 'forge' | 'echo' | 'buster' | 'nova'
 * @param {string} [opts.moduleId]
 * @param {string} [opts.gateId]
 * @param {number} [opts.attempt]
 * @param {string} [opts.source] - where usage data came from, e.g. 'gateway_status' | 'transcript' | 'stub'
 * @param {number|null} [opts.inputTokens]
 * @param {number|null} [opts.outputTokens]
 * @param {number|null} [opts.estimatedCostUsd]
 * @param {boolean} [opts.partial] - true if snapshot is known to be incomplete
 * @param {string} [opts.sessionKey]
 * @param {string} [opts.eventId] - stable idempotency key for at-least-once usage events
 */
