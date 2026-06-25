import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runModuleBusterWorker,
  runModuleForgeWorker,
} from '../../../../../skills/nova/pipeline/agents/module-workers.ts';

function baseConfig() {
  return {
    project: 'module-workers-test',
    _runId: 'run-1',
    agents: {
      forge: { dispatch: 'acp' },
      buster: { dispatch: 'acp' },
    },
  };
}

function forgeInput(overrides = {}) {
  return {
    prompt: 'forge',
    ids: { moduleId: 'mod-a', attempt: 1 },
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
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentAlive: async () => true,
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
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentAlive: async () => true,
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
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentAlive: async () => true,
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
      spawnAgent: async () => calls.push('spawn'),
      verifyAgentAlive: async () => true,
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
      verifyAgentAlive: async (_config, _agentType, _moduleId, opts) => tracked.has(opts.trackingLabel),
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

test('module forge retries when startup evidence never appears during spawn', async () => {
  const result = await runModuleForgeWorker({
    config: baseConfig(),
    progress: {},
    workerInput: forgeInput(),
    deps: {
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
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => true,
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
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => false,
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

test('module buster contains thrown archive errors as typed blocks', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
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

test('module buster returns typed block for unclassified poll failure', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => true,
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
  assert.equal(result.diagnostics.metadata.failure_class, 'unclassified_poll_failure');
  assert.deepEqual(calls, ['poll', 'kill', 'save', 'clear']);
});

test('module buster classifies output_file identity mismatch as infrastructure block', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => true,
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
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => true,
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

test('module buster classifies missing output_file from Redis entry reason as infrastructure block', async () => {
  const calls = [];
  const result = await runModuleBusterWorker({
    config: baseConfig(),
    progress: {},
    workerInput: busterInput(),
    deps: {
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => true,
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
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => true,
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
      archiveModuleCompletions: async () => ({ failed: false }),
      spawnAgent: async () => ({
        dispatch_id: 'dispatch-1',
        run_id: 'run-1',
        session_key: 'session-1',
        gateway_label: 'gateway-1',
        stream_log_path: '/tmp/buster.log',
      }),
      verifyAgentAlive: async () => true,
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
