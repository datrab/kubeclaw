import type { RemotePlanStatusV1 } from '@kubeclaw/pipeline-test-gate-contract';

/** Persisted authority selection: a missing V2 blob never selects a historical source. */
export type PreparedResultOrigin = null | { readonly kind: 'v2' } | {
  readonly kind: 'historical';
  readonly importId: string;
  readonly originalStoreDigest: string;
  readonly originalPayloadDigest: string;
};

export function assertPreparedResultOrigin(value: unknown,
  status: RemotePlanStatusV1): asserts value is PreparedResultOrigin {
  if (status.state !== 'completed') {
    if (value !== null) throw new Error('BUSTER_RESULT_ORIGIN_INVALID');
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('BUSTER_RESULT_ORIGIN_INVALID');
  }
  const origin = value as Exclude<PreparedResultOrigin, null>;
  const keys = Object.keys(origin).sort().join(',');
  if (origin.kind === 'v2' && keys === 'kind') return;
  if (origin.kind !== 'historical' || keys !== 'importId,kind,originalPayloadDigest,originalStoreDigest') {
    throw new Error('BUSTER_RESULT_ORIGIN_INVALID');
  }
  if (typeof origin.importId !== 'string' || !/^[a-f0-9]{32}$/u.test(origin.importId)
    || ![origin.originalStoreDigest, origin.originalPayloadDigest].every(digest => typeof digest === 'string' && /^sha256:[a-f0-9]{64}$/u.test(digest))) {
    throw new Error('BUSTER_RESULT_ORIGIN_INVALID');
  }
}
