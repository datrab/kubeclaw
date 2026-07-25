import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import type {
  NormalizedRedisWaitOptions,
  RedisClientLike,
  UnknownRecord,
} from './redis-wait-types.ts';

type RecoveryCompletionInput = {
  targetKind: 'module' | 'gate';
  targetId: string;
  streamKey: string;
  entry: UnknownRecord;
  reason: string;
};

type RecoveryController = {
  close: () => void;
  recover: (reason: string, localStatus?: unknown) => Promise<any>;
};

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function redisScanMetric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeIdentityValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function buildRecoveryCompletionEvent({
  targetKind,
  targetId,
  streamKey,
  entry,
  reason,
}: RecoveryCompletionInput): UnknownRecord {
  return {
    type: 'completion.evidence',
    source: 'redis',
    identity: {
      ...(targetKind === 'gate'
        ? { gate_id: selectTruthyValue(() => normalizeIdentityValue(entry?.gate_id), () => targetId) }
        : { module_id: selectTruthyValue(() => normalizeIdentityValue(entry?.module), () => targetId) }),
      ...(entry?.run_id ? { run_id: entry.run_id } : {}),
      ...(entry?.attempt != null && String(entry.attempt) !== '' ? { attempt: entry.attempt } : {}),
      ...(entry?.dispatch_id ? { dispatch_id: entry.dispatch_id } : {}),
      ...(entry?.session_key ? { session_key: entry.session_key } : {}),
      ...(entry?.gateway_label ? { gateway_label: entry.gateway_label } : {}),
    },
    payload: {
      stream_key: streamKey,
      redis_id: selectTruthyValue(() => entry?._id, () => null),
      entry,
      recovery_reason: reason,
    },
  };
}

function closeRedisClient(client: RedisClientLike | null): void {
  if (!client) return;
  try {
    if (typeof client.disconnect === 'function') client.disconnect();
    else if (typeof client.quit === 'function') void client.quit().catch?.(() => {});
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): recovery cleanup is best effort after the owning wait has completed. */ }
}

function logRecoveredCompletion(
  options: NormalizedRedisWaitOptions,
  entry: UnknownRecord,
  reason: string,
): void {
  options.logRedisReceived(options.config, 'completion_tail_scan_recovered', options.targetKind, options.targetId, {
    redis_id: selectTruthyValue(() => entry._id, () => null),
    status: selectTruthyValue(() => entry.status, () => null),
    outcome: selectTruthyValue(() => entry.outcome, () => null),
    source: selectTruthyValue(() => entry.source, () => null),
    run_id: selectTruthyValue(() => entry.run_id, () => null),
    attempt: selectDefinedValue(() => entry.attempt, () => null),
    dispatch_id: selectTruthyValue(() => entry.dispatch_id, () => null),
    session_key: selectTruthyValue(() => entry.session_key, () => null),
    reason,
  });
}

async function scanForCompletion(
  options: NormalizedRedisWaitOptions,
  redis: RedisClientLike,
  reason: string,
  localStatus: unknown,
): Promise<any> {
  const result = await options.scanLatestCompletionFromTail(
    redis,
    options.streamKey,
    options.targetId,
    options.expectedIdentity,
    { batchSize: options.tailScanBatchSize, scanLimit: options.tailScanLimit },
  );
  options.logRedisOperation(options.config, {
    op: 'completion_tail_scan',
    target_kind: options.targetKind,
    target_id: options.targetId,
    reason,
    matched: Boolean(result?.match),
    scanned: redisScanMetric(result?.scanned),
    batches: redisScanMetric(result?.batches),
    truncated: Boolean(result?.truncated),
  });
  if (!result?.match) return null;
  logRecoveredCompletion(options, result.match, reason);
  return options.resolveCompletionEvent({
    event: buildRecoveryCompletionEvent({
      targetKind: options.targetKind,
      targetId: options.targetId,
      streamKey: options.streamKey,
      entry: result.match,
      reason,
    }),
    targetKind: options.targetKind,
    targetId: options.targetId,
    expectedStatuses: options.expectedStatuses,
    expectedIdentity: options.expectedIdentity,
    localStatus,
    statusSource: options.statusSource,
  });
}

function logRecoveryFailure(options: NormalizedRedisWaitOptions, reason: string, error: unknown): void {
  options.log('WARN', `Completion tail scan recovery failed for ${options.targetKind} ${options.targetId}: ${errorMessage(error)}`);
  options.logRedisOperation(options.config, {
    op: 'completion_tail_scan_failed',
    target_kind: options.targetKind,
    target_id: options.targetId,
    reason,
    error: errorMessage(error),
  });
}

export function createRedisRecoveryController(
  options: NormalizedRedisWaitOptions,
  signal: AbortSignal,
): RecoveryController {
  let client: RedisClientLike | null = null;
  let activeScan: Promise<any> | null = null;

  function getClient(): RedisClientLike {
    if (client) return client;
    client = options.createRedisClient({
      ...options.redisOptions,
      ...(options.RedisCtor ? { RedisCtor: options.RedisCtor } : {}),
    }) as RedisClientLike;
    client.on?.('error', () => {});
    return client;
  }

  async function recover(reason: string, localStatus: unknown = null): Promise<any> {
    if (signal.aborted) return null;
    if (activeScan) return activeScan;
    activeScan = scanForCompletion(options, getClient(), reason, localStatus)
      .catch((error: unknown) => {
        logRecoveryFailure(options, reason, error);
        return null;
      })
      .finally(() => { activeScan = null; });
    return activeScan;
  }

  return {
    close: () => closeRedisClient(client),
    recover,
  };
}
