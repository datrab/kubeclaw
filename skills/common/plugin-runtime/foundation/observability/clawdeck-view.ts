import type {
  ObservabilityCompletenessV1,
  ProducerGapReportV1,
  ProducerRecordV1,
  UnresolvedObservabilityItemV1,
} from "@kubeclaw/pipeline-observability-contract";
import type { WorkerAttemptResultV1 } from "@kubeclaw/pipeline-worker-core-contract";
import {
  FileDurableAttemptStore,
  type DurableEvidenceMetadata,
  type RequiredProducerClosure,
} from "./durable-attempts.ts";
import { FileObservabilityAdmissionStore } from "./durable-delivery.ts";

export interface ClawDeckRawRecord {
  canonicalCursor: number;
  admittedAt: string;
  record: ProducerRecordV1;
}
export interface ClawDeckAttemptView {
  attemptId: string;
  claimGeneration: number;
  workerId: string;
  result: WorkerAttemptResultV1;
  storedAt: string | null;
  evidence: DurableEvidenceMetadata[];
}
export interface ClawDeckObservationView {
  schemaVersion: "clawdeck-observation-view.v1";
  pipelineRunId: string;
  fromCursor: number;
  nextCursor: number;
  rawRecords: ClawDeckRawRecord[];
  attempts: ClawDeckAttemptView[];
  closureIds: string[];
  completeness: ObservabilityCompletenessV1;
}

export async function buildClawDeckObservationView(options: {
  pipelineRunId: string;
  fromCursor?: number;
  requiredClosures: ReadonlyArray<RequiredProducerClosure>;
  missingRanges?: ReadonlyArray<ProducerGapReportV1>;
  unresolvedItems?: ReadonlyArray<UnresolvedObservabilityItemV1>;
  admissionStore: FileObservabilityAdmissionStore;
  attemptStore: FileDurableAttemptStore;
}): Promise<ClawDeckObservationView> {
  const fromCursor = options.fromCursor ?? 1;
  if (!Number.isSafeInteger(fromCursor) || fromCursor < 1)
    throw new Error("CLAWDECK_CURSOR_INVALID");
  for (const gap of options.missingRanges ?? [])
    await options.admissionStore.recordGap(gap);
  const [admissionTail, attemptState, completeness] = await Promise.all([
    options.admissionStore.admittedTailSnapshot(
      options.pipelineRunId,
      fromCursor,
    ),
    options.attemptStore.snapshot(),
    options.attemptStore.evaluateCompleteness(
      options.pipelineRunId,
      options.requiredClosures,
      options.admissionStore,
      [],
      options.unresolvedItems,
    ),
  ]);
  const rawRecords = [...admissionTail.records]
    .sort((left, right) => left.canonicalCursor - right.canonicalCursor)
    .map((item) => ({
      canonicalCursor: item.canonicalCursor,
      admittedAt: item.admittedAt,
      record: structuredClone(item.record),
    }));
  const attempts = attemptState.results
    .filter((item) => item.pipelineRunId === options.pipelineRunId)
    .map((item) => ({
      attemptId: item.attemptId,
      claimGeneration: item.claimGeneration,
      workerId: item.workerId,
      result: structuredClone(item.result),
      storedAt: item.storedAt,
      evidence: attemptState.evidence
        .filter(
          (evidence) =>
            evidence.pipelineRunId === item.pipelineRunId &&
            evidence.attemptId === item.attemptId &&
            evidence.claimGeneration === item.claimGeneration,
        )
        .map((evidence) => structuredClone(evidence)),
    }))
    .sort(
      (left, right) =>
        left.attemptId.localeCompare(right.attemptId) ||
        left.claimGeneration - right.claimGeneration,
    );
  const closureIds = attemptState.closures
    .filter((item) => item.pipelineRunId === options.pipelineRunId)
    .map((item) => item.closureId)
    .sort();
  const nextCursor = Math.max(fromCursor, admissionTail.nextCursor);
  return {
    schemaVersion: "clawdeck-observation-view.v1",
    pipelineRunId: options.pipelineRunId,
    fromCursor,
    nextCursor,
    rawRecords,
    attempts,
    closureIds,
    completeness,
  };
}
