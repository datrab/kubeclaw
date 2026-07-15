import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildFullPipelineResumeCommand,
  buildNovaEscalation,
  handleFail,
} from '../../../../../../skills/nova/pipeline/services/failures/retry-policy.ts';
import { appendModuleLifecycleEvent, loadLifecycleReadModels } from '../../../../../../skills/nova/pipeline/services/status-store-lifecycle.ts';

function makeRetryPolicyConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-policy-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(path.join(swarmDir, 'modules', '01-nginx'), { recursive: true });
  return {
    project: 'retry-policy-test',
    repo_root: root,
    paths: {
      project_src_dir: root,
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    locks: {
      lifecycle_append: {
        stale_ms: 30_000,
        retry_ms: 1,
        timeout_ms: 1000,
      },
    },
    pipeline_defaults: {
      timeout_minutes: 5,
      max_fails: 2,
      auto_retry_threshold: 1,
      agent_startup_retry_budget: 1,
      session_nudge_threshold: 0,
    },
    _runId: 'run-retry-policy',
    run_id: 'run-retry-policy',
  };
}

test('full pipeline resume command shell-quotes dynamic arguments', () => {
  const command = buildFullPipelineResumeCommand(
    { project: "foo bar 'quoted'; touch /tmp/clawpatch-poc" },
    'try a safer approach',
  );

  assert.equal(
    command,
    "node pipeline.ts --project 'foo bar '\\''quoted'\\''; touch /tmp/clawpatch-poc' --resume --prompt 'try a safer approach'",
  );
});

test('needs-Nova escalation keeps terminal reason distinct from underlying failure class', () => {
  const result = buildNovaEscalation(
    {
      project: 'real-pipeline-e2e-real-e2e-test',
      run_id: 'run-test',
    },
    {
      status: 'FAIL',
      current_phase: 'buster',
      fail_count: 1,
      fail_summaries: [
        {
          attempt: 1,
          phase: 'buster',
          summary: 'unit failed',
          failure_class: 'test_failure',
          timestamp: '2026-07-12T00:00:00.000Z',
        },
      ],
    },
    '01-nginx',
    '01-nginx',
    2,
    'buster',
    false,
    1,
    {
      dispatch_id: 'buster-module-01-nginx-test',
      gateway_label: 'buster-module-01-nginx-test',
      session_key: 'agent:main:subagent:test',
    },
  );

  assert.equal(result.outcome, 'needs_nova');
  assert.equal(result.terminal.decision.action, 'request_handoff');
  assert.equal(result.terminal.decision.reasonCode, 'needs_nova');
  assert.equal(result.diagnostics.metadata.last_fail.failure_class, 'test_failure');
});

test('auto-retry lifecycle summary preserves concrete failure evidence', async (t) => {
  const config = makeRetryPolicyConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const status = {
    module_id: '01-nginx',
    title: 'Foundation',
    status: 'PENDING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    history: [],
  };
  appendModuleLifecycleEvent(config, '01-nginx', status, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    attempt: 1,
    now: '2026-07-13T00:00:00.000Z',
  });
  status.status = 'TESTING';
  status.current_phase = 'buster';
  const reason = 'NO_SUBAGENT: unit: FAIL - REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED';

  const result = await handleFail(config, status, '01-nginx', '01-nginx', 2, 'buster', reason, {
    progress: { auto_retry_threshold: 1, modules: { '01-nginx': { dir: '01-nginx' } } },
    dispatch_id: 'buster-module-01-nginx-test',
    gateway_label: 'buster-module-01-nginx-test',
    session_key: 'agent:test',
  });

  assert.equal(result._retry, true);
  assert.equal(status.fail_summaries[0].summary, reason);
  const readModels = loadLifecycleReadModels(config);
  assert.equal(readModels.modules['01-nginx'].fail_summaries.at(-1).summary, reason);
});
