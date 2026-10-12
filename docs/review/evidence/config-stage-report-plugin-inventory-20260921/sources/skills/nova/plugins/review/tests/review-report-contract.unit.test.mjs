import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { isReviewReport } from '../src/review-report-contract.ts';
import { makeReviewGovernor } from './fixtures/review-governor.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const report = {
  schemaVersion: 'review-report.v2', attemptId: 'attempt-1', taskId: 'TASK-1', profile: 'lean',
  policyDigest: digest, bundleDigest: digest,
  revision: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: digest },
  governor: makeReviewGovernor(digest),
  outcome: 'passed',
  omitted: { blocker: 0, advisory: 0, follow_up: 0, ignored: 0 }, items: {},
};
const schema = JSON.parse(fs.readFileSync(new URL('../schemas/review-report.v2.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ strict: true }).compile(schema);

assert.equal(isReviewReport(report), true);
assert.equal(validate(report), true);
for (const invalid of [
  { ...report, extra: true },
  { ...report, policyDigest: 'sha256:nope' },
  { ...report, attemptId: 'attempt-1\n' },
  { ...report, bundleDigest: `${digest}\n` },
]) {
  assert.equal(isReviewReport(invalid), false);
  assert.equal(validate(invalid), false);
}
assert.equal(isReviewReport({ ...report, governor: { ...report.governor, baselineId: digest } }), false,
  'runtime verifies the governor baseline digest');
assert.equal(isReviewReport({
  ...report, governor: { ...report.governor, current: { ...report.governor.current, head: '3'.repeat(40) } },
}), false, 'runtime binds current governor state to the report revision');
assert.equal(isReviewReport({
  ...report, items: { [digest]: {
    disposition: 'advisory', origin: 'echo_proposal', priority: 'P3',
    category: 'simplification', message: 'Remove a wrapper.', recommendedFix: 'Inline it.',
    reason: 'A deterministic candidate was assessed.', proposalId: undefined,
  } },
}), false, 'present undefined optional fields are rejected');
assert.equal(isReviewReport({
  ...report,
  outcome: 'request_fix',
  items: { [digest]: {
    disposition: 'blocker', origin: 'verified_finding', priority: 'P0',
    category: 'correctness', message: 'Contract is broken.', recommendedFix: 'Repair it.', reason: 'Confirmed.',
  } },
}), false, 'verified finding provenance is required');
const blockerItem = {
  disposition: 'blocker', origin: 'verified_finding', priority: 'P0', category: 'correctness',
  message: 'Contract is broken.', recommendedFix: 'Repair it.', reason: 'Confirmed.',
  findingFingerprint: digest,
};
for (const invalid of [
  { ...report, items: { [digest]: blockerItem } },
  { ...report, omitted: { ...report.omitted, blocker: 1 } },
  { ...report, outcome: 'request_fix' },
  { ...report, omitted: { ...report.omitted, ignored: Number.MAX_SAFE_INTEGER + 1 } },
]) {
  assert.equal(isReviewReport(invalid), false);
  assert.equal(validate(invalid), false);
}
const requestFix = { ...report, outcome: 'request_fix', items: { [digest]: blockerItem } };
assert.equal(isReviewReport(requestFix), true);
assert.equal(validate(requestFix), true);
const trailingText = {
  ...report,
  items: { [digest]: {
    disposition: 'advisory', origin: 'echo_proposal', priority: 'P3',
    category: 'simplification', message: 'Remove a wrapper.\n', recommendedFix: 'Inline it.',
    reason: 'A deterministic candidate was assessed.', proposalId: digest,
  } },
};
assert.equal(isReviewReport(trailingText), false);
assert.equal(validate(trailingText), false);
console.log('review report contract unit tests passed');
