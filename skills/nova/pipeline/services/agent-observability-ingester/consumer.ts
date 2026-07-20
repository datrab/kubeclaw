import {
  AGENT_OBSERVABILITY_CONTROL_STREAM,
  AGENT_OBSERVABILITY_DEADLETTER_STREAM,
  AGENT_OBSERVABILITY_PAYLOAD_STREAM,
  AGENT_OBSERVABILITY_REDIS_DATA_FIELD,
  assertAgentObservabilityIngressEvent,
  selectAgentObservabilityStreamKind,
} from '../../agent-observability/src/index.ts';
import type { AgentObservabilityIngressEventV1 } from '../../agent-observability/src/index.ts';
import { createRedisClient, loadRedisCtor } from '../../redis-transport.ts';
import { emitEvent as defaultEmitEvent } from '../telemetry/dispatch.ts';
import {
  recordObservabilityDegraded as defaultRecordObservabilityDegraded,
  recordObservabilityRestored as defaultRecordObservabilityRestored,
} from '../observability.ts';
import { resolveAgentObservabilityIngesterConfig } from './config.ts';
import type { AgentObservabilityIngesterConfig } from './config.ts';
import { mapAgentObservabilityEventToTelemetry } from './mapper.ts';
import {
  commitModelUsageSnapshot,
  prepareModelUsageAggregate,
} from './usage-aggregation.ts';
import { publishArtifact } from '../evidence-plane.ts';
import { redactProhibitedSecrets } from '../../observability-contract.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
interface RedisClient {
  status?: string;
  connect?: () => Promise<unknown> | unknown;
  ping?: () => Promise<unknown> | unknown;
  xgroup?: (...args: unknown[]) => Promise<unknown> | unknown;
  xreadgroup?: (...args: unknown[]) => Promise<unknown> | unknown;
  xack?: (...args: unknown[]) => Promise<unknown> | unknown;
  xadd?: (...args: unknown[]) => Promise<unknown> | unknown;
  xtrim?: (...args: unknown[]) => Promise<unknown> | unknown;
  xlen?: (...args: unknown[]) => Promise<unknown> | unknown;
  xpending?: (...args: unknown[]) => Promise<unknown> | unknown;
  call?: (...args: unknown[]) => Promise<unknown> | unknown;
  quit?: () => Promise<unknown> | unknown;
  disconnect?: () => unknown;
}

type Logger = Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;
type RedisClientFactory = (config: AgentObservabilityIngesterConfig) => RedisClient;
type EmitEvent = (ctx: unknown, eventType: string, payload: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
type ObservabilityReporter = (ctx: unknown, data: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
type ArtifactPublisher = (ctx: unknown, event: AgentObservabilityIngressEventV1, entry: StreamEntry) => { reference: string } | null;

interface StreamEntry {
  stream: AgentObservabilityStreamKey;
  id: string;
  data: Record<string, string>;
  reclaimed: boolean;
}

type AgentObservabilityStreamKey =
  | typeof AGENT_OBSERVABILITY_CONTROL_STREAM
  | typeof AGENT_OBSERVABILITY_PAYLOAD_STREAM;

const TELEMETRY_EMIT_FAILED = 'telemetry emit failed';
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

export function createDefaultAgentObservabilityRedisClient(config: AgentObservabilityIngesterConfig): RedisClient {
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
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  ) as RedisClient;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isExpectedRedisCloseDuringShutdown(error: unknown): boolean {
  return /(connection is closed|connection closed|closed before ready|connection ended|stream isn't writeable|write after end)/i.test(errorMessage(error));
}

function emitFailureError(result: unknown): string | null {
  if (selectTruthyValue(() => (!result), () => (typeof result !== 'object'))) return null;
  const record = result as Record<string, unknown>;
  if (record.validationError) return null;
  if (record.ok === false && record.skipped !== true) {
    return errorMessage(selectDefinedValue(() => (selectDefinedValue(() => (record.error), () => (record.reason))), () => (TELEMETRY_EMIT_FAILED)));
  }
  if (record.error && record.ok !== true && record.skipped !== true) return errorMessage(record.error);
  return null;
}

function redisFieldValue(value: unknown): string {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function redisCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function streamEntryFromRedis(stream: AgentObservabilityStreamKey, entry: unknown, reclaimed: boolean): StreamEntry | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!Array.isArray(entry)), () => (entry.length < 2))), () => (typeof entry[0] !== 'string'))), () => (!Array.isArray(entry[1])))) return null;
  const fields: Record<string, string> = {};
  for (let i = 0; i < entry[1].length; i += 2) {
    fields[String(entry[1][i])] = redisFieldValue(entry[1][i + 1]);
  }
  return { stream, id: entry[0], data: fields, reclaimed };
}

