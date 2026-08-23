import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { executeRepositoryAudit } from '../src/repository-audit-stage.ts';
import { REVIEW_HARD_LIMITS } from '../src/review-hard-limits.ts';

const head = 'a'.repeat(40), proof = 'b'.repeat(64);
const runtimeIdentity = { targetId: 'echo', runtime: 'subagent', agentId: 'codex',
  model: 'gpt-5.6-terra', thinking: 'high' };
const runtimeEvidence = { schemaVersion: 'runtime-agent-attestation.v1', ...runtimeIdentity,
  identityDigest: sha256Text(canonicalJson(runtimeIdentity)) };
const attempt = { runId: 'run-1', stageId: 'repository-audit', attemptId: 'attempt-1', attemptNumber: 0 };
const context = {
  contract: { config: { agent: 'echo', reviewerModel: 'gpt-5.6-terra', profile: 'audit' }, lease: { attempt } },
  async invoke(capability, request) {
    if (capability === 'git.repository.read' && request.operation === 'freeze_head') return { head, proof };
    if (capability === 'git.repository.read' && request.operation === 'inventory_revision') {
      return { head, files: [], inventoryDigest: sha256Text(canonicalJson([])) };
    }
    if (capability === 'artifacts.write') {
      assert.equal(typeof request.payload.value.map.filesJsonl, 'string');
      assert.equal(typeof request.payload.value.map.relationsJsonl, 'string');
      const serialized = canonicalJson(request.payload.value);
      return { artifact: { artifactId: request.resource.canonicalId, namespace: request.payload.namespace,
        mediaType: request.payload.mediaType, digest: sha256Text(serialized), sizeBytes: Buffer.byteLength(serialized),
        producer: attempt } };
    }
    throw new Error(`unexpected invocation: ${capability}:${request.operation}`);
  },
};
const result = await executeRepositoryAudit({}, context);
assert.equal(result.outcome, 'passed');
assert.equal(result.facts['review.repository_files'], 0);
assert.equal(result.facts['review.repository_jobs'], 0);
assert.equal(result.artifacts.length, 1);
const planned = await executeRepositoryAudit({ mode: 'plan', grade: 'fast' }, context);
assert.equal(planned.outcome, 'passed');
assert.equal(planned.facts['review.repository_mode'], 'plan');
assert.equal(planned.facts['review.repository_grade'], 'fast');
assert.equal(planned.facts['review.repository_jobs'], 0);
const missingPlugin = await executeRepositoryAudit({ mode: 'plan', scope: {
  kind: 'plugin', names: ['missing'], dependencyRadius: 0,
} }, context);
assert.equal(missingPlugin.outcome, 'blocked');
assert.match(missingPlugin.reason.message, /plugin scope is missing/u);

await assert.rejects(executeRepositoryAudit({}, { ...context, async invoke() { throw new Error('transport failed'); } }),
  /transport failed/u);

const sourceContent = 'export const value = true;\n';
const inventoryFiles = [{ path: 'src/value.ts', objectId: '1'.repeat(40), mode: '100644',
  sizeBytes: Buffer.byteLength(sourceContent) }];
