import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { buildBusterGateControlResult } from '../../../../../skills/nova/pipeline/runners/buster-gate-control.ts';
import { handleBusterGateEvaluationResult } from '../../../../../skills/nova/pipeline/runners/buster-gate-terminal.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-gate-terminal-'));
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

function makeVerdictCallbacks({ requestFixCalled }) {
  return {
    getGateStats: (config) => config._runStats,
    buildBusterGateControlResult,
    buildBusterRequestFixControlResult() {
      requestFixCalled.called = true;
      throw new Error('infrastructure suite failures must not request a code fix');
    },
    extractGateIssues(gateResult = {}) {
      const suites = gateResult.verdict?.suites || gateResult.suites || {};
      const issues = [];
      for (const [suiteName, suite] of Object.entries(suites)) {
        if (suite.status !== 'FAIL' && suite.status !== 'ERROR') continue;
        for (const finding of suite.findings || []) {
          issues.push({
            title: `${suiteName}: ${finding.message}`,
            description: finding.rule || '',
            severity: finding.severity || 'critical',
            affected_files: [],
          });
        }
      }
      return issues;
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
  assert.equal(result.issueType, 'contract');
  assert.equal(result.diagnostics.metadata.failure_class, 'completion_conflict');
  assert.equal(result.diagnostics.metadata.status.redis_status, 'PASS');
  assert.equal(result.diagnostics.typed.gate.outcomeClass, 'error');
});

test('k8s capability preflight failures block as infrastructure without entering the fix loop', async () => {
  const config = makeConfig();
  const requestFixCalled = { called: false };
  const result = await handleBusterGateEvaluationResult({
    config,
    deps: { async discord() {} },
    gateId: 'final-buster',
    gate: { type: 'buster', title: 'Final Buster' },
    result: {
      ok: false,
      reason: 'verdict_fail',
      status: {
        gate: 'final-buster',
        status: 'FAIL',
        reason: 'NO_SUBAGENT: k8s: FAIL - k8s-capability-preflight failed',
        run_id: 'run-test',
        attempt: 1,
        dispatch_id: 'dispatch-1',
        gateway_label: 'buster-final-buster',
        session_key: null,
        verdict: {
          suites: {
            k8s: {
              status: 'FAIL',
              critical: true,
              findings: [{
                severity: 'critical',
                rule: 'k8s-capability-preflight',
                message: 'k8s-capability-preflight failed: kubectl get --raw=/version returned HTML instead of Kubernetes API data',
              }],
            },
          },
        },
      },
    },
    attempt: 1,
    opts: {},
    correlation: {},
    timeout: 5,
    maxRateLimitPauses: 0,
    maxFixCycles: 1,
    hasFixLoop: true,
    gateStartedAt: Date.now(),
    callbacks: makeVerdictCallbacks({ requestFixCalled }),
  });

  assert.equal(requestFixCalled.called, false);
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.metadata.failure_class, 'k8s_infra_unavailable');
  assert.equal(result.diagnostics.typed.gate.outcomeClass, 'error');
  assert.deepEqual(config._runStats.gates_failed, ['final-buster']);
});

test('no-remediation Buster gate suite failures return terminal verdict without fix policy', async () => {
  const config = makeConfig();
  const requestFixCalled = { called: false };
  const result = await handleBusterGateEvaluationResult({
    config,
    deps: { async discord() {} },
    gateId: 'final-buster',
    gate: { type: 'buster', title: 'Final Buster', on_fail: 'fix_and_retest', max_fix_cycles: 0 },
    result: {
      ok: false,
      reason: 'verdict_fail',
      status: {
        gate: 'final-buster',
        status: 'FAIL',
        reason: 'NO_SUBAGENT: tailscale-preview: FAIL - static surface missing',
        run_id: 'run-test',
        attempt: 1,
        dispatch_id: 'dispatch-1',
        gateway_label: 'buster-final-buster',
        session_key: null,
        verdict: {
          suites: {
            'tailscale-preview': {
              status: 'FAIL',
              critical: true,
              findings: [{
                severity: 'critical',
                rule: 'static-surface-checks',
                message: 'static surface missing',
              }],
            },
          },
        },
      },
    },
    attempt: 1,
    opts: {},
    correlation: {},
    timeout: 5,
    maxRateLimitPauses: 0,
    maxFixCycles: 0,
    hasFixLoop: false,
    gateStartedAt: Date.now(),
    callbacks: makeVerdictCallbacks({ requestFixCalled }),
  });

  assert.equal(requestFixCalled.called, false);
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'code');
  assert.equal(result.diagnostics.metadata.failure_class, 'verdict_fail');
  assert.equal(result.diagnostics.typed.gate.outcomeClass, 'needs_nova');
  assert.match(result.diagnostics.summary, /static surface missing/);
  assert.deepEqual(config._runStats.gates_failed, ['final-buster']);
});
