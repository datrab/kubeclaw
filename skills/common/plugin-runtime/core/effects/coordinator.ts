import crypto from 'node:crypto';
import type { AdapterInstance, EffectJournal, EffectReceipt, EffectRequest, PackageResolution } from '../../sdk/src/index.ts';
import type { EffectAuditSink, EffectInvocation, EffectLockManager } from './contracts.ts';
import { invokeDurableEffect } from './durable-invocation.ts';

export type { EffectAuditSink, EffectInvocation, EffectLockManager } from './contracts.ts';
export { MemoryResourceLockManager } from './memory-locks.ts';

export class EffectCoordinator {
  readonly #journal: EffectJournal; readonly #now: () => Date; readonly #audit: EffectAuditSink | undefined;
  readonly #locks: EffectLockManager; readonly #lockTtlMs: number;

  constructor(journal: EffectJournal, now: () => Date = () => new Date(), audit?: EffectAuditSink, locks?: EffectLockManager, lockTtlMs = 300_000) {
    if (!locks) throw new Error('EFFECT_RESOURCE_LOCK_MANAGER_REQUIRED');
    this.#journal = journal; this.#now = now; this.#audit = audit; this.#locks = locks; this.#lockTtlMs = lockTtlMs;
  }

  async invoke(adapter: AdapterInstance, adapterOwner: PackageResolution, invocation: EffectInvocation, signal: AbortSignal): Promise<EffectReceipt> {
    return invokeDurableEffect({
      journal: this.#journal,
      now: this.#now,
      ...(this.#audit ? { audit: this.#audit } : {}),
      locks: this.#locks,
      lockTtlMs: this.#lockTtlMs,
    }, adapter, adapterOwner, invocation, signal);
  }

  async invokeConfidential(
    adapter: AdapterInstance,
    adapterOwner: PackageResolution,
    invocation: EffectInvocation,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    const request = this.#confidentialRequest(invocation);
    const auditRequest: EffectRequest = { ...request, resource: { type: request.resource.type, canonicalId: '[confidential]' }, payload: { confidential: true } };
    this.#audit?.requested(auditRequest); this.#audit?.accepted(auditRequest);
    try {
      const result = await adapter.invoke({ request, signal, confidential: true });
      this.#audit?.completed(auditRequest, this.#confidentialReceipt(request, adapterOwner, 'completed'));
      return result;
    } catch (error) {
      this.#audit?.completed(auditRequest, this.#confidentialReceipt(request, adapterOwner, 'failed'));
      throw error;
    }
  }

  #confidentialRequest(invocation: EffectInvocation): EffectRequest {
    return {
      schemaVersion: 'effect-request.v2', effectId: `effect:${crypto.randomUUID()}`, idempotencyKey: invocation.idempotencyKey,
      attempt: invocation.attempt, capability: invocation.capability, operation: invocation.operation, resource: invocation.resource,
      payload: invocation.payload, requestedAt: this.#now().toISOString(),
    };
  }

  #confidentialReceipt(request: EffectRequest, adapter: PackageResolution, status: 'completed' | 'failed'): EffectReceipt {
    return {
      schemaVersion: 'effect-receipt.v2', effectId: request.effectId, idempotencyKey: request.idempotencyKey, adapter, status,
      ...(status === 'completed'
        ? { result: { confidential: true } }
        : { error: { code: 'adapter.confidential_effect_failed', message: 'Confidential adapter operation failed' } }),
      recordedAt: this.#now().toISOString(),
    };
  }
}
