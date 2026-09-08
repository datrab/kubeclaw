import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { executeRepositoryAudit } from '../../../skills/nova/plugins/review/src/repository-audit-stage.ts';
import { repositoryCompleteness } from '../../../skills/nova/plugins/review/src/repository-audit-results.ts';
import { REVIEW_HARD_LIMITS } from '../../../skills/nova/plugins/review/src/review-hard-limits.ts';
import { blockedReviewStage } from '../../../skills/nova/plugins/review/src/review-stage-result.ts';

const oversizedReason = 'x'.repeat(10_000);
const boundedBlock = blockedReviewStage('kubeclaw.review.test_block', oversizedReason);
assert.equal(boundedBlock.outcome, 'blocked');
assert.ok(boundedBlock.reason.message.length <= 4096);
assert.equal(boundedBlock.reason.details.truncated, true);
assert.equal(boundedBlock.reason.details.originalLength, oversizedReason.length);
assert.equal(boundedBlock.reason.details.fullMessageDigest, sha256Text(oversizedReason));

const head = 'a'.repeat(40), proof = 'b'.repeat(64);
const runtimeIdentity = { targetId: 'echo', runtime: 'subagent', agentId: 'codex',
  model: 'gpt-5.6-terra', thinking: 'high' };
const runtimeEvidence = { schemaVersion: 'runtime-agent-attestation.v1', ...runtimeIdentity,
  identityDigest: sha256Text(canonicalJson(runtimeIdentity)) };
