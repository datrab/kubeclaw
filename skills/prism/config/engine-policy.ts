import type { PrismEngineSettings } from '@kubeclaw/plugin-foundation/config/swarm';

/** Closed snapshot codec shared by the actual engine and assigned child receiver. */
export function readPrismEnginePolicy(value: unknown): PrismEngineSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'cache,maximumAssetSourceCharacters,maximumIngestTextCharacters') throw new Error('PRISM_ENGINE_POLICY_REQUIRED');
  const policy = value as PrismEngineSettings;
  if (!policy.cache || typeof policy.cache !== 'object' || Array.isArray(policy.cache)
    || Object.keys(policy.cache).sort().join(',') !== 'maximumCompletedBytes,maximumCompletedEntries,maximumInFlight') throw new Error('PRISM_ENGINE_CACHE_LIMIT_INVALID');
  for (const size of Object.values(policy.cache)) if (!Number.isSafeInteger(size) || size < 1) throw new Error('PRISM_ENGINE_CACHE_LIMIT_INVALID');
  for (const size of [policy.maximumIngestTextCharacters, policy.maximumAssetSourceCharacters]) {
    if (!Number.isSafeInteger(size) || size < 1) throw new Error('PRISM_ENGINE_INPUT_LIMIT_INVALID');
  }
  return Object.freeze({ cache: Object.freeze({ ...policy.cache }), maximumIngestTextCharacters: policy.maximumIngestTextCharacters,
    maximumAssetSourceCharacters: policy.maximumAssetSourceCharacters });
}
