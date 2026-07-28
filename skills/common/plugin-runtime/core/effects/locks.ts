import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ResourceLock } from '../../sdk/src/index.ts';
import { FileJournal } from '../state/journal.ts';

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
  return contract.schemaVersion === 'resource-lock.v2'
    && typeof contract.lockId === 'string'
    && typeof contract.ownerLeaseId === 'string'
    && typeof contract.expiresAt === 'string'
    && Number.isFinite(Date.parse(contract.expiresAt))
    && Number.isSafeInteger(contract.fencingToken)
    && contract.fencingToken! >= 1
    && contract.status === 'active'
    && Boolean(contract.resource)
    && typeof contract.resource?.type === 'string'
    && typeof contract.resource?.canonicalId === 'string';
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

const metadataGuardWaitBuffer = new Int32Array(new SharedArrayBuffer(4));

function waitForMetadataGuard(): void {
  Atomics.wait(metadataGuardWaitBuffer, 0, 0, 10);
}

export class FileResourceLockManager {
  readonly #root: string;
  readonly #journal: FileJournal<ResourceLock>;
  readonly #now: () => Date;
  readonly #provisionalTtlMs = 60_000;

  constructor(root: string, now: () => Date = () => new Date()) {
    this.#root = path.resolve(root);
    this.#now = now;
    fs.mkdirSync(this.#root, { recursive: true });
    this.#journal = new FileJournal(path.join(this.#root, 'locks.jsonl'));
  }

  #withMetadataGuard<T>(operation: () => T): T {
    const guardFile = path.join(this.#root, 'metadata.guard');
    const token = crypto.randomUUID();
    const deadline = Date.now() + 5_000;
    for (;;) {
      const temporary = `${guardFile}.${token}.tmp`;
      fs.writeFileSync(
        temporary,
        `${JSON.stringify({ token, pid: process.pid })}\n`,
        { flag: 'wx', mode: 0o600 },
      );
      try {
        fs.linkSync(temporary, guardFile);
        fs.unlinkSync(temporary);
        break;
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let owner: { token?: unknown; pid?: unknown };
        try {
          owner = JSON.parse(fs.readFileSync(guardFile, 'utf8')) as {
            token?: unknown;
            pid?: unknown;
          };
        } catch {
          const corrupt = `${guardFile}.corrupt-${crypto.randomUUID()}`;
          try {
            fs.renameSync(guardFile, corrupt);
          } catch (renameError) {
            if ((renameError as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw renameError;
          }
          fs.rmSync(corrupt, { force: true });
          continue;
        }
        if (typeof owner.pid === 'number' && processAlive(owner.pid)) {
          if (Date.now() >= deadline) throw new Error('RESOURCE_LOCK_METADATA_TIMEOUT');
          waitForMetadataGuard();
          continue;
        }
        const stale = `${guardFile}.stale-${crypto.randomUUID()}`;
        try {
          fs.renameSync(guardFile, stale);
        } catch (renameError) {
          if ((renameError as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw renameError;
        }
        fs.rmSync(stale, { force: true });
      }
    }
    try {
      return operation();
    } finally {
      try {
        const owner = JSON.parse(fs.readFileSync(guardFile, 'utf8')) as { token?: unknown };
        if (owner.token === token) fs.unlinkSync(guardFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }

  acquire(
    resource: ResourceLock['resource'],
    ownerLeaseId: string,
    ttlMs: number,
  ): ResourceLock {
    return this.#withMetadataGuard(
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
    for (;;) {
      try {
        fs.mkdirSync(lockDirectory);
        fs.writeFileSync(
          claimFile,
          `${JSON.stringify({ token: claimToken, pid: process.pid })}\n`,
          { flag: 'wx', mode: 0o600 },
        );
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let owner: LockOwner | undefined;
        try {
          const parsed = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as unknown;
          if (isLockOwner(parsed)) owner = parsed;
        } catch {
          // Missing, torn, or invalid owner metadata is a provisional claim.
        }
        if (
          !owner
          && this.#now().getTime() - fs.statSync(lockDirectory).mtimeMs < this.#provisionalTtlMs
        ) {
          throw new Error(`RESOURCE_LOCK_PROVISIONING:${resource.canonicalId}`);
        }
        if (
          owner
          && processAlive(owner.pid)
        ) {
          // A live local adapter may still be unwinding an external operation
          // after lease expiry. Do not admit a replacement until that process
          // releases the execution boundary or exits.
          if (owner.contract.ownerLeaseId === ownerLeaseId) {
            throw new Error(`RESOURCE_LOCK_REENTRANT_DENIED:${resource.canonicalId}`);
          }
          throw new Error(`RESOURCE_LOCKED:${resource.canonicalId}`);
        }
        const tombstone = `${lockDirectory}.expired-${crypto.randomUUID()}`;
        try {
          fs.renameSync(lockDirectory, tombstone);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        const expired: ResourceLock | undefined = owner
          ? Object.freeze({ ...owner.contract, status: 'expired' })
          : undefined;
        try {
          if (expired) this.#journal.append(expired);
        } finally {
          fs.rmSync(tombstone, { recursive: true, force: true });
        }
      }
    }
    try {
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
    } catch (error) {
      try {
        const claim = JSON.parse(fs.readFileSync(claimFile, 'utf8')) as { token?: unknown };
        if (claim.token === claimToken) {
          const tombstone = `${lockDirectory}.failed-${claimToken}`;
          fs.renameSync(lockDirectory, tombstone);
          fs.rmSync(tombstone, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupError;
      }
      throw error;
    }
  }

  renew(lockId: string, ownerLeaseId: string, ttlMs: number): ResourceLock {
    return this.#withMetadataGuard(() => this.#renew(lockId, ownerLeaseId, ttlMs));
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
    return this.#withMetadataGuard(() => this.#release(lockId, ownerLeaseId));
  }

  assertCurrent(lockId: string, ownerLeaseId: string): ResourceLock {
    return this.#withMetadataGuard(() => {
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
