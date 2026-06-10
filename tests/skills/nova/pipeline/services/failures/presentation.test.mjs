import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { injectNeedsNova } from '../../../../../../skills/nova/pipeline/services/failures/presentation.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-injection-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'nova-injection-test',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

test('Nova injection stays ok when confirmation Discord notification fails', async () => {
  const config = makeConfig();
  let gatewayCalls = 0;
  let discordCalls = 0;

  await injectNeedsNova(config, {
    exit: 10,
    module: 'alpha',
    reason: 'needs operator input',
    fail_count: 1,
    max_fails: 2,
  }, 'nova-channel', 'module', 'alpha', {
    sendGatewaySessionMessage: async () => {
      gatewayCalls += 1;
    },
    discord: async () => {
      discordCalls += 1;
      throw new Error('discord unavailable');
    },
  });

  const runLogPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', 'run-test', 'nova-injections.jsonl');
  const entries = fs.readFileSync(runLogPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const entry = entries.at(-1);

  assert.equal(gatewayCalls, 1);
  assert.equal(discordCalls, 1);
  assert.equal(entry.status, 'ok');
  assert.equal(entry.notification_status, 'failed');
  assert.equal(entry.notification_error, 'discord unavailable');
});
