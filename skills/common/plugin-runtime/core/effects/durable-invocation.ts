import type { AdapterInstance, EffectJournal, EffectReceipt, EffectRequest, PackageResolution, ResourceLock } from '../../sdk/src/index.ts';
import type { EffectAuditSink, EffectInvocation, EffectLockManager } from './contracts.ts';
import { assertMatchingRequest, stableEffectId } from './identity.ts';

interface Dependencies {
  readonly journal: EffectJournal;
  readonly now: () => Date;
  readonly audit?: EffectAuditSink;
  readonly locks: EffectLockManager;
  readonly lockTtlMs: number;
}

export async function invokeDurableEffect(
  dependencies: Dependencies,
  adapter: AdapterInstance,
  adapterOwner: PackageResolution,
  invocation: EffectInvocation,
  signal: AbortSignal,
): Promise<EffectReceipt> {
  return new DurableInvocation(dependencies, adapter, adapterOwner, invocation, signal).execute();
}

class DurableInvocation {
  readonly #dependencies: Dependencies; readonly #adapter: AdapterInstance; readonly #adapterOwner: PackageResolution;
  readonly #invocation: EffectInvocation; readonly #signal: AbortSignal; #lock: ResourceLock | undefined;
  constructor(dependencies: Dependencies, adapter: AdapterInstance, adapterOwner: PackageResolution, invocation: EffectInvocation, signal: AbortSignal) {
    this.#dependencies = dependencies; this.#adapter = adapter; this.#adapterOwner = adapterOwner; this.#invocation = invocation; this.#signal = signal;
  }

  async execute(): Promise<EffectReceipt> {
    let prior = await this.#dependencies.journal.request(this.#invocation.idempotencyKey);
    assertMatchingRequest(prior, this.#invocation);
    const existing = await this.#existingReceipt(prior);
    if (existing) return existing;
    this.#lock = this.#dependencies.locks.acquire(this.#invocation.resource, this.#invocation.attempt.attemptId, this.#dependencies.lockTtlMs);
    prior = await this.#dependencies.journal.request(this.#invocation.idempotencyKey);
    assertMatchingRequest(prior, this.#invocation);
    const lockedExisting = await this.#existingReceipt(prior);
    if (lockedExisting) { this.#release(); return lockedExisting; }
    return this.#executeLocked(prior);
  }

  async #existingReceipt(prior: EffectRequest | undefined): Promise<EffectReceipt | undefined> {
    const receipt = await this.#dependencies.journal.receipt(this.#invocation.idempotencyKey);
    if (receipt && (!prior || receipt.effectId !== prior.effectId)) throw new Error(`EFFECT_RECEIPT_ORPHANED:${this.#invocation.idempotencyKey}`);
    return receipt;
  }

  #request(prior: EffectRequest | undefined): EffectRequest {
    return prior ?? {
      schemaVersion: 'effect-request.v2', effectId: stableEffectId(this.#invocation), idempotencyKey: this.#invocation.idempotencyKey,
      attempt: this.#invocation.attempt, capability: this.#invocation.capability, operation: this.#invocation.operation,
      resource: this.#invocation.resource, payload: this.#invocation.payload, requestedAt: this.#dependencies.now().toISOString(),
    };
  }

  async #executeLocked(prior: EffectRequest | undefined): Promise<EffectReceipt> {
    const request = this.#request(prior);
    const controller = new AbortController();
    const timer = this.#renew(controller);
    try {
      await this.#dependencies.journal.requested(request);
      if (!prior) this.#dependencies.audit?.requested(request);
      const accepted = await this.#dependencies.journal.accepted(request);
      return accepted ? await this.#invokeAdapter(request, controller.signal) : await this.#recover(request);
    } finally {
      if (timer) clearInterval(timer);
      this.#release();
    }
  }

  #renew(controller: AbortController): NodeJS.Timeout | undefined {
    if (!this.#lock) return undefined;
    const timer = setInterval(() => {
      try { this.#lock = this.#dependencies.locks.renew(this.#lock!.lockId, this.#invocation.attempt.attemptId, this.#dependencies.lockTtlMs); }
      catch (error) { controller.abort(error); }
    }, Math.max(1, Math.floor(this.#dependencies.lockTtlMs / 3)));
    timer.unref(); return timer;
  }

  async #recover(request: EffectRequest): Promise<EffectReceipt> {
    if (!this.#adapter.receipt) throw new Error(`EFFECT_RECOVERY_RECEIPT_UNAVAILABLE:${request.effectId}`);
    const result = await this.#adapter.receipt(request);
    if (result === undefined) throw new Error(`EFFECT_RECOVERY_RECEIPT_MISSING:${request.effectId}`);
    return this.#complete(request, { status: 'completed', result });
  }

  async #invokeAdapter(request: EffectRequest, renewalSignal: AbortSignal): Promise<EffectReceipt> {
    this.#dependencies.audit?.accepted(request);
    const lock = this.#lock!;
    let asserted = false;
    const invocation = this;
    const fence = {
      get contract(): ResourceLock { return invocation.#lock!; },
      assertCurrent: (): ResourceLock => { asserted = true; return this.#assertCurrent(); },
    };
    try {
      const result = await this.#adapter.invoke({ request, signal: AbortSignal.any([this.#signal, renewalSignal]), confidential: false, lock, fence });
      if (!asserted) throw new Error(`ADAPTER_FENCE_NOT_ASSERTED:${request.effectId}`);
      this.#assertCurrent();
      return this.#complete(request, { status: 'completed', result });
    } catch (error) {
      return this.#complete(request, { status: 'failed', error: { code: 'adapter.effect_failed', message: error instanceof Error ? error.message : String(error) } });
    }
  }

  #assertCurrent(): ResourceLock {
    return this.#dependencies.locks.assertCurrent(this.#lock!.lockId, this.#invocation.attempt.attemptId);
  }

  async #complete(request: EffectRequest, outcome: Pick<EffectReceipt, 'status' | 'result' | 'error'>): Promise<EffectReceipt> {
    const receipt: EffectReceipt = {
      schemaVersion: 'effect-receipt.v2', effectId: request.effectId, idempotencyKey: this.#invocation.idempotencyKey,
      adapter: this.#adapterOwner, ...outcome, recordedAt: this.#dependencies.now().toISOString(),
    };
    await this.#dependencies.journal.completed(receipt); this.#dependencies.audit?.completed(request, receipt); return receipt;
  }

  #release(): void {
    if (!this.#lock) return;
    this.#dependencies.locks.release(this.#lock.lockId, this.#invocation.attempt.attemptId); this.#lock = undefined;
  }
}
