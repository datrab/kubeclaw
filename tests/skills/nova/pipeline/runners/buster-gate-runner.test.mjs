import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { gateActiveSessionPath } from '../../../../../skills/nova/pipeline/core/paths.ts';
import { runBusterGateEvaluation } from '../../../../../skills/nova/pipeline/runners/buster-gate-runner.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join('/home', 'buster-gate-runner-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    rate_limit: {
      max_pauses_per_module: 0,
    },
    default_timeout_minutes: 1,
    _runId: 'run-test',
    run_id: 'run-test',
    _runStats: createRunStats(),
  };
}

test('buster gate completion clears active session when killAgent does not kill a process', async () => {
  const config = makeConfig();
  const gateId = 'quality';
  const progress = {
    gates: {
      [gateId]: {
        type: 'buster',
        title: 'Quality Gate',
      },
    },
  };
  let killCalls = 0;

  const result = await runBusterGateEvaluation(config, progress, gateId, {
    skipStartedTelemetry: true,
    deps: {
      resolvePolicy: () => ({ model: 'test-model', model_source: 'test' }),
      logEffectivePolicy: () => {},
      validateBusterConfig: () => {},
      headHash: () => 'abc123',
      async discord() {},
      archiveGateOutputIfPresent: () => null,
      readBusterGateCompletion: () => ({ isPass: false, output: { exists: false } }),
      sleep: async () => {},
      archiveModuleCompletions: async () => ({ archived: 0 }),
      readGateInstructions: () => 'run the gate checks',
      buildBusterGatePrompt: () => ({ prompt: 'buster prompt' }),
      acpLabel: () => 'buster-quality',
      spawnAgent: async () => {},
      getTrackedAgent: () => ({
        sessionKey: 'session-test',
        gatewayLabel: 'gateway-test',
        runtime: 'redis',
        model: 'test-model',
      }),
      waitBusterGateCompletionEvidence: async ({ completionIdentity }) => ({
        ok: true,
        reason: 'target_reached',
        status: {
          _source: 'redis',
          run_id: completionIdentity.runId,
          attempt: completionIdentity.attempt,
          dispatch_id: completionIdentity.dispatchId,
          gateway_label: completionIdentity.gateway_label,
          session_key: completionIdentity.sessionKey,
        },
      }),
      killAgent: async () => {
        killCalls++;
        return false;
      },
    },
  });

  assert.equal(killCalls, 1);
  assert.equal(result.nextAction, 'pass');
  assert.equal(fs.existsSync(gateActiveSessionPath(config, gateId)), false);
});
