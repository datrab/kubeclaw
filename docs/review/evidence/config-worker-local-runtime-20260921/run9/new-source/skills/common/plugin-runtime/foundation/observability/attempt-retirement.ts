import path from "node:path";
import { canonicalJson } from "@kubeclaw/pipeline-observability-contract";
import {
  closureKey,
  closureIntentDigest,
  type ClosureRetirementIntent,
  type ClosureReference,
} from "./closure-projection.ts";
import {
  completionRetirementSource,
  type AdmissionRetiredEntry,
} from "./admission-retirement.ts";
import {
  createAttemptProjection,
  attemptProjectionKey,
  attemptStoreDigest,
  assertAttemptRetirementIntent,
  readAttemptJournalPrefix,
  replaceAttemptProjectionSync,
  encodeAttemptState,
  type AttemptRetirementIntent,
} from "./attempt-projection.ts";
import { assertAttemptReplay } from "./attempt-replay.ts";
import type { ProducerClosureV1 } from "@kubeclaw/pipeline-observability-contract";
import type { DurableAttemptStoreSnapshot } from "./durable-attempts.ts";
import type { ProjectedResultMetadata } from "./attempt-projection.ts";
import type { AttemptState } from "./attempt-state.ts";
import type { FileObservabilityAdmissionStore } from "./durable-delivery.ts";
export async function retireAdmissionCompletion(
  store: AttemptState,
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
  const scope = structuredClone(input);
  if (path.resolve(admission.storageDirectory()) === path.resolve(store.root))
    throw new Error("OBSERVABILITY_RETIREMENT_STORE_OVERLAP");
  return store.serial(async () => {
    const state = await store.readState();
    const source = await completionRetirementSource(
      state,
      scope,
      store.file,
      store.limits.maximumMetadataBytes,
    );
    const issues = await admission.observabilityIssues(scope.pipelineRunId);
    if (issues.missingRanges.length || issues.unresolvedItems.length)
      throw new Error("OBSERVABILITY_RETIREMENT_INCOMPLETE");
    return admission.retireCompletion(
      {
        authority: scope.authority,
        operationId: scope.operationId,
        actor: scope.actor,
        recordDigest: scope.recordDigest,
        source,
      },
      authorize,
    );
  });
}
export async function retireImportedResult(
  store: AttemptState,
  input: AttemptRetirementIntent,
  withCheckpointFence: CheckpointFence,
  authorize: () => void,
): Promise<{ newlyRetired: boolean; releasedBytes: number }> {
  const intent = structuredClone(input);
  assertAttemptRetirementIntent(intent, store.root);
  return store.serial(async () => {
    const state = await store.readState(),
      key = attemptProjectionKey(intent);
    const existing = store.projections.get(key);
    authorize();
    // Async source/evidence checks finish before acquiring the synchronous
    // journal fence. Existing FileJournal appenders must not wait on an await.
    await completionRetirementSource(
      state,
      intent,
      store.file,
      store.limits.maximumMetadataBytes,
    );
    return withCheckpointFence(() =>
      commitImportedResult(store, state, intent, existing, authorize),
    );
  });
}
export async function retireImportedClosure(
  store: AttemptState,
  input: ClosureRetirementIntent,
  withCheckpointFence: CheckpointFence,
  authorize: () => void,
): Promise<{ newlyRetired: boolean; releasedBytes: number }> {
  const intent = structuredClone(input),
    { closureDigest, ...resultIntent } = intent;
  assertAttemptRetirementIntent(resultIntent, store.root);
  if (!/^sha256:[a-f0-9]{64}$/u.test(closureDigest))
    throw new Error("OBSERVABILITY_CLOSURE_RETIREMENT_DIGEST");
  return store.serial(async () => {
    const state = await store.readState(),
      key = attemptProjectionKey(intent),
      result = store.projections.get(key);
    const closure = result?.completionIntent?.closure;
    if (!result || !closure || closure.closureDigest !== closureDigest)
      throw new Error("OBSERVABILITY_CLOSURE_RESULT_PROJECTION_REQUIRED");
    const source = result.resultReference.intent;
    for (const field of [
      "resultDigest",
      "recordDigest",
      "journalSequence",
      "journalHash",
    ] as const) {
      if (source[field] !== intent[field])
        throw new Error("OBSERVABILITY_CLOSURE_RETIREMENT_SOURCE_CHANGED");
    }
    authorize();
    await completionRetirementSource(
      state,
      intent,
      store.file,
      store.limits.maximumMetadataBytes,
    );
    return withCheckpointFence(() =>
      commitImportedClosure(store, state, intent, closure, authorize),
    );
  });
}

