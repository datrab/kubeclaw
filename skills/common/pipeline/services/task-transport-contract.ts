import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { StructuredOperationError } from '../operation-result.ts';
// Shared TaskQueue/EventBus transport boundary for pipeline work streams.
// Redis remains the production adapter; callers depend on these semantics instead
// of raw Redis stream calls.

type UnknownRecord = Record<string, any>;

type QueueOptions = {
  streamKey: string;
  groupName: string;
  consumerName: string;
  pollInterval: number;
  reclaimIdleMs: number;
  maxLen: number;
};

export class PipelineTransportContractError extends StructuredOperationError {
  constructor(message: string, diagnostics: UnknownRecord = {}) {
    super('PIPELINE_TRANSPORT_CONTRACT_INVALID', message, { diagnostics });
    this.name = 'PipelineTransportContractError';
  }
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertMethod(adapter: UnknownRecord, method: string, label: string): void {
  if (typeof adapter?.[method] !== 'function') {
    throw new PipelineTransportContractError(`${label} must expose ${method}(...)`, { method });
  }
}

function transportFieldValue(value: unknown): unknown {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : value;
}

export function assertTaskQueueAdapter(adapter: UnknownRecord, label = 'TaskQueue adapter'): UnknownRecord {
  for (const method of ['publishTask', 'readNext', 'reclaimPending', 'ack', 'trim']) assertMethod(adapter, method, label);
  return adapter;
}

export function assertEventBusAdapter(adapter: UnknownRecord, label = 'EventBus adapter'): UnknownRecord {
  assertMethod(adapter, 'publish', label);
  return adapter;
}

export function flattenTransportFields(fields: UnknownRecord = {}): any[] {
  if (!isPlainObject(fields)) {
    throw new PipelineTransportContractError('transport fields must be an object', { fields });
  }
  return Object.entries(fields).flatMap(([key, value]) => [key, transportFieldValue(value)]);
}

export function decodeRedisStreamEntry(entry: unknown, reclaimed = false): UnknownRecord | null {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const [id, fields] = entry;
  if (!Array.isArray(fields)) return null;
  const data: UnknownRecord = {};
  for (let i = 0; i < fields.length; i += 2) data[String(fields[i])] = fields[i + 1];
  return { ...data, _id: id, id, fields, data, reclaimed };
}

export function createRedisEventBus(redisClient: UnknownRecord): UnknownRecord {
  const eventBus = {
    async publish(streamKey: string, fields: UnknownRecord, opts: UnknownRecord = {}) {
      if (!streamKey) throw new PipelineTransportContractError('EventBus.publish requires streamKey');
      const id = await redisClient.xadd(streamKey, selectDefinedValue(() => (opts.id), () => ('*')), ...flattenTransportFields(fields));
      return { ok: true, id, stream: streamKey };
    },
  };
  return assertEventBusAdapter(eventBus, 'Redis EventBus adapter');
}

function positiveNumber(value: unknown, name: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new PipelineTransportContractError(`TaskQueue ${name} must be explicit and > 0`);
  }
  return number;
}

function queueOptions(opts: UnknownRecord): QueueOptions {
  return {
    streamKey: String(opts.streamKey ?? ''),
    groupName: String(opts.groupName ?? ''),
    consumerName: String(opts.consumerName ?? ''),
    pollInterval: positiveNumber(opts.pollInterval, 'pollInterval'),
    reclaimIdleMs: positiveNumber(opts.reclaimIdleMs, 'reclaimIdleMs'),
    maxLen: positiveNumber(opts.maxLen, 'maxLen'),
  };
}

function redisReplyCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('code' in error && typeof error.code === 'string' && error.code) return error.code;
  if (!('message' in error) || typeof error.message !== 'string') return null;
  const [code] = error.message.trim().split(/\s+/, 1);
  return code || null;
}

class RedisTaskQueueAdapter {
  readonly #redisClient: UnknownRecord;
  readonly #eventBus: UnknownRecord;
  readonly #options: QueueOptions;

  constructor(redisClient: UnknownRecord, options: QueueOptions) {
    this.#redisClient = redisClient;
    this.#eventBus = createRedisEventBus(redisClient);
    this.#options = options;
  }

  async ensureConsumerGroup(startId = '0') {
    const { streamKey, groupName } = this.#options;
    if (!streamKey || !groupName) throw new PipelineTransportContractError('TaskQueue.ensureConsumerGroup requires streamKey and groupName');
    try {
      await this.#redisClient.xgroup('CREATE', streamKey, groupName, startId, 'MKSTREAM');
      return { ok: true, created: true, stream: streamKey, group: groupName };
    } catch (error) {
      if (redisReplyCode(error) === 'BUSYGROUP') {
        return { ok: true, created: false, stream: streamKey, group: groupName };
      }
      throw error;
    }
  }

  async publishTask(targetStreamKey: string | null, fields: UnknownRecord) {
    return this.#eventBus.publish(taskPublishStreamAuthority(targetStreamKey, this.#options.streamKey), fields);
  }

  async reclaimPending() {
    const { streamKey, groupName, consumerName, reclaimIdleMs } = this.#options;
    if (!streamKey || !groupName || !consumerName) throw new PipelineTransportContractError('TaskQueue.reclaimPending requires streamKey, groupName, and consumerName');
    const result = await this.#redisClient.call(
      'XAUTOCLAIM', streamKey, groupName, consumerName, String(reclaimIdleMs), '0-0', 'COUNT', '1',
    );
    const entries = Array.isArray(result?.[1]) ? result[1] : [];
    return entries.length > 0 ? decodeRedisStreamEntry(entries[0], true) : null;
  }

  async readNext() {
    const reclaimed = await this.reclaimPending();
    if (reclaimed) return reclaimed;
    const { streamKey, groupName, consumerName, pollInterval } = this.#options;
    const results = await this.#redisClient.xreadgroup(
      'GROUP', groupName, consumerName, 'COUNT', 1, 'BLOCK', pollInterval, 'STREAMS', streamKey, '>',
    );
    const streamEntries = results?.[0]?.[1] ?? [];
    if (!Array.isArray(streamEntries) || streamEntries.length === 0) return null;
    return decodeRedisStreamEntry(streamEntries[0], false);
  }

  async ack(id: string) {
    const { streamKey, groupName } = this.#options;
    if (!streamKey || !groupName) throw new PipelineTransportContractError('TaskQueue.ack requires streamKey and groupName');
    await this.#redisClient.xack(streamKey, groupName, id);
    return { ok: true, stream: streamKey, group: groupName, id };
  }

  async trim(len = this.#options.maxLen) {
    const { streamKey } = this.#options;
    if (!streamKey) throw new PipelineTransportContractError('TaskQueue.trim requires streamKey');
    await this.#redisClient.xtrim(streamKey, 'MAXLEN', '~', len);
    return { ok: true, stream: streamKey, max_len: len };
  }
}

export function createRedisTaskQueue(redisClient: UnknownRecord, opts: UnknownRecord = {}): UnknownRecord {
  const options = queueOptions(opts);
  const queue = new RedisTaskQueueAdapter(redisClient, options);
  return assertTaskQueueAdapter(queue as unknown as UnknownRecord, 'Redis TaskQueue adapter');
}

function taskPublishStreamAuthority(targetStreamKey: string | null | undefined, streamKey: string): string {
  if (targetStreamKey) return targetStreamKey;
  return streamKey;
}
