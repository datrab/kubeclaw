import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  runModuleBusterWorker,
  runModuleForgeWorker,
} from '../../../../../skills/nova/pipeline/agents/module-workers.ts';

function baseConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-workers-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(path.join(swarmDir, 'modules'), { recursive: true });
  return {
    project: 'module-workers-test',
    repo_root: root,
    _runId: 'run-1',
    run_id: 'run-1',
    paths: {
      project_src_dir: root,
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    agents: {
      forge: { dispatch: 'acp' },
      buster: { dispatch: 'acp' },
    },
    rate_limit: {
      max_pauses_per_module: 1,
      cooldown_hours: 0,
      cooldown_buffer_ms: 0,
    },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
    },
  };
}

function forgeInput(overrides = {}) {
  return {
    prompt: 'forge',
    ids: { moduleId: 'mod-a', runId: 'run-1', attempt: 1 },
    executionContext: { moduleDir: 'modules/mod-a', timeoutMinutes: 1 },
    worker: { backendConfig: { model: 'test-model' } },
    ...overrides,
  };
}

function busterInput(overrides = {}) {
  return {
    prompt: 'buster',
    ids: { moduleId: 'mod-a', attempt: 1, runId: 'run-1', dispatchId: 'dispatch-1' },
    executionContext: { moduleDir: 'modules/mod-a', timeoutMinutes: 1 },
    worker: { backendConfig: { model: 'test-model' } },
    ...overrides,
  };
}

function forgeDeps(overrides = {}) {
  return {
    spawnAgent: async () => {},
    verifyAgentHealth: async () => true,
    killAgent: async () => {},
    getTrackedAgent: () => null,
    acpLabel: (_agentType, moduleId, opts = {}) => {
      const suffix = [
        opts.runId ? `run-${opts.runId}` : null,
        opts.attempt ? `attempt-${opts.attempt}` : null,
      ].filter(Boolean).join('-');
      return `forge-${moduleId}${suffix ? `-${suffix}` : ''}`;
    },
    pollForgeCompletionWithRateLimitRecovery: async () => ({ ok: true }),
    loadStatus: () => ({}),
    saveStreamLog: async () => {},
    clearShutdownContext: () => {},
    ...overrides,
  };
}

function busterDeps(overrides = {}) {
  return {
    archiveModuleCompletions: async () => ({ failed: false }),
    spawnAgent: async () => ({
      dispatch_id: 'dispatch-1',
      session_key: 'session-1',
      stream_log_path: '/tmp/buster.log',
      gateway_label: 'Buster session',
      run_id: 'run-1',
      runtime: 'acp',
      model: 'gpt-5.4',
    }),
    verifyAgentHealth: async () => true,
    killAgent: async () => {},
    pollDualWithRateLimitRecovery: async () => ({ ok: true }),
    loadStatus: () => ({}),
    saveStreamLog: async () => {},
    clearShutdownContext: () => {},
    ...overrides,
  };
}

