import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// pipeline/services/task-queue.ts — Redis task queue client, dequeue, ack/reclaim loop helpers
// Keeps stream transport mechanics outside the Buster task orchestrator.

import { doResourceCleanup } from './pipeline-helpers.ts';
import { validateRedisTaskEntry } from './redis-message-contract.ts';
import { PIPELINE_TASK_TYPES } from './task-validation.ts';
import {
  appendMalformedTaskArtifact,
  reportBusterRuntimeDiagnostic,
  safeErrorMessage,
} from './runtime-diagnostics.ts';
import {
  ensureTaskTerminalBeforeAck,
  writeTaskDeadLetter,
} from './task-completion.ts';
import { loadBusterRuntimePolicy } from './runtime-policy.ts';
import { closeTelemetry, createTelemetryContext, emitEvent } from './telemetry.ts';
import { arrayValue, objectRecord, selectPresentValue } from '../value-boundary.ts';
import { writeBusterRuntimeLog } from './logger.ts';
import {
  AGENT_NAME,
  disconnectRedisClient,
  ensureTaskConsumerGroup,
  getRedisClient,
  getTaskQueue,
  getTaskStreamKey,
  readNextTaskEntry,
  reclaimPendingTask,
} from './task-queue-client.ts';

export {
  AGENT_NAME,
  CONSUMER_NAME,
  GROUP_NAME,
  disconnectRedisClient,
  ensureTaskConsumerGroup,
  getRedisClient,
  getTaskStreamKey,
  readNextTaskEntry,
  reclaimPendingTask,
} from './task-queue-client.ts';

const TERMINAL_GUARANTEE_DETAIL_MISSING = 'completion/dead-letter was not recorded before ACK';
const MALFORMED_TASK_REASON = 'malformed_task';
const MALFORMED_TASK_PAYLOAD_JSON = '{}';
const TASK_SENDER_MISSING = 'missing_task_sender';
const TASK_TYPE_MISSING = 'missing_task_type';
const CLEANUP_RETURNED_INCOMPLETE = 'cleanup returned ok=false';
type AnyRecord = Record<string, any>;
type TaskQueue = ReturnType<typeof getTaskQueue>;
type CodedError = Error & { code: string };
interface QueuedTaskContext {
  id: string;
  data: AnyRecord;
  payload: AnyRecord;
  sender: string;
  taskType: string;
  effectiveType: string;
}

function taskPayloadText(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : MALFORMED_TASK_PAYLOAD_JSON;
}

async function emitQueueLifecycleEvidence(payload: AnyRecord, status: string, redisId: string, detail: AnyRecord = {}): Promise<void> {
  if (!payload?.project || !payload?.run_id) return;
  const ctx = createTelemetryContext({
    project: payload.project,
    run_id: payload.run_id,
    module_id: payload.module_id,
    gate_id: payload.gate_id,
    gate_type: payload.gate_type,
    attempt: payload.attempt,
    dispatch_id: payload.dispatch_id,
    pipeline_log_path: payload.pipeline_log_path,
    pipeline_run_log_path: payload.pipeline_run_log_path,
  });
  try {
    await emitEvent(ctx, 'infrastructure.evidence', {
      evidence_type: 'buster.queue.lifecycle',
      status,
      redis: { redis_id: redisId, state: status, task_stream: getTaskStreamKey(), completion_stream: payload.completion_stream ?? null, dead_letter_stream: payload.dead_letter_stream ?? null, ...detail },
    });
  } finally {
    await closeTelemetry(ctx);
  }
}

function canonicalQueueTerminalStatus(mode: string): string {
  if (mode === 'dead_letter') return 'dead_letter_published';
  if (mode === 'synthesized_failure_completion') return 'fallback_published';
  return mode;
}

function effectiveTaskType(payload: AnyRecord, taskType: string): string {
  if (PIPELINE_TASK_TYPES.includes(payload.task_type)) return payload.task_type;
  return taskType;
}

function taskModuleId(payload: AnyRecord): unknown {
  if (payload.module_id !== undefined && payload.module_id !== null) return payload.module_id;
  if (payload.module !== undefined && payload.module !== null) return payload.module;
  return null;
}

function buildTerminalGuaranteeError(detail: unknown): CodedError {
  const err = new Error(`BUSTER_TASK_TERMINAL_GUARANTEE_FAILED: ${String(detail)}`) as CodedError;
  err.code = 'BUSTER_TASK_TERMINAL_GUARANTEE_FAILED';
  return err;
}

async function ackTask(taskQueue: TaskQueue, id: string): Promise<void> {
  await taskQueue.ack(id);
}

