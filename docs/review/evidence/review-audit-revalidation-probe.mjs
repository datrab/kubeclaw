import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { parseRepositoryRevalidationResult } from '../../../skills/nova/plugins/review/src/repository-revalidation-contract.ts';
import { buildRepositoryRevalidationBacklog,
  executeRepositoryRevalidation } from '../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts';

const baselineHead = '1'.repeat(40), targetHead = '2'.repeat(40);
const fingerprint = `sha256:${'a'.repeat(64)}`, clusterId = `sha256:${'b'.repeat(64)}`;
const sourceContent = 'export function current() { return true; }\n';
const sourceDigest = sha256Text(sourceContent);
const parsed = parseRepositoryRevalidationResult({
  schemaVersion: 'repository-finding-revalidation.v1', findingFingerprint: fingerprint, targetHead,
  disposition: 'accepted_current', reason: 'The current function still returns the vulnerable value.',
  evidence: [{ path: 'src/current.ts', lineHint: 1, symbol: 'current', digest: sourceDigest }],
  validationCommands: ['node tests/current.test.mjs'], remediationDependencies: [],
}, { fingerprint, targetHead, sources: new Map([['src/current.ts',
  { digest: sourceDigest, ranges: [{ startLine: 1, endLine: 1 }] }]]), relationshipFingerprints: new Set() });
assert.equal(parsed.disposition, 'accepted_current');
assert.throws(() => parseRepositoryRevalidationResult({ ...parsed,
  evidence: [parsed.evidence[0], parsed.evidence[0]] },
{ fingerprint, targetHead, sources: new Map([['src/current.ts',
  { digest: sourceDigest, ranges: [{ startLine: 1, endLine: 1 }] }]]), relationshipFingerprints: new Set() }), /not unique/u);
assert.throws(() => parseRepositoryRevalidationResult({ ...parsed,
  evidence: [{ ...parsed.evidence[0], digest: `sha256:${'c'.repeat(64)}` }] },
{ fingerprint, targetHead, sources: new Map([['src/current.ts',
  { digest: sourceDigest, ranges: [{ startLine: 1, endLine: 1 }] }]]), relationshipFingerprints: new Set() }), /not supplied source/u);
assert.throws(() => parseRepositoryRevalidationResult({ ...parsed,
  disposition: 'superseded_by_shared_root_cause' },
{ fingerprint, targetHead, sources: new Map([['src/current.ts',
  { digest: sourceDigest, ranges: [{ startLine: 1, endLine: 1 }] }]]), relationshipFingerprints: new Set() }), /supersession/u);
assert.throws(() => parseRepositoryRevalidationResult({ ...parsed, evidence: [] },
{ fingerprint, targetHead, sources: new Map([['src/current.ts',
  { digest: sourceDigest, ranges: [{ startLine: 1, endLine: 1 }] }]]), relationshipFingerprints: new Set() }), /requires current evidence/u);
assert.throws(() => parseRepositoryRevalidationResult({ ...parsed,
  evidence: [{ ...parsed.evidence[0], lineHint: 2 }] },
{ fingerprint, targetHead, sources: new Map([['src/current.ts',
  { digest: sourceDigest, ranges: [{ startLine: 1, endLine: 1 }] }]]), relationshipFingerprints: new Set() }), /not supplied source/u);
