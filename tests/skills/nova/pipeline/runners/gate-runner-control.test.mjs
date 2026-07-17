import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { buildGateStepResultFromControl } from '../../../../../skills/nova/pipeline/runners/gate-runner.ts';
import { normalizeStepResultForPipeline } from '../../../../../skills/nova/pipeline/runners/pipeline-runner-terminal.ts';
import { buildReviewGateControlResult } from '../../../../../skills/nova/pipeline/runners/review-gate-control.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-runner-control-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
      gate_active_session: { stale_ms: 1, timeout_ms: 1 },
    },
    _runId: 'run-test',
    run_id: 'run-test',
    _runStats: createRunStats(),
  };
}

test('gate control terminal reason preserves typed failure class over broad outcome class', () => {
  const config = makeConfig();
  const gateId = 'module-review';
  const gate = {
    type: 'review',
    title: 'Module review gate',
    review_name: 'REAL-E2E-MODULE-REVIEW',
    output_file: 'logs/echo-review/MODULE-REVIEW.json',
  };
  const controlResult = buildReviewGateControlResult(config, gateId, gate, {
    reason: 'Review invalid output: Review output must be valid JSON',
    failure_class: 'invalid_contract',
    outcome_class: 'error',
    attempt: 1,
  });

  const stepResult = buildGateStepResultFromControl(config, gateId, gate, controlResult);
  const normalized = normalizeStepResultForPipeline(stepResult, { type: 'gate', id: gateId });

  assert.equal(normalized.terminalDecision.reasonCode, 'invalid_contract');
  assert.equal(normalized.terminalDecision.scope, 'gate');
  assert.equal(normalized.terminalDecision.correlation.gate_id, gateId);
});

test('review gate timeout maps to timed-out terminal status', () => {
  const config = makeConfig();
  const gateId = 'module-review';
  const gate = {
    type: 'review',
    title: 'Module review gate',
    review_name: 'REAL-E2E-MODULE-REVIEW',
    output_file: 'logs/echo-review/MODULE-REVIEW.json',
  };
  const controlResult = buildReviewGateControlResult(config, gateId, gate, {
    reason: 'Review failed: Review file not received (timeout)',
    failure_class: 'timeout',
    attempt: 1,
  });

  const stepResult = buildGateStepResultFromControl(config, gateId, gate, controlResult);
  const normalized = normalizeStepResultForPipeline(stepResult, { type: 'gate', id: gateId });

  assert.equal(normalized.terminalStatus, 'timed_out');
  assert.equal(normalized.terminalDecision.reasonCode, 'timeout');
  assert.equal(normalized.terminalDecision.scope, 'gate');
});
