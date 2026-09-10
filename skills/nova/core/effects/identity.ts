import crypto from 'node:crypto';
import { canonicalJson, portableJson, runtimeDispatchProfileFields, type EffectRequest } from '@kubeclaw/plugin-sdk';
import type { EffectInvocation } from './contracts.ts';

// Other legacy callers keep their existing semantic contract.
export const canonical = canonicalJson;
const PORTABLE_PREFIX = 'effect:json-utf16-v1:';

function subject(invocation: EffectInvocation) {
  return {
    idempotencyKey: invocation.idempotencyKey,
    ...(invocation.deliveryId === undefined ? {} : { deliveryId: invocation.deliveryId }),
    attempt: invocation.attempt,
    capability: invocation.capability,
    operation: invocation.operation,
    resource: invocation.resource,
    ...runtimeDispatchProfileFields(invocation, invocation.capability),
  };
}
function hash(bytes: string): string { return crypto.createHash('sha256').update(bytes).digest('hex'); }

/** New durable effects explicitly bind the portable identity domain and codec. */
export function stableEffectId(invocation: EffectInvocation): string {
  return `${PORTABLE_PREFIX}${hash(portableJson({ schemaVersion: 'effect-identity.utf16.v1', ...subject(invocation) }))}`;
}

function matchesIdentity(effectId: string, invocation: EffectInvocation): boolean {
  if (/^effect:json-utf16-v1:[a-f0-9]{64}$/u.test(effectId)) return effectId === stableEffectId(invocation);
  // This is the exact old producer algorithm, not an inferred/fallback collator.
  if (/^effect:[a-f0-9]{64}$/u.test(effectId)) return effectId === `effect:${hash(canonicalJson(subject(invocation)))}`;
  return false;
}

/** Read-only audit validates the original stored version, never a newly assigned identity. */
export function validEffectIdentity(request: EffectRequest): boolean {
  return matchesIdentity(request.effectId, request);
}

export function assertMatchingRequest(prior: EffectRequest | undefined, invocation: EffectInvocation): void {
  if (!prior) return;
  if (prior.deliveryId !== invocation.deliveryId || !matchesIdentity(prior.effectId, prior) || !matchesIdentity(prior.effectId, invocation)) {
    throw new Error(`EFFECT_IDEMPOTENCY_CONFLICT:${invocation.idempotencyKey}`);
  }
  const serialize = prior.effectId.startsWith(PORTABLE_PREFIX) ? portableJson : canonicalJson;
  if (serialize(prior.payload) !== serialize(invocation.payload)) {
    throw new Error(`EFFECT_IDEMPOTENCY_CONFLICT:${invocation.idempotencyKey}`);
  }
}
