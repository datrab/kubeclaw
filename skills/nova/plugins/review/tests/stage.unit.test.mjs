import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '@kubeclaw/plugin-sdk';
import { execute } from '../src/stage.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { ReviewVerificationRequestLimitError } from '../src/review-verifier.ts';

const base = '1'.repeat(40), head = '2'.repeat(40);
const evidenceContent = { contract: 'owned boundary', passed: true };
const evidenceDigest = `sha256:${createHash('sha256').update(canonicalJson(evidenceContent)).digest('hex')}`;
const source = 'export const value = 1;\n';
const sourceDigest = `sha256:${createHash('sha256').update(source).digest('hex')}`;
const support = 'export const support = true;\n';
const supportDigest = `sha256:${createHash('sha256').update(support).digest('hex')}`;
const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
const manifestDigest = `sha256:${createHash('sha256').update(canonicalJson(changedPaths)).digest('hex')}`;
const input = {
  task: { id: 'TASK-1', statement: 'Review the plugin.' }, revisions: { base },
  scope: { allowedPrefixes: ['src'] },
  requirements: [{ id: 'REQ-1', statement: 'The plugin preserves its boundary.' }],
  evidence: [{ kind: 'contract', digest: evidenceDigest, content: evidenceContent }],
  contextCandidates: [
    { path: 'src/support.ts', reasons: [{ kind: 'direct_import', sourcePath: 'src/index.ts' }], dependencyDepth: 1 },
  ],
};
const evidenceRef = { kind: 'contract', digest: evidenceDigest };
const sourceRef = { kind: 'reviewed-source', digest: sourceDigest };
const pass = {
  schemaVersion: 'echo-review-output.v1', summary: 'The requirement is satisfied.',
  inspectedEvidence: [evidenceRef],
  requirementAssessments: { 'REQ-1': {
    assessment: 'satisfied', explanation: 'The contract evidence proves the boundary.', evidence: [evidenceRef],
  } }, proposedFindings: [],
};

function testContext(responses = [pass], invocations = []) {
  let dispatchIndex = 0;
  const gate = getReviewPolicyProfile('gate');
  return {
    contract: { lease: { attempt: {
      runId: 'run:1', stageId: 'review', attemptId: 'attempt:1', attemptNumber: 1,
    } }, stageLifecycle: { attemptsUsed: 0, remediationCyclesUsed: 0, maxAttempts: 3, maxRemediationCycles: 2 }, artifacts: [], config: { agent: 'echo', profile: 'gate', policy: {
      ...gate,
      limits: { ...gate.limits, maxInitialContextFiles: 1, maxInitialContextBytes: 1024 },
    } }, guidance: { helperPrompt: 'Inspect ownership boundaries.' } },
    async invoke(capability, request) {
      invocations.push({ capability, request });
      if (capability === 'git.repository.read' && request.operation === 'freeze_head') {
        return { head, proof: 'a'.repeat(64) };
      }
      if (capability === 'git.repository.read' && request.operation === 'changed_manifest') {
        return { base, head, changedPaths, manifestDigest };
      }
      if (capability === 'git.repository.read' && request.operation === 'read_revision_text') {
        const content = request.resource.canonicalId === 'src/index.ts' ? source : support;
        const digest = request.resource.canonicalId === 'src/index.ts' ? sourceDigest : supportDigest;
        return { path: request.resource.canonicalId, head, content, sizeBytes: Buffer.byteLength(content), digest };
      }
      if (capability === 'git.repository.read' && request.operation === 'list_revision_paths') {
        const paths = ['src/index.ts', 'src/support.ts'];
        return {
          head, paths,
          pathsDigest: `sha256:${createHash('sha256').update(canonicalJson(paths)).digest('hex')}`,
        };
      }
      if (capability === 'git.repository.read' && request.operation === 'find_revision_references') {
        const references = [];
        return {
          head, references,
          referencesDigest: `sha256:${createHash('sha256').update(canonicalJson(references)).digest('hex')}`,
        };
      }
      if (capability === 'git.repository.read' && request.operation === 'changed_line_ranges') {
        const ranges = [{ start: 1, end: 1 }];
        const rangesDigest = `sha256:${createHash('sha256').update(canonicalJson(ranges)).digest('hex')}`;
        return { base, head, path: request.resource.canonicalId, ranges, rangesDigest };
      }
      if (capability === 'runtime.dispatch') {
        const response = responses[dispatchIndex++];
        return { result: typeof response === 'function' ? response(request) : response };
      }
      if (capability === 'artifacts.write') {
        const value = request.payload.value;
        const serialized = canonicalJson(value);
        return { artifact: {
          artifactId: request.resource.canonicalId, namespace: request.payload.namespace,
          mediaType: request.payload.mediaType,
          digest: `sha256:${createHash('sha256').update(serialized).digest('hex')}`,
          sizeBytes: Buffer.byteLength(serialized),
          producer: { runId: 'run:1', stageId: 'review', attemptId: 'attempt:1', attemptNumber: 1 },
        } };
      }
      throw new Error(`unexpected invocation ${capability}:${request.operation}`);
    },
  };
}

