import { canonicalJson, sha256Text,
  type ArtifactRef, type AttemptIdentity, type CapabilityInvocation,
  type LifecycleEvent, type PluginDomainEvent } from '@kubeclaw/plugin-sdk';

import type { FileJournal } from '../state/journal.ts';
import type { AppendLifecycleEvent } from './stage-executor.ts';

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function sameAttempt(left: AttemptIdentity, right: AttemptIdentity): boolean {
  return left.runId === right.runId && left.stageId === right.stageId
    && left.attemptId === right.attemptId && left.attemptNumber === right.attemptNumber;
}

function validDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

export function artifactFromWrite(
  attempt: AttemptIdentity,
  request: CapabilityInvocation,
  response: Readonly<Record<string, unknown>>,
): ArtifactRef | undefined {
  if (request.payload.checkpoint !== true) return undefined;
  if (request.operation !== 'put_json') throw new Error('ARTIFACT_CHECKPOINT_OPERATION_INVALID');
  const artifact = record(response.artifact), producer = record(artifact?.producer);
  const serialized = canonicalJson(request.payload.value);
  if (!artifact || !producer
    || artifact.artifactId !== request.resource.canonicalId
    || artifact.namespace !== request.payload.namespace || artifact.mediaType !== request.payload.mediaType
    || !validDigest(artifact.digest) || artifact.digest !== sha256Text(serialized)
    || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes !== Buffer.byteLength(serialized)) {
    throw new Error(`ARTIFACT_CHECKPOINT_RESPONSE_INVALID:${request.resource.canonicalId}`);
  }
  const candidate = artifact as unknown as ArtifactRef;
  if (!sameAttempt(candidate.producer, attempt)) {
    throw new Error(`ARTIFACT_CHECKPOINT_PRODUCER_INVALID:${request.resource.canonicalId}`);
  }
  return candidate;
}

function exactArtifact(left: ArtifactRef, right: ArtifactRef): boolean {
  return left.artifactId === right.artifactId && left.namespace === right.namespace
    && left.mediaType === right.mediaType && left.digest === right.digest && left.sizeBytes === right.sizeBytes
    && sameAttempt(left.producer, right.producer);
}

function conflictingArtifact(left: ArtifactRef, right: ArtifactRef): boolean {
  return left.artifactId === right.artifactId && sameAttempt(left.producer, right.producer)
    && !exactArtifact(left, right);
}

export class ArtifactCheckpointRecorder {
  readonly #append: AppendLifecycleEvent;
  readonly #recorded: ArtifactRef[];

  constructor(journal: FileJournal<LifecycleEvent | PluginDomainEvent>, append: AppendLifecycleEvent) {
    // Pipeline runners are created only inside withRunMutationLock. Its renewable
    // cross-process lease leaves one mutable owner for a run journal, while this
    // in-memory index serializes concurrent checkpoint completions in that owner.
    this.#append = append; this.#recorded = this.#read(journal);
  }

  checkpoint(artifact: ArtifactRef): void { this.#record(artifact, true); }

  result(artifact: ArtifactRef): void { this.#record(artifact, false); }

  #record(artifact: ArtifactRef, checkpoint: boolean): void {
    if (this.#recorded.some((candidate) => exactArtifact(candidate, artifact))) return;
    if (this.#recorded.some((candidate) => conflictingArtifact(candidate, artifact))) {
      throw new Error(`ARTIFACT_CHECKPOINT_CONFLICT:${artifact.producer.runId}:${artifact.producer.stageId}:${artifact.artifactId}`);
    }
    this.#append('artifact.created', {
      runId: artifact.producer.runId,
      stageId: artifact.producer.stageId,
      artifactId: artifact.artifactId,
    }, {
      namespace: artifact.namespace,
      mediaType: artifact.mediaType,
      digest: artifact.digest,
      sizeBytes: artifact.sizeBytes,
      artifact: structuredClone(artifact),
      ...(checkpoint ? { checkpoint: true } : {}),
    }, artifact.producer.attemptId);
    this.#recorded.push(structuredClone(artifact));
  }

  artifacts(runId?: string, stageId?: string): ArtifactRef[] {
    return this.#recorded.filter((artifact) => (
      (runId === undefined || artifact.producer.runId === runId)
      && (stageId === undefined || artifact.producer.stageId === stageId)
    )).map((artifact) => structuredClone(artifact));
  }

  #read(journal: FileJournal<LifecycleEvent | PluginDomainEvent>): ArtifactRef[] {
    const artifacts: ArtifactRef[] = [];
    for (const { entry } of journal.records()) {
      if (entry.schemaVersion !== 'lifecycle-event.v2' || entry.type !== 'artifact.created') continue;
      const artifact = record(entry.payload.artifact);
      if (!artifact) continue;
      artifacts.push(structuredClone(artifact) as unknown as ArtifactRef);
    }
    return artifacts;
  }
}
