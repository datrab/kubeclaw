import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { cleanupReviewFiles, runReviewGateEvaluation } from '../../../../../skills/nova/pipeline/runners/review-gate-runner.ts';
import { reviewOutputPath } from '../../../../../skills/nova/pipeline/runners/review-gate-task.ts';
import { makeGateTestConfig } from './gate-test-fixtures.mjs';

const makeConfig = () => makeGateTestConfig('review-gate-runner-');

function makeProgress() {
  return {
    gates: {
      review: {
        type: 'review',
        title: 'Review Gate',
        review_name: 'main',
        on_fail: 'stop',
      },
    },
  };
}

function makeReviewConfig() {
  return {
    reviewers: [{ label: 'echo', model: 'test-model' }],
    primaryReviewer: { label: 'echo', model: 'test-model' },
    timeout: 1,
    maxFixCycles: 2,
    lintTier: 'full',
    lintRequired: true,
  };
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

test('re-review infrastructure errors block instead of requesting another fix', async () => {
  const config = makeConfig();
  const progress = makeProgress();
  let runOnceCalls = 0;

  const result = await runReviewGateEvaluation(config, progress, 'review', {
    attempt: 2,
    skipStartedTelemetry: true,
    reviewConfig: makeReviewConfig(),
    remediation: {
      correlation: {
        gateway_label: 'echo-review',
        session_key: 'session-1',
      },
      diagnostics: {
        issues: [{ description: 'previous FAIL issue' }],
        last_review: {
          status: 'FAIL',
          critical_issues: [{ description: 'previous FAIL issue' }],
        },
      },
    },
    deps: {
      async runOnce() {
        runOnceCalls++;
        return {
          ok: false,
          error: 'Reviewer spawn failed: gateway unavailable',
          gateway_label: 'echo-review',
          session_key: 'session-2',
        };
      },
    },
  });

  assert.equal(runOnceCalls, 1);
  assert.equal(result.nextAction, 'block');
  assert.equal(result.issueType, 'environment');
  assert.equal(result.diagnostics.metadata.failure_class, 'review_failed');
  assert.equal(result.diagnostics.metadata.attempt, 2);
  assert.equal(result.diagnostics.typed.gate.outcomeClass, 'error');
  assert.equal(result.diagnostics.findings[0].environmentIssue, true);
});

test('cleanupReviewFiles stages tracked deletions even when untracked review artifacts are also cleaned', async () => {
  const config = makeConfig();
  const gate = {
    type: 'review',
    title: 'Review Gate',
    review_name: 'main',
    review_output_dir: 'echo-reviews',
    output_file: 'canonical/review-output.json',
  };
  const reviewerOutputPath = reviewOutputPath(config, gate, 'echo');
  const untrackedReviewerOutputPath = reviewOutputPath(config, gate, 'shadow');
  const canonicalOutputPath = path.join(config.paths.swarm_dir, gate.output_file);
  const unrelatedPath = path.join(config.repo_root, 'unrelated.txt');

  git(config.repo_root, ['init']);
  git(config.repo_root, ['config', 'user.email', 'test@example.com']);
  git(config.repo_root, ['config', 'user.name', 'Test User']);

  fs.mkdirSync(path.dirname(reviewerOutputPath), { recursive: true });
  fs.mkdirSync(path.dirname(untrackedReviewerOutputPath), { recursive: true });
  fs.mkdirSync(path.dirname(canonicalOutputPath), { recursive: true });
  fs.writeFileSync(reviewerOutputPath, '{"status":"FAIL"}\n');
  fs.writeFileSync(canonicalOutputPath, '{"status":"FAIL"}\n');
  fs.writeFileSync(unrelatedPath, 'original\n');
  git(config.repo_root, ['add', '.']);
  git(config.repo_root, ['commit', '-m', 'initial']);

  fs.writeFileSync(unrelatedPath, 'dirty unrelated change\n');
  fs.writeFileSync(untrackedReviewerOutputPath, '{"status":"FAIL","transient":true}\n');

  await cleanupReviewFiles(config, gate, [{ label: 'echo' }, { label: 'shadow' }]);

  assert.equal(git(config.repo_root, ['diff', '--name-only', '--cached']), '');
  assert.equal(git(config.repo_root, ['diff', '--name-only']), 'unrelated.txt');
  assert.equal(fs.existsSync(reviewerOutputPath), false);
  assert.equal(fs.existsSync(untrackedReviewerOutputPath), false);
  assert.equal(fs.existsSync(canonicalOutputPath), false);

  const committedFiles = git(config.repo_root, ['diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD'])
    .split('\n')
    .filter(Boolean);
  assert.deepEqual(committedFiles.sort(), [
    'D\t.swarm/canonical/review-output.json',
    'D\t.swarm/echo-reviews/echo-main.json',
  ]);
});
