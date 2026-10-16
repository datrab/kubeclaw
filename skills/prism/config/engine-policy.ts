import type { PrismEngineSettings, PrismRenderSettings } from '@kubeclaw/plugin-foundation/config/swarm';

/** Closed snapshot codec shared by the actual engine and assigned child receiver. */
export function readPrismEnginePolicy(value: unknown): PrismEngineSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['cache,maximumAssetSourceCharacters,maximumIngestTextCharacters', 'cache,maximumAssetSourceCharacters,maximumIngestTextCharacters,render,schemaVersion'].includes(Object.keys(value).sort().join(','))) throw new Error('PRISM_ENGINE_POLICY_REQUIRED');
  const policy = value as PrismEngineSettings;
  if (Object.hasOwn(policy, 'schemaVersion') && policy.schemaVersion !== 'prism-engine-policy.v2') throw new Error('PRISM_ENGINE_POLICY_REQUIRED');
  if (!policy.cache || typeof policy.cache !== 'object' || Array.isArray(policy.cache)
    || Object.keys(policy.cache).sort().join(',') !== 'maximumCompletedBytes,maximumCompletedEntries,maximumInFlight') throw new Error('PRISM_ENGINE_CACHE_LIMIT_INVALID');
  for (const size of Object.values(policy.cache)) if (!Number.isSafeInteger(size) || size < 1) throw new Error('PRISM_ENGINE_CACHE_LIMIT_INVALID');
  for (const size of [policy.maximumIngestTextCharacters, policy.maximumAssetSourceCharacters]) {
    if (!Number.isSafeInteger(size) || size < 1) throw new Error('PRISM_ENGINE_INPUT_LIMIT_INVALID');
  }
  return Object.freeze({ cache: Object.freeze({ ...policy.cache }), maximumIngestTextCharacters: policy.maximumIngestTextCharacters,
    maximumAssetSourceCharacters: policy.maximumAssetSourceCharacters,
    ...(Object.hasOwn(policy, 'render') ? { schemaVersion: 'prism-engine-policy.v2' as const, render: readPrismRenderPolicy(policy.render) } : {}) });
}

/** Explicit successor codec. Never refill a malformed/missing selected member from legacy values. */
export function readPrismRenderPolicy(value: unknown): PrismRenderSettings {
  const exact = (v: unknown, keys: string) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys;
  if (!exact(value, 'height,locale,reducedMotion,schemaVersion,timezoneId,widths')) throw new Error('PRISM_RENDER_POLICY_REQUIRED');
  const p = value as PrismRenderSettings;
  if (p.schemaVersion !== 'prism-render-policy.v1' || !exact(p.widths, 'compact,regular,wide')) throw new Error('PRISM_RENDER_POLICY_INVALID');
  for (const [v, max] of [[p.widths.compact,390],[p.widths.regular,768],[p.widths.wide,1440],[p.height,1000]]) {
    if (!Number.isSafeInteger(v) || v < 1 || v > max) throw new Error('PRISM_RENDER_DIMENSION_INVALID');
  }
  if (!(p.widths.compact < p.widths.regular && p.widths.regular < p.widths.wide)) throw new Error('PRISM_RENDER_WIDTH_ORDER_INVALID');
  if (!['en-US','de-DE'].includes(p.locale) || !['UTC','Europe/Berlin'].includes(p.timezoneId) || p.reducedMotion !== 'reduce') throw new Error('PRISM_RENDER_POLICY_INVALID');
  return Object.freeze({ schemaVersion: p.schemaVersion, widths: Object.freeze({...p.widths}), height: p.height,
    locale: p.locale, timezoneId: p.timezoneId, reducedMotion: p.reducedMotion });
}
