import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { buildReviewDispatchRequest, buildReviewTask } from '../src/protocol.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { buildVerificationDispatchRequest } from '../src/verification-protocol.ts';

const source = 'export const value = 1;\n';
const digest = `sha256:${createHash('sha256').update(source).digest('hex')}`;
const evidenceContent = '{"result":"passed"}';
const evidenceDigest = `sha256:${createHash('sha256').update(evidenceContent).digest('hex')}`;
const resolved = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') });
const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
const snapshot = snapshotReviewBundle({
  schemaVersion: 'review-bundle.v1',
  task: { id: 'TASK-1', statement: 'Review the adapter boundary.' },
  revisions: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text(canonicalJson(changedPaths)) },
  scope: { changedPaths, allowedPrefixes: ['src'] },
  requirements: [{ id: 'REQ-1', statement: 'The capability boundary is preserved.' }],
  evidence: [{ kind: 'contract', digest: evidenceDigest, content: evidenceContent }],
  context: [{ path: 'src/index.ts', digest, content: source, reasons: [{ kind: 'changed' }] }],
  selection: { version: 'focused-context.v1', candidateManifestDigest: digest, expansionRound: 0 },
  policyDigest: resolved.digest,
});
const first = buildReviewTask(snapshot, 'Inspect the capability grant.', resolved);
const second = buildReviewTask(snapshot, 'Inspect the capability grant.', resolved);
assert.equal(first, second);
assert.match(first, /immutable review bundle/u);
assert.match(first, new RegExp(snapshot.digest, 'u'));
assert.match(first, /Do not return PASS, FAIL/u);

const request = buildReviewDispatchRequest('echo', snapshot, null, resolved);
assert.equal(request.review.bundleDigest, snapshot.digest);
assert.deepEqual(request.review.bundle, snapshot.bundle);
assert.equal(request.review.policy.digest, resolved.digest);
assert.equal(request.outputContract.additionalProperties, false);
assert.match(request.task, /No additional reviewer guidance/u);

const finding = {
  category: 'correctness', priority: 'P0', claim: 'The changed value violates the contract.',
  impact: 'The plugin returns an invalid value.', locations: [{ path: 'src/index.ts', lineHint: 1 }],
  evidence: [{ kind: 'contract', digest: evidenceDigest }], recommendedFix: 'Return the required value.',
  changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
};
const proposalId = sha256Text(canonicalJson(finding));
const preflight = {
  proposals: { [proposalId]: { proposalId, finding, changeRelation: 'introduced', scopeRelation: 'inside' } },
  eligibleProposalIds: [proposalId], proposalSetDigest: sha256Text(canonicalJson([proposalId])),
  exactDuplicateCount: 0, integrityIssues: [], limitViolations: [],
};
const identity = { runId: 'run:1', stageId: 'review', attemptId: 'attempt:1', attemptNumber: 1 };
const verifierRequest = buildVerificationDispatchRequest('echo', identity, snapshot, preflight, resolved);
assert.match(verifierRequest.task, /confirmed verdict confirms the complete proposal/u);
assert.match(verifierRequest.task, /rootCauseHint/u);
assert.match(verifierRequest.task, /deterministic source-backed contradiction/u);
assert.match(verifierRequest.task, /Reject only when supplied immutable evidence directly disproves/u);
assert.match(verifierRequest.task, /Runtime reproduction is not required/u);
assert.equal(verifierRequest.role, 'semantic-verifier');
assert.deepEqual(verifierRequest.identity, identity);
assert.deepEqual(Object.keys(verifierRequest.verification.proposals), [proposalId]);
assert.equal(verifierRequest.verification.bundleDigest, snapshot.digest);
assert.equal(verifierRequest.verification.proposalSetDigest, preflight.proposalSetDigest);
assert.equal(verifierRequest.outputContract.additionalProperties, false);
assert.match(verifierRequest.task, /Do not return PASS, FAIL, request_fix/u);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'protocol-unit' }));
