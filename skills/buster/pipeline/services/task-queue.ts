import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// pipeline/services/task-queue.ts — Redis task queue client, dequeue, ack/reclaim loop helpers
// Keeps stream transport mechanics outside the Buster task orchestrator.

import { hostname } from 'os';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { doSandboxCleanup } from './pipeline-helpers.ts';
import { validateRedisTaskEntry } from './redis-message-contract.ts';
import { createRedisTaskQueue } from './task-transport-contract.ts';
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

const TERMINAL_GUARANTEE_DETAIL_MISSING = 'completion/dead-letter was not recorded before ACK';
const MALFORMED_TASK_REASON = 'malformed_task';
const MALFORMED_TASK_PAYLOAD_JSON = '{}';
const TASK_SENDER_MISSING = 'missing_task_sender';
const TASK_TYPE_MISSING = 'missing_task_type';
const CLEANUP_RETURNED_INCOMPLETE = 'cleanup returned ok=false';

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function taskPayloadText(value) {
  return typeof value === 'string' && value.length > 0 ? value : MALFORMED_TASK_PAYLOAD_JSON;
}

function effectiveTaskType(payload, taskType) {
  if (PIPELINE_TASK_TYPES.includes(payload.task_type)) return payload.task_type;
  return taskType;
}

function taskModuleId(payload) {
  if (payload.module_id !== undefined && payload.module_id !== null) return payload.module_id;
  if (payload.module !== undefined && payload.module !== null) return payload.module;
  return null;
}

function requireRuntimeEnvString(name: string): string {
  const value = process.env[name];
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`${name}: required runtime environment value`);
  }
  return value.trim();
}

export const AGENT_NAME = requireRuntimeEnvString('AGENT_NAME');
export const GROUP_NAME = `${AGENT_NAME}-group`;
export const CONSUMER_NAME = `${AGENT_NAME}-buster-pipeline-${hostname()}`;

export function getTaskStreamKey() {
  return loadBusterRuntimePolicy().task_stream;
}

let RedisCtor = null;
let redis = null;

export function getRedisClient() {
  if (redis) return redis;
  if (!RedisCtor) RedisCtor = loadRedisCtor();
  redis = createRedisClient(RedisCtor, {}, {
    retryStrategy:       (times) => Math.min(times * 100, 5000),
    maxRetriesPerRequest: null,
    enableReadyCheck:    true,
  });

  redis.on('error',   (err) => console.error('[REDIS]', safeErrorMessage(err)));
  redis.on('connect', ()    => console.log('[REDIS] Connected.'));
  return redis;
}

export async function disconnectRedisClient() {
  if (!redis) return;
  const current = redis;
  redis = null;
  try {
    await current.quit();
  } catch (quitError) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_redis',
      surface: 'disconnect',
      reason: 'redis_quit_failed',
      detail: quitError,
    });
    try {
      current.disconnect();
    } catch (disconnectError) {
      reportBusterRuntimeDiagnostic({
        component: 'buster_redis',
        surface: 'disconnect',
        reason: 'redis_disconnect_failed',
        detail: disconnectError,
      });
    }
  }
}

function getTaskQueue(redisClient = getRedisClient()) {
  const runtimePolicy = loadBusterRuntimePolicy();
  return createRedisTaskQueue(redisClient, {
    streamKey: getTaskStreamKey(),
    groupName: GROUP_NAME,
    consumerName: CONSUMER_NAME,
    pollInterval: runtimePolicy.task_poll_interval_ms,
    reclaimIdleMs: runtimePolicy.task_pending_reclaim_idle_ms,
    maxLen: runtimePolicy.task_stream_max_len,
  });
}

export async function ensureTaskConsumerGroup(redisClient = getRedisClient()) {
  return getTaskQueue(redisClient).ensureConsumerGroup();
}

export async function reclaimPendingTask(redisClient = getRedisClient()) {
  if (!redisClient) return null;
  return getTaskQueue(redisClient).reclaimPending();
}

export async function readNextTaskEntry(redisClient = getRedisClient()) {
  if (!redisClient) return null;
  return getTaskQueue(redisClient).readNext();
}

function buildTerminalGuaranteeError(detail) {
  const err = new Error(`BUSTER_TASK_TERMINAL_GUARANTEE_FAILED: ${detail}`);
  err.code = 'BUSTER_TASK_TERMINAL_GUARANTEE_FAILED';
  return err;
}

async function ackTask(taskQueue, id) {
  await taskQueue.ack(id);
}

async function ackTaskAfterTerminal(taskQueue, id, terminalResult) {
  if (!terminalResult?.ok) {
    throw buildTerminalGuaranteeError(selectPresentValue(terminalResult?.detail, TERMINAL_GUARANTEE_DETAIL_MISSING));
  }
  await ackTask(taskQueue, id);
}

