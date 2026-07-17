import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { appendModuleLifecycleEvent } from '../../../../../skills/nova/pipeline/services/status-store.ts';
import { reviewOutputPath, runReviewGateOnce } from '../../../../../skills/nova/pipeline/runners/review-gate-task.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join('/app', 'review-gate-task-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    pipeline_defaults: {
      timeout_minutes: 1,
      max_fails: 0,
      auto_retry_threshold: 0,
      agent_startup_retry_budget: 0,
      session_nudge_threshold: 0,
    },
    rate_limit: { max_pauses_per_module: 0, cooldown_hours: 0, cooldown_buffer_ms: 0 },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
      gate_active_session: { stale_ms: 1, timeout_ms: 1 },
    },
    _runId: 'run-test',
    run_id: 'run-test',
    _runStats: createRunStats(),
  };
}

function makeDeps({ outputFilePath }) {
  return {
    generateLintReport() {
      return {
        report: {
          summary: {
            total_errors: 0,
            total_warnings: 0,
          },
        },
        error: null,
      };
    },
    formatLintReportForReviewer() {
      return 'lint ok';
    },
    readGateInstructions() {
      return 'review instructions';
    },
    buildReviewerPrompt() {
      return { prompt: 'review prompt' };
    },
    archiveGateOutputIfPresent() {
      throw new Error('archive failed');
    },
    resolvePolicy() {
      return { model: 'test-model', model_source: 'test', thinking: null };
    },
    logEffectivePolicy() {},
    async spawnReviewerAgent() {},
    getTrackedAgent() {
      return null;
    },
    async pollForFile() {
      assert.equal(fs.existsSync(outputFilePath), false, 'stale review output should be removed before polling');
      return { ok: false, reason: 'timeout' };
    },
    sleep() {},
    discord() {},
    async killReviewerAgent() {
      return true;
    },
    async gitCommitAndPush() {
      throw new Error('git should not run when review output was not received');
    },
  };
}

function makeSuccessfulDeps({ outputFilePath, canonicalOutputPath, onCommit }) {
  return {
    generateLintReport() {
      return {
        report: {
          summary: {
            total_errors: 0,
            total_warnings: 0,
          },
        },
        error: null,
      };
    },
    formatLintReportForReviewer() {
      return 'lint ok';
    },
    readGateInstructions() {
      return 'review instructions';
    },
    buildReviewerPrompt() {
      return { prompt: 'review prompt' };
    },
    archiveGateOutputIfPresent() {
      return null;
    },
    resolvePolicy() {
      return { model: 'test-model', model_source: 'test', thinking: null };
    },
    logEffectivePolicy() {},
    async spawnReviewerAgent() {},
    getTrackedAgent() {
      return null;
    },
    async pollForFile() {
      fs.writeFileSync(outputFilePath, JSON.stringify({
        status: 'PASS',
        critical_issues: [],
        deferred_issues: [],
        checked_contracts: ['.swarm/contracts/module-review.json'],
        opened_artifacts: ['.swarm/logs/modules/01-nginx/buster-output.json'],
        failed_commands: [],
        unverified_requirements: [],
        summary: 'review passed',
      }));
      return { ok: true };
    },
    sleep() {},
    discord() {},
    async killReviewerAgent() {
      return true;
    },
    async gitCommitAndPush(_config, _message, options = {}) {
      onCommit(options);
      return { committed: true };
    },
  };
}

function makeInvalidOutputDeps({ outputFilePath }) {
  return {
    generateLintReport() {
      return {
        report: {
          summary: {
            total_errors: 0,
            total_warnings: 0,
          },
        },
        error: null,
      };
    },
    formatLintReportForReviewer() {
      return 'lint ok';
    },
    readGateInstructions() {
      return 'review instructions';
    },
    buildReviewerPrompt() {
      return { prompt: 'review prompt' };
    },
    archiveGateOutputIfPresent() {
      return null;
    },
    resolvePolicy() {
      return { model: 'test-model', model_source: 'test', thinking: null };
    },
    logEffectivePolicy() {},
    async spawnReviewerAgent() {},
    getTrackedAgent() {
      return null;
    },
    async pollForFile() {
      fs.writeFileSync(outputFilePath, '{not json');
      return { ok: true };
    },
    sleep() {},
    discord() {},
    async killReviewerAgent() {
      return true;
    },
    async gitCommitAndPush() {
      throw new Error('git should not run for invalid review output');
    },
  };
}

