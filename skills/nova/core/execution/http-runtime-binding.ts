import { isDeepStrictEqual } from 'node:util';
import type { CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

const HTTP = 'kubeclaw.runtime-dispatch:runtime';
const NETWORK = 'kubeclaw.network-http:http';
export type HttpRuntimeBindings = PlatformConfig['adapters'];

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Original integrity-checked snapshot receiving only, not a new author/grant.
 * Retain the entire original endpoint/authentication/secret-reference/selector
 * set and network origin/method/header restrictions, before normal schema,
 * registry, source and grant admission. Never restore secret bytes or current B.
 */
export function captureHttpRuntimeBindings(adapters: PlatformConfig['adapters'], policy: CoreRuntimePolicy): HttpRuntimeBindings {
  const retained: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [id, projected] of [[HTTP, policy.httpDispatch], [NETWORK, policy.networkHttp]] as const) {
    if (!Object.hasOwn(adapters, id)) continue;
    const original = adapters[id];
    if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('RECOVERY_HTTP_CONFIGURATION_INVALID');
    const target = structuredClone(original) as Record<string, unknown>;
    for (const [key, value] of Object.entries(projected)) {
      if (!Object.hasOwn(target, key) || !isDeepStrictEqual(target[key], value)) throw new Error('RECOVERY_HTTP_POLICY_MISMATCH');
      delete target[key];
    }
    if (id === HTTP) {
      if (Object.keys(target).join(',') !== 'targets' || !target.targets || typeof target.targets !== 'object' || Array.isArray(target.targets)) throw new Error('RECOVERY_HTTP_CONFIGURATION_INVALID');
    } else if (Object.keys(target).some(key => !['allowedOrigins', 'allowedMethods', 'allowedHeaders'].includes(key))
      || !Array.isArray(target.allowedOrigins) || !target.allowedOrigins.length
      || ['allowedOrigins', 'allowedMethods', 'allowedHeaders'].some(key => Object.hasOwn(target, key) && (!Array.isArray(target[key]) || (target[key] as unknown[]).some(value => typeof value !== 'string')))) {
      throw new Error('RECOVERY_HTTP_CONFIGURATION_INVALID');
    }
    retained[id] = target;
  }
  return freeze(retained);
}

export function restoreHttpRuntimeBindings(adapters: PlatformConfig['adapters'], retained: HttpRuntimeBindings): PlatformConfig['adapters'] {
  if (Object.keys(retained).some(id => id !== HTTP && id !== NETWORK)) throw new Error('RECOVERY_HTTP_CONFIGURATION_INVALID');
  const selected = {...adapters};
  for (const id of [HTTP, NETWORK]) {
    if (Object.hasOwn(adapters, id) !== Object.hasOwn(retained, id)) throw new Error('RECOVERY_HTTP_REGISTRATION_MISMATCH');
    if (Object.hasOwn(retained, id)) selected[id] = structuredClone(retained[id]!);
  }
  return selected;
}
