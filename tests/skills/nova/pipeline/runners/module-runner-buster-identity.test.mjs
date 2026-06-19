import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { shouldApplyRedisCompletionToStatus } from '../../../../../skills/nova/pipeline/services/completion-adjudicator.ts';
import { runModuleBusterPhase } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase.ts';
import { resolveExpectedCompletionSessionKey } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts';
import { handleBusterFailOrBlockedStatus } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts';
import { handleFailedPollResult } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts';

function busterWorkerRecord() {
  return {
    enabled: true,
    manifest: {
      moduleId: 'builtin.worker.module_buster',
      kind: 'worker',
      hookFamily: 'worker.execute',
      stageIds: ['worker:module_buster'],
      capabilities: ['dispatch.worker_runtime'],
      sourceType: 'builtin',
      trustTier: 'trusted',
    },
    implementation: {
      execute: async (_input, ctx) => ctx.workerRuntime.dispatch(),
    },
    config: {},
    resolvedTrustTier: 'trusted',
  };
}

function configWithBusterWorker() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-buster-identity-proof-'));
  const modulesDir = path.join(root, 'modules');
  fs.mkdirSync(path.join(modulesDir, 'module-a'), { recursive: true });
  return {
    project: 'module-buster-identity-proof',
    _runId: 'run-identity-proof',
    _runStats: createRunStats(),
    repo_root: root,
    buster: { max_crash_retries: 1 },
    paths: {
      modules_dir: modulesDir,
      swarm_dir: root,
    },
    pluginRegistry: {
      enabled: true,
      stageOwners: {
        'worker.execute': {
          'worker:module_buster': busterWorkerRecord(),
        },
      },
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('Buster Redis completion adjudication rejects mismatched Redis session key', () => {
  const status = {
    status: STATUS.TESTING,
    session_key: 'active-session',
  };
  const completionIdentity = {
    runId: 'run-1',
    attempt: 1,
    dispatchId: 'dispatch-1',
  };
  const redisEntry = {
    status: STATUS.PASS,
    run_id: 'run-1',
    attempt: 1,
    dispatch_id: 'dispatch-1',
    session_key: 'stale-session',
  };

  const expectedSessionKey = resolveExpectedCompletionSessionKey(
    status,
    completionIdentity,
    'worker-session',
  );
  const adjudication = shouldApplyRedisCompletionToStatus({
    moduleId: 'module-a',
    expectedStatuses: [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED],
    expectedIdentity: {
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      session_key: expectedSessionKey,
    },
    redisEntry,
    status,
  });

  assert.equal(expectedSessionKey, 'active-session');
  assert.equal(adjudication.shouldApply, false);
  assert.deepEqual(
    adjudication.adjudication.authority_policy.active_dispatch.optional_mismatched_fields,
    ['session_key'],
  );
});

test('Buster output_file identity mismatch blocks without module retry', async () => {
  let savedTransition = null;
  let discordCalls = 0;
  const result = await handleBusterFailOrBlockedStatus({
    config: {
      project: 'module-buster-identity-test',
      _runId: 'run-1',
      paths: { swarm_dir: '/tmp/module-buster-identity-test/.swarm' },
      _runStats: {},
    },
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status: {
      status: STATUS.FAIL,
      current_phase: 'buster',
      fail_count: 0,
      completion_summary: 'Buster output_file identity mismatch: attempt, dispatch_id, completion_key',
    },
    deps: {
      saveStatus: (_config, _dir, _previous, nextStatus) => {
        savedTransition = nextStatus;
      },
      discord: async () => {
        discordCalls += 1;
      },
    },
    redisEntry: {
      status: STATUS.FAIL,
      run_id: 'run-1',
      attempt: 1,
      dispatch_id: 'dispatch-1',
      source: 'output_file',
      reason: 'output_file_identity_mismatch',
      summary: 'Buster output_file identity mismatch: attempt, dispatch_id, completion_key',
    },
    failureClass: 'output_file_identity_mismatch',
    busterModel: 'buster-model',
    completionIdentity: {
      runId: 'run-1',
      attempt: 1,
      dispatchId: 'dispatch-1',
      gateway_label: 'gateway-1',
    },
    completionSessionKey: 'session-1',
    busterAttempt: 1,
    maxBusterCrashRetries: 1,
    isLastBusterAttempt: false,
    handleModuleFail: async () => {
      throw new Error('output_file identity mismatch must not enter Forge retry policy');
    },
    buildRetryResult: () => {
      throw new Error('output_file identity mismatch must not build retry result');
    },
    recalledMemoryIds: [],
  });

  assert.equal(result.retry, undefined);
  assert.equal(result.terminal.retry, false);
  assert.equal(result.terminal.result.nextAction, 'halt');
  assert.equal(result.terminal.result.outcome, 'blocked');
  assert.equal(result.terminal.result.issueType, 'environment');
  assert.equal(result.terminal.result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.equal(result.terminal.result.diagnostics.metadata.forge_preserved, true);
  assert.equal(savedTransition.status.status, STATUS.BLOCKED);
  assert.equal(savedTransition.status.blockedReason, 'output_file_identity_mismatch');
  assert.equal(discordCalls, 1);
});

test('Buster output_file identity mismatch blocks without Buster crash retry', async () => {
  let savedTransition = null;
  let discordCalls = 0;
  const result = await handleFailedPollResult({
    config: {
      project: 'module-buster-identity-test',
      _runId: 'run-1',
      rate_limit: { max_pauses_per_module: 0 },
      paths: { swarm_dir: '/tmp/module-buster-identity-test/.swarm' },
      _runStats: {},
    },
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status: {
      status: STATUS.TESTING,
      current_phase: 'buster',
      fail_count: 0,
      completion_summary: 'Buster output_file identity mismatch: attempt, dispatch_id, completion_key',
    },
    timeout: 1,
    deps: {
      saveStatus: (_config, _dir, _previous, nextStatus) => {
        savedTransition = nextStatus;
      },
      discord: async () => {
        discordCalls += 1;
      },
    },
    redisEntry: null,
    busterWorkerControlResult: {
      diagnostics: {
        metadata: {
          reason: 'output_file_identity_mismatch',
          status_message: 'Buster output_file identity mismatch: attempt, dispatch_id, completion_key',
        },
      },
    },
    busterSessionKey: 'session-1',
    completionIdentity: {
      runId: 'run-1',
      attempt: 1,
      dispatchId: 'dispatch-1',
      gateway_label: 'gateway-1',
    },
    busterModel: 'buster-model',
    busterAttempt: 1,
    maxBusterCrashRetries: 1,
    isLastBusterAttempt: false,
  });

  assert.equal(result.retry, undefined);
  assert.equal(result.terminal.retry, false);
  assert.equal(result.terminal.result.nextAction, 'halt');
  assert.equal(result.terminal.result.outcome, 'blocked');
  assert.equal(result.terminal.result.issueType, 'environment');
  assert.equal(result.terminal.result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.equal(result.terminal.result.diagnostics.metadata.forge_preserved, true);
  assert.equal(savedTransition.status.status, STATUS.BLOCKED);
  assert.equal(savedTransition.status.blockedReason, 'output_file_identity_mismatch');
  assert.equal(discordCalls, 1);
});

test('module Buster phase treats Redis output_file identity mismatch as infra without Forge retry', async () => {
  const config = configWithBusterWorker();
  const dispatchId = 'buster-module-module-a-1781879465321-1';
  const sessionKey = 'agent:main:subagent:e1414386-cafc-4d85-bfc3-09f1c10e4bfa';
  const mismatchSummary = 'Buster output_file identity mismatch: run_id, dispatch_id, completion_key';
  let savedStatus = {
    status: STATUS.READY_FOR_TESTING,
    current_phase: null,
    fail_count: 0,
    history: [],
    cost: {},
  };
  let handleModuleFailCalls = 0;
  let buildRetryResultCalls = 0;

  const deps = {
    resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
    logEffectivePolicy: () => {},
    buildBusterModulePrompt: () => ({ prompt: 'buster prompt' }),
    savePrompt: () => {},
    validateBusterConfig: () => {},
    setShutdownContext: () => {},
    clearShutdownContext: () => {},
    nowMs: () => 1781879465321,
    discord: async () => {},
    archiveModuleCompletions: async () => ({ failed: false }),
    spawnAgent: async () => ({
      dispatch_id: dispatchId,
      run_id: 'run-identity-proof',
      session_key: sessionKey,
      gateway_label: dispatchId,
      stream_log_path: '/tmp/buster-proof.log',
    }),
    pollDualWithRateLimitRecovery: async () => ({
      ok: false,
      status: {
        status: STATUS.FAIL,
        _redis_entry: {
          status: STATUS.FAIL,
          source: 'buster-pipeline',
          reason: 'output_file_identity_mismatch',
          summary: mismatchSummary,
          run_id: 'run-identity-proof',
          attempt: '1',
          dispatch_id: dispatchId,
          gateway_label: dispatchId,
          session_key: sessionKey,
          completion_key: `run-identity-proof:1:${dispatchId}`,
        },
      },
    }),
    killAgent: async () => {},
    saveStreamLog: () => {},
    saveStatus: (_config, _dir, previousOrStatus, transition = null) => {
      savedStatus = clone(transition?.status || previousOrStatus);
    },
    loadStatus: () => clone(savedStatus),
  };

  const result = await runModuleBusterPhase({
    config,
    progress: {},
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status: savedStatus,
    timeout: 1,
    maxFails: 2,
    deps,
    recalledMemoryIds: [],
    handleModuleFail: async () => {
      handleModuleFailCalls += 1;
      throw new Error('output_file identity mismatch must not enter Forge retry policy');
    },
    buildRetryResult: () => {
      buildRetryResultCalls += 1;
      throw new Error('output_file identity mismatch must not build retry result');
    },
  });

  assert.equal(result.retry, false);
  assert.equal(result.result.outcome, 'blocked');
  assert.equal(result.result.nextAction, 'halt');
  assert.equal(result.result.issueType, 'environment');
  assert.equal(result.result.diagnostics.summary, 'Buster output_file identity mismatch — infrastructure issue (not sent to Forge)');
  assert.equal(result.result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.equal(result.result.diagnostics.metadata.forge_preserved, true);
  assert.equal(savedStatus.status, STATUS.BLOCKED);
  assert.equal(savedStatus.fail_count, 0);
  assert.equal(savedStatus.blockedReason, 'output_file_identity_mismatch');
  assert.equal(handleModuleFailCalls, 0);
  assert.equal(buildRetryResultCalls, 0);
});

test('module Buster phase treats Redis missing output_file as infra without Forge retry', async () => {
  const config = configWithBusterWorker();
  const dispatchId = 'buster-module-module-a-1781884965455-1';
  const sessionKey = 'agent:main:subagent:9f044c9e-7675-4751-a3b9-373702f8dea8';
  const missingSummary = 'output_file missing: /tmp/module-a/.swarm/modules/01-foundation/buster-output.json';
  let savedStatus = {
    status: STATUS.READY_FOR_TESTING,
    current_phase: null,
    fail_count: 0,
    history: [],
    cost: {},
  };
  let handleModuleFailCalls = 0;
  let buildRetryResultCalls = 0;

  const deps = {
    resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
    logEffectivePolicy: () => {},
    buildBusterModulePrompt: () => ({ prompt: 'buster prompt' }),
    savePrompt: () => {},
    validateBusterConfig: () => {},
    setShutdownContext: () => {},
    clearShutdownContext: () => {},
    nowMs: () => 1781884965455,
    discord: async () => {},
    archiveModuleCompletions: async () => ({ failed: false }),
    spawnAgent: async () => ({
      dispatch_id: dispatchId,
      run_id: 'run-identity-proof',
      session_key: sessionKey,
      gateway_label: dispatchId,
      stream_log_path: '/tmp/buster-proof.log',
    }),
    pollDualWithRateLimitRecovery: async () => ({
      ok: false,
      status: {
        status: STATUS.FAIL,
        _redis_entry: {
          status: STATUS.FAIL,
          source: 'buster-pipeline',
          reason: 'output_file_missing',
          summary: missingSummary,
          run_id: 'run-identity-proof',
          attempt: '1',
          dispatch_id: dispatchId,
          gateway_label: dispatchId,
          session_key: sessionKey,
          completion_key: `run-identity-proof:1:${dispatchId}`,
        },
      },
    }),
    killAgent: async () => {},
    saveStreamLog: () => {},
    saveStatus: (_config, _dir, previousOrStatus, transition = null) => {
      savedStatus = clone(transition?.status || previousOrStatus);
    },
    loadStatus: () => clone(savedStatus),
  };

  const result = await runModuleBusterPhase({
    config,
    progress: {},
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status: savedStatus,
    timeout: 1,
    maxFails: 2,
    deps,
    recalledMemoryIds: [],
    handleModuleFail: async () => {
      handleModuleFailCalls += 1;
      throw new Error('missing Buster output_file must not enter Forge retry policy');
    },
    buildRetryResult: () => {
      buildRetryResultCalls += 1;
      throw new Error('missing Buster output_file must not build retry result');
    },
  });

  assert.equal(result.retry, false);
  assert.equal(result.result.outcome, 'blocked');
  assert.equal(result.result.nextAction, 'halt');
  assert.equal(result.result.issueType, 'environment');
  assert.equal(result.result.diagnostics.summary, 'Buster output_file missing — infrastructure issue (not sent to Forge)');
  assert.equal(result.result.diagnostics.metadata.failure_class, 'output_file_missing');
  assert.equal(result.result.diagnostics.metadata.forge_preserved, true);
  assert.equal(savedStatus.status, STATUS.BLOCKED);
  assert.equal(savedStatus.fail_count, 0);
  assert.equal(savedStatus.blockedReason, 'output_file_missing');
  assert.equal(handleModuleFailCalls, 0);
  assert.equal(buildRetryResultCalls, 0);
});