test('module forge cleans up and returns typed block when dispatch hook rejects', async () => {
  const calls = [];
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput({
      onDispatched: async () => {
        throw new Error('dispatch failed');
      },
    }),
    deps: {
      ...forgeDeps(),
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentHealth: async () => true,
      acpLabel: () => 'forge-mod-a',
      getTrackedAgent: () => ({
        sessionKey: 'session-1',
        gatewayLabel: 'gateway-1',
        streamLogPath: '/tmp/forge.log',
      }),
      pollForgeCompletionWithRateLimitRecovery: async () => {
        calls.push('poll');
        return { ok: true };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({ status: 'READY_FOR_TESTING' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_forge');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'dispatch_hook_failed');
  assert.deepEqual(calls, ['spawn', 'kill', 'save', 'clear']);
});

test('module forge saves stream log and clears context when finalize hook rejects', async () => {
  const calls = [];
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput({
      onFinalized: async () => {
        throw new Error('finalize failed');
      },
    }),
    deps: {
      ...forgeDeps(),
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentHealth: async () => true,
      acpLabel: () => 'forge-mod-a',
      getTrackedAgent: () => ({
        sessionKey: 'session-1',
        gatewayLabel: 'gateway-1',
        streamLogPath: '/tmp/forge.log',
      }),
      pollForgeCompletionWithRateLimitRecovery: async () => {
        calls.push('poll');
        return { ok: true };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({ status: 'READY_FOR_TESTING' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.producerType, 'module_forge');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'finalize_hook_failed');
  assert.deepEqual(calls, ['spawn', 'poll', 'kill', 'save', 'clear']);
});

test('module forge returns typed block when cleanup kill rejects after poll', async () => {
  const calls = [];
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput(),
    deps: {
      ...forgeDeps(),
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentHealth: async () => true,
      acpLabel: () => 'forge-mod-a',
      getTrackedAgent: () => ({
        sessionKey: 'session-1',
        gatewayLabel: 'gateway-1',
        streamLogPath: '/tmp/forge.log',
      }),
      pollForgeCompletionWithRateLimitRecovery: async () => {
        calls.push('poll');
        return { ok: true };
      },
      killAgent: async () => {
        calls.push('kill');
        throw new Error('kill failed');
      },
      loadStatus: () => ({ status: 'READY_FOR_TESTING' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_forge');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'cleanup_failed');
  assert.equal(result.diagnostics.metadata.error, 'kill failed');
  assert.deepEqual(calls, ['spawn', 'poll', 'kill', 'save', 'clear']);
});

test('module forge carries successful poll status even before Nova lifecycle transition', async () => {
  const calls = [];
  let killCall = null;
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput(),
    deps: {
      ...forgeDeps(),
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentHealth: async () => true,
      acpLabel: () => 'forge-mod-a',
      getTrackedAgent: () => ({
        sessionKey: 'session-1',
        gatewayLabel: 'gateway-1',
        streamLogPath: '/tmp/forge.log',
      }),
      pollForgeCompletionWithRateLimitRecovery: async () => {
        calls.push('poll');
        return {
          ok: true,
          reason: 'forge_completion',
          status: {
            status: 'READY_FOR_TESTING',
            summary: 'typed artifact accepted',
            completed_at: '2026-06-17T15:33:29Z',
          },
        };
      },
      killAgent: async (_config, _agentType, _moduleId, graceful, opts) => {
        killCall = { graceful, opts };
        calls.push('kill');
      },
      loadStatus: () => ({ status: 'IN_PROGRESS' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_forge');
  assert.equal(result.nextAction, 'pass');
  assert.equal(result.diagnostics.metadata.reason, 'forge_completion');
  assert.equal(result.diagnostics.metadata.final_status.status, 'READY_FOR_TESTING');
  assert.deepEqual(calls, ['spawn', 'poll', 'kill', 'save', 'clear']);
  assert.deepEqual(killCall, {
    graceful: true,
    opts: {
      trackingLabel: 'forge-mod-a',
      graceMs: 10000,
      statusTimeoutMs: 5000,
      requestTimeoutMs: 5000,
      stopRequestTimeoutMs: 5000,
      listTimeoutMs: 5000,
      acpxTimeoutMs: 5000,
    },
  });
});

test('module forge scopes lifecycle labels by run and attempt', async () => {
  const tracked = new Map();
  const spawns = [];
  const polls = [];
  const kills = [];
  const saves = [];

  await Promise.all([1, 2].map((attempt) => runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput({ ids: { moduleId: 'mod-a', runId: 'run-1', attempt } }),
    deps: {
      ...forgeDeps(),
      spawnAgent: async (_config, _progress, _agentType, _moduleId, _model, _prompt, opts) => {
        spawns.push({ attempt, trackingLabel: opts.trackingLabel });
        tracked.set(opts.trackingLabel, {
          sessionKey: `session-${attempt}`,
          gatewayLabel: `gateway-${attempt}`,
          streamLogPath: `/tmp/forge-${attempt}.log`,
          run_id: 'run-1',
          dispatch_id: `dispatch-${attempt}`,
        });
      },
      verifyAgentHealth: async (_config, _agentType, _moduleId, opts) => tracked.has(opts.trackingLabel),
      getTrackedAgent: (label) => tracked.get(label),
      pollForgeCompletionWithRateLimitRecovery: async (_config, _moduleDir, _timeoutMinutes, opts) => {
        polls.push({ attempt, ...opts });
        return { ok: true };
      },
      killAgent: async (_config, _agentType, _moduleId, _graceful, opts) => {
        kills.push({ attempt, trackingLabel: opts.trackingLabel });
        tracked.delete(opts.trackingLabel);
      },
      loadStatus: () => ({ status: 'READY_FOR_TESTING' }),
      saveStreamLog: (_config, _moduleDir, _agentType, saveAttempt, streamPath) => {
        saves.push({ attempt: saveAttempt, streamPath });
      },
    },
  })));

  const labels = spawns.map((entry) => entry.trackingLabel).sort();
  assert.deepEqual(labels, [
    'forge-mod-a-run-run-1-attempt-1',
    'forge-mod-a-run-run-1-attempt-2',
  ]);
  assert.deepEqual(polls.map((entry) => [entry.attempt, entry.sessionLabel, entry.sessionKey]).sort(), [
    [1, 'forge-mod-a-run-run-1-attempt-1', 'session-1'],
    [2, 'forge-mod-a-run-run-1-attempt-2', 'session-2'],
  ]);
  assert.deepEqual(kills.map((entry) => [entry.attempt, entry.trackingLabel]).sort(), [
    [1, 'forge-mod-a-run-run-1-attempt-1'],
    [2, 'forge-mod-a-run-run-1-attempt-2'],
  ]);
  assert.deepEqual(saves.sort((a, b) => a.attempt - b.attempt), [
    { attempt: 1, streamPath: '/tmp/forge-1.log' },
    { attempt: 2, streamPath: '/tmp/forge-2.log' },
  ]);
});

test('module buster classifies terminal session lifecycle failure as retryable environment failure', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => {
        calls.push('spawn');
        return {
          dispatch_id: 'dispatch-1',
          session_key: 'session-1',
          stream_log_path: '/tmp/buster.log',
          gateway_label: 'Buster session',
          run_id: 'run-1',
          runtime: 'acp',
          model: 'gpt-5.4',
        };
      },
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return {
          ok: false,
          reason: 'agent_session_lifecycle_unstable',
          status: {
            failure_class: 'agent_session_lifecycle_unstable',
            detail: 'Buster child session entered terminal error state',
          },
        };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({ status: 'READY_FOR_TESTING' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'retry');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.typed.worker.outcomeClass, 'retrying');
  assert.equal(result.diagnostics.metadata.reason, 'agent_session_lifecycle_unstable');
  assert.equal(result.diagnostics.metadata.failure_class, 'agent_session_lifecycle_unstable');
  assert.deepEqual(calls, ['spawn', 'poll', 'kill', 'save', 'clear']);
});

test('module forge classifies missing completion artifact as retryable environment failure', async () => {
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput(),
    deps: {
      ...forgeDeps(),
      spawnAgent: async () => {},
      verifyAgentHealth: async () => true,
      acpLabel: () => 'forge-mod-a',
      getTrackedAgent: () => ({
        sessionKey: 'session-1',
        gatewayLabel: 'gateway-1',
        streamLogPath: '/tmp/forge.log',
      }),
      pollForgeCompletionWithRateLimitRecovery: async () => ({
        ok: false,
        reason: 'forge_completion_artifact_missing',
        status: {
          status: 'FAIL',
          missing_authority: 'forge-completion.json',
          expected_completion_path: '/tmp/worktree/.swarm/modules/mod-a/forge-completion.json',
        },
      }),
      killAgent: async () => {},
      saveStreamLog: async () => {},
      clearShutdownContext: () => {},
    },
  });

  assert.equal(result.producerType, 'module_forge');
  assert.equal(result.nextAction, 'retry');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.typed.worker.outcomeClass, 'retrying');
  assert.equal(result.diagnostics.metadata.reason, 'forge_completion_artifact_missing');
});

test('module forge retries when startup evidence never appears during spawn', async () => {
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput(),
    deps: {
      ...forgeDeps(),
      spawnAgent: async () => {
        const error = new Error('Required agent observability evidence missing');
        error.reason = 'missing_agent_observability_startup_evidence';
        error.observability_required = true;
        throw error;
      },
      clearShutdownContext: () => {},
    },
  });

  assert.equal(result.producerType, 'module_forge');
  assert.equal(result.nextAction, 'retry');
  assert.equal(result.diagnostics.metadata.reason, 'startup_evidence_missing');
});

test('module forge routes startup health-check usage limits through cooldown before retry', async () => {
  const calls = [];
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput({ ids: { moduleId: 'mod-a', runId: 'run-1', attempt: 1 } }),
    deps: {
      ...forgeDeps(),
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentHealth: async () => ({
        ok: false,
        reason: 'rate_limited',
        rateLimited: true,
        detail: "You've reached your Codex subscription usage limit. Next reset in 0 seconds.",
        sessionKey: 'session-rate',
        gatewayLabel: 'gateway-rate',
        streamLogPath: '/tmp/forge-rate.log',
        identity: {
          module_id: 'mod-a',
          run_id: 'run-1',
          attempt: 1,
          agent_type: 'forge',
          session_key: 'session-rate',
          gateway_label: 'gateway-rate',
        },
      }),
      killAgent: async () => calls.push('kill'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.producerType, 'module_forge');
  assert.equal(result.nextAction, 'retry');
  assert.equal(result.diagnostics.metadata.reason, 'rate_limited');
  assert.equal(result.diagnostics.metadata.rate_limit_status.status, 'RATE_LIMITED');
  assert.equal(result.diagnostics.metadata.session_key, 'session-rate');
  assert.deepEqual(calls, ['spawn', 'kill', 'clear']);
});

test('module buster cleans up and returns typed block when dispatch hook rejects', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput({
      onDispatched: async () => {
        throw new Error('dispatch failed');
      },
    }),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return { ok: true };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({}),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'dispatch_hook_failed');
  assert.deepEqual(calls, ['kill', 'save', 'clear']);
});

test('module buster retries when startup evidence never appears during spawn', async () => {
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => {
        const error = new Error('Required agent observability evidence missing');
        error.reason = 'missing_agent_observability_startup_evidence';
        error.observability_required = true;
        throw error;
      },
      clearShutdownContext: () => {},
    },
  });

  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'retry');
  assert.equal(result.diagnostics.metadata.reason, 'startup_evidence_missing');
  assert.equal(result.diagnostics.metadata.failure_class, 'healthcheck_failed');
});

