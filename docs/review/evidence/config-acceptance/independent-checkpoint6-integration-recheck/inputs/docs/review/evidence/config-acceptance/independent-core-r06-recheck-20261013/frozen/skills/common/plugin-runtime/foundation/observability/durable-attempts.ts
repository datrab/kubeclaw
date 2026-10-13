import {
  producerClosureDigest,
  type ObservabilityCompletenessV1,
  type ProducerClosureV1,
  type ProducerGapReportV1,
  type ProducerIdentityV1,
  type ProducerRecordV1,
  type UnresolvedObservabilityItemV1,
} from "@kubeclaw/pipeline-observability-contract";
import type {
  WorkerAttemptResultV1,
  WorkerEvidenceRefV1,
} from "@kubeclaw/pipeline-worker-core-contract";
import type { ClosureRetirementIntent } from "./closure-projection.ts";
import type { AttemptRetirementIntent } from "./attempt-projection.ts";
import type { AdmissionRetiredEntry } from "./admission-retirement.ts";
import type { FileObservabilityAdmissionStore } from "./durable-delivery.ts";
import { AttemptState } from "./attempt-state.ts";
import { storeEvidence } from "./attempt-evidence.ts";
import { storeResult, resumeCompletion } from "./attempt-results.ts";
import { storeClosure, evaluateCompleteness } from "./attempt-completeness.ts";
import {
  retireAdmissionCompletion,
  retireImportedResult,
  retireImportedClosure,
} from "./attempt-retirement.ts";
export { scopedEvidenceId } from "./attempt-evidence.ts";
export interface DurableAttemptStoreLimits {
  maximumEvidenceObjects: number;
  maximumEvidenceBytes: number;
  maximumEvidenceObjectBytes: number;
  maximumResults: number;
  maximumClosures: number;
  maximumMetadataBytes: number;
  maximumPendingEvidenceAgeMs: number;
}
export interface DurableEvidenceInput {
  pipelineRunId: string;
  attemptId: string;
  claimGeneration: number;
  producer: ProducerIdentityV1;
  evidenceId: string;
  type: string;
  mediaType: string;
}
export interface DurableEvidenceMetadata extends DurableEvidenceInput {
  artifact: WorkerEvidenceRefV1["artifact"];
  stagedAt: string;
}
export interface DurableCompletionIntent {
  record: ProducerRecordV1;
  closure: ProducerClosureV1;
}
export interface DurableResultMetadata {
  pipelineRunId: string;
  planId: string | null;
  nodeId: string | null;
  attemptId: string;
  claimGeneration: number;
  workerId: string;
  result: WorkerAttemptResultV1;
  completionIntent: DurableCompletionIntent | null;
  storedAt: string | null;
}
export interface DurableAttemptStoreSnapshot {
  schemaVersion: "durable-attempt-store.v1";
  evidence: DurableEvidenceMetadata[];
  results: DurableResultMetadata[];
  closures: ProducerClosureV1[];
}
export interface DurableResultOwner {
  planId: string;
  nodeId: string;
}
export interface RequiredProducerClosure {
  closureId: string;
  producer: ProducerIdentityV1;
}
export class FileDurableAttemptStore {
  readonly #state: AttemptState;
  constructor(root: string, limits: DurableAttemptStoreLimits) {
    this.#state = new AttemptState(root, limits);
  }
  storageDirectory(): string {
    return this.#state.root;
  }
  async storeEvidence(
    input: DurableEvidenceInput,
    bytes: Uint8Array,
  ): Promise<WorkerEvidenceRefV1> {
    return storeEvidence(this.#state, input, bytes);
  }
  async storeResult(
    pipelineRunId: string,
    result: WorkerAttemptResultV1,
    completionIntent: DurableCompletionIntent | null = null,
    owner: DurableResultOwner | null = null,
  ): Promise<DurableResultMetadata> {
    return storeResult(
      this.#state,
      pipelineRunId,
      result,
      completionIntent,
      owner,
    );
  }
  async resumeCompletion(
    pipelineRunId: string,
    attemptId: string,
    claimGeneration: number,
    admission: FileObservabilityAdmissionStore,
  ): Promise<ProducerClosureV1> {
    return resumeCompletion(
      this.#state,
      pipelineRunId,
      attemptId,
      claimGeneration,
      admission,
    );
  }
  async retireAdmissionCompletion(
    admission: FileObservabilityAdmissionStore,
    input: {
      pipelineRunId: string;
      attemptId: string;
      claimGeneration: number;
      recordDigest: string;
      operationId: string;
      actor: string;
      authority: AdmissionRetiredEntry["authority"];
    },
    authorize: () => Promise<void>,
  ): Promise<{ newlyRetired: boolean; releasedBytes: number }> {
    return retireAdmissionCompletion(this.#state, admission, input, authorize);
  }
  async retireImportedResult(
    input: AttemptRetirementIntent,
    withCheckpointFence: (
      operation: () => { newlyRetired: boolean; releasedBytes: number },
    ) => { newlyRetired: boolean; releasedBytes: number },
    authorize: () => void,
  ): Promise<{ newlyRetired: boolean; releasedBytes: number }> {
    return retireImportedResult(
      this.#state,
      input,
      withCheckpointFence,
      authorize,
    );
  }
  async retireImportedClosure(
    input: ClosureRetirementIntent,
    withCheckpointFence: (
      operation: () => { newlyRetired: boolean; releasedBytes: number },
    ) => { newlyRetired: boolean; releasedBytes: number },
    authorize: () => void,
  ): Promise<{ newlyRetired: boolean; releasedBytes: number }> {
    return retireImportedClosure(
      this.#state,
      input,
      withCheckpointFence,
      authorize,
    );
  }
  async storeClosure(
    closure: ProducerClosureV1,
    admission: FileObservabilityAdmissionStore,
  ): Promise<ProducerClosureV1> {
    return storeClosure(this.#state, closure, admission);
  }
  async evaluateCompleteness(
    pipelineRunId: string,
    required: ReadonlyArray<RequiredProducerClosure>,
    admission: FileObservabilityAdmissionStore,
    missingRanges: ReadonlyArray<ProducerGapReportV1> = [],
    unresolvedItems: ReadonlyArray<UnresolvedObservabilityItemV1> = [],
  ): Promise<ObservabilityCompletenessV1> {
    return evaluateCompleteness(
      this.#state,
      pipelineRunId,
      required,
      admission,
      missingRanges,
      unresolvedItems,
    );
  }
  async snapshot(): Promise<Readonly<DurableAttemptStoreSnapshot>> {
    return this.#state.serial(async () => {
      const state = await this.#state.readState();
      await this.#state.reclaimExpiredEvidence(state);
      return state;
    });
  }
}
export function createProducerClosure(
  input: Omit<ProducerClosureV1, "closureDigest">,
): ProducerClosureV1 {
  return {
    ...structuredClone(input),
    closureDigest: producerClosureDigest(input),
  };
}
