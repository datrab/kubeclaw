import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ReviewBundle } from './review-bundle-contract.ts';
import { parseReviewBundle } from './review-bundle-parser.ts';

export interface ReviewBundleSnapshot {
  readonly bundle: ReviewBundle;
  readonly digest: `sha256:${string}`;
}

const OWNED_SNAPSHOTS = new WeakSet<object>();

export function snapshotReviewBundle(value: unknown): ReviewBundleSnapshot {
  const parsed = parseReviewBundle(value);
  if (!parsed.ok) throw new Error(`review bundle is invalid: ${parsed.error}`);
  const serialized = canonicalJson(parsed.value);
  const snapshot = Object.freeze({
    bundle: parsed.value,
    digest: sha256Text(serialized),
  });
  OWNED_SNAPSHOTS.add(snapshot);
  return snapshot;
}

export function isReviewBundleSnapshot(value: unknown): value is ReviewBundleSnapshot {
  if (!value || typeof value !== 'object' || !OWNED_SNAPSHOTS.has(value)) return false;
  const snapshot = value as ReviewBundleSnapshot;
  return Object.isFrozen(snapshot)
    && Object.isFrozen(snapshot.bundle)
    && snapshot.digest === sha256Text(canonicalJson(snapshot.bundle));
}
