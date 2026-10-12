import crypto from 'node:crypto';
import type { WorkerAttemptEnvelopeV1, WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { workerAttemptResultDigest } from '@kubeclaw/worker-core';
import { producerRecordDigest } from '@kubeclaw/pipeline-observability-contract';
import { createProducerClosure, scopedEvidenceId, type FileDurableAttemptStore } from '@kubeclaw/plugin-foundation/observability/durable-attempts';
import type { FileObservabilityAdmissionStore } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import type { TestPlanRunnerOptions } from './runner-types.ts';
import { receipt } from './runner-values.ts';
import { readManagedEvidence } from './runner-managed-evidence.ts';

export interface CompletionOwner {
  readonly options: TestPlanRunnerOptions;
  readonly attemptStore: FileDurableAttemptStore;
  readonly admissionStore: FileObservabilityAdmissionStore;
  readonly authorityId: string;
  readonly now: () => Date;
}

export async function resumeRunnerCompletions(owner: CompletionOwner): Promise<number> {
    const snapshot = await owner.attemptStore.snapshot();
    const closed = new Set(
      snapshot.closures.map(
        (item) => `${item.pipelineRunId}\0${item.closureId}`,
      ),
    );
    const current = snapshot.results.filter(
      (stored) =>
        stored.pipelineRunId === owner.options.plan.runId &&
        stored.planId === owner.options.plan.planId,
    );
    const newestGeneration = new Map<string, number>();
    for (const stored of current)
      newestGeneration.set(
        stored.attemptId,
        Math.max(
          newestGeneration.get(stored.attemptId) ?? 0,
          stored.claimGeneration,
        ),
      );
    let recovered = 0;
    for (const stored of current) {
      if (
        stored.claimGeneration <
        (newestGeneration.get(stored.attemptId) ?? 0)
      )
        continue;
      recovered += 1;
      if (
        !stored.completionIntent ||
        closed.has(
          `${stored.pipelineRunId}\0${stored.completionIntent.closure.closureId}`,
        )
      )
        continue;
      if (typeof stored.storedAt !== "string") continue;
      await owner.attemptStore.resumeCompletion(
        stored.pipelineRunId,
        stored.attemptId,
        stored.claimGeneration,
        owner.admissionStore,
      );
    }
    return recovered;
  }

function completionProducer(envelope: WorkerAttemptEnvelopeV1, result: WorkerAttemptResultV1) {
    if (
      result.attemptId !== envelope.attemptId ||
      result.claimId !== envelope.claim.claimId ||
      result.claimGeneration !== envelope.claim.generation ||
      result.workerId !== envelope.claim.workerId
    )
      throw new Error("OBSERVABILITY_WORKER_RESULT_IDENTITY_MISMATCH");
    const bootHash = crypto
      .createHash("sha256")
      .update(
        `${envelope.pipelineRunId}\0${envelope.attemptId}\0${envelope.claim.claimId}\0${envelope.claim.generation}`,
      )
      .digest("hex");
    const producer = {
      producerId: `attempt:${bootHash}`,
      bootId: `claim:${bootHash}`,
      producerType: "buster-attempt",
    };
    return { bootHash, producer };
}

type CompletionProducer = ReturnType<typeof completionProducer>;

async function storeCompletionEvidence(owner: CompletionOwner, envelope: WorkerAttemptEnvelopeV1,
  result: WorkerAttemptResultV1, producer: CompletionProducer['producer']) {
    const durableEvidence: WorkerAttemptResultV1["evidence"][number][] = [];
    let remainingEvidenceBytes = envelope.limits.evidenceBytes;
    for (const evidence of result.evidence) {
      const content = await readManagedEvidence(owner.options.artifactRoot,
        evidence.artifact.storageUrl,
        remainingEvidenceBytes,
      );
      remainingEvidenceBytes -= content.byteLength;
      durableEvidence.push(
        await owner.attemptStore.storeEvidence(
          {
            pipelineRunId: envelope.pipelineRunId,
            attemptId: envelope.attemptId,
            claimGeneration: envelope.claim.generation,
            producer,
            evidenceId: evidence.evidenceId,
            type: evidence.type,
            mediaType: evidence.artifact.mediaType,
          },
          content,
        ),
      );
    }
    return durableEvidence;
}

function completionResult(owner: CompletionOwner, result: WorkerAttemptResultV1,
  durableEvidence: WorkerAttemptResultV1['evidence'], bootHash: string): WorkerAttemptResultV1 {
    const durableResult: WorkerAttemptResultV1 = {
      ...structuredClone(result),
      evidence: durableEvidence,
      resultDigest: "",
    };
    durableResult.resultDigest = workerAttemptResultDigest(durableResult);
    durableResult.receipt = receipt(
      owner.authorityId,
      bootHash,
      durableResult.resultDigest,
    );
    return durableResult;
}

function completionIntent(owner: CompletionOwner, envelope: WorkerAttemptEnvelopeV1,
  durableResult: WorkerAttemptResultV1, { bootHash, producer }: CompletionProducer) {
    const durableEvidence = durableResult.evidence;
    const occurredAt = owner.now().toISOString();
    const unsignedRecord = {
      schemaVersion: "producer-record.v1" as const,
      recordId: `record:${bootHash}`,
      producer,
      sequence: 1,
      recordType: "attempt.completed",
      occurredAt,
      correlation: {
        pipelineRunId: envelope.pipelineRunId,
        moduleId: envelope.moduleId,
        gateId: envelope.gateId,
        attemptId: envelope.attemptId,
        claimId: envelope.claim.claimId,
        claimGeneration: envelope.claim.generation,
        traceId: null,
        parentEventId: null,
      },
      payload: {
        state: durableResult.state,
        workerId: durableResult.workerId,
        resultDigest: durableResult.resultDigest,
        evidence: durableEvidence.map((item) => ({
          evidenceId: item.evidenceId,
          contentDigest: item.artifact.contentDigest,
        })),
      },
    };
    const record = {
      ...unsignedRecord,
      recordDigest: producerRecordDigest(unsignedRecord),
    };
    const closure = createProducerClosure({
      schemaVersion: "producer-closure.v1",
      closureId: `closure:${bootHash}`,
      producer,
      pipelineRunId: envelope.pipelineRunId,
      firstSequence: 1,
      finalSequence: 1,
      recordCount: 1,
      requiredEvidenceIds: durableEvidence.map((item) =>
        scopedEvidenceId(
          envelope.attemptId,
          envelope.claim.generation,
          item.evidenceId,
        ),
      ),
      closedAt: owner.now().toISOString(),
    });
    return { record, closure };
}

/** An admission failure retains the already persisted result/intent for ordinary recovery. */
async function admitCompletion(owner: CompletionOwner, envelope: WorkerAttemptEnvelopeV1) {
  try {
    await owner.attemptStore.resumeCompletion(envelope.pipelineRunId,
      envelope.attemptId, envelope.claim.generation, owner.admissionStore);
    return { state: 'admitted' as const };
  } catch (cause) {
    return { state: 'durable-pending-admission' as const, cause };
  }
}

export async function persistRunnerCompletion(owner: CompletionOwner,
  envelope: WorkerAttemptEnvelopeV1, result: WorkerAttemptResultV1) {
  const identity = completionProducer(envelope, result);
  const evidence = await storeCompletionEvidence(owner, envelope, result, identity.producer);
  const durableResult = completionResult(owner, result, evidence, identity.bootHash);
  const intent = completionIntent(owner, envelope, durableResult, identity);
  await owner.attemptStore.storeResult(envelope.pipelineRunId, durableResult, intent,
    { planId: envelope.planId, nodeId: envelope.nodeId });
  const admission = await admitCompletion(owner, envelope);
  return { result: Object.freeze(durableResult), admission };
}
