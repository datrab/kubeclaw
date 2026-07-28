import crypto from 'node:crypto';
import type { ResourceLock } from '../../sdk/src/index.ts';

interface MutableLock {
  contract: ResourceLock;
}

export class ResourceLockManager {
  readonly #locks = new Map<string, MutableLock>();
  readonly #fencing = new Map<string, number>();
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  acquire(
    resource: ResourceLock['resource'],
    ownerLeaseId: string,
    ttlMs: number,
  ): ResourceLock {
    const now = this.#now();
    const existing = this.#locks.get(resource.canonicalId);
    if (
      existing?.contract.status === 'active'
      && Date.parse(existing.contract.expiresAt) > now.getTime()
      && existing.contract.ownerLeaseId !== ownerLeaseId
    ) {
      throw new Error(`RESOURCE_LOCKED:${resource.canonicalId}`);
    }
    const fencingToken = (this.#fencing.get(resource.canonicalId) ?? 0) + 1;
    this.#fencing.set(resource.canonicalId, fencingToken);
    const contract: ResourceLock = Object.freeze({
      schemaVersion: 'resource-lock.v2',
      lockId: `lock:${crypto.randomUUID()}`,
      resource,
      ownerLeaseId,
      fencingToken,
      status: 'active',
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    });
    this.#locks.set(resource.canonicalId, { contract });
    return contract;
  }

  release(lockId: string, ownerLeaseId: string): ResourceLock {
    const entry = [...this.#locks.values()].find(({ contract }) => contract.lockId === lockId);
    if (!entry) throw new Error(`RESOURCE_LOCK_UNKNOWN:${lockId}`);
    if (entry.contract.ownerLeaseId !== ownerLeaseId) throw new Error(`RESOURCE_LOCK_OWNER_DENIED:${lockId}`);
    if (entry.contract.status !== 'active') return entry.contract;
    entry.contract = Object.freeze({
      ...entry.contract,
      status: 'released',
      releasedAt: this.#now().toISOString(),
    });
    return entry.contract;
  }
}
