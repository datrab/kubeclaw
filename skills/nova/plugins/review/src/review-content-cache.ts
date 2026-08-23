import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
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
  readonly schemaVersion: 'review-content-cache.v1';
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

export function reviewCacheKey(
  unitDigest: `sha256:${string}`, identity: ReviewCacheIdentity,
): `sha256:${string}` { return sha256Text(canonicalJson({ unitDigest, identity })); }

export function buildReviewCacheRecord(
  unit: ReviewCacheUnit, identity: ReviewCacheIdentity, value: unknown,
): ReviewCacheRecord {
  const cacheKey = reviewCacheKey(unit.digest, identity);
  const valueDigest = sha256Text(canonicalJson(value));
  const unsigned = {
    schemaVersion: 'review-content-cache.v1' as const, cacheKey,
    unitId: unit.id, unitDigest: unit.digest, identity, value, valueDigest,
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}

function validCacheIdentity(
  record: Readonly<Record<string, unknown>>, unit: ReviewCacheUnit, identity: ReviewCacheIdentity,
): boolean {
  return [
    record.schemaVersion === 'review-content-cache.v1', record.unitId === unit.id,
    record.unitDigest === unit.digest, record.cacheKey === reviewCacheKey(unit.digest, identity),
    canonicalJson(record.identity) === canonicalJson(identity),
  ].every(Boolean);
}

function validValueDigest(record: Readonly<Record<string, unknown>>): boolean {
  return typeof record.valueDigest === 'string'
    && record.valueDigest === sha256Text(canonicalJson(record.value));
}

function validRecordDigest(record: Readonly<Record<string, unknown>>): boolean {
  const { digest: _digest, ...unsigned } = record;
  return typeof record.digest === 'string' && record.digest === sha256Text(canonicalJson(unsigned));
}

export function parseReviewCacheRecord(
  value: unknown, unit: ReviewCacheUnit, identity: ReviewCacheIdentity,
): ReviewCacheRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review cache record is invalid');
  const record = value as Readonly<Record<string, unknown>>;
  if (!validCacheIdentity(record, unit, identity)) throw new Error('review cache identity is invalid');
  if (!validValueDigest(record)) throw new Error('review cache value digest is invalid');
  if (!validRecordDigest(record)) throw new Error('review cache record digest is invalid');
  return record as unknown as ReviewCacheRecord;
}

export async function runWithReviewCache<T>(
  units: readonly ReviewCacheUnit[], identity: ReviewCacheIdentity, store: ReviewCacheStore,
  execute: (misses: readonly ReviewCacheUnit[]) => Promise<ReadonlyMap<string, T>>,
): Promise<ReviewCacheRun<T>> {
  const ordered = [...units].sort((left, right) => compareCodeUnits(left.id, right.id));
  if (new Set(ordered.map(({ id }) => id)).size !== ordered.length) {
    throw new ReviewContentCacheIntegrityError('review cache unit IDs are duplicated');
  }
  const values = new Map<string, T>(), misses: ReviewCacheUnit[] = [];
  const cacheKeys = new Map<string, `sha256:${string}`>(); let hits = 0;
  for (const unit of ordered) {
    const key = reviewCacheKey(unit.digest, identity); cacheKeys.set(unit.id, key);
    const cached = await store.read(key);
    if (cached === undefined) { misses.push(unit); continue; }
    let parsed: ReviewCacheRecord;
    try { parsed = parseReviewCacheRecord(cached, unit, identity); } catch (error) {
      throw new ReviewContentCacheIntegrityError(error instanceof Error ? error.message : String(error));
    }
    values.set(unit.id, parsed.value as T); hits += 1;
  }
  const executed = misses.length === 0 ? new Map<string, T>() : await execute(Object.freeze(misses));
  for (const unit of misses) {
    if (!executed.has(unit.id)) {
      throw new ReviewContentCacheIntegrityError(`review cache execution result is missing: ${unit.id}`);
    }
    const value = executed.get(unit.id) as T; values.set(unit.id, value);
    await store.write(buildReviewCacheRecord(unit, identity, value));
  }
  if ([...executed.keys()].some((id) => !misses.some((unit) => unit.id === id))) {
    throw new ReviewContentCacheIntegrityError('review cache execution returned an unknown unit');
  }
  return Object.freeze({ values, hits, misses: misses.length, cacheKeys });
}
