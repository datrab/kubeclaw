import assert from 'node:assert/strict';
import test from 'node:test';

import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { shouldApplyRedisCompletionToStatus } from '../../../../../skills/nova/pipeline/services/completion-adjudicator.ts';
import { resolveExpectedCompletionSessionKey } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts';
import { handleBusterFailOrBlockedStatus } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts';
import { handleFailedPollResult } from '../../../../../skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts';

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
