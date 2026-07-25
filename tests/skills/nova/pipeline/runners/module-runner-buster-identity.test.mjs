import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { buildModuleBusterWorkerControlResult } from '../../../../../skills/nova/pipeline/agents/module-worker-control-results.ts';
import { runModuleBusterWorker } from '../../../../../skills/nova/pipeline/agents/orchestration.ts';
import { shouldApplyRedisCompletionToStatus } from '../../../../../skills/nova/pipeline/services/completion-adjudicator.ts';
import {
  classifyPreTestFailure,
  extractPreTestFailReason,
  getFailedSuiteNames,
  getPassedSuiteNames,
} from '../../../../../skills/nova/pipeline/services/failures/classification.ts';
import { buildPreTestDiscordFields } from '../../../../../skills/nova/pipeline/services/failures/presentation.ts';
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
  tempRepos.add(root);
  const modulesDir = path.join(root, 'modules');
  fs.mkdirSync(path.join(modulesDir, 'module-a'), { recursive: true });
  return {
    project: 'module-buster-identity-proof',
    _runId: 'run-identity-proof',
    _runStats: createRunStats(),
    pipeline_defaults: {
      timeout_minutes: 30,
      max_fails: 3,
      auto_retry_threshold: 2,
      agent_startup_retry_budget: 2,
      session_nudge_threshold: 0.75,
    },
    repo_root: root,
    buster: {
      runtime: {
        suite_timeout_ms: 300000,
        max_crash_retries: 1,
      },
    },
    agents: {
      buster: { dispatch: 'acp', acp_agent_id: 'buster' },
    },
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

function applyModuleCompletionForTest(save) {
  return (_config, _dir, status, completion) => {
    const nextStatus = completion.status === STATUS.PASS
      ? STATUS.PASS
      : completion.status === STATUS.BLOCKED
        ? STATUS.BLOCKED
        : STATUS.FAIL;
    status.status = nextStatus;
    status.current_phase = null;
    status.phase_started_at = null;
    status.active_agent = null;
    status.completion_summary = completion.summary || status.completion_summary || null;
    if (nextStatus === STATUS.PASS) status.completed_at = completion.occurred_at || new Date().toISOString();
    const lifecycleMutation = {
      eventType: nextStatus === STATUS.PASS ? 'module_attempt.passed' : `module_attempt.${nextStatus.toLowerCase()}`,
    };
    save(clone(status), lifecycleMutation);
    return {
      status,
      lifecycleMutation,
    };
  };
}

function moduleTerminalForAssertion(result) {
  let current = result;
  while (current?.terminal || (current?.retry === undefined && current?.result && !current.result.outcome)) {
    current = current.terminal || current.result;
  }
  if (current?.retry !== undefined) return current;
  if (current?.outcome) return { retry: false, result: current };
  if (current?.result?.outcome) return { retry: false, result: current.result };
  return current;
}

function busterPhaseDeps(overrides = {}) {
  return {
    resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
    logEffectivePolicy: () => {},
    buildBusterModulePrompt: () => ({ prompt: 'buster prompt' }),
    savePrompt: () => {},
    validateBusterConfig: () => {},
    setShutdownContext: () => {},
    clearShutdownContext: () => {},
    discord: async () => {},
    archiveModuleCompletions: async () => ({ failed: false }),
    runModuleBusterWorker,
    verifyAgentHealth: async () => ({ ok: true }),
    verifyAgentAlive: async () => true,
    killAgent: async () => {},
    saveStreamLog: () => {},
    ...overrides,
  };
}

function runBusterPhaseScenario({ config, status, deps, handleModuleFail, buildRetryResult }) {
  return runModuleBusterPhase({
    config,
    progress: {},
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status,
    timeout: 1,
    maxFails: 2,
    deps,
    recalledMemoryIds: [],
    handleModuleFail,
    buildRetryResult,
  });
}

function pretestFailureScenario({ attempt, status, deps = {}, handleModuleFail, buildRetryResult }) {
  const dispatchId = `dispatch-${attempt}`;
  return handleBusterFailOrBlockedStatus({
    config: {
      project: 'module-buster-identity-test',
      _runId: 'run-1',
      paths: { swarm_dir: '/tmp/module-buster-identity-test/.swarm' },
      _runStats: {},
    },
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['build', 'unit', 'health'] },
    dir: 'module-a',
    status,
    deps: {
      getFailedSuiteNames,
      getPassedSuiteNames,
      extractPreTestFailReason,
      classifyPreTestFailure,
      buildPreTestDiscordFields,
      ...deps,
    },
    redisEntry: {
      status: STATUS.FAIL,
      run_id: 'run-1',
      attempt,
      dispatch_id: dispatchId,
      ...(attempt === 1 ? { gateway_label: 'gateway-1' } : {}),
      source: 'buster-pipeline',
      reason: 'NO_SUBAGENT — critical suite failure',
      summary: 'build: PASS | unit: FAIL | health: PASS',
      verdict: {
        suites: {
          build: { status: 'PASS' },
          unit: { status: 'FAIL', detail: '1 unit test(s) failed' },
          health: { status: 'PASS' },
        },
      },
    },
    failureClass: 'pretest_code',
    busterModel: 'buster-model',
    completionIdentity: {
      runId: 'run-1',
      attempt,
      dispatchId,
      gateway_label: `gateway-${attempt}`,
    },
    completionSessionKey: null,
    busterAttempt: attempt,
    maxBusterCrashRetries: 1,
    isLastBusterAttempt: false,
    handleModuleFail,
    buildRetryResult,
    recalledMemoryIds: [],
  });
}

