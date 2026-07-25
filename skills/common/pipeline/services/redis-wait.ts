// Generic resilient Redis wait primitive. Runtime-specific callers provide
// stream keys, edge adapters, and completion resolution semantics.

import { isBudgetExhaustedError } from '../timing.ts';
import { createPipelineEventBus } from './pipeline-event-contract.ts';
import { createRedisRecoveryController } from './redis-wait-recovery.ts';
import type {
  GenericFunction,
  NormalizedRedisWaitOptions,
  RedisWaitOptions,
  UnknownRecord,
} from './redis-wait-types.ts';

type EventAdapter = {
  start: () => any;
  stop?: (reason: string) => unknown;
};

type WaitRuntime = {
  completionWait: Promise<any>;
  controller: AbortController;
  eventBus: ReturnType<typeof createPipelineEventBus>;
  localAdapter: EventAdapter;
  redisAdapter: EventAdapter;
  recovery: ReturnType<typeof createRedisRecoveryController>;
};

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function eventAdapterNumber(config: UnknownRecord, field: string): number {
  const value = Number(config?.event_adapters?.[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`config.event_adapters.${field}: required number in swarm.config.json`);
  }
  return value;
}

function requireFn<T extends GenericFunction>(value: unknown, name: string): T {
  if (typeof value === 'function') return value as T;
  throw new TypeError(`waitForResilientRedisCompletion requires ${name}`);
}

function requireNonNegativeNumber(value: unknown, name: string): number {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) return number;
  throw new TypeError(`waitForResilientRedisCompletion requires non-negative ${name}`);
}

function requireBaseOptions(options: RedisWaitOptions): void {
  if (!isPlainObject(options.config)) throw new TypeError('waitForResilientRedisCompletion requires config');
  if (!options.streamKey) throw new TypeError('waitForResilientRedisCompletion requires streamKey');
  if (options.targetKind !== 'module' && options.targetKind !== 'gate') {
    throw new TypeError('waitForResilientRedisCompletion requires targetKind module or gate');
  }
  if (!options.targetId) throw new TypeError('waitForResilientRedisCompletion requires targetId');
  if (!Array.isArray(options.watchPaths)) throw new TypeError('waitForResilientRedisCompletion requires watchPaths');
  if (typeof options.getLocalStatus !== 'function') {
    throw new TypeError('waitForResilientRedisCompletion requires getLocalStatus');
  }
  if (!options.statusSource) throw new TypeError('waitForResilientRedisCompletion requires statusSource');
}

function normalizeOptions(options: RedisWaitOptions): NormalizedRedisWaitOptions {
  requireBaseOptions(options);
  return {
    config: options.config as UnknownRecord,
    streamKey: options.streamKey as string,
    targetKind: options.targetKind as 'module' | 'gate',
    targetId: options.targetId as string,
    expectedStatuses: options.expectedStatuses,
    expectedIdentity: isPlainObject(options.expectedIdentity) ? options.expectedIdentity : {},
    timeoutMs: requireNonNegativeNumber(options.timeoutMs, 'timeoutMs'),
    watchPaths: options.watchPaths as string[],
    getLocalStatus: options.getLocalStatus as () => unknown,
    statusSource: options.statusSource as string,
    RedisCtor: options.RedisCtor ?? null,
    redisOptions: isPlainObject(options.redisOptions) ? options.redisOptions : {},
    budget: options.budget ?? null,
    redisBlockMs: requireNonNegativeNumber(options.redisBlockMs, 'redisBlockMs'),
    recoveryScanIntervalMs: requireNonNegativeNumber(options.recoveryScanIntervalMs, 'recoveryScanIntervalMs'),
    tailScanBatchSize: requireNonNegativeNumber(options.tailScanBatchSize, 'tailScanBatchSize'),
    tailScanLimit: requireNonNegativeNumber(options.tailScanLimit, 'tailScanLimit'),
    createRedisCompletionEventAdapter: requireFn(options.createRedisCompletionEventAdapter, 'createRedisCompletionEventAdapter'),
    createLocalEvidenceEventAdapter: requireFn(options.createLocalEvidenceEventAdapter, 'createLocalEvidenceEventAdapter'),
    createRedisClient: requireFn(options.createRedisClient, 'createRedisClient'),
    scanLatestCompletionFromTail: requireFn(options.scanLatestCompletionFromTail, 'scanLatestCompletionFromTail'),
    waitForCompletion: requireFn(options.waitForCompletion, 'waitForCompletion'),
    resolveCompletionEvent: requireFn(options.resolveCompletionEvent, 'resolveCompletionEvent'),
    log: options.log ?? (() => {}),
    logRedisOperation: options.logRedisOperation ?? (() => {}),
    logRedisReceived: options.logRedisReceived ?? (() => {}),
  };
}

