import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { gateActiveSessionPath } from '../../../../../skills/nova/pipeline/core/paths.ts';
import { runBusterGateEvaluation } from '../../../../../skills/nova/pipeline/runners/buster-gate-runner.ts';
import { buildBusterGateSpawnOptions } from '../../../../../skills/nova/pipeline/runners/buster-gate-task.ts';

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
    pipeline_defaults: {
      timeout_minutes: 1,
      max_fails: 0,
      auto_retry_threshold: 0,
      agent_startup_retry_budget: 0,
      session_nudge_threshold: 0,
    },
    rate_limit: { max_pauses_per_module: 0, cooldown_hours: 0, cooldown_buffer_ms: 0 },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
      gate_active_session: { stale_ms: 1, timeout_ms: 1 },
    },
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
          status: 'PASS',
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

test('buster gate spawn options require canonical commit identity', () => {
  assert.throws(
    () => buildBusterGateSpawnOptions({ type: 'buster' }, {
      runId: 'run-test',
      attempt: 1,
      dispatchId: 'dispatch-test',
      commitHash: '',
    }),
    /require commitHash/,
  );

  const options = buildBusterGateSpawnOptions({ type: 'buster' }, {
    runId: 'run-test',
    attempt: 1,
    dispatchId: 'dispatch-test',
    commitHash: 'abcdef1234567890',
  });

  assert.equal(options.commit_hash, 'abcdef1234567890');
});

test('buster gate runner does not dispatch without current HEAD commit hash', async () => {
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
  let spawnCalls = 0;

  const result = await runBusterGateEvaluation(config, progress, gateId, {
    skipStartedTelemetry: true,
    deps: {
      resolvePolicy: () => ({ model: 'test-model', model_source: 'test' }),
      logEffectivePolicy: () => {},
      validateBusterConfig: () => {},
      headHash: () => '',
      async discord() {},
      archiveGateOutputIfPresent: () => null,
      readBusterGateCompletion: () => ({ isPass: false, output: { exists: false } }),
      sleep: async () => {},
      archiveModuleCompletions: async () => ({ archived: 0 }),
      readGateInstructions: () => 'run the gate checks',
      buildBusterGatePrompt: () => ({ prompt: 'buster prompt' }),
      acpLabel: () => 'buster-quality',
      spawnAgent: async () => { spawnCalls++; },
      getTrackedAgent: () => null,
      waitBusterGateCompletionEvidence: async () => ({ ok: false }),
      killAgent: async () => false,
    },
  });

  assert.equal(spawnCalls, 0);
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.typed.gate.outcomeClass, 'needs_nova');
  assert.equal(result.diagnostics.metadata.failure_class, 'commit_hash_missing');
  assert.match(result.diagnostics.summary || '', /commit_hash/i);
});

test('buster gate still dispatches first attempt when fix loop has zero cycles', async () => {
  const config = makeConfig();
  const gateId = 'final-buster';
  const progress = {
    gates: {
      [gateId]: {
        type: 'buster',
        title: 'Final Buster',
        on_fail: 'fix_and_retest',
        max_fix_cycles: 0,
      },
    },
  };
  let spawnCalls = 0;

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
      readGateInstructions: () => 'run final buster',
      buildBusterGatePrompt: () => ({ prompt: 'buster prompt' }),
      acpLabel: () => 'buster-final-buster',
      spawnAgent: async () => { spawnCalls++; },
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
          status: 'PASS',
          _source: 'redis',
          run_id: completionIdentity.runId,
          attempt: completionIdentity.attempt,
          dispatch_id: completionIdentity.dispatchId,
          gateway_label: completionIdentity.gateway_label,
          session_key: completionIdentity.sessionKey,
        },
      }),
      killAgent: async () => false,
    },
  });

  assert.equal(spawnCalls, 1);
  assert.equal(result.nextAction, 'pass');
});
