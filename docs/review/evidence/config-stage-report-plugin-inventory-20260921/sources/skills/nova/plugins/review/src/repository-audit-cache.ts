import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING, reviewCacheProfileFromContext,
  sha256Text, verifiedArtifactJsonText, type ArtifactRef, type AttemptIdentity,
  type PluginInvocationContext, type ReviewCacheProfile } from '@kubeclaw/plugin-sdk';

import type { ReviewCacheRecord, ReviewCacheStore } from './review-content-cache.ts';
import { compareCodeUnits } from './review-ordering.ts';

const CACHE_NAMESPACE = 'kubeclaw.review';
const CACHE_PREFIX = 'repository-review-cache:';

export class RepositoryAuditCacheIntegrityError extends Error {}

function cacheArtifactId(cacheKey: string): string { return `${CACHE_PREFIX}${cacheKey.slice(7)}`; }

function responseRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryAuditCacheIntegrityError('repository review cache adapter returned invalid output');
  }
  return value as Readonly<Record<string, unknown>>;
}

function outputArtifact(value: unknown): ArtifactRef {
  const artifact = responseRecord(value).artifact;
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new RepositoryAuditCacheIntegrityError('repository review cache adapter returned no artifact');
  }
  return artifact as ArtifactRef;
}

function sameProducer(artifact: ArtifactRef, context: PluginInvocationContext): boolean {
  const attempt = context.contract.lease?.attempt;
  return Boolean(attempt && artifact.producer.runId === attempt.runId
    && artifact.producer.stageId === attempt.stageId && artifact.producer.attemptId === attempt.attemptId
    && artifact.producer.attemptNumber === attempt.attemptNumber);
}

function trustedPriorCache(artifact: ArtifactRef, attempt: AttemptIdentity): boolean {
  return artifact.namespace === CACHE_NAMESPACE && artifact.mediaType === 'application/json'
    && artifact.artifactId.startsWith(CACHE_PREFIX)
    && artifact.producer.runId === attempt.runId && artifact.producer.stageId === attempt.stageId
    && artifact.producer.attemptNumber < attempt.attemptNumber;
}

export class RepositoryAuditArtifactCache implements ReviewCacheStore {
  readonly #profile: ReviewCacheProfile | undefined;
  readonly #context: PluginInvocationContext;
  readonly #available = new Map<string, ArtifactRef[]>();
  readonly #used = new Map<string, ArtifactRef>();

  constructor(context: PluginInvocationContext) {
    this.#context = context;
    this.#profile = reviewCacheProfileFromContext(context.contract);
    const attempt = context.contract.lease?.attempt;
    if (!attempt) throw new RepositoryAuditCacheIntegrityError('repository review cache requires an attempt identity');
    for (const artifact of context.contract.artifacts ?? []) {
      if (!trustedPriorCache(artifact, attempt)) continue;
      this.#assertEncoding(artifact);
      const values = this.#available.get(artifact.artifactId) ?? [];
      values.push(artifact); this.#available.set(artifact.artifactId, values);
    }
  }

  get profile(): ReviewCacheProfile | undefined { return this.#profile; }

  #assertEncoding(artifact: ArtifactRef): void {
    if (this.profile ? artifact.encoding !== PORTABLE_JSON_ENCODING : Object.hasOwn(artifact, 'encoding')) {
      throw new RepositoryAuditCacheIntegrityError(`repository review cache encoding does not match its run: ${artifact.artifactId}`);
    }
  }

  #assertRecordVersion(value: unknown): void {
    portableJson(value);
    if (responseRecord(value).schemaVersion !== (this.profile ? 'review-content-cache.v2' : 'review-content-cache.v1')) {
      throw new RepositoryAuditCacheIntegrityError('repository review cache record does not match its run');
    }
  }

  async read(cacheKey: `sha256:${string}`): Promise<unknown | undefined> {
    const artifactId = cacheArtifactId(cacheKey), candidates = this.#available.get(artifactId) ?? [];
    if (candidates.length === 0) return undefined;
    const digests = new Set(candidates.map(({ digest }) => digest));
    if (digests.size !== 1) throw new RepositoryAuditCacheIntegrityError(`conflicting repository review cache: ${artifactId}`);
    if (this.profile && new Set(candidates.map(({ sizeBytes }) => sizeBytes)).size !== 1) {
      throw new RepositoryAuditCacheIntegrityError(`conflicting repository review cache size: ${artifactId}`);
    }
    const artifact = [...candidates].sort(
      (left, right) => left.producer.attemptNumber - right.producer.attemptNumber,
    )[0] as ArtifactRef;
    const raw = await this.#context.invoke('artifacts.read', {
      operation: this.profile ? 'get_json_bytes' : 'get_json', resource: { type: 'artifact.object', canonicalId: artifactId },
      payload: { namespace: CACHE_NAMESPACE, digest: artifact.digest, ...(this.profile ? { reference: artifact } : {}) },
    });
    const response = responseRecord(raw);
    let serialized: string;
    try { serialized = this.profile ? verifiedArtifactJsonText(response, artifact) : canonicalJson(response.value); }
    catch (error) {
      throw new RepositoryAuditCacheIntegrityError(`repository review cache proof is invalid: ${artifactId}: ${String(error)}`);
    }
    if (response.digest !== artifact.digest || response.sizeBytes !== artifact.sizeBytes
      || sha256Text(serialized) !== artifact.digest || Buffer.byteLength(serialized) !== artifact.sizeBytes) {
      throw new RepositoryAuditCacheIntegrityError(`repository review cache proof is invalid: ${artifactId}`);
    }
    this.#assertRecordVersion(response.value);
    this.#used.set(artifactId, artifact);
    return response.value;
  }

  async write(record: ReviewCacheRecord): Promise<void> {
    this.#assertRecordVersion(record);
    const artifactId = cacheArtifactId(record.cacheKey), serialized = (this.profile ? portableJson : canonicalJson)(record);
    const raw = await this.#context.invoke('artifacts.write', {
      operation: 'put_json', resource: { type: 'artifact.object', canonicalId: artifactId },
      payload: { namespace: CACHE_NAMESPACE, mediaType: 'application/json', checkpoint: true, value: record,
        ...(this.profile ? { encoding: PORTABLE_JSON_ENCODING } : {}) },
    });
    const artifact = outputArtifact(raw);
    this.#assertEncoding(artifact);
    if (artifact.artifactId !== artifactId || artifact.namespace !== CACHE_NAMESPACE
      || artifact.mediaType !== 'application/json' || artifact.digest !== sha256Text(serialized)
      || artifact.sizeBytes !== Buffer.byteLength(serialized) || !sameProducer(artifact, this.#context)) {
      throw new RepositoryAuditCacheIntegrityError(`repository review cache write proof is invalid: ${artifactId}`);
    }
    this.#available.set(artifactId, [artifact]); this.#used.set(artifactId, artifact);
  }

  artifacts(): readonly ArtifactRef[] {
    return Object.freeze([...this.#used.values()].sort((left, right) => compareCodeUnits(left.artifactId, right.artifactId)));
  }
}
