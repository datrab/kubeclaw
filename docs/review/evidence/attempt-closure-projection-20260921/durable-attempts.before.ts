import { completionRetirementSource, type AdmissionRetiredEntry } from './admission-retirement.ts';
import {decodeAttemptState, encodeAttemptState, createAttemptProjection, attemptProjectionKey, attemptStoreDigest, assertAttemptRetirementIntent, readAttemptJournalPrefix, replaceAttemptProjectionSync,
  type AttemptProjections, type AttemptRetirementIntent, type PersistedAttemptV2} from './attempt-projection.ts';
import { assertAttemptReplay, assertCompletionIntent } from "./attempt-replay.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  canonicalJson,
  producerClosureDigest,
  validatePipelineObservabilityContract,
  type ObservabilityCompletenessV1,
  type ProducerClosureV1,
  type ProducerGapReportV1,
  type ProducerIdentityV1,
  type ProducerRecordV1,
  type UnresolvedObservabilityItemV1,
} from "@kubeclaw/pipeline-observability-contract";
import {
  validatePipelineWorkerCoreContract,
  type WorkerAttemptResultV1,
  type WorkerEvidenceRefV1,
} from "@kubeclaw/pipeline-worker-core-contract";
import {
  ensureDirectoryDurable,
  readDurableState,
  withDurableStoreLock,
  writeDurableState,
  type AdmittedRecordView,
  type FileObservabilityAdmissionStore,
} from "./durable-delivery.ts";

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
const EMPTY_STATE: DurableAttemptStoreSnapshot = {
  schemaVersion: "durable-attempt-store.v1",
  evidence: [],
  results: [],
  closures: [],
};

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function requireIdentity(value: string, code: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 512)
    throw new Error(code);
}
function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function sameProducer(
  left: ProducerIdentityV1,
  right: ProducerIdentityV1,
): boolean {
  return (
    left.producerId === right.producerId &&
    left.bootId === right.bootId &&
    left.producerType === right.producerType
  );
}
async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function durableBlob(
  root: string,
  contentDigest: string,
  bytes: Uint8Array,
): Promise<string> {
  const hex = contentDigest.slice("sha256:".length);
  const directory = path.join(root, "blobs", hex.slice(0, 2));
  const staging = path.join(root, "staging");
  await ensureDirectoryDurable(directory);
  await ensureDirectoryDurable(staging);
  const destination = path.join(directory, hex);
  try {
    const existing = await fs.readFile(destination);
    if (digest(existing) !== contentDigest)
      throw new Error("OBSERVABILITY_EVIDENCE_DIGEST_CONFLICT");
    return destination;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = path.join(staging, `${hex}.${randomUUID()}.tmp`);
  let renamed = false;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, destination);
    renamed = true;
    await syncDirectory(directory);
    return destination;
  } finally {
    if (!renamed) await fs.unlink(temporary).catch(() => undefined);
  }
}
async function cleanupStaging(root: string): Promise<void> {
  const staging = path.join(root, "staging");
  await fs.mkdir(staging, { recursive: true });
  for (const entry of await fs.readdir(staging, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".tmp"))
      await fs.unlink(path.join(staging, entry.name));
  }
}
async function cleanupUnreferencedBlobs(
  root: string,
  state: DurableAttemptStoreSnapshot,
): Promise<void> {
  const blobs = path.join(root, "blobs");
  const referenced = new Set(
    state.evidence.map((item) => item.artifact.contentDigest.slice(7)),
  );
  let prefixes: import("node:fs").Dirent<string>[] = [];
  try {
    prefixes = await fs.readdir(blobs, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const prefix of prefixes) {
    if (!prefix.isDirectory() || !/^[0-9a-f]{2}$/.test(prefix.name)) continue;
    const directory = path.join(blobs, prefix.name);
    for (const entry of await fs.readdir(directory, {
      withFileTypes: true,
      encoding: "utf8",
    })) {
      if (
        entry.isFile() &&
        /^[0-9a-f]{64}$/.test(entry.name) &&
        !referenced.has(entry.name)
      )
        await fs.unlink(path.join(directory, entry.name));
    }
  }
}

export class FileDurableAttemptStore {
  readonly #root: string;
  readonly #file: string;
  readonly #limits: DurableAttemptStoreLimits;
  #queue: Promise<unknown> = Promise.resolve();
  #projections: AttemptProjections = new Map();
  constructor(root: string, limits: DurableAttemptStoreLimits) {
    if (!path.isAbsolute(root))
      throw new Error("OBSERVABILITY_ATTEMPT_STORE_ROOT_NOT_ABSOLUTE");
    if (Object.values(limits).some((value) => !validLimit(value)))
      throw new Error("OBSERVABILITY_ATTEMPT_STORE_LIMIT_INVALID");
    this.#root = root;
    this.#file = path.join(root, "attempt-store.json");
    this.#limits = limits;
  }
  storageDirectory(): string {
    return this.#root;
  }
  #serial<T>(operation: () => Promise<T>): Promise<T> {
    const locked = () =>
      withDurableStoreLock(this.#file, async () => {
        await cleanupStaging(this.#root);
        return operation();
      });
    const result = this.#queue.then(locked, locked);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async #readState(): Promise<DurableAttemptStoreSnapshot> {
    const raw = await readDurableState<DurableAttemptStoreSnapshot|PersistedAttemptV2>(this.#file, EMPTY_STATE, this.#limits.maximumMetadataBytes);
    const {state,projections}=decodeAttemptState(raw,this.#root,this.#limits);
    this.#projections=projections;
    return state;
  }
  async #writeState(state:DurableAttemptStoreSnapshot):Promise<void> {
    this.#checkSize(state);
    await writeDurableState(this.#file,encodeAttemptState(state,this.#projections));
  }
  #checkSize(state: DurableAttemptStoreSnapshot): void {
    const encoded=encodeAttemptState(state,this.#projections);
    assertAttemptReplay(state, this.#root, this.#limits,this.#projections.size);
    if (
      Buffer.byteLength(canonicalJson(encoded)) >
      this.#limits.maximumMetadataBytes
    )
      throw new Error("OBSERVABILITY_ATTEMPT_METADATA_FULL");
  }
  async #reclaimExpiredEvidence(
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
        now - stagedAt < this.#limits.maximumPendingEvidenceAgeMs
      );
    });
    if (retained.length === state.evidence.length) return;
    state.evidence = retained;
    this.#checkSize(state);
    await this.#writeState(state);
    await cleanupUnreferencedBlobs(this.#root, state);
  }
  async storeEvidence(
    input: DurableEvidenceInput,
    bytes: Uint8Array,
  ): Promise<WorkerEvidenceRefV1> {
    const snapshot = structuredClone(input);
    requireIdentity(
      snapshot.pipelineRunId,
      "OBSERVABILITY_PIPELINE_RUN_ID_INVALID",
    );
    requireIdentity(snapshot.attemptId, "OBSERVABILITY_ATTEMPT_ID_INVALID");
    requireIdentity(snapshot.evidenceId, "OBSERVABILITY_EVIDENCE_ID_INVALID");
    requireIdentity(snapshot.type, "OBSERVABILITY_EVIDENCE_TYPE_INVALID");
    requireIdentity(
      snapshot.mediaType,
      "OBSERVABILITY_EVIDENCE_MEDIA_TYPE_INVALID",
    );
    if (
      !Number.isSafeInteger(snapshot.claimGeneration) ||
      snapshot.claimGeneration < 1
    )
      throw new Error("OBSERVABILITY_CLAIM_GENERATION_INVALID");
    validatePipelineObservabilityContract(
      "producerIdentity",
      snapshot.producer,
    );
    const content = Uint8Array.from(bytes);
    if (content.byteLength > this.#limits.maximumEvidenceObjectBytes)
      throw new Error("OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE");
    return this.#serial(async () => {
      const state = await this.#readState();
      await this.#reclaimExpiredEvidence(state);
      await cleanupUnreferencedBlobs(this.#root, state);
      const existing = state.evidence.find(
        (item) =>
          item.pipelineRunId === snapshot.pipelineRunId &&
          item.attemptId === snapshot.attemptId &&
          item.claimGeneration === snapshot.claimGeneration &&
          item.evidenceId === snapshot.evidenceId,
      );
      const contentDigest = digest(content);
      if (existing) {
        if (
          existing.artifact.contentDigest !== contentDigest ||
          existing.type !== snapshot.type ||
          existing.mediaType !== snapshot.mediaType ||
          !sameProducer(existing.producer, snapshot.producer)
        )
          throw new Error("OBSERVABILITY_EVIDENCE_IDENTITY_CONFLICT");
        return structuredClone({
          evidenceId: existing.evidenceId,
          type: existing.type,
          artifact: existing.artifact,
        });
      }
      const total = state.evidence.reduce(
        (sum, item) => sum + item.artifact.sizeBytes,
        0,
      );
      if (
        state.evidence.length >= this.#limits.maximumEvidenceObjects ||
        total + content.byteLength > this.#limits.maximumEvidenceBytes
      )
        throw new Error("OBSERVABILITY_EVIDENCE_STORE_FULL");
      const hex = contentDigest.slice(7);
      const destination = path.join(this.#root, "blobs", hex.slice(0, 2), hex);
      const artifact = {
        artifactId: `artifact:${hex}`,
        type: snapshot.type,
        mediaType: snapshot.mediaType,
        contentDigest,
        sizeBytes: content.byteLength,
        storageUrl: pathToFileURL(destination).href,
      };
      const metadata: DurableEvidenceMetadata = {
        ...snapshot,
        artifact,
        stagedAt: new Date().toISOString(),
      };
      const candidate = { ...state, evidence: [...state.evidence, metadata] };
      this.#checkSize(candidate);
      await durableBlob(this.#root, contentDigest, content);
      await this.#writeState(candidate);
      return structuredClone({
        evidenceId: snapshot.evidenceId,
        type: snapshot.type,
        artifact,
      });
    });
  }
  async storeResult(
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
    return this.#serial(async () => {
      const state = await this.#readState();
      await this.#reclaimExpiredEvidence(state);
      await cleanupUnreferencedBlobs(this.#root, state);
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
      const existing = state.results.find(
        (item) =>
          item.pipelineRunId === pipelineRunId &&
          item.attemptId === snapshot.attemptId &&
          item.claimGeneration === snapshot.claimGeneration,
      );
      if (existing) {
        if (
          existing.result.resultDigest !== snapshot.resultDigest ||
          canonicalJson(existing.completionIntent) !== canonicalJson(intent) ||
          existing.planId !== (ownerSnapshot?.planId ?? null) ||
          existing.nodeId !== (ownerSnapshot?.nodeId ?? null)
        )
          throw new Error("OBSERVABILITY_RESULT_IDENTITY_CONFLICT");
        if (existing.storedAt === null) {
          existing.storedAt = new Date().toISOString();
          this.#checkSize(state);
          await this.#writeState(state);
        }
        return structuredClone(existing);
      }
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
      if (state.results.length - this.#projections.size >= this.#limits.maximumResults)
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
      this.#checkSize({
        ...state,
        results: [...state.results, reservedCommit],
      });
      await this.#writeState(pending);
      const committed: DurableResultMetadata = {
        ...metadata,
        storedAt: new Date().toISOString(),
      };
      const committedState = {
        ...state,
        results: [...state.results, committed],
      };
      this.#checkSize(committedState);
      await this.#writeState(committedState);
      return structuredClone(committed);
    });
  }
  async resumeCompletion(
    pipelineRunId: string,
    attemptId: string,
    claimGeneration: number,
    admission: FileObservabilityAdmissionStore,
  ): Promise<ProducerClosureV1> {
    return this.#serial(async () => {
      const state = await this.#readState();
      await this.#reclaimExpiredEvidence(state);
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
      return this.#storeClosureUnlocked(
        state,
        stored.completionIntent.closure,
        admitted,
      );
    });
  }
  /** Manual compaction of the redundant admission copy; result/evidence stay authoritative. */
  async retireAdmissionCompletion(
    admission: FileObservabilityAdmissionStore,
    input: {pipelineRunId:string;attemptId:string;claimGeneration:number;recordDigest:string;operationId:string;actor:string;authority:AdmissionRetiredEntry['authority']},
    authorize:()=>Promise<void>,
  ): Promise<{newlyRetired:boolean;releasedBytes:number}> {
    const scope=structuredClone(input);
    if(path.resolve(admission.storageDirectory())===path.resolve(this.#root))throw new Error('OBSERVABILITY_RETIREMENT_STORE_OVERLAP');
    return this.#serial(async()=>{
      const state=await this.#readState();
      const source=await completionRetirementSource(state,scope,this.#file,this.#limits.maximumMetadataBytes);
      const issues=await admission.observabilityIssues(scope.pipelineRunId);
      if(issues.missingRanges.length || issues.unresolvedItems.length)throw new Error('OBSERVABILITY_RETIREMENT_INCOMPLETE');
      return admission.retireCompletion({authority:scope.authority,operationId:scope.operationId,actor:scope.actor,recordDigest:scope.recordDigest,source},authorize);
    });
  }
  /** Manual removal of only a duplicate payload, behind the canonical consumer's fence. */
  async retireImportedResult(
    input:AttemptRetirementIntent,
    withCheckpointFence:(operation:()=>{newlyRetired:boolean;releasedBytes:number})=>{newlyRetired:boolean;releasedBytes:number},
    authorize:()=>void,
  ):Promise<{newlyRetired:boolean;releasedBytes:number}> {
    const intent=structuredClone(input);
    assertAttemptRetirementIntent(intent,this.#root);
    return this.#serial(async()=>{
      const state=await this.#readState(),key=attemptProjectionKey(intent);
      const existing=this.#projections.get(key);
      authorize();
      // Async source/evidence checks finish before acquiring the synchronous
      // journal fence. Existing FileJournal appenders must not wait on an await.
      await completionRetirementSource(state,intent,this.#file,this.#limits.maximumMetadataBytes);
      return withCheckpointFence(()=>{
      authorize();
      if(existing) {
        if(canonicalJson(existing.resultReference.intent)!==canonicalJson(intent))throw new Error('OBSERVABILITY_RESULT_RETIREMENT_CONFLICT');
        return {newlyRetired:false,releasedBytes:0};
      }
      const before=readAttemptJournalPrefix(this.#file,this.#limits.maximumMetadataBytes);
      if(attemptStoreDigest(before)!==intent.expectedStoreDigest)throw new Error('OBSERVABILITY_RESULT_RETIREMENT_STORE_CHANGED');
      const item=state.results.find(result=>attemptProjectionKey(result)===key);
      if(!item||item.result.resultDigest!==intent.resultDigest||!item.storedAt)throw new Error('OBSERVABILITY_RESULT_RETIREMENT_UNCONFIRMED');
      // Reuse the original full completion/evidence/closure validation. Never fabricate an ACK.
      const projected=createAttemptProjection(item,intent,this.#root,this.#limits.maximumMetadataBytes);
      this.#projections.set(key,projected);
      this.#checkSize(state);
      const releasedBytes=before.length-Buffer.byteLength(canonicalJson(encodeAttemptState(state,this.#projections)));
      if(releasedBytes<=0)throw new Error('OBSERVABILITY_RESULT_RETIREMENT_NOT_SMALLER');
      authorize();
      replaceAttemptProjectionSync(this.#file,encodeAttemptState(state,this.#projections));
      return {newlyRetired:true,releasedBytes};
      });
    });
  }
  async #storeClosureUnlocked(
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
    if (state.closures.length >= this.#limits.maximumClosures)
      throw new Error("OBSERVABILITY_CLOSURE_STORE_FULL");
    const candidate = { ...state, closures: [...state.closures, snapshot] };
    this.#checkSize(candidate);
    await this.#writeState(candidate);
    return structuredClone(snapshot);
  }
  async storeClosure(
    closure: ProducerClosureV1,
    admission: FileObservabilityAdmissionStore,
  ): Promise<ProducerClosureV1> {
    const snapshot = structuredClone(closure);
    validatePipelineObservabilityContract("producerClosure", snapshot);
    const admitted = await admission.admittedRecords();
    return this.#serial(async () => {
      const state = await this.#readState();
      await this.#reclaimExpiredEvidence(state);
      return this.#storeClosureUnlocked(state, snapshot, admitted);
    });
  }
  async evaluateCompleteness(
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
    const unresolvedSnapshot = [
      ...durableIssues.unresolvedItems,
      ...structuredClone(unresolvedItems),
    ].filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.itemId === item.itemId) ===
        index,
    );
    const admittedRecords = await admission.admittedTail(pipelineRunId, 1);
    return this.#serial(async () => {
      const state = await this.#readState();
      await this.#reclaimExpiredEvidence(state);
      const requiredClosureIds = requirements.map((item) => item.closureId);
      if (new Set(requiredClosureIds).size !== requiredClosureIds.length)
        throw new Error("OBSERVABILITY_REQUIRED_CLOSURE_DUPLICATE");
      const admittedClosureIds: string[] = [];
      const evidenceItems: UnresolvedObservabilityItemV1[] = [];
      for (const requirement of requirements) {
        const closure = state.closures.find(
          (item) =>
            item.pipelineRunId === pipelineRunId &&
            item.closureId === requirement.closureId &&
            sameProducer(item.producer, requirement.producer),
        );
        if (!closure) continue;
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
              const bytes = await fs.readFile(
                new URL(metadata.artifact.storageUrl),
              );
              if (
                bytes.byteLength !== metadata.artifact.sizeBytes ||
                digest(bytes) !== metadata.artifact.contentDigest
              )
                reasonCode = "evidence-corrupt";
            } catch {
              reasonCode = "evidence-unavailable";
            }
          }
          if (reasonCode) {
            valid = false;
            evidenceItems.push({
              itemId: `evidence:${createHash("sha256").update(evidenceId).digest("hex")}`,
              kind: "missing-evidence",
              producer: requirement.producer,
              subjectId: evidenceId,
              reasonCode,
            });
          }
        }
        if (valid) admittedClosureIds.push(requirement.closureId);
      }
      const missingClosureIds = requiredClosureIds.filter(
        (id) => !admittedClosureIds.includes(id),
      );
      const closureItems = missingClosureIds.map((id) => {
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
      const allItems = [
        ...closureItems,
        ...evidenceItems,
        ...unresolvedSnapshot,
      ].filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.itemId === item.itemId) ===
          index,
      );
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
    });
  }
  async snapshot(): Promise<Readonly<DurableAttemptStoreSnapshot>> {
    return this.#serial(async () => {
      const state = await this.#readState();
      await this.#reclaimExpiredEvidence(state);
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
export function scopedEvidenceId(
  attemptId: string,
  claimGeneration: number,
  evidenceId: string,
): string {
  return `evidence:${createHash("sha256").update(canonicalJson({ attemptId, claimGeneration, evidenceId })).digest("hex")}`;
}
