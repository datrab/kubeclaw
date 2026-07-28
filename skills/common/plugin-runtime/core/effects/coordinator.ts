import crypto from 'node:crypto';
import type {
  AdapterInstance,
  EffectJournal,
  EffectReceipt,
  EffectRequest,
  PackageResolution,
  AttemptIdentity,
  ResourceLock,
} from '../../sdk/src/index.ts';

export interface EffectInvocation {
  readonly idempotencyKey: string;
  readonly attempt: AttemptIdentity;
  readonly capability: string;
  readonly operation: string;
  readonly resource: { readonly type: string; readonly canonicalId: string };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EffectAuditSink {
  requested(request: EffectRequest): void;
  accepted(request: EffectRequest): void;
  completed(request: EffectRequest, receipt: EffectReceipt): void;
}

export interface EffectLockManager {
  acquire(
    resource: ResourceLock['resource'],
    ownerLeaseId: string,
    ttlMs: number,
  ): ResourceLock;
  renew(lockId: string, ownerLeaseId: string, ttlMs: number): ResourceLock;
  release(lockId: string, ownerLeaseId: string): ResourceLock;
  assertCurrent(lockId: string, ownerLeaseId: string): ResourceLock;
}

export class MemoryResourceLockManager implements EffectLockManager {
  readonly #locks = new Map<string, ResourceLock>();
  #fencingToken = 0;

  acquire(
    resource: ResourceLock['resource'],
    ownerLeaseId: string,
    ttlMs: number,
  ): ResourceLock {
    const key = canonical(resource);
    const current = this.#locks.get(key);
    if (current && Date.parse(current.expiresAt) > Date.now()) {
      throw new Error(`RESOURCE_LOCKED:${resource.canonicalId}`);
    }
    const acquiredAt = new Date();
    const lock: ResourceLock = Object.freeze({
      schemaVersion: 'resource-lock.v2',
      lockId: `lock:${crypto.randomUUID()}`,
      resource,
      ownerLeaseId,
      fencingToken: ++this.#fencingToken,
      status: 'active',
      acquiredAt: acquiredAt.toISOString(),
      expiresAt: new Date(acquiredAt.getTime() + ttlMs).toISOString(),
    });
    this.#locks.set(key, lock);
    return lock;
  }

  renew(lockId: string, ownerLeaseId: string, ttlMs: number): ResourceLock {
    const active = this.assertCurrent(lockId, ownerLeaseId);
    const renewed: ResourceLock = Object.freeze({
      ...active,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    });
    this.#locks.set(canonical(active.resource), renewed);
    return renewed;
  }

  release(lockId: string, ownerLeaseId: string): ResourceLock {
    const active = this.assertCurrent(lockId, ownerLeaseId);
    const released: ResourceLock = Object.freeze({
      ...active,
      status: 'released',
      releasedAt: new Date().toISOString(),
    });
    this.#locks.delete(canonical(active.resource));
    return released;
  }