function busterWorkerInput() {
  return {
    ids: { moduleId: 'module-a', runId: 'run-identity-proof', attempt: 1, dispatchId: 'dispatch-current' },
    executionContext: { moduleDir: 'module-a', timeoutMinutes: 1 },
    worker: {
      workerType: 'module_buster',
      backendConfig: { model: 'buster-model', runtimeKind: 'session' },
    },
  };
}

function busterWorkerDeps(overrides = {}) {
  return {
    archiveModuleCompletions: async () => ({ failed: false }),
    spawnAgent: async () => ({
      dispatch_id: 'dispatch-current',
      session_key: 'session-current',
      gateway_label: 'gateway-current',
      stream_log_path: '/tmp/session-current.jsonl',
    }),
    verifyAgentHealth: async () => ({ ok: true }),
    killAgent: async () => ({ ok: true }),
    saveStreamLog: async () => {},
    clearShutdownContext: () => {},
    ...overrides,
  };
}

async function runContractFailurePhase({ nowMs, dispatchId, sessionKey, reason, summary }) {
  const config = configWithBusterWorker();
  let savedStatus = {
    status: STATUS.READY_FOR_TESTING,
    current_phase: null,
    fail_count: 0,
    history: [],
    cost: {},
  };
  let forbiddenRetryCalls = 0;
  const deps = busterPhaseDeps({
    nowMs: () => nowMs,
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
          reason,
          summary,
          run_id: 'run-identity-proof',
          attempt: '1',
          dispatch_id: dispatchId,
          gateway_label: dispatchId,
          session_key: sessionKey,
          completion_key: `run-identity-proof:1:${dispatchId}`,
        },
      },
    }),
    ...statusPersistenceDeps(() => savedStatus, (nextStatus) => { savedStatus = nextStatus; }),
  });
  const forbidRetry = async () => {
    forbiddenRetryCalls += 1;
    throw new Error(`${reason} must not enter Forge retry policy`);
  };
  const result = await runBusterPhaseScenario({
    config,
    status: savedStatus,
    deps,
    handleModuleFail: forbidRetry,
    buildRetryResult: forbidRetry,
  });
  return { terminal: moduleTerminalForAssertion(result), savedStatus, forbiddenRetryCalls };
}

async function runRedisPassPhase({ includeFinalStatus, rejectDuplicatePass }) {
  const config = configWithBusterWorker();
  let savedStatus = {
    status: STATUS.READY_FOR_TESTING,
    current_phase: null,
    fail_count: 0,
    history: [],
    cost: {},
  };
  const savedTransitions = [];
  const recordTransition = (eventType, nextStatus) => {
    savedTransitions.push(eventType);
    if (rejectDuplicatePass && savedTransitions.filter((entry) => entry === 'module_attempt.passed').length > 1) {
      throw new Error('duplicate PASS lifecycle save');
    }
    savedStatus = clone(nextStatus);
  };
  const deps = busterPhaseDeps({
    nowMs: () => 1781884965455,
    runModuleBusterWorker: async ({ workerInput }) => {
      const dispatchId = 'buster-module-module-a-1781884965455-1';
      await workerInput.onDispatched({
        dispatch_id: dispatchId,
        run_id: 'run-identity-proof',
        session_key: dispatchId,
        gateway_label: dispatchId,
      });
      return buildModuleBusterWorkerControlResult(config, workerInput, {
        nextAction: 'pass',
        outcomeClass: 'passed',
        ...(includeFinalStatus ? { finalStatus: { status: STATUS.PASS, completion_summary: 'Deterministic suites passed' } } : {}),
        redisEntry: {
          status: STATUS.PASS,
          source: 'buster-pipeline',
          reason: 'deterministic_suites_passed',
          summary: 'Deterministic suites passed',
          run_id: 'run-identity-proof',
          attempt: 1,
          dispatch_id: dispatchId,
          session_key: dispatchId,
          gateway_label: dispatchId,
          completion_key: `run-identity-proof:1:${dispatchId}`,
        },
        dispatchId,
        sessionKey: dispatchId,
        gatewayLabel: dispatchId,
      });
    },
    saveStatus: (_config, _dir, previousOrStatus, transition = null) => {
      recordTransition(transition?.lifecycleMutation?.eventType || null, transition?.status || previousOrStatus);
    },
    applyModuleCompletion: applyModuleCompletionForTest((nextStatus, lifecycleMutation) => {
      recordTransition(lifecycleMutation.eventType, nextStatus);
    }),
    loadStatus: () => clone(savedStatus),
  });
  const forbidFailure = async () => { throw new Error('Redis PASS authority must not enter failure policy'); };
  const result = await runBusterPhaseScenario({
    config,
    status: savedStatus,
    deps,
    handleModuleFail: forbidFailure,
    buildRetryResult: forbidFailure,
  });
  return { result, savedStatus, savedTransitions };
}

