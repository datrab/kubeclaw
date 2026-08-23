import assert from 'node:assert/strict';

import {
  ECHO_REVIEW_SCHEMA_VERSION,
  echoReviewOutputSchema,
} from '../src/echo-review-contract.ts';
import { assertEchoContextRequestRequirements } from '../src/echo-context-request-parser.ts';
import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';

const evidence = {
  kind: 'contract',
  digest: `sha256:${'a'.repeat(64)}`,
};
const valid = {
  schemaVersion: ECHO_REVIEW_SCHEMA_VERSION,
  summary: 'The declared requirement was checked.',
  inspectedEvidence: [evidence],
  requirementAssessments: { 'REQ-1': {
    assessment: 'satisfied',
    explanation: 'The contract evidence proves the requirement.',
    evidence: [evidence],
  } },
  proposedFindings: [],
};

const parsed = parseEchoReviewOutput(valid);
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.value, valid);
assert.equal(Object.isFrozen(parsed.value), true);
assert.equal(Object.isFrozen(parsed.value.inspectedEvidence[0]), true);
assert.throws(() => { parsed.value.summary = 'mutated'; }, TypeError);
assert.equal(echoReviewOutputSchema.additionalProperties, false);
assert.equal(echoReviewOutputSchema.properties.proposedFindings.maxItems, 128);

const finding = {
  category: 'simplification',
  priority: 'P3',
  claim: 'The wrapper only forwards its arguments.',
  impact: 'The extra layer increases navigation cost.',
  locations: [{ path: 'src/wrapper.ts', symbol: 'forward', lineHint: 4 }],
  evidence: [evidence],
  recommendedFix: 'Call the owned helper directly.',
  changeRelation: 'introduced',
  scopeRelation: 'inside',
  evidenceStrength: 'direct',
  rootCauseHint: 'argument-forwarding-wrapper',
  simplification: {
    category: 'delete',
    candidateIds: [`sha256:${'4'.repeat(64)}`],
    smallestReplacement: 'Delete forward and call the helper.',
    estimatedNetLocReduction: 8,
  },
};
assert.equal(parseEchoReviewOutput({ ...valid, proposedFindings: [finding] }).ok, true);
const contextRequest = {
  paths: ['src/support.ts'],
  requirementIds: ['REQ-1'],
  reason: 'The supporting implementation is needed to verify REQ-1.',
};
const requesting = {
  ...valid,
  requirementAssessments: { 'REQ-1': {
    assessment: 'unverified', explanation: 'Supporting context is required.', evidence: [],
  } },
  contextRequest,
};
assert.equal(parseEchoReviewOutput(requesting).ok, true);
assert.equal(Object.isFrozen(parseEchoReviewOutput(requesting).value.contextRequest), true);
assert.doesNotThrow(() => assertEchoContextRequestRequirements(contextRequest, ['REQ-1']));
assert.throws(
  () => assertEchoContextRequestRequirements(contextRequest, ['REQ-2']),
  /was not declared/u,
);
assert.equal(parseEchoReviewOutput({
  ...valid,
  requirementAssessments: { 'REQ-1': {
    ...valid.requirementAssessments['REQ-1'],
    explanation: '😀'.repeat(4096),
  } },
}).ok, true, 'text limits count Unicode characters rather than UTF-16 code units');

for (const [label, value, expected] of [
  ['wrong version', { ...valid, schemaVersion: 'echo-review-output.v2' }, /schemaVersion/],
  ['raw JSON string', JSON.stringify(valid), /must be an object/],
  ['unknown field', { ...valid, verdict: 'PASS' }, /unknown field/],
  ['invalid requirement key', { ...valid, requirementAssessments: { ' bad ': valid.requirementAssessments['REQ-1'] } }, /unpadded text/],
  ['uninspected evidence', { ...valid, requirementAssessments: { 'REQ-1': { ...valid.requirementAssessments['REQ-1'], evidence: [{ ...evidence, digest: `sha256:${'b'.repeat(64)}` }] } } }, /not listed/],
  ['unsafe path', { ...valid, proposedFindings: [{ ...finding, locations: [{ path: '../escape.ts' }] }] }, /repository-relative/],
  ['drive path', { ...valid, proposedFindings: [{ ...finding, locations: [{ path: 'C:/escape.ts' }] }] }, /repository-relative/],
  ['evidence metadata', { ...valid, inspectedEvidence: [{ ...evidence, artifactId: 'mutable-name' }] }, /unknown field/],
  ['digest newline', { ...valid, inspectedEvidence: [{ ...evidence, digest: `${evidence.digest}\n` }] }, /unpadded text/],
  ['path control', { ...valid, proposedFindings: [{ ...finding, locations: [{ path: 'src/a\u0000b.ts' }] }] }, /repository-relative/],
  ['non-simplification Simplification', { ...valid, proposedFindings: [{ ...finding, category: 'correctness' }] }, /only for simplification/],
  ['unsupported enum', { ...valid, proposedFindings: [{ ...finding, priority: 'urgent' }] }, /must be one of/],
  ['missing proof', { ...valid, requirementAssessments: { 'REQ-1': { ...valid.requirementAssessments['REQ-1'], evidence: [] } } }, /evidence is required/],
  ['blank summary', { ...valid, summary: '   ' }, /unpadded text/],
  ['trailing newline', { ...valid, summary: 'reviewed\n' }, /unpadded text/],
  ['sparse evidence', { ...valid, requirementAssessments: { 'REQ-1': { ...valid.requirementAssessments['REQ-1'], evidence: new Array(1) } } }, /sparse entries/],
  ['request verified requirement', { ...valid, contextRequest }, /unverified requirements/],
  ['request with finding', { ...requesting, proposedFindings: [finding] }, /cannot accompany/],
  ['duplicate request path', { ...requesting, contextRequest: { ...contextRequest, paths: ['src/support.ts', 'src/support.ts'] } }, /duplicates/],
  ['unsafe request path', { ...requesting, contextRequest: { ...contextRequest, paths: ['../support.ts'] } }, /repository-relative/],
]) {
  const result = parseEchoReviewOutput(value);
  assert.equal(result.ok, false, label);
  assert.match(result.error, expected, label);
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'echo-review-output' }));
