import assert from 'node:assert/strict';

import {
  ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION,
} from '../src/echo-review-verification-contract.ts';
import {
  parseEchoReviewVerificationDispatchResponse,
  parseEchoReviewVerificationOutput,
} from '../src/echo-review-verification-parser.ts';

const digest = (character) => `sha256:${character.repeat(64)}`;
const proposalId = digest('a');
const evidence = { kind: 'contract', digest: digest('b') };
const output = {
  schemaVersion: ECHO_REVIEW_VERIFICATION_SCHEMA_VERSION,
  bundleDigest: digest('c'), policyDigest: digest('d'), proposalSetDigest: digest('e'),
  results: {
    [proposalId]: { verdict: 'confirmed', reason: 'The cited contract directly proves the claim.', evidence: [evidence] },
  },
};

const parsed = parseEchoReviewVerificationOutput(output);
assert.equal(parsed.ok, true);
assert.equal(Object.isFrozen(parsed.ok && parsed.value), true);
assert.equal(Object.isFrozen(parsed.ok && parsed.value.results), true);
assert.equal(parseEchoReviewVerificationOutput({ ...output, extra: true }).ok, false);
assert.equal(parseEchoReviewVerificationOutput({ ...output, bundleDigest: 'bad' }).ok, false);
assert.equal(parseEchoReviewVerificationOutput({ ...output, results: {} }).ok, false);
assert.equal(parseEchoReviewVerificationOutput({
  ...output, results: { [proposalId]: { ...output.results[proposalId], verdict: 'maybe' } },
}).ok, false);
assert.equal(parseEchoReviewVerificationOutput({
  ...output, results: { [proposalId]: { ...output.results[proposalId], evidence: [] } },
}).ok, false);
const sparseEvidence = new Array(1);
assert.equal(parseEchoReviewVerificationOutput({
  ...output, results: { [proposalId]: { ...output.results[proposalId], evidence: sparseEvidence } },
}).ok, false);
assert.equal(parseEchoReviewVerificationOutput({
  ...output, results: { [proposalId]: { verdict: 'insufficient_evidence', reason: 'More evidence is needed.', evidence: [] } },
}).ok, true);
assert.equal(parseEchoReviewVerificationOutput({
  ...output, results: { [proposalId]: { ...output.results[proposalId], reason: ' padded ' } },
}).ok, false);
assert.equal(parseEchoReviewVerificationDispatchResponse({ result: output }).ok, true);
assert.equal(parseEchoReviewVerificationDispatchResponse({}).ok, false);
assert.equal(parseEchoReviewVerificationDispatchResponse(null).ok, false);
assert.equal(parseEchoReviewVerificationDispatchResponse([]).ok, false);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'echo-review-verification' }));
