import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
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
    rate_limit: {
      max_pauses_per_module: 0,
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
        summary: 'review passed',
      }));
      return { ok: true };
    },
    sleep() {},
    discord() {},
    async killReviewerAgent() {
      return true;
    },
    async gitCommitAndPush() {
      onCommit();
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
      onCommit() {
        assert.equal(fs.existsSync(outputFilePath), true, 'reviewer output should exist before publish');
        assert.equal(fs.existsSync(canonicalOutputPath), true, 'canonical gate output should exist before publish');
        assert.deepEqual(
          JSON.parse(fs.readFileSync(canonicalOutputPath, 'utf8')),
          JSON.parse(fs.readFileSync(outputFilePath, 'utf8')),
        );
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
