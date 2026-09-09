import type {
  EffectJournal,
  EffectReceipt,
  EffectRequest,
} from '@kubeclaw/plugin-sdk';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FileJournal } from '../state/journal.ts';
import { snapshotJson } from '../state/json-value.ts';
import {DependencyRequestIndex, type DependencyQuery} from './dependency-journal.ts';

const INLINE_RESULT_LIMIT_BYTES = 64 * 1024;

interface EffectResultReference {
  readonly schemaVersion: 'effect-result-reference.v1';
  readonly contentDigest: string;
  readonly bytes: number;
}

type EffectJournalEntry =
  | { readonly type: 'requested'; readonly request: EffectRequest }
  | { readonly type: 'accepted'; readonly request: EffectRequest }
  | { readonly type: 'completed'; readonly receipt: EffectReceipt }
  | { readonly type: 'completed-reference'; readonly receipt: EffectReceipt; readonly result: EffectResultReference };

function acceptOnce(accepted: Set<string>, request: EffectRequest, persist?: () => void): boolean {
  if (accepted.has(request.idempotencyKey)) return false;
  persist?.();
  accepted.add(request.idempotencyKey);
  return true;
}

export class MemoryEffectJournal implements EffectJournal {
  readonly #dependencies = new DependencyRequestIndex();
  readonly #requests: EffectRequest[] = [];
  readonly #requestByKey = new Map<string, EffectRequest>();
  readonly #accepted = new Set<string>();
  readonly #receipts = new Map<string, EffectReceipt>();

