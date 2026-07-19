import assert from 'node:assert/strict';
import test from 'node:test';

import { __taskLifecycleTest } from '../../../../../skills/buster/pipeline/services/task-lifecycle.ts';

test('appendPreTestResultsToPrompt injects authoritative suite context and no-rebuild guidance', () => {
  const prompt = __taskLifecycleTest.appendPreTestResultsToPrompt('Base prompt', {
    suiteSummary: 'build passed; health passed; unit passed',
    results: [
      {
        suite: 'build',
        status: 'PASS',
        metadata: {
          tool: 'rootless-buildkit',
          image: 'localhost/pipeline-smoke-landing:module-01',
          port: 43101,
        },
      },
      {
        suite: 'health',
        status: 'PASS',
        metadata: {
          url: 'http://127.0.0.1:43101/health',
        },
      },
      {
        suite: 'unit',
        status: 'PASS',
      },
    ],
  });

  assert.equal(prompt.includes('## Pre-Test Results'), true);
  assert.equal(prompt.includes('These deterministic pre-test results are authoritative for build and initial app startup.'), true);
  assert.equal(prompt.includes('Do not run another image build, deployment, `npm start`, or local server'), true);
  assert.equal(prompt.includes('Build authority: rootless-buildkit already produced the runnable artifact for this attempt.'), true);
  assert.equal(prompt.includes('Runtime image: `localhost/pipeline-smoke-landing:module-01`'), true);
  assert.equal(prompt.includes('Running app URL: `http://127.0.0.1:43101/health`'), true);
});

test('appendPreTestResultsToPrompt places authoritative suite context before test instructions', () => {
  const prompt = __taskLifecycleTest.appendPreTestResultsToPrompt('before\n## Test Instructions\nrun checks\n', {
    suiteSummary: 'build passed',
    results: [{ suite: 'build', status: 'PASS' }],
  });

  assert.equal(prompt.indexOf('## Pre-Test Results') < prompt.indexOf('## Test Instructions'), true);
});

test('resolveAgentJudgmentPolicy defaults deterministic-suite tasks to no child agent', () => {
  const policy = __taskLifecycleTest.resolveAgentJudgmentPolicy({});

  assert.equal(policy.required, false);
  assert.equal(policy.reason, 'deterministic_suites_authoritative');
});

test('resolveAgentJudgmentPolicy requires explicit boolean when configured', () => {
  assert.equal(__taskLifecycleTest.resolveAgentJudgmentPolicy({
    agent_judgment: {
      required: true,
      reason: 'exploratory_browser_review_required',
    },
  }).required, true);

  assert.throws(
    () => __taskLifecycleTest.resolveAgentJudgmentPolicy({ agent_judgment: { required: 'yes' } }),
    /agent_judgment\.required must be a boolean/,
  );
});
