#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  assertRedisTaskEntry,
  buildRedisTaskStreamEntry,
  validateRedisTaskEntry,
} from '../../../skills/common/pipeline/services/redis-message-contract.ts';
import {
  createRedisTaskQueue,
} from '../../../skills/common/pipeline/services/task-transport-contract.ts';
import {
  ensureTaskTerminalBeforeAck,
  writeTaskDeadLetter,
} from '../../../skills/buster/pipeline/services/task-completion.ts';

function flattenFields(fields = {}) {
  return Object.entries(fields).flatMap(([key, value]) => [key, value ?? '']);
}

function fieldsArrayToObject(fields = []) {
  const data = {};
  for (let index = 0; index < fields.length; index += 2) {
    data[fields[index]] = fields[index + 1];
  }
  return data;
}

class ContractRedisStream {
  constructor() {
    this.streams = new Map();
    this.groups = new Map();
    this.acked = [];
    this.trimmed = [];
    this.counters = new Map();
  }

  groupKey(stream, group) {
    return `${stream}\u0000${group}`;
  }

  streamEntries(stream) {
    if (!this.streams.has(stream)) this.streams.set(stream, []);
    return this.streams.get(stream);
  }

  groupState(stream, group) {
    const key = this.groupKey(stream, group);
    if (!this.groups.has(key)) {
      this.groups.set(key, { delivered: new Set(), pending: new Map() });
    }
    return this.groups.get(key);
  }

  async xgroup(command, stream, group, _startId, _mkstream) {
    assert.equal(command, 'CREATE');
    const key = this.groupKey(stream, group);
    if (this.groups.has(key)) {
      const error = new Error('BUSYGROUP Consumer Group name already exists');
      error.command = 'XGROUP';
      throw error;
    }
    this.groups.set(key, { delivered: new Set(), pending: new Map() });
    this.streamEntries(stream);
    return 'OK';
  }

  async xadd(stream, idArg, ...fieldPairs) {
    const next = (this.counters.get(stream) || 0) + 1;
    this.counters.set(stream, next);
    const id = idArg === '*' ? `${next}-0` : idArg;
    this.streamEntries(stream).push([id, fieldPairs]);
    return id;
  }

  async xreadgroup(...args) {
    const group = args[args.indexOf('GROUP') + 1];
    const consumer = args[args.indexOf('GROUP') + 2];
    const stream = args[args.indexOf('STREAMS') + 1];
    const requestedId = args[args.indexOf('STREAMS') + 2];
    assert.equal(requestedId, '>');
    const state = this.groupState(stream, group);
    const entry = this.streamEntries(stream).find(([id]) => !state.delivered.has(id));
    if (!entry) return null;
    state.delivered.add(entry[0]);
    state.pending.set(entry[0], { entry, consumer });
    return [[stream, [entry]]];
  }

  async call(command, stream, group, consumer) {
    assert.equal(command, 'XAUTOCLAIM');
    const state = this.groupState(stream, group);
    const first = state.pending.values().next().value;
    if (!first) return ['0-0', []];
    first.consumer = consumer;
    return ['0-0', [first.entry]];
  }

  async xack(stream, group, id) {
    const state = this.groupState(stream, group);
    const removed = state.pending.delete(id) ? 1 : 0;
    this.acked.push({ stream, group, id, removed });
    return removed;
  }

  async xtrim(stream, strategy, approx, len) {
    this.trimmed.push({ stream, strategy, approx, len });
    return 0;
  }

  records(stream) {
    return this.streamEntries(stream).map(([id, fields]) => ({ id, fields: fieldsArrayToObject(fields) }));
  }

  pendingIds(stream, group) {
    return [...this.groupState(stream, group).pending.keys()];
  }
}

const taskStream = 'swarm:buster:tasks:contract-lifecycle';
const completionStream = 'swarm:pipeline:contract-lifecycle:completions';
const deadLetterStream = `${taskStream}:dead-letter`;
const groupName = 'buster-group';
const redis = new ContractRedisStream();
const queue = createRedisTaskQueue(redis, {
  streamKey: taskStream,
  groupName,
  consumerName: 'contract-consumer-a',
  pollInterval: 1,
  reclaimIdleMs: 1,
  maxLen: 50,
});

