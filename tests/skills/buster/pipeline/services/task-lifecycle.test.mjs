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
          tool: 'podman-run',
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
  assert.equal(prompt.includes('Do not run `npm run build`, `docker build`, `podman build`, `npm start`, or start a second local server'), true);
  assert.equal(prompt.includes('Build authority: podman-run already produced the runnable artifact for this attempt.'), true);
  assert.equal(prompt.includes('Runtime image: `localhost/pipeline-smoke-landing:module-01`'), true);
  assert.equal(prompt.includes('Running app URL: `http://127.0.0.1:43101/health`'), true);
});
