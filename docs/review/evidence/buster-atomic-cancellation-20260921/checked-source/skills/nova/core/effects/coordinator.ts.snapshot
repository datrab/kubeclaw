import crypto from 'node:crypto';
import { runtimeDispatchProfileFields } from '@kubeclaw/plugin-sdk';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import type { AdapterInstance, EffectJournal, EffectReceipt, EffectRequest, PackageResolution } from '@kubeclaw/plugin-sdk';
import type { EffectModeAuditSink, EffectInvocation, EffectLockManager } from './contracts.ts';
import { invokeDurableEffect } from './durable-invocation.ts';

export type { EffectModeAuditSink, EffectInvocation, EffectLockManager } from './contracts.ts';
export { MemoryResourceLockManager } from './memory-locks.ts';

export class EffectCoordinator {
  readonly #journal: EffectJournal; readonly #now: () => Date; readonly #audit: EffectModeAuditSink | undefined;
  readonly #locks: EffectLockManager; readonly #lockTtlMs: number;

  constructor(journal: EffectJournal, now: () => Date = () => new Date(), audit?: EffectModeAuditSink, locks?: EffectLockManager, lockTtlMs = 300_000) {
    if (!locks) throw new Error('EFFECT_RESOURCE_LOCK_MANAGER_REQUIRED');
    this.#journal = journal; this.#now = now; this.#audit = audit; this.#locks = locks; this.#lockTtlMs = lockTtlMs;
  }

  async invoke(adapter: AdapterInstance, adapterOwner: PackageResolution, invocation: EffectInvocation, signal: AbortSignal): Promise<EffectReceipt> {
    return invokeDurableEffect({
      journal: this.#journal,
      now: this.#now,
      ...(this.#audit ? { audit: {
        requested: (request: EffectRequest) => this.#audit!.requested(request, 'durable'),
        accepted: (request: EffectRequest) => this.#audit!.accepted(request, 'durable'),
        completed: (request: EffectRequest, receipt: EffectReceipt) => this.#audit!.completed(request, receipt, 'durable'),
      } } : {}),
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
    if (Object.hasOwn(request, 'runtimeDispatchProfile')) validateContractValue('effectRequest', request);
    const auditRequest: EffectRequest = { ...request, resource: { type: request.resource.type, canonicalId: '[confidential]' }, payload: { confidential: true } };
    this.#audit?.requested(auditRequest, 'confidential'); this.#audit?.accepted(auditRequest, 'confidential');
    try {
      const result = await adapter.invoke({ request, signal, confidential: true });
      this.#audit?.completed(auditRequest, this.#confidentialReceipt(request, adapterOwner, 'completed'), 'confidential');
      return result;
    } catch (error) {
      this.#audit?.completed(auditRequest, this.#confidentialReceipt(request, adapterOwner, 'failed'), 'confidential');
      throw error;
    }
  }

  #confidentialRequest(invocation: EffectInvocation): EffectRequest {
    return {
      schemaVersion: 'effect-request.v2', effectId: `effect:${crypto.randomUUID()}`, idempotencyKey: invocation.idempotencyKey,
      ...(invocation.deliveryId === undefined ? {} : { deliveryId: invocation.deliveryId }),
      attempt: invocation.attempt, capability: invocation.capability, operation: invocation.operation, resource: invocation.resource,
      payload: invocation.payload, ...runtimeDispatchProfileFields(invocation, invocation.capability), requestedAt: this.#now().toISOString(),
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