function entriesFromXreadgroup(result: unknown): StreamEntry[] {
  if (!Array.isArray(result)) return [];
  const entries: StreamEntry[] = [];
  for (const streamResult of result) {
    if (selectTruthyValue(() => (!Array.isArray(streamResult)), () => (streamResult.length < 2))) continue;
    const stream = streamResult[0];
    const streamEntries = streamResult[1];
    if (selectTruthyValue(() => (!isAgentObservabilityStreamKey(stream)), () => (!Array.isArray(streamEntries)))) continue;
    entries.push(...streamEntries.map((entry) => streamEntryFromRedis(stream, entry, false)).filter((entry): entry is StreamEntry => Boolean(entry)));
  }
  return entries;
}

function entriesFromXautoclaim(stream: AgentObservabilityStreamKey, result: unknown): StreamEntry[] {
  const entries = Array.isArray(result) && Array.isArray(result[1]) ? result[1] : [];
  return entries.map((entry) => streamEntryFromRedis(stream, entry, true)).filter((entry): entry is StreamEntry => Boolean(entry));
}

function pendingCount(result: unknown): number {
  if (Array.isArray(result)) return redisCount(result[0]);
  if (result && typeof result === 'object' && 'count' in result) return redisCount((result as { count: unknown }).count);
  return redisCount(result);
}

function emitEventAuthority(emitEvent: EmitEvent | undefined): EmitEvent {
  return emitEvent === undefined ? defaultEmitEvent as EmitEvent : emitEvent;
}

function observabilityDegradedReporterAuthority(reporter: ObservabilityReporter | undefined): ObservabilityReporter {
  return reporter === undefined ? defaultRecordObservabilityDegraded as ObservabilityReporter : reporter;
}

function observabilityRestoredReporterAuthority(reporter: ObservabilityReporter | undefined): ObservabilityReporter {
  return reporter === undefined ? defaultRecordObservabilityRestored as ObservabilityReporter : reporter;
}

function rawDataForDeadLetter(data: string | undefined): string | null {
  if (data === undefined) return null;
  return data.length > 4096 ? `${data.slice(0, 4096)}...[truncated]` : data;
}

function isAgentObservabilityStreamKey(stream: unknown): stream is AgentObservabilityStreamKey {
  return selectTruthyValue(() => (stream === AGENT_OBSERVABILITY_CONTROL_STREAM), () => (stream === AGENT_OBSERVABILITY_PAYLOAD_STREAM));
}