const invocations = [];
const result = await execute(input, testContext([pass], invocations));
assert.equal(result.outcome, 'passed');
assert.equal(result.artifacts.length, 1);
assert.equal(result.facts['review.report_blocker_count'], 0);
assert.equal(result.facts['review.report_digest'], result.artifacts[0].digest);
assert.deepEqual(invocations.map(({ capability }) => capability), [
  'git.repository.read', 'git.repository.read', 'git.repository.read', 'git.repository.read', 'git.repository.read',
  'git.repository.read', 'runtime.dispatch', 'git.repository.read',
  'artifacts.write',
]);
const firstDispatch = invocations.find(({ capability }) => capability === 'runtime.dispatch');
assert.equal(firstDispatch.request.payload.review.bundle.revisions.head, head);
assert.equal(firstDispatch.request.payload.review.bundle.context[0].content, source);

const storageFailure = testContext([pass]);
const storageFailureInvoke = storageFailure.invoke.bind(storageFailure);
storageFailure.invoke = async (capability, request) => {
  if (capability === 'artifacts.write') throw new Error('artifact storage unavailable');
  return storageFailureInvoke(capability, request);
};
const storageFailureResult = await execute(input, storageFailure);
assert.equal(storageFailureResult.outcome, 'blocked');
assert.equal(storageFailureResult.reason.code, 'kubeclaw.review.report_write_failed');

const mismatchedStorage = testContext([pass]);
const mismatchedStorageInvoke = mismatchedStorage.invoke.bind(mismatchedStorage);
mismatchedStorage.invoke = async (capability, request) => {
  const response = await mismatchedStorageInvoke(capability, request);
  return capability === 'artifacts.write'
    ? { artifact: { ...response.artifact, artifactId: 'review-report:unrelated' } } : response;
};
const mismatchedStorageResult = await execute(input, mismatchedStorage);
assert.equal(mismatchedStorageResult.outcome, 'blocked');
assert.equal(mismatchedStorageResult.reason.code, 'kubeclaw.review.report_write_failed');

const factContent = {
  schemaVersion: 'simplification-facts.v1',
  revision: { base, head, changedManifestDigest: manifestDigest },
  facts: [{
    factId: 'unused.value', ruleId: 'SIM001', confidence: 'high', path: 'src/index.ts',
    symbol: 'value', basis: 'The analyzer found no references.', smallestReplacement: 'Delete value.',
  }],
};
const factDigest = `sha256:${createHash('sha256').update(canonicalJson(factContent)).digest('hex')}`;
const simplificationContext = testContext([(request) => {
  const candidateEvidence = request.payload.review.bundle.evidence.find(({ kind }) => kind === 'simplification-candidates');
  assert.ok(candidateEvidence);
  assert.equal(JSON.parse(candidateEvidence.content).candidates.length, 1);
  assert.equal(candidateEvidence.digest, `sha256:${createHash('sha256').update(candidateEvidence.content).digest('hex')}`);
  return pass;
}]);
const lean = getReviewPolicyProfile('lean');
simplificationContext.contract.config = {
  ...simplificationContext.contract.config, profile: 'lean', policy: {
    ...lean, limits: { ...lean.limits, maxInitialContextFiles: 1, maxInitialContextBytes: 1024 },
  },
};
assert.equal((await execute({
  ...input, evidence: [...input.evidence, { kind: 'simplification-facts', digest: factDigest, content: factContent }],
}, simplificationContext)).outcome, 'passed');