test('runReviewGateOnce removes stale review output even when archival fails', async () => {
  const config = makeConfig();
  const gateId = 'review-gate';
  const gate = {
    type: 'review',
    title: 'Review Gate',
    review_name: 'main',
    review_output_dir: 'echo-reviews',
  };
  const reviewConfig = {
    reviewers: [{ label: 'echo', model: 'test-model' }],
    primaryReviewer: { label: 'echo', model: 'test-model' },
    timeout: 1,
    lintTier: 'full',
    lintRequired: true,
  };
  const outputFilePath = reviewOutputPath(config, gate, 'echo');
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
  fs.writeFileSync(outputFilePath, JSON.stringify({
    status: 'PASS',
    critical_issues: [],
    deferred_issues: [],
    summary: 'stale pass',
  }));

  const result = await runReviewGateOnce({
    deps: makeDeps({ outputFilePath }),
    config,
    progress: {},
    gateId,
    gate,
    reviewConfig,
    reviewAttempt: 1,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Review file not received/);
  assert.equal(result.failure_class, 'timeout');
  assert.equal(fs.existsSync(outputFilePath), false);
});

test('runReviewGateOnce writes canonical gate output before publishing review artifacts', async () => {
  const config = makeConfig();
  const gateId = 'review-gate';
  const gate = {
    type: 'review',
    title: 'Review Gate',
    review_name: 'main',
    review_output_dir: 'echo-reviews',
    output_file: 'canonical/review-output.json',
  };
  const reviewConfig = {
    reviewers: [{ label: 'echo', model: 'test-model' }],
    primaryReviewer: { label: 'echo', model: 'test-model' },
    timeout: 1,
    lintTier: 'full',
    lintRequired: true,
  };
  const outputFilePath = reviewOutputPath(config, gate, 'echo');
  const canonicalOutputPath = path.join(config.paths.swarm_dir, gate.output_file);
  let commitObservedCanonical = false;

  const result = await runReviewGateOnce({
    deps: makeSuccessfulDeps({
      outputFilePath,
      canonicalOutputPath,
      onCommit(options) {
        assert.equal(fs.existsSync(outputFilePath), true, 'reviewer output should exist before publish');
        assert.equal(fs.existsSync(canonicalOutputPath), true, 'canonical gate output should exist before publish');
        assert.deepEqual(
          JSON.parse(fs.readFileSync(canonicalOutputPath, 'utf8')),
          JSON.parse(fs.readFileSync(outputFilePath, 'utf8')),
        );
        assert.deepEqual(options.addPaths.sort(), [
          '.swarm/canonical/review-output.json',
          '.swarm/echo-reviews/echo-main.json',
          '.swarm/logs/gates/review-gate',
        ].sort());
        assert.deepEqual(options.conflictPaths, options.addPaths);
        commitObservedCanonical = true;
      },
    }),
    config,
    progress: {},
    gateId,
    gate,
    reviewConfig,
    reviewAttempt: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(commitObservedCanonical, true);
});

test('runReviewGateOnce scopes full lint to the reviewed module when gate order implies one', async () => {
  const config = makeConfig();
  const gateId = 'module-01-review';
  const gate = {
    type: 'review',
    title: 'Review Gate',
    review_name: 'main',
    review_output_dir: 'echo-reviews',
  };
  const reviewConfig = {
    reviewers: [{ label: 'echo', model: 'test-model' }],
    primaryReviewer: { label: 'echo', model: 'test-model' },
    timeout: 1,
    lintTier: 'full',
    lintRequired: true,
  };
  const outputFilePath = reviewOutputPath(config, gate, 'echo');
  let lintArgs = null;

  appendModuleLifecycleEvent(config, '01-foundation', {
    module_id: '01-foundation',
    title: 'Foundation',
    current_attempt: 1,
  }, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
  });

  appendModuleLifecycleEvent(config, '01-foundation', {
    module_id: '01-foundation',
    title: 'Foundation',
    current_attempt: 1,
    completion_summary: 'passed',
    commit_hash: 'abc123',
  }, {
    eventType: 'module_attempt.passed',
    oldStatus: 'TESTING',
  });

  const deps = {
    ...makeSuccessfulDeps({
      outputFilePath,
      canonicalOutputPath: path.join(config.paths.swarm_dir, 'unused.json'),
      onCommit() {},
    }),
    generateLintReport(_config, _tier, opts) {
      lintArgs = opts;
      return {
        report: {
          summary: {
            total_errors: 0,
            total_warnings: 0,
          },
        },
        error: null,
      };
    },
  };

  const result = await runReviewGateOnce({
    deps,
    config,
    progress: {
      execution_order: ['01-foundation', 'gate:module-01-review'],
      modules: {
        '01-foundation': { dir: '01-foundation' },
      },
      gates: {
        'module-01-review': gate,
      },
    },
    gateId,
    gate,
    reviewConfig,
    reviewAttempt: 1,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(lintArgs, {
    moduleDir: '01-foundation',
    moduleId: '01-foundation',
    forgeDiffStat: null,
    commitHash: 'abc123',
    logPath: path.join(config.paths.swarm_dir, 'logs', 'gates', gateId, 'lint', 'full-trace-attempt-1.jsonl'),
  });
});

test('runReviewGateOnce validates review output before publishing artifacts', async () => {
  const config = makeConfig();
  const gateId = 'review-gate';
  const gate = {
    type: 'review',
    title: 'Review Gate',
    review_name: 'main',
    review_output_dir: 'echo-reviews',
    output_file: 'canonical/review-output.json',
  };
  const reviewConfig = {
    reviewers: [{ label: 'echo', model: 'test-model' }],
    primaryReviewer: { label: 'echo', model: 'test-model' },
    timeout: 1,
    lintTier: 'full',
    lintRequired: true,
  };
  const outputFilePath = reviewOutputPath(config, gate, 'echo');
  const canonicalOutputPath = path.join(config.paths.swarm_dir, gate.output_file);

  const result = await runReviewGateOnce({
    deps: makeInvalidOutputDeps({ outputFilePath }),
    config,
    progress: {},
    gateId,
    gate,
    reviewConfig,
    reviewAttempt: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.invalid_contract, true);
  assert.match(result.error, /valid JSON/);
  assert.equal(fs.existsSync(canonicalOutputPath), false, 'invalid output should not be staged as canonical output');
});
