import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { adapt } from '../../../skills/buster/plugins/junit-report-adapter/src/adapter.js';

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

console.log(JSON.stringify({ ok: true, phase: 9, layer: 'retained-comparison', realTool: 'node:test',
  legacyEvidence: 'immutable-record', replacement: 'junit', compatibilityRuntime: 'deleted' }));