await queue.ensureConsumerGroup();

const validPayload = {
  task_type: 'module_test',
  project: 'contract-lifecycle',
  module_id: '01-lifecycle',
  run_id: 'run-lifecycle',
  attempt: 1,
  dispatch_id: 'dispatch-lifecycle',
  stage_id: 'worker:module_buster',
  worker_type: 'module_buster',
  commit_hash: 'abcdef1234567890abcdef1234567890abcdef12',
  timeout_seconds: 60,
  output_file: '.swarm/modules/01-lifecycle/buster-output.json',
  completion_stream: completionStream,
  suites: ['unit'],
  capabilities: [],
  session: {
    runtime: 'subagent',
    agentId: 'codex',
    model: 'gpt-5-codex',
    cwd: process.cwd(),
    label: 'dispatch-lifecycle',
    timeout_seconds: 60,
  },
  test_config: {
    suite_timeout_ms: 300000,
    unit: {
      test_cmd: ['node', '--version'],
    },
  },
};

const validEntry = buildRedisTaskStreamEntry({
  type: 'module_test',
  sender: 'nova',
  source: 'nova',
  payload: validPayload,
  iteration: validPayload.attempt,
  timestamp: '2026-06-16T00:00:00.000Z',
});
assertRedisTaskEntry(validEntry, { requireStreamId: false });

const published = await queue.publishTask(taskStream, validEntry);
const read = await queue.readNext();
assert.equal(read.id, published.id);
assert.deepEqual(redis.pendingIds(taskStream, groupName), [published.id]);

const terminal = await ensureTaskTerminalBeforeAck(redis, {
  streamKey: taskStream,
  id: read.id,
  data: read.data,
  payload: JSON.parse(read.data.payload),
  sender: read.data.sender,
  taskType: read.data.type,
  effectiveType: read.data.type,
  processResult: {
    outcome: 'FAIL',
    reason: 'verify_task_failed',
    completion: {
      attempted: true,
      terminal: false,
      stream: completionStream,
      error: 'artifact push failed',
    },
  },
  moduleId: validPayload.module_id,
  phase: 'contract_valid_task_terminal_guarantee',
});
assert.equal(terminal.ok, true);
assert.equal(terminal.mode, 'synthesized_failure_completion_before_ack');
assert.equal(redis.records(completionStream).length, 1);
assert.equal(redis.records(completionStream)[0].fields.run_id, validPayload.run_id);
assert.equal(redis.records(completionStream)[0].fields.dispatch_id, validPayload.dispatch_id);
assert.equal(redis.records(completionStream)[0].fields.outcome, 'FAIL');
assert.equal(redis.records(completionStream)[0].fields.source, 'buster-pipeline-task-queue');

await queue.ack(read.id);
await queue.trim(50);
assert.deepEqual(redis.pendingIds(taskStream, groupName), []);
assert.deepEqual(redis.acked.at(-1), { stream: taskStream, group: groupName, id: read.id, removed: 1 });
assert.equal(redis.trimmed.at(-1).stream, taskStream);

const invalidEntry = {
  ...validEntry,
  run_id: '',
  source: '',
  payload: '{"not valid json"',
};
const invalidPublished = await queue.publishTask(taskStream, invalidEntry);
const invalidRead = await queue.readNext();
assert.equal(invalidRead.id, invalidPublished.id);
const invalidErrors = validateRedisTaskEntry({ _id: invalidRead.id, ...invalidRead.data }, {
  requireCanonicalEnvelope: true,
  expectedStreamRole: 'task',
});
assert(invalidErrors.some((error) => error.includes('run_id must be a non-empty string')));
assert(invalidErrors.some((error) => error.includes('source must be a non-empty string')));
assert(invalidErrors.some((error) => error.includes('payload must be valid JSON')));