const attempt = { runId: 'run-1', stageId: 'repository-audit', attemptId: 'attempt-1', attemptNumber: 0 };
const context = {
  contract: { config: { agent: 'echo', reviewerModel: 'gpt-5.6-terra', profile: 'audit' },
    artifacts: [], lease: { attempt } },
  async invoke(capability, request) {
    if (capability === 'git.repository.read' && request.operation === 'freeze_head') return { head, proof };
    if (capability === 'git.repository.read' && request.operation === 'inventory_revision') {
      return { head, files: [], inventoryDigest: sha256Text(canonicalJson([])) };
    }
    if (capability === 'artifacts.write') {
      if (!['repository-review-prepared-plan.v1','repository-review-follow-up-status.v1']
        .includes(request.payload.value.schemaVersion)) {
        assert.equal(typeof request.payload.value.map.filesJsonl, 'string');
        assert.equal(typeof request.payload.value.map.relationsJsonl, 'string');
      }
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
const gateContext = { ...context, contract: { ...context.contract,
  config: { ...context.contract.config, profile: 'gate' } } };
const policyMismatch = await executeRepositoryAudit({}, gateContext);
assert.equal(policyMismatch.outcome, 'blocked');
assert.match(policyMismatch.reason.message, /simplification lens requires an enabled simplification policy/u);
assert.equal(result.facts['review.repository_files'], 0);
assert.equal(result.facts['review.repository_jobs'], 0);
assert.equal(result.artifacts.length, 4);
assert.equal(result.facts['review.repository_requested_context_expansions'], 0);
assert.equal(result.facts['review.repository_requested_verifications'], 0);
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
      assert.equal(request.payload.checkpoint,
        request.resource.canonicalId.startsWith('repository-review-cache:')
          || request.resource.canonicalId.startsWith('repository-review-prepared:')
          || request.resource.canonicalId.startsWith('repository-review-follow-up:') ? true : undefined);
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
assert.equal(cold.facts['review.repository_initial_review_cache_misses'], 1);
assert.equal(cold.facts['review.repository_context_expansion_cache_misses'], 0);
assert.equal(cold.facts['review.repository_actual_model_calls'], 1);
assert.equal(cold.facts['review.repository_retry_model_calls'], 0);
assert.equal(cold.facts['review.repository_reserved_prompt_bytes'] > 0, true);
assert.equal(cold.facts['review.repository_reserved_input_tokens'] > 0, true);
assert.equal(cold.facts['review.repository_completeness_state'], 'all-requested-work-completed');
assert.equal(cold.facts['review.repository_provider_usage_available'], 0);
const coldReport = [...valuesByDigest.values()].find(({ schemaVersion }) => schemaVersion === 'repository-review-report.v1');
assert.ok(coldReport);
assert.equal(coldReport.usage.novaReservations.reservedPromptBytes > 0, true);
assert.equal(coldReport.usage.novaReservations.modelPayloadBytes > 0, true);
assert.equal(coldReport.usage.novaReservations.reservedPromptBytes
  > coldReport.usage.novaReservations.modelPayloadBytes, true);
assert.equal(coldReport.usage.novaReservations.byPhase.initial.calls, 1);
assert.equal(coldReport.usage.execution.retryCalls, 0);
assert.equal(coldReport.usage.execution.preflightModelCalls, 0);
assert.deepEqual(coldReport.usage.provider, { status: 'unavailable', freshInputTokens: null,
  cachedInputTokens: null, outputTokens: null,
  reason: 'runtime.dispatch does not expose provider token accounting to the review stage' });
assert.equal(coldReport.completeness.state, 'all-requested-work-completed');
assert.equal(coldReport.completeness.allRequestedContextReviewed, true);
assert.equal(coldReport.completeness.allRequestedWorkCompleted, true);
const policyComplete = repositoryCompleteness({ primary: { requested: 4, completed: 4, failed: 0 },
  contextExpansion: { requested: 3, selected: 2, deferred: 1, completed: 2, failed: 0 },
  verification: { requested: 5, selected: 5, deferred: 0, completed: 5, failed: 0 } });
assert.equal(policyComplete.state, 'policy-complete');
assert.equal(policyComplete.allRequestedContextReviewed, false);
assert.equal(policyComplete.allRequestedWorkCompleted, false);
assert.deepEqual(policyComplete.contextExpansion,
  { requested: 3, selected: 2, completed: 2, policyDeferred: 1, failed: 0 });
const verificationDeferred = repositoryCompleteness({ primary: { requested: 4, completed: 4, failed: 0 },
  contextExpansion: { requested: 2, selected: 2, deferred: 0, completed: 2, failed: 0 },
  verification: { requested: 5, selected: 4, deferred: 1, completed: 4, failed: 0 } });
assert.equal(verificationDeferred.state, 'policy-complete');
assert.equal(verificationDeferred.allRequestedContextReviewed, true);
assert.equal(verificationDeferred.allRequestedWorkCompleted, false);
const executionIncomplete = repositoryCompleteness({ primary: { requested: 4, completed: 3, failed: 1 },
  contextExpansion: { requested: 2, selected: 2, deferred: 0, completed: 2, failed: 0 },
  verification: { requested: 5, selected: 5, deferred: 0, completed: 5, failed: 0 } });
assert.equal(executionIncomplete.state, 'execution-incomplete');
assert.equal(executionIncomplete.primary.failed, 1);
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
const preparedRefs = cold.artifacts.filter(({ artifactId }) => artifactId.startsWith('repository-review-prepared:'));
assert.equal(cacheRefs.length, 1);
assert.equal(preparedRefs.length, 1);
const retryAttempt = { ...attempt, attemptId: 'attempt-2', attemptNumber: 1 };
const runtimeCallsBeforeWarm = runtimeCalls;
const warm = await executeRepositoryAudit({}, cachedContext([...preparedRefs, ...cacheRefs], false, retryAttempt));
assert.equal(warm.outcome, 'passed');
assert.equal(warm.facts['review.repository_review_cache_hits'], 1);
assert.equal(warm.facts['review.repository_review_cache_misses'], 0);
assert.equal(warm.facts['review.repository_initial_review_cache_hits'], 1);
assert.equal(warm.facts['review.repository_context_expansion_cache_hits'], 0);
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
await assert.rejects(executeRepositoryAudit({}, unavailableReviewer),
  /review dispatch failed: reviewer unavailable/u);

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

const malformedContext = cachedContext(), malformedInvoke = malformedContext.invoke.bind(malformedContext);
malformedContext.invoke = async (capability, request) => {
 if(capability === 'runtime.dispatch') return {runtimeEvidence, result:{garbage:true}};
 return malformedInvoke(capability,request);
};
const malformedResult = await executeRepositoryAudit({overrides:{maxRetries:0}},malformedContext);
assert.equal(malformedResult.outcome,'passed');
assert.equal(malformedResult.facts['review.repository_incomplete_jobs'],1);
assert.equal(malformedResult.facts['review.repository_completeness_state'],'all-requested-work-completed');
console.log(JSON.stringify({probe:'malformed-audit',outcome:malformedResult.outcome,incomplete:malformedResult.facts['review.repository_incomplete_jobs'],completeness:malformedResult.facts['review.repository_completeness_state']}));

const repeatMalformedContext=cachedContext(malformedResult.artifacts,false,retryAttempt);
const previousCalls=runtimeCalls;
const repeatMalformed=await executeRepositoryAudit({overrides:{maxRetries:0}},repeatMalformedContext);
assert.equal(repeatMalformed.outcome,'passed');assert.equal(repeatMalformed.facts['review.repository_incomplete_jobs'],1);
assert.equal(runtimeCalls,previousCalls);
console.log(JSON.stringify({probe:'malformed-audit-retry-cache',outcome:repeatMalformed.outcome,incomplete:repeatMalformed.facts['review.repository_incomplete_jobs'],freshCalls:runtimeCalls-previousCalls}));