function streamKindForKey(stream: AgentObservabilityStreamKey): 'control' | 'payload' {
  return stream === AGENT_OBSERVABILITY_PAYLOAD_STREAM ? 'payload' : 'control';
}

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
    this.logger = selectDefinedValue(() => (options.logger), () => (console));
    if (typeof options.redisClientFactory !== 'function') {
      throw new Error('AgentObservabilityIngester requires explicit redisClientFactory');
    }
    this.redisClientFactory = options.redisClientFactory;
    this.emitEvent = emitEventAuthority(options.emitEvent);
    this.recordObservabilityDegraded = observabilityDegradedReporterAuthority(options.recordObservabilityDegraded);
    this.recordObservabilityRestored = observabilityRestoredReporterAuthority(options.recordObservabilityRestored);
    this.publishArtifact = options.publishArtifact ?? ((ctx, event, entry) => {
      const config = (ctx && typeof ctx === 'object' && 'config' in ctx) ? (ctx as { config: any }).config : null;
      if (!config) return null;
      const identity = event.identity as Record<string, unknown>;
      return publishArtifact(config, {
        logical_id: `observer/${entry.stream}/${entry.id}`,
        kind: 'openclaw-observer-payload',
        media_type: 'application/json',
        bytes: JSON.stringify(redactProhibitedSecrets(event)),
        producer: 'openclaw-agent-observability-ingester',
        content_class: 'payload',
        completeness: 'full',
        correlation: identity,
      });
    });
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
      } catch (error) {
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
    } catch (error) {
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
    this.stats.read += 1;
    const raw = entry.data[AGENT_OBSERVABILITY_REDIS_DATA_FIELD];
    if (!raw) {
      await this.deadLetterAndAck(entry, 'missing_data', ['Redis stream entry has no data field']);
      return;
    }

    let event: AgentObservabilityIngressEventV1;
    try {
      const parsed = JSON.parse(raw) as unknown;
      assertAgentObservabilityIngressEvent(parsed);
      event = parsed;
      if (selectAgentObservabilityStreamKind(event.type) !== streamKindForKey(entry.stream)) {
        const expectedStreamKind = selectAgentObservabilityStreamKind(event.type);
        await this.deadLetterAndAck(
          entry,
          `unexpected_${expectedStreamKind}_event_on_${streamKindForKey(entry.stream)}_stream`,
          [`${event.type} belongs on ${expectedStreamKind} stream`],
          raw,
        );
        return;
      }
    } catch (error) {
      const errors = Array.isArray((error as { errors?: unknown }).errors)
        ? (error as { errors: string[] }).errors
        : [errorMessage(error)];
      await this.deadLetterAndAck(entry, 'invalid_ingress_event', errors, raw);
      return;
    }

    const modelUsageEventId = `${entry.stream}:${entry.id}`;
    const modelUsageAggregate = prepareModelUsageAggregate(ctx, event, { eventId: modelUsageEventId });
    const emission = mapAgentObservabilityEventToTelemetry(event, { modelUsageAggregate });
    if (!emission) {
      this.stats.skipped += 1;
      await this.ack(entry);
      return;
    }

    let artifact;
    try {
      artifact = this.publishArtifact(ctx, event, entry);
    } catch (error) {
      await this.deadLetterAndAck(entry, 'artifact_publication_failed', [errorMessage(error)], raw);
      return;
    }

    try {
      const enrichedPayload = artifact
        ? { ...emission.payload, artifact_reference: artifact.reference, content_completeness: 'full' }
        : emission.payload;
      const result = await this.emitEvent(ctx, emission.eventType, enrichedPayload as Record<string, unknown>, emission.options);
      if (result && typeof result === 'object' && 'validationError' in result && (result as { validationError?: unknown }).validationError) {
        await this.deadLetterAndAck(entry, 'telemetry_payload_invalid', [String((result as { validationError: unknown }).validationError)], raw);
        return;
      }
      const emitFailure = emitFailureError(result);
      if (emitFailure) {
        await this.deadLetterAndAck(entry, 'telemetry_emit_failed', [emitFailure], raw);
        return;
      }
      commitModelUsageSnapshot(ctx, event, { eventId: modelUsageEventId });
      this.stats.emitted += 1;
      await this.ack(entry);
    } catch (error) {
      await this.deadLetterAndAck(entry, 'telemetry_emit_failed', [errorMessage(error)], raw);
    }
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
    const redis = await this.ensureRedisReady();
    if (!redis.xtrim) return;
    const trimTargets: Array<[AgentObservabilityStreamKey | typeof AGENT_OBSERVABILITY_DEADLETTER_STREAM, number, string]> = [
      [AGENT_OBSERVABILITY_CONTROL_STREAM, this.config.controlStreamMaxLen, 'agent observability control XTRIM'],
      [AGENT_OBSERVABILITY_PAYLOAD_STREAM, this.config.payloadStreamMaxLen, 'agent observability payload XTRIM'],
      [AGENT_OBSERVABILITY_DEADLETTER_STREAM, this.config.deadLetterMaxLen, 'agent observability dead-letter XTRIM'],
    ];
    for (const [streamKey, maxLen, description] of trimTargets) {
      try {
        await this.redisCall(
          () => redis.xtrim?.(streamKey, 'MAXLEN', '~', maxLen),
          description,
        );
      } catch (error) {
        this.logger.warn?.(runtimeLog('warn',`${description} failed: ${errorMessage(error)}`,'REDIS_TRIM_FAILED'));
      }
    }
  }

  private shouldTrim(now = Date.now()): boolean {
    return (now - this.lastTrimAt) >= this.config.trimIntervalMs;
  }

  private scheduleTrim(): void {
    if (this.trimTask) return;
    this.lastTrimAt = Date.now();
    let task: Promise<void>;
    task = this.trim()
      .catch((error) => {
        this.logger.warn?.(runtimeLog('warn',`agent observability trim failed: ${errorMessage(error)}`,'REDIS_TRIM_FAILED'));
      })
      .finally(() => {
        if (this.trimTask === task) this.trimTask = null;
      });
    this.trimTask = task;
  }

  async checkPressure(ctx: unknown = {}): Promise<AgentObservabilityPressureStatus> {
    const redis = await this.ensureRedisReady();
    const controlPending = redis.xpending
      ? pendingCount(await this.redisCall(
        () => redis.xpending?.(AGENT_OBSERVABILITY_CONTROL_STREAM, this.config.groupName),
        'agent observability XPENDING',
      ))
      : 0;
    const payloadLength = redis.xlen
      ? redisCount(await this.redisCall(() => redis.xlen?.(AGENT_OBSERVABILITY_PAYLOAD_STREAM), 'agent observability payload XLEN'))
      : 0;
    const degraded: string[] = [];
    if (controlPending > this.config.controlLagDegradedThreshold) degraded.push('control_lag');
    if (payloadLength > this.config.payloadPressureDegradedThreshold) degraded.push('payload_pressure');
    await this.reportPressure(ctx, 'control_lag', degraded.includes('control_lag'), {
      stream_key: AGENT_OBSERVABILITY_CONTROL_STREAM,
      pending: controlPending,
      threshold: this.config.controlLagDegradedThreshold,
    });
    await this.reportPressure(ctx, 'payload_pressure', degraded.includes('payload_pressure'), {
      stream_key: AGENT_OBSERVABILITY_PAYLOAD_STREAM,
      length: payloadLength,
      threshold: this.config.payloadPressureDegradedThreshold,
    });
    return { controlPending, payloadLength, degraded };
  }

  private async reportPressure(ctx: unknown, reason: string, degraded: boolean, detail: Record<string, unknown>): Promise<void> {
    const key = reason;
    if (degraded) {
      if (this.degradedReasons.has(key)) return;
      this.degradedReasons.add(key);
      await this.recordObservabilityDegraded(ctx, {
        component: 'agent_observability_ingester',
        surface: 'redis_control_stream',
        reason,
        detail: JSON.stringify(detail),
        stream_key: detail.stream_key,
      });
      return;
    }
    if (!this.degradedReasons.has(key)) return;
    this.degradedReasons.delete(key);
    await this.recordObservabilityRestored(ctx, {
      component: 'agent_observability_ingester',
      surface: 'redis_control_stream',
      reason,
      detail: JSON.stringify(detail),
      stream_key: detail.stream_key,
    });
  }

  start(ctx: unknown = {}): void {
    if (selectTruthyValue(() => (this.running), () => (!this.config.enabled))) return;
    this.running = true;
    this.stopped = false;
    this.lifecycleState = 'running';
    const loop = async (): Promise<void> => {
      while (this.running && !this.stopped) {
        try {
          await this.processNext(ctx);
          if (selectTruthyValue(() => (!this.running), () => (this.stopped))) break;
          await this.checkPressure(ctx);
          if (selectTruthyValue(() => (!this.running), () => (this.stopped))) break;
          if (this.shouldTrim()) {
            this.scheduleTrim();
          }
        } catch (error) {
          this.stats.failed += 1;
          this.redisReady = false;
          this.groupReady = false;
          this.stats.lastError = errorMessage(error);
          this.logOnce('loop', `agent observability ingester loop failed: ${this.stats.lastError}`);
          await new Promise((resolve) => setTimeout(resolve, this.config.loopDelayMs));
        }
      }
    };
    let task: Promise<void>;
    task = loop()
      .catch((error) => {
        this.stats.failed += 1;
        this.stats.lastError = errorMessage(error);
        this.logOnce('loop', `agent observability ingester loop failed: ${this.stats.lastError}`);
      })
      .finally(() => {
        if (this.loopTask === task) this.loopTask = null;
      });
    this.loopTask = task;
  }

  async stop(): Promise<void> {
    if (this.lifecycleState === 'closed') return;
    this.lifecycleState = 'draining';
    this.stopped = true;
    this.running = false;
    const loopTask = this.loopTask;
    const redis = this.redis;
    if (loopTask) await loopTask;
    if (!redis) {
      this.lifecycleState = 'closed';
      return;
    }
    if (this.redis === redis) {
      this.redis = null;
      this.redisReady = false;
      this.groupReady = false;
    }
    try {
      if (redis.quit) await redis.quit();
    } catch (error) {
      this.stats.lastError = errorMessage(error);
      if (this.lifecycleState === 'draining' && isExpectedRedisCloseDuringShutdown(error)) {
        this.logger.debug?.(runtimeLog('debug',`Redis already closed during draining shutdown: ${this.stats.lastError}`,'REDIS_ALREADY_CLOSED'));
      } else {
        this.logOnce('redis-close', `agent observability ingester Redis close failed: ${this.stats.lastError}`);
      }
      if (redis.disconnect) redis.disconnect();
    } finally {
      this.lifecycleState = 'closed';
    }
  }

  private logOnce(key: string, message: string): void {
    if (this.loggedFailures.has(key)) return;
    this.loggedFailures.add(key);
    this.logger.warn(runtimeLog('warn',message,'INGESTER_RUNTIME_FAILURE'));
  }
}