const simplificationInput = {
  ...input, evidence: [...input.evidence, { kind: 'simplification-facts', digest: factDigest, content: factContent }],
};
const advisoryInvocations = [];
const advisoryContext = testContext([(request) => {
  const manifestEvidence = request.payload.review.bundle.evidence.find(({ kind }) => kind === 'simplification-candidates');
  const manifest = JSON.parse(manifestEvidence.content);
  const candidate = manifest.candidates[0];
  const manifestRef = { kind: manifestEvidence.kind, digest: manifestEvidence.digest };
  return {
    ...pass,
    summary: 'One simplification candidate is useful.',
    inspectedEvidence: [evidenceRef, manifestRef, sourceRef],
    proposedFindings: [{
      category: 'simplification', priority: 'P3', claim: 'The unused value can be removed.',
      impact: 'Removal reduces code size.', locations: [{ path: candidate.path, lineHint: 1 }],
      evidence: [manifestRef, sourceRef], recommendedFix: candidate.smallestReplacement,
      changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
      simplification: {
        category: candidate.category, candidateIds: [candidate.candidateId],
        smallestReplacement: candidate.smallestReplacement,
      },
    }],
  };
}], advisoryInvocations);
advisoryContext.contract.config = simplificationContext.contract.config;
const advisoryResult = await execute(simplificationInput, advisoryContext);
assert.equal(advisoryResult.outcome, 'passed');
assert.equal(advisoryResult.facts['review.simplification_enabled'], true);
assert.equal(advisoryResult.facts['review.simplification_registry'], 'simplification-rules.v1');
assert.equal(advisoryResult.facts['review.simplification_candidate_count'], 1);
assert.equal(advisoryResult.facts['review.simplification_diagnostic_count'], 0);
assert.equal(advisoryResult.facts['review.simplification_minimum_confidence'], 'high');
assert.equal(
  advisoryInvocations.filter(({ capability }) => capability === 'runtime.dispatch').length, 1,
  'Simplification advisory does not dispatch the semantic blocker verifier',
);

const malformedFacts = { unsupported: true };
const malformedFactsDigest = `sha256:${createHash('sha256').update(canonicalJson(malformedFacts)).digest('hex')}`;
const malformedFactsContext = testContext([pass]);
malformedFactsContext.contract.config = simplificationContext.contract.config;
assert.equal((await execute({
  ...input,
  evidence: [...input.evidence, {
    kind: 'simplification-facts', digest: malformedFactsDigest, content: malformedFacts,
  }],
}, malformedFactsContext)).outcome, 'passed', 'malformed optional facts do not block correctness review');

const finding = {
  ...pass,
  summary: 'A blocker was proposed.',
  inspectedEvidence: [evidenceRef, sourceRef],
  requirementAssessments: { 'REQ-1': {
    assessment: 'violated', explanation: 'The changed line violates the contract.', evidence: [evidenceRef],
  } },
  proposedFindings: [{
    category: 'correctness', priority: 'P0', claim: 'The changed value violates the contract.',
    impact: 'The plugin returns an invalid value.', locations: [{ path: 'src/index.ts', lineHint: 1 }],
    evidence: [evidenceRef, sourceRef], recommendedFix: 'Return the required value.',
    changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
  }],
};
const findingInvocations = [];
const verificationResponse = (request) => ({
  schemaVersion: 'echo-review-verification.v1',
  bundleDigest: request.payload.verification.bundleDigest,
  policyDigest: request.payload.verification.policyDigest,
  proposalSetDigest: request.payload.verification.proposalSetDigest,
  results: Object.fromEntries(Object.keys(request.payload.verification.proposals).map((proposalId) => [
    proposalId, { verdict: 'confirmed', reason: 'The immutable evidence confirms the claim.', evidence: [evidenceRef] },
  ])),
});
const findingResult = await execute(input, testContext([finding, verificationResponse], findingInvocations));
assert.equal(findingResult.outcome, 'request_fix');
assert.equal(findingResult.reason.code, 'kubeclaw.review.verified_blockers');
assert.equal(findingResult.reason.details.evaluation['review.verifier_protocol'], 'kubeclaw.echo-review-verification.v1');
assert.equal(findingResult.reason.details.evaluation['review.verifier_attempt'], 'attempt:1');
assert.equal(findingResult.reason.details.evaluation['review.verifier_confirmed_count'], 1);
assert.equal(findingInvocations.some(({ request }) => request.operation === 'changed_line_ranges'), true);
const verifierInvocation = findingInvocations.filter(({ capability }) => capability === 'runtime.dispatch').at(-1);
assert.equal(verifierInvocation.request.payload.role, 'semantic-verifier');
assert.equal(verifierInvocation.request.payload.identity.attemptId, 'attempt:1');

