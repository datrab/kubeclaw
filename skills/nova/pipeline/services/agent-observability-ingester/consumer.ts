import {
  AGENT_OBSERVABILITY_CONTROL_STREAM,
  AGENT_OBSERVABILITY_DEADLETTER_STREAM,
  AGENT_OBSERVABILITY_PAYLOAD_STREAM,
  AGENT_OBSERVABILITY_REDIS_DATA_FIELD,
  assertAgentObservabilityIngressEvent,
  selectAgentObservabilityStreamKind,
} from '../../agent-observability/src/index.ts';
import type { AgentObservabilityIngressEventV1 } from '../../agent-observability/src/index.ts';
import { resolveAgentObservabilityIngesterConfig } from './config.ts';
import type { AgentObservabilityIngesterConfig } from './config.ts';
import {
  createDefaultAgentObservabilityRedisClient,
} from './consumer-boundary.ts';
import type {
  AgentObservabilityStreamKey, ArtifactPublisher, EmitEvent, Logger,
  ObservabilityReporter, RedisClient, RedisClientFactory, StreamEntry,
} from './consumer-boundary.ts';
import {
  emitEventAuthority, emitFailureError, entriesFromXautoclaim, entriesFromXreadgroup,
  errorMessage, isExpectedRedisCloseDuringShutdown, observabilityDegradedReporterAuthority,
  observabilityRestoredReporterAuthority, pendingCount, rawDataForDeadLetter,
  streamKindForKey, withTimeout,
} from './consumer-values.ts';
import { processIngesterEntry } from './consumer-entry.ts';
import { checkIngesterPressure, trimIngester } from './consumer-maintenance.ts';
import { startIngester, stopIngester } from './consumer-lifecycle.ts';
import { mapAgentObservabilityEventToTelemetry } from './mapper.ts';
import {
  commitModelUsageSnapshot,
  prepareModelUsageAggregate,
} from './usage-aggregation.ts';
import { publishArtifact } from '../evidence-plane.ts';
import { quarantinePayload } from '../../portable-artifacts.ts';
import { assertEvidenceAdmissible } from '../../observability-contract.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
function runtimeLog(level:string,message:string,reasonCode:string|null=null){return JSON.stringify({schema_version:'runtime_log.v1',timestamp:new Date().toISOString(),level,component:'nova/agent-observability-ingester',message,error_class:null,reason_code:reasonCode});}

export interface AgentObservabilityIngesterStats {
  read: number;
  emitted: number;
  skipped: number;
  acked: number;
  deadLettered: number;
  failed: number;
  lastError?: string;
}

export interface AgentObservabilityPressureStatus {
  controlPending: number;
  payloadLength: number;
  degraded: string[];
}

export interface AgentObservabilityIngesterOptions {
  config?: unknown;
  env?: Record<string, unknown>;
  logger?: Logger;
  redisClientFactory: RedisClientFactory;
  emitEvent?: EmitEvent;
  recordObservabilityDegraded?: ObservabilityReporter;
  recordObservabilityRestored?: ObservabilityReporter;
  publishArtifact?: ArtifactPublisher;
}

export { createDefaultAgentObservabilityRedisClient } from './consumer-boundary.ts';

export class AgentObservabilityIngester {
  readonly config: AgentObservabilityIngesterConfig;
  private readonly logger: Logger;
  private readonly redisClientFactory: RedisClientFactory;
  private readonly emitEvent: EmitEvent;
  private readonly recordObservabilityDegraded: ObservabilityReporter;
  private readonly recordObservabilityRestored: ObservabilityReporter;
  private readonly publishArtifact: ArtifactPublisher;
  private readonly degradedReasons = new Set<string>();
  private readonly loggedFailures = new Set<string>();
  private redis: RedisClient | null = null;
  private redisReady = false;
  private groupReady = false;
  private running = false;
  private stopped = false;
  private lifecycleState: 'idle' | 'running' | 'draining' | 'closed' = 'idle';
  private loopTask: Promise<void> | null = null;
  private trimTask: Promise<void> | null = null;
  private lastTrimAt = 0;
  private readonly stats: AgentObservabilityIngesterStats = {
    read: 0,
    emitted: 0,
    skipped: 0,
    acked: 0,
    deadLettered: 0,
    failed: 0,
  };

