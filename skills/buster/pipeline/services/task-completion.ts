
import { buildCompletionIdentityFields } from './pipeline-helpers.ts';
import { safeErrorMessage } from './runtime-diagnostics.ts';
import {
  REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION,
  assertRedisCompletionEntry,
  inferRedisTaskTarget,
} from './redis-message-contract.ts';
import { createRedisEventBus } from './task-transport-contract.ts';

export const DEFAULT_DEAD_LETTER_SUFFIX = ':dead-letter';

function compactRecord(obj = {}) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
  );
}

function resolveModuleId(payload = {}) {
  return payload.module_id || payload.module || payload.gate_id || 'unknown';
}

export function createTaskCompletionState() {
  return { attempted: false, terminal: false, stream: null, error: null };
}

export function buildTaskCompletionRecord(payload = {}, opts = {}) {
  const { outcome, reason } = opts;
  if (!outcome || !reason) throw new Error('Buster completion requires explicit outcome and reason');
  const moduleId = opts.moduleId || resolveModuleId(payload);
  const identityFields = buildCompletionIdentityFields(payload, {
    runId: opts.runId ?? payload.run_id,
    attempt: opts.attempt ?? payload.attempt,
    dispatchId: opts.dispatchId ?? payload.dispatch_id,
    sessionKey: opts.sessionKey ?? null,
  });
  const target = inferRedisTaskTarget(payload, payload?.task_type);

  return {
    schema_version: REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION,
    type: 'completion',
    stream_role: 'completion',
    project: payload?.project,
    target_kind: target.target_kind,
    target_id: target.target_id || moduleId,
    module: moduleId,
    gate_id: target.gate_id,
    gate_type: payload?.gate_type ?? payload?.gateType,
    status: outcome === 'PASS' ? 'PASS' : 'FAIL',
    outcome,
    source: opts.source || 'buster-pipeline',
    reason,
    summary: opts.summary || reason || '',
    ...(outcome === 'RATE_LIMITED' && opts.rateLimitMaxPauses !== null && opts.rateLimitMaxPauses !== undefined
      ? { max_rate_limit_pauses: String(opts.rateLimitMaxPauses) }
      : {}),
    ...(opts.preTestVerdict ? { verdict: JSON.stringify(opts.preTestVerdict) } : {}),
    ...identityFields,
    timestamp: String(opts.timestamp || Date.now()),
  };
}

export function buildTaskCompletionFields(payload = {}, opts = {}) {
  const record = buildTaskCompletionRecord(payload, opts);
  assertRedisCompletionEntry(record, { requireStreamId: false, requireCanonicalEnvelope: true, expectedStreamRole: 'completion' });
  return compactRecord(record);
}

export async function emitTaskCompletion(redisClient, payload = {}, opts = {}) {
  if (!payload?.completion_stream) {
    return { ok: false, skipped: true, reason: 'missing_completion_stream' };
  }
  const eventBus = createRedisEventBus(redisClient);
  const published = await eventBus.publish(payload.completion_stream, buildTaskCompletionFields(payload, opts));
  return { ok: true, stream: payload.completion_stream, id: published.id };
}

export function resolveDeadLetterStream(streamKey, payload = {}) {
  return payload?.dead_letter_stream || process.env.BUSTER_TASK_DEAD_LETTER_STREAM || `${streamKey}${DEFAULT_DEAD_LETTER_SUFFIX}`;
}

export function buildTaskDeadLetterFields({
  streamKey,
  id,
  data = {},
  payload = {},
  sender = data.sender || 'unknown',
  taskType = data.type || 'unknown',
  effectiveType = taskType,
  reason = 'task_failed_before_completion',
  detail = '',
  phase = 'process_task',
} = {}) {
  return compactRecord({
    type: 'task_dead_letter',
    source: 'buster-pipeline',
    reason,
    detail: safeErrorMessage(detail),
    phase,
    stream: streamKey,
    redis_id: id,
    sender,
    redis_type: taskType,
    effective_type: effectiveType,
    project: payload?.project,
    module_id: payload?.module_id || payload?.module,
    gate_id: payload?.gate_id,
    run_id: payload?.run_id,
    attempt: payload?.attempt,
    dispatch_id: payload?.dispatch_id,
    completion_stream: payload?.completion_stream,
    payload_keys: Object.keys(payload || {}),
    payload_size: data?.payload ? String(data.payload).length : undefined,
    timestamp: String(Date.now()),
  });
}

export async function writeTaskDeadLetter(redisClient, opts = {}) {
  const deadLetterStream = resolveDeadLetterStream(opts.streamKey, opts.payload);
  const eventBus = createRedisEventBus(redisClient);
  const published = await eventBus.publish(deadLetterStream, buildTaskDeadLetterFields(opts));
  return { ok: true, stream: deadLetterStream, id: published.id };
}

export function didProcessResultEmitTerminalCompletion(processResult) {
  return processResult?.completion?.terminal === true;
}

export async function ensureTaskTerminalBeforeAck(redisClient, opts = {}) {
  const payload = opts.payload ?? {};
  const processResult = opts.processResult ?? null;
  const taskError = opts.error ?? null;

  if (didProcessResultEmitTerminalCompletion(processResult)) {
    return { ok: true, mode: 'completion_already_emitted', stream: processResult.completion.stream };
  }

  let reason = opts.reason;
  if (!reason) reason = processResult?.reason;
  if (!reason && processResult?.completion?.error) {
    reason = `task_completion_precondition_failed: ${safeErrorMessage(processResult.completion.error)}`;
  }
  if (!reason && !payload?.completion_stream) reason = 'missing_completion_stream';
  if (!reason && taskError) reason = `task_runtime_failure: ${safeErrorMessage(taskError)}`;
  if (!reason) reason = 'task_failed_before_completion';
  const summary = opts.summary || reason;

  if (payload?.completion_stream) {
    try {
      const emitted = await emitTaskCompletion(redisClient, payload, {
        moduleId: opts.moduleId,
        outcome: 'FAIL',
        reason,
        summary,
        source: opts.source || 'buster-pipeline-task-queue',
      });
      if (emitted.ok) return { ok: true, mode: 'synthesized_failure_completion_before_ack', stream: emitted.stream };
    } catch (completionError) {
      opts.completionError = completionError;
    }
  }

  try {
    const deadLetter = await writeTaskDeadLetter(redisClient, {
      ...opts,
      reason: opts.deadLetterReason || 'task_failed_before_terminal_completion',
      detail: opts.completionError || taskError || reason,
      phase: opts.phase || (taskError ? 'process_task_error' : 'completion_missing'),
    });
    return { ok: true, mode: 'dead_letter', stream: deadLetter.stream };
  } catch (deadLetterError) {
    return {
      ok: false,
      mode: 'terminal_guarantee_failed',
      error: deadLetterError,
      detail: safeErrorMessage(deadLetterError),
    };
  }
}
