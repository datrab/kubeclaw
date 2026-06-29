// Generic resilient Redis wait primitive.
// Runtime-specific callers provide stream keys, edge adapters, and completion
// resolution semantics. This module owns the live-wait + local-evidence +
// tail-scan recovery loop so every pipeline agent uses one path.

import { createPipelineEventBus } from './pipeline-event-contract.ts';
import { isBudgetExhaustedError } from '../timing.ts';

const DI_SCOPES = new Set(['completionEventAdapters']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function selectDeps(explicit = null, scope = null) {
  if (!isPlainObject(explicit)) return {};
  const scoped = scope && isPlainObject(explicit[scope]) ? explicit[scope] : {};
  const flat = {};
  for (const [key, value] of Object.entries(explicit)) {
    if (DI_SCOPES.has(key) && isPlainObject(value)) continue;
    flat[key] = value;
  }
  return { ...scoped, ...flat };
}

function eventAdapterNumber(config, field) {
  const value = Number(config?.event_adapters?.[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`config.event_adapters.${field}: required number in swarm.config.json`);
  }
  return value;
}

function requireFn(value, name) {
  if (typeof value === 'function') return value;
  throw new TypeError(`waitForResilientRedisCompletion requires ${name}`);
}

function requireNonNegativeNumber(value, name) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  throw new TypeError(`waitForResilientRedisCompletion requires non-negative ${name}`);
}

function normalizeIdentityValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function buildCompletionEventIdentity(targetKind, targetId, expectedIdentity = {}) {
  return {
    ...(targetKind === 'gate' ? { gate_id: targetId } : { module_id: targetId }),
    ...(expectedIdentity.run_id ? { run_id: expectedIdentity.run_id } : {}),
    ...(expectedIdentity.attempt != null && String(expectedIdentity.attempt) !== '' ? { attempt: expectedIdentity.attempt } : {}),
    ...(expectedIdentity.dispatch_id ? { dispatch_id: expectedIdentity.dispatch_id } : {}),
    ...(expectedIdentity.session_key ? { session_key: expectedIdentity.session_key } : {}),
  };
}

function buildRecoveryCompletionEvent({
  targetKind,
  targetId,
  streamKey,
  entry,
  reason,
}) {
  return {
    type: 'completion.evidence',
    source: 'redis',
    identity: {
      ...(targetKind === 'gate'
        ? {
            gate_id: normalizeIdentityValue(entry?.gate_id ?? entry?.target_id) || targetId,
          }
        : {
            module_id: normalizeIdentityValue(entry?.module ?? entry?.module_id ?? entry?.target_id) || targetId,
          }),
      ...(entry?.run_id ? { run_id: entry.run_id } : {}),
      ...(entry?.attempt != null && String(entry.attempt) !== '' ? { attempt: entry.attempt } : {}),
      ...(entry?.dispatch_id ? { dispatch_id: entry.dispatch_id } : {}),
      ...(entry?.session_key ? { session_key: entry.session_key } : {}),
      ...(entry?.gateway_label ? { gateway_label: entry.gateway_label } : {}),
    },
    payload: {
      stream_key: streamKey,
      redis_id: entry?._id || null,
      entry,
      recovery_reason: reason,
    },
  };
}

function closeRedisClient(client) {
  if (!client) return;
  try {
    if (typeof client.disconnect === 'function') client.disconnect();
    else if (typeof client.quit === 'function') void client.quit().catch?.(() => {});
  } catch (_error) {}
}

