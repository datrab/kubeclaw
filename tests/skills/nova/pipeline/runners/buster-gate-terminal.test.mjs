import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { buildBusterGateControlResult } from '../../../../../skills/nova/pipeline/runners/buster-gate-control.ts';
import { handleBusterGateEvaluationResult } from '../../../../../skills/nova/pipeline/runners/buster-gate-terminal.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join('/app', 'buster-gate-terminal-'));
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
    _runStats: createRunStats(),
  };
}

function makeCallbacks({ requestFixCalled }) {
  return {
    getGateStats: (config) => config._runStats,
    buildBusterGateControlResult,
    buildBusterRequestFixControlResult() {
      requestFixCalled.called = true;
      throw new Error('non-verdict completion failure must not request a fix');
    },
    extractGateIssues() {
      throw new Error('non-verdict completion failure must not be treated as verdict issues');
    },
    telemetryCtx: (config) => ({ config, runId: config.run_id, stats: config._runStats }),
  };
}

async function evaluateNonVerdictCompletionFailure(reason, status = {}) {
  const config = makeConfig();
  const requestFixCalled = { called: false };
  const result = await handleBusterGateEvaluationResult({
    config,
    deps: { async discord() {} },
    gateId: 'security',
    gate: { type: 'buster', title: 'Security Gate' },
    result: {
      ok: false,
      reason,
      status: {
        gate: 'security',
        reason: 'completion infrastructure failed',
        run_id: 'run-test',
        attempt: 1,
        dispatch_id: 'dispatch-1',
        gateway_label: 'buster-security',
        session_key: 'session-1',
        ...status,
      },
    },
    attempt: 1,
    opts: {},
    correlation: {},
    timeout: 1,
    maxRateLimitPauses: 0,
    maxFixCycles: 2,
    hasFixLoop: true,
    gateStartedAt: Date.now(),
    callbacks: makeCallbacks({ requestFixCalled }),
  });
  return { config, requestFixCalled, result };
}

test('completion archive failures block without entering the fix loop', async () => {
  const { config, requestFixCalled, result } = await evaluateNonVerdictCompletionFailure('completion_archive_failed');

  assert.equal(requestFixCalled.called, false);
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.metadata.failure_class, 'completion_archive_failed');
  assert.equal(result.diagnostics.typed.gate.outcomeClass, 'error');
  assert.deepEqual(config._runStats.gates_failed, ['security']);
});

test('completion conflicts block as contract failures without entering the fix loop', async () => {
  const { requestFixCalled, result } = await evaluateNonVerdictCompletionFailure('completion_conflict', {
    redis_status: 'PASS',
    local_status: 'FAIL',
  });

  assert.equal(requestFixCalled.called, false);
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'unknown');
  assert.equal(result.diagnostics.metadata.failure_class, 'completion_conflict');
  assert.equal(result.diagnostics.metadata.status.redis_status, 'PASS');
  assert.equal(result.diagnostics.typed.gate.outcomeClass, 'error');
});
