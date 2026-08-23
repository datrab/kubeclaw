import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  workerAttemptResultDigest,
  type WorkerAttemptResultV1,
} from "../../../contracts/pipeline-worker-core/v1/src/index.ts";
import {
  canonicalJson,
  producerRecordDigest,
} from "../../../contracts/pipeline-observability/v1/src/index.ts";
import {
  FileObservabilityAdmissionStore,
  FileProducerOutbox,
  deliverPending,
} from "../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts";
import {
  createProducerClosure,
  FileDurableAttemptStore,
  scopedEvidenceId,
} from "../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts";

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "kubeclaw-observability-attempts-"),
);
const limits = {
  maximumEvidenceObjects: 20,
  maximumEvidenceBytes: 100000,
  maximumEvidenceObjectBytes: 10000,
  maximumResults: 20,
  maximumClosures: 20,
  maximumMetadataBytes: 500000,
  maximumPendingEvidenceAgeMs: 60000,
};
const producer = {
  producerId: "worker:1",
  bootId: "boot:1",
  producerType: "buster",
};
function resultFor(
  claimGeneration: number,
  evidence: WorkerAttemptResultV1["evidence"],
): WorkerAttemptResultV1 {
  const result: WorkerAttemptResultV1 = {
    schemaVersion: "worker-attempt-result.v1",
    protocolVersion: "worker-protocol.v1",
    attemptId: "attempt:1",
    claimId: `claim:${claimGeneration}`,
    claimGeneration,
    workerId: "worker:1",
    state: "completed",
    startedAt: "2026-08-09T12:00:00Z",
    completedAt: "2026-08-09T12:00:01Z",
    durationMs: 1000,
    summary: "Attempt completed.",
    specialistResult: {
      schemaId: "test-result.v1",
      schemaDigest: "sha256:".padEnd(71, "0"),
      values: { outcome: "passed" },
    },
    error: null,
    evidence,
    resources: {
      logBytes: 4,
      resultBytes: 100,
      evidenceBytes: evidence.reduce(
        (sum, item) => sum + item.artifact.sizeBytes,
        0,
      ),
    },
    cleanup: { state: "not_required", summary: null },
    exitCode: 0,
    signal: null,
    resultDigest: "sha256:".padEnd(71, "0"),
    receipt: {
      receiptId: `receipt:${claimGeneration}`,
      receiptDigest: "sha256:".padEnd(71, "0"),
    },
  };
  result.resultDigest = workerAttemptResultDigest(result);
  return result;
}

