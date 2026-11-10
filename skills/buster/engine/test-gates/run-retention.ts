import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeDurableState, ensureDirectoryDurable } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { runDirectory, type RunHeader } from './run-records.ts';
export type RunRetentionPolicy = {
  readonly mode: 'delete_after_delivery';
} | {
  readonly mode: 'retain_days';
  readonly days: number;
};
export interface DeliveryReceipt extends RunHeader {
  readonly schemaVersion: 'buster-delivery-receipt.v1';
  readonly deliveredAt: string | null;
  readonly purgeRequestedAt: string;
  readonly deletedAt: string | null;
  readonly expiresAt: string;
}
export const maximumRetentionMs = 14 * 86400000;
export function retentionPolicy(value: unknown): RunRetentionPolicy {
  if (value === undefined)
    return { mode: 'delete_after_delivery' };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('BUSTER_RETENTION_INVALID');
  const v = value as Record<string, unknown>;
  if (v.mode === 'delete_after_delivery' && Object.keys(v).length === 1)
    return { mode: v.mode };
  if (v.mode === 'retain_days' && Object.keys(v).length === 2 && Number.isSafeInteger(v.days) && (v.days as number) >= 1 && (v.days as number) <= 14)
    return { mode: v.mode, days: v.days as number };
  throw new Error('BUSTER_RETENTION_INVALID');
}
export class BusterRunRetention {
  readonly policy: RunRetentionPolicy;
  readonly root: string;
  readonly maximumReceipts: number;
  constructor(root: string, value?: RunRetentionPolicy, maximumReceipts = 10000) { this.root = path.resolve(root); this.policy = retentionPolicy(value); this.maximumReceipts = maximumReceipts; }
  async admissionAvailable() { try {
    return (await fs.readdir(path.join(this.root, 'receipts'))).filter(n => /^[a-f0-9]{64}\.json$/u.test(n)).length < this.maximumReceipts;
  }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return true;
    throw e;
  } }
  file(jobId: string) { return path.join(runDirectory(path.join(this.root, 'receipts'), jobId) + '.json'); }
  async receipt(jobId: string): Promise<DeliveryReceipt | null> {
    const file = this.file(jobId);
    let stat;
    try {
      stat = await fs.lstat(file);
    }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return null;
      throw e;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(file) !== path.resolve(file) || stat.size > 16384)
      throw new Error('BUSTER_RETENTION_RECEIPT_INVALID');
    const r = JSON.parse(await fs.readFile(file, 'utf8')) as DeliveryReceipt;
    if (r.schemaVersion !== 'buster-delivery-receipt.v1' || r.jobId !== jobId || r.requestDigest !== r.status.requestDigest || r.status.jobId !== jobId || !Number.isFinite(Date.parse(r.expiresAt)))
      throw new Error('BUSTER_RETENTION_RECEIPT_INVALID');
    return r;
  }
  async confirm(header: RunHeader, input: {
    requestDigest: string;
    resultDigest: string | null;
  }, now: string) {
    if (header.requestDigest !== input.requestDigest || (header.status.result?.resultDigest ?? null) !== input.resultDigest)
      throw new Error('BUSTER_DELIVERY_CONFLICT');
    if (!['completed', 'failed', 'cancelled'].includes(header.status.state))
      throw new Error('BUSTER_DELIVERY_NOT_TERMINAL');
    const old = await this.receipt(header.jobId);
    if (old)
      return old;
    await ensureDirectoryDurable(path.join(this.root, 'receipts'));
    if ((await fs.readdir(path.join(this.root, 'receipts'))).filter(n => /^[a-f0-9]{64}\.json$/u.test(n)).length >= this.maximumReceipts)
      throw new Error('BUSTER_DELIVERY_RECEIPT_CAPACITY_EXCEEDED');
    const r: DeliveryReceipt = { ...header, status: { ...header.status, error: header.status.error ? 'BUSTER_REMOTE_DATA_EXPIRED' : null }, schemaVersion: 'buster-delivery-receipt.v1', deliveredAt: now, purgeRequestedAt: now, deletedAt: null, expiresAt: new Date(Date.parse(now) + maximumRetentionMs).toISOString() };
    await writeDurableState(this.file(header.jobId), r);
    return r;
  }
  async #remove(receipt: DeliveryReceipt, now: string, runtimeRoot: string) {
    await ensureDirectoryDurable(runtimeRoot);
    for (const directory of [runDirectory(runtimeRoot, receipt.jobId), runDirectory(path.join(this.root, 'jobs'), receipt.jobId)]) {
      try {
        const s = await fs.lstat(directory);
        if (!s.isDirectory() || s.isSymbolicLink())
          throw new Error('BUSTER_RETENTION_PATH_INVALID');
        await fs.rm(directory, { recursive: true, force: true });
      }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
          throw e;
      }
      const parent = await fs.open(path.dirname(directory), 'r');
      try {
        await parent.sync();
      }
      finally {
        await parent.close();
      }
    }
    await writeDurableState(this.file(receipt.jobId), { ...receipt, deletedAt: now, expiresAt: new Date(Date.parse(now) + maximumRetentionMs).toISOString() });
  }
  async sweep(headers: readonly RunHeader[], now: string, runtimeRoot: string, protectedJobs: ReadonlySet<string>) {
    const timestamp = Date.parse(now);
    if (!Number.isFinite(timestamp))
      throw new Error('BUSTER_RETENTION_CLOCK_INVALID');
    const deleted: string[] = [], held: string[] = [];
    for (const h of headers) {
      if (!['completed', 'failed', 'cancelled'].includes(h.status.state) || protectedJobs.has(h.jobId))
        continue;
      const age = timestamp - Date.parse(h.status.updatedAt);
      if (!Number.isFinite(age) || age < 0)
        continue;
      let receipt = await this.receipt(h.jobId);
      const due = age >= (this.policy.mode === 'retain_days' ? this.policy.days * 86400000 : maximumRetentionMs) || (this.policy.mode === 'delete_after_delivery' && receipt?.deliveredAt !== null && receipt !== null);
      if (!due)
        continue;
      if (h.quiescent !== true) {
        held.push(h.jobId);
        continue;
      }
      if (!receipt) {
        receipt = { ...h, status: { ...h.status, error: h.status.error ? 'BUSTER_REMOTE_DATA_EXPIRED' : null }, schemaVersion: 'buster-delivery-receipt.v1', deliveredAt: null, purgeRequestedAt: now, deletedAt: null, expiresAt: new Date(timestamp + maximumRetentionMs).toISOString() };
        await writeDurableState(this.file(h.jobId), receipt);
      }
      // A durable small receipt precedes deletion. Resume it even if the header
      // was already unlinked by an interrupted recursive removal.
      await this.#remove(receipt, now, runtimeRoot);
      deleted.push(h.jobId);
    }
    const dir = path.join(this.root, 'receipts');
    await ensureDirectoryDurable(dir);
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isFile() && /^[a-f0-9]{64}\.json\.\d+\.[a-f0-9-]+\.tmp$/u.test(e.name)) {
        await fs.unlink(path.join(dir, e.name));
        continue;
      }
      if (!e.isFile() || !(/^[a-f0-9]{64}\.json$/u.test(e.name)))
        throw new Error('BUSTER_RETENTION_PATH_INVALID');
      const file = path.join(dir, e.name);
      const s = await fs.lstat(file);
      if (s.size > 16384)
        throw new Error('BUSTER_RETENTION_RECEIPT_INVALID');
      const r = JSON.parse(await fs.readFile(file, 'utf8')) as DeliveryReceipt;
      if (crypto.createHash('sha256').update(r.jobId).digest('hex') + '.json' !== e.name)
        throw new Error('BUSTER_RETENTION_RECEIPT_INVALID');
      const headerPresent = headers.some(h => h.jobId === r.jobId && !deleted.includes(h.jobId));
      const due = timestamp - Date.parse(r.status.updatedAt) >= (this.policy.mode === 'retain_days' ? this.policy.days * 86400000 : maximumRetentionMs) || (this.policy.mode === 'delete_after_delivery' && r.deliveredAt !== null);
      if (!headerPresent && r.quiescent === true && r.deletedAt === null && due && !protectedJobs.has(r.jobId)) {
        await this.#remove(r, now, runtimeRoot);
        deleted.push(r.jobId);
        continue; // Removal renewed the replay window; do not expire the stale receipt.
      }
      if (Date.parse(r.expiresAt) <= timestamp && !headerPresent && !protectedJobs.has(r.jobId))
        await fs.unlink(file);
    }
    return { deleted, held };
  }
}
