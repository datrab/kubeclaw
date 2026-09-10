import { canonicalJson, portableJson, sha256Text, parseReviewCacheProfile, type ReviewCacheProfile } from '@kubeclaw/plugin-sdk';
import { compareCodeUnits } from './review-ordering.ts';

export interface ReviewCacheIdentity {
  readonly policyDigest: `sha256:${string}`;
  readonly reviewerProtocol: string;
  readonly reviewerModel: string;
  readonly reviewerRuntimeIdentityDigest: `sha256:${string}`;
  readonly evidenceVersion: string;
}

export interface ReviewCacheUnit { readonly id: string; readonly digest: `sha256:${string}` }

export interface ReviewCacheRecord {
  readonly schemaVersion: 'review-content-cache.v1' | 'review-content-cache.v2';
  readonly cacheKey: `sha256:${string}`;
  readonly unitId: string;
  readonly unitDigest: `sha256:${string}`;
  readonly identity: ReviewCacheIdentity;
  readonly value: unknown;
  readonly valueDigest: `sha256:${string}`;
  readonly digest: `sha256:${string}`;
}

export interface ReviewCacheStore {
  read(cacheKey: `sha256:${string}`): Promise<unknown | undefined>;
  write(record: ReviewCacheRecord): Promise<void>;
}

export interface ReviewCacheRun<T> {
  readonly values: ReadonlyMap<string, T>;
  readonly hits: number;
  readonly misses: number;
  readonly cacheKeys: ReadonlyMap<string, `sha256:${string}`>;
}

export class ReviewContentCacheIntegrityError extends Error {}
const CACHE_READ_CONCURRENCY = 16;

export function reviewCacheKey(
  unitDigest: `sha256:${string}`, identity: ReviewCacheIdentity,
): `sha256:${string}` { return sha256Text(canonicalJson({ unitDigest, identity })); }

export function buildReviewCacheRecord(
  unit: ReviewCacheUnit, identity: ReviewCacheIdentity, value: unknown, profile?: ReviewCacheProfile,
): ReviewCacheRecord {
  const current = profile === undefined ? undefined : parseReviewCacheProfile(profile);
  const serialize = current ? portableJson : canonicalJson;
  const cacheKey = reviewCacheKey(unit.digest, identity);
  const valueDigest = sha256Text(serialize(value));
  const unsigned = {
    schemaVersion: current ? 'review-content-cache.v2' as const : 'review-content-cache.v1' as const, cacheKey,
    unitId: unit.id, unitDigest: unit.digest, identity, value, valueDigest,
  };
  const record = Object.freeze({ ...unsigned, digest: sha256Text(serialize(unsigned)) });
  if (current) assertCurrentRecordShape(record);
  return record;
}

/** The owning v2 record contract is closed; historical v1 admission is unchanged. */
function assertCurrentRecordShape(record: Readonly<Record<string, unknown>>): void {
  portableJson(record);
  const exact = (value: Readonly<Record<string, unknown>>, fields: readonly string[]): boolean =>
    Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
  const identity = record.identity;
  if (!exact(record, ['schemaVersion', 'cacheKey', 'unitId', 'unitDigest', 'identity', 'value', 'valueDigest', 'digest'])
    || typeof record.unitId !== 'string' || !record.unitId
    || !identity || typeof identity !== 'object' || Array.isArray(identity)
    || !exact(identity as Record<string, unknown>, ['policyDigest', 'reviewerProtocol', 'reviewerModel', 'reviewerRuntimeIdentityDigest', 'evidenceVersion'])
    || !Object.values(identity).every(value => typeof value === 'string' && value.length > 0)
    || ![record.cacheKey, record.unitDigest, record.valueDigest, record.digest,
      (identity as ReviewCacheIdentity).policyDigest, (identity as ReviewCacheIdentity).reviewerRuntimeIdentityDigest]
      .every(value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value))) {
    throw new Error('review cache v2 contract is invalid');
  }
}

function recordSerializer(record: Readonly<Record<string, unknown>>): typeof canonicalJson {
  return record.schemaVersion === 'review-content-cache.v2' ? portableJson : canonicalJson;
}

function validCacheIdentity(
  record: Readonly<Record<string, unknown>>, unit: ReviewCacheUnit, identity: ReviewCacheIdentity,
): boolean {
  return [
    ['review-content-cache.v1', 'review-content-cache.v2'].includes(String(record.schemaVersion)), record.unitId === unit.id,
    record.unitDigest === unit.digest, record.cacheKey === reviewCacheKey(unit.digest, identity),
    recordSerializer(record)(record.identity) === recordSerializer(record)(identity),
  ].every(Boolean);
}

function validValueDigest(record: Readonly<Record<string, unknown>>): boolean {
  return typeof record.valueDigest === 'string'
    && record.valueDigest === sha256Text(recordSerializer(record)(record.value));
}

function validRecordDigest(record: Readonly<Record<string, unknown>>): boolean {
  const { digest: _digest, ...unsigned } = record;
  return typeof record.digest === 'string' && record.digest === sha256Text(recordSerializer(record)(unsigned));
}

