import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/completion-event-adapters.ts — OI-42 edge adapters for completion evidence events.
// Active Buster module/gate completion waits use these adapters.

import fs from 'fs';
import path from 'path';
import { completionStreamKey } from '../core/paths.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { decodeRedisStreamEntry } from './task-transport-contract.ts';
import { normalizeRedisPipelineEnvelope } from './redis-message-contract.ts';
import { assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';

const INTENTIONAL_ABORT_REDIS_ERROR_MESSAGES = [
  'connection is closed',
  'connection closed',
  'connection forcefully',
  'connection ended',
  'connection lost',
  'stream isn\'t writeable',
  'stream is not writeable',
  'connection is not writable',
  'econnreset',
  'abort',
];
const REDIS_LIVE_STREAM_START_ID = '$';

function errorMessage(error) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function completionGateId(envelope) {
  if (envelope.target_kind !== 'gate') return null;
  if (!envelope.target_id) return null;
  if (envelope.gate_id) return envelope.gate_id;
  return envelope.target_id;
}

function completionModuleId(envelope) {
  if (envelope.target_kind === 'gate') {
    return envelope.module ? envelope.module : null;
  }
  if (!envelope.target_id) return null;
  if (envelope.module) return envelope.module;
  return envelope.target_id;
}

function completionEntryStreamKey(entryStream, configuredStream) {
  if (entryStream) return entryStream;
  return configuredStream;
}

export function createDedicatedRedisCompletionClient(opts = {}) {
  const RedisCtor = selectDefinedValue(() => (opts.RedisCtor), () => (loadRedisCtor()));
  return createRedisClient(RedisCtor, opts, {
    retryStrategy: selectDefinedValue(() => (opts.retryStrategy), () => (((times) => Math.min(times * 100, 5000)))),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

function isIntentionalAbortRedisError(error, { signal = null, stopping = false } = {}) {
  if (!signal?.aborted && !stopping) return false;
  const message = String(selectDefinedValue(() => (selectDefinedValue(() => (error?.message), () => (error))), () => (''))).toLowerCase();
  return [message === '', INTENTIONAL_ABORT_REDIS_ERROR_MESSAGES.some(fragment => message.includes(fragment))].some(Boolean);
}

function emitFatal(eventBus, identity, payload) {
  eventBus.emit({
    type: 'fatal.error',
    source: 'system',
    identity,
    payload,
  });
}

function emitLocalEvidenceWarning(eventBus, identity, payload) {
  eventBus.emit({
    type: 'local.evidence.warning',
    source: 'local_fs',
    identity,
    payload,
  });
}

function buildCompletionEventIdentity(entry = {}) {
  const envelope = normalizeRedisPipelineEnvelope(entry);
  const gateId = completionGateId(envelope);
  const moduleId = completionModuleId(envelope);
  return {
    ...(gateId ? { gate_id: gateId } : {}),
    ...(moduleId ? { module_id: moduleId } : {}),
    ...(envelope.run_id ? { run_id: envelope.run_id } : {}),
    ...(envelope.attempt ? { attempt: envelope.attempt } : {}),
    ...(envelope.dispatch_id ? { dispatch_id: envelope.dispatch_id } : {}),
    ...(envelope.session_key ? { session_key: envelope.session_key } : {}),
    ...(entry.gateway_label ? { gateway_label: entry.gateway_label } : {}),
  };
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

export function createRedisCompletionEventAdapter(config, opts = {}) {
  const eventBus = assertPipelineEventBusAdapter(opts.eventBus, 'RedisCompletionEventAdapter eventBus');
  const stream = selectDefinedValue(() => (opts.stream), () => (completionStreamKey(config)));
  if (selectTruthyValue(() => (opts.blockMs === undefined), () => (opts.blockMs === null))) {
    throw new TypeError('RedisCompletionEventAdapter requires blockMs');
  }
  const blockMs = Number(opts.blockMs);
  if (selectTruthyValue(() => (!Number.isFinite(blockMs)), () => (blockMs < 0))) {
    throw new TypeError('RedisCompletionEventAdapter blockMs must be a non-negative number');
  }
  const startId = selectDefinedValue(() => (opts.startId), () => (REDIS_LIVE_STREAM_START_ID));
  const fatalIdentity = objectRecord(opts.identity);
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
    if (!client) return;
    const current = client;
    client = null;
    try {
      if (typeof current.disconnect === 'function') current.disconnect();
      else if (typeof current.quit === 'function') void current.quit().catch?.(() => {});
    } catch (_error) {
      // Intentional abort cleanup is best-effort; the blocked XREAD promise owns its rejection.
    }
  }

  function stop(reason = 'stopped') {
    stopping = true;
    if (!signal.aborted) controller.abort(reason);
    closeClient();
  }

  async function run() {
    let lastId = startId;
    while (!signal.aborted) {
      try {
        const result = await client.xread('BLOCK', String(blockMs), 'STREAMS', stream, lastId);
        if (selectTruthyValue(() => (signal.aborted), () => (stopping))) break;
        for (const entry of decodeXreadEntries(result)) {
          lastId = entry.id;
          if (entry.data.type && entry.data.type !== 'completion') continue;
          eventBus.emit({
            type: 'completion.evidence',
            source: 'redis',
            identity: buildCompletionEventIdentity(entry.data),
            payload: {
              stream_key: completionEntryStreamKey(entry.stream, stream),
              redis_id: entry.id,
              entry: entry.data,
            },
          });
        }
      } catch (error) {
        if (isIntentionalAbortRedisError(error, { signal, stopping })) break;
        emitFatal(eventBus, fatalIdentity, {
          adapter: 'redis_completion',
          stream_key: stream,
          reason: 'redis_completion_adapter_failed',
          error: errorMessage(error),
        });
        throw error;
      }
    }
    return { stopped: true, stream_key: stream };
  }

  function start() {
    if (started) return donePromise;
    started = true;
    if (signal.aborted) {
      donePromise = Promise.resolve({ stopped: true, stream_key: stream });
      return donePromise;
    }
    client = createDedicatedRedisCompletionClient(opts);
    client.on?.('error', () => {});
    donePromise = run().finally(() => {
      closeClient();
      if (externalSignal) externalSignal.removeEventListener?.('abort', abortFromExternal);
    });
    return donePromise;
  }

  return {
    get client() { return client; },
    get signal() { return signal; },
    get done() { return donePromise; },
    start,
    stop,
  };
}

function uniquePaths(paths = []) {
  const entries = Array.isArray(paths) ? paths : [];
  return [...new Set(entries.filter(Boolean).map((item) => path.resolve(item)))];
}

function nearestExistingDirectory(targetPath) {
  let current = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
    ? targetPath
    : path.dirname(targetPath);
  while (current && !fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return fs.existsSync(current) && fs.statSync(current).isDirectory() ? current : null;
}

function buildWatcherSpecs(paths = []) {
  return uniquePaths(paths).map((targetPath) => {
    const existingDir = nearestExistingDirectory(targetPath);
    if (!existingDir) return { targetPath, watchPath: null, fileName: path.basename(targetPath) };
    const watchPath = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
      ? path.dirname(targetPath)
      : existingDir;
    return { targetPath, watchPath, fileName: path.basename(targetPath) };
  });
}

function isSameOrAncestorPath(candidatePath, targetPath) {
  const relative = path.relative(path.resolve(candidatePath), path.resolve(targetPath));
  return selectTruthyValue(() => (relative === ''), () => ((!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))));
}

export function createLocalEvidenceEventAdapter(config, opts = {}) {
  const eventBus = assertPipelineEventBusAdapter(opts.eventBus, 'LocalEvidenceEventAdapter eventBus');
  const evidencePaths = uniquePaths(opts.paths);
  const identity = objectRecord(opts.identity);
  if (selectTruthyValue(() => (opts.debounceMs === undefined), () => (opts.debounceMs === null))) {
    throw new TypeError('LocalEvidenceEventAdapter requires debounceMs');
  }
  const debounceMs = Number(opts.debounceMs);
  if (selectTruthyValue(() => (!Number.isFinite(debounceMs)), () => (debounceMs < 0))) {
    throw new TypeError('LocalEvidenceEventAdapter debounceMs must be a non-negative number');
  }
  const controller = new AbortController();
  const signal = controller.signal;
  const watchers = [];
  const rescanTimers = [];
  const activeWatchKeys = new Set();
  const activeRescanKeys = new Set();
  const changedPaths = new Set();
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

  function emitChanged() {
    timer = null;
    if (selectTruthyValue(() => (signal.aborted), () => (changedPaths.size === 0))) return;
    const paths = [...changedPaths];
    changedPaths.clear();
    eventBus.emit({
      type: 'local.evidence.updated',
      source: 'local_fs',
      identity,
      payload: {
        paths,
        watched_paths: evidencePaths,
        debounce_ms: debounceMs,
      },
    });
  }

  function schedule(targetPath) {
    if (signal.aborted) return;
    changedPaths.add(targetPath);
    clearDebounce();
    timer = setTimeout(emitChanged, debounceMs);
  }

  function stop(reason = 'stopped') {
    if (!signal.aborted) controller.abort(reason);
    clearDebounce();
    changedPaths.clear();
    while (watchers.length > 0) {
      const watcher = watchers.pop();
      try { watcher.close(); } catch (_error) {}
    }
    while (rescanTimers.length > 0) {
      clearInterval(rescanTimers.pop());
    }
    activeWatchKeys.clear();
    activeRescanKeys.clear();
    if (externalSignal) externalSignal.removeEventListener?.('abort', abortFromExternal);
  }

  function startPathRescan(spec) {
    const rescanKey = spec.targetPath;
    if (activeRescanKeys.has(rescanKey)) return;
    activeRescanKeys.add(rescanKey);
    const intervalMs = Math.max(10, Math.min(debounceMs, 250));
    const timer = setInterval(() => {
      if (signal.aborted) return;
      const nextSpec = buildWatcherSpecs([spec.targetPath])[0];
      if (nextSpec?.watchPath && nextSpec.watchPath !== spec.watchPath) startWatcher(nextSpec);
      if (fs.existsSync(spec.targetPath)) schedule(spec.targetPath);
    }, intervalMs);
    rescanTimers.push(timer);
  }

  function startWatcher(spec) {
    if (!fs.existsSync(spec.targetPath)) startPathRescan(spec);
    if (!spec.watchPath) {
      emitLocalEvidenceWarning(eventBus, identity, {
        adapter: 'local_evidence',
        reason: 'watch_path_missing',
        path: spec.targetPath,
      });
      return;
    }
    const watchKey = `${spec.targetPath}\0${spec.watchPath}`;
    if (activeWatchKeys.has(watchKey)) return;
    try {
      const watcher = fs.watch(spec.watchPath, (eventType, fileName) => {
        const changedName = fileName ? String(fileName) : null;
        const changedPath = changedName ? path.resolve(spec.watchPath, changedName) : null;
        if (changedPath && changedName !== spec.fileName && changedPath !== spec.targetPath && !isSameOrAncestorPath(changedPath, spec.targetPath)) return;
        schedule(spec.targetPath);
        const nextSpec = buildWatcherSpecs([spec.targetPath])[0];
        if (nextSpec?.watchPath && nextSpec.watchPath !== spec.watchPath) startWatcher(nextSpec);
      });
      watcher.on?.('error', (error) => {
        if (signal.aborted) return;
        emitFatal(eventBus, identity, {
          adapter: 'local_evidence',
          reason: 'watcher_error',
          path: spec.targetPath,
          error: errorMessage(error),
        });
      });
      activeWatchKeys.add(watchKey);
      watchers.push(watcher);
      if (opts.emitExisting === true && fs.existsSync(spec.targetPath)) schedule(spec.targetPath);
    } catch (error) {
      emitLocalEvidenceWarning(eventBus, identity, {
        adapter: 'local_evidence',
        reason: error?.code === 'ENOSPC' ? 'watcher_limit_reached' : 'watcher_start_failed',
        path: spec.targetPath,
        error: errorMessage(error),
      });
    }
  }

  function start() {
    if (started) return { watching: watchers.length, paths: evidencePaths };
    started = true;
    if (signal.aborted) return { watching: 0, paths: evidencePaths };
    for (const spec of buildWatcherSpecs(evidencePaths)) {
      startWatcher(spec);
    }
    return { watching: watchers.length, paths: evidencePaths };
  }

  return {
    get signal() { return signal; },
    get watcherCount() { return watchers.length; },
    start,
    stop,
  };
}
