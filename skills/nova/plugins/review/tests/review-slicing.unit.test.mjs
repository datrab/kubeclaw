import assert from 'node:assert/strict';
import { sha256Text } from '@kubeclaw/plugin-sdk';
import { buildReviewSlices, mergeSlicedEchoOutputs } from '../src/review-slicing.ts';
import { REVIEW_HARD_LIMITS } from '../src/review-hard-limits.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';

const profile = getReviewPolicyProfile('gate');
const policy = resolveReviewPolicy({ builtIn: { ...profile,
  limits: { ...profile.limits, maxInitialContextFiles: 1, maxInitialContextBytes: 1024 } } });
const selected = ['src/a.ts', 'src/b.ts'].map((file, index) => {
  const content = `export const value = ${index};\n`;
  return { path: file, content, digest: sha256Text(content), reasons: [{ kind: 'changed' }] };
});
const selection = { candidateManifestDigest: sha256Text('candidates'), limitDigest: sha256Text('limits'),
  policyDigest: policy.digest, scopeDigest: sha256Text('scope'), selected, omitted: [], expansionRound: 0 };
const slices = buildReviewSlices(selection, policy);
assert.equal(slices.length, 2);
assert.deepEqual(slices.map(({ selection: value }) => value.selected.map(({ path }) => path)), [['src/a.ts'], ['src/b.ts']]);
const evidence = { kind: 'contract', digest: sha256Text('contract') };
const output = (assessment, claim) => ({ ok: true, value: { schemaVersion: 'echo-review-output.v1', summary: claim,
  inspectedEvidence: [evidence], requirementAssessments: { REQ: { assessment, explanation: claim, evidence: [evidence] } },
  proposedFindings: [] } });
const merged = mergeSlicedEchoOutputs([output('unverified', 'Not in this slice.'), output('satisfied', 'Verified here.')]);
assert.equal(merged.ok, true); assert.equal(merged.value.requirementAssessments.REQ.assessment, 'satisfied');

const oversizedContent = 'x'.repeat(1025);
assert.throws(() => buildReviewSlices({ ...selection, selected: [{
  path: 'src/oversized.ts', content: oversizedContent, digest: sha256Text(oversizedContent),
  reasons: [{ kind: 'changed' }],
}] }, policy), /review slice connected group exceeds byte limit/u);

const connectedPolicy = resolveReviewPolicy({ builtIn: { ...profile,
  limits: { ...profile.limits, maxInitialContextFiles: 2, maxInitialContextBytes: 1024 } } });
const connectedContent = 'export const related = true;\n';
const connectedSelection = { ...selection, selected: [
  selected[0],
  { path: 'src/a-helper.ts', content: connectedContent, digest: sha256Text(connectedContent),
    reasons: [{ kind: 'direct_import', sourcePath: 'src/a.ts' }] },
  selected[1],
] };
const connectedSlices = buildReviewSlices(connectedSelection, connectedPolicy);
assert.deepEqual(connectedSlices.map(({ selection: value }) => value.selected.map(({ path }) => path)), [
  ['src/a-helper.ts', 'src/a.ts'], ['src/b.ts'],
], 'a changed file and its directly related context stay in one slice');
assert.throws(() => buildReviewSlices({ ...connectedSelection, selected: [
  ...connectedSelection.selected,
  { path: 'src/a-test.ts', content: connectedContent, digest: sha256Text(`${connectedContent}test`),
    reasons: [{ kind: 'test', sourcePath: 'src/a.ts' }] },
] }, connectedPolicy), /review slice connected group exceeds file limit/u);

const changedImportContent = "import { value } from './b.js';\nexport { value };\n";
const changedImportSelection = { ...selection, selected: [
  { ...selected[0], content: changedImportContent, digest: sha256Text(changedImportContent) }, selected[1],
] };
assert.throws(() => buildReviewSlices(changedImportSelection, policy),
  /review slice connected group exceeds file limit/u,
  'directly connected changed files cannot be split across review requests');

const findingOutput = (index) => ({ ok: true, value: {
  schemaVersion: 'echo-review-output.v1', summary: `Finding ${index}`, inspectedEvidence: [evidence],
  requirementAssessments: { REQ: { assessment: 'violated', explanation: `Finding ${index}`, evidence: [evidence] } },
  proposedFindings: [{ proposalId: `proposal-${index}`, priority: 'P1', category: 'correctness',
    claim: `Claim ${index}`, impact: 'Impact', locations: [{ path: 'src/a.ts', startLine: 1, endLine: 1 }],
    evidence: [evidence], recommendedFix: 'Fix it.', confidence: 'high', introducedByCurrentDiff: true,
    rootCauseHint: `root-${index}` }],
} });
const excessive = mergeSlicedEchoOutputs(Array.from(
  { length: REVIEW_HARD_LIMITS.proposedFindings + 1 }, (_, index) => findingOutput(index),
));
assert.equal(excessive.ok, false);
assert.match(excessive.error, /maximum/u);
const excessiveRequirementEvidence = mergeSlicedEchoOutputs(Array.from(
  { length: REVIEW_HARD_LIMITS.evidencePerRecord + 1 }, (_, index) => {
    const reference = { kind: 'contract', digest: sha256Text(`contract-${index}`) };
    return { ok: true, value: { schemaVersion: 'echo-review-output.v1', summary: 'Requirement evidence',
      inspectedEvidence: [reference], requirementAssessments: {
        REQ: { assessment: 'satisfied', explanation: 'Direct evidence.', evidence: [reference] },
      }, proposedFindings: [] } };
  },
));
assert.equal(excessiveRequirementEvidence.ok, false);
assert.match(excessiveRequirementEvidence.error, /sliced requirement REQ cited/u);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-slicing' }));
