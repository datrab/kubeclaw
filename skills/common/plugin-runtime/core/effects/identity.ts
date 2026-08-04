import crypto from 'node:crypto';
import { canonicalJson, type EffectRequest } from '../../sdk/src/index.ts';
import type { EffectInvocation } from './contracts.ts';

export const canonical = canonicalJson;

export function stableEffectId(invocation: EffectInvocation): string {
  const digest = crypto.createHash('sha256').update(canonical({
    idempotencyKey: invocation.idempotencyKey,
    attempt: invocation.attempt,
    capability: invocation.capability,
    operation: invocation.operation,
    resource: invocation.resource,
  })).digest('hex');
  return `effect:${digest}`;
}

export function assertMatchingRequest(prior: EffectRequest | undefined, invocation: EffectInvocation): void {
  if (!prior) return;
  if (prior.effectId !== stableEffectId(invocation) || canonical(prior.payload) !== canonical(invocation.payload)) {
    throw new Error(`EFFECT_IDEMPOTENCY_CONFLICT:${invocation.idempotencyKey}`);
  }
}
