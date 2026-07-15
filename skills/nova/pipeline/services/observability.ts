import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { costLogDir } from '../core/paths.ts';
import { createOpaqueId, getRunId } from '../core/runtime.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { appendDurableOperatorAlert } from './durable-operator-alert.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { buildRunFacts } from './run-facts.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';
import { TelemetryPayloadInvalidError, validateTelemetryEventPayload } from './telemetry/payload-schema.ts';
import { createObservabilityHealthState } from './observability-health.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const _observabilityHealth = createObservabilityHealthState();
const OBSERVABILITY_HEALTH_SCOPE_DEFAULT = 'default';
const OBSERVABILITY_SOURCE_PIPELINE = 'pipeline';
const OBSERVABILITY_PROJECT_MISSING = 'missing_project';
const STRUCTURED_EVENT_APPEND_FAILED_DETAIL = 'structured event append failed';
const USAGE_COUNT_MISSING = 0;
const ESTIMATED_COST_MISSING = null;

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

function numericCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : USAGE_COUNT_MISSING;
}

function budgetThresholdConfig(config) {
  return objectRecord(config?.observability?.budget);
}

function payloadForSchemaValidation(payload = {}) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!payload), () => (typeof payload !== 'object'))), () => (Array.isArray(payload)))) return payload;
  const {
    v,
    type,
    ts,
    run_id: runId,
    project,
    seq,
    ...eventPayload
  } = payload;
  return eventPayload;
}

function resolveConfig(input = {}) {
  return objectRecord(selectDefinedValue(() => (input?.config), () => (input)));
}

function requireHealthKeyPart(value, field) {
  const normalized = textValue(value).trim();
  if (normalized.length > 0) return normalized;
  throw new TypeError(`observability health key requires ${field}`);
}

function explicitRunIdAuthority(config = {}, data = {}, options = {}) {
  const optionRunId = textValue(options.runId).trim();
  if (optionRunId) return optionRunId;
  const dataRunId = textValue(data.run_id).trim();
  if (dataRunId) return dataRunId;
  const contextRunId = textValue(config?._runId).trim();
  if (contextRunId) return contextRunId;
  const configRunId = textValue(config?.run_id).trim();
  if (configRunId) return configRunId;
  return null;
}

function observabilityRunId(config = {}, data = {}, options = {}) {
  const explicitRunId = explicitRunIdAuthority(config, data, options);
  if (explicitRunId) return explicitRunId;
  try {
    return getRunId(config);
  } catch (_error) {
    return null;
  }
}