test('module buster retries when agent fails health check immediately after spawn', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => false,
      killAgent: async () => calls.push('kill'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'retry');
  assert.equal(result.diagnostics.metadata.reason, 'healthcheck_failed');
  assert.equal(result.diagnostics.metadata.failure_class, 'healthcheck_failed');
  assert.deepEqual(calls, ['kill', 'clear']);
});

test('module buster routes startup health-check usage limits through cooldown before retry', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => {
        calls.push('spawn');
        return {
          dispatch_id: 'dispatch-1',
          run_id: 'run-1',
          session_key: 'session-rate',
          gateway_label: 'gateway-rate',
          stream_log_path: '/tmp/buster-rate.log',
        };
      },
      verifyAgentHealth: async () => ({
        ok: false,
        reason: 'rate_limited',
        rateLimited: true,
        detail: "You've reached your Codex subscription usage limit. Next reset in 0 seconds.",
        sessionKey: 'session-rate',
        gatewayLabel: 'gateway-rate',
        streamLogPath: '/tmp/buster-rate.log',
        identity: {
          module_id: 'mod-a',
          run_id: 'run-1',
          attempt: 1,
          dispatch_id: 'dispatch-1',
          agent_type: 'buster',
          session_key: 'session-rate',
          gateway_label: 'gateway-rate',
        },
      }),
      killAgent: async () => calls.push('kill'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'retry');
  assert.equal(result.diagnostics.metadata.reason, 'rate_limited');
  assert.equal(result.diagnostics.metadata.failure_class, 'rate_limited');
  assert.equal(result.diagnostics.metadata.rate_limit_status.status, 'RATE_LIMITED');
  assert.equal(result.diagnostics.metadata.session_key, 'session-rate');
  assert.deepEqual(calls, ['spawn', 'kill', 'clear']);
});

