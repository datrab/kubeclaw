import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { isReviewReport } from '../src/review-report-contract.ts';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { buildReviewReport } from '../src/review-report-builder.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { certifyReviewReductionInput } from '../src/review-reduction-state.ts';
import { makeReviewGovernor } from './fixtures/review-governor.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const evidenceContent = '{}';
const evidenceDigest = sha256Text(evidenceContent);
const contextContent = 'x\n';
const changedPaths = [{ path: 'src/a.ts', status: 'modified' }];
const snapshot = snapshotReviewBundle({
  schemaVersion: 'review-bundle.v1', task: { id: 'TASK-1', statement: 'Review.' },
  revisions: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text(canonicalJson(changedPaths)) },
  scope: { allowedPrefixes: ['src'], changedPaths },
  requirements: [{ id: 'REQ-1', statement: 'Works.' }],
  evidence: [{ kind: 'test', digest: evidenceDigest, content: evidenceContent }],
  context: [{ path: 'src/a.ts', content: contextContent, digest: sha256Text(contextContent), reasons: [{ kind: 'changed' }] }],
  selection: { version: 'focused-context.v1', candidateManifestDigest: digest, expansionRound: 0 },
  policyDigest: resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') }).digest,
});
const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') });
const governor = makeReviewGovernor(snapshot.bundle.revisions.changedManifestDigest, 'within_scope', policy.digest);
const finding = Object.freeze({
  fingerprint: digest, category: 'correctness', priority: 'P0', message: 'Broken.', recommendedFix: 'Fix it.',
  changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct', repairable: true, verified: true,
});
const reduction = certifyReviewReductionInput({
  resolvedPolicy: policy, integrityIssues: [], unverifiedRequirements: [], limitViolations: [], findings: [finding],
});
assert.ok(reduction);
const report = buildReviewReport({
  attemptId: 'attempt-1', snapshot, policy, parsed: { ok: false, error: 'not needed' },
  result: { schemaVersion: 'stage-result.v2', outcome: 'request_fix', reason: { code: 'x', message: 'x' }, artifacts: [] },
  findings: [finding], governor,
});
assert.equal(Object.values(report.items)[0]?.disposition, 'blocker');
assert.equal(report.omitted.blocker, 0);
assert.equal(report.outcome, 'request_fix');

const secondFinding = Object.freeze({
  ...finding, fingerprint: `sha256:${'b'.repeat(64)}`, message: 'Also broken.', recommendedFix: 'Fix that too.',
});
const ordered = buildReviewReport({
  attemptId: 'attempt-2', snapshot, policy, parsed: { ok: false, error: 'not needed' },
  result: { schemaVersion: 'stage-result.v2', outcome: 'request_fix', reason: { code: 'x', message: 'x' }, artifacts: [] },
  findings: [finding, secondFinding], governor,
});
const reversed = buildReviewReport({
  attemptId: 'attempt-2', snapshot, policy, parsed: { ok: false, error: 'not needed' },
  result: { schemaVersion: 'stage-result.v2', outcome: 'request_fix', reason: { code: 'x', message: 'x' }, artifacts: [] },
  findings: [secondFinding, finding], governor,
});
assert.equal(canonicalJson(ordered), canonicalJson(reversed), 'report output is independent of finding order');
const proposalId = `sha256:${'c'.repeat(64)}`;
const confirmedWithoutFinding = buildReviewReport({
  attemptId: 'attempt-3', snapshot, policy, parsed: { ok: true, value: {} },
  result: {
    schemaVersion: 'stage-result.v2', outcome: 'blocked',
    reason: { code: 'x', message: 'verified finding normalization failed' }, artifacts: [],
  },
  preflight: { proposals: { [proposalId]: { finding: {
    category: 'correctness', priority: 'P0', claim: 'The contract is broken.', impact: 'Callers fail.',
    locations: [{ path: 'src/a.ts', lineHint: 1 }], evidence: [], recommendedFix: 'Repair it.',
    changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
  } } }, eligibleProposalIds: [proposalId], proposalSetDigest: digest,
  exactDuplicateCount: 0, integrityIssues: [], limitViolations: [] },
  reconciliation: { confirmedProposalIds: [proposalId] }, findings: [], governor,
});
assert.equal(Object.values(confirmedWithoutFinding.items)[0]?.disposition, 'follow_up');
assert.match(Object.values(confirmedWithoutFinding.items)[0]?.reason ?? '', /normalized verified finding was unavailable/u);

const custom = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate'),
  settingsFile: { ...getReviewPolicyProfile('gate'), profile: 'custom.settings' } });
const customSnapshot = snapshotReviewBundle({ ...snapshot.bundle, policyDigest: custom.digest });
const customReport = buildReviewReport({ attemptId: 'custom-attempt', snapshot: customSnapshot, policy: custom,
  parsed: { ok: false, error: 'report construction only' }, findings: [],
  result: { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] },
  governor: makeReviewGovernor(snapshot.bundle.revisions.changedManifestDigest, 'within_scope', custom.digest) });
const validateReport = new Ajv2020({ strict: true }).compile(JSON.parse(fs.readFileSync(
  new URL('../schemas/review-report.v2.schema.json', import.meta.url), 'utf8')));
assert.equal(customReport.profile, 'custom.settings');
assert.equal(isReviewReport(customReport), true);
assert.equal(validateReport(customReport), true, JSON.stringify(validateReport.errors));
for (const profile of ['', 'bad profile', 'x'.repeat(129)]) {
  assert.equal(isReviewReport({ ...customReport, profile }), false);
  assert.equal(validateReport({ ...customReport, profile }), false);
}
console.log('review report builder unit tests passed');