function observabilityHealthKey(config = {}, data = {}, options = {}) {
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

function buildObservabilityPayload(type, config = {}, data = {}, timestamps = {}) {
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

function appendObservabilityDiskEvent(config = {}, eventType, payload = {}) {
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

async function emitObservabilityTransition(config = {}, eventType, payload = {}, options = {}) {
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

export async function recordObservabilityDegraded(ctxOrConfig = {}, data = {}, options = {}) {
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

export async function recordObservabilityRestored(ctxOrConfig = {}, data = {}, options = {}) {
  const config = resolveConfig(ctxOrConfig);
  const key = observabilityHealthKey(config, data, options);
  const transition = _observabilityHealth.markRestored(key, data);
  if (!transition.shouldEmit) return { emitted: false, duplicate: false, restored: false, key, degradedAt: null };

  const { previous: prev = {}, degradedAt, restoredAt, restoredAfterMs } = transition;
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

/**
 * Append a structured lifecycle event to pipeline.jsonl.
 * Distinct from log() entries: these are explicitly typed pipeline events
 * (event schema, not free-text log messages) for post-run inspection tools.
 */
export function appendStructuredEvent(config, eventType, payload = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  const targets = [artifacts.global_pipeline_jsonl_path, artifacts.run_pipeline_jsonl_path].filter(Boolean);
  if (!targets.length) return { ok: true, skipped: true, event: null };
  const validationErrors = validateTelemetryEventPayload(eventType, payloadForSchemaValidation(payload));
  if (validationErrors.length > 0) {
    const error = new TelemetryPayloadInvalidError(eventType, validationErrors);
    log('DEBUG', `[observability] appendStructuredEvent rejected invalid telemetry payload (non-critical): ${error.message}`);
    return { ok: false, skipped: false, error };
  }
  try {
    const event = {
      v: 1,
      event_id: createOpaqueId('event'),
      type: eventType,
      ts: new Date().toISOString(),
      run_id: observabilityRunId(config),
      project: selectPresentValue(config.project, OBSERVABILITY_PROJECT_MISSING),
      source: OBSERVABILITY_SOURCE_PIPELINE,
      emitter: 'nova/pipeline/services/observability',
      ...payload,
    };
    for (const pipelineJsonl of targets) {
      fs.mkdirSync(path.dirname(pipelineJsonl), { recursive: true });
      fs.appendFileSync(pipelineJsonl, JSON.stringify(event) + '\n');
    }
    return { ok: true, skipped: false, event };
  } catch (e) {
    log('DEBUG', `[observability] appendStructuredEvent failed (non-critical): ${e.message}`);
    return { ok: false, skipped: false, error: e };
  }
}

export async function appendStructuredEventMirror(config, eventType, payload = {}) {
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
export function recordUsageSnapshot(config: any, opts: Record<string, any> = {}) {
  const {
    agentType,
    moduleId,
    gateId,
    attempt,
    source,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    partial = false,
    sessionKey,
    eventId,
  } = opts;
  const logDir = costLogDir(config); if (!logDir) return;
  try {
    const snapshot = {
      ts: new Date().toISOString(),
      run_id: observabilityRunId(config),
      agent_type: agentType,
      ...(moduleId && { module_id: moduleId }),
      ...(gateId && { gate_id: gateId }),
      ...(attempt != null && { attempt }),
      ...(sessionKey && { session_key: sessionKey }),
      ...(eventId && { event_id: eventId }),
      source: selectDefinedValue(() => (source), () => ('missing_source')),
      input_tokens: selectDefinedValue(() => (inputTokens), () => (null)),
      output_tokens: selectDefinedValue(() => (outputTokens), () => (null)),
      estimated_cost_usd: selectDefinedValue(() => (estimatedCostUsd), () => (null)),
      partial,
    };
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'usage-snapshots.jsonl'), JSON.stringify(snapshot) + '\n');
  } catch (e) {
    log('DEBUG', `[observability] recordUsageSnapshot failed (non-critical): ${e.message}`);
  }
}

export function hasUsageSnapshotEvent(config: any, eventId: string | null | undefined) {
  if (!eventId) return false;
  const logDir = costLogDir(config), snapshotsPath = logDir ? path.join(logDir, 'usage-snapshots.jsonl') : null;
  if (selectTruthyValue(() => (!snapshotsPath), () => (!fs.existsSync(snapshotsPath)))) return false;

  try {
    const raw = fs.readFileSync(snapshotsPath, 'utf8').trim();
    if (!raw) return false;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const snapshot = JSON.parse(line);
        if (snapshot?.event_id === eventId) return true;
      } catch (_error) {
        continue;
      }
    }
  } catch (e) {
    log('DEBUG', `[observability] hasUsageSnapshotEvent failed (non-critical): ${e.message}`);
  }
  return false;
}

// ── Usage aggregation ─────────────────────────────────────────────────────────

const EMPTY_USAGE = () => ({
  run: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false },
  by_module: {},
  by_gate: {},
  by_agent: {},
});

function computePercentUsed(current, limit) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (current == null), () => (limit == null))), () => (!Number.isFinite(Number(current))))), () => (!Number.isFinite(Number(limit))))), () => (Number(limit) === 0))) {
    return null;
  }
  return Math.round((Number(current) / Number(limit)) * 1000) / 10;
}

function addToSlice(slice, inp, out, cost, partial) {
  slice.input_tokens += inp;
  slice.output_tokens += out;
  if (cost !== null) {
    slice.estimated_cost_usd = numericCount(slice.estimated_cost_usd) + cost;
  }
  if (partial) slice.partial = true;
}

/**
 * Aggregate usage snapshots into run/module/gate/agent buckets.
 * Returns an empty aggregate if no snapshots exist — never throws unless strict is set.
 */
