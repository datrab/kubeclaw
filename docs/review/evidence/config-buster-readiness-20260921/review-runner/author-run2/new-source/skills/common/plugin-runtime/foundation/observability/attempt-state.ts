import path from "node:path";
import { canonicalJson } from "@kubeclaw/pipeline-observability-contract";
import {
  decodeAttemptState,
  encodeAttemptState,
  type AttemptProjections,
  type PersistedAttempt,
} from "./attempt-projection.ts";
import type { ClosureProjections } from "./closure-projection.ts";
import { assertAttemptReplay } from "./attempt-replay.ts";
import {
  cleanupStaging,
  cleanupUnreferencedBlobs,
} from "./attempt-evidence.ts";
import {
  readDurableState,
  writeDurableState,
  withDurableStoreLock,
} from "./durable-delivery.ts";
import type {
  DurableAttemptStoreLimits,
  DurableAttemptStoreSnapshot,
} from "./durable-attempts.ts";
const EMPTY_STATE: DurableAttemptStoreSnapshot = {
  schemaVersion: "durable-attempt-store.v1",
  evidence: [],
  results: [],
  closures: [],
};

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export class AttemptState {
  readonly root: string;
  readonly file: string;
  readonly limits: DurableAttemptStoreLimits;
  #queue: Promise<unknown> = Promise.resolve();
  closureProjections: ClosureProjections = new Map();
  projections: AttemptProjections = new Map();
  constructor(root: string, limits: DurableAttemptStoreLimits) {
    if (!path.isAbsolute(root))
      throw new Error("OBSERVABILITY_ATTEMPT_STORE_ROOT_NOT_ABSOLUTE");
    if (Object.values(limits).some((value) => !validLimit(value)))
      throw new Error("OBSERVABILITY_ATTEMPT_STORE_LIMIT_INVALID");
    this.root = root;
    this.file = path.join(root, "attempt-store.json");
    this.limits = limits;
  }
  serial<T>(operation: () => Promise<T>): Promise<T> {
    const locked = () =>
      withDurableStoreLock(this.file, async () => {
        await cleanupStaging(this.root);
        return operation();
      });
    const result = this.#queue.then(locked, locked);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async readState(): Promise<DurableAttemptStoreSnapshot> {
    const raw = await readDurableState<PersistedAttempt>(
      this.file,
      EMPTY_STATE,
      this.limits.maximumMetadataBytes,
    );
    const { state, projections, closureProjections } = decodeAttemptState(
      raw,
      this.root,
      this.limits,
    );
    this.projections = projections;
    this.closureProjections = closureProjections;
    return state;
  }
  async writeState(state: DurableAttemptStoreSnapshot): Promise<void> {
    this.checkSize(state);
    await writeDurableState(
      this.file,
      encodeAttemptState(state, this.projections, this.closureProjections),
    );
  }
  checkSize(state: DurableAttemptStoreSnapshot): void {
    const encoded = encodeAttemptState(
      state,
      this.projections,
      this.closureProjections,
    );
    assertAttemptReplay(
      state,
      this.root,
      this.limits,
      this.projections.size,
      this.closureProjections.size,
    );
    if (
      Buffer.byteLength(canonicalJson(encoded)) >
      this.limits.maximumMetadataBytes
    )
      throw new Error("OBSERVABILITY_ATTEMPT_METADATA_FULL");
  }
  async reclaimExpiredEvidence(
    state: DurableAttemptStoreSnapshot,
  ): Promise<void> {
    const referenced = new Set(
      state.results.flatMap((stored) =>
        stored.result.evidence.map(
          (item) =>
            `${stored.pipelineRunId}\0${stored.attemptId}\0${stored.claimGeneration}\0${item.evidenceId}`,
        ),
      ),
    );
    const now = Date.now();
    const retained = state.evidence.filter((item) => {
      const key = `${item.pipelineRunId}\0${item.attemptId}\0${item.claimGeneration}\0${item.evidenceId}`;
      if (referenced.has(key)) return true;
      const stagedAt = Date.parse(item.stagedAt);
      return (
        Number.isFinite(stagedAt) &&
        now - stagedAt < this.limits.maximumPendingEvidenceAgeMs
      );
    });
    if (retained.length === state.evidence.length) return;
    state.evidence = retained;
    this.checkSize(state);
    await this.writeState(state);
    await cleanupUnreferencedBlobs(this.root, state);
  }
}
