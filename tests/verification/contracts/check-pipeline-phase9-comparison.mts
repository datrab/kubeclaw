import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { adapt } from '../../../skills/buster/plugins/junit-report-adapter/src/adapter.js';
import { runLegacyAuthoritativeShadowComparison } from '../../../skills/nova/core/src/index.ts';

const limits = { maximumCases: 100, maximumFindings: 100, maximumCaseFindings: 10 };
const junit = (xml: string) => adapt({ mediaType: 'application/junit+xml', bytes: Buffer.from(xml), limits });
const fixtureDirectory = path.resolve('tests/fixtures/pipeline-test-gate/unit-parity');
const recorded = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, 'legacy-comparison.v1.json'), 'utf8')) as {
  schemaVersion: string;
  legacy: {
    pass: { total: number; passed: number; failed: number; skipped: number };
    fail: { total: number; passed: number; failed: number; skipped: number };
  };
  acceptedReplacement: {
    pass: { total: number; passed: number; failed: number; skipped: number };
    fail: { total: number; passed: number; failed: number; skipped: number };
  };
};
assert.equal(recorded.schemaVersion, 'legacy-unit-comparison.v1');

function run(file: string): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync(process.execPath,
      ['--test', '--test-reporter=junit', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error: any) {
    return { code: Number(error.status ?? 1), output: `${String(error.stdout ?? '')}${String(error.stderr ?? '')}` };
  }
}

const passRun = run(path.join(fixtureDirectory, 'passing.test.mjs'));
const pass = junit(passRun.output);
assert.equal(passRun.code, 0);
assert.deepEqual(pass.counts, {
  total: recorded.acceptedReplacement.pass.total,
  passed: recorded.acceptedReplacement.pass.passed,
  failed: recorded.acceptedReplacement.pass.failed,
  errored: 0,
  skipped: recorded.acceptedReplacement.pass.skipped,
});

const failRun = run(path.join(fixtureDirectory, 'failing.test.mjs'));
const fail = junit(failRun.output);
assert.notEqual(failRun.code, 0);
assert.deepEqual(fail.counts, {
  total: recorded.acceptedReplacement.fail.total,
  passed: recorded.acceptedReplacement.fail.passed,
  failed: recorded.acceptedReplacement.fail.failed,
  errored: 0,
  skipped: recorded.acceptedReplacement.fail.skipped,
});
assert.equal(fail.cases.some((item) => item.findings.length > 0), true);
assert.equal(recorded.legacy.pass.skipped, 0, 'immutable legacy evidence records the TAP parser detail loss');
assert.equal(pass.counts.skipped, 1, 'the accepted replacement retains the skipped case');

const comparison = await runLegacyAuthoritativeShadowComparison({
  shadowTimeoutMs: 1_000,
  runLegacy: async () => ({ state: 'failed', source: 'legacy', reason: 'recorded authoritative fixture failure' }),
  runShadow: async () => ({ state: 'passed', source: 'replacement', reason: 'shadow-only difference' }),
});
assert.equal(comparison.authority, 'legacy');
assert.equal(comparison.gateResult, comparison.legacy);
assert.equal(comparison.shadow.status, 'deferred');
const completedShadow = await comparison.collectShadow();
assert.equal(completedShadow.status, 'completed');
if (completedShadow.status === 'completed') assert.notEqual(comparison.gateResult, completedShadow.result);
assert.equal(await comparison.collectShadow(), completedShadow, 'shadow collection must be idempotent');

const failedShadow = await runLegacyAuthoritativeShadowComparison({
  shadowTimeoutMs: 1_000,
  runLegacy: async () => ({ state: 'passed', source: 'legacy' }),
  runShadow: async () => { throw new Error('shadow provider crashed'); },
});
assert.equal(failedShadow.gateResult.state, 'passed');
assert.deepEqual(await failedShadow.collectShadow(), {
  status: 'failed', error: { name: 'Error', message: 'shadow provider crashed' },
});

let timedOutShadowWasAborted = false;
const timedOutShadow = await runLegacyAuthoritativeShadowComparison({
  shadowTimeoutMs: 25,
  runLegacy: async () => ({ state: 'passed', source: 'legacy' }),
  runShadow: (signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => {
      timedOutShadowWasAborted = true;
      resolve({ state: 'completed-during-abort' });
    }, { once: true });
  }),
});
assert.deepEqual(await timedOutShadow.collectShadow(), { status: 'timed-out', timeoutMs: 25 });
assert.equal(timedOutShadowWasAborted, true);

console.log(JSON.stringify({ ok: true, phase: 9, layer: 'retained-comparison', realTool: 'node:test',
  legacyEvidence: 'immutable-record', replacement: 'junit', cutover: 'phase10' }));
