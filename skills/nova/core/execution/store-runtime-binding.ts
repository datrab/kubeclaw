import type { CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

const stores = [
  ['kubeclaw.artifact-store:artifact-store', 'artifactStore', 'artifactRoot'],
  ['kubeclaw.state-store:state', 'stateStore', 'root'],
  ['kubeclaw.wait-store:waits', 'waitStore', 'root'],
  ['kubeclaw.telemetry-store:telemetry', 'telemetryStore', 'root'],
] as const;
export type StoreRuntimeBindings = PlatformConfig['adapters'];

function assertRoot(value: Readonly<Record<string, unknown>>, key: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 1 || !Object.hasOwn(value, key)
    || typeof value[key] !== 'string' || !value[key]) throw new Error('RECOVERY_STORE_CONFIGURATION_INVALID');
}

/** Receive only integrity-checked original run configuration, never a new author
 * or inputStore producer receipt. Roots stay coupled to original Core budgets;
 * registry/package/grant/source admission and on-disk accounting still apply.
 */
export function captureStoreRuntimeBindings(adapters: PlatformConfig['adapters'], policy: CoreRuntimePolicy): StoreRuntimeBindings {
  const retained: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [id, field, key] of stores) {
    if (!Object.hasOwn(adapters, id)) continue;
    const original = adapters[id];
    if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('RECOVERY_STORE_CONFIGURATION_INVALID');
    const target = structuredClone(original) as Record<string, unknown>;
    for (const [name, value] of Object.entries(policy[field])) {
      if (!Object.hasOwn(target, name) || target[name] !== value) throw new Error('RECOVERY_STORE_POLICY_MISMATCH');
      delete target[name];
    }
    assertRoot(target, key);
    retained[id] = Object.freeze(target);
  }
  return Object.freeze(retained);
}

export function restoreStoreRuntimeBindings(adapters: PlatformConfig['adapters'], retained: StoreRuntimeBindings): PlatformConfig['adapters'] {
  if (Object.keys(retained).some(id => !stores.some(([expected]) => expected === id))) throw new Error('RECOVERY_STORE_CONFIGURATION_INVALID');
  const selected = {...adapters};
  for (const [id, , key] of stores) {
    if (Object.hasOwn(adapters, id) !== Object.hasOwn(retained, id)) throw new Error('RECOVERY_STORE_REGISTRATION_MISMATCH');
    if (!Object.hasOwn(retained, id)) continue;
    assertRoot(retained[id]!, key);
    selected[id] = structuredClone(retained[id]!);
  }
  return selected;
}
