import {
  AGENT_OBSERVABILITY_DEADLETTER_STREAM,
  AGENT_OBSERVABILITY_REDIS_DATA_FIELD,
  checkAgentObservabilityPayloadSize,
  selectAgentObservabilityStreamKey,
  selectAgentObservabilityStreamKind,
} from './generated/agent-observability/index.ts';
import type {
  AgentObservabilityIngressEventV1,
  AgentObservabilityStreamKind,
} from './generated/agent-observability/index.ts';
import { createRedisClient, loadRedisCtor } from './redis-transport.ts';
import type { AgentObserverConfig } from './config.ts';
import type {
  AgentObserverRedisWriterOptions,
  AgentObserverWriterStats,
  Logger,
  QueuedEvent,
  RedisClient,
  RedisClientFactory,
} from './redis-writer-types.ts';
export type { AgentObserverRedisWriterOptions, AgentObserverWriterStats } from './redis-writer-types.ts';
import { setTimeout as delay } from 'node:timers/promises';

function defaultRedisClientFactory(config: AgentObserverConfig): RedisClient {
  const RedisCtor = loadRedisCtor();
  return createRedisClient(
    RedisCtor,
    {
      host: config.redisHost,
      port: config.redisPort,
      username: config.redisUsername,
      password: config.redisPassword,
      tls: config.redisTls,
      networkIsolation: config.redisNetworkIsolation,
    },
    {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  ) as RedisClient;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  const timeout = delay(timeoutMs, undefined, { ref: false }).then(() => {
    throw new Error(message);
  });
  return Promise.race([promise, timeout]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AgentObserverRedisWriter {
  private config: AgentObserverConfig;
  private readonly logger: Logger;
  private readonly redisClientFactory: RedisClientFactory;
  private redis: RedisClient | null = null;
  private flushPromise: Promise<void> | null = null;
  private scheduled = false;
  private readonly loggedFailures = new Set<string>();
  private readonly queues: Record<AgentObservabilityStreamKind, QueuedEvent[]> = {
    control: [],
    payload: [],
  };

  private readonly stats: AgentObserverWriterStats = {
    enqueued: 0,
    enqueuedControl: 0,
    enqueuedPayload: 0,
    written: 0,
    writtenControl: 0,
    writtenPayload: 0,
    droppedDisabled: 0,
    droppedQueueFull: 0,
    droppedQueueFullControl: 0,
    droppedQueueFullPayload: 0,
    droppedOversize: 0,
    droppedWriteFailure: 0,
    droppedWriteFailureControl: 0,
    droppedWriteFailurePayload: 0,
    droppedInvalidConfig: 0,
    retriedControlWrites: 0,
    deadLetterWritten: 0,
    deadLetterFailed: 0,
    queuedControl: 0,
    queuedPayload: 0,
  };

  constructor(options: AgentObserverRedisWriterOptions) {
    this.config = options.config;
    this.logger = options.logger ?? console;
    this.redisClientFactory = options.redisClientFactory ?? defaultRedisClientFactory;
  }

  updateConfig(config: AgentObserverConfig): void {
    this.config = config;
  }

  getStats(): AgentObserverWriterStats {
    return {
      ...this.stats,
      queuedControl: this.queues.control.length,
      queuedPayload: this.queues.payload.length,
    };
  }

  isConnected(): boolean {
    return Boolean(this.redis);
  }

  start(): void {
    if (this.config.enabled) this.ensureRedisClient();
  }

  enqueue(event: AgentObservabilityIngressEventV1): boolean {
    if (!this.config.enabled) {
      this.stats.droppedDisabled += 1;
      return false;
    }

    const size = checkAgentObservabilityPayloadSize(event, this.config.maxEventBytes);
    if (!size.ok) {
      this.stats.droppedOversize += 1;
      this.logOnce('oversize', `dropping oversized agent observability event (${size.bytes}/${size.max_bytes} bytes)`);
      return false;
    }

    const kind = selectAgentObservabilityStreamKind(event.type);
    const queue = this.queues[kind];
    if (queue.length >= this.config.maxQueuePerStream) {
      this.stats.droppedQueueFull += 1;
      if (kind === 'control') this.stats.droppedQueueFullControl += 1;
      else this.stats.droppedQueueFullPayload += 1;
      this.logOnce(`queue-full-${kind}`, `dropping agent observability ${kind} event because queue is full`);
      return false;
    }

    queue.push({
      kind,
      stream: selectAgentObservabilityStreamKey(event.type),
      data: JSON.stringify(event),
    });
    this.stats.enqueued += 1;
    if (kind === 'control') this.stats.enqueuedControl += 1;
    else this.stats.enqueuedPayload += 1;
    this.scheduleFlush();
    return true;
  }

  private ensureRedisClient(): RedisClient | null {
    if (this.redis) return this.redis;
    try {
      this.redis = this.redisClientFactory(this.config);
      return this.redis;
    } catch (error) {
      this.stats.droppedInvalidConfig += 1;
      this.recordError(error);
      this.logOnce('redis-client', `agent observability Redis client unavailable: ${this.stats.lastError}`);
      return null;
    }
  }

  private scheduleFlush(): void {
    if (this.scheduled || this.flushPromise) return;
    this.scheduled = true;
    setTimeout(() => {
      this.scheduled = false;
      void this.flush();
    }, 0);
  }

  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushLoop().finally(() => {
      this.flushPromise = null;
      if (this.hasItems() && this.config.enabled) this.scheduleFlush();
    });
    return this.flushPromise;
  }

  private async flushLoop(): Promise<void> {
    while (this.config.enabled) {
      const item = this.nextItem();
      if (!item) return;
      const redis = this.ensureRedisClient();
      if (!redis) {
        this.recordWriteFailure(item, new Error('agent observability Redis client unavailable'));
        continue;
      }
      await this.writeItem(redis, item);
    }
  }

  private async writeItem(redis: RedisClient, item: QueuedEvent): Promise<void> {
    const maxAttempts = item.kind === 'control' ? this.config.controlWriteMaxAttempts : 1;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.xadd(redis, item.stream, this.config.streamMaxLen, item.data);
        this.stats.written += 1;
        if (item.kind === 'control') this.stats.writtenControl += 1;
        else this.stats.writtenPayload += 1;
        return;
      } catch (error) {
        lastError = error;
        this.recordError(error);
        if (item.kind !== 'control' || attempt >= maxAttempts) break;
        this.stats.retriedControlWrites += 1;
        await sleep(this.retryDelayMs(attempt));
      }
    }

    this.recordWriteFailure(item, lastError ?? new Error('agent observability Redis XADD failed'));
    this.logOnce(`redis-xadd-${item.kind}`, `agent observability Redis ${item.kind} XADD failed: ${this.stats.lastError}`);
    if (item.kind === 'control') await this.writeDeadLetter(redis, item, lastError);
  }

  private xadd(redis: RedisClient, stream: string, maxLen: number, data: string): Promise<unknown> {
    return withTimeout(
      Promise.resolve(redis.xadd(stream, 'MAXLEN', '~', maxLen, '*', AGENT_OBSERVABILITY_REDIS_DATA_FIELD, data)),
      this.config.redisCommandTimeoutMs,
      'agent observability Redis XADD timed out',
    );
  }

  private retryDelayMs(attempt: number): number {
    const base = this.config.controlWriteRetryBaseMs;
    const max = this.config.controlWriteRetryMaxMs;
    return Math.min(max, base * (2 ** Math.max(0, attempt - 1)));
  }

  private async writeDeadLetter(redis: RedisClient, item: QueuedEvent, error: unknown): Promise<void> {
    const entry = {
      failed_at: new Date().toISOString(),
      reason: 'redis_write_failed',
      error: errorMessage(error ?? 'unknown error'),
      source_stream: item.stream,
      stream_kind: item.kind,
      data: item.data,
    };
    try {
      await this.xadd(redis, AGENT_OBSERVABILITY_DEADLETTER_STREAM, this.config.deadLetterMaxLen, JSON.stringify(entry));
      this.stats.deadLetterWritten += 1;
    } catch (deadLetterError) {
      this.stats.deadLetterFailed += 1;
      this.recordError(deadLetterError);
      this.logOnce('redis-deadletter', `agent observability Redis dead-letter write failed: ${this.stats.lastError}`);
    }
  }

  private recordWriteFailure(item: QueuedEvent, error: unknown): void {
    this.stats.droppedWriteFailure += 1;
    if (item.kind === 'control') this.stats.droppedWriteFailureControl += 1;
    else this.stats.droppedWriteFailurePayload += 1;
    this.recordError(error);
  }

  private recordError(error: unknown): void {
    this.stats.lastError = errorMessage(error);
    this.stats.lastErrorAt = new Date().toISOString();
  }

  private nextItem(): QueuedEvent | null {
    const control = this.queues.control.shift();
    if (control) return control;
    return this.queues.payload.shift() ?? null;
  }

  private hasItems(): boolean {
    return this.queues.control.length > 0 || this.queues.payload.length > 0;
  }

  private logOnce(key: string, message: string): void {
    if (this.loggedFailures.has(key)) return;
    this.loggedFailures.add(key);
    this.logger.warn(JSON.stringify({ schema_version:'runtime_log.v1', timestamp:new Date().toISOString(), level:'warn', component:'openclaw-agent-observer/redis-writer', message, error_class:null, reason_code:'REDIS_WRITER_FAILURE' }));
  }

  async stop(): Promise<void> {
    await this.flush();
    const redis = this.redis;
    this.redis = null;
    if (!redis) return;
    try {
      if (redis.quit) await redis.quit();
      else if (redis.disconnect) redis.disconnect();
    } catch (error) {
      this.recordError(error);
      this.logOnce('redis-close', `agent observability Redis close failed: ${this.stats.lastError}`);
      if (redis.disconnect) redis.disconnect();
    }
  }
}