  async requested(request: EffectRequest): Promise<void> {
    request = snapshotJson(request);
    const existing = this.#requestByKey.get(request.idempotencyKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(request)) {
      throw new Error(`EFFECT_REQUEST_CONFLICT:${request.idempotencyKey}`);
    }
    if (existing) return;
    this.#dependencies.requested(request);
    this.#requests.push(Object.freeze(request));
    this.#requestByKey.set(request.idempotencyKey, Object.freeze(request));
  }

  async accepted(request: EffectRequest): Promise<boolean> {
    return acceptOnce(this.#accepted, request, () => this.#dependencies.accepted(request));
  }

  async completed(receipt: EffectReceipt): Promise<void> {
    receipt = snapshotJson(receipt);
    const existing = this.#receipts.get(receipt.idempotencyKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(receipt)) {
      throw new Error(`EFFECT_RECEIPT_CONFLICT:${receipt.idempotencyKey}`);
    }
    if (!existing) this.#dependencies.completed(receipt);
    this.#receipts.set(receipt.idempotencyKey, Object.freeze(receipt));
  }

  async receipt(idempotencyKey: string): Promise<EffectReceipt | undefined> {
    return this.#receipts.get(idempotencyKey);
  }

  async request(idempotencyKey: string): Promise<EffectRequest | undefined> {
    return this.#requestByKey.get(idempotencyKey);
  }

  entries(): readonly EffectRequest[] {
    return Object.freeze([...this.#requests]);
  }

  async dependencyRequests(query: DependencyQuery): Promise<readonly EffectRequest[]> {
    return this.#dependencies.matches(query);
  }
}

export class FileEffectJournal implements EffectJournal {
  readonly #dependencies = new DependencyRequestIndex();
  readonly #journal: FileJournal<EffectJournalEntry>;
  readonly #resultRoot: string;
  readonly #receipts = new Map<string, EffectReceipt>();
  readonly #requests = new Map<string, EffectRequest>();
  readonly #accepted = new Set<string>();
  #replayedRecords = 0;

  constructor(file: string) {
    this.#journal = new FileJournal(file);
    this.#resultRoot = path.join(path.dirname(path.resolve(file)), 'effect-results', 'sha256');
    this.#replay(this.#journal.records());
  }

  #replay(records: readonly { readonly entry: EffectJournalEntry }[]): void {
    for (const record of records.slice(this.#replayedRecords)) {
      if (record.entry.type === 'requested') {
        this.#dependencies.requested(record.entry.request);
        this.#requests.set(record.entry.request.idempotencyKey, record.entry.request);
      } else if (record.entry.type === 'accepted') {
        this.#dependencies.accepted(record.entry.request);
        this.#accepted.add(record.entry.request.idempotencyKey);
      } else {
        const receipt = record.entry.type === 'completed'
          ? record.entry.receipt
          : this.#hydrate(record.entry.receipt, record.entry.result);
        this.#dependencies.completed(receipt);
        this.#receipts.set(receipt.idempotencyKey, receipt);
      }
      this.#replayedRecords += 1;
    }
  }

  async requested(request: EffectRequest): Promise<void> {
    request = snapshotJson(request);
    this.#journal.transact((records, append) => {
      this.#replay(records);
      const existing = this.#requests.get(request.idempotencyKey);
      if (existing && JSON.stringify(existing) !== JSON.stringify(request)) {
        throw new Error(`EFFECT_REQUEST_CONFLICT:${request.idempotencyKey}`);
      }
      if (existing) return;
      append({ type: 'requested', request });
      this.#dependencies.requested(request);
      this.#requests.set(request.idempotencyKey, request);
      this.#replayedRecords += 1;
    });
  }

  async accepted(request: EffectRequest): Promise<boolean> {
    return this.#journal.transact((records, append) => {
      this.#replay(records);
      if (this.#accepted.has(request.idempotencyKey)) return false;
      append({ type: 'accepted', request });
      this.#dependencies.accepted(request);
      this.#accepted.add(request.idempotencyKey);
      this.#replayedRecords += 1;
      return true;
    });
  }

  async completed(receipt: EffectReceipt): Promise<void> {
    receipt = snapshotJson(receipt);
    const serialized = receipt.result === undefined ? undefined : Buffer.from(JSON.stringify(receipt.result));
    const reference = serialized && serialized.length > INLINE_RESULT_LIMIT_BYTES
      ? this.#persistResult(serialized) : undefined;
    this.#journal.transact((records, append) => {
      this.#replay(records);
      const existing = this.#receipts.get(receipt.idempotencyKey);
      if (existing && JSON.stringify(existing) !== JSON.stringify(receipt)) {
        throw new Error(`EFFECT_RECEIPT_CONFLICT:${receipt.idempotencyKey}`);
      }
      if (existing) return;
      if (reference) {
        const { result: _result, ...withoutResult } = receipt;
        append({ type: 'completed-reference', receipt: withoutResult as EffectReceipt, result: reference });
      } else append({ type: 'completed', receipt });
      this.#dependencies.completed(receipt);
      this.#receipts.set(receipt.idempotencyKey, receipt);
      this.#replayedRecords += 1;
    });
  }

  #resultPath(digest: string): string {
    const hash = digest.replace(/^sha256:/, '');
    return path.join(this.#resultRoot, hash.slice(0, 2), `${hash.slice(2)}.json`);
  }

  #persistResult(serialized: Buffer): EffectResultReference {
    const contentDigest = `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`;
    const target = this.#resultPath(contentDigest);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target);
      if (!existing.equals(serialized)) throw new Error(`EFFECT_RESULT_DIGEST_COLLISION:${contentDigest}`);
    } else {
      const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(descriptor, serialized); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      try { fs.linkSync(temporary, target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (!fs.readFileSync(target).equals(serialized)) throw new Error(`EFFECT_RESULT_DIGEST_COLLISION:${contentDigest}`);
      } finally { fs.rmSync(temporary, { force: true }); }
      const directory = fs.openSync(path.dirname(target), 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
    return Object.freeze({ schemaVersion: 'effect-result-reference.v1', contentDigest, bytes: serialized.length });
  }

  #hydrate(receipt: EffectReceipt, reference: EffectResultReference): EffectReceipt {
    if (reference.schemaVersion !== 'effect-result-reference.v1'
      || !/^sha256:[a-f0-9]{64}$/.test(reference.contentDigest)
      || !Number.isSafeInteger(reference.bytes) || reference.bytes < 1) {
      throw new Error('EFFECT_RESULT_REFERENCE_INVALID');
    }
    const serialized = fs.readFileSync(this.#resultPath(reference.contentDigest));
    if (serialized.length !== reference.bytes) throw new Error(`EFFECT_RESULT_SIZE_MISMATCH:${reference.contentDigest}`);
    const digest = `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`;
    if (digest !== reference.contentDigest) throw new Error(`EFFECT_RESULT_DIGEST_MISMATCH:${reference.contentDigest}`);
    return snapshotJson({ ...receipt,
      result: JSON.parse(serialized.toString('utf8')) as NonNullable<EffectReceipt['result']> });
  }

  async recoveryEntries(): Promise<readonly { request: EffectRequest; accepted: boolean; receiptStatus?: EffectReceipt['status'] }[]> {
    return this.#journal.transact((records) => {
      this.#replay(records);
      return [...this.#requests.values()].map(request => {
        const receipt = this.#receipts.get(request.idempotencyKey);
        return { request: structuredClone(request), accepted: this.#accepted.has(request.idempotencyKey),
          ...(receipt ? { receiptStatus: receipt.status } : {}) };
      });
    });
  }

  async dependencyRequests(query: DependencyQuery): Promise<readonly EffectRequest[]> {
    return this.#journal.transact((records) => {
      this.#replay(records);
      return this.#dependencies.matches(query);
    });
  }

  async receipt(idempotencyKey: string): Promise<EffectReceipt | undefined> {
    return this.#journal.transact((records) => {
      this.#replay(records);
      return this.#receipts.get(idempotencyKey);
    });
  }

  async request(idempotencyKey: string): Promise<EffectRequest | undefined> {
    return this.#journal.transact((records) => {
      this.#replay(records);
      return this.#requests.get(idempotencyKey);
    });
  }
}