export function aggregateUsage(config, options = {}) {
  const logDir = costLogDir(config), snapshotsPath = logDir ? path.join(logDir, 'usage-snapshots.jsonl') : null;
  if (selectTruthyValue(() => (!snapshotsPath), () => (!fs.existsSync(snapshotsPath)))) return EMPTY_USAGE();

  try {
    const raw = fs.readFileSync(snapshotsPath, 'utf8').trim();
    if (!raw) return EMPTY_USAGE();

    const result = EMPTY_USAGE();
    const seenEventIds = new Set();

    for (const [index, line] of raw.split('\n').entries()) {
      if (!line) continue;

      let s;
      try {
        s = JSON.parse(line);
      } catch (error) {
        if (options.strict) throw error;
        result.run.partial = true;
        result.corrupt = true;
        log('DEBUG', `[observability] aggregateUsage skipped corrupt snapshot line ${index + 1} (non-critical): ${error.message}`);
        continue;
      }

      if (s.event_id) {
        if (seenEventIds.has(s.event_id)) continue;
        seenEventIds.add(s.event_id);
      }

      const inp = numericCount(s.input_tokens);
      const out = numericCount(s.output_tokens);
      const cost = selectDefinedValue(() => (s.estimated_cost_usd), () => (ESTIMATED_COST_MISSING));
      const partial = !!s.partial;

      addToSlice(result.run, inp, out, cost, partial);

      if (s.module_id) {
        if (!result.by_module[s.module_id]) {
          result.by_module[s.module_id] = { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false };
        }
        addToSlice(result.by_module[s.module_id], inp, out, cost, partial);
      }

      if (s.gate_id) {
        if (!result.by_gate[s.gate_id]) {
          result.by_gate[s.gate_id] = { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false };
        }
        addToSlice(result.by_gate[s.gate_id], inp, out, cost, partial);
      }

      if (s.agent_type) {
        if (!result.by_agent[s.agent_type]) {
          result.by_agent[s.agent_type] = { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false };
        }
        addToSlice(result.by_agent[s.agent_type], inp, out, cost, partial);
      }
    }

    return result;
  } catch (e) {
    if (options.strict) throw e;
    log('DEBUG', `[observability] aggregateUsage failed (non-critical): ${e.message}`);
    return EMPTY_USAGE();
  }
}

// ── Budget threshold checking ─────────────────────────────────────────────────

/**
 * Check current usage against configured thresholds.
 * Returns an array of warning objects — empty if nothing is crossed.
 * Never throws.
 *
 * Supported threshold keys (under config.observability.budget or passed directly):
 *   warn_cost_usd       — emit budget.warning when estimated cost >= this
 *   hard_limit_cost_usd — emit budget.exceeded when estimated cost >= this
 *   warn_tokens         — emit budget.warning when total tokens >= this
 *
 * @param {object} usage - result of aggregateUsage()
 * @param {object} [thresholds] - { warn_cost_usd, hard_limit_cost_usd, warn_tokens }
 * @returns {Array<{type, threshold, current, limit, unit, current_cost_usd, budget_usd, percent_used, message}>}
 */
export function checkBudgetThresholds(usage, thresholds = {}) {
  const warnings = [];
  const totalCost = selectDefinedValue(() => (usage?.run?.estimated_cost_usd), () => (null));
  const totalTokens = (usage?.run?.input_tokens) + (usage?.run?.output_tokens);

  if (thresholds.warn_cost_usd != null && totalCost !== null && totalCost >= thresholds.warn_cost_usd) {
    warnings.push({
      type: 'budget.warning',
      threshold: 'warn_cost_usd',
      current: totalCost,
      limit: thresholds.warn_cost_usd,
      unit: 'usd',
      current_cost_usd: totalCost,
      budget_usd: thresholds.warn_cost_usd,
      percent_used: computePercentUsed(totalCost, thresholds.warn_cost_usd),
      message: `Cost $${totalCost.toFixed(4)} exceeds warning threshold $${thresholds.warn_cost_usd}`,
    });
  }

  if (thresholds.hard_limit_cost_usd != null && totalCost !== null && totalCost >= thresholds.hard_limit_cost_usd) {
    warnings.push({
      type: 'budget.exceeded',
      threshold: 'hard_limit_cost_usd',
      current: totalCost,
      limit: thresholds.hard_limit_cost_usd,
      unit: 'usd',
      current_cost_usd: totalCost,
      budget_usd: thresholds.hard_limit_cost_usd,
      percent_used: computePercentUsed(totalCost, thresholds.hard_limit_cost_usd),
      message: `Cost $${totalCost.toFixed(4)} exceeds hard limit $${thresholds.hard_limit_cost_usd}`,
    });
  }

  if (thresholds.warn_tokens != null && totalTokens >= thresholds.warn_tokens) {
    warnings.push({
      type: 'budget.warning',
      threshold: 'warn_tokens',
      current: totalTokens,
      limit: thresholds.warn_tokens,
      unit: 'tokens',
      current_cost_usd: null,
      budget_usd: null,
      percent_used: computePercentUsed(totalTokens, thresholds.warn_tokens),
      message: `Token count ${totalTokens} exceeds warning threshold ${thresholds.warn_tokens}`,
    });
  }

  return warnings;
}

