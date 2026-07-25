import { readBusterEnvironment } from '../runtime-environment.ts';
import { safeErrorMessage } from './runtime-diagnostics.ts';
import { createRedisEventBus } from './task-transport-contract.ts';
import type { AnyTaskRecord, BusterTaskPayload, DeadLetterOptions, RedisTaskClient } from './task-contracts.ts';

const DEFAULT_DEAD_LETTER_SUFFIX = ':dead-letter';

function compactRecord(value: AnyTaskRecord): Record<string, string> {
  return Object.fromEntries(Object.entries(value)
    .filter(([, field]) => field !== undefined && field !== null)
    .map(([key, field]) => [key, typeof field === 'string' ? field : JSON.stringify(field)]));
}

function resolveDeadLetterStream(streamKey: string, payload: BusterTaskPayload = {}): string {
  if (payload.dead_letter_stream) return payload.dead_letter_stream;
  const configuredStream = readBusterEnvironment('BUSTER_TASK_DEAD_LETTER_STREAM');
  if (configuredStream) return configuredStream;
  return `${streamKey}${DEFAULT_DEAD_LETTER_SUFFIX}`;
}

function authoritativeValue(explicit: unknown, derived: unknown, missing: string): unknown {
  if (explicit !== undefined && explicit !== null && explicit !== '') return explicit;
  if (derived !== undefined && derived !== null && derived !== '') return derived;
  return missing;
}

function buildTaskDeadLetterFields(options: DeadLetterOptions): Record<string, string> {
  const data = options.data ?? {};
  const payload = options.payload ?? {};
  const taskType = authoritativeValue(options.taskType, data.type, 'missing_task_type');
  return compactRecord({
    type: 'task_dead_letter', source: 'buster-pipeline',
    reason: options.reason ?? 'task_failed_before_completion',
    detail: safeErrorMessage(options.detail ?? ''), phase: options.phase ?? 'process_task',
    stream: options.streamKey, redis_id: options.id,
    sender: authoritativeValue(options.sender, data.sender, 'missing_task_sender'),
    redis_type: taskType, effective_type: options.effectiveType ?? taskType,
    project: payload.project, module_id: payload.module_id ?? payload.module,
    gate_id: payload.gate_id, run_id: payload.run_id, attempt: payload.attempt,
    dispatch_id: payload.dispatch_id, completion_stream: payload.completion_stream,
    payload_keys: Object.keys(payload),
    payload_size: data.payload ? String(data.payload).length : undefined,
    timestamp: String(Date.now()),
  });
}

export async function writeTaskDeadLetter(redisClient: RedisTaskClient, options: DeadLetterOptions) {
  const stream = resolveDeadLetterStream(options.streamKey, options.payload);
  const published = await createRedisEventBus(redisClient).publish(stream, buildTaskDeadLetterFields(options));
  return { ok: true, stream, id: published.id };
}
