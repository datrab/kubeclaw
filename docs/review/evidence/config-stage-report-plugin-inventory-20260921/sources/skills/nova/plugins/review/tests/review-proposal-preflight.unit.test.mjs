import assert from 'node:assert/strict';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { preflightEchoReviewProposals } from '../src/review-proposal-preflight.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';

const evidence = { kind: 'contract', digest: `sha256:${'a'.repeat(64)}` };
const sourceEvidence = { kind: 'reviewed-source', digest: `sha256:${'c'.repeat(64)}` };
const finding = {
  category: 'correctness', priority: 'P0', claim: 'The changed line returns the wrong value.',
  impact: 'The contract fails.', locations: [{ path: 'src/index.ts', lineHint: 2 }],
  evidence: [evidence, sourceEvidence], recommendedFix: 'Return the required value.',
  changeRelation: 'pre_existing', scopeRelation: 'outside', evidenceStrength: 'direct',
};
const output = parseEchoReviewOutput({
  schemaVersion: 'echo-review-output.v1', summary: 'One blocker was found.',
  inspectedEvidence: [evidence, sourceEvidence],
  requirementAssessments: { 'REQ-1': {
    assessment: 'violated', explanation: 'The contract evidence proves the violation.', evidence: [evidence],
  } },
  proposedFindings: [finding, finding],
});
assert.equal(output.ok, true);
if (!output.ok) throw new Error(output.error);
const bundle = {
  schemaVersion: 'review-bundle.v1', task: { id: 'TASK-1', statement: 'Review.' },
  revisions: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: `sha256:${'b'.repeat(64)}` },
  scope: { changedPaths: [{ path: 'src/index.ts', status: 'modified' }], allowedPrefixes: ['src'] },
  requirements: [{ id: 'REQ-1', statement: 'The contract holds.' }],
  evidence: [{ ...evidence, content: '{}' }],
  context: [{ path: 'src/index.ts', digest: sourceEvidence.digest, content: 'old\nnew\n', reasons: [{ kind: 'changed' }] }],
  selection: { version: 'focused-context.v1', candidateManifestDigest: `sha256:${'d'.repeat(64)}`, expansionRound: 0 },
  policyDigest: `sha256:${'e'.repeat(64)}`,
};
const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') });
const preflight = preflightEchoReviewProposals(bundle, output.value, policy, new Map([
  ['src/index.ts', [{ start: 2, end: 2 }]],
]));
assert.equal(preflight.integrityIssues.length, 0);
assert.equal(preflight.exactDuplicateCount, 1);
assert.equal(Object.keys(preflight.proposals).length, 1);
assert.equal(preflight.eligibleProposalIds.length, 1);
assert.equal(preflight.proposals[preflight.eligibleProposalIds[0]].changeRelation, 'introduced');
assert.equal(preflight.proposals[preflight.eligibleProposalIds[0]].scopeRelation, 'inside');
assert.equal(preflight.proposalSetDigest, sha256Text(canonicalJson(preflight.eligibleProposalIds)));
assert.equal(Object.isFrozen(preflight), true);

const otherSourceEvidence = { kind: 'reviewed-source', digest: `sha256:${'f'.repeat(64)}` };
const sourceBundle = {
  ...bundle,
  context: [...bundle.context, {
    path: 'src/other.ts', digest: otherSourceEvidence.digest,
    content: 'export const unrelated = true;\n', reasons: [{ kind: 'direct_import', sourcePath: 'src/index.ts' }],
  }],
};
const sourceOutput = {
  ...output.value,
  inspectedEvidence: [...output.value.inspectedEvidence, sourceEvidence, otherSourceEvidence],
  proposedFindings: [{ ...finding, evidence: [sourceEvidence] }],
};
assert.equal(preflightEchoReviewProposals(
  sourceBundle, sourceOutput, policy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
).integrityIssues.length, 0, 'source evidence must bind to the finding location');
const mismatchedSource = preflightEchoReviewProposals(
  sourceBundle, { ...sourceOutput, proposedFindings: [{ ...finding, evidence: [otherSourceEvidence] }] },
  policy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
);
assert.match(mismatchedSource.integrityIssues.join('\n'), /does not cite reviewed source evidence for location src\/index\.ts/u);
assert.equal(mismatchedSource.eligibleProposalIds.length, 0);
const missingSource = preflightEchoReviewProposals(
  sourceBundle, { ...sourceOutput, proposedFindings: [{ ...finding, evidence: [evidence] }] },
  policy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
);
assert.match(missingSource.integrityIssues.join('\n'), /does not cite reviewed source evidence for location src\/index\.ts/u);
assert.equal(missingSource.eligibleProposalIds.length, 0);

const preExisting = preflightEchoReviewProposals(bundle, output.value, policy, new Map([
  ['src/index.ts', [{ start: 3, end: 3 }]],
]));
assert.equal(preExisting.eligibleProposalIds.length, 0);
assert.equal(Object.values(preExisting.proposals)[0].changeRelation, 'pre_existing');

