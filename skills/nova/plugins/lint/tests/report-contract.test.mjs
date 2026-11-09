import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { validateLintReport } from '../src/engine/report-contract.ts';

const policyDigest = '1'.repeat(64);
const baselineDigest = '2'.repeat(64);
const content = 'bounded evidence\n';
const evidenceDigest = crypto.createHash('sha256').update(content).digest('hex');

function report() {
  return {
    schema_version: 'pipeline_lint_report.v7',
    policy: {
      schema_version: 'pipeline_lint_policy.v7',
      digest: policyDigest,
      project: 'fixture',
      config_digests: {},
      policy_pack_digests: { fixture: '3'.repeat(64) },
      effective_targets: { fixture: ['.'] },
      baseline_digest: baselineDigest,
    },
    project: 'fixture',
    scope: 'full',
    timestamp: '2026-09-20T00:00:00.000Z',
    tier: 'full',
    visibility: { debt: false, experimental: false },
    changed_files: [],
    detected_types: ['javascript'],
    diagnostics: [],
    tools: {
      fixture: {
        status: 'ok', category: 'lint', scope: 'repository', blocking_severity: 'error', mode: 'blocking',
        duration_ms: 1, errors: 1, warnings: 0, blocking_findings: 1, baselined_findings: 0,
        experimental_findings: 0,
        findings: [{ file: 'src/input.js', line: 1, column: 1, severity: 'error', code: 'fixture/rule', message: 'Fix the fixture.', fingerprint: 'a'.repeat(64) }],
        evidence: [{ kind: 'fixture', source: 'src/input.js', sha256: evidenceDigest, bytes: Buffer.byteLength(content), content }],
      },
    },
    summary: { total_errors: 1, total_warnings: 0, total_blocking: 1, total_baselined: 0, total_experimental: 0, tools_ok: 1, tools_not_applicable: 0, tools_failed: 0 },
  };
}

const expected = {
  policyProject: 'fixture', policyDigest, baselineDigest, configDigests: {}, policyPackDigests: { fixture: '3'.repeat(64) },
  effectiveTargets: { fixture: ['.'] }, project: 'fixture', tier: 'full', scope: 'full', changedFiles: [], visibility: { debt: false, experimental: false },
  toolIds: ['fixture'],
  toolPolicies: { fixture: { category: 'lint', scope: 'repository', blocking_severity: 'error', mode: 'blocking' } },
};

function hostile(name, mutate, pattern) {
  const value = structuredClone(report());
  mutate(value);
  assert.throws(() => validateLintReport(value, expected), pattern, name);
}

validateLintReport(report(), expected);
hostile('missing tool', (value) => { value.tools = {}; value.summary = { total_errors: 0, total_warnings: 0, total_blocking: 0, total_baselined: 0, total_experimental: 0, tools_ok: 0, tools_not_applicable: 0, tools_failed: 0 }; }, /exact tool inventory/u);
hostile('false total', (value) => { value.summary.total_blocking = 0; }, /expected 1 from tool results/u);
hostile('changed policy identity', (value) => { value.policy.digest = '9'.repeat(64); }, /does not match configured policy/u);
hostile('changed pack identity', (value) => { value.policy.policy_pack_digests.fixture = '8'.repeat(64); }, /does not match configured identity/u);
hostile('changed targets', (value) => { value.policy.effective_targets.fixture = ['src']; }, /does not match configured targets/u);
hostile('invalid fingerprint', (value) => { value.tools.fixture.findings[0].fingerprint = 'not-a-digest'; }, /required lowercase SHA-256/u);
hostile('excess evidence', (value) => { value.tools.fixture.evidence = Array.from({ length: 257 }, () => value.tools.fixture.evidence[0]); }, /at most 256 entries/u);
hostile('hidden debt', (value) => {
  value.tools.fixture.findings[0].baseline = { owner: 'owner', reason: 'reason', created: '2026-09-20', expires: '2026-10-20', tracking: 'TRACK-1', approved_by: 'approver', approved_on: '2026-09-20' };
  value.tools.fixture.baselined_findings = 1;
}, /normal output must not contain debt findings/u);

const fixturePath = new URL('../src/report-contract-hostile-fixture.json', import.meta.url);
fs.writeFileSync(fixturePath, `${JSON.stringify(report(), null, 2)}\n`);
try {
  const stored = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  validateLintReport(stored, expected);
} finally {
  fs.rmSync(fixturePath, { force: true });
}

console.log(JSON.stringify({ ok: true, suite: 'lint-report-contract', hostileCases: 8, cleanup: true }));
