import type {
  InvocationLease,
  Reason,
} from '@kubeclaw/plugin-sdk';

export class RevocableLease {
  #contract: InvocationLease;
  readonly #now: () => Date;

  constructor(contract: InvocationLease, now: () => Date = () => new Date()) {
    this.#contract = Object.freeze({ ...contract });
    this.#now = now;
  }

  get contract(): InvocationLease {
    return this.#contract;
  }

  assertActive(now = this.#now()): void {
    if (this.#contract.status !== 'active') throw new Error('PLUGIN_CONTEXT_REVOKED');
    if (now.getTime() >= Date.parse(this.#contract.expiresAt)) throw new Error('PLUGIN_CONTEXT_EXPIRED');
  }

  revoke(reason: Reason, revokedAt = new Date()): InvocationLease {
    if (this.#contract.status === 'revoked') return this.#contract;
    this.#contract = Object.freeze({
      ...this.#contract,
      status: 'revoked',
      revokedAt: revokedAt.toISOString(),
      revocationReason: reason,
    });
    return this.#contract;
  }
}