const added = preflightEchoReviewProposals({
  ...bundle,
  scope: { ...bundle.scope, changedPaths: [{ path: 'src/index.ts', status: 'added' }] },
}, output.value, policy, new Map());
assert.equal(added.integrityIssues.length, 0);
assert.equal(added.eligibleProposalIds.length, 1);
assert.equal(Object.values(added.proposals)[0].changeRelation, 'introduced');

const invalidLineOutput = { ...output.value, proposedFindings: [{
  ...finding, locations: [{ path: 'src/index.ts', lineHint: 999 }],
}] };
const invalidLine = preflightEchoReviewProposals(bundle, invalidLineOutput, policy, new Map([
  ['src/index.ts', [{ start: 999, end: 999 }]],
]));
assert.match(invalidLine.integrityIssues.join('\n'), /outside reviewed content/u);
assert.equal(invalidLine.eligibleProposalIds.length, 0);

const missingContext = preflightEchoReviewProposals(
  { ...bundle, context: [] }, output.value, policy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
);
assert.match(missingContext.integrityIssues.join('\n'), /not in reviewed context/u);
assert.equal(missingContext.eligibleProposalIds.length, 0);

const disabledPolicy = resolveReviewPolicy({ builtIn: {
  ...getReviewPolicyProfile('gate'),
  verification: { ...getReviewPolicyProfile('gate').verification, semanticVerifier: 'disabled' },
} });
assert.equal(preflightEchoReviewProposals(
  bundle, output.value, disabledPolicy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
).eligibleProposalIds.length, 0);

const p1Output = {
  ...output.value,
  proposedFindings: [{ ...finding, priority: 'P1' }],
};
assert.equal(preflightEchoReviewProposals(
  bundle, p1Output, policy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
).eligibleProposalIds.length, 0, 'p0-only mode excludes P1 proposals');
const allBlockersBase = getReviewPolicyProfile('audit');
const allBlockersPolicy = resolveReviewPolicy({ builtIn: {
  ...allBlockersBase,
  blocking: { ...allBlockersBase.blocking, priorities: ['P0', 'P1'] },
} });
assert.equal(preflightEchoReviewProposals(
  bundle, p1Output, allBlockersPolicy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
).eligibleProposalIds.length, 1, 'all-blockers mode consumes configured blocker priorities');

const candidateId = `sha256:${'9'.repeat(64)}`;
const candidateManifest = {
  schemaVersion: 'simplification-candidate-manifest.v1', registryVersion: 'simplification-rules.v1',
  revision: bundle.revisions,
  candidates: [{
    candidateId, ruleId: 'SIM001', category: 'delete', confidence: 'high', path: 'src/index.ts',
    basis: 'The analyzer found no references.', smallestReplacement: 'Delete the unused export.',
    source: { kind: 'simplification-facts', digest: `sha256:${'8'.repeat(64)}`, factId: 'unused.export' },
  }], diagnostics: [],
};
const candidateContent = canonicalJson(candidateManifest);
const candidateEvidence = { kind: 'simplification-candidates', digest: sha256Text(candidateContent), content: candidateContent };
const simplificationOutput = {
  ...output.value,
  inspectedEvidence: [...output.value.inspectedEvidence, candidateEvidence],
  proposedFindings: [{
    ...finding, category: 'simplification', priority: 'P2',
    evidence: [candidateEvidence, sourceEvidence],
    simplification: { category: 'delete', candidateIds: [candidateId], smallestReplacement: 'Delete the unused export.' },
  }],
};
const leanPolicy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('lean') });
const simplificationPreflight = preflightEchoReviewProposals(
  { ...bundle, evidence: [...bundle.evidence, candidateEvidence] }, simplificationOutput,
  leanPolicy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
);
assert.equal(simplificationPreflight.integrityIssues.length, 0);
assert.equal(simplificationPreflight.eligibleProposalIds.length, 0, 'Simplification candidates remain advisory');
const unknownCandidate = preflightEchoReviewProposals(
  { ...bundle, evidence: [...bundle.evidence, candidateEvidence] }, {
    ...simplificationOutput,
    proposedFindings: [{
      ...simplificationOutput.proposedFindings[0],
      simplification: { ...simplificationOutput.proposedFindings[0].simplification, candidateIds: [`sha256:${'7'.repeat(64)}`] },
    }],
  }, leanPolicy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
);
assert.match(unknownCandidate.integrityIssues.join('\n'), /unknown Simplification candidate/u);
const blockingSimplification = preflightEchoReviewProposals(
  { ...bundle, evidence: [...bundle.evidence, candidateEvidence] }, {
    ...simplificationOutput,
    proposedFindings: [{
      ...simplificationOutput.proposedFindings[0], category: 'correctness', priority: 'P0',
    }],
  }, leanPolicy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
);
assert.match(blockingSimplification.integrityIssues.join('\n'), /blocking category/u);
assert.equal(blockingSimplification.eligibleProposalIds.length, 0);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-proposal-preflight' }));