interface RetirementOutcome {
  newlyRetired: boolean;
  releasedBytes: number;
}
type CheckpointFence = (
  operation: () => RetirementOutcome,
) => RetirementOutcome;

function commitImportedResult(
  store: AttemptState,
  state: DurableAttemptStoreSnapshot,
  intent: AttemptRetirementIntent,
  existing: ProjectedResultMetadata | undefined,
  authorize: () => void,
): RetirementOutcome {
  const key = attemptProjectionKey(intent);
  authorize();
  if (existing) {
    if (
      canonicalJson(existing.resultReference.intent) !== canonicalJson(intent)
    )
      throw new Error("OBSERVABILITY_RESULT_RETIREMENT_CONFLICT");
    return { newlyRetired: false, releasedBytes: 0 };
  }
  const before = readAttemptJournalPrefix(
    store.file,
    store.limits.maximumMetadataBytes,
  );
  if (attemptStoreDigest(before) !== intent.expectedStoreDigest)
    throw new Error("OBSERVABILITY_RESULT_RETIREMENT_STORE_CHANGED");
  const item = state.results.find(
    (result) => attemptProjectionKey(result) === key,
  );
  if (
    !item ||
    item.result.resultDigest !== intent.resultDigest ||
    !item.storedAt
  )
    throw new Error("OBSERVABILITY_RESULT_RETIREMENT_UNCONFIRMED");
  // Reuse the original full completion/evidence/closure validation. Never fabricate an ACK.
  const projected = createAttemptProjection(
    item,
    intent,
    store.root,
    store.limits.maximumMetadataBytes,
  );
  store.projections.set(key, projected);
  store.checkSize(state);
  const releasedBytes =
    before.length -
    Buffer.byteLength(
      canonicalJson(
        encodeAttemptState(state, store.projections, store.closureProjections),
      ),
    );
  if (releasedBytes <= 0)
    throw new Error("OBSERVABILITY_RESULT_RETIREMENT_NOT_SMALLER");
  authorize();
  replaceAttemptProjectionSync(
    store.file,
    encodeAttemptState(state, store.projections, store.closureProjections),
  );
  return { newlyRetired: true, releasedBytes };
}

function commitImportedClosure(
  store: AttemptState,
  state: DurableAttemptStoreSnapshot,
  intent: ClosureRetirementIntent,
  closure: ProducerClosureV1,
  authorize: () => void,
): RetirementOutcome {
  const key = attemptProjectionKey(intent);
  authorize();
  const existing = store.closureProjections.get(closureKey(closure));
  if (existing) {
    if (existing.intentDigest !== closureIntentDigest(intent))
      throw new Error("OBSERVABILITY_CLOSURE_RETIREMENT_CONFLICT");
    return { newlyRetired: false, releasedBytes: 0 };
  }
  const before = readAttemptJournalPrefix(
    store.file,
    store.limits.maximumMetadataBytes,
  );
  if (attemptStoreDigest(before) !== intent.expectedStoreDigest)
    throw new Error("OBSERVABILITY_CLOSURE_RETIREMENT_STORE_CHANGED");
  const reference: ClosureReference = {
    schemaVersion: "attempt-closure-reference.v1",
    resultKey: key,
    closureDigest: intent.closureDigest,
    operationId: intent.operationId,
    actor: intent.actor,
    intentDigest: closureIntentDigest(intent),
  };
  const references = new Map(store.closureProjections);
  references.set(closureKey(closure), reference);
  const encoded = encodeAttemptState(state, store.projections, references);
  assertAttemptReplay(
    state,
    store.root,
    store.limits,
    store.projections.size,
    references.size,
  );
  const afterBytes = Buffer.byteLength(canonicalJson(encoded)),
    releasedBytes = before.length - afterBytes;
  if (afterBytes > store.limits.maximumMetadataBytes)
    throw new Error("OBSERVABILITY_ATTEMPT_METADATA_FULL");
  if (releasedBytes <= 0)
    throw new Error("OBSERVABILITY_CLOSURE_RETIREMENT_NOT_SMALLER");
  authorize();
  replaceAttemptProjectionSync(store.file, encoded);
  store.closureProjections = references;
  return { newlyRetired: true, releasedBytes };
}