function statusPersistenceDeps(readStatus, writeStatus) {
  return {
    saveStatus: (_config, _dir, previousOrStatus, transition = null) => {
      writeStatus(clone(transition?.status || previousOrStatus));
    },
    applyModuleCompletion: applyModuleCompletionForTest((nextStatus) => {
      writeStatus(nextStatus);
    }),
    loadStatus: () => clone(readStatus()),
  };
}

function completionIdentity(overrides = {}) {
  return {
    runId: 'run-1',
    attempt: 1,
    dispatchId: 'dispatch-1',
    gateway_label: 'gateway-1',
    sessionKey: 'session-1',
    ...overrides,
  };
}

function terminalFailureScenario({
  project = 'module-buster-identity-test',
  summary,
  failureClass,
  status = {},
  deps,
  redisEntry = {},
  identity = completionIdentity(),
}) {
  return handleBusterFailOrBlockedStatus({
    config: {
      project,
      _runId: 'run-1',
      paths: { swarm_dir: `/tmp/${project}/.swarm` },
      _runStats: {},
    },
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status: {
      status: STATUS.FAIL,
      current_phase: 'buster',
      fail_count: 0,
      completion_summary: summary,
      ...status,
    },
    deps,
    redisEntry: {
      status: STATUS.FAIL,
      run_id: 'run-1',
      attempt: 1,
      source: 'buster-pipeline',
      reason: failureClass,
      summary,
      ...redisEntry,
    },
    failureClass,
    busterModel: 'buster-model',
    completionIdentity: identity,
    completionSessionKey: identity.sessionKey ?? null,
    busterAttempt: identity.attempt,
    maxBusterCrashRetries: 1,
    isLastBusterAttempt: false,
    handleModuleFail: async () => { throw new Error(`${failureClass} must not enter Forge retry policy`); },
    buildRetryResult: () => { throw new Error(`${failureClass} must not build retry result`); },
    recalledMemoryIds: [],
  });
}

function captureTerminalDeps(onSave, onDiscord = () => {}) {
  return {
    applyModuleCompletion: applyModuleCompletionForTest((nextStatus) => onSave({ status: nextStatus })),
    saveStatus: (_config, _dir, _previous, nextStatus) => onSave(nextStatus),
    discord: async () => onDiscord(),
  };
}

function assertTerminalFailure(result, failureClass, outcome) {
  assert.equal(result.retry, undefined);
  assert.equal(result.terminal.retry, false);
  assert.equal(result.terminal.result.nextAction, 'halt');
  assert.equal(result.terminal.result.outcome, outcome);
  assert.equal(result.terminal.result.issueType, 'environment');
  assert.equal(result.terminal.result.diagnostics.metadata.failure_class, failureClass);
  assert.equal(result.terminal.result.diagnostics.metadata.forge_preserved, true);
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

  assert.equal(expectedSessionKey, 'worker-session');
  assert.equal(adjudication.shouldApply, false);
  assert.deepEqual(
    adjudication.adjudication.authority_policy.active_dispatch.optional_mismatched_fields,
    ['session_key'],
  );
});

test('Buster output_file identity mismatch fails completion contract without module retry', async () => {
  let savedTransition = null;
  let discordCalls = 0;
  const summary = 'Buster output_file identity mismatch: attempt, dispatch_id, completion_key';
  const result = await terminalFailureScenario({
    summary,
    failureClass: 'output_file_identity_mismatch',
    deps: captureTerminalDeps(
      (transition) => { savedTransition = transition; },
      () => { discordCalls += 1; },
    ),
    redisEntry: {
      dispatch_id: 'dispatch-1',
      gateway_label: 'gateway-1',
      session_key: 'session-1',
      source: 'output_file',
    },
  });

  assertTerminalFailure(result, 'output_file_identity_mismatch', 'error');
  assert.equal(savedTransition.status.status, STATUS.FAIL);
  assert.equal(discordCalls, 1);
});

