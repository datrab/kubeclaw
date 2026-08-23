import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  workerAttemptResultDigest,
  type WorkerAttemptResultV1,
} from "../../../contracts/pipeline-worker-core/v1/src/index.ts";
import { producerRecordDigest } from "../../../contracts/pipeline-observability/v1/src/index.ts";
import {
  createProducerClosure,
  FileDurableAttemptStore,
} from "../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts";
import { FileObservabilityAdmissionStore } from "../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts";
import {
  NovaObservabilityReconciler,
  persistNovaObservabilityPlan,
  reconcileNovaObservabilityOnRecovery,
  type ReconciliationAttempt,
} from "../../../skills/nova/core/observability/reconciler.ts";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kubeclaw-nova-reconcile-"));
const now = new Date("2026-08-09T14:00:00Z");
function resultFor(index: number): WorkerAttemptResultV1 {
  const value: WorkerAttemptResultV1 = {
    schemaVersion: "worker-attempt-result.v1",
    protocolVersion: "worker-protocol.v1",
    attemptId: `attempt:${index}`,
    claimId: `claim:${index}:1`,
    claimGeneration: 1,
    workerId: `worker:${index % 4}`,
    state: "completed",
    startedAt: "2026-08-09T13:59:00Z",
    completedAt: "2026-08-09T13:59:30Z",
    durationMs: 30000,
    summary: `Attempt ${index} passed.`,
    specialistResult: {
      schemaId: "test-result.v1",
      schemaDigest: "sha256:".padEnd(71, "0"),
      values: { outcome: "passed" },
    },
    error: null,
    evidence: [],
    resources: { logBytes: 0, resultBytes: 100, evidenceBytes: 0 },
    cleanup: { state: "not_required", summary: null },
    exitCode: 0,
    signal: null,
    resultDigest: "sha256:".padEnd(71, "0"),
    receipt: {
      receiptId: `receipt:${index}`,
      receiptDigest: "sha256:".padEnd(71, "0"),
    },
  };
  value.resultDigest = workerAttemptResultDigest(value);
  return value;
}

