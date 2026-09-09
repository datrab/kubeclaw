import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, validatePipelineObservabilityContract, type ProducerClosureV1, type ProducerIdentityV1 } from '@kubeclaw/pipeline-observability-contract';
import { validatePipelineWorkerCoreContract, type WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { scopedEvidenceId, type DurableAttemptStoreLimits, type DurableAttemptStoreSnapshot, type DurableCompletionIntent, type DurableEvidenceMetadata, type DurableResultMetadata } from './durable-attempts.ts';
import { replayAssert, replayIdentity, replayObject, replayTimestamp, replayUnique } from './replay-validation.ts';

function sameProducer(left: ProducerIdentityV1, right: ProducerIdentityV1): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
export function assertCompletionIntent(pipelineRunId: string, snapshot: WorkerAttemptResultV1, intent: DurableCompletionIntent | null): void {
  if (intent === null) return;
  replayObject(intent, ['record', 'closure'], 'attempt-intent');
  validatePipelineObservabilityContract('producerRecord', intent.record);
  validatePipelineObservabilityContract('producerClosure', intent.closure);
  const declared = new Set(intent.closure.requiredEvidenceIds);
  const evidenceBound = snapshot.evidence.every((item) => declared.has(scopedEvidenceId(snapshot.attemptId, snapshot.claimGeneration, item.evidenceId)));
  const payload = intent.record.payload as Record<string, unknown> | null;
  if (intent.record.recordType !== 'attempt.completed' || !payload || payload.resultDigest !== snapshot.resultDigest || payload.workerId !== snapshot.workerId
    || intent.record.correlation.pipelineRunId !== pipelineRunId || intent.record.correlation.attemptId !== snapshot.attemptId
    || intent.record.correlation.claimId !== snapshot.claimId || intent.record.correlation.claimGeneration !== snapshot.claimGeneration
    || intent.closure.pipelineRunId !== pipelineRunId || !sameProducer(intent.record.producer, intent.closure.producer) || !evidenceBound) {
    throw new Error('OBSERVABILITY_COMPLETION_INTENT_IDENTITY_MISMATCH');
  }
}
function evidenceKey(item: { pipelineRunId: string; attemptId: string; claimGeneration: number; evidenceId: string }): string {
  return canonicalJson([item.pipelineRunId, item.attemptId, item.claimGeneration, item.evidenceId]);
}
function evidenceReplay(item: DurableEvidenceMetadata, root: string, keys: Set<string>): void {
  replayObject(item, ['pipelineRunId', 'attemptId', 'claimGeneration', 'producer', 'evidenceId', 'type', 'mediaType', 'artifact', 'stagedAt'], 'attempt-evidence');
  for (const field of ['pipelineRunId', 'attemptId', 'evidenceId', 'type', 'mediaType'] as const) replayAssert(replayIdentity(item[field]), `attempt-evidence-${field}`);
  replayAssert(Number.isSafeInteger(item.claimGeneration) && item.claimGeneration > 0 && replayTimestamp(item.stagedAt), 'attempt-evidence-generation');
  validatePipelineObservabilityContract('producerIdentity', item.producer);
  validatePipelineWorkerCoreContract('workerEvidenceRef', { evidenceId: item.evidenceId, type: item.type, artifact: item.artifact });
  const hex = item.artifact.contentDigest.slice(7);
  replayAssert(item.artifact.artifactId === `artifact:${hex}` && item.artifact.type === item.type && item.artifact.mediaType === item.mediaType
    && item.artifact.storageUrl === pathToFileURL(path.join(root, 'blobs', hex.slice(0, 2), hex)).href, 'attempt-evidence-artifact');
  replayUnique(keys, evidenceKey(item), 'attempt-evidence-duplicate');
}
function resultReplay(item: DurableResultMetadata, evidence: Map<string, DurableEvidenceMetadata>, keys: Set<string>): void {
  replayObject(item, ['pipelineRunId', 'planId', 'nodeId', 'attemptId', 'claimGeneration', 'workerId', 'result', 'completionIntent', 'storedAt'], 'attempt-result');
  replayAssert(replayIdentity(item.pipelineRunId) && (item.storedAt === null || replayTimestamp(item.storedAt)), 'attempt-result-metadata');
  replayAssert((item.planId === null && item.nodeId === null) || (replayIdentity(item.planId) && replayIdentity(item.nodeId)), 'attempt-result-owner');
  validatePipelineWorkerCoreContract('workerAttemptResult', item.result);
  replayAssert(item.attemptId === item.result.attemptId && item.claimGeneration === item.result.claimGeneration && item.workerId === item.result.workerId, 'attempt-result-identity');
  replayUnique(keys, canonicalJson([item.pipelineRunId, item.attemptId, item.claimGeneration]), 'attempt-result-duplicate');
  assertCompletionIntent(item.pipelineRunId, item.result, item.completionIntent);
  if (item.completionIntent !== null) closureEvidenceReplay(item.completionIntent.closure, evidence.values());
  for (const reference of item.result.evidence) {
    const metadata = evidence.get(evidenceKey({ ...item, evidenceId: reference.evidenceId }));
    replayAssert(metadata && canonicalJson(metadata.artifact) === canonicalJson(reference.artifact) && metadata.type === reference.type, 'attempt-result-evidence');
    if (item.completionIntent !== null) replayAssert(sameProducer(metadata.producer, item.completionIntent.record.producer), 'attempt-result-evidence-producer');
  }
}
function closureEvidenceReplay(closure: ProducerClosureV1, evidence: Iterable<DurableEvidenceMetadata>): void {
  for (const metadata of evidence) {
    if (metadata.pipelineRunId !== closure.pipelineRunId) continue;
    const scoped = scopedEvidenceId(metadata.attemptId, metadata.claimGeneration, metadata.evidenceId);
    if (closure.requiredEvidenceIds.includes(scoped)) replayAssert(sameProducer(metadata.producer, closure.producer), 'attempt-closure-evidence-producer');
  }
  // Closure-only staged evidence may already have expired under the existing
  // retention contract. Missing bytes/metadata remain a completeness issue;
  // present metadata must never contradict the closure's producer identity.
}
export function assertAttemptReplay(state: DurableAttemptStoreSnapshot, root: string, limits: DurableAttemptStoreLimits): void {
  replayObject(state, ['schemaVersion', 'evidence', 'results', 'closures'], 'attempt-envelope');
  replayAssert(state.schemaVersion === 'durable-attempt-store.v1' && Array.isArray(state.evidence) && Array.isArray(state.results) && Array.isArray(state.closures), 'attempt-version');
  replayAssert(state.evidence.length <= limits.maximumEvidenceObjects && state.results.length <= limits.maximumResults && state.closures.length <= limits.maximumClosures, 'attempt-count');
  const evidenceKeys = new Set<string>();
  const evidence = new Map<string, DurableEvidenceMetadata>();
  for (const item of state.evidence) { evidenceReplay(item, root, evidenceKeys); evidence.set(evidenceKey(item), item); }
  const resultKeys = new Set<string>();
  const generations = new Map<string, number>();
  for (const item of state.results) {
    resultReplay(item, evidence, resultKeys);
    const attemptKey = canonicalJson([item.pipelineRunId, item.attemptId]);
    replayAssert(item.claimGeneration > (generations.get(attemptKey) ?? 0), 'attempt-generation-order');
    generations.set(attemptKey, item.claimGeneration);
  }
  const closureKeys = new Set<string>();
  for (const closure of state.closures) {
    validatePipelineObservabilityContract('producerClosure', closure);
    closureEvidenceReplay(closure, state.evidence);
    replayUnique(closureKeys, canonicalJson([closure.pipelineRunId, closure.closureId]), 'attempt-closure-duplicate');
    const owners = state.results.filter((item) => item.pipelineRunId === closure.pipelineRunId && item.completionIntent?.closure.closureId === closure.closureId);
    for (const owner of owners) replayAssert(canonicalJson(owner.completionIntent!.closure) === canonicalJson(closure), 'attempt-closure-intent');
  }
}
