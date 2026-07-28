import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { resultForReport } = await import(pathToFileURL(path.resolve('dist/stage.js')).href);
const artifact = {
  artifactId: 'lint:test',
  namespace: 'kubeclaw.lint',
  mediaType: 'application/json',
  digest: `sha256:${'0'.repeat(64)}`,
  sizeBytes: 2,
  producer: {
    runId: 'run:test',
    stageId: 'lint',
    attemptId: 'attempt:test',
  },
};

assert.equal(resultForReport({ summary: { tools_failed: 0, total_blocking: 0 } }, artifact).outcome, 'passed');
assert.equal(resultForReport({ summary: { tools_failed: 0, total_blocking: 2 } }, artifact).outcome, 'request_fix');
assert.equal(resultForReport({ summary: { tools_failed: 1, total_blocking: 0 } }, artifact).outcome, 'blocked');
assert.equal(resultForReport({ summary: { tools_failed: 1, total_blocking: 2 } }, artifact).outcome, 'blocked');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.lint', suite: 'unit' }));
