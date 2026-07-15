import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { buildModuleForgeWorkerControlResult } from '../../../../../skills/nova/pipeline/agents/module-worker-control-results.ts';
import { executeBusterWorkerAttempt } from '../../../../../skills/nova/pipeline/runners/module-runner-buster-worker.ts';
import { runModuleForgePhase } from '../../../../../skills/nova/pipeline/runners/module-runner-forge.ts';
import { resolveExpectedCompletionSessionKey } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts';
import { getModuleRunnerDeps } from '../../../../../skills/nova/pipeline/runners/module-runner/attempt.ts';

function workerRecord(moduleId, stageId) {
  return {
    enabled: true,
    manifest: {
      moduleId,
      kind: 'worker',
      hookFamily: 'worker.execute',
      stageIds: [stageId],
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

function configWithWorker(stageId, moduleId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-runner-worker-lifecycle-'));
  const modulesDir = path.join(root, 'modules');
  fs.mkdirSync(path.join(modulesDir, 'module-a'), { recursive: true });
  return {
    project: 'module-runner-worker-lifecycle-test',
    _runId: 'run-worker-lifecycle',
    _runStats: createRunStats(),
    agent_startup_retry_budget: 2,
    pipeline_defaults: {
      timeout_minutes: 30,
      max_fails: 3,
      auto_retry_threshold: 2,
      agent_startup_retry_budget: 2,
      session_nudge_threshold: 0.75,
    },
    agents: {
      forge: {
        acp_agent_id: 'forge-harness',
      },
    },
    repo_root: root,
    paths: {
      modules_dir: modulesDir,
      swarm_dir: root,
    },
    pluginRegistry: {
      enabled: true,
      stageOwners: {
        'worker.execute': {
          [stageId]: workerRecord(moduleId, stageId),
        },
      },
    },
  };
}

function statusFixture(overrides = {}) {
  return {
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
    history: [],
    cost: {},
    ...overrides,
  };
}

test('forge worker dispatch-then-throw clears persisted active_agent and preserves terminal correlation', async () => {
  const config = configWithWorker('worker:module_forge', 'builtin.worker.module_forge');
  let savedStatus = statusFixture();
  const deps = {
    runPreflightValidation: () => ({ passed: true }),
    resolvePolicy: () => ({ model: 'forge-model', thinking: null, model_source: 'test' }),
    logEffectivePolicy: () => {},
    buildForgePrompt: () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
    savePrompt: () => {},
    saveStatus: (_config, _dir, nextStatus) => {
      savedStatus = JSON.parse(JSON.stringify(nextStatus));
    },
    loadStatus: () => JSON.parse(JSON.stringify(savedStatus)),
    applyModuleCompletion: (_config, _dir, nextStatus, completion) => {
      nextStatus.status = completion.phase === 'forge' && completion.status === 'PASS'
        ? STATUS.READY_FOR_TESTING
        : completion.status;
      nextStatus.current_phase = null;
      nextStatus.completion_summary = completion.summary;
      savedStatus = JSON.parse(JSON.stringify(nextStatus));
      return { status: nextStatus };
    },
    setShutdownContext: () => {},
    invalidateHeadHash: () => {},
    headHash: () => 'head-before',
    acpLabel: () => 'forge-module-a',
    discord: async () => {},
    runModuleForgeWorker: async ({ workerInput }) => {
      await workerInput.onDispatched({
        session_key: 'forge-session',
        gateway_label: 'forge-gateway',
        dispatch_id: 'forge-dispatch',
        run_id: 'run-worker-lifecycle',
      });
      throw new Error('forge worker crashed after dispatch');
    },
  };

  const result = await runModuleForgePhase({
    config,
    progress: {},
    moduleId: 'module-a',
    mod: { title: 'Module A', stages: ['forge'] },
    dir: 'module-a',
    status: savedStatus,
    maxFails: 1,
    timeout: 1,
    novaPrompt: null,
    stages: ['forge'],
    deps,
  });

  assert.equal(result.terminal.result.outcome, 'error');
  assert.equal(result.terminal.result.correlation.session_key, 'forge-session');
  assert.equal(result.terminal.result.correlation.gateway_label, 'forge-gateway');
  assert.equal(savedStatus.active_agent, null);
  assert.equal(result.status.active_agent, null);
});

test('module runner default deps expose typed agent health for startup rate-limit cooldown', () => {
  const deps = getModuleRunnerDeps(configWithWorker('worker:module_forge', 'builtin.worker.module_forge'));

  assert.equal(typeof deps.verifyAgentHealth, 'function');
  assert.equal(typeof deps.verifyAgentAlive, 'function');
  assert.notEqual(deps.verifyAgentHealth, deps.verifyAgentAlive);
});

test('module runner default deps expose Forge worker polling authority', () => {
  const deps = getModuleRunnerDeps(configWithWorker('worker:module_forge', 'builtin.worker.module_forge'));

  assert.equal(typeof deps.pollForgeCompletionWithRateLimitRecovery, 'function');
});

test('forge startup retries use dedicated swarm config budget before succeeding', async () => {
  const config = configWithWorker('worker:module_forge', 'builtin.worker.module_forge');
  let savedStatus = statusFixture();
  let workerCalls = 0;
  const deps = {
    runPreflightValidation: () => ({ passed: true }),
    resolvePolicy: () => ({ model: 'forge-model', thinking: null, model_source: 'test', thinking_source: 'test' }),
    logEffectivePolicy: () => {},
    buildForgePrompt: () => ({ prompt: 'forge prompt', recalledMemoryIds: [] }),
    savePrompt: () => {},
    saveStatus: (_config, _dir, nextStatus) => {
      savedStatus = JSON.parse(JSON.stringify(nextStatus));
    },
    loadStatus: () => JSON.parse(JSON.stringify(savedStatus)),
    applyModuleCompletion: (_config, _dir, nextStatus, completion) => {
      nextStatus.status = completion.phase === 'forge' && completion.status === 'PASS'
        ? STATUS.READY_FOR_TESTING
        : completion.status;
      nextStatus.current_phase = null;
      nextStatus.completion_summary = completion.summary;
      savedStatus = JSON.parse(JSON.stringify(nextStatus));
      return { status: nextStatus };
    },
    setShutdownContext: () => {},
    invalidateHeadHash: () => {},
    headHash: () => 'head-before',
    acpLabel: () => 'forge-module-a',
    discord: async () => {},
    runModuleForgeWorker: async (ctx) => {
      workerCalls += 1;
      if (workerCalls < 3) {
        return buildModuleForgeWorkerControlResult(config, ctx.workerInput, {
          nextAction: 'retry',
          issueType: 'environment',
          outcomeClass: 'retrying',
          reason: 'healthcheck_failed',
          error: 'agent not running after spawn',
        });
      }
      return buildModuleForgeWorkerControlResult(config, ctx.workerInput, {
        nextAction: 'pass',
        outcomeClass: 'passed',
        reason: 'passed',
        gatewayLabel: 'forge-gateway-module-a',
        sessionKey: 'forge-session-module-a',
        finalStatus: {
          status: STATUS.READY_FOR_TESTING,
          summary: 'Forge completion evidence ready',
        },
      });
    },
  };

  const result = await runModuleForgePhase({
    config,
    progress: {},
    moduleId: 'module-a',
    mod: { title: 'Module A', stages: ['forge', 'buster'] },
    dir: 'module-a',
    status: savedStatus,
    maxFails: 1,
    timeout: 1,
    novaPrompt: null,
    stages: ['forge', 'buster'],
    deps,
  });

  assert.equal(workerCalls, 3);
  assert.equal(result.terminal, null);
  assert.equal(savedStatus.fail_count, 0);
  assert.equal(savedStatus.status, STATUS.READY_FOR_TESTING);
});

test('buster worker dispatch-then-throw clears persisted active_agent and preserves terminal correlation', async () => {
  const config = configWithWorker('worker:module_buster', 'builtin.worker.module_buster');
  let savedStatus = statusFixture({
    status: 'TESTING',
    current_phase: 'buster',
    session_key: 'stale-buster-session',
    dispatch_id: 'stale-buster-dispatch',
    gateway_label: 'stale-buster-gateway',
  });
  const completionIdentity = {
    runId: 'run-worker-lifecycle',
    attempt: 1,
    dispatchId: 'buster-dispatch-initial',
    gateway_label: null,
  };
  const deps = {
    saveStatus: (_config, _dir, nextStatus) => {
      savedStatus = JSON.parse(JSON.stringify(nextStatus));
    },
    loadStatus: () => JSON.parse(JSON.stringify(savedStatus)),
    runModuleBusterWorker: async ({ workerInput }) => {
      await workerInput.onDispatched({
        session_key: 'buster-session',
        gateway_label: 'buster-gateway',
        dispatch_id: 'buster-dispatch',
        run_id: 'run-worker-lifecycle',
      });
      throw new Error('buster worker crashed after dispatch');
    },
  };

  const result = await executeBusterWorkerAttempt({
    config,
    progress: {},
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status: savedStatus,
    timeout: 1,
    maxFails: 1,
    deps,
    busterPrompt: 'buster prompt',
    completionIdentity,
    busterModel: 'buster-model',
    maxBusterCrashRetries: 0,
    busterAttempt: 1,
  });

  assert.equal(result.terminal.result.outcome, 'error');
  assert.equal(result.terminal.result.correlation.dispatch_id, 'buster-dispatch');
  assert.equal(result.terminal.result.correlation.session_key, 'buster-session');
  assert.equal(result.terminal.result.correlation.gateway_label, 'buster-gateway');
  assert.equal(savedStatus.session_key, 'buster-session');
  assert.equal(savedStatus.dispatch_id, 'buster-dispatch');
  assert.equal(savedStatus.gateway_label, 'buster-gateway');
  assert.equal(resolveExpectedCompletionSessionKey(savedStatus, completionIdentity, 'buster-session'), 'buster-session');
  assert.equal(savedStatus.active_agent, null);
  assert.equal(result.status.active_agent, null);
});
