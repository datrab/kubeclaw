import { isDeepStrictEqual } from 'node:util';
import type { CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

const PUBLISHER = 'kubeclaw.transport-publisher:publisher';
export type PublisherRuntimeBindings = PlatformConfig['adapters'];

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Original integrity-checked run snapshot only, never a task/current author.
 * Keep original target identities, endpoint/signing-secret references, profile selection
 * and durable-store location together. Secret bytes are not part of this map.
 * Normal registry/schema/grant/source equality still precedes activation.
 */
export function capturePublisherRuntimeBindings(adapters: PlatformConfig['adapters'], policy: CoreRuntimePolicy): PublisherRuntimeBindings {
  if (!Object.hasOwn(adapters, PUBLISHER)) return Object.freeze({});
  const original = adapters[PUBLISHER];
  if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('RECOVERY_PUBLISHER_CONFIGURATION_INVALID');
  const target = structuredClone(original) as Record<string, unknown>;
  const projected = {
    ...policy.transportPublisherStructure,
    ...policy.transportPublisherFailure,
    ...policy.transportPublisherPayload,
    ...policy.transportPublisherStore,
  };
  for (const [key, value] of Object.entries(projected)) {
    if (!Object.hasOwn(target, key) || !isDeepStrictEqual(target[key], value)) throw new Error('RECOVERY_PUBLISHER_POLICY_MISMATCH');
    delete target[key];
  }
  if (Object.keys(target).sort().join(',') !== 'deliveryRoot,targets'
    || typeof target.deliveryRoot !== 'string' || !target.deliveryRoot
    || !target.targets || typeof target.targets !== 'object' || Array.isArray(target.targets)) throw new Error('RECOVERY_PUBLISHER_CONFIGURATION_INVALID');
  return freeze({[PUBLISHER]: target});
}

export function restorePublisherRuntimeBindings(adapters: PlatformConfig['adapters'], retained: PublisherRuntimeBindings): PlatformConfig['adapters'] {
  if (Object.keys(retained).some(id => id !== PUBLISHER)) throw new Error('RECOVERY_PUBLISHER_CONFIGURATION_INVALID');
  if (Object.hasOwn(adapters, PUBLISHER) !== Object.hasOwn(retained, PUBLISHER)) throw new Error('RECOVERY_PUBLISHER_REGISTRATION_MISMATCH');
  return Object.hasOwn(retained, PUBLISHER) ? {...adapters, [PUBLISHER]: structuredClone(retained[PUBLISHER]!)} : adapters;
}
