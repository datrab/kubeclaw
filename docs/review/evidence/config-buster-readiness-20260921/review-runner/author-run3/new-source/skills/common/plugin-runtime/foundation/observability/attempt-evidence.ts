import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { WorkerEvidenceRefV1 } from "@kubeclaw/pipeline-worker-core-contract";
import { ensureDirectoryDurable } from "./durable-delivery.ts";
import {
  canonicalJson,
  validatePipelineObservabilityContract,
  type ProducerIdentityV1,
} from "@kubeclaw/pipeline-observability-contract";
import type {
  DurableAttemptStoreLimits,
  DurableEvidenceInput,
  DurableEvidenceMetadata,
  DurableAttemptStoreSnapshot,
} from "./durable-attempts.ts";
import type { AttemptState } from "./attempt-state.ts";
export function requireIdentity(value: string, code: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 512)
    throw new Error(code);
}

export function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function sameProducer(
  left: ProducerIdentityV1,
  right: ProducerIdentityV1,
): boolean {
  return (
    left.producerId === right.producerId &&
    left.bootId === right.bootId &&
    left.producerType === right.producerType
  );
}

export async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function durableBlob(
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

export async function cleanupStaging(root: string): Promise<void> {
  const staging = path.join(root, "staging");
  await fs.mkdir(staging, { recursive: true });
  for (const entry of await fs.readdir(staging, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".tmp"))
      await fs.unlink(path.join(staging, entry.name));
  }
}

export async function cleanupUnreferencedBlobs(
  root: string,
  state: DurableAttemptStoreSnapshot,
): Promise<void> {
  const blobs = path.join(root, "blobs");
  const referenced = new Set(
    state.evidence.map((item) => item.artifact.contentDigest.slice(7)),
  );
  let prefixes: Dirent<string>[] = [];
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

export function scopedEvidenceId(
  attemptId: string,
  claimGeneration: number,
  evidenceId: string,
): string {
  return `evidence:${createHash("sha256").update(canonicalJson({ attemptId, claimGeneration, evidenceId })).digest("hex")}`;
}
export async function storeEvidence(
  store: AttemptState,
  input: DurableEvidenceInput,
  bytes: Uint8Array,
): Promise<WorkerEvidenceRefV1> {
  const snapshot = structuredClone(input);
  validateEvidenceInput(snapshot);
  const content = Uint8Array.from(bytes);
  if (content.byteLength > store.limits.maximumEvidenceObjectBytes)
    throw new Error("OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE");
  return store.serial(() => persistEvidence(store, snapshot, content));
}

function validateEvidenceInput(snapshot: DurableEvidenceInput): void {
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
  validatePipelineObservabilityContract("producerIdentity", snapshot.producer);
}

async function persistEvidence(
  store: AttemptState,
  snapshot: DurableEvidenceInput,
  content: Uint8Array,
): Promise<WorkerEvidenceRefV1> {
  const state = await store.readState();
  await store.reclaimExpiredEvidence(state);
  await cleanupUnreferencedBlobs(store.root, state);
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
  assertEvidenceCapacity(state, store.limits, content);
  const hex = contentDigest.slice(7);
  const destination = path.join(store.root, "blobs", hex.slice(0, 2), hex);
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
  store.checkSize(candidate);
  await durableBlob(store.root, contentDigest, content);
  await store.writeState(candidate);
  return structuredClone({
    evidenceId: snapshot.evidenceId,
    type: snapshot.type,
    artifact,
  });
}

function assertEvidenceCapacity(
  state: DurableAttemptStoreSnapshot,
  limits: DurableAttemptStoreLimits,
  content: Uint8Array,
): void {
  const total = state.evidence.reduce(
    (sum, item) => sum + item.artifact.sizeBytes,
    0,
  );
  if (
    state.evidence.length >= limits.maximumEvidenceObjects ||
    total + content.byteLength > limits.maximumEvidenceBytes
  )
    throw new Error("OBSERVABILITY_EVIDENCE_STORE_FULL");
}
