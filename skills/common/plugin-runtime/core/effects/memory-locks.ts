import crypto from 'node:crypto';
import type { ResourceLock } from '../../sdk/src/index.ts';
import type { EffectLockManager } from './contracts.ts';
import { canonical } from './identity.ts';

export class MemoryResourceLockManager implements EffectLockManager {
  readonly #locks = new Map<string, ResourceLock>();
  #fencingToken = 0;

  acquire(resource: ResourceLock['resource'], ownerLeaseId: string, ttlMs: number): ResourceLock {
    const key = canonical(resource);
    const current = this.#locks.get(key);
    if (current && Date.parse(current.expiresAt) > Date.now()) throw new Error(`RESOURCE_LOCKED:${resource.canonicalId}`);
    const acquiredAt = new Date();
    const lock: ResourceLock = Object.freeze({
      schemaVersion: 'resource-lock.v2', lockId: `lock:${crypto.randomUUID()}`, resource, ownerLeaseId,
      fencingToken: ++this.#fencingToken, status: 'active', acquiredAt: acquiredAt.toISOString(),
      expiresAt: new Date(acquiredAt.getTime() + ttlMs).toISOString(),
    });
    this.#locks.set(key, lock);
    return lock;
  }

  renew(lockId: string, ownerLeaseId: string, ttlMs: number): ResourceLock {
    const active = this.assertCurrent(lockId, ownerLeaseId);
    const renewed: ResourceLock = Object.freeze({ ...active, expiresAt: new Date(Date.now() + ttlMs).toISOString() });
    this.#locks.set(canonical(active.resource), renewed);
    return renewed;
  }

  release(lockId: string, ownerLeaseId: string): ResourceLock {
    const active = this.assertCurrent(lockId, ownerLeaseId);
    const released: ResourceLock = Object.freeze({ ...active, status: 'released', releasedAt: new Date().toISOString() });
    this.#locks.delete(canonical(active.resource));
    return released;
  }

  assertCurrent(lockId: string, ownerLeaseId: string): ResourceLock {
    const active = [...this.#locks.values()].find((lock) => lock.lockId === lockId);
    if (!active) throw new Error(`RESOURCE_LOCK_UNKNOWN:${lockId}`);
    if (active.ownerLeaseId !== ownerLeaseId) throw new Error(`RESOURCE_LOCK_OWNER_DENIED:${lockId}`);
    if (Date.parse(active.expiresAt) <= Date.now()) throw new Error(`RESOURCE_LOCK_EXPIRED:${lockId}`);
    return active;
  }
}
