import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalJson } from "../../../contracts/pipeline-observability/v1/src/index.ts";
import { FileDurableAttemptStore } from "../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts";
import {
  FileObservabilityAdmissionStore,
  FileProducerOutbox,
  deliverPending,
} from "../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts";
import { buildClawDeckObservationView } from "../../../skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "kubeclaw-clawdeck-view-"));
try {
  const admission = new FileObservabilityAdmissionStore(
    path.join(root, "admission"),
    {
      maximumIngressBytes: 10000,
      maximumRecords: 20,
      maximumBytes: 200000,
      maximumQuarantineRecords: 1,
      maximumQuarantineBytes: 10000,
    },
  );
  const attempts = new FileDurableAttemptStore(path.join(root, "attempts"), {
    maximumEvidenceObjects: 20,
    maximumEvidenceBytes: 100000,
    maximumEvidenceObjectBytes: 10000,
    maximumResults: 20,
    maximumClosures: 20,
    maximumMetadataBytes: 200000,
    maximumPendingEvidenceAgeMs: 60000,
  });
  const outbox = new FileProducerOutbox(path.join(root, "outbox"), {
    maximumRecords: 10,
    maximumBytes: 100000,
  });
  const producer = {
    producerId: "application:1",
    bootId: "boot:1",
    producerType: "application",
  };
  const base = {
    schemaVersion: "producer-record.v1" as const,
    recordId: "record:1",
    producer,
    sequence: 1,
    recordType: "application.log",
    occurredAt: "2026-08-09T14:00:05Z",
    correlation: {
      pipelineRunId: "run:view",
      moduleId: "app",
      gateId: null,
      attemptId: null,
      claimId: null,
      claimGeneration: null,
      traceId: "trace:1",
      parentEventId: null,
    },
    payload: { message: "later clock" },
  };
  const first = await outbox.append(base);
  const second = await outbox.append({
    ...base,
    recordId: "record:2",
    sequence: 2,
    occurredAt: "2026-08-09T13:59:59Z",
    payload: { message: "earlier clock" },
  });
  await admission.admit(canonicalJson(second));
  await deliverPending(outbox, admission);
  const duplicate = await admission.admit(canonicalJson(first));
  assert.equal(duplicate.acknowledgement.state, "duplicate");
  const otherRun = {
    ...base,
    recordId: "record:other-run",
    producer: {
      producerId: "application:other",
      bootId: "boot:other",
      producerType: "application",
    },
    sequence: 1,
    correlation: {
      ...base.correlation,
      pipelineRunId: "run:other",
    },
  };
  await admission.admit(canonicalJson(await outbox.append(otherRun)));
  const gap = {
    schemaVersion: "producer-gap-report.v1" as const,
    producer,
    pipelineRunId: "run:view",
    fromSequence: 3,
    toSequence: 4,
    state: "missing" as const,
    reportedAt: "2026-08-09T14:01:00Z",
    reasonCode: "producer-offline",
  };
  const view = await buildClawDeckObservationView({
    pipelineRunId: "run:view",
    requiredClosures: [],
    missingRanges: [gap],
    admissionStore: admission,
    attemptStore: attempts,
  });
  assert.deepEqual(
    view.rawRecords.map((item) => item.canonicalCursor),
    [1, 2],
    "arrival cursor must remain stable despite producer clock skew",
  );
  assert.deepEqual(
    view.rawRecords.map((item) => item.record.sequence),
    [2, 1],
    "raw arrival order must remain visible",
  );
  assert.equal(view.completeness.state, "partial");
  assert.equal(
    view.nextCursor,
    4,
    "the cursor must advance across records owned by other pipeline runs",
  );
  const tail = await buildClawDeckObservationView({
    pipelineRunId: "run:view",
    fromCursor: 2,
    requiredClosures: [],
    admissionStore: admission,
    attemptStore: attempts,
  });
  assert.equal(
    tail.rawRecords.length,
    1,
    "live mode must be a cursor tail of durable history",
  );
  assert.equal(tail.nextCursor, 4);
  const interleavedTail = await buildClawDeckObservationView({
    pipelineRunId: "run:view",
    fromCursor: 3,
    requiredClosures: [],
    admissionStore: admission,
    attemptStore: attempts,
  });
  assert.equal(interleavedTail.rawRecords.length, 0);
  assert.equal(
    interleavedTail.nextCursor,
    4,
    "an empty filtered tail must still advance to the global high-water cursor",
  );
  await assert.rejects(() => admission.admit(`${canonicalJson(first)}\n`));
  assert.equal((await admission.snapshot()).quarantine.length, 1);
  const afterRestart = await buildClawDeckObservationView({
    pipelineRunId: "run:view",
    requiredClosures: [],
    admissionStore: new FileObservabilityAdmissionStore(
      path.join(root, "admission"),
      {
        maximumIngressBytes: 10000,
        maximumRecords: 20,
        maximumBytes: 200000,
        maximumQuarantineRecords: 1,
        maximumQuarantineBytes: 10000,
      },
    ),
    attemptStore: attempts,
  });
  assert.equal(
    afterRestart.completeness.state,
    "partial",
    "durable gaps must survive collector restart",
  );
  assert.equal(
    afterRestart.completeness.unresolvedItems.some(
      (item) => item.kind === "quarantined-record",
    ),
    true,
    "attributed quarantine must remain visible",
  );
  console.log(
    JSON.stringify({
      ok: true,
      phase: "5.7-F",
      rawPreserved: true,
      normalizedJoined: true,
      gapsVisible: true,
      liveTail: true,
    }),
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
