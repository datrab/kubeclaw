import type {
  EffectJournal,
  EffectReceipt,
  EffectRequest,
} from '@kubeclaw/plugin-sdk';
import { FileJournal } from '../state/journal.ts';

type EffectJournalEntry =
  | { readonly type: 'requested'; readonly request: EffectRequest }
  | { readonly type: 'accepted'; readonly request: EffectRequest }
  | { readonly type: 'completed'; readonly receipt: EffectReceipt };

function acceptOnce(accepted: Set<string>, request: EffectRequest, persist?: () => void): boolean {
  if (accepted.has(request.idempotencyKey)) return false;
  persist?.();
  accepted.add(request.idempotencyKey);
  return true;
}

export class MemoryEffectJournal implements EffectJournal {
  readonly #requests: EffectRequest[] = [];
  readonly #requestByKey = new Map<string, EffectRequest>();
  readonly #accepted = new Set<string>();
  readonly #receipts = new Map<string, EffectReceipt>();

  async requested(request: EffectRequest): Promise<void> {
    const existing = this.#requestByKey.get(request.idempotencyKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(request)) {
      throw new Error(`EFFECT_REQUEST_CONFLICT:${request.idempotencyKey}`);
    }
    if (existing) return;
    this.#requests.push(Object.freeze(request));
    this.#requestByKey.set(request.idempotencyKey, Object.freeze(request));
  }

  async accepted(request: EffectRequest): Promise<boolean> {
    return acceptOnce(this.#accepted, request);
  }

  async completed(receipt: EffectReceipt): Promise<void> {
    const existing = this.#receipts.get(receipt.idempotencyKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(receipt)) {
      throw new Error(`EFFECT_RECEIPT_CONFLICT:${receipt.idempotencyKey}`);
    }
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
}

export class FileEffectJournal implements EffectJournal {
  readonly #journal: FileJournal<EffectJournalEntry>;
  readonly #receipts = new Map<string, EffectReceipt>();
  readonly #requests = new Map<string, EffectRequest>();
  readonly #accepted = new Set<string>();

  constructor(file: string) {
    this.#journal = new FileJournal(file);
    for (const record of this.#journal.records()) {
      if (record.entry.type === 'requested') {
        this.#requests.set(record.entry.request.idempotencyKey, record.entry.request);
      } else if (record.entry.type === 'accepted') {
        this.#accepted.add(record.entry.request.idempotencyKey);
      }
      if (record.entry.type === 'completed') {
        this.#receipts.set(record.entry.receipt.idempotencyKey, record.entry.receipt);
      }
    }
  }

  async requested(request: EffectRequest): Promise<void> {
    const existing = this.#requests.get(request.idempotencyKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(request)) {
      throw new Error(`EFFECT_REQUEST_CONFLICT:${request.idempotencyKey}`);
    }
    if (existing) return;
    this.#journal.append({ type: 'requested', request });
    this.#requests.set(request.idempotencyKey, request);
  }

  async accepted(request: EffectRequest): Promise<boolean> {
    return acceptOnce(this.#accepted, request, () => {
      this.#journal.append({ type: 'accepted', request });
    });
  }

  async completed(receipt: EffectReceipt): Promise<void> {
    const existing = this.#receipts.get(receipt.idempotencyKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(receipt)) {
      throw new Error(`EFFECT_RECEIPT_CONFLICT:${receipt.idempotencyKey}`);
    }
    if (existing) return;
    this.#journal.append({ type: 'completed', receipt });
    this.#receipts.set(receipt.idempotencyKey, receipt);
  }

  async receipt(idempotencyKey: string): Promise<EffectReceipt | undefined> {
    return this.#receipts.get(idempotencyKey);
  }

  async request(idempotencyKey: string): Promise<EffectRequest | undefined> {
    return this.#requests.get(idempotencyKey);
  }
}