  assertCurrent(lockId: string, ownerLeaseId: string): ResourceLock {
    const active = [...this.#locks.values()].find((lock) => lock.lockId === lockId);
    if (!active) throw new Error(`RESOURCE_LOCK_UNKNOWN:${lockId}`);
    if (active.ownerLeaseId !== ownerLeaseId) {
      throw new Error(`RESOURCE_LOCK_OWNER_DENIED:${lockId}`);
    }
    if (Date.parse(active.expiresAt) <= Date.now()) throw new Error(`RESOURCE_LOCK_EXPIRED:${lockId}`);
    return active;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function stableEffectId(invocation: EffectInvocation): string {
  const digest = crypto.createHash('sha256').update(canonical({
    idempotencyKey: invocation.idempotencyKey,
    attempt: invocation.attempt,
    capability: invocation.capability,
    operation: invocation.operation,
    resource: invocation.resource,
  })).digest('hex');
  return `effect:${digest}`;
}

function assertMatchingRequest(
  prior: EffectRequest | undefined,
  invocation: EffectInvocation,
): void {
  if (!prior) return;
  if (
    prior.effectId !== stableEffectId(invocation)
    || canonical(prior.payload) !== canonical(invocation.payload)
  ) {
    throw new Error(`EFFECT_IDEMPOTENCY_CONFLICT:${invocation.idempotencyKey}`);
  }
}

export class EffectCoordinator {
  readonly #journal: EffectJournal;
  readonly #now: () => Date;
  readonly #audit: EffectAuditSink | undefined;
  readonly #locks: EffectLockManager;
  readonly #lockTtlMs: number;

  constructor(
    journal: EffectJournal,
    now: () => Date = () => new Date(),
    audit?: EffectAuditSink,
    locks?: EffectLockManager,
    lockTtlMs = 300_000,
  ) {
    if (!locks) throw new Error('EFFECT_RESOURCE_LOCK_MANAGER_REQUIRED');
    this.#journal = journal;
    this.#now = now;
    this.#audit = audit;
    this.#locks = locks;
    this.#lockTtlMs = lockTtlMs;
  }

  async invoke(
    adapter: AdapterInstance,
    adapterOwner: PackageResolution,
    invocation: EffectInvocation,
    signal: AbortSignal,
  ): Promise<EffectReceipt> {
    let priorRequest = await this.#journal.request(invocation.idempotencyKey);
    assertMatchingRequest(priorRequest, invocation);
    let existing = await this.#journal.receipt(invocation.idempotencyKey);
    if (existing) {
      if (!priorRequest || existing.effectId !== priorRequest.effectId) {
        throw new Error(`EFFECT_RECEIPT_ORPHANED:${invocation.idempotencyKey}`);
      }
      return existing;
    }
    let lock = this.#locks.acquire(
      invocation.resource,
      invocation.attempt.attemptId,
      this.#lockTtlMs,
    );
    if (lock) {
      priorRequest = await this.#journal.request(invocation.idempotencyKey);
      assertMatchingRequest(priorRequest, invocation);
      existing = await this.#journal.receipt(invocation.idempotencyKey);
      if (existing) {
        try {
          if (!priorRequest || existing.effectId !== priorRequest.effectId) {
            throw new Error(`EFFECT_RECEIPT_ORPHANED:${invocation.idempotencyKey}`);
          }
          return existing;
        } finally {
          this.#locks.release(lock.lockId, invocation.attempt.attemptId);
        }
      }
    }
    const request: EffectRequest = priorRequest ?? {
      schemaVersion: 'effect-request.v2',
      effectId: stableEffectId(invocation),
      idempotencyKey: invocation.idempotencyKey,
      attempt: invocation.attempt,
      capability: invocation.capability,
      operation: invocation.operation,
      resource: invocation.resource,
      payload: invocation.payload,
      requestedAt: this.#now().toISOString(),
    };
    const lockController = new AbortController();
    const effectiveSignal = lock
      ? AbortSignal.any([signal, lockController.signal])
      : signal;
    const renewalTimer = lock
      ? setInterval(() => {
        try {
          lock = this.#locks.renew(
            lock!.lockId,
            invocation.attempt.attemptId,
            this.#lockTtlMs,
          );
        } catch (error) {
          lockController.abort(error);
        }
      }, Math.max(1, Math.floor(this.#lockTtlMs / 3)))
      : undefined;
    renewalTimer?.unref();
    try {
      await this.#journal.requested(request);
      if (!priorRequest) this.#audit?.requested(request);
      const newlyAccepted = await this.#journal.accepted(request);
      if (newlyAccepted) {
        this.#audit?.accepted(request);
      } else {
        if (!adapter.receipt) {
          throw new Error(`EFFECT_RECOVERY_RECEIPT_UNAVAILABLE:${request.effectId}`);
        }
        const recoveredResult = await adapter.receipt(request);
        if (recoveredResult === undefined) {
          throw new Error(`EFFECT_RECOVERY_RECEIPT_MISSING:${request.effectId}`);
        }
        const recoveredReceipt: EffectReceipt = {
          schemaVersion: 'effect-receipt.v2',
          effectId: request.effectId,
          idempotencyKey: invocation.idempotencyKey,
          adapter: adapterOwner,
          status: 'completed',
          result: recoveredResult,
          recordedAt: this.#now().toISOString(),
        };
        await this.#journal.completed(recoveredReceipt);
        this.#audit?.completed(request, recoveredReceipt);
        return recoveredReceipt;
      }
      try {
        let adapterAssertedFence = false;
        const fence = {
          get contract(): ResourceLock {
            return lock!;
          },
          assertCurrent: (): ResourceLock => {
            const current = this.#locks.assertCurrent(
              lock!.lockId,
              invocation.attempt.attemptId,
            );
            adapterAssertedFence = true;
            return current;
          },
        };
        const result = await adapter.invoke({
          request,
          signal: effectiveSignal,
          confidential: false,
          lock,
          fence,
        });
        if (!adapterAssertedFence) {
          throw new Error(`ADAPTER_FENCE_NOT_ASSERTED:${request.effectId}`);
        }
        this.#locks.assertCurrent(lock.lockId, invocation.attempt.attemptId);
        const receipt: EffectReceipt = {
          schemaVersion: 'effect-receipt.v2',
          effectId: request.effectId,
          idempotencyKey: invocation.idempotencyKey,
          adapter: adapterOwner,
          status: 'completed',
          result,
          recordedAt: this.#now().toISOString(),
        };
        await this.#journal.completed(receipt);
        this.#audit?.completed(request, receipt);
        return receipt;
      } catch (error) {
        const receipt: EffectReceipt = {
          schemaVersion: 'effect-receipt.v2',
          effectId: request.effectId,
          idempotencyKey: invocation.idempotencyKey,
          adapter: adapterOwner,
          status: 'failed',
          error: {
            code: 'adapter.effect_failed',
            message: error instanceof Error ? error.message : String(error),
          },
          recordedAt: this.#now().toISOString(),
        };
        await this.#journal.completed(receipt);
        this.#audit?.completed(request, receipt);
        return receipt;
      }
    } finally {
      if (renewalTimer) clearInterval(renewalTimer);
      if (lock) this.#locks.release(lock.lockId, invocation.attempt.attemptId);
    }
  }

  async invokeConfidential(
    adapter: AdapterInstance,
    adapterOwner: PackageResolution,
    invocation: EffectInvocation,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    const request: EffectRequest = {
      schemaVersion: 'effect-request.v2',
      effectId: `effect:${crypto.randomUUID()}`,
      idempotencyKey: invocation.idempotencyKey,
      attempt: invocation.attempt,
      capability: invocation.capability,
      operation: invocation.operation,
      resource: invocation.resource,
      payload: invocation.payload,
      requestedAt: this.#now().toISOString(),
    };
    const auditRequest: EffectRequest = {
      ...request,
      payload: { confidential: true },
    };
    this.#audit?.requested(auditRequest);
    this.#audit?.accepted(auditRequest);
    try {
      const result = await adapter.invoke({ request, signal, confidential: true });
      this.#audit?.completed(auditRequest, {
        schemaVersion: 'effect-receipt.v2',
        effectId: request.effectId,
        idempotencyKey: request.idempotencyKey,
        adapter: adapterOwner,
        status: 'completed',
        result: { confidential: true },
        recordedAt: this.#now().toISOString(),
      });
      return result;
    } catch (error) {
      this.#audit?.completed(auditRequest, {
        schemaVersion: 'effect-receipt.v2',
        effectId: request.effectId,
        idempotencyKey: request.idempotencyKey,
        adapter: adapterOwner,
        status: 'failed',
        error: {
          code: 'adapter.confidential_effect_failed',
          message: 'Confidential adapter operation failed',
        },
        recordedAt: this.#now().toISOString(),
      });
      throw error;
    }
  }
}
