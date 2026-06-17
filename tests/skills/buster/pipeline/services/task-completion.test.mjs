import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureTaskTerminalBeforeAck } from '../../../../../skills/buster/pipeline/services/task-completion.ts';

function createRecordingRedisClient() {
  const calls = [];
  return {
    calls,
    async xadd(stream, id, ...fieldPairs) {
      const fields = {};
      for (let i = 0; i < fieldPairs.length; i += 2) {
        fields[fieldPairs[i]] = fieldPairs[i + 1];
      }
      calls.push({ stream, id, fields });
      return `${calls.length}-0`;
    },
  };
}

test('ensureTaskTerminalBeforeAck synthesizes completion failure after failed completion attempt', async () => {
  const redisClient = createRecordingRedisClient();
  const payload = {
    task_type: 'module_test',
    project: 'project',
    module_id: 'mod',
    run_id: 'run',
    attempt: 1,
    dispatch_id: 'dispatch',
    completion_stream: 'swarm:nova:completion',
  };

  const result = await ensureTaskTerminalBeforeAck(redisClient, {
    streamKey: 'swarm:buster:tasks',
    id: '1-0',
    data: { type: 'module_test', sender: 'nova', payload: JSON.stringify(payload) },
    payload,
    processResult: {
      completion: {
        attempted: true,
        terminal: false,
        stream: payload.completion_stream,
        error: 'git push failed',
      },
    },
    moduleId: payload.module_id,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'synthesized_failure_completion_before_ack');
  assert.equal(result.stream, payload.completion_stream);
  assert.equal(redisClient.calls.length, 1);
  assert.equal(redisClient.calls[0].stream, payload.completion_stream);
  assert.equal(redisClient.calls[0].fields.outcome, 'FAIL');
  assert.equal(redisClient.calls[0].fields.status, 'FAIL');
  assert.match(redisClient.calls[0].fields.reason, /git push failed/);
});

test('ensureTaskTerminalBeforeAck dead-letters missing completion_stream before ACK', async () => {
  const redisClient = createRecordingRedisClient();
  const payload = {
    task_type: 'module_test',
    project: 'project',
    module_id: 'mod',
    run_id: 'run',
    attempt: 1,
    dispatch_id: 'dispatch',
  };

  const result = await ensureTaskTerminalBeforeAck(redisClient, {
    streamKey: 'swarm:buster:tasks',
    id: '1-0',
    data: { type: 'module_test', sender: 'nova', payload: JSON.stringify(payload) },
    payload,
    processResult: {
      outcome: 'FAIL',
      reason: 'task returned without completion stream',
      completion: {
        attempted: false,
        terminal: false,
      },
    },
    moduleId: payload.module_id,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'dead_letter');
  assert.equal(result.stream, 'swarm:buster:tasks:dead-letter');
  assert.equal(redisClient.calls.length, 1);
  assert.equal(redisClient.calls[0].stream, 'swarm:buster:tasks:dead-letter');
  assert.equal(redisClient.calls[0].fields.reason, 'task_failed_before_terminal_completion');
  assert.equal(redisClient.calls[0].fields.phase, 'completion_missing');
  assert.equal(redisClient.calls[0].fields.completion_stream, undefined);
});
