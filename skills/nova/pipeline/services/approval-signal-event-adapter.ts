import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/approval-signal-event-adapter.js — filesystem edge adapter for approval wait signals.
// The runner consumes canonical EventBus events; this adapter owns local FS noise.

import fs from 'fs';
import path from 'path';
import { approvalSignalStreamKey, gateStatusPath } from '../core/paths.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { decodeRedisStreamEntry } from './task-transport-contract.ts';
import { assertPipelineEvent, assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';
import {
  APPROVAL_STATUS,
  APPROVAL_TIMEOUT_POLICY,
  buildApprovalIdentity,
  normalizeApprovalGateState,
  normalizeApprovalTimeoutPolicy,
} from '../runners/approval-gate-shared.ts';

export { approvalSignalStreamKey };

const APPROVAL_SIGNAL_SOURCE = 'approval_signal_publisher';
const APPROVAL_GATE_TYPE = 'approval';
const APPROVAL_SIGNAL_REDIS_MAX_LEN = 1000;
const APPROVAL_SIGNAL_REDIS_BLOCK_MS = 1000;
const APPROVAL_SIGNAL_REDIS_START_ID = '0-0';
const APPROVAL_SIGNAL_MAX_RETRIES_PER_REQUEST = 3;
const CORRUPTED_APPROVAL_STATE_MESSAGE = 'corrupted approval state';

function errorMessage(error) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizedUpperText(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim().toUpperCase();
}

function normalizedLowerText(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim().toLowerCase();
}

function redisFieldValue(value) {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : value;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function approvalGateType(value) {
  return selectDefinedValue(() => (nullableString(value)), () => (APPROVAL_GATE_TYPE));
}

function shouldStopOnTerminal(opts) {
  return opts.stopOnTerminal !== false;
}

function watchingCount(subscription) {
  return selectDefinedValue(() => (subscription?.watching), () => (0));
}

function createApprovalSignalRedisClient(opts, overrides = {}) {
  if (opts.redisClient) return opts.redisClient;
  const RedisCtor = selectDefinedValue(() => (opts.RedisCtor), () => (loadRedisCtor()));
  const redisOptions = selectDefinedValue(() => (objectRecord(opts.redis)), () => ({}));
  return createRedisClient(RedisCtor, redisOptions, overrides);
}

function approvalSignalStatePath(config, gateId, opts = {}) {
  return firstDefined(opts.statePath, gateStatusPath(config, gateId));
}

function approvalSignalStreamKeyAuthority(config, state = {}, opts = {}) {
  return firstDefined(opts.streamKey, approvalSignalStreamKey(config, state));
}

function approvalSignalRedisRetryStrategy(times) {
  return Math.min(times * 100, 2000);
}

function approvalSignalRedisOptions(opts, overrides = {}) {
  return {
    retryStrategy: typeof opts.retryStrategy === 'function' ? opts.retryStrategy : approvalSignalRedisRetryStrategy,
    maxRetriesPerRequest: firstDefined(opts.maxRetriesPerRequest, APPROVAL_SIGNAL_MAX_RETRIES_PER_REQUEST),
    enableReadyCheck: true,
    ...overrides,
  };
}

function isTerminalStatus(status) {
  return [
    APPROVAL_STATUS.APPROVED,
    APPROVAL_STATUS.REJECTED,
    APPROVAL_STATUS.CANCELLED,
    APPROVAL_STATUS.TIMED_OUT,
  ].includes(status);
}

function approvalSignalKind(state = {}) {
  const status = normalizedUpperText(state?.status);
  if (status === APPROVAL_STATUS.APPROVED) return 'approve';
  if (status === APPROVAL_STATUS.REJECTED) return 'reject';
  if (status === APPROVAL_STATUS.CANCELLED) return 'cancel';
  if (status === APPROVAL_STATUS.TIMED_OUT) {
    return normalizeApprovalTimeoutPolicy(state?.timeout_policy) === APPROVAL_TIMEOUT_POLICY.CONTINUE
      ? 'timeout_continue'
      : 'timeout_block';
  }
  return 'pending_update';
}

function nullableString(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  return String(value);
}

function nullableNumber(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function boolString(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

function parseNullableBool(value) {
  if (selectTruthyValue(() => (value === true), () => (value === false))) return value;
  const normalized = normalizedLowerText(value);
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function buildIdentity(config, gateId, gate, state = {}) {
  return buildApprovalIdentity(config, gateId, gate, state);
}

export function buildApprovalSignalEvent(config, gateId, gate, state = {}, opts = {}) {
  const normalized = normalizeApprovalGateState(state, buildIdentity(config, gateId, gate, state));
  const identity = buildIdentity(config, gateId, gate, normalized);
  const timeoutPolicy = normalizeApprovalTimeoutPolicy(normalized?.timeout_policy);
  const event = {
    type: 'approval.signal',
    source: 'local_fs',
    identity: {
      gate_id: gateId,
      ...(identity.run_id ? { run_id: identity.run_id } : {}),
    },
    payload: {
      gate_id: gateId,
      gate_type: APPROVAL_GATE_TYPE,
      run_id: nullableString(identity.run_id),
      project: nullableString(identity.project),
      wait_ref: nullableString((selectDefinedValue(() => (opts.waitRef), () => (null)))),
      status: normalizedUpperText(normalized?.status),
      signal_kind: approvalSignalKind(normalized),
      requested_at: nullableString(normalized?.requested_at),
      deadline: nullableString(normalized?.deadline),
      timeout_minutes: nullableNumber(normalized?.timeout_minutes),
      timeout_policy: timeoutPolicy,
      resolved_at: nullableString(normalized?.resolved_at),
      decision_by: nullableString(normalized?.decision_by),
      decision_via: nullableString(normalized?.decision_via),
      continued: normalized?.continued === undefined ? null : normalized.continued,
      reason: nullableString(normalized?.reason),
      state_path: approvalSignalStatePath(config, gateId, opts),
      updated_at: nullableString(normalized?.updated_at),
    },
  };
  return assertPipelineEvent(event, { requiredIdentityFields: ['gate_id'] });
}

export function buildApprovalSignalRedisEntry(event, opts = {}) {
  const asserted = assertPipelineEvent(event, { requiredIdentityFields: ['gate_id'] });
  const payload = objectRecord(asserted.payload);
  if (!payload) throw new TypeError('approval.signal event payload must be an object');
  return {
    schema_version: 'v1',
    type: 'approval.signal',
    stream_role: 'approval_signal',
    source: selectDefinedValue(() => (opts.source), () => (APPROVAL_SIGNAL_SOURCE)),
    project: nullableString(payload.project),
    run_id: nullableString(payload.run_id),
    gate_id: nullableString(payload.gate_id),
    gate_type: approvalGateType(payload.gate_type),
    wait_ref: nullableString(payload.wait_ref),
    status: nullableString(payload.status),
    signal_kind: nullableString(payload.signal_kind),
    timeout_policy: nullableString(payload.timeout_policy),
    decision_by: nullableString(payload.decision_by),
    decision_via: nullableString(payload.decision_via),
    continued: boolString(payload.continued),
    state_path: nullableString(payload.state_path),
    timestamp: new Date().toISOString(),
    payload: JSON.stringify(payload),
  };
}

function flattenRedisFields(fields = {}) {
  return Object.entries(fields).flatMap(([key, value]) => [key, redisFieldValue(value)]);
}

export async function publishApprovalSignalEvent(redisClient, streamKey, event, opts = {}) {
  if (selectTruthyValue(() => (!redisClient), () => (typeof redisClient.xadd !== 'function'))) {
    throw new TypeError('publishApprovalSignalEvent requires a Redis client with xadd');
  }
  if (!streamKey) throw new Error('publishApprovalSignalEvent requires streamKey');
  const entry = buildApprovalSignalRedisEntry(event, opts);
  const id = await redisClient.xadd(
    streamKey,
    'MAXLEN',
    '~',
    String(selectDefinedValue(() => (opts.maxLen), () => (APPROVAL_SIGNAL_REDIS_MAX_LEN))),
    '*',
    ...flattenRedisFields(entry),
  );
  return { ok: true, stream: streamKey, id, entry };
}

export async function publishApprovalSignalState(config, gateId, gate, state = {}, opts = {}) {
  const event = buildApprovalSignalEvent(config, gateId, gate, state, opts);
  const streamKey = approvalSignalStreamKeyAuthority(config, state, opts);
  const redisClient = createApprovalSignalRedisClient(opts, approvalSignalRedisOptions(opts));
  try {
    return await publishApprovalSignalEvent(redisClient, streamKey, event, opts);
  } finally {
    if (!opts.redisClient) {
      if (typeof redisClient.quit === 'function') await redisClient.quit();
      else if (typeof redisClient.disconnect === 'function') redisClient.disconnect();
    }
  }
}

export function emitApprovalSignalEvent(eventBus, config, gateId, gate, state = {}, opts = {}) {
  const adapter = assertPipelineEventBusAdapter(eventBus, 'ApprovalSignalEventAdapter eventBus');
  const event = buildApprovalSignalEvent(config, gateId, gate, state, opts);
  return adapter.emit(event);
}

function decodeXreadEntries(results = []) {
  const decoded = [];
  if (!Array.isArray(results)) return decoded;
  for (const streamResult of results) {
    const stream = streamResult?.[0];
    const entries = streamResult?.[1];
    if (!Array.isArray(entries)) continue;
    for (const rawEntry of entries) {
      const decodedEntry = decodeRedisStreamEntry(rawEntry);
      if (!decodedEntry) continue;
      decoded.push({ stream, id: decodedEntry.id, data: { _id: decodedEntry.id, ...decodedEntry.data } });
    }
  }
  return decoded;
}

function approvalSignalEventFromRedisEntry(entry = {}) {
  let payload = null;
  if (entry.payload) {
    try {
      payload = JSON.parse(entry.payload);
    } catch (_error) {
      payload = null;
    }
  }
  if ([!payload, typeof payload !== 'object', Array.isArray(payload)].some(Boolean)) {
    payload = {
      gate_id: nullableString(entry.gate_id),
      gate_type: approvalGateType(entry.gate_type),
      run_id: nullableString(entry.run_id),
      project: nullableString(entry.project),
      wait_ref: nullableString(entry.wait_ref),
      status: nullableString(entry.status),
      signal_kind: nullableString(entry.signal_kind),
      timeout_policy: nullableString(entry.timeout_policy),
      decision_by: nullableString(entry.decision_by),
      decision_via: nullableString(entry.decision_via),
      continued: parseNullableBool(entry.continued),
      state_path: nullableString(entry.state_path),
    };
  }
  return assertPipelineEvent({
    type: 'approval.signal',
    source: 'redis',
    identity: {
      gate_id: nullableString(payload.gate_id),
      ...(payload.run_id ? { run_id: nullableString(payload.run_id) } : {}),
    },
    payload,
  }, { requiredIdentityFields: ['gate_id'] });
}

export function createRedisApprovalSignalEventAdapter(config, opts = {}) {
  const eventBus = assertPipelineEventBusAdapter(opts.eventBus, 'RedisApprovalSignalEventAdapter eventBus');
  const gateId = opts.gateId;
  const gate = selectDefinedValue(() => (opts.gate), () => (null));
  const statePath = approvalSignalStatePath(config, gateId, opts);
  const runId = (selectDefinedValue(() => (config?._runId), () => (null)));
  const identity = {
    gate_id: gateId,
    ...(runId ? { run_id: runId } : {}),
  };
  const streamKey = approvalSignalStreamKeyAuthority(config, {}, opts);
  const blockMs = Number(selectDefinedValue(() => (selectDefinedValue(() => (opts.blockMs), () => (opts.pollMs))), () => (APPROVAL_SIGNAL_REDIS_BLOCK_MS)));
  if (selectTruthyValue(() => (!Number.isFinite(blockMs)), () => (blockMs < 0))) {
    throw new TypeError('RedisApprovalSignalEventAdapter blockMs must be a non-negative number');
  }
  const startId = selectDefinedValue(() => (opts.startId), () => (APPROVAL_SIGNAL_REDIS_START_ID));
  const controller = new AbortController();
  const signal = controller.signal;
  let client = null;
  let started = false;
  let donePromise = null;
  let stopping = false;

  const externalSignal = opts.signal;
  const abortFromExternal = () => stop('external_abort');
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external_abort');
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  function closeClient() {
    stopping = true;
    if ([!client, opts.redisClient].some(Boolean)) return;
    const current = client;
    client = null;
    try {
      if (typeof current.disconnect === 'function') current.disconnect();
      else if (typeof current.quit === 'function') void current.quit().catch?.(() => {});
    } catch (_error) {}
  }

  function stop(reason = 'stopped') {
    stopping = true;
    if (!signal.aborted) controller.abort(reason);
    closeClient();
  }

  function shouldEmit(event) {
    const payload = objectRecord(event?.payload);
    if (!payload) return false;
    if (gateId && payload.gate_id !== gateId) return false;
    const runId = (selectDefinedValue(() => (config?._runId), () => (null)));
    if (runId && payload.run_id !== runId) return false;
    return true;
  }

  async function run() {
    let lastId = startId;
    while (!signal.aborted) {
      try {
        const result = await client.xread('BLOCK', String(blockMs), 'STREAMS', streamKey, lastId);
        if ([signal.aborted, stopping].some(Boolean)) break;
        for (const entry of decodeXreadEntries(result)) {
          lastId = entry.id;
          if (entry.data.type !== 'approval.signal') continue;
          const event = approvalSignalEventFromRedisEntry({ ...entry.data, _stream: firstDefined(entry.stream, streamKey) });
          if (!shouldEmit(event)) continue;
          eventBus.emit(event);
          if (shouldStopOnTerminal(opts) && isTerminalStatus(normalizedUpperText(event.payload?.status))) {
            stop('terminal_signal_emitted');
            break;
          }
        }
      } catch (error) {
        if ([signal.aborted, stopping].some(Boolean)) break;
        emitFatal(eventBus, identity, {
          adapter: 'approval_signal_redis',
          reason: 'approval_signal_redis_adapter_failed',
          stream_key: streamKey,
          state_path: statePath,
          error_code: selectDefinedValue(() => (error?.code), () => (null)),
          error: errorMessage(error),
        });
        throw error;
      }
    }
    return { stopped: true, stream_key: streamKey };
  }

  function start() {
    if (started) return { watching: 0, stream_key: streamKey, done: donePromise };
    started = true;
    if (signal.aborted) return { watching: 0, stream_key: streamKey, done: Promise.resolve({ stopped: true, stream_key: streamKey }) };
      client = createApprovalSignalRedisClient(opts, approvalSignalRedisOptions(opts, { maxRetriesPerRequest: null }));
    client.on?.('error', () => {});
    donePromise = run().finally(() => {
      closeClient();
      if (externalSignal) externalSignal.removeEventListener?.('abort', abortFromExternal);
    });
    return { watching: 0, stream_key: streamKey, done: donePromise };
  }

  return {
    get signal() { return signal; },
    get streamKey() { return streamKey; },
    get done() { return donePromise; },
    start,
    stop,
  };
}

function emitFatal(eventBus, identity, payload) {
  eventBus.emit({
    type: 'fatal.error',
    source: 'system',
    identity,
    payload,
  });
}

function watcherStartFailureReason(error) {
  return ['ENOSPC', 'EMFILE'].includes(error?.code)
    ? 'watcher_limit_reached'
    : 'watcher_start_failed';
}

const approvalSignalWatchRegistry = new Map();

function pathKey(value) {
  return path.resolve(value);
}

function shouldNotifySubscriber(subscriber, changedFileName) {
  if (!changedFileName) return true;
  const changedName = String(changedFileName);
  if (changedName === subscriber.fileName) return true;
  return path.resolve(subscriber.watchPath, changedName) === subscriber.statePath;
}

function getOrCreateWatchEntry(watchPath) {
  const key = pathKey(watchPath);
  const existing = approvalSignalWatchRegistry.get(key);
  if (existing) return existing;

  const entry = {
    key,
    watchPath,
    watcher: null,
    subscribers: new Set(),
    error: null,
  };

  try {
    const watcher = fs.watch(watchPath, (_eventType, changedFileName) => {
      for (const subscriber of [...entry.subscribers]) {
        if (!shouldNotifySubscriber(subscriber, changedFileName)) continue;
        subscriber.schedule();
      }
    });
    watcher.on?.('error', (error) => {
      for (const subscriber of [...entry.subscribers]) {
        subscriber.onError(error, 'watcher_error');
      }
    });
    entry.watcher = watcher;
    approvalSignalWatchRegistry.set(key, entry);
    return entry;
  } catch (error) {
    entry.error = error;
    return entry;
  }
}

function subscribeApprovalSignalWatch({ watchPath, statePath, fileName, schedule, onError }) {
  const entry = getOrCreateWatchEntry(watchPath);
  if (entry.error) {
    onError(entry.error, watcherStartFailureReason(entry.error));
    return {
      watching: 0,
      unsubscribe() {},
    };
  }

  const subscriber = {
    watchPath,
    statePath: pathKey(statePath),
    fileName,
    schedule,
    onError,
  };
  entry.subscribers.add(subscriber);

  return {
    watching: entry.watcher ? 1 : 0,
    unsubscribe() {
      entry.subscribers.delete(subscriber);
      if (entry.subscribers.size > 0) return;
      try { entry.watcher?.close?.(); } catch (_error) {}
      approvalSignalWatchRegistry.delete(entry.key);
    },
  };
}

export function createApprovalSignalEventAdapter(config, opts = {}) {
  const eventBus = assertPipelineEventBusAdapter(opts.eventBus, 'ApprovalSignalEventAdapter eventBus');
  const gateId = opts.gateId;
  const gate = selectDefinedValue(() => (opts.gate), () => (null));
  const statePath = approvalSignalStatePath(config, gateId, opts);
  const watchPath = path.dirname(statePath);
  const fileName = path.basename(statePath);
  const identity = {
    gate_id: gateId,
    ...((selectDefinedValue(() => (config?._runId), () => (null))) ? { run_id: (selectDefinedValue(() => (config?._runId), () => (null))) } : {}),
  };
  if ([opts.debounceMs === undefined, opts.debounceMs === null].some(Boolean)) {
    throw new TypeError('ApprovalSignalEventAdapter requires debounceMs');
  }
  const debounceMs = Number(opts.debounceMs);
  if (selectTruthyValue(() => (!Number.isFinite(debounceMs)), () => (debounceMs < 0))) {
    throw new TypeError('ApprovalSignalEventAdapter debounceMs must be a non-negative number');
  }
  const loadState = typeof opts.loadState === 'function'
    ? opts.loadState
    : () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const controller = new AbortController();
  const signal = controller.signal;
  let watchSubscription = null;
  let timer = null;
  let started = false;

  const externalSignal = opts.signal;
  const abortFromExternal = () => stop('external_abort');
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external_abort');
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  function clearDebounce() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function emitCurrentState() {
    timer = null;
    if (signal.aborted) return;
    let state;
    try {
      state = loadState(config, gateId);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'approval_state_read_failed',
        state_path: statePath,
        error: errorMessage(error),
      });
      return;
    }

    if (!state) return;
    if (state?._corrupted_gate_state) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'approval_state_corrupted',
        state_path: statePath,
        error: selectDefinedValue(() => (state.parse_error), () => (CORRUPTED_APPROVAL_STATE_MESSAGE)),
      });
      return;
    }

    try {
      emitApprovalSignalEvent(eventBus, config, gateId, gate, state, {
        statePath,
        waitRef: opts.waitRef,
      });
    } catch (error) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'approval_signal_contract_invalid',
        state_path: statePath,
        error: errorMessage(error),
      });
      return;
    }

    if (isTerminalStatus(normalizedUpperText(state?.status)) && shouldStopOnTerminal(opts)) {
      stop('terminal_signal_emitted');
    }
  }

  function schedule() {
    if (signal.aborted) return;
    clearDebounce();
    timer = setTimeout(emitCurrentState, debounceMs);
  }

  function stop(reason = 'stopped') {
    if (!signal.aborted) controller.abort(reason);
    clearDebounce();
    watchSubscription?.unsubscribe?.();
    watchSubscription = null;
    if (externalSignal) externalSignal.removeEventListener?.('abort', abortFromExternal);
  }

  function start() {
    if (started) return { watching: watchingCount(watchSubscription), path: statePath };
    started = true;
    if (signal.aborted) return { watching: 0, path: statePath };
    if (!gateId) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'gate_id_missing',
        state_path: statePath,
      });
      return { watching: 0, path: statePath };
    }
    try {
      fs.mkdirSync(watchPath, { recursive: true });
    } catch (error) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'watch_path_create_failed',
        state_path: statePath,
        watch_path: watchPath,
        error: errorMessage(error),
      });
      return { watching: 0, path: statePath };
    }
    watchSubscription = subscribeApprovalSignalWatch({
      watchPath,
      statePath,
      fileName,
      schedule,
      onError(error, reason) {
        if (signal.aborted) return;
        emitFatal(eventBus, identity, {
          adapter: 'approval_signal',
          reason,
          state_path: statePath,
          watch_path: watchPath,
          error_code: selectDefinedValue(() => (error?.code), () => (null)),
          error: errorMessage(error),
        });
      },
    });
    if (opts.emitExisting === true && watchSubscription.watching > 0) schedule();
    return { watching: watchSubscription.watching, path: statePath };
  }

  return {
    get signal() { return signal; },
    get watcherCount() { return watchingCount(watchSubscription); },
    get pendingTimer() { return timer; },
    start,
    stop,
  };
}
