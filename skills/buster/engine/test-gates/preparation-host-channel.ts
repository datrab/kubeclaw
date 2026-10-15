import type { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import {
  decodePreparationMessage, encodePreparationMessage, preparationChunkBytes,
} from './preparation-channel.ts';
import type { StagedAdmission } from './preparation-input.ts';

/** A body-end frame leaves fd3 open for the subsequent admission decision. */
export class PreparationHostInput {
  readonly #channel: NativeWorkerControlChannel;
  readonly #messages: AsyncIterator<Buffer>;
  readonly #admissionId: string;
  #ended = false;
  #decided = false;

  constructor(channel: NativeWorkerControlChannel, admissionId: string) {
    this.#channel = channel;
    this.#messages = channel.messages()[Symbol.asyncIterator]();
    this.#admissionId = admissionId;
  }

  async *chunks(): AsyncGenerator<Buffer> {
    if (this.#ended) throw new Error('BUSTER_PREPARATION_BODY_REPEATED');
    while (true) {
      const message = await this.#next();
      if (message.kind === 'end') {
        this.#ended = true;
        return;
      }
      if (message.kind !== 'bytes') throw new Error('BUSTER_PREPARATION_BODY_FRAME_INVALID');
      yield message.content;
    }
  }

  async admission(staged: StagedAdmission): Promise<boolean> {
    if (!this.#ended || this.#decided) throw new Error('BUSTER_PREPARATION_DECISION_STATE_INVALID');
    this.#decided = true;
    await this.#channel.send(encodePreparationMessage('validated', this.#admissionId,
      Buffer.from(JSON.stringify(staged))));
    const message = await this.#next();
    if (message.kind !== 'proceed' && message.kind !== 'decline') {
      throw new Error('BUSTER_PREPARATION_DECISION_FRAME_INVALID');
    }
    return message.kind === 'proceed';
  }

  async #next() {
    const next = await this.#messages.next();
    if (next.done) throw new Error('BUSTER_PREPARATION_CHANNEL_CLOSED');
    const message = decodePreparationMessage(next.value);
    if (message.admissionId !== this.#admissionId) throw new Error('BUSTER_PREPARATION_CHANNEL_IDENTITY_INVALID');
    return message;
  }
}

export function preparationHostChannelLimits(settings: BusterPreparationSettings) {
  const frames = Math.ceil(settings.maximumRequestBytes / preparationChunkBytes) + 3;
  return {
    maximumMessageBytes: Math.max(preparationChunkBytes, settings.maximumResultBytes) + 17,
    maximumSessionBytes: settings.maximumRequestBytes + settings.maximumResultBytes + frames * 21,
  };
}
