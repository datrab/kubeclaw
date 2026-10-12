import assert from 'node:assert/strict';
import fs from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  ECHO_REVIEW_SCHEMA_VERSION,
  echoReviewOutputSchema,
} from '../src/echo-review-contract.ts';
import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import {
  simplificationCandidateManifestSchema,
  simplificationFactsSchema,
} from '../src/simplification-contract.ts';
import {
  parseSimplificationCandidateManifest,
  parseSimplificationFacts,
} from '../src/simplification-parser.ts';
import { echoReviewVerificationOutputSchema } from '../src/echo-review-verification-contract.ts';
import { parseEchoReviewVerificationOutput } from '../src/echo-review-verification-parser.ts';
import { reviewPolicySchema } from '../src/review-policy-contract.ts';
import { parseReviewPolicy } from '../src/review-policy-parser.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { reduceReviewDecision } from '../src/review-reducer.ts';
import { certifyReviewReductionInput } from '../src/review-reduction-state.ts';
import { makeReviewPolicy } from './fixtures/review-policy.mjs';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateEcho = ajv.compile(echoReviewOutputSchema);
const validateVerification = ajv.compile(echoReviewVerificationOutputSchema);
const validatePolicy = ajv.compile(reviewPolicySchema);
const validateSimplificationFacts = ajv.compile(simplificationFactsSchema);
const validateSimplificationManifest = ajv.compile(simplificationCandidateManifestSchema);
const evidence = { kind: 'contract', digest: `sha256:${'a'.repeat(64)}` };

const simplificationRevision = {
  base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: `sha256:${'3'.repeat(64)}`,
};
const simplificationFacts = {
  schemaVersion: 'simplification-facts.v1', revision: simplificationRevision,
  facts: [{
    factId: 'unused.helper', ruleId: 'SIM001', confidence: 'high', path: 'src/helper.ts',
    basis: 'No references exist.', smallestReplacement: 'Delete the helper.',
  }],
};
const simplificationManifest = {
  schemaVersion: 'simplification-candidate-manifest.v1', registryVersion: 'simplification-rules.v1',
  revision: simplificationRevision,
  candidates: [{
    candidateId: `sha256:${'4'.repeat(64)}`, ruleId: 'SIM001', category: 'delete', confidence: 'high',
    path: 'src/helper.ts', basis: 'No references exist.', smallestReplacement: 'Delete the helper.',
    source: { kind: 'simplification-facts', digest: `sha256:${'5'.repeat(64)}`, factId: 'unused.helper' },
  }],
  diagnostics: [],
};
for (const [index, value] of [
  simplificationFacts,
  { ...simplificationFacts, extra: true },
  { ...simplificationFacts, revision: { ...simplificationRevision, head: 'bad' } },
  { ...simplificationFacts, facts: [{ ...simplificationFacts.facts[0], path: '../escape.ts' }] },
].entries()) {
  assert.equal(parseSimplificationFacts(value).ok, validateSimplificationFacts(value), `Simplification facts parity corpus ${index}`);
}
for (const [index, value] of [
  simplificationManifest,
  { ...simplificationManifest, extra: true },
  { ...simplificationManifest, registryVersion: 'future' },
  { ...simplificationManifest, candidates: [{ ...simplificationManifest.candidates[0], category: 'native' }] },
].entries()) {
  assert.equal(
    parseSimplificationCandidateManifest(value).ok,
    validateSimplificationManifest(value),
    `Simplification manifest parity corpus ${index}`,
  );
}
const echo = {
  schemaVersion: ECHO_REVIEW_SCHEMA_VERSION,
  summary: 'The declared requirement was checked.',
  inspectedEvidence: [evidence],
  requirementAssessments: {
    'REQ-1': {
      assessment: 'satisfied',
      explanation: 'The evidence proves the requirement.',
      evidence: [evidence],
    },
  },
  proposedFindings: [],
};
const echoFinding = {
  category: 'correctness', priority: 'P0', claim: 'A defect exists.',
  impact: 'The requirement may fail.', locations: [{ path: 'src/index.ts' }],
  evidence: [evidence], recommendedFix: 'Repair the defect.',
  changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
};
const echoContextRequest = {
  ...echo,
  requirementAssessments: { 'REQ-1': {
    assessment: 'unverified', explanation: 'More context is required.', evidence: [],
  } },
  contextRequest: {
    paths: ['src/support.ts'], requirementIds: ['REQ-1'], reason: 'Inspect support code.',
  },
};

