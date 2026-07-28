import crypto from 'node:crypto';
import type {
  AdapterInstance,
  EffectJournal,
  EffectReceipt,
  EffectRequest,
  PackageResolution,
  AttemptIdentity,
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

export class EffectCoordinator {
  readonly #journal: EffectJournal;
  readonly #now: () => Date;
  readonly #audit: EffectAuditSink | undefined;

  constructor(
    journal: EffectJournal,
    now: () => Date = () => new Date(),
    audit?: EffectAuditSink,
  ) {
    this.#journal = journal;
    this.#now = now;
    this.#audit = audit;
  }

  async invoke(
    adapter: AdapterInstance,
    adapterOwner: PackageResolution,
    invocation: EffectInvocation,
    signal: AbortSignal,
  ): Promise<EffectReceipt> {
    const existing = await this.#journal.receipt(invocation.idempotencyKey);
    if (existing) return existing;
    const priorRequest = await this.#journal.request(invocation.idempotencyKey);
    const request: EffectRequest = priorRequest ?? {
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
    await this.#journal.requested(request);
    if (!priorRequest) this.#audit?.requested(request);
    if (await this.#journal.accepted(request)) this.#audit?.accepted(request);
    try {
      const result = await adapter.invoke({ request, signal });
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
  }

  async invokeConfidential(
    adapter: AdapterInstance,
    invocation: EffectInvocation,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    return adapter.invoke({
      request: {
        schemaVersion: 'effect-request.v2',
        effectId: `effect:${crypto.randomUUID()}`,
        idempotencyKey: invocation.idempotencyKey,
        attempt: invocation.attempt,
        capability: invocation.capability,
        operation: invocation.operation,
        resource: invocation.resource,
        payload: invocation.payload,
        requestedAt: this.#now().toISOString(),
      },
      signal,
    });
  }
}
