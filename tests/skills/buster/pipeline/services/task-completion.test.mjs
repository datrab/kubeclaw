import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureTaskTerminalBeforeAck,
  publishTaskCompletionWithArtifact,
} from '../../../../../skills/buster/pipeline/services/task-completion.ts';

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

test('publishTaskCompletionWithArtifact writes and verifies output_file before Redis completion', async () => {
  const redisClient = createRecordingRedisClient();
  const calls = [];
  const payload = {
    task_type: 'module_test',
    project: 'project',
    module_id: 'mod',
    run_id: 'run',
    attempt: 1,
    dispatch_id: 'dispatch',
    completion_stream: 'swarm:nova:completion',
    output_file: 'Projects/project/src/.swarm/modules/mod/buster-output.json',
  };

  const result = await publishTaskCompletionWithArtifact(redisClient, payload, {
    moduleId: payload.module_id,
    outcome: 'FAIL',
    reason: 'output_file_missing',
    summary: 'child did not write output_file',
    ensureBusterOutputFile: (actualPayload, result) => {
      calls.push({ type: 'ensure', payload: actualPayload, result });
      return { ok: true, path: actualPayload.output_file, source: 'written', status: 'FAIL' };
    },
    verifyAndPush: async (...args) => {
      calls.push({ type: 'verify', args });
      return { status: 'success', action: 'pushed', commit_hash: 'abc123' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.stream, payload.completion_stream);
  assert.deepEqual(calls.map((call) => call.type), ['ensure', 'verify']);
  assert.equal(calls[0].result.outcome, 'FAIL');
  assert.equal(calls[0].result.reason, 'output_file_missing');
  assert.equal(calls[1].args[0], 'buster');
  assert.equal(calls[1].args[1], payload.project);
  assert.equal(redisClient.calls.length, 1);
  assert.equal(redisClient.calls[0].stream, payload.completion_stream);
  assert.equal(redisClient.calls[0].fields.outcome, 'FAIL');
  assert.equal(redisClient.calls[0].fields.status, 'FAIL');
  assert.equal(redisClient.calls[0].fields.reason, 'output_file_missing');
});

test('publishTaskCompletionWithArtifact rejects failed output_file verification without Redis completion', async () => {
  const redisClient = createRecordingRedisClient();
  const payload = {
    task_type: 'module_test',
    project: 'project',
    module_id: 'mod',
    run_id: 'run',
    attempt: 1,
    dispatch_id: 'dispatch',
    completion_stream: 'swarm:nova:completion',
    output_file: 'Projects/project/src/.swarm/modules/mod/buster-output.json',
  };

  await assert.rejects(
    () => publishTaskCompletionWithArtifact(redisClient, payload, {
      moduleId: payload.module_id,
      outcome: 'FAIL',
      reason: 'output_file_missing',
      summary: 'child did not write output_file',
      ensureBusterOutputFile: () => ({ ok: true, path: payload.output_file, source: 'written', status: 'FAIL' }),
      verifyAndPush: async () => ({ status: 'error', action: 'cleanup_failed', error: 'scope check failed' }),
    }),
    /scope check failed/,
  );

  assert.equal(redisClient.calls.length, 0);
});

test('ensureTaskTerminalBeforeAck dead-letters non-terminal process results instead of synthesizing completion', async () => {
  const redisClient = createRecordingRedisClient();
  const payload = {
    task_type: 'module_test',
    project: 'project',
    module_id: 'mod',
    run_id: 'run',
    attempt: 1,
    dispatch_id: 'dispatch',
    completion_stream: 'swarm:nova:completion',
    output_file: 'Projects/project/src/.swarm/modules/mod/buster-output.json',
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
        error: 'output_file verify failed',
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
  assert.match(redisClient.calls[0].fields.detail, /output_file verify failed/);
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
