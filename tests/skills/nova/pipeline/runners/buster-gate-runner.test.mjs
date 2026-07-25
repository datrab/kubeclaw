import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { gateActiveSessionPath } from '../../../../../skills/nova/pipeline/core/paths.ts';
import { runBusterGateEvaluation } from '../../../../../skills/nova/pipeline/runners/buster-gate-runner.ts';
import { buildBusterGateSpawnOptions } from '../../../../../skills/nova/pipeline/runners/buster-gate-task.ts';

import { makeGateTestConfig } from './gate-test-fixtures.mjs';

const makeConfig = () => makeGateTestConfig('buster-gate-runner-', { modulesUnderSwarm: true });

function gateProgress(gateId, overrides = {}) {
  return { gates: { [gateId]: { type: 'buster', title: 'Quality Gate', ...overrides } } };
}

function passingGateCompletion({ completionIdentity }) {
  return {
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
  };
}

function gateRunnerDeps(overrides = {}) {
  return {
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
    getTrackedAgent: () => ({ sessionKey: 'session-test', gatewayLabel: 'gateway-test', runtime: 'redis', model: 'test-model' }),
    waitBusterGateCompletionEvidence: passingGateCompletion,
    killAgent: async () => false,
    ...overrides,
  };
}

test('buster gate completion clears active session when killAgent does not kill a process', async () => {
  const config = makeConfig();
  const gateId = 'quality';
  const progress = gateProgress(gateId);
  let killCalls = 0;

  const result = await runBusterGateEvaluation(config, progress, gateId, {
    skipStartedTelemetry: true,
    deps: gateRunnerDeps({
      killAgent: async () => {
        killCalls++;
        return false;
      },
    }),
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
  const progress = gateProgress(gateId);
  let spawnCalls = 0;

  const result = await runBusterGateEvaluation(config, progress, gateId, {
    skipStartedTelemetry: true,
    deps: gateRunnerDeps({
      headHash: () => '',
      spawnAgent: async () => { spawnCalls++; },
      getTrackedAgent: () => null,
      waitBusterGateCompletionEvidence: async () => ({ ok: false }),
    }),
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
  const progress = gateProgress(gateId, { title: 'Final Buster', on_fail: 'fix_and_retest', max_fix_cycles: 0 });
  let spawnCalls = 0;

  const result = await runBusterGateEvaluation(config, progress, gateId, {
    skipStartedTelemetry: true,
    deps: gateRunnerDeps({
      readGateInstructions: () => 'run final buster',
      acpLabel: () => 'buster-final-buster',
      spawnAgent: async () => { spawnCalls++; },
    }),
  });

  assert.equal(spawnCalls, 1);
  assert.equal(result.nextAction, 'pass');
});