const sourceFinding = {
  ...finding,
  inspectedEvidence: [sourceRef],
  requirementAssessments: { 'REQ-1': {
    assessment: 'violated', explanation: 'The reviewed source directly violates the requirement.', evidence: [sourceRef],
  } },
  proposedFindings: [{ ...finding.proposedFindings[0], evidence: [sourceRef] }],
};
const sourceVerification = (request) => ({
  ...verificationResponse(request),
  results: Object.fromEntries(Object.keys(request.payload.verification.proposals).map((proposalId) => [
    proposalId, { verdict: 'confirmed', reason: 'The frozen reviewed source confirms the defect.', evidence: [sourceRef] },
  ])),
});
assert.equal(
  (await execute(input, testContext([sourceFinding, sourceVerification]))).outcome,
  'request_fix',
  'Git-frozen reviewed source is trusted evidence for proposal and semantic verification',
);

const unreadableHistory = testContext([pass]);
unreadableHistory.contract.lease.attempt = {
  ...unreadableHistory.contract.lease.attempt, attemptId: 'attempt:2', attemptNumber: 2,
};
unreadableHistory.contract.stageLifecycle = {
  ...unreadableHistory.contract.stageLifecycle, remediationCyclesUsed: 1,
};
unreadableHistory.contract.artifacts = [{
  artifactId: 'review-report:prior', namespace: 'kubeclaw.review', mediaType: 'application/json',
  digest: `sha256:${'8'.repeat(64)}`, sizeBytes: 100,
  producer: { runId: 'run:1', stageId: 'review', attemptId: 'attempt:1', attemptNumber: 1 },
}];
const unreadableInvoke = unreadableHistory.invoke.bind(unreadableHistory);
unreadableHistory.invoke = async (capability, request) => {
  if (capability === 'artifacts.read') throw new Error('artifact backend unavailable');
  const response = await unreadableInvoke(capability, request);
  if (capability !== 'artifacts.write') return response;
  return { artifact: { ...response.artifact, producer: {
    ...response.artifact.producer, attemptId: 'attempt:2', attemptNumber: 2,
  } } };
};
const unreadableHistoryResult = await execute(input, unreadableHistory);
assert.equal(unreadableHistoryResult.outcome, 'blocked');
assert.equal(unreadableHistoryResult.reason.code, 'kubeclaw.review.governor_invalid_state');
assert.equal(unreadableHistoryResult.artifacts.length, 1, 'invalid governor state retains an immutable report');

const verdictResponse = (verdict) => (request) => ({
  ...verificationResponse(request),
  results: Object.fromEntries(Object.keys(request.payload.verification.proposals).map((proposalId) => [
    proposalId, { verdict, reason: 'The verifier completed its decision.', evidence: [evidenceRef] },
  ])),
});
assert.equal(
  (await execute(input, testContext([finding, verdictResponse('rejected')]))).outcome,
  'passed',
  'explicit rejection has no blocking effect',
);
assert.equal(
  (await execute(input, testContext([finding, verdictResponse('insufficient_evidence')]))).outcome,
  'orchestrator_required',
  'gate uncertainty requires orchestration without repair',
);
const followUpContext = testContext([finding, verdictResponse('insufficient_evidence')]);
followUpContext.contract.config.policy = {
  ...followUpContext.contract.config.policy,
  verification: { ...followUpContext.contract.config.policy.verification, insufficientFindingEvidence: 'follow_up' },
};
const followUpResult = await execute(input, followUpContext);
assert.equal(followUpResult.outcome, 'passed');
assert.equal(followUpResult.facts['review.follow_up_count'], 1);
const orchestratorContext = testContext([finding, verdictResponse('insufficient_evidence')]);
orchestratorContext.contract.config.policy = {
  ...orchestratorContext.contract.config.policy,
  verification: { ...orchestratorContext.contract.config.policy.verification, insufficientFindingEvidence: 'orchestrator_required' },
};
const orchestratorResult = await execute(input, orchestratorContext);
assert.equal(orchestratorResult.outcome, 'orchestrator_required');
assert.equal(orchestratorResult.reason.code, 'kubeclaw.review.orchestrator_required');