const valuesByDigest = new Map(); let runtimeCalls = 0;
const cachedContext = (artifacts = [], corruptRead = false, currentAttempt = attempt) => ({
  contract: { config: { agent: 'echo', reviewerModel: 'gpt-5.6-terra', profile: 'audit' }, artifacts,
    lease: { attempt: currentAttempt } },
  async invoke(capability, request) {
    if (capability === 'git.repository.read' && request.operation === 'freeze_head') return { head, proof };
    if (capability === 'git.repository.read' && request.operation === 'inventory_revision') {
      return { head, files: inventoryFiles, inventoryDigest: sha256Text(canonicalJson(inventoryFiles)) };
    }
    if (capability === 'git.repository.read' && request.operation === 'read_revision_text') {
      assert.equal(request.payload.expectedObjectId, inventoryFiles[0].objectId);
      assert.equal(request.payload.expectedSizeBytes, inventoryFiles[0].sizeBytes);
      assert.equal(request.payload.maxBytes, REVIEW_HARD_LIMITS.repositoryAuditFileBytes);
      return { head, path: 'src/value.ts', objectId: inventoryFiles[0].objectId,
        sizeBytes: inventoryFiles[0].sizeBytes, content: sourceContent, digest: sha256Text(sourceContent) };
    }
    if (capability === 'runtime.dispatch') {
      runtimeCalls += 1;
      const job = request.payload.review.job;
      const sourceEvidence = job.source.map(({ digest }) => ({ kind: 'reviewed-source', digest }));
      return { runtimeEvidence, result: { schemaVersion: 'echo-review-output.v1', summary: 'No defect found.',
        inspectedEvidence: sourceEvidence,
        requirementAssessments: Object.fromEntries(job.requirements.map(({ id }) => [id,
          { assessment: 'satisfied', explanation: 'No direct defect is present.', evidence: sourceEvidence }])),
        proposedFindings: [] } };
    }
    if (capability === 'artifacts.write') {
      const serialized = canonicalJson(request.payload.value), digest = sha256Text(serialized);
      valuesByDigest.set(digest, request.payload.value);
      return { artifact: { artifactId: request.resource.canonicalId, namespace: request.payload.namespace,
        mediaType: request.payload.mediaType, digest, sizeBytes: Buffer.byteLength(serialized), producer: currentAttempt } };
    }
    if (capability === 'artifacts.read') {
      const value = valuesByDigest.get(request.payload.digest);
      const returned = corruptRead ? { ...value, unitId: 'tampered' } : value;
      return { value: returned, digest: request.payload.digest,
        sizeBytes: Buffer.byteLength(canonicalJson(value)) };
    }
    throw new Error(`unexpected cached invocation: ${capability}:${request.operation}`);
  },
});
const cold = await executeRepositoryAudit({}, cachedContext());
assert.equal(cold.outcome, 'passed');
assert.equal(cold.facts['review.repository_review_cache_misses'], 1);
assert.equal(cold.facts['review.repository_review_cache_hits'], 0);
assert.equal(cold.facts['review.repository_actual_model_calls'], 1);
assert.equal(cold.facts['review.repository_reserved_input_tokens'] > 0, true);
assert.equal(runtimeCalls, 1);
const wrongRuntimeContext = cachedContext(), wrongRuntimeInvoke = wrongRuntimeContext.invoke.bind(wrongRuntimeContext);
wrongRuntimeContext.invoke = async (capability, request) => {
  const value = await wrongRuntimeInvoke(capability, request);
  if (capability !== 'runtime.dispatch') return value;
  const identity = { ...runtimeIdentity, model: 'different-model' };
  return { ...value, runtimeEvidence: { schemaVersion: 'runtime-agent-attestation.v1', ...identity,
    identityDigest: sha256Text(canonicalJson(identity)) } };
};
const wrongRuntime = await executeRepositoryAudit({}, wrongRuntimeContext);
assert.equal(wrongRuntime.outcome, 'blocked');
assert.match(wrongRuntime.reason.message, /does not match the configured reviewer identity/u);
const substitutedSource = cachedContext(), substitutedInvoke = substitutedSource.invoke.bind(substitutedSource);
substitutedSource.invoke = async (capability, request) => {
  if (capability === 'git.repository.read' && request.operation === 'read_revision_text') {
    return { head, path: 'src/value.ts', objectId: '2'.repeat(40), sizeBytes: inventoryFiles[0].sizeBytes,
      content: sourceContent, digest: sha256Text(sourceContent) };
  }
  return substitutedInvoke(capability, request);
};
const substituted = await executeRepositoryAudit({}, substitutedSource);
assert.equal(substituted.outcome, 'blocked');
assert.match(substituted.reason.message, /invalid frozen source proof/u);
const wrongLengthSource = cachedContext(), wrongLengthInvoke = wrongLengthSource.invoke.bind(wrongLengthSource);
wrongLengthSource.invoke = async (capability, request) => {
  if (capability === 'git.repository.read' && request.operation === 'read_revision_text') {
    const content = `${sourceContent} `;
    return { head, path: 'src/value.ts', objectId: inventoryFiles[0].objectId,
      sizeBytes: inventoryFiles[0].sizeBytes, content, digest: sha256Text(content) };
  }
  return wrongLengthInvoke(capability, request);
};
const wrongLength = await executeRepositoryAudit({}, wrongLengthSource);
assert.equal(wrongLength.outcome, 'blocked');
assert.match(wrongLength.reason.message, /invalid frozen source proof/u);
const cacheRefs = cold.artifacts.filter(({ artifactId }) => artifactId.startsWith('repository-review-cache:'));
assert.equal(cacheRefs.length, 1);
const retryAttempt = { ...attempt, attemptId: 'attempt-2', attemptNumber: 1 };
const runtimeCallsBeforeWarm = runtimeCalls;
const warm = await executeRepositoryAudit({}, cachedContext(cacheRefs, false, retryAttempt));
assert.equal(warm.outcome, 'passed');
assert.equal(warm.facts['review.repository_review_cache_hits'], 1);
assert.equal(warm.facts['review.repository_review_cache_misses'], 0);
assert.equal(runtimeCalls, runtimeCallsBeforeWarm, 'a warm audit does not dispatch the cached component again');
const corrupt = await executeRepositoryAudit({}, cachedContext(cacheRefs, true, retryAttempt));
assert.equal(corrupt.outcome, 'blocked');
assert.match(corrupt.reason.message, /cache proof is invalid/u);
const forgedRefs = cacheRefs.map((artifact) => ({ ...artifact,
  producer: { ...artifact.producer, stageId: 'unrelated-stage' } }));
