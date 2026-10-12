import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';
import { parseReviewPolicy } from '../src/review-policy-parser.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { preflightEchoReviewProposals } from '../src/review-proposal-preflight.ts';
import { reduceReviewDecision } from '../src/review-reducer.ts';
import { verifyEchoReviewForReduction } from '../src/review-stage-verification.ts';
import { makeReviewPolicy } from './fixtures/review-policy.mjs';

const parsedPolicy = parseReviewPolicy(makeReviewPolicy());
assert.equal(parsedPolicy.ok, true);
const policy = resolveReviewPolicy({ builtIn: parsedPolicy.value });
const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
const evidenceContent = canonicalJson({ contract: 'failed' });
const evidence = { kind: 'contract', digest: sha256Text(evidenceContent), content: evidenceContent };
const contextContent = 'export const value = false;\n';
const sourceEvidence = { kind: 'reviewed-source', digest: sha256Text(contextContent) };
const snapshot = snapshotReviewBundle({
  schemaVersion: 'review-bundle.v1',
  task: { id: 'TASK-1', statement: 'Review the change.' },
  revisions: {
    base: '1'.repeat(40), head: '2'.repeat(40),
    changedManifestDigest: sha256Text(canonicalJson(changedPaths)),
  },
  scope: { changedPaths, allowedPrefixes: ['src'] },
  requirements: [{ id: 'REQ-1', statement: 'The value must be true.' }],
  evidence: [evidence],
  context: [{
    path: 'src/index.ts', digest: sourceEvidence.digest, content: contextContent,
    reasons: [{ kind: 'changed' }],
  }],
  selection: {
    version: 'focused-context.v1', candidateManifestDigest: `sha256:${'3'.repeat(64)}`,
    expansionRound: 0,
  },
  policyDigest: policy.digest,
});
const parsed = parseEchoReviewOutput({
  schemaVersion: 'echo-review-output.v1', summary: 'A blocker was found.',
  inspectedEvidence: [{ kind: evidence.kind, digest: evidence.digest }, sourceEvidence],
  requirementAssessments: { 'REQ-1': {
    assessment: 'violated', explanation: 'The contract proves the violation.',
    evidence: [{ kind: evidence.kind, digest: evidence.digest }, sourceEvidence],
  } },
  proposedFindings: [{
    category: 'correctness', priority: 'P0', claim: 'The value is false.',
    impact: 'The requirement fails.', locations: [{ path: 'src/index.ts', lineHint: 1 }],
    evidence: [{ kind: evidence.kind, digest: evidence.digest }, sourceEvidence],
    recommendedFix: 'Set the value to true.', changeRelation: 'introduced',
    scopeRelation: 'inside', evidenceStrength: 'direct',
  }],
});
assert.equal(parsed.ok, true);

const forgedPreflight = Object.freeze({
  proposals: {}, eligibleProposalIds: [], proposalSetDigest: sha256Text('[]'),
  exactDuplicateCount: 0, integrityIssues: [], limitViolations: [],
});
const reduction = verifyEchoReviewForReduction({ snapshot, parsed, policy, preflight: forgedPreflight });
assert.equal(reduceReviewDecision(reduction).outcome, 'blocked');
assert.match(reduction.integrityIssues.join('\n'), /preflight is not certified/u);

if (!parsed.ok) throw new Error(parsed.error);
const preflight = preflightEchoReviewProposals(
  snapshot.bundle, parsed.value, policy, new Map([['src/index.ts', [{ start: 1, end: 1 }]]]),
);
assert.equal(preflight.eligibleProposalIds.length, 1);
const forgedReconciliation = Object.freeze({
  results: {}, confirmedProposalIds: [], rejectedProposalIds: [], insufficientProposalIds: [],
  integrityIssues: [],
});
const forgedReduction = verifyEchoReviewForReduction({
  snapshot, parsed, policy, preflight, reconciliation: forgedReconciliation,
});
assert.equal(reduceReviewDecision(forgedReduction).outcome, 'blocked');
assert.match(forgedReduction.integrityIssues.join('\n'), /reconciliation is not certified/u);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-stage-verification' }));
