import { isDeepStrictEqual } from 'node:util';
import type { CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

const OPERATOR = 'kubeclaw.operator-messaging:operator';
export type OperatorRuntimeBindings = PlatformConfig['adapters'];

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Original integrity-checked run snapshot only, never a task/current author.
 * Keep original target identities, endpoint/secret references, profile selection
 * and durable-store location together. Secret bytes are not part of this map.
 * Normal registry/schema/grant/source equality still precedes activation.
 */
export function captureOperatorRuntimeBindings(adapters: PlatformConfig['adapters'], policy: CoreRuntimePolicy): OperatorRuntimeBindings {
  if (!Object.hasOwn(adapters, OPERATOR)) return Object.freeze({});
  const original = adapters[OPERATOR];
  if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('RECOVERY_OPERATOR_CONFIGURATION_INVALID');
  const target = structuredClone(original) as Record<string, unknown>;
  const projected = {
    ...policy.operatorMessagingFailure,
    ...policy.operatorMessagingPayload,
    ...policy.operatorMessagingStore,
    ...(policy.policyVersion === 'nova-core-runtime-policy.v3' ? {payloadPolicyVersion: 'operator-payload.v2'} : {}),
  };
  for (const [key, value] of Object.entries(projected)) {
    if (!Object.hasOwn(target, key) || !isDeepStrictEqual(target[key], value)) throw new Error('RECOVERY_OPERATOR_POLICY_MISMATCH');
    delete target[key];
  }
  if (Object.keys(target).sort().join(',') !== 'deliveryRoot,targets'
    || typeof target.deliveryRoot !== 'string' || !target.deliveryRoot
    || !target.targets || typeof target.targets !== 'object' || Array.isArray(target.targets)) throw new Error('RECOVERY_OPERATOR_CONFIGURATION_INVALID');
  return freeze({[OPERATOR]: target});
}

export function restoreOperatorRuntimeBindings(adapters: PlatformConfig['adapters'], retained: OperatorRuntimeBindings): PlatformConfig['adapters'] {
  if (Object.keys(retained).some(id => id !== OPERATOR)) throw new Error('RECOVERY_OPERATOR_CONFIGURATION_INVALID');
  if (Object.hasOwn(adapters, OPERATOR) !== Object.hasOwn(retained, OPERATOR)) throw new Error('RECOVERY_OPERATOR_REGISTRATION_MISMATCH');
  return Object.hasOwn(retained, OPERATOR) ? {...adapters, [OPERATOR]: structuredClone(retained[OPERATOR]!)} : adapters;
}