test('module buster contains thrown archive errors as typed blocks', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => {
        throw new Error('redis archive unavailable');
      },
      spawnAgent: async () => calls.push('spawn'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'completion_archive_failed');
  assert.equal(result.diagnostics.metadata.failure_class, 'completion_archive_failed');
  assert.equal(result.diagnostics.metadata.error, 'redis archive unavailable');
  assert.deepEqual(calls, ['clear']);
});

test('module buster returns typed block when poll failure class is missing', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return { ok: false, reason: 'redis_missing', status: { status: 'BLOCKED' } };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({}),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'redis_missing');
  assert.equal(result.diagnostics.metadata.failure_class, 'poll_failure_class_missing');
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});

test('module buster classifies output_file identity mismatch as infrastructure block', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return {
          ok: false,
          reason: 'output_file_identity_mismatch',
          status: {
            status: 'FAIL',
            summary: 'Buster output_file identity mismatch: attempt, dispatch_id, completion_key',
          },
        };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({ status: 'FAIL' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.metadata.reason, 'output_file_identity_mismatch');
  assert.equal(result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});

test('module buster classifies output_file identity mismatch from Redis entry reason', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return {
          ok: false,
          status: {
            status: 'FAIL',
            _redis_entry: {
              reason: 'output_file_identity_mismatch',
              summary: 'Buster output_file identity mismatch: attempt, dispatch_id, completion_key',
            },
          },
        };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({ status: 'FAIL' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.metadata.failure_class, 'output_file_identity_mismatch');
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});

test('module buster accepts Redis dispatch completion without session key', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        gateway_label: 'gateway-1',
        stream_log_path: null,
        runtime: 'redis',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return {
          ok: false,
          reason: 'target_reached',
          status: {
            status: 'FAIL',
            failure_class: 'verdict_fail',
            summary: 'unit failed',
          },
        };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({ status: 'FAIL' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'request_fix');
  assert.equal(result.issueType, 'code');
  assert.equal(result.diagnostics.metadata.failure_class, 'verdict_fail');
  assert.equal(result.diagnostics.metadata.session_key, null);
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});

test('module buster classifies missing output_file from Redis entry reason as infrastructure block', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return {
          ok: false,
          status: {
            status: 'FAIL',
            _redis_entry: {
              status: 'FAIL',
              reason: 'output_file_missing',
              summary: 'output_file missing: /tmp/buster-output.json',
              run_id: 'run-1',
              attempt: '1',
              dispatch_id: 'dispatch-1',
              session_key: 'session-1',
              completion_key: 'run-1:1:dispatch-1',
            },
          },
        };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({ status: 'FAIL' }),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.metadata.failure_class, 'output_file_missing');
  assert.equal(result.diagnostics.metadata.redis_entry.reason, 'output_file_missing');
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});