async function ackTaskAfterTerminal(taskQueue: TaskQueue, id: string, terminalResult: AnyRecord): Promise<void> {
  if (!terminalResult?.ok) {
    throw buildTerminalGuaranteeError(selectPresentValue(terminalResult?.detail, TERMINAL_GUARANTEE_DETAIL_MISSING));
  }
  await ackTask(taskQueue, id);
}

async function writeMalformedDeadLetterBeforeAck(redisClient: any, taskQueue: TaskQueue, taskContext: AnyRecord): Promise<void> {
  try {
    await writeTaskDeadLetter(redisClient, {
      ...taskContext,
      streamKey: getTaskStreamKey(),
      phase: selectPresentValue(taskContext.phase, MALFORMED_TASK_REASON),
    });
  } catch (deadLetterError) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_task_queue',
      surface: 'dead_letter',
      reason: 'task_dead_letter_failed',
      detail: deadLetterError,
    });
    throw buildTerminalGuaranteeError(`dead-letter failed: ${safeErrorMessage(deadLetterError)}`);
  }
  await ackTask(taskQueue, taskContext.id);
}

async function parseQueuedPayload(redisClient: any, taskQueue: TaskQueue, id: string, data: AnyRecord): Promise<AnyRecord | null> {
  try {
    return JSON.parse(taskPayloadText(data.payload));
  } catch (error) {
    writeBusterRuntimeLog('warn', 'task-queue', 'Malformed task payload JSON', { redisId: id, detail: safeErrorMessage(error) });
    appendMalformedTaskArtifact({
      redis_id: id, stream: getTaskStreamKey(), sender: selectPresentValue(data.sender, TASK_SENDER_MISSING),
      redis_type: selectPresentValue(data.type, TASK_TYPE_MISSING), reason: 'payload_json_parse_failed',
      detail: safeErrorMessage(error), payload_size: taskPayloadText(data.payload).length,
    });
    await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, {
      id, data, payload: {}, sender: selectPresentValue(data.sender, TASK_SENDER_MISSING),
      taskType: selectPresentValue(data.type, TASK_TYPE_MISSING), effectiveType: selectPresentValue(data.type, TASK_TYPE_MISSING),
      reason: 'payload_json_parse_failed', detail: error, phase: 'payload_parse',
    });
    return null;
  }
}

async function validateQueuedContext(redisClient: any, taskQueue: TaskQueue, id: string, data: AnyRecord, payload: AnyRecord): Promise<QueuedTaskContext | null> {
  const taskType = selectPresentValue(data.type, TASK_TYPE_MISSING);
  const sender = selectPresentValue(data.sender, TASK_SENDER_MISSING);
  const effectiveType = effectiveTaskType(payload, taskType);
  const errors = validateRedisTaskEntry({ _id: id, ...data }, { requireCanonicalEnvelope: true, expectedStreamRole: 'task' });
  if (errors.length > 0) {
    writeBusterRuntimeLog('warn', 'task-queue', 'Invalid task envelope', { redisId: id, errors });
    await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, {
      id, data, payload, sender, taskType, effectiveType,
      reason: 'invalid_task_entry_schema', detail: errors.join('; '), phase: 'task_envelope_validation',
    });
    return null;
  }
  if (PIPELINE_TASK_TYPES.some((supportedType) => supportedType === effectiveType)) return { id, data, payload, sender, taskType, effectiveType };
  writeBusterRuntimeLog('warn', 'task-queue', 'Unsupported task type', { redisId: id, taskType: effectiveType });
  await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, {
    id, data, payload, sender, taskType, effectiveType,
    reason: 'unsupported_task_type', detail: `Unknown task type: ${effectiveType}`, phase: 'task_type_validation',
  });
  await emitQueueLifecycleEvidence(payload, 'dead_letter_published', id, { reason: 'unsupported_task_type' });
  return null;
}

async function finishSuccessfulTask(redisClient: any, taskQueue: TaskQueue, task: QueuedTaskContext, processResult: unknown): Promise<void> {
  const terminalResult = await ensureTaskTerminalBeforeAck(redisClient, {
    streamKey: getTaskStreamKey(), ...task, processResult, moduleId: taskModuleId(task.payload), phase: 'process_task_returned',
  });
  await emitQueueLifecycleEvidence(task.payload, canonicalQueueTerminalStatus(terminalResult.mode), task.id, { terminal_stream: terminalResult.stream ?? null });
  await ackTaskAfterTerminal(taskQueue, task.id, terminalResult);
  await taskQueue.trim(loadBusterRuntimePolicy().task_stream_max_len);
  writeBusterRuntimeLog('info', 'task-queue', 'Task acknowledged after terminal evidence', { redisId: task.id, mode: terminalResult.mode });
}

