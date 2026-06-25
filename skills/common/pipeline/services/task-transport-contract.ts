// Shared TaskQueue/EventBus transport boundary for pipeline work streams.
// Redis remains the production adapter; callers depend on these semantics instead
// of raw Redis stream calls.

type UnknownRecord = Record<string, any>;

export class PipelineTransportContractError extends Error {
  code: string;
  diagnostics: UnknownRecord;

  constructor(message: string, diagnostics: UnknownRecord = {}) {
    super(message);
    this.name = 'PipelineTransportContractError';
    this.code = 'PIPELINE_TRANSPORT_CONTRACT_INVALID';
    this.diagnostics = diagnostics;
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
  return Object.entries(fields).flatMap(([key, value]) => [key, value ?? '']);
}

export function decodeRedisStreamEntry(entry: unknown, reclaimed = false): UnknownRecord | null {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const [id, fields] = entry;
  if (!Array.isArray(fields)) return null;
  const data: UnknownRecord = {};
  for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];
  return { ...data, _id: id, id, fields, data, reclaimed };
}

export function createRedisEventBus(redisClient: UnknownRecord): UnknownRecord {
  const eventBus = {
    async publish(streamKey: string, fields: UnknownRecord, opts: UnknownRecord = {}) {
      if (!streamKey) throw new PipelineTransportContractError('EventBus.publish requires streamKey');
      const id = await redisClient.xadd(streamKey, opts.id || '*', ...flattenTransportFields(fields));
      return { ok: true, id, stream: streamKey };
    },
  };
  return assertEventBusAdapter(eventBus, 'Redis EventBus adapter');
}

export function createRedisTaskQueue(redisClient: UnknownRecord, opts: UnknownRecord = {}): UnknownRecord {
  const streamKey = opts.streamKey;
  const groupName = opts.groupName;
  const consumerName = opts.consumerName;
  const pollInterval = Number(opts.pollInterval);
  const reclaimIdleMs = Number(opts.reclaimIdleMs);
  const maxLen = Number(opts.maxLen);
  if (!Number.isFinite(pollInterval) || pollInterval <= 0) {
    throw new PipelineTransportContractError('TaskQueue pollInterval must be explicit and > 0');
  }
  if (!Number.isFinite(reclaimIdleMs) || reclaimIdleMs <= 0) {
    throw new PipelineTransportContractError('TaskQueue reclaimIdleMs must be explicit and > 0');
  }
  if (!Number.isFinite(maxLen) || maxLen <= 0) {
    throw new PipelineTransportContractError('TaskQueue maxLen must be explicit and > 0');
  }
  const eventBus = createRedisEventBus(redisClient);

  const queue: UnknownRecord = {
    async ensureConsumerGroup(startId = '0') {
      if (!streamKey || !groupName) throw new PipelineTransportContractError('TaskQueue.ensureConsumerGroup requires streamKey and groupName');
      try {
        await redisClient.xgroup('CREATE', streamKey, groupName, startId, 'MKSTREAM');
        return { ok: true, created: true, stream: streamKey, group: groupName };
      } catch (error) {
        if (String((error as Error)?.message || error).includes('BUSYGROUP')) {
          return { ok: true, created: false, stream: streamKey, group: groupName };
        }
        throw error;
      }
    },

    async publishTask(targetStreamKey: string | null, fields: UnknownRecord) {
      return eventBus.publish(targetStreamKey || streamKey, fields);
    },

    async reclaimPending() {
      if (!streamKey || !groupName || !consumerName) throw new PipelineTransportContractError('TaskQueue.reclaimPending requires streamKey, groupName, and consumerName');
      const result = await redisClient.call(
        'XAUTOCLAIM',
        streamKey,
        groupName,
        consumerName,
        String(reclaimIdleMs),
        '0-0',
        'COUNT',
        '1',
      );
      const entries = Array.isArray(result?.[1]) ? result[1] : [];
      return entries.length > 0 ? decodeRedisStreamEntry(entries[0], true) : null;
    },

    async readNext() {
      const reclaimed = await queue.reclaimPending();
      if (reclaimed) return reclaimed;

      const results = await redisClient.xreadgroup(
        'GROUP', groupName, consumerName,
        'COUNT', 1, 'BLOCK', pollInterval,
        'STREAMS', streamKey, '>',
      );
      const streamEntries = results?.[0]?.[1] || [];
      if (!Array.isArray(streamEntries) || streamEntries.length === 0) return null;
      return decodeRedisStreamEntry(streamEntries[0], false);
    },

    async ack(id: string) {
      if (!streamKey || !groupName) throw new PipelineTransportContractError('TaskQueue.ack requires streamKey and groupName');
      await redisClient.xack(streamKey, groupName, id);
      return { ok: true, stream: streamKey, group: groupName, id };
    },

    async trim(len = maxLen) {
      if (!streamKey) throw new PipelineTransportContractError('TaskQueue.trim requires streamKey');
      await redisClient.xtrim(streamKey, 'MAXLEN', '~', len);
      return { ok: true, stream: streamKey, max_len: len };
    },
  };

  return assertTaskQueueAdapter(queue, 'Redis TaskQueue adapter');
}
