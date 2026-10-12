import assert from 'node:assert/strict';

import { preflightScalableReviewResults, buildScalableVerificationJobs, executeScalableVerificationJobs,
  reduceScalableReview, scalableVerificationTask }
  from '../src/scalable-review-verification.ts';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

const digest = (character) => `sha256:${character.repeat(64)}`;
const runtimeIdentity = { targetId: 'echo', runtime: 'subagent', agentId: 'codex',
  model: 'gpt-5.6-terra', thinking: 'high' };
const runtimeEvidence = { schemaVersion: 'runtime-agent-attestation.v1', ...runtimeIdentity,
  identityDigest: sha256Text(canonicalJson(runtimeIdentity)) };
const source = [{ path: 'a.ts', content: 'throw new Error("broken");\n', digest: digest('a'),
  complete: true, ranges: [{ startLine: 1, endLine: 1 }] }];
const requirements = [{ id: 'component.correctness', text: 'Correct.' }];
const job = { schemaVersion: 'scalable-review-job.v1', id: 'component:slice-1', kind: 'component',
  source, relationKeys: [], relatedIds: ['slice-1'], requirements, task: 'review', digest: digest('b') };
const evidence = { kind: 'reviewed-source', digest: digest('a') };
const finding = { category: 'correctness', priority: 'P1', claim: 'The operation always throws.',
  impact: 'The operation cannot complete.', locations: [{ path: 'a.ts', lineHint: 1 }], evidence: [evidence],
  recommendedFix: 'Return the intended value.', changeRelation: 'introduced', scopeRelation: 'inside',
  evidenceStrength: 'direct', rootCauseHint: 'unconditional-throw' };
const parsed = { ok: true, value: { schemaVersion: 'echo-review-output.v1', summary: 'Reviewed.',
  inspectedEvidence: [evidence], requirementAssessments: { 'component.correctness': {
    assessment: 'violated', explanation: 'The source always throws.', evidence: [evidence] } },
  proposedFindings: [finding] } };
const preflight = preflightScalableReviewResults([job], [{ jobId: job.id, jobDigest: job.digest, parsed }]);
assert.equal(preflight.integrityIssues.length, 0);
assert.equal(preflight.proposals.length, 1);
const policyDigest = digest('c');
const verificationJobs = buildScalableVerificationJobs(preflight, [job], policyDigest);
assert.equal(verificationJobs.length, 1);
const verification = verificationJobs[0];
assert.equal(verification.taskDigest, sha256Text(scalableVerificationTask()));
const largeContent = Array.from({ length: 5_000 }, (_value, index) => `export const value${index} = true;`).join('\n');
const boundedFinding = { ...finding, locations: [{ path: 'a.ts', lineHint: 2_500 }] };
const boundedProposal = { ...preflight.proposals[0], finding: boundedFinding };
const boundedJobs = buildScalableVerificationJobs(
  { proposals: [boundedProposal], integrityIssues: [], incompleteJobs: [] },
  [{ ...job, source: [{ path: 'a.ts', content: largeContent, digest: sha256Text(largeContent),
    complete: true, ranges: [{ startLine: 1, endLine: 5_000 }] }] }], policyDigest,
  { tokenizerEncoding: 'o200k_base', maxPromptBytes: 200_000, maxInputTokens: 20_000 },
);
assert.equal(boundedJobs[0].source[0].complete, false);
assert.equal(boundedJobs[0].source[0].ranges.some(({ startLine, endLine }) => (
  startLine <= 2_500 && endLine >= 2_500
)), true);
const verified = { ok: true, value: { schemaVersion: 'echo-review-verification.v1',
  bundleDigest: verification.digest, policyDigest, proposalSetDigest: verification.proposalSetDigest,
  results: { [preflight.proposals[0].id]: { verdict: 'confirmed', reason: 'The exact line always throws.', evidence: [evidence] } } } };
const reduced = reduceScalableReview(verificationJobs, [{ jobId: verification.id, parsed: verified }]);
assert.equal(reduced.confirmed.length, 1);
assert.equal(reduced.incompleteJobs.length, 0);
assert.equal(reduced.unverifiedProposals.length, 0);
const unsupportedVerification = { ...verified, value: { ...verified.value, results: {
  [preflight.proposals[0].id]: { verdict: 'confirmed', reason: 'Unsupported.',
    evidence: [{ kind: 'reviewed-source', digest: digest('d') }] } } } };
const unsupportedReduction = reduceScalableReview(verificationJobs,
  [{ jobId: verification.id, parsed: unsupportedVerification }]);
assert.equal(unsupportedReduction.confirmed.length, 0);
assert.deepEqual(unsupportedReduction.incompleteJobs, [verification.id]);
assert.throws(() => preflightScalableReviewResults([job], [
  { jobId: job.id, jobDigest: job.digest, parsed }, { jobId: job.id, jobDigest: job.digest, parsed },
]), /duplicate job result/u);
assert.throws(() => reduceScalableReview(verificationJobs, [
  { jobId: verification.id, parsed: verified }, { jobId: verification.id, parsed: verified },
]), /duplicate job result/u);