const overLimitInvocations = [];
const overLimitContext = testContext([{ ...finding, proposedFindings: [
  finding.proposedFindings[0],
  { ...finding.proposedFindings[0], claim: 'A second changed value violates the contract.' },
] }], overLimitInvocations);
overLimitContext.contract.config.policy.limits.maxProposals = 1;
const overLimitResult = await execute(input, overLimitContext);
assert.equal(overLimitResult.outcome, 'orchestrator_required');
const proposalDispatchIndex = overLimitInvocations.findIndex(({ capability }) => capability === 'runtime.dispatch');
const governorRangeIndex = overLimitInvocations.findIndex(({ request }) => request.operation === 'changed_line_ranges');
assert.ok(proposalDispatchIndex >= 0 && governorRangeIndex > proposalDispatchIndex,
  'proposal limits are established before governor changed-line measurement');

const verifierTransportFailure = testContext([finding]);
const verifierTransportInvoke = verifierTransportFailure.invoke.bind(verifierTransportFailure);
let verifierTransportDispatches = 0;
let verifierTransportReport;
verifierTransportFailure.invoke = async (capability, request) => {
  if (capability === 'runtime.dispatch') {
    verifierTransportDispatches += 1;
    if (verifierTransportDispatches === 2) {
      throw new ReviewVerificationRequestLimitError('semantic verifier request is too large');
    }
  }
  if (capability === 'artifacts.write') verifierTransportReport = request.payload.value;
  return verifierTransportInvoke(capability, request);
};
const verifierTransportResult = await execute(input, verifierTransportFailure);
assert.equal(verifierTransportResult.outcome, 'orchestrator_required');
assert.equal(
  Object.values(verifierTransportReport.items).some(({ proposalId }) => typeof proposalId === 'string'), true,
  'post-preflight verifier failures retain certified proposals in the report',
);

const noncanonicalProof = testContext([finding]);
const noncanonicalInvoke = noncanonicalProof.invoke.bind(noncanonicalProof);
noncanonicalProof.invoke = async (capability, request) => {
  if (capability === 'git.repository.read' && request.operation === 'changed_line_ranges') {
    const ranges = [{ start: 2, end: 3 }, { start: 1, end: 1 }];
    const rangesDigest = `sha256:${createHash('sha256').update(canonicalJson(ranges)).digest('hex')}`;
    return { base, head, path: request.resource.canonicalId, ranges, rangesDigest };
  }
  return noncanonicalInvoke(capability, request);
};
const noncanonicalResult = await execute(input, noncanonicalProof);
assert.equal(noncanonicalResult.outcome, 'blocked');
assert.equal(noncanonicalResult.artifacts.length, 1, 'bundle-established semantic failures retain an immutable report');

const verifierFailure = testContext([finding]);
const verifierFailureInvoke = verifierFailure.invoke.bind(verifierFailure);
let verifierDispatches = 0;
verifierFailure.invoke = async (capability, request) => {
  if (capability === 'runtime.dispatch') {
    verifierDispatches += 1;
    if (verifierDispatches === 2) throw new Error('semantic verifier unavailable');
  }
  return verifierFailureInvoke(capability, request);
};
await assert.rejects(
  execute(input, verifierFailure), /semantic verifier unavailable/u,
  'semantic verifier transport failures remain core retry authority',
);
const malformedVerifier = await execute(input, testContext([finding, { malformed: true }]));
assert.equal(malformedVerifier.outcome, 'blocked');
assert.equal(malformedVerifier.reason.code, 'kubeclaw.review.untrusted_state');

const requesting = {
  ...pass,
  requirementAssessments: { 'REQ-1': { assessment: 'unverified', explanation: 'Support is needed.', evidence: [] } },
  contextRequest: { paths: ['src/support.ts'], requirementIds: ['REQ-1'], reason: 'Support proves the requirement.' },
};
const expandedInvocations = [];
const expanded = await execute(input, testContext([requesting, pass], expandedInvocations));
assert.equal(expanded.outcome, 'passed');
assert.equal(expandedInvocations.filter(({ capability }) => capability === 'runtime.dispatch').length, 2);
const expandedDispatches = expandedInvocations.filter(({ capability }) => capability === 'runtime.dispatch');
assert.equal(expandedDispatches.at(-1).request.payload.review.bundle.selection.expansionRound, 1);
assert.deepEqual(expandedDispatches.at(-1).request.payload.review.bundle.context.map(({ path }) => path), ['src/index.ts', 'src/support.ts']);

