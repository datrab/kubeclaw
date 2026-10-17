/** Explicit source-process receiving policy. No environment or current Core reads. */
export interface SourceAcquisitionPolicy {
  readonly timeoutMs: number;
  readonly maximumMetadataBytes: number;
  readonly maximumStderrCharacters: number;
  readonly cleanupTimeoutMs: number;
  readonly forceKillAfterMs: number;
  readonly pollIntervalMs: number;
}

/** Frozen compatibility behavior for original callers; not a selected new generation. */
export const LEGACY_SOURCE_ACQUISITION_POLICY: SourceAcquisitionPolicy = Object.freeze({
  timeoutMs: 30_000, maximumMetadataBytes: 65_536, maximumStderrCharacters: 4096,
  cleanupTimeoutMs: 1500, forceKillAfterMs: 250, pollIntervalMs: 10,
});

/** Copy before any async work/spawn so caller mutation cannot change an admitted operation. */
export function captureSourceAcquisitionPolicy(value: SourceAcquisitionPolicy): SourceAcquisitionPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('NOVA_SOURCE_POLICY_INVALID');
  const keys = Object.keys(LEGACY_SOURCE_ACQUISITION_POLICY) as (keyof SourceAcquisitionPolicy)[];
  if (Object.keys(value).some(key => !keys.includes(key as keyof SourceAcquisitionPolicy))) throw new Error('NOVA_SOURCE_POLICY_UNKNOWN_FIELD');
  const result = {} as Record<keyof SourceAcquisitionPolicy, number>;
  for (const key of keys) {
    const item = value[key];
    if (!Number.isSafeInteger(item) || item < 1 || item > 2_147_483_647) throw new Error(`NOVA_SOURCE_POLICY_INVALID:${key}`);
    result[key] = item;
  }
  if (result.forceKillAfterMs >= result.cleanupTimeoutMs || result.pollIntervalMs > result.cleanupTimeoutMs) {
    throw new Error('NOVA_SOURCE_POLICY_INVALID:cleanupRelation');
  }
  return Object.freeze(result);
}
