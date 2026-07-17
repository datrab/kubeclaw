import assert from 'node:assert/strict';
import test from 'node:test';

import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { prepareModuleForBuster } from '../../../../../skills/nova/pipeline/runners/module-runner-prebuster.ts';

function config() {
  return {
    run_id: 'run-git-sync-classification',
    _runId: 'run-git-sync-classification',
    _runStats: createRunStats(),
    project: 'git-sync-classification-fixture',
    paths: {
      swarm_dir: '/tmp/git-sync-classification-fixture/.swarm',
    },
    telemetry: { enabled: false },
  };
}

function readyStatus() {
  return {
    module_id: '01-nginx',
    status: STATUS.READY_FOR_TESTING,
    fail_count: 0,
    validation: {
      attempt: 1,
      delivery_lint_passed: true,
      delivery_lint_passed_at: '2026-07-17T00:00:00.000Z',
      pre_check_passed: true,
      pre_check_passed_at: '2026-07-17T00:00:00.000Z',
    },
    dispatch_id: 'forge-01-nginx-dispatch',
    gateway_label: 'forge-01-nginx',
    session_key: 'agent:main:subagent:test',
    active_agent: {
      attempt: 1,
      dispatch_id: 'forge-01-nginx-dispatch',
      gateway_label: 'forge-01-nginx',
      session_key: 'agent:main:subagent:test',
    },
  };
}

function resumedBusterStatus() {
  const dispatchId = 'buster-module-01-nginx-1784290000000-1';
  return {
    module_id: '01-nginx',
    status: STATUS.TESTING,
    current_phase: 'buster',
    fail_count: 0,
    validation: {
      attempt: 1,
      delivery_lint_passed: true,
      delivery_lint_passed_at: '2026-07-17T00:00:00.000Z',
      pre_check_passed: true,
      pre_check_passed_at: '2026-07-17T00:00:00.000Z',
    },
    dispatch_id: dispatchId,
    gateway_label: dispatchId,
    session_key: null,
  };
}

function contaminatedBusterStatus() {
  return {
    ...resumedBusterStatus(),
    dispatch_id: 'forge-01-nginx-dispatch-existing-1',
    gateway_label: 'forge-01-nginx-existing-1',
    session_key: 'agent:main:subagent:forge-existing',
    active_agent: {
      dispatch_id: 'forge-01-nginx-dispatch-existing-1',
      gateway_label: 'forge-01-nginx-existing-1',
      session_key: 'agent:main:subagent:forge-existing',
      phase: 'forge',
      attempt: 1,
    },
  };
}

function depsForGitSyncFailure(message) {
  return {
    saveStatus() {},
    discord() {},
    handleFail() {
      throw new Error('handleFail should not run for git sync terminal failures');
    },
    gitSyncBeforeBuster() {
      throw new Error(message);
    },
  };
}

const gitSyncFailures = [
  ['git_credential_failed', '[GIT_SYNC_FAILED] Git sync failed before Buster handoff: Permission denied (publickey).'],
  ['git_non_fast_forward', '[GIT_SYNC_FAILED] Git sync failed before Buster handoff: ! [rejected] main -> main (non-fast-forward)'],
  ['git_rebase_conflict', '[GIT_SYNC_FAILED] Git sync failed before Buster handoff: GIT_REBASE_CONFLICT: CONFLICT (content): merge conflict'],
  ['git_commit_failed', '[GIT_SYNC_FAILED] Git sync failed before Buster handoff: git commit failed: pre-commit hook declined'],
  ['git_sync_failed', '[GIT_SYNC_FAILED] Git sync failed before Buster handoff: generic git failure'],
];

for (const [expectedClass, message] of gitSyncFailures) {
  test(`pre-Buster git sync terminal uses canonical Git class: ${expectedClass}`, async () => {
    const result = await prepareModuleForBuster({
      config: config(),
      progress: {},
      moduleId: '01-nginx',
      mod: { title: 'nginx', stages: ['forge', 'buster'] },
      dir: '01-nginx',
      status: readyStatus(),
      maxFails: 0,
      timeout: 1,
      stages: ['forge', 'buster'],
      deps: depsForGitSyncFailure(message),
    });

    const decision = result.terminal.result.terminal.decision;
    assert.equal(decision.reasonCode, expectedClass);
    assert.equal(result.terminal.result.diagnostics.metadata.failure_class, expectedClass);
    assert.equal(result.terminal.result.diagnostics.summary, message);
  });
}

test('pre-Buster preparation preserves resumed Buster dispatch without re-running git sync', async () => {
  let gitSyncCalls = 0;
  let saveCalls = 0;
  const status = resumedBusterStatus();

  const result = await prepareModuleForBuster({
    config: config(),
    progress: {},
    moduleId: '01-nginx',
    mod: { title: 'nginx', stages: ['forge', 'buster'] },
    dir: '01-nginx',
    status,
    maxFails: 0,
    timeout: 1,
    stages: ['forge', 'buster'],
    deps: {
      saveStatus() {
        saveCalls += 1;
      },
      discord() {},
      handleFail() {
        throw new Error('handleFail should not run while preserving resumed Buster dispatch');
      },
      gitSyncBeforeBuster() {
        gitSyncCalls += 1;
        throw new Error('git sync must not run for an already-dispatched Buster phase');
      },
    },
  });

  assert.equal(gitSyncCalls, 0);
  assert.equal(saveCalls, 0);
  assert.equal(result.terminal, null);
  assert.equal(result.status.status, STATUS.TESTING);
  assert.equal(result.status.current_phase, 'buster');
  assert.equal(result.status.dispatch_id, 'buster-module-01-nginx-1784290000000-1');
});

test('pre-Buster preparation does not treat stale Forge dispatch as resumed Buster authority', async () => {
  let gitSyncCalls = 0;
  let saveCalls = 0;
  const status = contaminatedBusterStatus();

  const result = await prepareModuleForBuster({
    config: config(),
    progress: {},
    moduleId: '01-nginx',
    mod: { title: 'nginx', stages: ['forge', 'buster'] },
    dir: '01-nginx',
    status,
    maxFails: 0,
    timeout: 1,
    stages: ['forge', 'buster'],
    deps: {
      saveStatus() {
        saveCalls += 1;
      },
      discord() {},
      handleFail() {
        throw new Error('handleFail should not run while refreshing stale Buster phase identity');
      },
      async gitSyncBeforeBuster() {
        gitSyncCalls += 1;
        return { lifecycleMutation: null };
      },
    },
  });

  assert.equal(gitSyncCalls, 1);
  assert.equal(saveCalls, 1);
  assert.equal(result.terminal, null);
});