async function writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, taskContext) {
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

export async function processOneQueuedTask(processTask) {
  const redisClient = getRedisClient();
  const taskQueue = getTaskQueue(redisClient);
  const taskEntry = await taskQueue.readNext();
  if (!taskEntry) return;

  const { id, data, reclaimed } = taskEntry;

  let payload = {};
  try {
    payload = JSON.parse(taskPayloadText(data.payload));
  } catch (error) {
    console.warn(`[TASK] ⚠️ Malformed task payload JSON for ${id}: ${safeErrorMessage(error)}`);
    appendMalformedTaskArtifact({
      redis_id: id,
      stream: getTaskStreamKey(),
      sender: selectPresentValue(data.sender, TASK_SENDER_MISSING),
      redis_type: selectPresentValue(data.type, TASK_TYPE_MISSING),
      reason: 'payload_json_parse_failed',
      detail: safeErrorMessage(error),
      payload_size: taskPayloadText(data.payload).length,
    });
    await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, {
      id,
      data,
      payload,
      sender: selectPresentValue(data.sender, TASK_SENDER_MISSING),
      taskType: selectPresentValue(data.type, TASK_TYPE_MISSING),
      effectiveType: selectPresentValue(data.type, TASK_TYPE_MISSING),
      reason: 'payload_json_parse_failed',
      detail: error,
      phase: 'payload_parse',
    });
    return;
  }

  const taskType = selectPresentValue(data.type, TASK_TYPE_MISSING);
  const sender = selectPresentValue(data.sender, TASK_SENDER_MISSING);
  const taskEntryErrors = validateRedisTaskEntry({ _id: id, ...data }, { requireCanonicalEnvelope: true, expectedStreamRole: 'task' });
  if (taskEntryErrors.length > 0) {
    console.warn(`[TASK] ⚠️ Invalid task envelope for ${id}: ${taskEntryErrors.join('; ')}`);
    await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, {
      id,
      data,
      payload,
      sender,
      taskType,
      effectiveType: effectiveTaskType(payload, taskType),
      reason: 'invalid_task_entry_schema',
      detail: taskEntryErrors.join('; '),
      phase: 'task_envelope_validation',
    });
    return;
  }

  const effectiveType = effectiveTaskType(payload, taskType);

  console.log(`\n[TASK] ${id} | ${sender} ➔ ${AGENT_NAME} | type=${effectiveType}${reclaimed ? ' | reclaimed=pending' : ''}`);

  if (!PIPELINE_TASK_TYPES.includes(effectiveType)) {
    console.warn(`[TASK] ⚠️ Unknown task type: ${effectiveType} — skipping`);
    await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, {
      id,
      data,
      payload,
      sender,
      taskType,
      effectiveType,
      reason: 'unsupported_task_type',
      detail: `Unknown task type: ${effectiveType}`,
      phase: 'task_type_validation',
    });
    return;
  }

  let processResult = null;
  let processError = null;
  try {
    processResult = await processTask(payload);
  } catch (err) {
    processError = err;
  }

  if (!processError) {
    const terminalResult = await ensureTaskTerminalBeforeAck(redisClient, {
      streamKey: getTaskStreamKey(),
      id,
      data,
      payload,
      sender,
      taskType,
      effectiveType,
      processResult,
      moduleId: taskModuleId(payload),
      phase: 'process_task_returned',
    });
    await ackTaskAfterTerminal(taskQueue, id, terminalResult);
    await taskQueue.trim(loadBusterRuntimePolicy().task_stream_max_len);
    console.log(`[TASK] ✅ Acked after ${terminalResult.mode}.`);
    return;
  }

  if (processError?.code === 'BUSTER_TASK_MALFORMED') {
    console.warn(`[TASK] ⚠️ Malformed task rejected: ${safeErrorMessage(processError)}`);
    appendMalformedTaskArtifact({
      redis_id: id,
      stream: getTaskStreamKey(),
      sender,
      redis_type: taskType,
      effective_type: effectiveType,
      reason: selectPresentValue(processError.details?.reason, MALFORMED_TASK_REASON),
      missing_fields: arrayValue(processError.missing_fields),
      unsafe_fields: arrayValue(processError.unsafe_fields),
      payload_keys: Object.keys(objectRecord(payload)),
    });
    await writeMalformedDeadLetterBeforeAck(redisClient, taskQueue, {
      id,
      data,
      payload,
      sender,
      taskType,
      effectiveType,
      reason: selectPresentValue(processError.details?.reason, MALFORMED_TASK_REASON),
      detail: processError,
      phase: 'payload_validation',
    });
    return;
  }

  console.error(`[TASK] ❌ Failed: ${safeErrorMessage(processError)}`);
  try {
    const cleanupResult = await doSandboxCleanup('error', payload);
    if (cleanupResult?.ok === false) {
      reportBusterRuntimeDiagnostic({
        component: 'buster_cleanup',
        surface: 'task_error_cleanup',
        reason: 'task_error_cleanup_incomplete',
        detail: selectPresentValue(
          arrayValue(cleanupResult.errors).join('; '),
          arrayValue(cleanupResult.policy_denied).map((entry) => entry.reason).join('; '),
          CLEANUP_RETURNED_INCOMPLETE,
        ),
      });
    }
  } catch (cleanupError) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_cleanup',
      surface: 'task_error_cleanup',
      reason: 'task_error_cleanup_failed',
      detail: cleanupError,
    });
  }

  const terminalResult = await ensureTaskTerminalBeforeAck(redisClient, {
    streamKey: getTaskStreamKey(),
    id,
    data,
    payload,
    sender,
    taskType,
    effectiveType,
    error: processError,
    moduleId: taskModuleId(payload),
    phase: 'process_task_error',
  });

  try {
    await ackTaskAfterTerminal(taskQueue, id, terminalResult);
  } catch (ackError) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_redis',
      surface: 'task_failure_ack',
      reason: ackError?.code === 'BUSTER_TASK_TERMINAL_GUARANTEE_FAILED'
        ? 'task_failure_terminal_guarantee_failed'
        : 'task_failure_ack_failed',
      detail: ackError,
    });
    throw ackError;
  }
}
