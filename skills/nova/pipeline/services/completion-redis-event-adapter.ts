import { completionStreamKey } from '../core/paths.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { normalizeRedisPipelineEnvelope } from './redis-message-contract.ts';
import { assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';
import {
  adapterErrorMessage,
  attachExternalAbort,
  decodeRedisXreadEntries,
  releaseRedisAdapterClient,
} from './event-adapter-support.ts';
import { objectRecord } from '../value-boundary.ts';

const LIVE_STREAM_START_ID = '$';
const INTENTIONAL_ABORT_ERRORS = [
  'connection is closed', 'connection closed', 'connection forcefully', 'connection ended',
  'connection lost', 'stream isn\'t writeable', 'stream is not writeable',
  'connection is not writable', 'econnreset', 'abort',
];

export function createDedicatedRedisCompletionClient(opts: any = {}) {
  const RedisCtor = opts.RedisCtor ?? loadRedisCtor();
  return createRedisClient(RedisCtor, opts, {
    retryStrategy: opts.retryStrategy ?? ((times: number) => Math.min(times * 100, 5000)),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

function completionIdentity(entry: any) {
  const envelope = normalizeRedisPipelineEnvelope(entry);
  const gateId = envelope.target_kind === 'gate' ? firstPresent(envelope.gate_id, envelope.target_id) : null;
  const moduleId = envelope.target_kind === 'gate' ? (envelope.module ?? null) : firstPresent(envelope.module, envelope.target_id);
  return {
    ...(gateId ? { gate_id: gateId } : {}), ...(moduleId ? { module_id: moduleId } : {}),
    ...(envelope.run_id ? { run_id: envelope.run_id } : {}), ...(envelope.attempt ? { attempt: envelope.attempt } : {}),
    ...(envelope.dispatch_id ? { dispatch_id: envelope.dispatch_id } : {}),
    ...(envelope.session_key ? { session_key: envelope.session_key } : {}),
    ...(entry.gateway_label ? { gateway_label: entry.gateway_label } : {}),
  };
}

function firstPresent(...values: any[]) {
  for (const value of values) if (value !== undefined && value !== null && value !== '') return value;
  return null;
}

function intentionalAbort(error: any, signal: AbortSignal, stopping: boolean) {
  if (!signal.aborted && !stopping) return false;
  const message = String(firstPresent(error?.message, error, '')).toLowerCase();
  return message === '' || INTENTIONAL_ABORT_ERRORS.some((fragment) => message.includes(fragment));
}

class RedisCompletionAdapter {
  eventBus: any;
  stream: string;
  blockMs: number;
  startId: string;
  identity: any;
  controller = new AbortController();
  client: any = null;
  started = false;
  stopping = false;
  donePromise: Promise<any> | null = null;
  detachExternalAbort: () => void;
  opts: any;

  constructor(config: any, opts: any) {
    this.opts = opts;
    this.eventBus = assertPipelineEventBusAdapter(opts.eventBus, 'RedisCompletionEventAdapter eventBus');
    this.stream = opts.stream ?? completionStreamKey(config);
    if (opts.blockMs === undefined || opts.blockMs === null) throw new TypeError('RedisCompletionEventAdapter requires blockMs');
    this.blockMs = Number(opts.blockMs);
    if (!Number.isFinite(this.blockMs) || this.blockMs < 0) throw new TypeError('RedisCompletionEventAdapter blockMs must be a non-negative number');
    this.startId = opts.startId ?? LIVE_STREAM_START_ID;
    this.identity = objectRecord(opts.identity);
    this.detachExternalAbort = attachExternalAbort(this.controller, opts.signal, (reason: any) => this.stop(reason));
  }

  closeClient() {
    this.stopping = true;
    this.client = releaseRedisAdapterClient(this.client);
  }

  stop(reason: any = 'stopped') {
    this.stopping = true;
    if (!this.controller.signal.aborted) this.controller.abort(reason);
    this.closeClient();
  }

  emitEntry(entry: any) {
    if (entry.data.type && entry.data.type !== 'completion') return;
    this.eventBus.emit({
      type: 'completion.evidence', source: 'redis', identity: completionIdentity(entry.data),
      payload: { stream_key: entry.stream || this.stream, redis_id: entry.id, entry: entry.data },
    });
  }

  async run() {
    let lastId = this.startId;
    while (!this.controller.signal.aborted) {
      try {
        const result = await this.client.xread('BLOCK', String(this.blockMs), 'STREAMS', this.stream, lastId);
        if (this.controller.signal.aborted || this.stopping) break;
        for (const entry of decodeRedisXreadEntries(result)) {
          lastId = entry.id;
          this.emitEntry(entry);
        }
      } catch (error: any) {
        if (intentionalAbort(error, this.controller.signal, this.stopping)) break;
        this.eventBus.emit({ type: 'fatal.error', source: 'system', identity: this.identity, payload: { adapter: 'redis_completion', stream_key: this.stream, reason: 'redis_completion_adapter_failed', error: adapterErrorMessage(error) } });
        throw error;
      }
    }
    return { stopped: true, stream_key: this.stream };
  }

  start() {
    if (this.started) return this.donePromise;
    this.started = true;
    if (this.controller.signal.aborted) return Promise.resolve({ stopped: true, stream_key: this.stream });
    this.client = createDedicatedRedisCompletionClient(this.opts);
    this.client.on?.('error', () => {});
    this.donePromise = this.run().finally(() => { this.closeClient(); this.detachExternalAbort(); });
    return this.donePromise;
  }
}

export function createRedisCompletionEventAdapter(config: any, opts: any = {}) {
  const adapter = new RedisCompletionAdapter(config, opts);
  return {
    get client() { return adapter.client; },
    get signal() { return adapter.controller.signal; },
    get done() { return adapter.donePromise; },
    start: () => adapter.start(),
    stop: (reason?: any) => adapter.stop(reason),
  };
}
