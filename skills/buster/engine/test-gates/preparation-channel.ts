import type { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { busterStartupAssociationBytes } from '@kubeclaw/plugin-foundation/config/buster-startup';

export const preparationChunkBytes = 64 * 1024;
const framePrefixBytes = 17;
const nativeFrameHeaderBytes = 4;
export type PreparationMessageKind = 'begin' | 'bytes' | 'end' | 'cancel' | 'ready' | 'ack' | 'result' | 'failure' | 'validated' | 'proceed' | 'decline' | 'extract' | 'startup' | 'startup-ack';
const kinds: readonly PreparationMessageKind[] = ['begin', 'bytes', 'end', 'cancel', 'ready', 'ack', 'result', 'failure', 'validated', 'proceed', 'decline', 'extract', 'startup', 'startup-ack'];

export function preparationServiceChannelLimits(settings: BusterPreparationSettings) {
  // Stage: body/ack pairs, begin/ready, end/preview, decision/result.
  // Extract: retained-input request/result. Reserve one cancel/failure pair too.
  const frames = 2 * Math.ceil(settings.maximumRequestBytes / preparationChunkBytes) + 10;
  const perRequest = settings.maximumRequestBytes + 4 * settings.maximumResultBytes
    + frames * (framePrefixBytes + nativeFrameHeaderBytes);
  const startupWireBytes = busterStartupAssociationBytes + framePrefixBytes;
  const maximumSessionBytes = settings.maximumRecords * perRequest + 2 * (startupWireBytes + nativeFrameHeaderBytes);
  if (!Number.isSafeInteger(maximumSessionBytes)) throw new Error('BUSTER_PREPARATION_CHANNEL_LIMIT_INVALID');
  return { maximumMessageBytes: Math.max(settings.maximumResultBytes + framePrefixBytes, startupWireBytes), maximumSessionBytes };
}

/** HTTP segmentation never changes the accepted wire-byte budget or framing allowance. */
export async function* preparationChunks(input: AsyncIterable<Uint8Array>, maximumBytes: number): AsyncGenerator<Buffer> {
  let pending = Buffer.allocUnsafe(preparationChunkBytes);
  let used = 0;
  let total = 0;
  for await (const chunk of input) {
    total += chunk.byteLength;
    if (total > maximumBytes) throw new Error('BUSTER_REMOTE_REQUEST_SIZE_EXCEEDED');
    for (let offset = 0; offset < chunk.byteLength;) {
      const count = Math.min(pending.length - used, chunk.byteLength - offset);
      pending.set(chunk.subarray(offset, offset + count), used);
      used += count;
      offset += count;
      if (used === pending.length) {
        yield pending;
        pending = Buffer.allocUnsafe(preparationChunkBytes);
        used = 0;
      }
    }
  }
  if (used) yield pending.subarray(0, used);
}

export interface PreparationMessage {
  readonly kind: PreparationMessageKind;
  readonly admissionId: string;
  readonly content: Buffer;
}

/** Fixed Buster phases. No paths, command names or launch credentials are accepted. */
export function encodePreparationMessage(kind: PreparationMessageKind, admissionId: string, content: Buffer = Buffer.alloc(0)): Buffer {
  if (!/^[a-f0-9]{32}$/u.test(admissionId)) throw new Error('BUSTER_PREPARATION_ADMISSION_ID_INVALID');
  const code = kinds.indexOf(kind);
  if (code < 0) throw new Error('BUSTER_PREPARATION_MESSAGE_INVALID');
  return Buffer.concat([Buffer.from([code]), Buffer.from(admissionId, 'hex'), content]);
}

export function decodePreparationMessage(bytes: Buffer): PreparationMessage {
  const code = bytes[0];
  const kind = code === undefined ? undefined : kinds[code];
  if (bytes.byteLength < framePrefixBytes || !kind) throw new Error('BUSTER_PREPARATION_MESSAGE_INVALID');
  const content = bytes.subarray(framePrefixBytes);
  if (['begin', 'end', 'cancel', 'ready', 'ack', 'proceed', 'decline'].includes(kind) && content.byteLength !== 0) {
    throw new Error('BUSTER_PREPARATION_MESSAGE_INVALID');
  }
  if (kind === 'bytes' && (!content.byteLength || content.byteLength > preparationChunkBytes)) {
    throw new Error('BUSTER_PREPARATION_CHUNK_INVALID');
  }
  return { kind, admissionId: bytes.subarray(1, framePrefixBytes).toString('hex'), content };
}

export function sendPreparationMessage(channel: NativeWorkerControlChannel, message: PreparationMessage): Promise<void> {
  return channel.send(encodePreparationMessage(message.kind, message.admissionId, message.content));
}

/** One acknowledged chunk at a time; a stalled native child cannot accumulate an archive here. */
export class PreparationIngress {
  readonly #maximumBytes: number;
  #bytes = 0;
  #pending: { bytes: Buffer; consumed: ReturnType<typeof Promise.withResolvers<void>> } | undefined;
  #available = Promise.withResolvers<void>();
  #ended = false;
  #failure: unknown;
  #reading = false;

  constructor(maximumBytes: number) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('BUSTER_PREPARATION_INGRESS_LIMIT_INVALID');
    this.#maximumBytes = maximumBytes;
  }

  async write(bytes: Buffer): Promise<void> {
    if (this.#ended || this.#pending) throw new Error('BUSTER_PREPARATION_INGRESS_STATE_INVALID');
    if (!bytes.byteLength || bytes.byteLength > preparationChunkBytes
      || this.#bytes + bytes.byteLength > this.#maximumBytes) throw new Error('BUSTER_REMOTE_REQUEST_SIZE_EXCEEDED');
    this.#bytes += bytes.byteLength;
    const consumed = Promise.withResolvers<void>();
    this.#pending = { bytes: Buffer.from(bytes), consumed };
    this.#available.resolve();
    await consumed.promise;
  }

  end(): void {
    if (this.#ended || this.#pending) throw new Error('BUSTER_PREPARATION_INGRESS_STATE_INVALID');
    this.#ended = true;
    this.#available.resolve();
  }

  fail(error: unknown): void {
    this.#failure = error;
    this.#ended = true;
    this.#pending?.consumed.reject(error);
    this.#pending = undefined;
    this.#available.resolve();
  }

  async *chunks(): AsyncGenerator<Buffer> {
    if (this.#reading) throw new Error('BUSTER_PREPARATION_INGRESS_READER_REPEATED');
    this.#reading = true;
    try {
      while (!this.#ended) {
        await this.#available.promise;
        if (this.#failure) throw this.#failure;
        const pending = this.#pending;
        if (!pending) continue;
        yield pending.bytes;
        this.#pending = undefined;
        this.#available = Promise.withResolvers<void>();
        pending.consumed.resolve();
      }
      if (this.#failure) throw this.#failure;
    } finally {
      if (this.#pending) this.fail(new Error('BUSTER_PREPARATION_INGRESS_READER_CLOSED'));
    }
  }
}