try {
  const admission = new FileObservabilityAdmissionStore(
    path.join(root, "admission"),
    {
      maximumIngressBytes: 10000,
      maximumRecords: 20,
      maximumBytes: 200000,
      maximumQuarantineRecords: 5,
      maximumQuarantineBytes: 10000,
    },
  );
  const outbox = new FileProducerOutbox(path.join(root, "worker-outbox"), {
    maximumRecords: 20,
    maximumBytes: 200000,
  });
  const record = await outbox.append({
    schemaVersion: "producer-record.v1",
    recordId: "record:1",
    producer,
    sequence: 1,
    recordType: "attempt.completed",
    occurredAt: "2026-08-09T12:00:01Z",
    correlation: {
      pipelineRunId: "run:1",
      moduleId: "api",
      gateId: "final",
      attemptId: "attempt:1",
      claimId: "claim:1",
      claimGeneration: 1,
      traceId: "trace:1",
      parentEventId: null,
    },
    payload: { state: "completed" },
  });
  assert.equal(await deliverPending(outbox, admission), 1);

  let store = new FileDurableAttemptStore(path.join(root, "shared"), limits);
  const evidence = await store.storeEvidence(
    {
      pipelineRunId: "run:1",
      attemptId: "attempt:1",
      claimGeneration: 1,
      producer,
      evidenceId: "log:1",
      type: "log",
      mediaType: "text/plain",
    },
    Buffer.from("pass"),
  );
  const result = resultFor(1, [evidence]);
  await store.storeResult("run:1", result);
  const closure = createProducerClosure({
    schemaVersion: "producer-closure.v1",
    closureId: "closure:attempt:1:1",
    producer,
    pipelineRunId: "run:1",
    firstSequence: 1,
    finalSequence: 1,
    recordCount: 1,
    requiredEvidenceIds: [scopedEvidenceId("attempt:1", 1, "log:1")],
    closedAt: "2026-08-09T12:00:02Z",
  });
  await store.storeClosure(closure, admission);

  store = new FileDurableAttemptStore(path.join(root, "shared"), limits);
  const afterRestart = await store.snapshot();
  assert.equal(
    afterRestart.results[0]?.result.resultDigest,
    result.resultDigest,
    "result must survive worker loss",
  );
  assert.equal(
    fs.readFileSync(new URL(evidence.artifact.storageUrl), "utf8"),
    "pass",
    "evidence must survive worker loss",
  );
  assert.equal(
    (
      await store.evaluateCompleteness(
        "run:1",
        [{ closureId: closure.closureId, producer }],
        admission,
      )
    ).state,
    "complete",
  );
  fs.unlinkSync(new URL(evidence.artifact.storageUrl));
  const missingDurableEvidence = await store.evaluateCompleteness(
    "run:1",
    [{ closureId: closure.closureId, producer }],
    admission,
  );
  assert.equal(
    missingDurableEvidence.state,
    "partial",
    "deleted required evidence must invalidate completeness",
  );
  assert.equal(
    missingDurableEvidence.unresolvedItems.some(
      (item) => item.kind === "missing-evidence",
    ),
    true,
  );
  fs.mkdirSync(path.dirname(new URL(evidence.artifact.storageUrl).pathname), {
    recursive: true,
  });
  fs.writeFileSync(new URL(evidence.artifact.storageUrl), "pass");
  assert.equal(
    (
      await store.evaluateCompleteness(
        "run:1",
        [{ closureId: closure.closureId, producer }],
        admission,
      )
    ).state,
    "complete",
    "restored verified evidence can restore completeness",
  );
  assert.equal(
    (
      await store.evaluateCompleteness(
        "run:1",
        [
          {
            closureId: closure.closureId,
            producer: { ...producer, producerId: "worker:other" },
          },
        ],
        admission,
      )
    ).state,
    "partial",
    "another producer must not satisfy the closure",
  );
  const late = await outbox.append({
    ...record,
    recordId: "record:2",
    sequence: 2,
    occurredAt: "2026-08-09T12:00:03Z",
  });
  await admission.admit(canonicalJson(late));
  assert.equal(
    (
      await store.evaluateCompleteness(
        "run:1",
        [{ closureId: closure.closureId, producer }],
        admission,
      )
    ).state,
    "partial",
    "a late record must invalidate the closure",
  );
  const partial = await store.evaluateCompleteness(
    "run:1",
    [{ closureId: "closure:missing", producer }],
    admission,
  );
  assert.equal(partial.state, "partial");
  assert.equal(
    partial.unresolvedItems[0]?.producer.producerId,
    "worker:1",
    "gap must identify its producer",
  );

  const evidence2 = await store.storeEvidence(
    {
      pipelineRunId: "run:1",
      attemptId: "attempt:1",
      claimGeneration: 2,
      producer,
      evidenceId: "log:2",
      type: "log",
      mediaType: "text/plain",
    },
    Buffer.from("pass two"),
  );
  await store.storeResult("run:1", resultFor(2, [evidence2]));
  await assert.rejects(
    () => store.storeResult("run:1", result),
    /OBSERVABILITY_STALE_CLAIM_RESULT/,
  );
  const conflicting = resultFor(2, [evidence2]);
  conflicting.summary = "different";
  conflicting.resultDigest = workerAttemptResultDigest(conflicting);
  await assert.rejects(
    () => store.storeResult("run:1", conflicting),
    /OBSERVABILITY_RESULT_IDENTITY_CONFLICT/,
  );
  const missing = resultFor(3, [{ ...evidence2, evidenceId: "missing" }]);
  await assert.rejects(
    () => store.storeResult("run:1", missing),
    /OBSERVABILITY_RESULT_EVIDENCE_MISSING/,
  );

  const pendingRoot = path.join(root, "pending-result-recovery");
  let pendingStore = new FileDurableAttemptStore(pendingRoot, limits);
  const pendingResult = resultFor(1, []);
  const firstPendingWrite = await pendingStore.storeResult(
    "run:pending",
    pendingResult,
  );
  assert.equal(typeof firstPendingWrite.storedAt, "string");
  const pendingFile = path.join(pendingRoot, "attempt-store.json");
  const pendingState = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
  pendingState.results[0].storedAt = null;
  fs.writeFileSync(pendingFile, canonicalJson(pendingState));
  pendingStore = new FileDurableAttemptStore(pendingRoot, limits);
  const recoveredPending = await pendingStore.storeResult(
    "run:pending",
    pendingResult,
  );
  assert.equal(
    typeof recoveredPending.storedAt,
    "string",
    "an idempotent retry must finish a pending result commit",
  );

  const reservationRoot = path.join(root, "result-marker-reservation");
  const committedBytes = Buffer.byteLength(
    fs.readFileSync(pendingFile, "utf8"),
  );
  const pendingReservationState = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
  pendingReservationState.results[0].storedAt = null;
  const pendingBytes = Buffer.byteLength(canonicalJson(pendingReservationState));
  assert.ok(committedBytes > pendingBytes);
  const reservationStore = new FileDurableAttemptStore(reservationRoot, {
    ...limits,
    maximumMetadataBytes: pendingBytes,
  });
  await assert.rejects(
    () => reservationStore.storeResult("run:reservation", pendingResult),
    /OBSERVABILITY_ATTEMPT_METADATA_FULL/,
  );
  assert.equal(
    (await reservationStore.snapshot()).results.length,
    0,
    "marker capacity must be reserved before the pending result is written",
  );

  const staleStore = new FileDurableAttemptStore(
    path.join(root, "stale-completion"),
    limits,
  );
  const staleAdmission = new FileObservabilityAdmissionStore(
    path.join(root, "stale-admission"),
    {
      maximumIngressBytes: 10000,
      maximumRecords: 20,
      maximumBytes: 200000,
      maximumQuarantineRecords: 5,
      maximumQuarantineBytes: 10000,
    },
  );
  const staleResult = resultFor(1, []);
  const staleUnsigned = {
    schemaVersion: "producer-record.v1" as const,
    recordId: "record:stale",
    producer,
    sequence: 1,
    recordType: "attempt.completed",
    occurredAt: "2026-08-09T12:00:01Z",
    correlation: {
      pipelineRunId: "run:stale",
      moduleId: null,
      gateId: "final",
      attemptId: staleResult.attemptId,
      claimId: staleResult.claimId,
      claimGeneration: 1,
      traceId: null,
      parentEventId: null,
    },
    payload: {
      workerId: staleResult.workerId,
      resultDigest: staleResult.resultDigest,
    },
  };
  const staleRecord = {
    ...staleUnsigned,
    recordDigest: producerRecordDigest(staleUnsigned),
  };
  const staleClosure = createProducerClosure({
    schemaVersion: "producer-closure.v1",
    closureId: "closure:stale",
    producer,
    pipelineRunId: "run:stale",
    firstSequence: 1,
    finalSequence: 1,
    recordCount: 1,
    requiredEvidenceIds: [],
    closedAt: "2026-08-09T12:00:02Z",
  });
  await staleStore.storeResult("run:stale", staleResult, {
    record: staleRecord,
    closure: staleClosure,
  });
  await staleStore.storeResult("run:stale", resultFor(2, []));
  await assert.rejects(
    () =>
      staleStore.resumeCompletion("run:stale", "attempt:1", 1, staleAdmission),
    /OBSERVABILITY_STALE_CLAIM_COMPLETION/,
    "an older completion intent must not be admitted after a newer claim result exists",
  );
  assert.equal((await staleAdmission.snapshot()).entries.length, 0);
  const finalizedStore = new FileDurableAttemptStore(
    path.join(root, "finalized-completion"),
    limits,
  );
  const finalizedAdmission = new FileObservabilityAdmissionStore(
    path.join(root, "finalized-admission"),
    {
      maximumIngressBytes: 10000,
      maximumRecords: 20,
      maximumBytes: 200000,
      maximumQuarantineRecords: 5,
      maximumQuarantineBytes: 10000,
    },
  );
  await finalizedStore.storeResult("run:stale", staleResult, {
    record: staleRecord,
    closure: staleClosure,
  });
  await finalizedStore.resumeCompletion(
    "run:stale",
    "attempt:1",
    1,
    finalizedAdmission,
  );
  await assert.rejects(
    () => finalizedStore.storeResult("run:stale", resultFor(2, [])),
    /OBSERVABILITY_ATTEMPT_ALREADY_COMPLETED/,
    "a newer claim result must not replace an already finalized attempt",
  );

  const evidence3 = await store.storeEvidence(
    {
      pipelineRunId: "run:1",
      attemptId: "attempt:1",
      claimGeneration: 3,
      producer,
      evidenceId: "log:3",
      type: "log",
      mediaType: "text/plain",
    },
    Buffer.from("pass three"),
  );
  fs.writeFileSync(new URL(evidence3.artifact.storageUrl), "broken");
  await assert.rejects(
    () => store.storeResult("run:1", resultFor(3, [evidence3])),
    /OBSERVABILITY_RESULT_EVIDENCE_CORRUPT/,
  );
  const orphanStore = new FileDurableAttemptStore(
    path.join(root, "orphan-reclaim"),
    { ...limits, maximumEvidenceObjects: 1, maximumPendingEvidenceAgeMs: 1 },
  );
  const orphan = await orphanStore.storeEvidence(
    {
      pipelineRunId: "run:orphan",
      attemptId: "attempt:orphan",
      claimGeneration: 1,
      producer,
      evidenceId: "orphan",
      type: "log",
      mediaType: "text/plain",
    },
    Buffer.from("orphan"),
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(
    (await orphanStore.snapshot()).evidence.length,
    0,
    "expired evidence without a durable result must release bounded capacity",
  );
  assert.equal(
    fs.existsSync(new URL(orphan.artifact.storageUrl)),
    false,
    "unreachable content blob must be reclaimed with its metadata",
  );
  assert.equal(canonicalJson(afterRestart.closures[0]), canonicalJson(closure));
  console.log(
    JSON.stringify({
      ok: true,
      phase: "5.7-D",
      durableResults: true,
      durableEvidence: true,
      staleClaimsRejected: true,
    }),
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
