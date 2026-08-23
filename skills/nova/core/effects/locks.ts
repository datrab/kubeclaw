import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ResourceLock } from '@kubeclaw/plugin-sdk';
import { FileJournal } from '../state/journal.ts';
import { FileMutex } from '../state/file-mutex.ts';

interface LockOwner {
  readonly pid: number;
  readonly contract: ResourceLock;
}

function isLockOwner(value: unknown): value is LockOwner {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { pid?: unknown; contract?: unknown };
  if (!Number.isSafeInteger(candidate.pid) || Number(candidate.pid) < 1) return false;
  if (!candidate.contract || typeof candidate.contract !== 'object' || Array.isArray(candidate.contract)) {
    return false;
  }
  const contract = candidate.contract as Partial<ResourceLock>;
  return [contract.schemaVersion === 'resource-lock.v2', typeof contract.lockId === 'string',
    typeof contract.ownerLeaseId === 'string', typeof contract.expiresAt === 'string' && Number.isFinite(Date.parse(contract.expiresAt)),
    Number.isSafeInteger(contract.fencingToken) && contract.fencingToken! >= 1, contract.status === 'active',
    Boolean(contract.resource), typeof contract.resource?.type === 'string', typeof contract.resource?.canonicalId === 'string'].every(Boolean);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function resourceKey(resource: ResourceLock['resource']): string {
  return crypto.createHash('sha256')
    .update(`${resource.type}\u0000${resource.canonicalId}`)
    .digest('hex');
}

export class FileResourceLockManager {
  readonly #root: string;
  readonly #journal: FileJournal<ResourceLock>;
  readonly #now: () => Date;
  readonly #provisionalTtlMs = 60_000;
  readonly #metadataMutex: FileMutex;

  constructor(root: string, now: () => Date = () => new Date()) {
    this.#root = path.resolve(root);
    this.#now = now;
    fs.mkdirSync(this.#root, { recursive: true });
    this.#journal = new FileJournal(path.join(this.#root, 'locks.jsonl'));
    this.#metadataMutex = new FileMutex(path.join(this.#root, 'metadata.guard'), 5_000, 'RESOURCE_LOCK_METADATA_TIMEOUT');
  }

  acquire(
    resource: ResourceLock['resource'],
    ownerLeaseId: string,
    ttlMs: number,
  ): ResourceLock {
    return this.#metadataMutex.withLock(
      () => this.#acquire(resource, ownerLeaseId, ttlMs),
    );
  }

  #acquire(
    resource: ResourceLock['resource'],
    ownerLeaseId: string,
    ttlMs: number,
  ): ResourceLock {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new Error('RESOURCE_LOCK_TTL_INVALID');
    const key = resourceKey(resource);
    const lockDirectory = path.join(this.#root, `${key}.active`);
    const ownerFile = path.join(lockDirectory, 'owner.json');
    const claimFile = path.join(lockDirectory, 'claim.json');
    const claimToken = crypto.randomUUID();
    this.#claim(resource, ownerLeaseId, lockDirectory, ownerFile, claimFile, claimToken);
    try { return this.#commitClaim(resource, ownerLeaseId, ttlMs, ownerFile); }
    catch (error) { this.#cleanupClaim(lockDirectory, claimFile, claimToken); throw error; }
  }

  #claim(resource: ResourceLock['resource'], ownerLeaseId: string, lockDirectory: string, ownerFile: string, claimFile: string, claimToken: string): void {
    for (;;) {
      try {
        fs.mkdirSync(lockDirectory);
        fs.writeFileSync(claimFile, `${JSON.stringify({ token: claimToken, pid: process.pid })}\n`, { flag: 'wx', mode: 0o600 });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const owner = this.#owner(ownerFile);
        if (!owner && this.#now().getTime() - fs.statSync(lockDirectory).mtimeMs < this.#provisionalTtlMs) throw new Error(`RESOURCE_LOCK_PROVISIONING:${resource.canonicalId}`);
        this.#assertOwnerAvailable(owner, ownerLeaseId, resource.canonicalId);
        if (!this.#expire(lockDirectory, owner)) continue;
      }
    }
  }

  #assertOwnerAvailable(owner: LockOwner | undefined, ownerLeaseId: string, resourceId: string): void {
    if (!owner || !processAlive(owner.pid)) return;
    if (owner.contract.ownerLeaseId === ownerLeaseId) throw new Error(`RESOURCE_LOCK_REENTRANT_DENIED:${resourceId}`);
    throw new Error(`RESOURCE_LOCKED:${resourceId}`);
  }

  #owner(ownerFile: string): LockOwner | undefined {
    try { const parsed = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as unknown; return isLockOwner(parsed) ? parsed : undefined; }
    catch {
      // INTENTIONAL_NONCRITICAL(invalid_lock_metadata): Missing or torn owner metadata is treated as absent.
      return undefined;
    }
  }

  #expire(lockDirectory: string, owner: LockOwner | undefined): boolean {
    const tombstone = `${lockDirectory}.expired-${crypto.randomUUID()}`;
    try { fs.renameSync(lockDirectory, tombstone); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    try { if (owner) this.#journal.append(Object.freeze({ ...owner.contract, status: 'expired' })); }
    finally { fs.rmSync(tombstone, { recursive: true, force: true }); }
    return true;
  }

  #commitClaim(resource: ResourceLock['resource'], ownerLeaseId: string, ttlMs: number, ownerFile: string): ResourceLock {
    const prior = [...this.#journal.refresh()].reverse()
      .find(({ entry }) => entry.resource.type === resource.type
        && entry.resource.canonicalId === resource.canonicalId);
    const fencingToken = (prior?.entry.fencingToken ?? 0) + 1;
    const now = this.#now();
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
    fs.writeFileSync(
      ownerFile,
      `${JSON.stringify({ pid: process.pid, contract } satisfies LockOwner)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    this.#journal.append(contract);
    return contract;
  }

  #cleanupClaim(lockDirectory: string, claimFile: string, token: string): void {
    try {
      const claim = JSON.parse(fs.readFileSync(claimFile, 'utf8')) as { token?: unknown };
      if (claim.token !== token) return;
      const tombstone = `${lockDirectory}.failed-${token}`; fs.renameSync(lockDirectory, tombstone); fs.rmSync(tombstone, { recursive: true, force: true });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  renew(lockId: string, ownerLeaseId: string, ttlMs: number): ResourceLock {
    return this.#metadataMutex.withLock(() => this.#renew(lockId, ownerLeaseId, ttlMs));
  }

  #renew(lockId: string, ownerLeaseId: string, ttlMs: number): ResourceLock {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new Error('RESOURCE_LOCK_TTL_INVALID');
    const active = [...this.#journal.refresh()].reverse()
      .find(({ entry }) => entry.lockId === lockId)?.entry;
    if (!active) throw new Error(`RESOURCE_LOCK_UNKNOWN:${lockId}`);
    if (active.ownerLeaseId !== ownerLeaseId) throw new Error(`RESOURCE_LOCK_OWNER_DENIED:${lockId}`);
    const lockDirectory = path.join(this.#root, `${resourceKey(active.resource)}.active`);
    const ownerFile = path.join(lockDirectory, 'owner.json');
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as LockOwner;
    if (owner.contract.lockId !== lockId) throw new Error(`RESOURCE_LOCK_FENCED:${lockId}`);
    const renewed: ResourceLock = Object.freeze({
      ...active,
      status: 'active',
      expiresAt: new Date(this.#now().getTime() + ttlMs).toISOString(),
    });
    const temporary = path.join(lockDirectory, `owner.${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(
      temporary,
      `${JSON.stringify({ pid: process.pid, contract: renewed } satisfies LockOwner)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    fs.renameSync(temporary, ownerFile);
    this.#journal.append(renewed);
    return renewed;
  }

  release(lockId: string, ownerLeaseId: string): ResourceLock {
    return this.#metadataMutex.withLock(() => this.#release(lockId, ownerLeaseId));
  }

  assertCurrent(lockId: string, ownerLeaseId: string): ResourceLock {
    return this.#metadataMutex.withLock(() => {
      const active = [...this.#journal.refresh()].reverse()
        .find(({ entry }) => entry.lockId === lockId)?.entry;
      if (!active) throw new Error(`RESOURCE_LOCK_UNKNOWN:${lockId}`);
      if (active.ownerLeaseId !== ownerLeaseId) {
        throw new Error(`RESOURCE_LOCK_OWNER_DENIED:${lockId}`);
      }
      if (active.status !== 'active' || Date.parse(active.expiresAt) <= this.#now().getTime()) {
        throw new Error(`RESOURCE_LOCK_EXPIRED:${lockId}`);
      }
      const ownerFile = path.join(
        this.#root,
        `${resourceKey(active.resource)}.active`,
        'owner.json',
      );
      const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as unknown;
      if (!isLockOwner(owner) || owner.contract.lockId !== lockId) {
        throw new Error(`RESOURCE_LOCK_FENCED:${lockId}`);
      }
      return active;
    });
  }

  #release(lockId: string, ownerLeaseId: string): ResourceLock {
    const active = [...this.#journal.refresh()].reverse()
      .find(({ entry }) => entry.lockId === lockId)?.entry;
    if (!active) throw new Error(`RESOURCE_LOCK_UNKNOWN:${lockId}`);
    if (active.ownerLeaseId !== ownerLeaseId) throw new Error(`RESOURCE_LOCK_OWNER_DENIED:${lockId}`);
    if (active.status !== 'active') return active;
    const lockDirectory = path.join(this.#root, `${resourceKey(active.resource)}.active`);
    const ownerFile = path.join(lockDirectory, 'owner.json');
    const current = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as LockOwner;
    if (current.contract.lockId !== lockId) throw new Error(`RESOURCE_LOCK_FENCED:${lockId}`);
    const released: ResourceLock = Object.freeze({
      ...active,
      status: 'released',
      releasedAt: this.#now().toISOString(),
    });
    this.#journal.append(released);
    const tombstone = `${lockDirectory}.released-${crypto.randomUUID()}`;
    fs.renameSync(lockDirectory, tombstone);
    fs.rmSync(tombstone, { recursive: true, force: true });
    return released;
  }
}
