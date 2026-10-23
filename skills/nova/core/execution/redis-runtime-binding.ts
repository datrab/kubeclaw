import type { CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

export const REDIS_REGISTRATIONS = ['kubeclaw.redis-transport:publisher', 'kubeclaw.redis-transport:telemetry'] as const;
export type RedisRuntimeBindings = PlatformConfig['adapters'];

/** Internal original-run receiving only. The caller reads the integrity-checked
 * run snapshot; neither task data nor current Platform values author this map.
 * Retain both independent registrations, including their absence. Secret bytes
 * remain in the original secret resolver, never in this configuration capture.
 */
export function captureRedisRuntimeBindings(adapters: PlatformConfig['adapters'], policy: CoreRuntimePolicy): RedisRuntimeBindings {
  const bindings: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const id of REDIS_REGISTRATIONS) {
    if (!Object.hasOwn(adapters, id)) continue;
    const original = adapters[id];
    if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('RECOVERY_REDIS_CONFIGURATION_INVALID');
    // Original effective buffers must agree with the SAME retained Core policy.
    // Strip only these projected keys before normal projection/schema admission.
    const target = structuredClone(original) as Record<string, unknown>;
    for (const [key, value] of Object.entries(policy.redisTransport)) {
      if (target[key] !== value) throw new Error('RECOVERY_REDIS_POLICY_MISMATCH');
      delete target[key];
    }
    // Redis target settings are scalar. Do not admit a nested mutable value or
    // silently complete a legacy/incomplete capture from current configuration.
    const keys = ['url', 'passwordSecret', 'streamPrefix', 'maxLen', 'dedupTtlMs', 'timeoutMs'];
    if (Object.keys(target).sort().join(',') !== keys.sort().join(',')
      || keys.some(key => !['string', 'number'].includes(typeof target[key]))) throw new Error('RECOVERY_REDIS_CONFIGURATION_INVALID');
    bindings[id] = Object.freeze(target);
  }
  return Object.freeze(bindings);
}

export function restoreRedisRuntimeBindings(adapters: PlatformConfig['adapters'], retained: RedisRuntimeBindings): PlatformConfig['adapters'] {
  if (Object.keys(retained).some(id => !REDIS_REGISTRATIONS.includes(id as typeof REDIS_REGISTRATIONS[number]))) throw new Error('RECOVERY_REDIS_CONFIGURATION_INVALID');
  const restored = structuredClone(adapters) as Record<string, Readonly<Record<string, unknown>>>;
  for (const id of REDIS_REGISTRATIONS) {
    if (Object.hasOwn(adapters, id) !== Object.hasOwn(retained, id)) throw new Error('RECOVERY_REDIS_REGISTRATION_MISMATCH');
    if (Object.hasOwn(retained, id)) restored[id] = structuredClone(retained[id]!);
  }
  return restored;
}