test('Buster output_file identity mismatch uses active completion identity when Redis result omits gateway identity', async () => {
  let savedTransition = null;
  const summary = 'Buster output_file identity mismatch: run_id';
  const result = await terminalFailureScenario({
    summary,
    failureClass: 'output_file_identity_mismatch',
    status: {
      current_attempt: 1,
    },
    deps: captureTerminalDeps((transition) => { savedTransition = transition; }),
  });

  assert.equal(result.terminal.retry, false);
  assert.equal(result.terminal.result.nextAction, 'halt');
  assert.equal(result.terminal.result.outcome, 'error');
  assert.equal(result.terminal.result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.equal(result.terminal.result.diagnostics.metadata.identity_authority, 'completion_identity');
  assert.equal(result.terminal.result.correlation.dispatch_id, 'dispatch-1');
  assert.equal(result.terminal.result.correlation.gateway_label, 'gateway-1');
  assert.equal(result.terminal.result.correlation.session_key, 'session-1');
  assert.equal(savedTransition.status.status, STATUS.FAIL);
});

test('Buster explicit infra_error blocks module without Forge retry', async () => {
  let savedTransition = null;
  let discordCalls = 0;
  const summary = 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE: simulated Buster worker infrastructure failure';
  const result = await terminalFailureScenario({
    project: 'module-buster-infra-test',
    summary,
    failureClass: 'infra_error',
    status: {
      current_attempt: 1,
    },
    deps: captureTerminalDeps(
      (transition) => { savedTransition = transition; },
      () => { discordCalls += 1; },
    ),
    redisEntry: {
      dispatch_id: 'dispatch-1',
      gateway_label: 'gateway-1',
      session_key: 'session-1',
      failure_class: 'infra_error',
      reason: 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE',
    },
  });

  assertTerminalFailure(result, 'infra_error', 'blocked');
  assert.equal(result.terminal.result.terminal.status, 'blocked');
  assert.equal(result.terminal.result.terminal.decision.reasonCode, 'infra_error');
  assert.equal(savedTransition.status.status, STATUS.BLOCKED);
  assert.equal(savedTransition.status.completion_summary.includes('Forge cannot fix this'), true);
  assert.equal(discordCalls, 1);
});

test('Buster deterministic pre-test code failure retries Forge without session key', async () => {
  let handleFailCall = null;
  const result = await pretestFailureScenario({
    attempt: 1,
    status: {
      status: STATUS.FAIL,
      current_phase: 'buster',
      current_attempt: 1,
      fail_count: 0,
    },
    handleModuleFail: async (status, phase, reason, opts) => {
      handleFailCall = { status: clone(status), phase, reason, opts };
      return {
        _retry: true,
        status: {
          ...status,
          status: STATUS.READY_FOR_TESTING,
        },
      };
    },
    buildRetryResult: (failResult) => ({
      retry: true,
      status: failResult.status,
    }),
  });

  assert.equal(result.terminal.retry, true);
  assert.equal(result.terminal.status.status, STATUS.READY_FOR_TESTING);
  assert.equal(handleFailCall.phase, 'buster');
  assert.match(handleFailCall.reason, /^\[buster\/pre-test\] NO_SUBAGENT/);
  assert.equal(handleFailCall.opts.dispatch_id, 'dispatch-1');
  assert.equal(handleFailCall.opts.gateway_label, 'gateway-1');
  assert.equal(handleFailCall.opts.session_key, null);
});

test('Repeated Buster pre-test code failure blocks module without result gateway label', async () => {
  let savedCompletion = null;
  let discordCalls = 0;
  const result = await pretestFailureScenario({
    attempt: 2,
    status: {
      status: STATUS.FAIL,
      current_phase: 'buster',
      current_attempt: 2,
      fail_count: 1,
      fail_summaries: [
        { summary: '[buster/pre-test] NO_SUBAGENT — critical suite failure (failed suites: unit)' },
      ],
    },
    deps: {
      applyModuleCompletion: (_config, _dir, _status, completion) => {
        savedCompletion = clone(completion);
      },
      discord: async () => {
        discordCalls += 1;
      },
    },
    handleModuleFail: async () => {
      throw new Error('repeated pre-test failure must not enter Forge retry policy');
    },
    buildRetryResult: () => {
      throw new Error('repeated pre-test failure must not build retry result');
    },
  });

  assert.equal(discordCalls, 1);
  assert.equal(savedCompletion.status, STATUS.BLOCKED);
  assert.equal(savedCompletion.reason_code, 'test_failure');
  assert.equal(savedCompletion.observed.gateway_label, 'gateway-2');
  assert.equal(savedCompletion.metadata.failure_class, 'test_failure');
  assert.equal(result.terminal.retry, false);
  assert.equal(result.terminal.result.stepType, 'module');
  assert.equal(result.terminal.result.stepId, 'module-a');
  assert.equal(result.terminal.result.outcome, 'blocked');
  assert.equal(result.terminal.result.terminal.status, 'blocked');
  assert.equal(result.terminal.result.terminal.decision.reasonCode, 'test_failure');
  assert.equal(result.terminal.result.diagnostics.metadata.failure_class, 'test_failure');
});

test('Buster output_file identity mismatch fails completion contract without Buster crash retry', async () => {
  let savedTransition = null;
  let discordCalls = 0;
  const result = await handleFailedPollResult({
    config: {
      project: 'module-buster-identity-test',
      _runId: 'run-1',
      rate_limit: { max_pauses_per_module: 0, cooldown_hours: 0, cooldown_buffer_ms: 0 },
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
      applyModuleCompletion: applyModuleCompletionForTest((nextStatus) => {
        savedTransition = { status: nextStatus };
      }),
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
      sessionKey: 'session-1',
    },
    busterModel: 'buster-model',
    busterAttempt: 1,
    maxBusterCrashRetries: 1,
    isLastBusterAttempt: false,
  });

  assert.equal(result.retry, undefined);
  assert.equal(result.terminal.retry, false);
  assert.equal(result.terminal.result.nextAction, 'halt');
  assert.equal(result.terminal.result.outcome, 'error');
  assert.equal(result.terminal.result.issueType, 'environment');
  assert.equal(result.terminal.result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.equal(result.terminal.result.diagnostics.metadata.forge_preserved, true);
  assert.equal(savedTransition.status.status, STATUS.FAIL);
  assert.equal(discordCalls, 1);
});

test('Buster crash retry preserves forge commit identity from full module status', async () => {
  let savedStatus = null;
  let discordCalls = 0;
  const result = await handleFailedPollResult({
    config: {
      project: 'module-buster-identity-test',
      _runId: 'run-1',
      rate_limit: { max_pauses_per_module: 0, cooldown_hours: 0, cooldown_buffer_ms: 0 },
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
      forge_commit_hash: 'abc123def456',
      active_agent: {
        dispatch_id: 'dispatch-1',
        gateway_label: 'gateway-1',
        session_key: 'session-1',
      },
      history: [],
    },
    timeout: 5,
    deps: {
      saveStatus: (_config, _dir, _previous, transition) => {
        savedStatus = clone(transition.status);
      },
      discord: async () => {
        discordCalls += 1;
      },
    },
    redisEntry: null,
    busterWorkerControlResult: {
      diagnostics: {
        metadata: {
          reason: 'timeout',
          final_status: {
            status: STATUS.TESTING,
            current_phase: 'buster',
            fail_count: 0,
            completion_summary: 'Buster timed out',
          },
        },
      },
    },
    busterSessionKey: 'session-1',
    completionIdentity: {
      runId: 'run-1',
      attempt: 1,
      dispatchId: 'dispatch-1',
      gateway_label: 'gateway-1',
      sessionKey: 'session-1',
    },
    busterModel: 'buster-model',
    busterAttempt: 1,
    maxBusterCrashRetries: 1,
    isLastBusterAttempt: false,
  });

  assert.equal(result.retry, true);
  assert.equal(result.status.status, STATUS.READY_FOR_TESTING);
  assert.equal(result.status.forge_commit_hash, 'abc123def456');
  assert.equal(savedStatus.status, STATUS.READY_FOR_TESTING);
  assert.equal(savedStatus.forge_commit_hash, 'abc123def456');
  assert.equal(discordCalls, 1);
});

test('Buster timeout exhaustion emits typed module timeout terminal instead of generic block', async () => {
  let savedStatus = null;
  const result = await handleFailedPollResult({
    config: {
      project: 'module-buster-timeout-test',
      _runId: 'run-1',
      rate_limit: { max_pauses_per_module: 0, cooldown_hours: 0, cooldown_buffer_ms: 0 },
      paths: { swarm_dir: '/tmp/module-buster-timeout-test/.swarm' },
      _runStats: {},
    },
    moduleId: 'module-a',
    mod: { title: 'Module A', test_suites: ['unit'] },
    dir: 'module-a',
    status: {
      status: STATUS.TESTING,
      current_phase: 'buster',
      current_attempt: 1,
      fail_count: 0,
      active_agent: {
        dispatch_id: 'dispatch-1',
        gateway_label: 'gateway-1',
        session_key: 'session-1',
      },
      history: [],
    },
    timeout: 0.001,
    deps: {
      saveStatus: (_config, _dir, _previous, transition) => {
        savedStatus = clone(transition.status);
      },
      discord: async () => {},
      applyModuleCompletion: applyModuleCompletionForTest((nextStatus) => {
        savedStatus = nextStatus;
      }),
    },
    redisEntry: null,
    busterWorkerControlResult: {
      diagnostics: {
        metadata: {
          reason: 'timeout',
          final_status: {
            status: STATUS.TESTING,
            current_phase: 'buster',
            current_attempt: 1,
            fail_count: 0,
            completion_summary: 'Buster timed out',
            active_agent: {
              dispatch_id: 'dispatch-1',
              gateway_label: 'gateway-1',
              session_key: 'session-1',
            },
          },
        },
      },
    },
    busterSessionKey: 'session-1',
    completionIdentity: {
      runId: 'run-1',
      attempt: 1,
      dispatchId: 'dispatch-1',
      gateway_label: 'gateway-1',
      sessionKey: 'session-1',
    },
    busterModel: 'buster-model',
    busterAttempt: 3,
    maxBusterCrashRetries: 2,
    isLastBusterAttempt: true,
  });

  assert.equal(result.terminal.retry, false);
  assert.equal(result.terminal.result.outcome, 'timeout');
  assert.equal(result.terminal.result.terminal.status, 'timed_out');
  assert.equal(result.terminal.result.diagnostics.metadata.failure_class, 'timeout');
  assert.equal(result.terminal.result.stepType, 'module');
  assert.equal(result.terminal.result.stepId, 'module-a');
  assert.equal(savedStatus.status, STATUS.BLOCKED);
});

test('module Buster phase treats Redis output_file identity mismatch as completion contract failure without Forge retry', async () => {
  const { terminal, savedStatus, forbiddenRetryCalls } = await runContractFailurePhase({
    nowMs: 1781879465321,
    dispatchId: 'buster-module-module-a-1781879465321-1',
    sessionKey: 'agent:main:subagent:e1414386-cafc-4d85-bfc3-09f1c10e4bfa',
    reason: 'output_file_identity_mismatch',
    summary: 'Buster output_file identity mismatch: run_id, dispatch_id, completion_key',
  });
  assert.equal(terminal.retry, false);
  assert.equal(terminal.result.outcome, 'error');
  assert.equal(terminal.result.nextAction, 'halt');
  assert.equal(terminal.result.issueType, 'environment');
  assert.equal(terminal.result.diagnostics.summary, 'Buster output_file identity mismatch — completion contract failure (not sent to Forge)');
  assert.equal(terminal.result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.equal(savedStatus.status, STATUS.FAIL);
  assert.equal(savedStatus.fail_count, 0);
  assert.equal(forbiddenRetryCalls, 0);
});

test('module Buster phase adopts in-flight dispatch on resume without republishing task', async () => {
  const config = configWithBusterWorker();
  const dispatchId = 'buster-module-module-a-1784282514406-1';
  const sessionKey = null;
  let savedStatus = {
    status: STATUS.TESTING,
    current_phase: 'buster',
    fail_count: 0,
    history: [],
    cost: {},
    dispatch_id: dispatchId,
    session_key: null,
    gateway_label: dispatchId,
    active_agent: {
      dispatch_id: dispatchId,
      session_key: null,
      gateway_label: dispatchId,
      stream_log_path: '/tmp/buster-resume.log',
      phase: 'buster',
      attempt: 1,
      model: 'buster-model',
    },
    validation: {
      delivery_lint_passed: true,
      pre_check_passed: true,
    },
  };
  let archiveCalls = 0;
  let spawnCalls = 0;
  let verifyCalls = 0;
  let pollIdentity = null;

  const deps = busterPhaseDeps({
    nowMs: () => 1784282639299,
    discord: async () => {},
    archiveModuleCompletions: async () => {
      archiveCalls += 1;
      throw new Error('resumed Buster dispatch must not archive existing completion evidence');
    },
    runModuleBusterWorker,
    spawnAgent: async () => {
      spawnCalls += 1;
      throw new Error('resumed Buster dispatch must not publish a new task');
    },
    verifyAgentHealth: async () => {
      verifyCalls += 1;
      throw new Error('resumed Buster dispatch must not run startup health checks');
    },
    pollDualWithRateLimitRecovery: async (_config, _moduleDir, _moduleId, _expectedStatuses, _timeoutMinutes, identity) => {
      pollIdentity = identity;
      return {
        ok: true,
        status: {
          status: STATUS.PASS,
          _redis_entry: {
            status: STATUS.PASS,
            source: 'buster-pipeline',
            summary: 'Buster completed from queued dispatch',
            run_id: 'run-identity-proof',
            attempt: 1,
            dispatch_id: dispatchId,
            gateway_label: dispatchId,
            completion_key: `run-identity-proof:1:${dispatchId}`,
          },
        },
      };
    },
    killAgent: async () => {
      throw new Error('resumed Buster dispatch must not clean up a session it did not spawn');
    },
    ...statusPersistenceDeps(() => savedStatus, (nextStatus) => { savedStatus = nextStatus; }),
  });

  const result = await runBusterPhaseScenario({
    config,
    status: savedStatus,
    deps,
    handleModuleFail: async () => {
      throw new Error('resumed Buster dispatch pass must not enter handleModuleFail');
    },
    buildRetryResult: () => {
      throw new Error('resumed Buster dispatch pass must not build retry result');
    },
  });

  const terminal = moduleTerminalForAssertion(result);
  assert.equal(terminal.result.outcome, 'passed');
  assert.equal(savedStatus.status, STATUS.PASS);
  assert.equal(archiveCalls, 0);
  assert.equal(spawnCalls, 0);
  assert.equal(verifyCalls, 0);
  assert.deepEqual(pollIdentity, {
    run_id: 'run-identity-proof',
    attempt: 1,
    dispatch_id: dispatchId,
    session_key: null,
    gateway_label: dispatchId,
  });
});

test('module Buster phase republishes when resumed state only has stale Forge dispatch identity', async () => {
  const config = configWithBusterWorker();
  const dispatchId = 'buster-module-module-a-1784282639299-1';
  let savedStatus = {
    status: STATUS.TESTING,
    current_phase: 'buster',
    fail_count: 0,
    history: [],
    cost: {},
    dispatch_id: 'forge-module-a-dispatch-1784282514406',
    session_key: 'agent:main:subagent:stale-forge',
    gateway_label: 'forge-module-a-1784282514406',
    active_agent: {
      dispatch_id: 'forge-module-a-dispatch-1784282514406',
      session_key: 'agent:main:subagent:stale-forge',
      gateway_label: 'forge-module-a-1784282514406',
      phase: 'forge',
      attempt: 1,
      model: 'forge-model',
    },
    validation: {
      delivery_lint_passed: true,
      pre_check_passed: true,
    },
  };
  let spawnCalls = 0;
  let pollIdentity = null;

  const deps = busterPhaseDeps({
    nowMs: () => 1784282639299,
    discord: async () => {},
    archiveModuleCompletions: async () => ({ failed: false }),
    runModuleBusterWorker,
    spawnAgent: async () => {
      spawnCalls += 1;
      return {
        dispatch_id: dispatchId,
        run_id: 'run-identity-proof',
        session_key: null,
        gateway_label: dispatchId,
        stream_log_path: '/tmp/buster-refresh.log',
      };
    },
    verifyAgentHealth: async () => ({ ok: true }),
    verifyAgentAlive: async () => true,
    pollDualWithRateLimitRecovery: async (_config, _moduleDir, _moduleId, _expectedStatuses, _timeoutMinutes, identity) => {
      pollIdentity = identity;
      return {
        ok: true,
        status: {
          status: STATUS.PASS,
          _redis_entry: {
            status: STATUS.PASS,
            source: 'buster-pipeline',
            summary: 'Buster completed from refreshed dispatch',
            run_id: 'run-identity-proof',
            attempt: 1,
            dispatch_id: dispatchId,
            gateway_label: dispatchId,
            completion_key: `run-identity-proof:1:${dispatchId}`,
          },
        },
      };
    },
    killAgent: async () => {},
    ...statusPersistenceDeps(() => savedStatus, (nextStatus) => { savedStatus = nextStatus; }),
  });

  const result = await runBusterPhaseScenario({
    config,
    status: savedStatus,
    deps,
    handleModuleFail: async () => {
      throw new Error('refreshed Buster dispatch pass must not enter handleModuleFail');
    },
    buildRetryResult: () => {
      throw new Error('refreshed Buster dispatch pass must not build retry result');
    },
  });

  const terminal = moduleTerminalForAssertion(result);
  assert.equal(terminal.result.outcome, 'passed');
  assert.equal(savedStatus.status, STATUS.PASS);
  assert.equal(spawnCalls, 1);
  assert.deepEqual(pollIdentity, {
    run_id: 'run-identity-proof',
    attempt: 1,
    dispatch_id: dispatchId,
    session_key: null,
    gateway_label: dispatchId,
  });
});

test('module Buster phase treats Redis missing output_file as completion contract failure without Forge retry', async () => {
  const { terminal, savedStatus, forbiddenRetryCalls } = await runContractFailurePhase({
    nowMs: 1781884965455,
    dispatchId: 'buster-module-module-a-1781884965455-1',
    sessionKey: 'agent:main:subagent:9f044c9e-7675-4751-a3b9-373702f8dea8',
    reason: 'output_file_missing',
    summary: 'output_file missing: /tmp/module-a/.swarm/modules/01-foundation/buster-output.json',
  });
  assert.equal(terminal.retry, false);
  assert.equal(terminal.result.outcome, 'error');
  assert.equal(terminal.result.nextAction, 'halt');
  assert.equal(terminal.result.issueType, 'environment');
  assert.equal(terminal.result.diagnostics.summary, 'Buster output_file missing — completion contract failure (not sent to Forge)');
  assert.equal(terminal.result.diagnostics.metadata.failure_class, 'output_file_missing');
  assert.equal(savedStatus.status, STATUS.FAIL);
  assert.equal(savedStatus.fail_count, 0);
  assert.equal(forbiddenRetryCalls, 0);
});

test('module Buster phase preserves forge commit when worker retry status is narrow', async () => {
  const config = configWithBusterWorker();
  let savedStatus = {
    status: STATUS.READY_FOR_TESTING,
    current_phase: null,
    fail_count: 0,
    forge_commit_hash: 'abc123def456',
    history: [],
    cost: {},
  };
  const seenForgeCommits = [];
  let workerCalls = 0;

  const deps = busterPhaseDeps({
    nowMs: () => 1781884965455 + workerCalls,
    discord: async () => {},
    runModuleBusterWorker: async ({ workerInput }) => {
      workerCalls += 1;
      seenForgeCommits.push(workerInput.status?.forge_commit_hash || null);
      if (workerCalls === 1) {
        return buildModuleBusterWorkerControlResult(config, workerInput, {
          nextAction: 'retry',
          issueType: 'environment',
          outcomeClass: 'retrying',
          reason: 'timeout',
          failureClass: 'timeout',
          finalStatus: {
            status: STATUS.TESTING,
            current_phase: 'buster',
            fail_count: 0,
            completion_summary: 'Buster timed out',
          },
          dispatchId: 'dispatch-timeout',
          gatewayLabel: 'gateway-timeout',
          sessionKey: 'session-timeout',
        });
      }
      return buildModuleBusterWorkerControlResult(config, workerInput, {
        nextAction: 'pass',
        outcomeClass: 'passed',
        finalStatus: {
          status: STATUS.PASS,
          summary: 'Buster passed after retry',
        },
        dispatchId: 'dispatch-pass',
        gatewayLabel: 'gateway-pass',
        sessionKey: 'session-pass',
      });
    },
    ...statusPersistenceDeps(() => savedStatus, (nextStatus) => { savedStatus = nextStatus; }),
  });

  const result = await runBusterPhaseScenario({
    config,
    status: savedStatus,
    deps,
    handleModuleFail: async () => {
      throw new Error('Buster retry identity preservation must not enter handleModuleFail');
    },
    buildRetryResult: () => {
      throw new Error('Buster retry identity preservation must not build retry result');
    },
  });

  assert.equal(workerCalls, 2);
  assert.deepEqual(seenForgeCommits, ['abc123def456', 'abc123def456']);
  assert.equal(result.retry, false);
  assert.equal(result.result.outcome, 'passed');
});

test('module Buster phase does not duplicate PASS persistence after Redis completion authority', async () => {
  const { result, savedStatus, savedTransitions } = await runRedisPassPhase({
    includeFinalStatus: true,
    rejectDuplicatePass: true,
  });

  assert.equal(result.retry, false);
  assert.equal(result.result.outcome, 'passed');
  assert.deepEqual(savedTransitions.filter(Boolean), ['module_attempt.testing_started', 'module_attempt.passed']);
  assert.equal(savedStatus.status, STATUS.PASS);
});

test('module Buster phase accepts Redis-only deterministic PASS without local final status', async () => {
  const { result, savedStatus, savedTransitions } = await runRedisPassPhase({
    includeFinalStatus: false,
    rejectDuplicatePass: false,
  });

  assert.equal(result.retry, false);
  assert.equal(result.result.outcome, 'passed');
  assert.equal(result.result.nextAction, 'continue');
  assert.deepEqual(savedTransitions.filter(Boolean), ['module_attempt.testing_started', 'module_attempt.passed']);
  assert.equal(savedStatus.status, STATUS.PASS);
});

test('module Buster worker keeps terminal poll authority over malformed cleanup status', async () => {
  const config = configWithBusterWorker();
  let shutdownCleared = 0;
  const result = await runModuleBusterWorker({
    config,
    progress: {},
    workerInput: busterWorkerInput(),
    deps: busterWorkerDeps({
      pollDualWithRateLimitRecovery: async () => ({
        ok: true,
        reason: 'agent_verdict_pass',
        status: {
          status: STATUS.PASS,
          summary: 'Buster agent passed',
          _redis_entry: {
            source: 'buster-pipeline',
            reason: 'agent_verdict_pass',
            dispatch_id: 'dispatch-current',
            session_key: 'session-current',
          },
        },
      }),
      loadStatus: () => {
        throw new SyntaxError('Expected double-quoted property name in JSON at position 65');
      },
      clearShutdownContext: () => {
        shutdownCleared += 1;
      },
    }),
  });

  assert.equal(result.nextAction, 'pass');
  assert.equal(result.diagnostics.metadata.failure_class, 'pass');
  assert.equal(result.diagnostics.metadata.dispatch_id, 'dispatch-current');
  assert.equal(result.diagnostics.metadata.session_key, 'session-current');
  assert.deepEqual(result.diagnostics.metadata.status_errors, [
    {
      phase: 'load_final_status',
      error: 'Expected double-quoted property name in JSON at position 65',
    },
  ]);
  assert.equal(shutdownCleared, 1);
});

test('module Buster worker returns typed parse corruption when poll reads malformed completion state', async () => {
  const config = configWithBusterWorker();
  const result = await runModuleBusterWorker({
    config,
    progress: {},
    workerInput: busterWorkerInput(),
    deps: busterWorkerDeps({
      pollDualWithRateLimitRecovery: async () => {
        throw new SyntaxError('Expected double-quoted property name in JSON at position 65');
      },
      loadStatus: () => {
        throw new SyntaxError('Expected double-quoted property name in JSON at position 65');
      },
    }),
  });

  assert.equal(result.nextAction, 'retry');
  assert.equal(result.diagnostics.metadata.reason, 'parse_corrupted');
  assert.equal(result.diagnostics.metadata.failure_class, 'parse_corrupted');
  assert.equal(result.diagnostics.metadata.dispatch_id, 'dispatch-current');
  assert.equal(result.diagnostics.metadata.session_key, 'session-current');
  assert.deepEqual(result.diagnostics.metadata.status_errors, [
    {
      phase: 'load_final_status',
      error: 'Expected double-quoted property name in JSON at position 65',
    },
  ]);
});

test('module Buster phase retries startup failures with dedicated swarm config budget before PASS', async () => {
  const config = configWithBusterWorker();
  let savedStatus = {
    status: STATUS.READY_FOR_TESTING,
    current_phase: null,
    fail_count: 0,
    history: [],
    cost: {},
  };
  let workerCalls = 0;

  const deps = busterPhaseDeps({
    nowMs: () => 1781884965455,
    discord: async () => {},
    runModuleBusterWorker: async ({ workerInput }) => {
      workerCalls += 1;
      if (workerCalls < 3) {
        return buildModuleBusterWorkerControlResult(config, workerInput, {
          nextAction: 'retry',
          issueType: 'environment',
          outcomeClass: 'retrying',
          reason: 'healthcheck_failed',
          failureClass: 'healthcheck_failed',
          error: 'agent not running after spawn',
          dispatchId: `dispatch-${workerCalls}`,
          gatewayLabel: `gateway-${workerCalls}`,
          sessionKey: `session-${workerCalls}`,
        });
      }
      return buildModuleBusterWorkerControlResult(config, workerInput, {
        nextAction: 'pass',
        outcomeClass: 'passed',
        finalStatus: {
          status: STATUS.PASS,
          summary: 'Buster passed after startup retry',
        },
        dispatchId: 'dispatch-pass',
        gatewayLabel: 'gateway-pass',
        sessionKey: 'session-pass',
      });
    },
    ...statusPersistenceDeps(() => savedStatus, (nextStatus) => { savedStatus = nextStatus; }),
  });

  const result = await runBusterPhaseScenario({
    config,
    status: savedStatus,
    deps,
    handleModuleFail: async () => {
      throw new Error('startup retry success must not enter handleModuleFail');
    },
    buildRetryResult: () => {
      throw new Error('startup retry success must not build retry result');
    },
  });

  assert.equal(workerCalls, 3);
  assert.equal(result.retry, false);
  assert.equal(result.result.outcome, 'passed');
  assert.equal(savedStatus.fail_count, 0);
  assert.equal(savedStatus.status, STATUS.PASS);
});
const tempRepos = new Set();
after(() => {
  for (const root of tempRepos) fs.rmSync(root, { recursive: true, force: true });
});