try {
  const runRoot = path.join(root, "run");
  const observabilityRoot = path.join(runRoot, "observability");
  const store = new FileDurableAttemptStore(
    path.join(observabilityRoot, "attempts"),
    {
      maximumEvidenceObjects: 100,
      maximumEvidenceBytes: 100000,
      maximumEvidenceObjectBytes: 10000,
      maximumResults: 100,
      maximumClosures: 100,
      maximumMetadataBytes: 2000000,
      maximumPendingEvidenceAgeMs: 60000,
    },
  );
  const admission = new FileObservabilityAdmissionStore(
    path.join(observabilityRoot, "admission"),
    {
      maximumIngressBytes: 10000,
      maximumRecords: 100,
      maximumBytes: 1000000,
      maximumQuarantineRecords: 10,
      maximumQuarantineBytes: 10000,
    },
  );
  const order = [
    17, 3, 20, 1, 14, 7, 12, 5, 19, 2, 16, 9, 4, 18, 11, 6, 15, 8, 13, 10,
  ];
  const closures = [] as Array<{
    closureId: string;
    producer: { producerId: string; bootId: string; producerType: string };
  }>;
  for (const index of order) {
    const result = resultFor(index);
    const producer = {
      producerId: `attempt:${index}`,
      bootId: `claim:${index}:1`,
      producerType: "buster-attempt",
    };
    const unsigned = {
      schemaVersion: "producer-record.v1" as const,
      recordId: `record:${index}`,
      producer,
      sequence: 1,
      recordType: "attempt.completed",
      occurredAt: "2026-08-09T13:59:30Z",
      correlation: {
        pipelineRunId: "run:scale",
        moduleId: null,
        gateId: "final",
        attemptId: result.attemptId,
        claimId: result.claimId,
        claimGeneration: 1,
        traceId: null,
        parentEventId: null,
      },
      payload: { workerId: result.workerId, resultDigest: result.resultDigest },
    };
    const record = {
      ...unsigned,
      recordDigest: producerRecordDigest(unsigned),
    };
    const closure = createProducerClosure({
      schemaVersion: "producer-closure.v1",
      closureId: `closure:${index}`,
      producer,
      pipelineRunId: "run:scale",
      firstSequence: 1,
      finalSequence: 1,
      recordCount: 1,
      requiredEvidenceIds: [],
      closedAt: "2026-08-09T13:59:31Z",
    });
    await store.storeResult(
      "run:scale",
      result,
      { record, closure },
      { planId: "plan:scale", nodeId: `node:${index}` },
    );
    closures[index - 1] = { closureId: closure.closureId, producer };
  }
  const desired: ReconciliationAttempt[] = Array.from(
    { length: 20 },
    (_, offset) => ({
      pipelineRunId: "run:scale",
      planId: "plan:scale",
      nodeId: `node:${offset + 1}`,
      attemptId: `attempt:${offset + 1}`,
      claimId: `claim:${offset + 1}:1`,
      claimGeneration: 1,
      workerId: `worker:${(offset + 1) % 4}`,
      claimExpiresAt: "2099-08-09T14:05:00Z",
      gateClass: "development",
      requiredClosures: [closures[offset]!],
    }),
  );
  const journal = path.join(observabilityRoot, "reconciliation.jsonl");
  await persistNovaObservabilityPlan(
    runRoot,
    "run:scale",
    desired.slice(0, 10),
  );
  const firstHalf = await reconcileNovaObservabilityOnRecovery(
    runRoot,
    "run:scale",
    () => now,
  );
  assert.equal(
    firstHalf.filter((item) => item.action === "imported").length,
    10,
  );
  await persistNovaObservabilityPlan(runRoot, "run:scale", desired);
  const afterRestart = await reconcileNovaObservabilityOnRecovery(
    runRoot,
    "run:scale",
    () => now,
  );
  const restartedNova = new NovaObservabilityReconciler({
    attemptStore: store,
    admissionStore: admission,
    journalFile: journal,
    now: () => now,
  });
  assert.equal(
    afterRestart.filter((item) => item.action === "already-imported").length,
    10,
    "restart must not import a result twice",
  );
  assert.equal(
    afterRestart.filter((item) => item.action === "imported").length,
    10,
  );
  assert.equal(
    afterRestart.every(
      (item) => item.nodeId.slice(5) === item.attemptId.slice(8),
    ),
    true,
    "mixed worker completion order must map to the correct node",
  );
  assert.equal(
    new Set(restartedNova.records().map((item) => item.decisionKey)).size,
    20,
    "journal must contain one import decision per attempt",
  );
  await assert.rejects(
    () => restartedNova.reconcile([{ ...desired[0]!, nodeId: "node:wrong" }]),
    /NOVA_RECONCILIATION_NODE_MAPPING_CONFLICT/,
  );

  const missingClosure = {
    closureId: "closure:missing",
    producer: {
      producerId: "worker:missing",
      bootId: "boot:missing",
      producerType: "buster",
    },
  };
  const development = await restartedNova.reconcile([
    {
      ...desired[0]!,
      gateClass: "development",
      requiredClosures: [missingClosure],
    },
  ]);
  assert.equal(development[0]?.action, "continue-degraded");
  const finalGate = await restartedNova.reconcile([
    {
      ...desired[1]!,
      gateClass: "authoritative-final",
      requiredClosures: [missingClosure],
    },
  ]);
  assert.equal(finalGate[0]?.action, "blocked-incomplete");
  const active = await restartedNova.reconcile([
    {
      pipelineRunId: "run:scale",
      planId: "plan:scale",
      nodeId: "node:active",
      attemptId: "attempt:active",
      claimId: "claim:active",
      claimGeneration: 1,
      workerId: "worker:active",
      claimExpiresAt: "2026-08-09T14:05:00Z",
      gateClass: "development",
      requiredClosures: [],
    },
  ]);
  assert.equal(active[0]?.action, "reconnect");
  const expired = await restartedNova.reconcile([
    {
      pipelineRunId: "run:scale",
      planId: "plan:scale",
      nodeId: "node:expired",
      attemptId: "attempt:expired",
      claimId: "claim:expired",
      claimGeneration: 2,
      workerId: "worker:expired",
      claimExpiresAt: "2026-08-09T13:00:00Z",
      gateClass: "development",
      requiredClosures: [],
    },
  ]);
  assert.equal(expired[0]?.action, "requeue");
  assert.equal(expired[0]?.nextClaimGeneration, 3);
  const lateResult = resultFor(21);
  await store.storeResult("run:scale", lateResult, null, {
    planId: "plan:scale",
    nodeId: "node:21",
  });
  const late = await restartedNova.reconcile([
    {
      pipelineRunId: "run:scale",
      planId: "plan:scale",
      nodeId: "node:21",
      attemptId: lateResult.attemptId,
      claimId: lateResult.claimId,
      claimGeneration: 1,
      workerId: lateResult.workerId,
      claimExpiresAt: "2026-08-09T13:00:00Z",
      gateClass: "development",
      requiredClosures: [],
    },
  ]);
  assert.equal(
    late[0]?.action,
    "requeue",
    "a result that becomes durable after lease expiry must not be imported",
  );
  assert.equal(late[0]?.nextClaimGeneration, 2);
  const boundaryResult = resultFor(22);
  await store.storeResult("run:scale", boundaryResult, null, {
    planId: "plan:scale",
    nodeId: "node:22",
  });
  const boundaryStoredAt = (await store.snapshot()).results.find(
    (item) => item.attemptId === boundaryResult.attemptId,
  )!.storedAt;
  assert.ok(boundaryStoredAt);
  const boundary = await restartedNova.reconcile([
    {
      pipelineRunId: "run:scale",
      planId: "plan:scale",
      nodeId: "node:22",
      attemptId: boundaryResult.attemptId,
      claimId: boundaryResult.claimId,
      claimGeneration: 1,
      workerId: boundaryResult.workerId,
      claimExpiresAt: boundaryStoredAt,
      gateClass: "development",
      requiredClosures: [],
    },
  ]);
  assert.equal(
    boundary[0]?.action,
    "requeue",
    "a result stored at the exact lease expiry must not be imported",
  );
  const ownedResult = resultFor(23);
  await store.storeResult("run:scale", ownedResult, null, {
    planId: "plan:owner-a",
    nodeId: "node:23",
  });
  const wrongOwner = await restartedNova.reconcile([
    {
      pipelineRunId: "run:scale",
      planId: "plan:owner-b",
      nodeId: "node:23",
      attemptId: ownedResult.attemptId,
      claimId: ownedResult.claimId,
      claimGeneration: 1,
      workerId: ownedResult.workerId,
      claimExpiresAt: "2099-08-09T14:05:00Z",
      gateClass: "development",
      requiredClosures: [],
    },
  ]);
  assert.equal(
    wrongOwner[0]?.action,
    "identity-mismatch-rejected",
    "Nova must not import a result owned by another test plan",
  );

  const pendingIndex = 24;
  const pendingResult = resultFor(pendingIndex);
  const pendingProducer = {
    producerId: `attempt:${pendingIndex}`,
    bootId: `claim:${pendingIndex}:1`,
    producerType: "buster-attempt",
  };
  const pendingUnsigned = {
    schemaVersion: "producer-record.v1" as const,
    recordId: `record:${pendingIndex}`,
    producer: pendingProducer,
    sequence: 1,
    recordType: "attempt.completed",
    occurredAt: "2026-08-09T13:59:30Z",
    correlation: {
      pipelineRunId: "run:scale",
      moduleId: null,
      gateId: "final",
      attemptId: pendingResult.attemptId,
      claimId: pendingResult.claimId,
      claimGeneration: 1,
      traceId: null,
      parentEventId: null,
    },
    payload: {
      workerId: pendingResult.workerId,
      resultDigest: pendingResult.resultDigest,
    },
  };
  const pendingRecord = {
    ...pendingUnsigned,
    recordDigest: producerRecordDigest(pendingUnsigned),
  };
  const pendingClosure = createProducerClosure({
    schemaVersion: "producer-closure.v1",
    closureId: `closure:${pendingIndex}`,
    producer: pendingProducer,
    pipelineRunId: "run:scale",
    firstSequence: 1,
    finalSequence: 1,
    recordCount: 1,
    requiredEvidenceIds: [],
    closedAt: "2026-08-09T13:59:31Z",
  });
  await store.storeResult(
    "run:scale",
    pendingResult,
    { record: pendingRecord, closure: pendingClosure },
    { planId: "plan:scale", nodeId: `node:${pendingIndex}` },
  );
  const attemptStateFile = path.join(
    observabilityRoot,
    "attempts",
    "attempt-store.json",
  );
  const pendingState = JSON.parse(fs.readFileSync(attemptStateFile, "utf8"));
  pendingState.results.find(
    (item: { attemptId: string }) => item.attemptId === pendingResult.attemptId,
  ).storedAt = null;
  fs.writeFileSync(attemptStateFile, JSON.stringify(pendingState));
  const recoveredPending = await restartedNova.reconcile([
    {
      pipelineRunId: "run:scale",
      planId: "plan:scale",
      nodeId: `node:${pendingIndex}`,
      attemptId: pendingResult.attemptId,
      claimId: pendingResult.claimId,
      claimGeneration: 1,
      workerId: pendingResult.workerId,
      claimExpiresAt: "2099-08-09T14:05:00Z",
      gateClass: "development",
      requiredClosures: [
        { closureId: pendingClosure.closureId, producer: pendingProducer },
      ],
    },
  ]);
  assert.equal(
    recoveredPending[0]?.action,
    "imported",
    "Nova must promote and import a pending durable result before requeueing",
  );
  assert.equal(
    typeof (await store.snapshot()).results.find(
      (item) => item.attemptId === pendingResult.attemptId,
    )?.storedAt,
    "string",
  );
  console.log(
    JSON.stringify({
      ok: true,
      phase: "5.7-E",
      workers: 20,
      idempotentImports: true,
      developmentDegraded: true,
      finalStrict: true,
    }),
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