export async function waitForResilientRedisCompletion({
  config,
  streamKey,
  targetKind,
  targetId,
  expectedStatuses,
  expectedIdentity,
  timeoutMs,
  watchPaths,
  getLocalStatus,
  statusSource,
  deps = null,
  budget = null,
  redisBlockMs,
  recoveryScanIntervalMs,
  tailScanBatchSize,
  tailScanLimit,
  createRedisCompletionEventAdapter,
  createLocalEvidenceEventAdapter,
  createRedisClient,
  scanLatestCompletionFromTail,
  waitForCompletion,
  resolveCompletionEvent,
  log = () => {},
  logRedisOperation = () => {},
  logRedisReceived = () => {},
} = {}) {
  if (!streamKey) throw new TypeError('waitForResilientRedisCompletion requires streamKey');
  if (targetKind !== 'module' && targetKind !== 'gate') throw new TypeError('waitForResilientRedisCompletion requires targetKind module or gate');
  if (!targetId) throw new TypeError('waitForResilientRedisCompletion requires targetId');
  if (!Array.isArray(watchPaths)) throw new TypeError('waitForResilientRedisCompletion requires watchPaths');
  if (typeof getLocalStatus !== 'function') throw new TypeError('waitForResilientRedisCompletion requires getLocalStatus');
  if (!statusSource) throw new TypeError('waitForResilientRedisCompletion requires statusSource');
  const activeExpectedIdentity = isPlainObject(expectedIdentity) ? expectedIdentity : {};
  const activeRedisBlockMs = requireNonNegativeNumber(redisBlockMs, 'redisBlockMs');
  const activeRecoveryScanIntervalMs = requireNonNegativeNumber(recoveryScanIntervalMs, 'recoveryScanIntervalMs');
  const activeTailScanBatchSize = requireNonNegativeNumber(tailScanBatchSize, 'tailScanBatchSize');
  const activeTailScanLimit = requireNonNegativeNumber(tailScanLimit, 'tailScanLimit');
  const makeRedisAdapter = requireFn(createRedisCompletionEventAdapter, 'createRedisCompletionEventAdapter');
  const makeLocalAdapter = requireFn(createLocalEvidenceEventAdapter, 'createLocalEvidenceEventAdapter');
  const makeRedisClient = requireFn(createRedisClient, 'createRedisClient');
  const scanCompletions = requireFn(scanLatestCompletionFromTail, 'scanLatestCompletionFromTail');
  const waitForCompletionEvent = requireFn(waitForCompletion, 'waitForCompletion');
  const resolveEvent = requireFn(resolveCompletionEvent, 'resolveCompletionEvent');

  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const identity = buildCompletionEventIdentity(targetKind, targetId, activeExpectedIdentity);
  const completionAdapterDeps = selectDeps(deps, 'completionEventAdapters');
  const redisCompletionDeps = selectDeps(deps);
  const RedisCtor = completionAdapterDeps?.RedisCtor;
  const redisAdapterFactory = completionAdapterDeps?.createRedisCompletionEventAdapter || makeRedisAdapter;
  const localAdapterFactory = completionAdapterDeps?.createLocalEvidenceEventAdapter || makeLocalAdapter;
  const redisClientFactory = redisCompletionDeps.createDedicatedRedisCompletionClient || makeRedisClient;
  const scanCompletionTail = redisCompletionDeps.scanLatestCompletionFromTail || scanCompletions;

  const redisAdapter = redisAdapterFactory(config, {
    eventBus,
    identity,
    blockMs: activeRedisBlockMs,
    startId: '0-0',
    stream: streamKey,
    ...(RedisCtor ? { RedisCtor } : {}),
  });
  const localAdapter = localAdapterFactory(config, {
    eventBus,
    identity,
    paths: watchPaths.filter(Boolean),
    debounceMs: eventAdapterNumber(config, 'local_evidence_debounce_ms'),
    emitExisting: true,
  });

  let recoveryClient = null;
  let recoveryScanPromise = null;
  let recoveryTimer = null;

  function currentLocalStatus() {
    return typeof getLocalStatus === 'function' ? getLocalStatus() : null;
  }

  function getRecoveryClient() {
    if (!recoveryClient) {
      recoveryClient = redisClientFactory({ ...(RedisCtor ? { RedisCtor } : {}) });
      recoveryClient.on?.('error', () => {});
    }
    return recoveryClient;
  }

  async function recoverCompletionFromTail(reason, localStatus = null) {
    if (controller.signal.aborted) return null;
    if (recoveryScanPromise) return recoveryScanPromise;
    recoveryScanPromise = (async () => {
      try {
        const redis = getRecoveryClient();
        const scanResult = await scanCompletionTail(redis, streamKey, targetId, activeExpectedIdentity, {
          batchSize: activeTailScanBatchSize,
          scanLimit: activeTailScanLimit,
        });
        logRedisOperation(config, {
          op: 'completion_tail_scan',
          target_kind: targetKind,
          target_id: targetId,
          reason,
          matched: Boolean(scanResult?.match),
          scanned: scanResult?.scanned ?? 0,
          batches: scanResult?.batches ?? 0,
          truncated: Boolean(scanResult?.truncated),
        });
        if (!scanResult?.match) return null;
        logRedisReceived(config, 'completion_tail_scan_recovered', targetKind, targetId, {
          redis_id: scanResult.match._id || null,
          status: scanResult.match.status || null,
          outcome: scanResult.match.outcome || null,
          source: scanResult.match.source || null,
          run_id: scanResult.match.run_id || null,
          attempt: scanResult.match.attempt ?? null,
          dispatch_id: scanResult.match.dispatch_id || null,
          session_key: scanResult.match.session_key || null,
          reason,
        });
        return resolveEvent({
          event: buildRecoveryCompletionEvent({
            targetKind,
            targetId,
            streamKey,
            entry: scanResult.match,
            reason,
          }),
          targetKind,
          targetId,
          expectedStatuses,
          expectedIdentity,
          localStatus,
          statusSource,
        });
      } catch (error) {
        log(
          'WARN',
          `Completion tail scan recovery failed for ${targetKind} ${targetId}: ${error?.message || String(error)}`,
        );
        logRedisOperation(config, {
          op: 'completion_tail_scan_failed',
          target_kind: targetKind,
          target_id: targetId,
          reason,
          error: error?.message || String(error),
        });
        return null;
      }
    })().finally(() => {
      recoveryScanPromise = null;
    });
    return recoveryScanPromise;
  }

  const completionWait = waitForCompletionEvent({
    eventBus,
    identity,
    targetKind,
    targetId,
    expectedStatuses,
    expectedIdentity,
    getLocalStatus: currentLocalStatus,
    statusSource,
    signal: controller.signal,
    timeoutMs: budget?.remainingMs ? Math.min(timeoutMs, budget.remainingMs()) : timeoutMs,
    ...(budget ? { budget } : {}),
    resolveLocalEvidence: async () => recoverCompletionFromTail('local_evidence_recovery', currentLocalStatus()),
  });
  completionWait.catch?.(() => {});

  let redisDone = null;
  try {
    redisDone = redisAdapter.start();
    redisDone?.catch?.(() => {});
    localAdapter.start();

    const startupRecovery = await recoverCompletionFromTail('startup_recovery', currentLocalStatus());
    if (startupRecovery?.resolved) return startupRecovery;
    if (startupRecovery?.event) eventBus.emit(startupRecovery.event);

    const intervalMs = activeRecoveryScanIntervalMs;
    if (intervalMs > 0) {
      recoveryTimer = setInterval(() => {
        void (async () => {
          const periodicRecovery = await recoverCompletionFromTail('periodic_recovery', currentLocalStatus());
          if (periodicRecovery?.event) eventBus.emit(periodicRecovery.event);
        })().catch(() => {});
      }, intervalMs);
    }

    return await completionWait;
  } catch (error) {
    if (error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT' || isBudgetExhaustedError(error)) {
      const timeoutRecovery = await recoverCompletionFromTail('timeout_recovery', currentLocalStatus());
      if (timeoutRecovery?.resolved) return timeoutRecovery;
    }
    throw error;
  } finally {
    controller.abort('redis_completion_finished');
    if (recoveryTimer) clearInterval(recoveryTimer);
    localAdapter?.stop?.('redis_completion_finished');
    redisAdapter?.stop?.('redis_completion_finished');
    closeRedisClient(recoveryClient);
    await redisDone?.catch?.(() => {});
  }
}