const wrongEvidence = { ...parsed, value: { ...parsed.value, proposedFindings: [{ ...finding,
  evidence: [{ kind: 'reviewed-source', digest: digest('d') }] }] } };
const wrongEvidencePreflight = preflightScalableReviewResults([job], [{ jobId: job.id, jobDigest: job.digest,
  parsed: wrongEvidence }]);
assert.deepEqual(wrongEvidencePreflight.integrityIssues, []);
assert.deepEqual(wrongEvidencePreflight.incompleteJobs, [job.id]);
assert.equal(wrongEvidencePreflight.proposals.length, 0);
assert.equal(buildScalableVerificationJobs({ ...preflight, incompleteJobs: ['missing'] }, [job], policyDigest).length, 1);
const contextRequested = { ok: true, value: { ...parsed.value, proposedFindings: [],
  contextRequest: { paths: ['b.ts'], reason: 'Need the boundary source.' } } };
const deferredPreflight = preflightScalableReviewResults([job],
  [{ jobId: job.id, jobDigest: job.digest, parsed: contextRequested }], new Set([job.id]));
assert.deepEqual(deferredPreflight.incompleteJobs, [job.id]);
assert.deepEqual(deferredPreflight.integrityIssues, []);
assert.deepEqual(reduceScalableReview([], [], deferredPreflight.incompleteJobs).incompleteJobs, [job.id]);
assert.deepEqual(reduceScalableReview([], [], [], [boundedProposal.id]).unverifiedProposals, [boundedProposal.id]);

const context = { async invoke(capability, request) {
  assert.equal(capability, 'runtime.dispatch');
  const payload = request.payload.verification;
  const [proposalId] = Object.keys(payload.proposals);
  return { runtimeEvidence, result: { schemaVersion: 'echo-review-verification.v1',
    bundleDigest: payload.bundleDigest, policyDigest: payload.policyDigest,
    proposalSetDigest: payload.proposalSetDigest,
    results: { [proposalId]: { verdict: 'confirmed', reason: 'Exact source confirms the defect.', evidence: [evidence] } } } };
} };
const dispatched = await executeScalableVerificationJobs(verificationJobs, 'echo', context, 2);
assert.equal(dispatched.length, 1);
assert.equal(dispatched[0].parsed.ok, true);

const multiSource = [...source, { path: 'b.ts', content: 'export const support = true;\n', digest: digest('e'),
  complete: true, ranges: [{ startLine: 1, endLine: 1 }] }];
const multiSourceFinding = { ...finding,
  locations: [{ path: 'a.ts', lineHint: 1 }, { path: 'b.ts', lineHint: 1 }],
  evidence: [evidence, { kind: 'reviewed-source', digest: digest('e') }] };
const multiSourceProposal = { ...preflight.proposals[0], finding: multiSourceFinding };
const multiSourceJobs = buildScalableVerificationJobs(
  { proposals: [multiSourceProposal], integrityIssues: [], incompleteJobs: [] },
  [{ ...job, source: multiSource }], policyDigest,
);
let semanticAttempts = 0;
const semanticRetryContext = { async invoke(_capability, request) {
  semanticAttempts += 1;
  const payload = request.payload.verification;
  const [proposalId] = Object.keys(payload.proposals);
  return { runtimeEvidence, result: { schemaVersion: 'echo-review-verification.v1',
    bundleDigest: payload.bundleDigest, policyDigest: payload.policyDigest,
    proposalSetDigest: payload.proposalSetDigest,
    results: { [proposalId]: { verdict: 'confirmed', reason: 'Exact source confirms the defect.',
      evidence: semanticAttempts === 1 ? [evidence] : multiSourceFinding.evidence } } } };
} };
const semanticRetry = await executeScalableVerificationJobs(
  multiSourceJobs, 'echo', semanticRetryContext, { concurrency: 1, maxRetries: 1 },
);
assert.equal(semanticAttempts, 2, 'semantically incomplete verification is retried');
assert.equal(reduceScalableReview(multiSourceJobs, semanticRetry).confirmed.length, 1);
let verificationRetryChecks=0;
const incompleteVerificationContext={async invoke(_capability,request){
  const payload=request.payload.verification;const [proposalId]=Object.keys(payload.proposals);
  return {runtimeEvidence,result:{schemaVersion:'echo-review-verification.v1',bundleDigest:payload.bundleDigest,
    policyDigest:payload.policyDigest,proposalSetDigest:payload.proposalSetDigest,
    results:{[proposalId]:{verdict:'confirmed',reason:'Incomplete evidence.',evidence:[evidence]}}}};
}};
await assert.rejects(() => executeScalableVerificationJobs(
  multiSourceJobs,'echo',incompleteVerificationContext,{concurrency:1,maxRetries:2,
    beforeRetry:()=>{verificationRetryChecks+=1;throw new Error('shared retry budget exhausted');}},
),/shared retry budget exhausted/u);
assert.equal(verificationRetryChecks,1,'verification retry admission is checked before another dispatch');