function buildCompletionEventIdentity(options: NormalizedRedisWaitOptions): UnknownRecord {
  const identity = options.expectedIdentity;
  return {
    ...(options.targetKind === 'gate' ? { gate_id: options.targetId } : { module_id: options.targetId }),
    ...(identity.run_id ? { run_id: identity.run_id } : {}),
    ...(identity.attempt != null && String(identity.attempt) !== '' ? { attempt: identity.attempt } : {}),
    ...(identity.dispatch_id ? { dispatch_id: identity.dispatch_id } : {}),
    ...(identity.session_key ? { session_key: identity.session_key } : {}),
  };
}

function createWaitRuntime(options: NormalizedRedisWaitOptions): WaitRuntime {
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const identity = buildCompletionEventIdentity(options);
  const sharedAdapterOptions = { eventBus, identity };
  const redisAdapter = options.createRedisCompletionEventAdapter(options.config, {
    ...options.redisOptions,
    ...sharedAdapterOptions,
    blockMs: options.redisBlockMs,
    startId: '0-0',
    stream: options.streamKey,
    ...(options.RedisCtor ? { RedisCtor: options.RedisCtor } : {}),
  });
  const localAdapter = options.createLocalEvidenceEventAdapter(options.config, {
    ...sharedAdapterOptions,
    paths: options.watchPaths.filter(Boolean),
    debounceMs: eventAdapterNumber(options.config, 'local_evidence_debounce_ms'),
    emitExisting: true,
  });
  const recovery = createRedisRecoveryController(options, controller.signal);
  const currentLocalStatus = () => options.getLocalStatus();
  const completionWait = options.waitForCompletion({
    eventBus,
    identity,
    targetKind: options.targetKind,
    targetId: options.targetId,
    expectedStatuses: options.expectedStatuses,
    expectedIdentity: options.expectedIdentity,
    getLocalStatus: currentLocalStatus,
    statusSource: options.statusSource,
    signal: controller.signal,
    timeoutMs: options.budget?.remainingMs
      ? Math.min(options.timeoutMs, options.budget.remainingMs())
      : options.timeoutMs,
    ...(options.budget ? { budget: options.budget } : {}),
    resolveLocalEvidence: async () => recovery.recover('local_evidence_recovery', currentLocalStatus()),
  });
  void completionWait.catch(() => { /* INTENTIONAL_NONCRITICAL(wait_observed_by_owner): the owning await below preserves the authoritative failure. */ });
  return { completionWait, controller, eventBus, localAdapter, redisAdapter, recovery };
}

function startPeriodicRecovery(options: NormalizedRedisWaitOptions, runtime: WaitRuntime): ReturnType<typeof setInterval> | null {
  if (options.recoveryScanIntervalMs <= 0) return null;
  return setInterval(() => {
    void runtime.recovery.recover('periodic_recovery', options.getLocalStatus()).then((result: any) => {
      if (result?.event) runtime.eventBus.emit(result.event);
    });
  }, options.recoveryScanIntervalMs);
}

async function awaitCompletion(options: NormalizedRedisWaitOptions, runtime: WaitRuntime): Promise<any> {
  const startup = await runtime.recovery.recover('startup_recovery', options.getLocalStatus());
  if (startup?.resolved) return startup;
  if (startup?.event) runtime.eventBus.emit(startup.event);
  return runtime.completionWait;
}

async function recoverAfterTimeout(
  error: unknown,
  options: NormalizedRedisWaitOptions,
  runtime: WaitRuntime,
): Promise<any> {
  const isTimeout = isPlainObject(error) && error.code === 'PIPELINE_EVENT_WAIT_TIMEOUT';
  if (!isTimeout && !isBudgetExhaustedError(error)) throw error;
  const recovered = await runtime.recovery.recover('timeout_recovery', options.getLocalStatus());
  if (recovered?.resolved) return recovered;
  throw error;
}

export async function waitForResilientRedisCompletion(
  rawOptions: RedisWaitOptions = {},
): Promise<any> {
  const options = normalizeOptions(rawOptions);
  const runtime = createWaitRuntime(options);
  let redisDone: Promise<any> | null = null;
  let recoveryTimer: ReturnType<typeof setInterval> | null = null;
  try {
    redisDone = runtime.redisAdapter.start();
    void redisDone?.catch(() => { /* INTENTIONAL_NONCRITICAL(wait_observed_by_owner): final cleanup awaits the adapter promise. */ });
    runtime.localAdapter.start();
    recoveryTimer = startPeriodicRecovery(options, runtime);
    return await awaitCompletion(options, runtime);
  } catch (error) {
    return await recoverAfterTimeout(error, options, runtime);
  } finally {
    runtime.controller.abort('redis_completion_finished');
    if (recoveryTimer) clearInterval(recoveryTimer);
    runtime.localAdapter.stop?.('redis_completion_finished');
    runtime.redisAdapter.stop?.('redis_completion_finished');
    runtime.recovery.close();
    await redisDone?.catch?.(() => {});
  }
}
