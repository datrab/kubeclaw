import fs from 'node:fs';
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

const grades=JSON.parse(fs.readFileSync(new URL('../../../config/plugins/kubeclaw.review/profiles/standard.config.json',import.meta.url),'utf8')).profiles.standard.settings;
const selectedContext={...context,contract:{...context.contract,config:{...context.contract.config,ownedPolicyProfiles:grades,repositoryRuntimeTarget:{tokenizerEncoding:'o200k_base',maxInputTokens:120000,maxOutputTokens:6000,maxContextTokens:128000,maxPromptBytes:900000}}}};
const selectedResult=await executeRepositoryRevalidation({baselineReport:baselineRef,grade:'fast',scope:{kind:'path',prefixes:['src/']}},selectedContext);assert.equal(selectedResult.outcome,'passed');
const duplicateResult=await executeRepositoryRevalidation({baselineReport:baselineRef,grade:'fast',overrides:{}},selectedContext);assert.equal(duplicateResult.outcome,'blocked');assert.match(duplicateResult.reason.message,/COMPETING_AUTHOR/);

// Actual baseline-read boundary: selected A/B owners and retained historical captures.
const { captureReviewPolicy } = await import('../../../skills/common/plugin-runtime/foundation/config/review-owned-policy.ts');
const { selectedReviewRevalidationLimits } = await import('../../../skills/nova/plugins/review/src/review-policy-profiles.ts');
const captureLimits = settings => captureReviewPolicy({ schemaVersion: 'review-policy-capture.v1',
  source: { file: '/original/review-owner.json', profile: 'standard' }, settings });
for (const bad of [undefined, null, {}, { maximumBaselineBytes: 0, maximumBaselineRelations: 1 },
  { maximumBaselineBytes: 134217729, maximumBaselineRelations: 1 },
  { maximumBaselineBytes: 1024, maximumBaselineRelations: 100001 },
  { maximumBaselineBytes: 1024, maximumBaselineRelations: '1' },
  { maximumBaselineBytes: 1024, maximumBaselineRelations: 1, extra: true }]) {
  const settings = { ...grades, revalidation: bad }; if (bad === undefined) delete settings.revalidation;
  assert.throws(() => captureLimits(settings), /CAPTURE_INVALID/);
  assert.throws(() => selectedReviewRevalidationLimits({ ownedPolicyProfiles: settings }), /REVALIDATION_LIMITS_INVALID|OWNED_POLICY_INVALID/);
}
const oldSettings = { ...grades, schemaVersion: 'review-owned-decision-profiles.v4' }; delete oldSettings.revalidation;
const retainedV4 = captureLimits(oldSettings);
assert.deepEqual(selectedReviewRevalidationLimits({ ownedPolicyProfiles: retainedV4.settings }),
  { maximumBaselineBytes: 134217728, maximumBaselineRelations: 100000 });
assert.throws(() => captureLimits({ ...oldSettings, revalidation: grades.revalidation }), /CAPTURE_INVALID/);
assert.throws(() => selectedReviewRevalidationLimits({ ownedPolicyProfiles: { ...oldSettings, revalidation: grades.revalidation } }), /OWNED_POLICY_INVALID/);
const inputForLimits = { baselineReport: baselineRef, grade: 'fast', scope: { kind: 'path', prefixes: ['src/'] } };
const capturedA = captureLimits({ ...grades, revalidation: { maximumBaselineBytes: baselineRef.sizeBytes, maximumBaselineRelations: 1 } });
const capturedB = captureLimits({ ...grades, revalidation: { maximumBaselineBytes: baselineRef.sizeBytes - 1, maximumBaselineRelations: 1 } });
for (const [captured, expected] of [[capturedA, 'passed'], [capturedB, 'blocked'],
  [captureReviewPolicy(JSON.parse(JSON.stringify(capturedA))), 'passed'], [retainedV4, 'passed']]) {
  let reads = 0;
  const scoped = { ...selectedContext, contract: { ...selectedContext.contract,
    config: { ...selectedContext.contract.config, ownedPolicyProfiles: captured.settings } },
    async invoke(capability, request) { if (capability === 'artifacts.read') reads++; return context.invoke(capability, request); } };
  const result = await executeRepositoryRevalidation(inputForLimits, scoped);
  assert.equal(result.outcome, expected);
  assert.equal(reads, expected === 'blocked' ? 0 : 1);
  if (expected === 'blocked') assert.match(result.reason.message, /sizeBytes is invalid/);
}
const twoRelations = { ...baselineReport, map: { relationsJsonl: baselineReport.map.relationsJsonl.repeat(2) } };
const twoSerialized = canonicalJson(twoRelations), twoDigest = sha256Text(twoSerialized);
for (const [maximumBaselineRelations, expected] of [[1, 'blocked'], [2, 'passed']]) {
  const captured = captureLimits({ ...grades, revalidation: { maximumBaselineBytes: Buffer.byteLength(twoSerialized), maximumBaselineRelations } });
  const scoped = { ...selectedContext, contract: { ...selectedContext.contract,
    config: { ...selectedContext.contract.config, ownedPolicyProfiles: captured.settings } },
    async invoke(capability, request) {
      if (capability === 'artifacts.read') return { value: twoRelations, digest: twoDigest, sizeBytes: Buffer.byteLength(twoSerialized) };
      return context.invoke(capability, request);
    } };
  const result = await executeRepositoryRevalidation({ ...inputForLimits,
    baselineReport: { ...baselineRef, digest: twoDigest, sizeBytes: Buffer.byteLength(twoSerialized) } }, scoped);
  assert.equal(result.outcome, expected);
  if (expected === 'blocked') assert.match(result.reason.message, /relation count is too large/);
}
console.log(JSON.stringify({ ok: true, suite: 'selected-revalidation-limits-A-B-retained-v4-v5' }));