test('module buster dispatch uses worker workspace repo root as session cwd authority', async () => {
  let dispatchOpts = null;
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput({
      workspace: {
        repoRoot: '/tmp/module-worktree-authority',
      },
    }),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async (_config, _progress, _agentType, _moduleId, _model, _prompt, opts) => {
        dispatchOpts = opts;
        return {
          dispatch_id: 'dispatch-1',
          run_id: 'run-1',
          session_key: 'session-1',
          gateway_label: 'gateway-1',
          stream_log_path: '/tmp/buster.log',
        };
      },
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => ({ ok: true }),
      loadStatus: () => ({}),
    },
  });

  assert.equal(result.nextAction, 'pass');
  assert.equal(dispatchOpts.cwd, '/tmp/module-worktree-authority');
});

test('module buster saves stream log and clears context when finalize hook rejects', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput({
      onFinalized: async () => {
        throw new Error('finalize failed');
      },
    }),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return { ok: true };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({}),
      saveStreamLog: () => calls.push('save'),
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'finalize_hook_failed');
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});

test('module buster returns typed block when save stream log rejects after poll', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      ...busterDeps(),
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentHealth: async () => true,
      pollDualWithRateLimitRecovery: async () => {
        calls.push('poll');
        return { ok: true };
      },
      killAgent: async () => calls.push('kill'),
      loadStatus: () => ({}),
      saveStreamLog: async () => {
        calls.push('save');
        throw new Error('save failed');
      },
      clearShutdownContext: () => calls.push('clear'),
    },
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerType, 'module_buster');
  assert.equal(result.nextAction, 'block');
  assert.equal(result.diagnostics.metadata.reason, 'cleanup_failed');
  assert.equal(result.diagnostics.metadata.failure_class, 'cleanup_failed');
  assert.equal(result.diagnostics.metadata.error, 'save failed');
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});