const otherFingerprint = `sha256:${'e'.repeat(64)}`;
assert.throws(() => buildRepositoryRevalidationBacklog({ head: baselineHead, findings: [
  { fingerprint, clusterId, finding: { priority: 'P2', category: 'correctness',
    locations: [{ path: 'src/current.ts' }] } },
  { fingerprint: otherFingerprint, clusterId: `sha256:${'f'.repeat(64)}`,
    finding: { priority: 'P2', category: 'correctness', locations: [{ path: 'src/other.ts' }] } },
] }, targetHead, [{ ...parsed, disposition: 'superseded_by_shared_root_cause',
  supersededBy: otherFingerprint }], {
  calls: 1, reservedPromptBytes: 1, modelPayloadBytes: 1, initialCalls: 0, contextExpansionCalls: 0,
  verificationCalls: 1, initialPromptBytes: 0, contextExpansionPromptBytes: 0, verificationPromptBytes: 1,
  initialPayloadBytes: 0, contextExpansionPayloadBytes: 0, verificationPayloadBytes: 1,
  reservedInputTokens: 1, reservedOutputTokens: 1, initialInputTokens: 0,
  contextExpansionInputTokens: 0, verificationInputTokens: 1, reservedEstimatedCostUsd: 0,
}), /supersession target is invalid/u);
assert.throws(() => buildRepositoryRevalidationBacklog({ head: baselineHead, findings: [
  { fingerprint, clusterId, finding: { priority: 'P2', category: 'correctness',
    locations: [{ path: 'src/current.ts' }] } },
] }, targetHead, [{ ...parsed, remediationDependencies: [`sha256:${'9'.repeat(64)}`] }], {
  calls: 1, reservedPromptBytes: 1, modelPayloadBytes: 1, initialCalls: 0, contextExpansionCalls: 0,
  verificationCalls: 1, initialPromptBytes: 0, contextExpansionPromptBytes: 0, verificationPromptBytes: 1,
  initialPayloadBytes: 0, contextExpansionPayloadBytes: 0, verificationPayloadBytes: 1,
  reservedInputTokens: 1, reservedOutputTokens: 1, initialInputTokens: 0,
  contextExpansionInputTokens: 0, verificationInputTokens: 1, reservedEstimatedCostUsd: 0,
}), /remediation dependency is invalid/u);
assert.throws(() => buildRepositoryRevalidationBacklog({ head: baselineHead, findings: [
  { fingerprint, clusterId, finding: { priority: 'P2', category: 'correctness',
    locations: [{ path: 'src/current.ts' }] } },
  { fingerprint: otherFingerprint, clusterId,
    finding: { priority: 'P2', category: 'correctness', locations: [{ path: 'src/other.ts' }] } },
] }, targetHead, [
  { ...parsed, remediationDependencies: [otherFingerprint] },
  { ...parsed, findingFingerprint: otherFingerprint, remediationDependencies: [fingerprint] },
], {
  calls: 2, reservedPromptBytes: 2, modelPayloadBytes: 2, initialCalls: 0, contextExpansionCalls: 0,
  verificationCalls: 2, initialPromptBytes: 0, contextExpansionPromptBytes: 0, verificationPromptBytes: 2,
  initialPayloadBytes: 0, contextExpansionPayloadBytes: 0, verificationPayloadBytes: 2,
  reservedInputTokens: 2, reservedOutputTokens: 2, initialInputTokens: 0,
  contextExpansionInputTokens: 0, verificationInputTokens: 2, reservedEstimatedCostUsd: 0,
}), /dependency cycle is invalid/u);
assert.throws(() => buildRepositoryRevalidationBacklog({ head: baselineHead, findings: [
  { fingerprint, clusterId, finding: { priority: 'P2', category: 'correctness',
    locations: [{ path: 'src/current.ts' }] } },
  { fingerprint: otherFingerprint, clusterId,
    finding: { priority: 'P2', category: 'correctness', locations: [{ path: 'src/other.ts' }] } },
] }, targetHead, [
  { ...parsed, disposition: 'superseded_by_shared_root_cause', supersededBy: otherFingerprint },
  { ...parsed, findingFingerprint: otherFingerprint, disposition: 'superseded_by_shared_root_cause',
    supersededBy: fingerprint },
], {
  calls: 2, reservedPromptBytes: 2, modelPayloadBytes: 2, initialCalls: 0, contextExpansionCalls: 0,
  verificationCalls: 2, initialPromptBytes: 0, contextExpansionPromptBytes: 0, verificationPromptBytes: 2,
  initialPayloadBytes: 0, contextExpansionPayloadBytes: 0, verificationPayloadBytes: 2,
  reservedInputTokens: 2, reservedOutputTokens: 2, initialInputTokens: 0,
  contextExpansionInputTokens: 0, verificationInputTokens: 2, reservedEstimatedCostUsd: 0,
}), /supersession target is invalid/u);

const baselineReport = { schemaVersion: 'repository-review-report.v1', head: baselineHead,
  map: { relationsJsonl: `${JSON.stringify({ from: 'src/current.ts', to: 'src/caller.ts' })}\n` },
  reduction: { confirmed: [{ fingerprint, clusterId, finding: { priority: 'P2', category: 'correctness',
    claim: 'current returns the wrong value.', locations: [
      { path: 'src/current.ts', lineHint: 1, symbol: 'current' },
      { path: 'docs/shared.ts', lineHint: 1, symbol: 'shared' },
    ] } },
  { fingerprint: `sha256:${'e'.repeat(64)}`, clusterId: `sha256:${'f'.repeat(64)}`,
    finding: { priority: 'P3', category: 'simplification', claim: 'Documentation helper is unused.',
      locations: [{ path: 'docs/other.ts', lineHint: 1, symbol: 'other' }] } }] } };