  constructor(options: AgentObservabilityIngesterOptions) {
    this.config = resolveAgentObservabilityIngesterConfig(options.config, options.env);
    this.logger = options.logger ?? console;
    if (typeof options.redisClientFactory !== 'function') {
      throw new Error('AgentObservabilityIngester requires explicit redisClientFactory');
    }
    this.redisClientFactory = options.redisClientFactory;
    this.emitEvent = emitEventAuthority(options.emitEvent);
    this.recordObservabilityDegraded = observabilityDegradedReporterAuthority(options.recordObservabilityDegraded);
    this.recordObservabilityRestored = observabilityRestoredReporterAuthority(options.recordObservabilityRestored);
    this.publishArtifact = options.publishArtifact ?? ((ctx: any, event: any, entry: any) => {
      const config = (ctx && typeof ctx === 'object' && 'config' in ctx) ? (ctx as { config: any }).config : null;
      if (!config) return null;
      const identity = event.identity as Record<string, unknown>;
      return publishArtifact(config, {
        logical_id: `observer/${entry.stream}/${entry.id}`,
        kind: 'openclaw-observer-payload',
        media_type: 'application/json',
        bytes: JSON.stringify(assertEvidenceAdmissible(event)),
        producer: 'openclaw-agent-observability-ingester',
        content_class: 'payload',
        completeness: 'full',
        correlation: identity,
      });
    }) as ArtifactPublisher;
  }

  getStats(): AgentObservabilityIngesterStats {
    return { ...this.stats };
  }

  private ensureRedisClient(): RedisClient {
    if (this.redis) return this.redis;
    this.redis = this.redisClientFactory(this.config);
    return this.redis;
  }

  private async ensureRedisReady(): Promise<RedisClient> {
    const redis = this.ensureRedisClient();
    if (this.redisReady) return redis;
    const status = typeof redis.status === 'string' ? redis.status : '';
    if (typeof redis.connect === 'function' && status !== 'ready') {
      await this.redisCall(() => redis.connect?.(), 'agent observability Redis connect');
    }
    if (typeof redis.ping === 'function') {
      await this.redisCall(() => redis.ping?.(), 'agent observability Redis ping');
    }
    this.redisReady = true;
    return redis;
  }

  private async redisCall<T>(operation: () => Promise<T> | T, description: string): Promise<T> {
    return withTimeout(Promise.resolve(operation()), this.config.redisCommandTimeoutMs, `${description} timed out`);
  }

  private async redisBlockingReadCall<T>(operation: () => Promise<T> | T, description: string): Promise<T> {
    return withTimeout(
      Promise.resolve(operation()),
      this.config.pollBlockMs + this.config.redisCommandTimeoutMs,
      `${description} timed out`,
    );
  }

  async ensureConsumerGroup(): Promise<void> {
    if (this.groupReady) return;
    const redis = await this.ensureRedisReady();
    if (!redis.xgroup) throw new Error('Redis client does not expose xgroup');
    for (const stream of [AGENT_OBSERVABILITY_CONTROL_STREAM, AGENT_OBSERVABILITY_PAYLOAD_STREAM] as const) {
      try {
        await this.redisCall(
          () => redis.xgroup?.('CREATE', stream, this.config.groupName, '0', 'MKSTREAM'),
          'agent observability XGROUP CREATE',
        );
      } catch (error: any) {
        if (!String(errorMessage(error)).includes('BUSYGROUP')) throw error;
      }
    }
    this.groupReady = true;
  }

  async reclaimPending(): Promise<StreamEntry[]> {
    const redis = await this.ensureRedisReady();
    if (!redis.call) return [];
    for (const stream of [AGENT_OBSERVABILITY_CONTROL_STREAM, AGENT_OBSERVABILITY_PAYLOAD_STREAM] as const) {
      const result = await this.redisCall(
        () => redis.call?.(
          'XAUTOCLAIM',
          stream,
          this.config.groupName,
          this.config.consumerName,
          String(this.config.reclaimIdleMs),
          '0-0',
          'COUNT',
          '1',
        ),
        'agent observability XAUTOCLAIM',
      );
      const entries = entriesFromXautoclaim(stream, result);
      if (entries.length > 0) return entries;
    }
    return [];
  }

