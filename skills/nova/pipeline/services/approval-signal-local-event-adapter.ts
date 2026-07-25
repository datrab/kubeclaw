import fs from 'fs';
import path from 'path';
import { assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';
import { adapterErrorMessage, attachExternalAbort } from './event-adapter-support.ts';
import {
  approvalSignalStatePath,
  emitApprovalSignalEvent,
  isTerminalApprovalStatus,
  normalizedUpperText,
} from './approval-signal-event.ts';

const CORRUPTED_APPROVAL_STATE_MESSAGE = 'corrupted approval state';
const watchRegistry = new Map();

function emitFatal(eventBus: any, identity: any, payload: any) {
  eventBus.emit({ type: 'fatal.error', source: 'system', identity, payload });
}

function pathKey(value: any) {
  return path.resolve(value);
}

function shouldNotify(subscriber: any, changedFileName: any) {
  if (!changedFileName) return true;
  const changedName = String(changedFileName);
  return changedName === subscriber.fileName || path.resolve(subscriber.watchPath, changedName) === subscriber.statePath;
}

function getOrCreateWatchEntry(watchPath: any) {
  const key = pathKey(watchPath);
  const existing = watchRegistry.get(key);
  if (existing) return existing;
  const entry: any = { key, watchPath, watcher: null, subscribers: new Set(), error: null };
  try {
    entry.watcher = fs.watch(watchPath, (_eventType: any, changedFileName: any) => {
      for (const subscriber of [...entry.subscribers] as any[]) {
        if (shouldNotify(subscriber, changedFileName)) subscriber.schedule();
      }
    });
    entry.watcher.on?.('error', (error: any) => {
      for (const subscriber of [...entry.subscribers] as any[]) subscriber.onError(error, 'watcher_error');
    });
    watchRegistry.set(key, entry);
  } catch (error: any) {
    entry.error = error;
  }
  return entry;
}

function subscribeWatch(subscription: any) {
  const entry = getOrCreateWatchEntry(subscription.watchPath);
  if (entry.error) {
    const reason = ['ENOSPC', 'EMFILE'].includes(entry.error?.code) ? 'watcher_limit_reached' : 'watcher_start_failed';
    subscription.onError(entry.error, reason);
    return { watching: 0, unsubscribe() {} };
  }
  const subscriber = { ...subscription, statePath: pathKey(subscription.statePath) };
  entry.subscribers.add(subscriber);
  return {
    watching: entry.watcher ? 1 : 0,
    unsubscribe() {
      entry.subscribers.delete(subscriber);
      if (entry.subscribers.size > 0) return;
      try { entry.watcher?.close?.(); } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): watcher cleanup does not own approval state. */ }
      watchRegistry.delete(entry.key);
    },
  };
}

function readAndEmitCurrentState(ctx: any, runtime: any) {
  runtime.timer = null;
  if (runtime.signal.aborted) return;
  let state;
  try {
    state = ctx.loadState(ctx.config, ctx.gateId);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') emitFatal(ctx.eventBus, ctx.identity, { adapter: 'approval_signal', reason: 'approval_state_read_failed', state_path: ctx.statePath, error: adapterErrorMessage(error) });
    return;
  }
  if (!state) return;
  if (state._corrupted_gate_state) {
    emitFatal(ctx.eventBus, ctx.identity, { adapter: 'approval_signal', reason: 'approval_state_corrupted', state_path: ctx.statePath, error: state.parse_error ?? CORRUPTED_APPROVAL_STATE_MESSAGE });
    return;
  }
  try {
    emitApprovalSignalEvent(ctx.eventBus, ctx.config, ctx.gateId, ctx.gate, state, { statePath: ctx.statePath, waitRef: ctx.opts.waitRef });
  } catch (error: any) {
    emitFatal(ctx.eventBus, ctx.identity, { adapter: 'approval_signal', reason: 'approval_signal_contract_invalid', state_path: ctx.statePath, error: adapterErrorMessage(error) });
    return;
  }
  if (isTerminalApprovalStatus(normalizedUpperText(state.status)) && ctx.opts.stopOnTerminal !== false) runtime.stop('terminal_signal_emitted');
}