const baselineSerialized = canonicalJson(baselineReport), baselineDigest = sha256Text(baselineSerialized);
const baselineRef = { artifactId: `repository-review:${'d'.repeat(64)}`, namespace: 'kubeclaw.review',
  mediaType: 'application/json', digest: baselineDigest, sizeBytes: Buffer.byteLength(baselineSerialized) };
const inventory = [{ path: 'src/current.ts', objectId: '3'.repeat(40), mode: '100644',
  sizeBytes: Buffer.byteLength(sourceContent) }];
const inventoryDigest = sha256Text(canonicalJson(inventory));
const attempt = { runId: 'revalidation-run', stageId: 'repository-revalidation',
  attemptId: 'attempt-1', attemptNumber: 0 };
const runtimeIdentity = { targetId: 'echo', runtime: 'subagent', agentId: 'codex',
  model: 'gpt-5.6-terra', thinking: 'high' };
const runtimeEvidence = { schemaVersion: 'runtime-agent-attestation.v1', ...runtimeIdentity,
  identityDigest: sha256Text(canonicalJson(runtimeIdentity)) };
let dispatched = 0, storedBacklog;
const context = { contract: { config: { agent: 'echo', reviewerModel: 'gpt-5.6-terra' }, artifacts: [],
  lease: { attempt } }, async invoke(capability, request) {
  if (capability === 'artifacts.read') return { value: baselineReport, digest: baselineDigest,
    sizeBytes: Buffer.byteLength(baselineSerialized) };
  if (capability === 'git.repository.read' && request.operation === 'freeze_head') {
    return { head: targetHead, proof: '4'.repeat(64) };
  }
  if (capability === 'git.repository.read' && request.operation === 'verify_ancestry') {
    assert.equal(request.payload.base, baselineHead);
    assert.equal(request.payload.head, targetHead);
    return { base: baselineHead, head: targetHead, ancestryVerified: true };
  }
  if (capability === 'git.repository.read' && request.operation === 'inventory_revision') {
    return { head: targetHead, files: inventory, inventoryDigest };
  }
  if (capability === 'git.repository.read' && request.operation === 'read_revision_text') {
    return { head: targetHead, path: 'src/current.ts', objectId: inventory[0].objectId,
      sizeBytes: inventory[0].sizeBytes, content: sourceContent, digest: sourceDigest };
  }
  if (capability === 'runtime.dispatch') {
    dispatched += 1;
    assert.equal(request.payload.revalidation.baselineHead, baselineHead);
    assert.equal(request.payload.revalidation.targetHead, targetHead);
    assert.equal(request.payload.revalidation.currentSource[0].digest, sourceDigest);
    assert.deepEqual(request.payload.revalidation.currentPathStates,
      [{ path: 'docs/shared.ts', state: 'outside-scope' },
        { path: 'src/current.ts', state: 'present', objectId: inventory[0].objectId }]);
    return { runtimeEvidence, result: { schemaVersion: 'repository-finding-revalidation.v1',
      findingFingerprint: fingerprint, targetHead, disposition: 'accepted_current',
      reason: 'The current function still returns the vulnerable value.',
      evidence: [{ path: 'src/current.ts', lineHint: 1, symbol: 'current', digest: sourceDigest }],
      validationCommands: ['node tests/current.test.mjs'], remediationDependencies: [] } };
  }
  if (capability === 'artifacts.write') {
    storedBacklog = request.payload.value;
    const serialized = canonicalJson(storedBacklog), digest = sha256Text(serialized);
    return { artifact: { artifactId: request.resource.canonicalId, namespace: 'kubeclaw.review',
      mediaType: 'application/json', digest, sizeBytes: Buffer.byteLength(serialized), producer: attempt } };
  }
  throw new Error(`unexpected invocation: ${capability}:${request.operation}`);
} };
const result = await executeRepositoryRevalidation({ baselineReport: baselineRef, grade: 'fast',
  scope: { kind: 'path', prefixes: ['src/'] } }, context);