  async readNext(): Promise<StreamEntry[]> {
    if (!this.config.enabled) return [];
    await this.ensureConsumerGroup();
    const reclaimed = await this.reclaimPending();
    if (reclaimed.length > 0) return reclaimed;

    const redis = await this.ensureRedisReady();
    if (!redis.xreadgroup) throw new Error('Redis client does not expose xreadgroup');
    let result;
    try {
      result = await this.redisBlockingReadCall(
        () => redis.xreadgroup?.(
          'GROUP', this.config.groupName, this.config.consumerName,
          'COUNT', 1, 'BLOCK', this.config.pollBlockMs,
          'STREAMS', AGENT_OBSERVABILITY_CONTROL_STREAM, AGENT_OBSERVABILITY_PAYLOAD_STREAM, '>', '>',
        ),
        'agent observability XREADGROUP',
      );
    } catch (error: any) {
      if (String(errorMessage(error)).includes('agent observability XREADGROUP timed out')) return [];
      throw error;
    }
    return entriesFromXreadgroup(result);
  }

  async processNext(ctx: unknown = {}): Promise<{ processed: number; disabled?: boolean }> {
    if (!this.config.enabled) return { processed: 0, disabled: true };
    const entries = await this.readNext();
    for (const entry of entries) await this.processEntry(ctx, entry);
    return { processed: entries.length };
  }

  async processEntry(ctx: unknown, entry: StreamEntry): Promise<void> {
    await processIngesterEntry(this as any, ctx, entry);
  }

  async ack(entry: StreamEntry | string): Promise<void> {
    const stream = typeof entry === 'string' ? AGENT_OBSERVABILITY_CONTROL_STREAM : entry.stream;
    const id = typeof entry === 'string' ? entry : entry.id;
    const redis = await this.ensureRedisReady();
    if (!redis.xack) throw new Error('Redis client does not expose xack');
    await this.redisCall(
      () => redis.xack?.(stream, this.config.groupName, id),
      'agent observability XACK',
    );
    this.stats.acked += 1;
  }

  async deadLetterAndAck(entry: StreamEntry, reason: string, errors: string[], raw?: string): Promise<void> {
    await this.deadLetter(entry, reason, errors, raw);
    await this.ack(entry);
  }

  async deadLetter(entry: StreamEntry, reason: string, errors: string[], raw?: string): Promise<void> {
    const redis = await this.ensureRedisReady();
    if (!redis.xadd) throw new Error('Redis client does not expose xadd');
    const record = {
      v: 1,
      source_stream: entry.stream,
      source_id: entry.id,
      reason,
      errors,
      reclaimed: entry.reclaimed,
      data: rawDataForDeadLetter(raw),
      ts: new Date().toISOString(),
    };
    await this.redisCall(
      () => redis.xadd?.(
        AGENT_OBSERVABILITY_DEADLETTER_STREAM,
        'MAXLEN', '~', this.config.deadLetterMaxLen,
        '*', AGENT_OBSERVABILITY_REDIS_DATA_FIELD, JSON.stringify(record),
      ),
      'agent observability dead-letter XADD',
    );
    this.stats.deadLettered += 1;
  }

  async trim(): Promise<void> {
    await trimIngester(this as any);
  }

  private shouldTrim(now: any = Date.now()): boolean {
    return (now - this.lastTrimAt) >= this.config.trimIntervalMs;
  }

  private scheduleTrim(): void {
    if (this.trimTask) return;
    this.lastTrimAt = Date.now();
    let task: Promise<void>;
    task = this.trim()
      .catch((error: any) => {
        this.logger.warn?.(runtimeLog('warn',`agent observability trim failed: ${errorMessage(error)}`,'REDIS_TRIM_FAILED'));
      })
      .finally(() => {
        if (this.trimTask === task) this.trimTask = null;
      });
    this.trimTask = task;
  }

  async checkPressure(ctx: unknown = {}): Promise<AgentObservabilityPressureStatus> {
    return checkIngesterPressure(this as any, ctx);
  }

  start(ctx: unknown = {}): void {
    startIngester(this as any, ctx);
  }

  async stop(): Promise<void> {
    await stopIngester(this as any);
  }

  private logOnce(key: string, message: string): void {
    if (this.loggedFailures.has(key)) return;
    this.loggedFailures.add(key);
    this.logger.warn(runtimeLog('warn',message,'INGESTER_RUNTIME_FAILURE'));
  }
}