const echoCorpus = [
  echo,
  { ...echo, proposedFindings: [echoFinding] },
  echoContextRequest,
  { ...echoContextRequest, proposedFindings: [echoFinding] },
  { ...echoContextRequest, contextRequest: {
    ...echoContextRequest.contextRequest, paths: ['../support.ts'],
  } },
  { ...echo, extra: true },
  { ...echo, summary: '' },
  { ...echo, summary: ' padded ' },
  { ...echo, schemaVersion: 'echo-review-output.v2' },
  { ...echo, inspectedEvidence: [] },
  { ...echo, inspectedEvidence: [evidence, evidence] },
  { ...echo, requirementAssessments: {} },
  { ...echo, requirementAssessments: { '../REQ': echo.requirementAssessments['REQ-1'] } },
  { ...echo, requirementAssessments: { 'REQ-1': { ...echo.requirementAssessments['REQ-1'], evidence: [] } } },
  { ...echo, proposedFindings: [{ ...echoFinding, locations: [{ path: 'src/' }] }] },
];
for (const [index, value] of echoCorpus.entries()) {
  assert.equal(parseEchoReviewOutput(value).ok, validateEcho(value), `Echo parity corpus ${index}`);
}

const verificationId = `sha256:${'b'.repeat(64)}`;
const verification = {
  schemaVersion: 'echo-review-verification.v1',
  bundleDigest: `sha256:${'c'.repeat(64)}`,
  policyDigest: `sha256:${'d'.repeat(64)}`,
  proposalSetDigest: `sha256:${'e'.repeat(64)}`,
  results: {
    [verificationId]: {
      verdict: 'confirmed', reason: 'The supplied evidence confirms the proposal.', evidence: [evidence],
    },
  },
};
const verificationCorpus = [
  verification,
  { ...verification, extra: true },
  { ...verification, bundleDigest: 'bad' },
  { ...verification, results: {} },
  { ...verification, results: { bad: verification.results[verificationId] } },
  { ...verification, results: { [verificationId]: { ...verification.results[verificationId], verdict: 'unknown' } } },
  { ...verification, results: { [verificationId]: { ...verification.results[verificationId], evidence: [] } } },
  { ...verification, results: { [verificationId]: { verdict: 'insufficient_evidence', reason: 'More evidence is needed.', evidence: [] } } },
  { ...verification, results: { [verificationId]: { ...verification.results[verificationId], reason: ' padded ' } } },
];
for (const [index, value] of verificationCorpus.entries()) {
  assert.equal(
    parseEchoReviewVerificationOutput(value).ok,
    validateVerification(value),
    `verification parity corpus ${index}`,
  );
}

const policy = makeReviewPolicy();
const policyCorpus = [
  policy,
  { ...policy, extra: true },
  { ...policy, profile: ' bad ' },
  { ...policy, blocking: { ...policy.blocking, priorities: ['P1'] } },
  { ...policy, blocking: { ...policy.blocking, categories: ['correctness', 'contract'] } },
  { ...policy, limits: { ...policy.limits, maxProposals: 129 } },
  { ...policy, simplification: { ...policy.simplification, enabled: false } },
  { ...policy, followUp: { retainedPriorities: [], maxItems: 0 } },
];
for (const [index, value] of policyCorpus.entries()) {
  assert.equal(parseReviewPolicy(value).ok, validatePolicy(value), `policy parity corpus ${index}`);
}

const platformSchema = JSON.parse(fs.readFileSync(
  new URL('../../../../common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json', import.meta.url),
  'utf8',
));
ajv.addSchema(platformSchema);
const validateStageResult = ajv.compile({
  $ref: `${platformSchema.$id}#/$defs/stageResult`,
});
const resolvedPolicy = resolveReviewPolicy({ builtIn: policy });
const wait = {
  schemaVersion: 'wait-request.v2', waitId: 'review-parity-wait', kind: 'orchestrator',
  signalType: 'kubeclaw.review.resolve',
  authorizedIssuer: { type: 'orchestrator', id: 'orchestrator:kubeclaw.review' }, expiresAt: null,
};
const finding = {
  fingerprint: `sha256:${'b'.repeat(64)}`,
  category: 'correctness', priority: 'P0',
  message: 'Verified defect.', recommendedFix: 'Fix the defect.',
  changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
  repairable: true, verified: true,
};
const state = (overrides = {}) => certifyReviewReductionInput({
  resolvedPolicy, integrityIssues: [], unverifiedRequirements: [], limitViolations: [],
  findings: [], orchestratorWait: wait, ...overrides,
});
const results = [
  reduceReviewDecision(state()),
  reduceReviewDecision(state({ findings: [finding] })),
  reduceReviewDecision(state({ integrityIssues: ['invalid'] })),
  reduceReviewDecision(state({ limitViolations: ['limit'] })),
];
for (const [index, result] of results.entries()) {
  assert.equal(validateStageResult(result), true, `StageResult parity ${index}: ${ajv.errorsText(validateStageResult.errors)}`);
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.review',
  suite: 'review-contract-parity',
  echoCases: echoCorpus.length,
  verificationCases: verificationCorpus.length,
  policyCases: policyCorpus.length,
  stageResults: results.length,
}));