export function parseReviewCacheRecord(
  value: unknown, unit: ReviewCacheUnit, identity: ReviewCacheIdentity,
): ReviewCacheRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review cache record is invalid');
  // Validate without invoking accessors or Proxy traps before selecting a codec.
  // This does not recanonicalize or change any legitimate historical JSON digest.
  portableJson(value);
  const record = value as Readonly<Record<string, unknown>>;
  const version = Object.getOwnPropertyDescriptor(record, 'schemaVersion');
  if (!version || !Object.hasOwn(version, 'value')) throw new Error('review cache version is invalid');
  if (version.value === 'review-content-cache.v2') assertCurrentRecordShape(record);
  if (!validCacheIdentity(record, unit, identity)) throw new Error('review cache identity is invalid');
  if (!validValueDigest(record)) throw new Error('review cache value digest is invalid');
  if (!validRecordDigest(record)) throw new Error('review cache record digest is invalid');
  return record as unknown as ReviewCacheRecord;
}

async function readCacheEntries(
  ordered: readonly ReviewCacheUnit[], cacheKeys: ReadonlyMap<string, `sha256:${string}`>, store: ReviewCacheStore,
): Promise<readonly unknown[]> {
  const output: unknown[] = new Array(ordered.length);
  const failures: ({ readonly error: unknown } | undefined)[] = new Array(ordered.length);
  let cursor = 0, halted = false;
  const worker = async (): Promise<void> => {
    while (!halted && cursor < ordered.length) {
      const index = cursor; cursor += 1;
      const unit = ordered[index];
      if (!unit) throw new ReviewContentCacheIntegrityError('review cache read index is invalid');
      try { output[index] = await store.read(cacheKeys.get(unit.id) as `sha256:${string}`); }
      catch (error) { failures[index] = { error }; halted = true; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CACHE_READ_CONCURRENCY, ordered.length) }, worker));
  const failure = failures.find((value) => value !== undefined);
  if (failure !== undefined) throw failure.error;
  return Object.freeze(output);
}

// eslint-disable-next-line max-lines-per-function, complexity -- Cache read, streaming checkpoint, and final completeness form one transaction.
export async function runWithReviewCache<T>(
  units: readonly ReviewCacheUnit[], identity: ReviewCacheIdentity, store: ReviewCacheStore,
  execute: (misses: readonly ReviewCacheUnit[], checkpoint: (unitId: string, value: T) => Promise<void>)
    => Promise<ReadonlyMap<string, T>>,
  reusable: (unit: ReviewCacheUnit, value: T) => boolean = () => true,
  profile?: ReviewCacheProfile,
): Promise<ReviewCacheRun<T>> {
  const selectedProfile = profile === undefined ? undefined : parseReviewCacheProfile(profile);
  const ordered = [...units].sort((left, right) => compareCodeUnits(left.id, right.id));
  if (new Set(ordered.map(({ id }) => id)).size !== ordered.length) {
    throw new ReviewContentCacheIntegrityError('review cache unit IDs are duplicated');
  }
  const values = new Map<string, T>(), misses: ReviewCacheUnit[] = [];
  const cacheKeys = new Map(ordered.map((unit) => [unit.id, reviewCacheKey(unit.digest, identity)]));
  const cachedEntries = await readCacheEntries(ordered, cacheKeys, store); let hits = 0;
  for (const [index, unit] of ordered.entries()) {
    const cached = cachedEntries[index];
    if (cached === undefined) { misses.push(unit); continue; }
    let parsed: ReviewCacheRecord;
    try { parsed = parseReviewCacheRecord(cached, unit, identity); } catch (error) {
      throw new ReviewContentCacheIntegrityError(error instanceof Error ? error.message : String(error));
    }
    if (parsed.schemaVersion !== (selectedProfile ? 'review-content-cache.v2' : 'review-content-cache.v1')) {
      throw new ReviewContentCacheIntegrityError('review cache record profile does not match its run');
    }
    if (!reusable(unit, parsed.value as T)) { misses.push(unit); continue; }
    values.set(unit.id, parsed.value as T); hits += 1;
  }
  const missingById = new Map(misses.map((unit) => [unit.id, unit])), checkpointed = new Set<string>();
  const checkpoint = async (unitId: string, value: T): Promise<void> => {
    const unit = missingById.get(unitId);
    if (!unit) throw new ReviewContentCacheIntegrityError(`review cache checkpoint returned an unknown unit: ${unitId}`);
    if (checkpointed.has(unitId)) throw new ReviewContentCacheIntegrityError(`review cache checkpoint duplicated a unit: ${unitId}`);
    if (reusable(unit, value)) await store.write(buildReviewCacheRecord(unit, identity, value, selectedProfile));
    checkpointed.add(unitId);
  };
  const executed = misses.length === 0 ? new Map<string, T>()
    : await execute(Object.freeze(misses), checkpoint);
  for (const unit of misses) {
    if (!executed.has(unit.id)) {
      throw new ReviewContentCacheIntegrityError(`review cache execution result is missing: ${unit.id}`);
    }
    const value = executed.get(unit.id) as T; values.set(unit.id, value);
    if (!checkpointed.has(unit.id) && reusable(unit, value)) await store.write(buildReviewCacheRecord(unit, identity, value, selectedProfile));
  }
  if ([...executed.keys()].some((id) => !misses.some((unit) => unit.id === id))) {
    throw new ReviewContentCacheIntegrityError('review cache execution returned an unknown unit');
  }
  return Object.freeze({ values, hits, misses: misses.length, cacheKeys });
}