function createLocalRuntime(ctx: any) {
  const controller = new AbortController();
  const runtime: any = { signal: controller.signal, subscription: null, timer: null, started: false };
  const clearTimer = () => { if (runtime.timer) clearTimeout(runtime.timer); runtime.timer = null; };
  runtime.schedule = () => {
    if (runtime.signal.aborted) return;
    clearTimer();
    runtime.timer = setTimeout(() => readAndEmitCurrentState(ctx, runtime), ctx.debounceMs);
  };
  let detach = () => {};
  runtime.stop = (reason: any = 'stopped') => {
    if (!runtime.signal.aborted) controller.abort(reason);
    clearTimer();
    runtime.subscription?.unsubscribe?.();
    runtime.subscription = null;
    detach();
  };
  detach = attachExternalAbort(controller, ctx.opts.signal, runtime.stop);
  return runtime;
}

function startLocalAdapter(ctx: any, runtime: any) {
  if (runtime.started) return { watching: runtime.subscription?.watching ?? 0, path: ctx.statePath };
  runtime.started = true;
  if (runtime.signal.aborted) return { watching: 0, path: ctx.statePath };
  if (!ctx.gateId) {
    emitFatal(ctx.eventBus, ctx.identity, { adapter: 'approval_signal', reason: 'gate_id_missing', state_path: ctx.statePath });
    return { watching: 0, path: ctx.statePath };
  }
  try {
    fs.mkdirSync(ctx.watchPath, { recursive: true });
  } catch (error: any) {
    emitFatal(ctx.eventBus, ctx.identity, { adapter: 'approval_signal', reason: 'watch_path_create_failed', state_path: ctx.statePath, watch_path: ctx.watchPath, error: adapterErrorMessage(error) });
    return { watching: 0, path: ctx.statePath };
  }
  runtime.subscription = subscribeWatch({
    watchPath: ctx.watchPath, statePath: ctx.statePath, fileName: ctx.fileName, schedule: runtime.schedule,
    onError: (error: any, reason: any) => {
      if (!runtime.signal.aborted) emitFatal(ctx.eventBus, ctx.identity, { adapter: 'approval_signal', reason, state_path: ctx.statePath, watch_path: ctx.watchPath, error_code: error?.code ?? null, error: adapterErrorMessage(error) });
    },
  });
  if (ctx.opts.emitExisting === true && runtime.subscription.watching > 0) runtime.schedule();
  return { watching: runtime.subscription.watching, path: ctx.statePath };
}

export function createApprovalSignalEventAdapter(config: any, opts: any = {}) {
  if (opts.debounceMs === undefined || opts.debounceMs === null) throw new TypeError('ApprovalSignalEventAdapter requires debounceMs');
  const debounceMs = Number(opts.debounceMs);
  if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new TypeError('ApprovalSignalEventAdapter debounceMs must be a non-negative number');
  const statePath = approvalSignalStatePath(config, opts.gateId, opts);
  const runId = config?._runId ?? null;
  const ctx = {
    config, opts, debounceMs, statePath, gateId: opts.gateId, gate: opts.gate ?? null,
    watchPath: path.dirname(statePath), fileName: path.basename(statePath),
    eventBus: assertPipelineEventBusAdapter(opts.eventBus, 'ApprovalSignalEventAdapter eventBus'),
    identity: { gate_id: opts.gateId, ...(runId ? { run_id: runId } : {}) },
    loadState: typeof opts.loadState === 'function' ? opts.loadState : () => JSON.parse(fs.readFileSync(statePath, 'utf8')),
  };
  const runtime = createLocalRuntime(ctx);
  return {
    get signal() { return runtime.signal; },
    get watcherCount() { return runtime.subscription?.watching ?? 0; },
    get pendingTimer() { return runtime.timer; },
    start: () => startLocalAdapter(ctx, runtime),
    stop: runtime.stop,
  };
}