const runtimeCallsBeforeForged = runtimeCalls;
const forged = await executeRepositoryAudit({}, cachedContext(forgedRefs, false, retryAttempt));
assert.equal(forged.outcome, 'passed');
assert.equal(forged.facts['review.repository_review_cache_misses'], 1);
assert.equal(runtimeCalls, runtimeCallsBeforeForged + 1, 'an unrelated producer cannot create a cache hit');
const unavailableReviewer = cachedContext();
const availableInvoke = unavailableReviewer.invoke.bind(unavailableReviewer);
unavailableReviewer.invoke = async (capability, request) => {
  if (capability === 'runtime.dispatch') throw new Error('reviewer unavailable');
  return availableInvoke(capability, request);
};
const unavailable = await executeRepositoryAudit({}, unavailableReviewer);
assert.equal(unavailable.outcome, 'blocked');
assert.match(unavailable.reason.message, /review dispatch failed: reviewer unavailable/u);

let oversizedReadCalls = 0;
const oversizedContext = cachedContext(), oversizedInvoke = oversizedContext.invoke.bind(oversizedContext);
oversizedContext.invoke = async (capability, request) => {
  if (capability === 'git.repository.read' && request.operation === 'inventory_revision') {
    const files = [{ ...inventoryFiles[0], sizeBytes: REVIEW_HARD_LIMITS.repositoryAuditFileBytes + 1 }];
    return { head, files, inventoryDigest: sha256Text(canonicalJson(files)) };
  }
  if (capability === 'git.repository.read' && request.operation === 'read_revision_text') oversizedReadCalls += 1;
  return oversizedInvoke(capability, request);
};
const oversized = await executeRepositoryAudit({}, oversizedContext);
assert.equal(oversized.outcome, 'blocked');
assert.match(oversized.reason.message, /source file exceeds read limit/u);
assert.equal(oversizedReadCalls, 0, 'the audit rejects oversized sources before reading repository content');

const unresolvedContent = "import './missing.js';\n";
const unresolvedContext = cachedContext(), unresolvedInvoke = unresolvedContext.invoke.bind(unresolvedContext);
unresolvedContext.invoke = async (capability, request) => {
  if (capability === 'git.repository.read' && request.operation === 'inventory_revision') {
    const files = [{ ...inventoryFiles[0], sizeBytes: Buffer.byteLength(unresolvedContent) }];
    return { head, files, inventoryDigest: sha256Text(canonicalJson(files)) };
  }
  if (capability === 'git.repository.read' && request.operation === 'read_revision_text') {
    return { head, path: 'src/value.ts', objectId: inventoryFiles[0].objectId,
      sizeBytes: Buffer.byteLength(unresolvedContent), content: unresolvedContent, digest: sha256Text(unresolvedContent) };
  }
  return unresolvedInvoke(capability, request);
};
const unresolved = await executeRepositoryAudit({}, unresolvedContext);
assert.equal(unresolved.outcome, 'blocked');
assert.match(unresolved.reason.message, /coverage is incomplete/u);

console.log(JSON.stringify({ ok: true, suite: 'repository-audit-stage' }));