await writeTaskDeadLetter(redis, {
  streamKey: taskStream,
  id: invalidRead.id,
  data: invalidRead.data,
  payload: {},
  sender: invalidRead.data.sender,
  taskType: invalidRead.data.type,
  effectiveType: invalidRead.data.type,
  reason: 'invalid_task_entry_schema',
  detail: invalidErrors.join('; '),
  phase: 'task_envelope_validation',
});
assert.equal(redis.records(deadLetterStream).length, 1);
assert.equal(redis.records(deadLetterStream)[0].fields.reason, 'invalid_task_entry_schema');
assert.equal(redis.records(deadLetterStream)[0].fields.redis_id, invalidRead.id);
assert.equal(redis.records(completionStream).length, 1, 'invalid envelope must dead-letter without synthesizing a clean completion');

await queue.ack(invalidRead.id);
assert.deepEqual(redis.pendingIds(taskStream, groupName), []);

const missingCompletionPayload = { ...validPayload, dispatch_id: 'dispatch-missing-completion' };
delete missingCompletionPayload.completion_stream;
const missingCompletionEntry = buildRedisTaskStreamEntry({
  type: 'module_test',
  sender: 'nova',
  source: 'nova',
  payload: missingCompletionPayload,
  iteration: 2,
  timestamp: '2026-06-16T00:00:00.500Z',
});
const missingCompletionPublished = await queue.publishTask(taskStream, missingCompletionEntry);
const missingCompletionRead = await queue.readNext();
assert.equal(missingCompletionRead.id, missingCompletionPublished.id);
assert.deepEqual(redis.pendingIds(taskStream, groupName), [missingCompletionPublished.id]);

const missingCompletionTerminal = await ensureTaskTerminalBeforeAck(redis, {
  streamKey: taskStream,
  id: missingCompletionRead.id,
  data: missingCompletionRead.data,
  payload: JSON.parse(missingCompletionRead.data.payload),
  sender: missingCompletionRead.data.sender,
  taskType: missingCompletionRead.data.type,
  effectiveType: missingCompletionRead.data.type,
  processResult: {
    outcome: 'FAIL',
    reason: 'missing_completion_stream',
    completion: {
      attempted: false,
      terminal: false,
    },
  },
  moduleId: validPayload.module_id,
  phase: 'contract_missing_completion_stream',
});
assert.equal(missingCompletionTerminal.ok, true);
assert.equal(missingCompletionTerminal.mode, 'dead_letter');
assert.equal(redis.records(completionStream).length, 1, 'missing completion_stream must not synthesize a clean completion');
assert.equal(redis.records(deadLetterStream).length, 2);
assert.equal(redis.records(deadLetterStream).at(-1).fields.redis_id, missingCompletionRead.id);
assert.equal(redis.records(deadLetterStream).at(-1).fields.detail, 'missing_completion_stream');
assert.deepEqual(redis.pendingIds(taskStream, groupName), [missingCompletionPublished.id], 'missing completion_stream must remain pending until dead-letter proof exists');

await queue.ack(missingCompletionRead.id);
assert.deepEqual(redis.pendingIds(taskStream, groupName), []);

const reclaimEntry = buildRedisTaskStreamEntry({
  type: 'module_test',
  sender: 'nova',
  source: 'nova',
  payload: { ...validPayload, dispatch_id: 'dispatch-reclaim' },
  iteration: 2,
  timestamp: '2026-06-16T00:00:01.000Z',
});
const reclaimPublished = await queue.publishTask(taskStream, reclaimEntry);
const firstConsumerRead = await queue.readNext();
assert.equal(firstConsumerRead.id, reclaimPublished.id);
assert.deepEqual(redis.pendingIds(taskStream, groupName), [reclaimPublished.id]);

const reclaimingQueue = createRedisTaskQueue(redis, {
  streamKey: taskStream,
  groupName,
  consumerName: 'contract-consumer-b',
  pollInterval: 1,
  reclaimIdleMs: 1,
  maxLen: 50,
});
const reclaimed = await reclaimingQueue.readNext();
assert.equal(reclaimed.id, reclaimPublished.id);
assert.equal(reclaimed.reclaimed, true);

console.log(JSON.stringify({
  ok: true,
  contract: 'redis-task-lifecycle',
  task_stream: taskStream,
  completion_stream: completionStream,
  dead_letter_stream: deadLetterStream,
  acked: redis.acked.length,
  completions: redis.records(completionStream).length,
  dead_letters: redis.records(deadLetterStream).length,
}, null, 2));
