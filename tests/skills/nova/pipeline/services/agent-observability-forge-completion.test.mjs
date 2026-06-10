import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentEndedTelemetryReader,
  isForgeCompletionControlPath,
} from '../../../../../skills/nova/pipeline/services/agent-observability-forge-completion.ts';

function xreadResult(id, event) {
  return [['telemetry-stream', [[id, ['data', JSON.stringify(event)]]]]];
}

test('agent ended telemetry reader advances past ignored stream entries', async () => {
  const cursors = [];

  class FakeRedis {
    on() {}

    async xread(...args) {
      const cursor = args.at(-1);
      cursors.push(cursor);
      if (cursor === '0-0') {
        return xreadResult('1-0', {
          type: 'agent.started',
          run_id: 'run-a',
          module_id: 'module-a',
        });
      }
      if (cursor === '1-0') {
        return xreadResult('2-0', {
          type: 'agent.ended',
          agent_type: 'forge',
          run_id: 'run-a',
          module_id: 'module-a',
          outcome: 'success',
        });
      }
      return null;
    }

    disconnect() {}
  }

  const reader = createAgentEndedTelemetryReader({
    project: 'project-a',
    telemetry: { enabled: true },
  }, {
    RedisCtor: FakeRedis,
    runId: 'run-a',
    stream: 'telemetry-stream',
    startId: '0-0',
  });

  assert.equal(await reader.read({ run_id: 'run-a', module_id: 'module-a' }), null);
  const matched = await reader.read({ run_id: 'run-a', module_id: 'module-a' });

  assert.equal(matched?.type, 'agent.ended');
  assert.equal(matched?.redis_id, '2-0');
  assert.deepEqual(cursors, ['0-0', '1-0']);
});

test('forge completion control path ignores only scoped runtime control files', () => {
  const config = {
    repo_root: '/repo',
    paths: {
      modules_dir: '/repo/modules',
    },
  };

  assert.equal(isForgeCompletionControlPath('api/status.json', config, 'module-a'), false);
  assert.equal(isForgeCompletionControlPath('fixtures/forge-completion.json', config, 'module-a'), false);
  assert.equal(isForgeCompletionControlPath('modules/module-a/status.json', config, 'module-a'), false);
  assert.equal(isForgeCompletionControlPath('modules/module-a/forge-completion.json', config, 'module-a'), true);
  assert.equal(isForgeCompletionControlPath('.swarm/logs/status.json', config, 'module-a'), true);
});
