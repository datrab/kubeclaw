import fs from "node:fs/promises";
import {
  canonicalJson,
  type ProducerClosureV1,
} from "@kubeclaw/pipeline-observability-contract";
import {
  validatePipelineWorkerCoreContract,
  type WorkerAttemptResultV1,
} from "@kubeclaw/pipeline-worker-core-contract";
import { assertCompletionIntent } from "./attempt-replay.ts";
import {
  requireIdentity,
  digest,
  cleanupUnreferencedBlobs,
} from "./attempt-evidence.ts";
import { storeClosureUnlocked } from "./attempt-completeness.ts";
import type {
  DurableCompletionIntent,
  DurableResultMetadata,
  DurableAttemptStoreSnapshot,
  DurableResultOwner,
} from "./durable-attempts.ts";
import type { AttemptState } from "./attempt-state.ts";
import type { FileObservabilityAdmissionStore } from "./durable-delivery.ts";
export async function storeResult(
  store: AttemptState,
  pipelineRunId: string,
  result: WorkerAttemptResultV1,
  completionIntent: DurableCompletionIntent | null = null,
  owner: DurableResultOwner | null = null,
): Promise<DurableResultMetadata> {
  requireIdentity(pipelineRunId, "OBSERVABILITY_PIPELINE_RUN_ID_INVALID");
  const snapshot = structuredClone(result);
  const intent = structuredClone(completionIntent);
  const ownerSnapshot = structuredClone(owner);
  if (ownerSnapshot) {
    requireIdentity(ownerSnapshot.planId, "OBSERVABILITY_PLAN_ID_INVALID");
    requireIdentity(ownerSnapshot.nodeId, "OBSERVABILITY_NODE_ID_INVALID");
  }
  validatePipelineWorkerCoreContract("workerAttemptResult", snapshot);
  assertCompletionIntent(pipelineRunId, snapshot, intent);
  return store.serial(async () => {
    const state = await store.readState();
    await store.reclaimExpiredEvidence(state);
    await cleanupUnreferencedBlobs(store.root, state);
    const existing = findResult(state, pipelineRunId, snapshot);
    if (existing)
      return resumeResultCommit(
        store,
        state,
        existing,
        snapshot,
        intent,
        ownerSnapshot,
      );
    requireUnfinalizedAttempt(state, pipelineRunId, snapshot);
    await verifyResultEvidence(state, pipelineRunId, snapshot);
    return commitResult(
      store,
      state,
      pipelineRunId,
      snapshot,
      intent,
      ownerSnapshot,
    );
  });
}
export async function resumeCompletion(
  store: AttemptState,
  pipelineRunId: string,
  attemptId: string,
  claimGeneration: number,
  admission: FileObservabilityAdmissionStore,
): Promise<ProducerClosureV1> {
  return store.serial(async () => {
    const state = await store.readState();
    await store.reclaimExpiredEvidence(state);
    if (
      state.results.some(
        (item) =>
          item.pipelineRunId === pipelineRunId &&
          item.attemptId === attemptId &&
          item.claimGeneration > claimGeneration,
      )
    )
      throw new Error("OBSERVABILITY_STALE_CLAIM_COMPLETION");
    const stored = state.results.find(
      (item) =>
        item.pipelineRunId === pipelineRunId &&
        item.attemptId === attemptId &&
        item.claimGeneration === claimGeneration,
    );
    if (!stored?.completionIntent)
      throw new Error("OBSERVABILITY_COMPLETION_INTENT_MISSING");
    if (typeof stored.storedAt !== "string")
      throw new Error("OBSERVABILITY_RESULT_COMMIT_PENDING");
    const { records: admitted } = await admission.admitAndRead(
      canonicalJson(stored.completionIntent.record),
    );
    return storeClosureUnlocked(
      store,
      state,
      stored.completionIntent.closure,
      admitted,
    );
  });
}

function findResult(
  state: DurableAttemptStoreSnapshot,
  pipelineRunId: string,
  snapshot: WorkerAttemptResultV1,
): DurableResultMetadata | undefined {
  const generations = state.results
    .filter(
      (item) =>
        item.pipelineRunId === pipelineRunId &&
        item.attemptId === snapshot.attemptId,
    )
    .map((item) => item.claimGeneration);
  const highest = generations.length ? Math.max(...generations) : 0;
  if (snapshot.claimGeneration < highest)
    throw new Error("OBSERVABILITY_STALE_CLAIM_RESULT");
  return state.results.find(
    (item) =>
      item.pipelineRunId === pipelineRunId &&
      item.attemptId === snapshot.attemptId &&
      item.claimGeneration === snapshot.claimGeneration,
  );
}

