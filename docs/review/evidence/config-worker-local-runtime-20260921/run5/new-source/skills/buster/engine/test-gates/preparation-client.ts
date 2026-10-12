import { assertBusterInput, type BusterStagedAdmission } from './preparation-input.ts';
import { assertPreparedHeader, preparationDigest } from './preparation-header.ts';
import { randomBytes } from 'node:crypto';
import { publishedPreparationRepository } from './preparation-published.ts';
import type { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import { assertPreparedSource, type PreparedPlanJob, type PreparedSourceReference } from './preparation-header.ts';
import { decodePreparationMessage, encodePreparationMessage, preparationChunks,
  type PreparationMessage, type PreparationMessageKind } from './preparation-channel.ts';

export interface PreparedAdmission {
  readonly job: PreparedPlanJob;
  readonly source: PreparedSourceReference;
}

export interface BusterPreparation {
  stage(chunks: AsyncIterable<Uint8Array>, admit: (job: PreparedPlanJob) => Promise<boolean>): Promise<BusterStagedAdmission | null>;
  extract(staged: BusterStagedAdmission): Promise<PreparedAdmission>;
  repository(source: PreparedSourceReference): Promise<string>;
}

interface Reply {
  readonly kind: PreparationMessageKind;
  readonly pending: ReturnType<typeof Promise.withResolvers<PreparationMessage>>;
}

/** Unprivileged HTTP transport only: it never parses or decodes the submitted archive. */
export class BusterPreparationClient {
  readonly #channel: NativeWorkerControlChannel;
  readonly #maximumPending: number;
  readonly #maximumRequestBytes: number;
  readonly #sourceRoot: string;
  readonly #maximumMetadataBytes: number;
  readonly #requests = new Map<string, Error | null>();
  readonly #replies = new Map<string, Reply>();
  readonly #reader: Promise<void>;
  #failure: Error | undefined;

  constructor(channel: NativeWorkerControlChannel, limits: {
    maximumPendingAdmissions: number; maximumRequestBytes: number; maximumResultBytes: number;
  }, sourceRoot: string) {
    this.#channel = channel;
    this.#maximumPending = limits.maximumPendingAdmissions;
    this.#maximumRequestBytes = limits.maximumRequestBytes;
    this.#sourceRoot = sourceRoot;
    this.#maximumMetadataBytes = limits.maximumResultBytes;
    this.#reader = this.#read().catch(error => {
      this.#failure = error instanceof Error ? error : new Error('BUSTER_PREPARATION_PARENT_LOST');
      for (const reply of this.#replies.values()) reply.pending.reject(this.#failure);
      this.#replies.clear();
      this.#channel.destroy();
    });
  }

  async stage(chunks: AsyncIterable<Uint8Array>, admit: (job: PreparedPlanJob) => Promise<boolean>): Promise<BusterStagedAdmission | null> {
    if (this.#failure) throw this.#failure;
    if (this.#requests.size >= this.#maximumPending) throw new Error('BUSTER_PREPARATION_ADMISSION_FULL');
    // This is a transport correlation only. Root chooses the source admission identity.
    const requestId = randomBytes(16).toString('hex');
    this.#requests.set(requestId, null);
    try {
      await this.#exchange(requestId, 'begin', 'ready');
      for await (const chunk of preparationChunks(chunks, this.#maximumRequestBytes)) {
        await this.#exchange(requestId, 'bytes', 'ack', chunk);
      }
      const preview = await this.#exchange(requestId, 'end', 'validated');
      const job: unknown = JSON.parse(preview.content.toString('utf8'));
      assertPreparedHeader(job);
      const previewDigest = preparationDigest(job);
      const accepted = await admit(structuredClone(job));
      const reply = await this.#exchange(requestId, accepted ? 'proceed' : 'decline', 'result');
      const staged = JSON.parse(reply.content.toString('utf8')) as BusterStagedAdmission | null;
      if (staged === null && !accepted) return null;
      if (!accepted || !staged || Object.keys(staged).sort().join(',') !== 'input,job') {
        throw new Error('BUSTER_PREPARATION_RESULT_INVALID');
      }
      assertBusterInput(staged.input, staged.job);
      if (preparationDigest(staged.job) !== previewDigest) throw new Error('BUSTER_PREPARATION_HEADER_CHANGED');
      return staged;
    } catch (error) {
      await this.#channel.send(encodePreparationMessage('cancel', requestId)).catch(() => {});
      throw error;
    } finally {
      this.#replies.delete(requestId);
      this.#requests.delete(requestId);
    }
  }

  async extract(staged: BusterStagedAdmission): Promise<PreparedAdmission> {
    staged = structuredClone(staged);
    assertBusterInput(staged.input, staged.job);
    if (this.#failure) throw this.#failure;
    if (this.#requests.size >= this.#maximumPending) throw new Error('BUSTER_PREPARATION_ADMISSION_FULL');
    const requestId = randomBytes(16).toString('hex');
    this.#requests.set(requestId, null);
    try {
      const reply = await this.#exchange(requestId, 'extract', 'result', Buffer.from(JSON.stringify(staged)));
      const prepared = JSON.parse(reply.content.toString('utf8')) as PreparedAdmission;
      if (!prepared || Object.keys(prepared).sort().join(',') !== 'job,source') throw new Error('BUSTER_PREPARATION_RESULT_INVALID');
      assertPreparedSource(prepared.source, prepared.job);
      if (preparationDigest(prepared.job) !== staged.input.headerDigest) throw new Error('BUSTER_PREPARATION_HEADER_CHANGED');
      return prepared;
    } catch (error) {
      await this.#channel.send(encodePreparationMessage('cancel', requestId)).catch(() => {});
      throw error;
    } finally {
      this.#replies.delete(requestId);
      this.#requests.delete(requestId);
    }
  }

  async disconnected(): Promise<void> {
    await this.#reader;
    throw this.#failure ?? new Error('BUSTER_PREPARATION_PARENT_LOST');
  }

  async close(): Promise<void> { this.#channel.destroy(); await this.#reader; }

  repository(source: PreparedSourceReference): Promise<string> {
    return publishedPreparationRepository(this.#sourceRoot, source, this.#maximumMetadataBytes);
  }

  async #exchange(id: string, sent: PreparationMessageKind, expected: PreparationMessageKind,
    content: Buffer = Buffer.alloc(0)): Promise<PreparationMessage> {
    if (this.#failure) throw this.#failure;
    const failure = this.#requests.get(id);
    if (failure) throw failure;
    const pending = Promise.withResolvers<PreparationMessage>();
    // Observe a reply rejection even when the simultaneous send fails first.
    void pending.promise.catch(() => {});
    this.#replies.set(id, { kind: expected, pending });
    await this.#channel.send(encodePreparationMessage(sent, id, content));
    return pending.promise;
  }

  async #read(): Promise<void> {
    for await (const bytes of this.#channel.messages()) {
      const message = decodePreparationMessage(bytes);
      const reply = this.#replies.get(message.admissionId);
      if (message.kind === 'failure') {
        const failure = new Error(message.content.toString('utf8'));
        if (this.#requests.has(message.admissionId)) this.#requests.set(message.admissionId, failure);
        reply?.pending.reject(failure);
        this.#replies.delete(message.admissionId);
        continue;
      }
      if (!reply) throw new Error('BUSTER_PREPARATION_REPLY_UNEXPECTED');
      if (message.kind !== reply.kind) throw new Error('BUSTER_PREPARATION_REPLY_UNEXPECTED');
      this.#replies.delete(message.admissionId);
      reply.pending.resolve(message);
    }
    throw new Error('BUSTER_PREPARATION_PARENT_LOST');
  }
}
