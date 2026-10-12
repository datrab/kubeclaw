import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { sameProducer, scopedEvidenceId, digest } from "./attempt-evidence.ts";
import {
  canonicalJson,
  validatePipelineObservabilityContract,
  type ProducerClosureV1,
  type ObservabilityCompletenessV1,
  type ProducerGapReportV1,
  type UnresolvedObservabilityItemV1,
} from "@kubeclaw/pipeline-observability-contract";
import type {
  DurableAttemptStoreSnapshot,
  RequiredProducerClosure,
} from "./durable-attempts.ts";
import type { AttemptState } from "./attempt-state.ts";
import type {
  FileObservabilityAdmissionStore,
  AdmittedRecordView,
} from "./durable-delivery.ts";
export async function storeClosureUnlocked(
  store: AttemptState,
  state: DurableAttemptStoreSnapshot,
  snapshot: ProducerClosureV1,
  admitted: ReadonlyArray<AdmittedRecordView>,
): Promise<ProducerClosureV1> {
  const existing = state.closures.find(
    (item) =>
      item.pipelineRunId === snapshot.pipelineRunId &&
      item.closureId === snapshot.closureId,
  );
  if (existing) {
    if (existing.closureDigest !== snapshot.closureDigest)
      throw new Error("OBSERVABILITY_CLOSURE_IDENTITY_CONFLICT");
    return structuredClone(existing);
  }
  const records = admitted
    .filter(
      (item) =>
        sameProducer(item.record.producer, snapshot.producer) &&
        item.record.correlation.pipelineRunId === snapshot.pipelineRunId,
    )
    .sort((left, right) => left.record.sequence - right.record.sequence);
  if (
    records.length !== snapshot.recordCount ||
    records.some((item, index) => item.record.sequence !== index + 1)
  )
    throw new Error("OBSERVABILITY_CLOSURE_SEQUENCE_INCOMPLETE");
  for (const evidenceId of snapshot.requiredEvidenceIds) {
    if (
      !state.evidence.some(
        (item) =>
          item.pipelineRunId === snapshot.pipelineRunId &&
          sameProducer(item.producer, snapshot.producer) &&
          scopedEvidenceId(
            item.attemptId,
            item.claimGeneration,
            item.evidenceId,
          ) === evidenceId,
      )
    )
      throw new Error(`OBSERVABILITY_CLOSURE_EVIDENCE_MISSING:${evidenceId}`);
  }
  if (
    state.closures.length - store.closureProjections.size >=
    store.limits.maximumClosures
  )
    throw new Error("OBSERVABILITY_CLOSURE_STORE_FULL");
  const candidate = { ...state, closures: [...state.closures, snapshot] };
  store.checkSize(candidate);
  await store.writeState(candidate);
  return structuredClone(snapshot);
}
export async function storeClosure(
  store: AttemptState,
  closure: ProducerClosureV1,
  admission: FileObservabilityAdmissionStore,
): Promise<ProducerClosureV1> {
  const snapshot = structuredClone(closure);
  validatePipelineObservabilityContract("producerClosure", snapshot);
  const admitted = await admission.admittedRecords();
  return store.serial(async () => {
    const state = await store.readState();
    await store.reclaimExpiredEvidence(state);
    return storeClosureUnlocked(store, state, snapshot, admitted);
  });
}
export async function evaluateCompleteness(
  store: AttemptState,
  pipelineRunId: string,
  required: ReadonlyArray<RequiredProducerClosure>,
  admission: FileObservabilityAdmissionStore,
  missingRanges: ReadonlyArray<ProducerGapReportV1> = [],
  unresolvedItems: ReadonlyArray<UnresolvedObservabilityItemV1> = [],
): Promise<ObservabilityCompletenessV1> {
  const requirements = structuredClone(required);
  const durableIssues = await admission.observabilityIssues(pipelineRunId);
  const rangeSnapshot = [
    ...durableIssues.missingRanges,
    ...structuredClone(missingRanges),
  ].filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) => canonicalJson(candidate) === canonicalJson(item),
      ) === index,
  );
  const unresolvedSnapshot = uniqueUnresolvedItems([
    ...durableIssues.unresolvedItems,
    ...structuredClone(unresolvedItems),
  ]);
  const admittedRecords = await admission.admittedTail(pipelineRunId, 1);
  return store.serial(async () => {
    const state = await store.readState();
    await store.reclaimExpiredEvidence(state);
    return evaluateStoredClosures(state, {
      pipelineRunId,
      requirements,
      admittedRecords,
      rangeSnapshot,
      unresolvedSnapshot,
    });
  });
}