async function resumeResultCommit(
  store: AttemptState,
  state: DurableAttemptStoreSnapshot,
  existing: DurableResultMetadata,
  snapshot: WorkerAttemptResultV1,
  intent: DurableCompletionIntent | null,
  ownerSnapshot: DurableResultOwner | null,
): Promise<DurableResultMetadata> {
  if (
    existing.result.resultDigest !== snapshot.resultDigest ||
    canonicalJson(existing.completionIntent) !== canonicalJson(intent) ||
    existing.planId !== (ownerSnapshot?.planId ?? null) ||
    existing.nodeId !== (ownerSnapshot?.nodeId ?? null)
  )
    throw new Error("OBSERVABILITY_RESULT_IDENTITY_CONFLICT");
  if (existing.storedAt === null) {
    existing.storedAt = new Date().toISOString();
    store.checkSize(state);
    await store.writeState(state);
  }
  return structuredClone(existing);
}

function requireUnfinalizedAttempt(
  state: DurableAttemptStoreSnapshot,
  pipelineRunId: string,
  snapshot: WorkerAttemptResultV1,
): void {
  const finalizedGeneration = state.results.find(
    (item) =>
      item.pipelineRunId === pipelineRunId &&
      item.attemptId === snapshot.attemptId &&
      item.claimGeneration < snapshot.claimGeneration &&
      item.completionIntent !== null &&
      state.closures.some(
        (closure) =>
          closure.pipelineRunId === pipelineRunId &&
          closure.closureId === item.completionIntent!.closure.closureId,
      ),
  );
  if (finalizedGeneration)
    throw new Error("OBSERVABILITY_ATTEMPT_ALREADY_COMPLETED");
}

async function verifyResultEvidence(
  state: DurableAttemptStoreSnapshot,
  pipelineRunId: string,
  snapshot: WorkerAttemptResultV1,
): Promise<void> {
  for (const evidence of snapshot.evidence) {
    const metadata = state.evidence.find(
      (item) =>
        item.pipelineRunId === pipelineRunId &&
        item.attemptId === snapshot.attemptId &&
        item.claimGeneration === snapshot.claimGeneration &&
        item.evidenceId === evidence.evidenceId,
    );
    if (
      !metadata ||
      canonicalJson(metadata.artifact) !== canonicalJson(evidence.artifact)
    )
      throw new Error(
        `OBSERVABILITY_RESULT_EVIDENCE_MISSING:${evidence.evidenceId}`,
      );
    const file = new URL(metadata.artifact.storageUrl);
    const evidenceBytes = await fs.readFile(file);
    if (
      evidenceBytes.byteLength !== metadata.artifact.sizeBytes ||
      digest(evidenceBytes) !== metadata.artifact.contentDigest
    )
      throw new Error(
        `OBSERVABILITY_RESULT_EVIDENCE_CORRUPT:${evidence.evidenceId}`,
      );
  }
}

async function commitResult(
  store: AttemptState,
  state: DurableAttemptStoreSnapshot,
  pipelineRunId: string,
  snapshot: WorkerAttemptResultV1,
  intent: DurableCompletionIntent | null,
  ownerSnapshot: DurableResultOwner | null,
): Promise<DurableResultMetadata> {
  if (
    state.results.length - store.projections.size >=
    store.limits.maximumResults
  )
    throw new Error("OBSERVABILITY_RESULT_STORE_FULL");
  const metadata: DurableResultMetadata = {
    pipelineRunId,
    planId: ownerSnapshot?.planId ?? null,
    nodeId: ownerSnapshot?.nodeId ?? null,
    attemptId: snapshot.attemptId,
    claimGeneration: snapshot.claimGeneration,
    workerId: snapshot.workerId,
    result: snapshot,
    completionIntent: intent,
    storedAt: null,
  };
  const pending = { ...state, results: [...state.results, metadata] };
  const reservedCommit: DurableResultMetadata = {
    ...metadata,
    storedAt: "9999-12-31T23:59:59.999Z",
  };
  store.checkSize({
    ...state,
    results: [...state.results, reservedCommit],
  });
  await store.writeState(pending);
  const committed: DurableResultMetadata = {
    ...metadata,
    storedAt: new Date().toISOString(),
  };
  const committedState = {
    ...state,
    results: [...state.results, committed],
  };
  store.checkSize(committedState);
  await store.writeState(committedState);
  return structuredClone(committed);
}