const boundarySources = ['a', 'b', 'c', 'd'].map((name) => ({
  path: `${name}.ts`, content: `export const ${name} = true;\n`, digest: digest(name),
  complete: true, ranges: [{ startLine: 1, endLine: 1 }],
}));
const boundaryJob = { ...job, id: 'boundary:slice-1-slice-2', kind: 'boundary', source: boundarySources,
  relationKeys: ['import\0a.ts\0b.ts\0typescript\0source', 'import\0c.ts\0d.ts\0typescript\0source'] };
const boundaryFinding = { ...finding, locations: [{ path: 'a.ts', lineHint: 1 }, { path: 'c.ts', lineHint: 1 }],
  evidence: [{ kind: 'reviewed-source', digest: digest('a') }, { kind: 'reviewed-source', digest: digest('c') }] };
const boundaryParsed = { ...parsed, value: { ...parsed.value,
  inspectedEvidence: boundaryFinding.evidence, proposedFindings: [boundaryFinding] } };
assert.deepEqual(preflightScalableReviewResults([boundaryJob], [{ jobId: boundaryJob.id,
  jobDigest: boundaryJob.digest, parsed: boundaryParsed }]).incompleteJobs, [boundaryJob.id]);
const relatedFinding = { ...boundaryFinding, locations: [{ path: 'a.ts', lineHint: 1 }, { path: 'b.ts', lineHint: 1 }],
  evidence: [{ kind: 'reviewed-source', digest: digest('a') }, { kind: 'reviewed-source', digest: digest('b') }] };
const relatedParsed = { ...boundaryParsed, value: { ...boundaryParsed.value,
  inspectedEvidence: relatedFinding.evidence, proposedFindings: [relatedFinding] } };
assert.equal(preflightScalableReviewResults([boundaryJob], [{ jobId: boundaryJob.id,
  jobDigest: boundaryJob.digest, parsed: relatedParsed }]).integrityIssues.length, 0);
const mismatchedLocations = { ...relatedFinding,
  locations: [{ path: 'a.ts', lineHint: 1 }, { path: 'c.ts', lineHint: 1 }],
  evidence: [...relatedFinding.evidence, { kind: 'reviewed-source', digest: digest('c') }] };
const mismatchedParsed = { ...relatedParsed, value: { ...relatedParsed.value,
  proposedFindings: [mismatchedLocations] } };
assert.deepEqual(preflightScalableReviewResults([boundaryJob], [{ jobId: boundaryJob.id,
  jobDigest: boundaryJob.digest, parsed: mismatchedParsed }]).incompleteJobs, [boundaryJob.id]);

const lensJob = { ...job, id: 'system-lens:security', kind: 'system-lens', source: [],
  systemContext: { relationCount: 2, topologyEvidence: { kind: 'reviewed-topology', digest: digest('e') } },
  requirements: [{ id: 'system.topology', text: 'Topology is coherent.' }] };
const lensParsed = { ...parsed, value: { ...parsed.value, inspectedEvidence: [], proposedFindings: [],
  requirementAssessments: { 'system.topology': { assessment: 'unverified',
    explanation: 'The topology could not be certified.', evidence: [] } } } };
assert.deepEqual(preflightScalableReviewResults([lensJob], [{ jobId: lensJob.id,
  jobDigest: lensJob.digest, parsed: lensParsed }]).incompleteJobs, [lensJob.id]);
const certifiedLens = { ...lensParsed, value: { ...lensParsed.value, requirementAssessments: {
  'system.topology': { assessment: 'satisfied', explanation: 'The topology is coherent.',
    evidence: [{ kind: 'reviewed-topology', digest: digest('e') }] } },
  inspectedEvidence: [{ kind: 'reviewed-topology', digest: digest('e') }] } };
assert.equal(preflightScalableReviewResults([lensJob], [{ jobId: lensJob.id,
  jobDigest: lensJob.digest, parsed: certifiedLens }]).integrityIssues.length, 0);
const incompleteLens = { ...certifiedLens, value: { ...certifiedLens.value, requirementAssessments: {} } };
assert.deepEqual(preflightScalableReviewResults([lensJob], [{ jobId: lensJob.id,
  jobDigest: lensJob.digest, parsed: incompleteLens }]).incompleteJobs, [lensJob.id]);
const pathJob = { ...lensJob, id: 'system-path:security', kind: 'system-path' };
assert.deepEqual(preflightScalableReviewResults([pathJob], [{ jobId: pathJob.id,
  jobDigest: pathJob.digest, parsed: lensParsed }]).incompleteJobs, [pathJob.id]);
const sourceLessFinding = { ...finding, locations: [], evidence: [] };
const sourceLessParsed = { ...certifiedLens, value: { ...certifiedLens.value,
  proposedFindings: [sourceLessFinding] } };
assert.deepEqual(preflightScalableReviewResults([pathJob], [{ jobId: pathJob.id,
  jobDigest: pathJob.digest, parsed: sourceLessParsed }]).incompleteJobs, [pathJob.id]);

console.log(JSON.stringify({ ok: true, suite: 'scalable-review-verification' }));