interface CompletenessRequest {
  pipelineRunId: string;
  requirements: ReadonlyArray<RequiredProducerClosure>;
  admittedRecords: ReadonlyArray<AdmittedRecordView>;
  rangeSnapshot: ProducerGapReportV1[];
  unresolvedSnapshot: UnresolvedObservabilityItemV1[];
}
async function evaluateStoredClosures(
  state: DurableAttemptStoreSnapshot,
  request: CompletenessRequest,
): Promise<ObservabilityCompletenessV1> {
  const {
    pipelineRunId,
    requirements,
    admittedRecords,
    rangeSnapshot,
    unresolvedSnapshot,
  } = request;
  const requiredClosureIds = requirements.map((item) => item.closureId);
  if (new Set(requiredClosureIds).size !== requiredClosureIds.length)
    throw new Error("OBSERVABILITY_REQUIRED_CLOSURE_DUPLICATE");
  const admittedClosureIds: string[] = [];
  const evidenceItems: UnresolvedObservabilityItemV1[] = [];
  for (const requirement of requirements) {
    const evaluated = await evaluateClosure(
      state,
      pipelineRunId,
      requirement,
      admittedRecords,
    );
    evidenceItems.push(...evaluated.evidenceItems);
    if (evaluated.valid) admittedClosureIds.push(requirement.closureId);
  }
  const missingClosureIds = requiredClosureIds.filter(
    (id) => !admittedClosureIds.includes(id),
  );
  const closureItems = missingClosureIssues(
    state,
    missingClosureIds,
    requirements,
  );
  const allItems = uniqueUnresolvedItems([
    ...closureItems,
    ...evidenceItems,
    ...unresolvedSnapshot,
  ]);
  const completeness: ObservabilityCompletenessV1 = {
    schemaVersion: "observability-completeness.v1",
    pipelineRunId,
    state:
      missingClosureIds.length || rangeSnapshot.length || allItems.length
        ? "partial"
        : "complete",
    requiredClosureIds,
    admittedClosureIds,
    missingClosureIds,
    missingRanges: rangeSnapshot,
    unresolvedItems: allItems,
    evaluatedAt: new Date().toISOString(),
  };
  validatePipelineObservabilityContract(
    "observabilityCompleteness",
    completeness,
  );
  return completeness;
}

async function evaluateClosure(
  state: DurableAttemptStoreSnapshot,
  pipelineRunId: string,
  requirement: RequiredProducerClosure,
  admittedRecords: ReadonlyArray<AdmittedRecordView>,
): Promise<{ valid: boolean; evidenceItems: UnresolvedObservabilityItemV1[] }> {
  const evidenceItems: UnresolvedObservabilityItemV1[] = [];
  const closure = state.closures.find(
    (item) =>
      item.pipelineRunId === pipelineRunId &&
      item.closureId === requirement.closureId &&
      sameProducer(item.producer, requirement.producer),
  );
  if (!closure) return { valid: false, evidenceItems: [] };
  const records = admittedRecords.filter(
    (item) =>
      item.record.correlation.pipelineRunId === pipelineRunId &&
      sameProducer(item.record.producer, requirement.producer),
  );
  let valid =
    records.length === closure.recordCount &&
    records.every(
      (item) =>
        item.record.sequence >= closure.firstSequence &&
        item.record.sequence <= closure.finalSequence,
    );
  for (const evidenceId of closure.requiredEvidenceIds) {
    const issue = await evidenceIssue(
      state,
      pipelineRunId,
      requirement,
      evidenceId,
    );
    if (issue) {
      valid = false;
      evidenceItems.push(issue);
    }
  }
  return { valid, evidenceItems };
}

async function evidenceIssue(
  state: DurableAttemptStoreSnapshot,
  pipelineRunId: string,
  requirement: RequiredProducerClosure,
  evidenceId: string,
): Promise<UnresolvedObservabilityItemV1 | null> {
  const metadata = state.evidence.find(
    (item) =>
      item.pipelineRunId === pipelineRunId &&
      sameProducer(item.producer, requirement.producer) &&
      scopedEvidenceId(
        item.attemptId,
        item.claimGeneration,
        item.evidenceId,
      ) === evidenceId,
  );
  let reasonCode: string | null = null;
  if (!metadata) reasonCode = "evidence-missing";
  else {
    try {
      const bytes = await fs.readFile(new URL(metadata.artifact.storageUrl));
      if (
        bytes.byteLength !== metadata.artifact.sizeBytes ||
        digest(bytes) !== metadata.artifact.contentDigest
      )
        reasonCode = "evidence-corrupt";
    } catch {
      reasonCode = "evidence-unavailable";
    }
  }
  if (!reasonCode) return null;
  return {
    itemId: `evidence:${createHash("sha256").update(evidenceId).digest("hex")}`,
    kind: "missing-evidence",
    producer: requirement.producer,
    subjectId: evidenceId,
    reasonCode,
  };
}

function missingClosureIssues(
  state: DurableAttemptStoreSnapshot,
  missingClosureIds: readonly string[],
  requirements: readonly RequiredProducerClosure[],
): UnresolvedObservabilityItemV1[] {
  return missingClosureIds.map((id) => {
    const requirement = requirements.find((item) => item.closureId === id)!;
    return {
      itemId: `gap:${id}`,
      kind: "missing-closure" as const,
      producer: requirement.producer,
      subjectId: id,
      reasonCode: state.closures.some((item) => item.closureId === id)
        ? "producer-closure-stale"
        : "producer-closure-missing",
    };
  });
}

function uniqueUnresolvedItems(
  items: UnresolvedObservabilityItemV1[],
): UnresolvedObservabilityItemV1[] {
  return items.filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.itemId === item.itemId) ===
      index,
  );
}