assert.equal(result.outcome, 'passed');
assert.equal(dispatched, 1);
assert.equal(result.facts['review.revalidation_accepted_current'], 1);
assert.equal(storedBacklog.schemaVersion, 'repository-revalidation-backlog.v1');
assert.equal(storedBacklog.items[0].owner, 'src');
assert.equal(storedBacklog.items[0].rootCauseId, clusterId);
assert.deepEqual(storedBacklog.items[0].validationCommands, ['node tests/current.test.mjs']);

const tampered = await executeRepositoryRevalidation({ baselineReport: { ...baselineRef, sizeBytes: 1 }, grade: 'fast' }, context);
assert.equal(tampered.outcome, 'blocked');
assert.match(tampered.reason.message, /proof is invalid/u);

const oversizedRelationsReport = { ...baselineReport, map: { relationsJsonl: Array.from({ length: 100_001 },
  () => JSON.stringify({ from: 'src/current.ts', to: 'src/caller.ts' })).join('\n') } };
const oversizedSerialized = canonicalJson(oversizedRelationsReport), oversizedDigest = sha256Text(oversizedSerialized);
const oversizedContext = { ...context, async invoke(capability, request) {
  if (capability === 'artifacts.read') return { value: oversizedRelationsReport, digest: oversizedDigest,
    sizeBytes: Buffer.byteLength(oversizedSerialized) };
  return context.invoke(capability, request);
} };
const oversized = await executeRepositoryRevalidation({ baselineReport: { ...baselineRef,
  digest: oversizedDigest, sizeBytes: Buffer.byteLength(oversizedSerialized) }, grade: 'fast' }, oversizedContext);
assert.equal(oversized.outcome, 'blocked');
assert.match(oversized.reason.message, /relation count is too large/u);

console.log(JSON.stringify({ ok: true, suite: 'repository-revalidation' }));

let retryProbeCalls=0;
const retryProbeContext={...context,async invoke(capability,request){
 if(capability==='runtime.dispatch' && ++retryProbeCalls===1) throw new Error('transient');
 return context.invoke(capability,request);
}};
const retryProbe=await executeRepositoryRevalidation({baselineReport:baselineRef,grade:'fast',scope:{kind:'path',prefixes:['src/']},overrides:{maxRetryAttemptsPerPhase:0,maxRetries:1}},retryProbeContext);
assert.equal(retryProbe.outcome,'passed'); assert.equal(retryProbeCalls,2);
console.log(JSON.stringify({probe:'revalidation-zero-shared-retries',outcome:retryProbe.outcome,calls:retryProbeCalls}));
const failureProbe={...context,async invoke(capability,request){if(capability==='runtime.dispatch')throw new Error('transport unavailable');return context.invoke(capability,request);}};
const failureResult=await executeRepositoryRevalidation({baselineReport:baselineRef,grade:'fast',scope:{kind:'path',prefixes:['src/']},overrides:{maxRetries:0}},failureProbe);
assert.equal(failureResult.outcome,'blocked');
console.log(JSON.stringify({probe:'revalidation-transport',outcome:failureResult.outcome,reason:failureResult.reason}));

const twoFindingReport={...baselineReport,reduction:{confirmed:[baselineReport.reduction.confirmed[0],{...baselineReport.reduction.confirmed[0],fingerprint:otherFingerprint}]}};
const twoSerialized=canonicalJson(twoFindingReport),twoDigest=sha256Text(twoSerialized);
let countProbeCalls=0;
const countProbeContext={...context,async invoke(capability,request){
 if(capability==='artifacts.read')return {value:twoFindingReport,digest:twoDigest,sizeBytes:Buffer.byteLength(twoSerialized)};
 const response=await context.invoke(capability,request);
 if(capability==='runtime.dispatch'){countProbeCalls++;return {...response,result:{...response.result,findingFingerprint:request.payload.revalidation.findingFingerprint}};}
 return response;
}};
const countResult=await executeRepositoryRevalidation({baselineReport:{...baselineRef,digest:twoDigest,sizeBytes:Buffer.byteLength(twoSerialized)},grade:'fast',scope:{kind:'path',prefixes:['src/']},overrides:{maxVerificationJobs:1}},countProbeContext);
assert.equal(countResult.outcome,'passed');assert.equal(countProbeCalls,2);
console.log(JSON.stringify({probe:'revalidation-one-job-cap',outcome:countResult.outcome,calls:countProbeCalls,cap:1}));