/**
 * Returns true if a hard budget limit has been crossed.
 * Fail-closed: budget evidence read/check errors are treated as exceeded so
 * operators must inspect the typed incident before continuing.
 */
export function isBudgetExceeded(config) {
  try {
    const usage = aggregateUsage(config, { strict: true });
    const thresholds = budgetThresholdConfig(config);
    const warnings = checkBudgetThresholds(usage, thresholds);
    return warnings.some(w => w.type === 'budget.exceeded');
  } catch (error) {
    reportClassifiedNonBlockingError({
      log,
      reporter: 'observability',
      classification: 'budget_limit_check_failed',
      incidentKey: buildNonBlockingIncidentKey('observability', selectDefinedValue(() => (config?.project), () => ('missing_project')), selectDefinedValue(() => (observabilityRunId(config)), () => ('missing_run_id')), 'budget_limit_check_failed'),
      message: 'budget limit check failed; treating hard budget state as exceeded pending operator review',
      error,
      level: 'DEBUG',
    });
    return true;
  }
}

/**
 * Append budget warning/exceeded events to cost/budget-events.jsonl and emit WARN logs.
 * Non-blocking.
 */
export function emitBudgetWarnings(config, warnings = []) {
  const logDir = costLogDir(config);
  if (!logDir) return;
  if (selectTruthyValue(() => (!Array.isArray(warnings)), () => (warnings.length === 0))) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    for (const w of warnings) {
      fs.appendFileSync(
        path.join(logDir, 'budget-events.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), run_id: observabilityRunId(config), ...w }) + '\n',
      );
      log('WARN', `[budget] ${w.message}`);
    }
  } catch (e) {
    log('DEBUG', `[observability] emitBudgetWarnings failed (non-critical): ${e.message}`);
  }
}

// ── Operator-facing cost report ───────────────────────────────────────────────

/**
 * Write a machine-readable cost report to .swarm/logs/cost/cost-report.json.
 * Includes aggregated usage, threshold warnings, and a data-availability note.
 * Non-blocking: logs WARN on failure, returns null.
 *
 * @returns {object|null} the report object, or null on failure
 */
export function writeCostReport(config, options = {}) {
  const logDir = costLogDir(config); if (!logDir) return null;
  try {
    const usage = aggregateUsage(config);
    const runFacts = buildRunFacts(config, options.progress);
    const thresholds = budgetThresholdConfig(config);
    const warnings = checkBudgetThresholds(usage, thresholds);

    let availabilityStatus;
    let availabilityNote;
    if (usage.run.estimated_cost_usd !== null && !usage.run.partial) {
      availabilityStatus = 'full';
      availabilityNote = 'Complete cost and token data available.';
    } else if (usage.run.estimated_cost_usd !== null && usage.run.partial) {
      availabilityStatus = 'partial';
      availabilityNote = 'Some usage snapshots marked partial — totals may be incomplete.';
    } else if (selectTruthyValue(() => (usage.run.input_tokens > 0), () => (usage.run.output_tokens > 0))) {
      availabilityStatus = 'tokens_only';
      availabilityNote = 'Dollar cost unavailable for this provider/auth mode. Token counts recorded.';
    } else {
      availabilityStatus = 'unavailable';
      availabilityNote = 'No usage data captured. Provider may not expose token/cost information.';
    }

    const report = {
      generated_at: new Date().toISOString(),
      run_id: observabilityRunId(config),
      project: selectPresentValue(config.project, OBSERVABILITY_PROJECT_MISSING),
      run_facts: runFacts,
      usage,
      warnings,
      availability: {
        status: availabilityStatus,
        note: availabilityNote,
      },
    };

    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'cost-report.json'), JSON.stringify(report, null, 2));

    const modulesStr = Number.isFinite(Number(runFacts?.modules?.total)) ? Number(runFacts.modules.total) : Object.keys(usage.by_module).length;
    const gatesStr = Number.isFinite(Number(runFacts?.gates?.total)) ? Number(runFacts.gates.total) : Object.keys(usage.by_gate).length;
    const costStr = usage.run.estimated_cost_usd !== null
      ? `, $${usage.run.estimated_cost_usd.toFixed(4)} total`
      : ', cost unavailable';
    log('OK', `Cost report written: ${modulesStr} module(s), ${gatesStr} gate(s)${costStr}`);
    return report;
  } catch (e) {
    log('WARN', `[observability] writeCostReport failed (non-critical): ${e.message}`);
    return null;
  }
}