async function rejectMalformedProcessedTask(redisClient: any, taskQueue: TaskQueue, task: QueuedTaskContext, error: unknown): Promise<boolean> {
  const record = objectRecord(error);
  if (record.code !== 'BUSTER_TASK_MALFORMED') return false;
  writeBusterRuntimeLog('warn', 'task-queue', 'Malformed task rejected', { redisId: task.id, detail: safeErrorMessage(error) });
  const reason = selectPresentValue(record.details?.reason, MALFORMED_TASK_REASON);
  appendMalformedTaskArtifact({
    redis_id: task.id, stream: getTaskStreamKey(), sender: task.sender, redis_type: task.taskType,
    effective_type: task.effectiveType, reason, missing_fields: arrayValue(record.missing_fields),
    unsafe_fields: arrayValue(record.unsafe_fields), payload_keys: Object.keys(objectRecord(task.payload)),
  });
  await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, { ...task, reason, detail: error, phase: 'payload_validation' });
  await emitQueueLifecycleEvidence(task.payload, 'dead_letter_published', task.id, { reason: 'malformed_task' });
  return true;
}

async function cleanupFailedTask(payload: AnyRecord): Promise<void> {
  try {
    const result = await doResourceCleanup('error', payload);
    if (result?.ok !== false) return;
    reportBusterRuntimeDiagnostic({
      component: 'buster_cleanup', surface: 'task_error_cleanup', reason: 'task_error_cleanup_incomplete',
      detail: selectPresentValue(arrayValue(result.errors).join('; '), arrayValue(result.policy_denied).map((entry) => entry.reason).join('; '), CLEANUP_RETURNED_INCOMPLETE),
    });
  } catch (error) {
    reportBusterRuntimeDiagnostic({ component: 'buster_cleanup', surface: 'task_error_cleanup', reason: 'task_error_cleanup_failed', detail: error });
  }
}

async function finishFailedTask(redisClient: any, taskQueue: TaskQueue, task: QueuedTaskContext, error: unknown): Promise<void> {
  writeBusterRuntimeLog('error', 'task-queue', 'Task processing failed', { redisId: task.id, detail: safeErrorMessage(error) });
  await cleanupFailedTask(task.payload);
  const terminalResult = await ensureTaskTerminalBeforeAck(redisClient, {
    streamKey: getTaskStreamKey(), ...task, error, moduleId: taskModuleId(task.payload), phase: 'process_task_error',
  });
  await emitQueueLifecycleEvidence(task.payload, canonicalQueueTerminalStatus(terminalResult.mode), task.id, { terminal_stream: terminalResult.stream ?? null, reason: 'process_task_error' });
  try {
    await ackTaskAfterTerminal(taskQueue, task.id, terminalResult);
  } catch (ackError) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_redis', surface: 'task_failure_ack',
      reason: objectRecord(ackError).code === 'BUSTER_TASK_TERMINAL_GUARANTEE_FAILED' ? 'task_failure_terminal_guarantee_failed' : 'task_failure_ack_failed',
      detail: ackError,
    });
    throw ackError;
  }
}

export async function processOneQueuedTask(processTask: (payload: AnyRecord) => Promise<unknown>): Promise<void> {
  const redisClient = getRedisClient();
  const taskQueue = getTaskQueue(redisClient);
  const taskEntry = await taskQueue.readNext();
  if (!taskEntry) return;

  const { id, data, reclaimed } = taskEntry;
  const payload = await parseQueuedPayload(redisClient, taskQueue, id, data);
  if (!payload) return;
  const task = await validateQueuedContext(redisClient, taskQueue, id, data, payload);
  if (!task) return;
  writeBusterRuntimeLog('info', 'task-queue', 'Task claimed', { redisId: id, sender: task.sender, consumer: AGENT_NAME, taskType: task.effectiveType, reclaimed });
  await emitQueueLifecycleEvidence(payload, reclaimed ? 'pending_reclaimed' : 'pending_claimed', id);

  let processResult: unknown = null;
  let processError: unknown = null;
  try {
    processResult = await processTask(payload);
  } catch (err) {
    processError = err;
  }

  if (!processError) return finishSuccessfulTask(redisClient, taskQueue, task, processResult);
  if (await rejectMalformedProcessedTask(redisClient, taskQueue, task, processError)) return;
  await finishFailedTask(redisClient, taskQueue, task, processError);
}
