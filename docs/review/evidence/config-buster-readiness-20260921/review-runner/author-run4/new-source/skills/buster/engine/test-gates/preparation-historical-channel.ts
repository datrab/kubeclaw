import type { BusterPreparationSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';
import type { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import { decodePreparationMessage, encodePreparationMessage, preparationChunkBytes } from './preparation-channel.ts';
import { assertHistoricalImportDescriptor, type HistoricalImportDescriptor } from './preparation-historical-reference.ts';

export interface HistoricalStorageReservation {
  readonly bytes: number;
  readonly entries: number;
  readonly metadataBytes: number;
  readonly records: number;
}

export function assertHistoricalStorageReservation(value: unknown): asserts value is HistoricalStorageReservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'bytes,entries,metadataBytes,records'
    || !Object.values(value).every(item => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0)) {
    throw new Error('BUSTER_HISTORICAL_RESERVATION_INVALID');
  }
}

/** One frozen-store transfer and bounded per-record reservation messages. */
export function historicalChannelLimits(descriptor: HistoricalImportDescriptor, settings: BusterPreparationSettings) {
  assertHistoricalImportDescriptor(descriptor);
  const frames = Math.ceil(descriptor.originalStoreBytes / preparationChunkBytes) + 2 * settings.maximumRecords + 4;
  const maximumSessionBytes = descriptor.originalStoreBytes + settings.maximumMetadataBytes + frames * 21;
  if (!Number.isSafeInteger(maximumSessionBytes) || descriptor.originalStoreBytes > settings.maximumSourceBytes) {
    throw new Error('BUSTER_HISTORICAL_CHANNEL_LIMIT');
  }
  return { maximumMessageBytes: Math.max(preparationChunkBytes, settings.maximumResultBytes) + 17, maximumSessionBytes };
}

export class HistoricalHostChannel {
  readonly #channel: NativeWorkerControlChannel;
  readonly #reader: AsyncIterator<Buffer>;
  readonly #importId: string;
  #ended = false;

  constructor(channel: NativeWorkerControlChannel, importId: string) {
    this.#channel = channel;
    this.#reader = channel.messages()[Symbol.asyncIterator]();
    this.#importId = importId;
  }

  async #next() {
    const next = await this.#reader.next();
    if (next.done) throw new Error('BUSTER_HISTORICAL_CHANNEL_CLOSED');
    const message = decodePreparationMessage(next.value);
    if (message.admissionId !== this.#importId) throw new Error('BUSTER_HISTORICAL_CHANNEL_IDENTITY');
    if (message.kind === 'cancel') throw new Error('BUSTER_HISTORICAL_CANCELLED');
    return message;
  }

  async readSnapshot(descriptor: HistoricalImportDescriptor): Promise<Buffer> {
    assertHistoricalImportDescriptor(descriptor);
    if (this.#ended) throw new Error('BUSTER_HISTORICAL_SNAPSHOT_REPEATED');
    const bytes = Buffer.alloc(descriptor.originalStoreBytes);
    let offset = 0;
    while (true) {
      const message = await this.#next();
      if (message.kind === 'end') break;
      if (message.kind !== 'bytes' || offset + message.content.length > bytes.length) throw new Error('BUSTER_HISTORICAL_SOURCE_SIZE');
      message.content.copy(bytes, offset);
      offset += message.content.length;
    }
    this.#ended = true;
    if (offset !== bytes.length) throw new Error('BUSTER_HISTORICAL_SOURCE_SIZE');
    return bytes;
  }

  async reserve(required: HistoricalStorageReservation): Promise<void> {
    if (!this.#ended) throw new Error('BUSTER_HISTORICAL_RESERVATION_STATE');
    assertHistoricalStorageReservation(required);
    await this.#channel.send(encodePreparationMessage('validated', this.#importId, Buffer.from(JSON.stringify(required))));
    const message = await this.#next();
    if (message.kind !== 'proceed') throw new Error('BUSTER_HISTORICAL_RESERVATION_DECLINED');
  }

  async complete(): Promise<void> {
    if (!this.#ended) throw new Error('BUSTER_HISTORICAL_RESERVATION_STATE');
    await this.#channel.send(encodePreparationMessage('end', this.#importId));
  }
}