const invalidExpansion = {
  ...requesting,
  contextRequest: { ...requesting.contextRequest, requirementIds: ['REQ-UNKNOWN'] },
};
const invalidExpansionResult = await execute(input, testContext([invalidExpansion]));
assert.equal(invalidExpansionResult.outcome, 'blocked');
assert.equal(invalidExpansionResult.artifacts.length, 1, 'post-bundle expansion failures retain a report');
const governedInvalidExpansion = await execute({
  ...input, scope: { ...input.scope, ownershipPrefixes: ['src/owned'] },
}, testContext([invalidExpansion]));
assert.equal(
  governedInvalidExpansion.outcome, 'orchestrator_required',
  'terminal semantic paths cannot bypass certified ownership scope',
);

let repeatedExpansionReport;
const repeatedExpansionInvocations = [];
const repeatedExpansionContext = testContext([requesting, requesting], repeatedExpansionInvocations);
const repeatedExpansionInvoke = repeatedExpansionContext.invoke.bind(repeatedExpansionContext);
repeatedExpansionContext.invoke = async (capability, request) => {
  if (capability === 'artifacts.write') repeatedExpansionReport = request.payload.value;
  return repeatedExpansionInvoke(capability, request);
};
const repeatedExpansionResult = await execute(input, repeatedExpansionContext);
assert.equal(repeatedExpansionResult.outcome, 'blocked');
const repeatedExpansionDispatches = repeatedExpansionInvocations.filter(({ capability }) => capability === 'runtime.dispatch');
assert.equal(
  repeatedExpansionReport.bundleDigest,
  repeatedExpansionDispatches.at(-1).request.payload.review.bundleDigest,
  'post-expansion terminal reports use the latest frozen bundle',
);

const invalid = await execute(input, testContext([{ status: 'PASS' }]));
assert.equal(invalid.outcome, 'blocked');

const wrongRevision = testContext([pass]);
const originalInvoke = wrongRevision.invoke.bind(wrongRevision);
wrongRevision.invoke = async (capability, request) => capability === 'git.repository.read' && request.operation === 'read_revision_text'
  ? { path: request.resource.canonicalId, head, content: 'forged', sizeBytes: 6, digest: sourceDigest }
  : originalInvoke(capability, request);
const rejected = await execute(input, wrongRevision);
assert.equal(rejected.outcome, 'blocked');

const scopeInvocations = [];
const outsideScope = await execute({
  ...input,
  contextCandidates: [{
    path: 'private/token.txt',
    reasons: [{ kind: 'direct_import', sourcePath: 'src/index.ts' }],
    dependencyDepth: 1,
  }],
}, testContext([pass], scopeInvocations));
assert.equal(outsideScope.outcome, 'blocked');
assert.equal(
  scopeInvocations.some(({ request }) => request.resource.canonicalId === 'private/token.txt'),
  false,
  'out-of-scope candidates are rejected before repository content is read',
);

const provenanceInvocations = [];
const danglingProvenance = await execute({
  ...input,
  contextCandidates: [{
    path: 'src/support.ts',
    reasons: [{ kind: 'direct_import', sourcePath: 'src/missing.ts' }],
    dependencyDepth: 1,
  }],
}, testContext([pass], provenanceInvocations));
assert.equal(danglingProvenance.outcome, 'blocked');
assert.equal(
  provenanceInvocations.some(({ request }) => request.resource.canonicalId === 'src/support.ts'),
  false,
  'dangling provenance is rejected before repository content is read',
);

await assert.rejects(execute(input, {
  ...testContext(),
  async invoke() { throw new Error('provider unavailable'); },
}), /provider unavailable/u, 'provider failures remain core retry authority');

const dispatchFailure = testContext();
const dispatchInvoke = dispatchFailure.invoke.bind(dispatchFailure);
dispatchFailure.invoke = async (capability, request) => capability === 'runtime.dispatch'
  ? Promise.reject(new Error('review runtime unavailable'))
  : dispatchInvoke(capability, request);
await assert.rejects(
  execute(input, dispatchFailure), /review runtime unavailable/u,
  'runtime failures remain core retry authority',
);

await assert.rejects(execute(input, { ...testContext(), contract: { config: {} } }), /agent is not configured/u);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'stage-unit' }));
