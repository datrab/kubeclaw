import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve('scripts/lint-baseline-update.mjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-baseline-update-'));
  const baselinePath = path.join(root, 'lint-baseline.json');
  const reportPath = path.join(root, 'lint-report.json');
  const baselineSource = '{"schema_version":"pipeline_lint_baseline.v2","groups":[]}\n';
  fs.writeFileSync(baselinePath, baselineSource);
  fs.writeFileSync(reportPath, JSON.stringify({
    schema_version: 'pipeline_lint_report.v6',
    policy: { baseline_digest: crypto.createHash('sha256').update(baselineSource).digest('hex') },
    tools: { tsc: { status: 'ok', mode: 'blocking', findings: [{ fingerprint: 'a'.repeat(64) }] } },
  }));
  return { baselinePath, reportPath };
}

function args({ baselinePath, reportPath }) {
  return [SCRIPT, '--report', reportPath, '--baseline', baselinePath, '--tool', 'tsc', '--owner', 'platform', '--reason', 'migration debt', '--created', '2026-07-20', '--expires', '2026-08-20', '--tracking', 'DEBT-1', '--approved-by', 'maintainer', '--approved-on', '2026-07-20'];
}

test('baseline updater adds only explicitly approved stable fingerprints', () => {
  const files = fixture();
  const result = spawnSync(process.execPath, args(files), { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const baseline = JSON.parse(fs.readFileSync(files.baselinePath, 'utf8'));
  assert.equal(baseline.groups[0].approved_by, 'maintainer');
  assert.deepEqual(baseline.groups[0].fingerprints, ['a'.repeat(64)]);
});

test('baseline updater rejects missing approval and stale report authority', () => {
  const files = fixture();
  const withoutApproval = args(files);
  withoutApproval.splice(withoutApproval.indexOf('--approved-by'), 2);
  assert.notEqual(spawnSync(process.execPath, withoutApproval, { encoding: 'utf8' }).status, 0);
  fs.appendFileSync(files.baselinePath, ' ');
  const stale = spawnSync(process.execPath, args(files), { encoding: 'utf8' });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /current baseline/);
});
