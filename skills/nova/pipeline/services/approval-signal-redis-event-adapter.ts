import { selectDefinedValue } from '../optional-absence.ts';
import { assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';
import {
  adapterErrorMessage,
  attachExternalAbort,
  decodeRedisXreadEntries,
  nullableObjectRecord,
  releaseRedisAdapterClient,
} from './event-adapter-support.ts';
import {
  APPROVAL_SIGNAL_REDIS_BLOCK_MS,
  APPROVAL_SIGNAL_REDIS_START_ID,
  approvalSignalEventFromRedisEntry,
  approvalSignalRedisOptions,
  approvalSignalStatePath,
  approvalSignalStreamKeyAuthority,
  createApprovalSignalRedisClient,
  firstDefined,
  isTerminalApprovalStatus,
  normalizedUpperText,
} from './approval-signal-event.ts';

function emitFatal(eventBus: any, identity: any, payload: any) {
  eventBus.emit({ type: 'fatal.error', source: 'system', identity, payload });
}

function createRedisApprovalSignalRuntime(ctx: any) {
  const controller = new AbortController();
  const state: any = { client: null, started: false, donePromise: null, stopping: false };
  const closeClient = () => {
    state.stopping = true;
    state.client = releaseRedisAdapterClient(state.client, ctx.opts.redisClient);
  };
  const stop = (reason: any = 'stopped') => {
    state.stopping = true;
    if (!controller.signal.aborted) controller.abort(reason);
    closeClient();
  };
  const detach = attachExternalAbort(controller, ctx.opts.signal, stop);
  return { controller, signal: controller.signal, state, closeClient, stop, detach };
}

function shouldEmit(ctx: any, event: any) {
  const payload = nullableObjectRecord(event?.payload);
  if (!payload) return false;
  if (ctx.gateId && payload.gate_id !== ctx.gateId) return false;
  if (ctx.runId && payload.run_id !== ctx.runId) return false;
  return true;
}

function processEntries(ctx: any, runtime: any, result: any) {
  let lastId = null;
  for (const entry of decodeRedisXreadEntries(result)) {
    lastId = entry.id;
    if (entry.data.type !== 'approval.signal') continue;
    const event = approvalSignalEventFromRedisEntry({ ...entry.data, _stream: firstDefined(entry.stream, ctx.streamKey) });
    if (!shouldEmit(ctx, event)) continue;
    ctx.eventBus.emit(event);
    if (ctx.opts.stopOnTerminal !== false && isTerminalApprovalStatus(normalizedUpperText(event.payload?.status))) {
      runtime.stop('terminal_signal_emitted');
      break;
    }
  }
  return lastId;
}

async function consumeRedisApprovalSignals(ctx: any, runtime: any) {
  let lastId = ctx.startId;
  while (!runtime.signal.aborted) {
    try {
      const result = await runtime.state.client.xread('BLOCK', String(ctx.blockMs), 'STREAMS', ctx.streamKey, lastId);
      if (runtime.signal.aborted || runtime.state.stopping) break;
      lastId = processEntries(ctx, runtime, result) ?? lastId;
    } catch (error: any) {
      if (runtime.signal.aborted || runtime.state.stopping) break;
      emitFatal(ctx.eventBus, ctx.identity, {
        adapter: 'approval_signal_redis', reason: 'approval_signal_redis_adapter_failed', stream_key: ctx.streamKey,
        state_path: ctx.statePath, error_code: error?.code ?? null, error: adapterErrorMessage(error),
      });
      throw error;
    }
  }
  return { stopped: true, stream_key: ctx.streamKey };
}

function startRedisApprovalAdapter(ctx: any, runtime: any) {
  if (runtime.state.started) return { watching: 0, stream_key: ctx.streamKey, done: runtime.state.donePromise };
  runtime.state.started = true;
  if (runtime.signal.aborted) return { watching: 0, stream_key: ctx.streamKey, done: Promise.resolve({ stopped: true, stream_key: ctx.streamKey }) };
  runtime.state.client = createApprovalSignalRedisClient(ctx.opts, approvalSignalRedisOptions(ctx.opts, { maxRetriesPerRequest: null }));
  runtime.state.client.on?.('error', () => {});
  runtime.state.donePromise = consumeRedisApprovalSignals(ctx, runtime).finally(() => {
    runtime.closeClient();
    runtime.detach();
  });
  return { watching: 0, stream_key: ctx.streamKey, done: runtime.state.donePromise };
}

export function createRedisApprovalSignalEventAdapter(config: any, opts: any = {}) {
  const blockMs = Number(firstDefined(opts.blockMs, opts.pollMs, APPROVAL_SIGNAL_REDIS_BLOCK_MS));
  if (!Number.isFinite(blockMs) || blockMs < 0) throw new TypeError('RedisApprovalSignalEventAdapter blockMs must be a non-negative number');
  const runId = config?._runId ?? null;
  const ctx = {
    config, opts, blockMs, runId, gateId: opts.gateId,
    eventBus: assertPipelineEventBusAdapter(opts.eventBus, 'RedisApprovalSignalEventAdapter eventBus'),
    statePath: approvalSignalStatePath(config, opts.gateId, opts),
    streamKey: approvalSignalStreamKeyAuthority(config, {}, opts),
    startId: opts.startId ?? APPROVAL_SIGNAL_REDIS_START_ID,
    identity: { gate_id: opts.gateId, ...(runId ? { run_id: runId } : {}) },
  };
  const runtime = createRedisApprovalSignalRuntime(ctx);
  return {
    get signal() { return runtime.signal; },
    get streamKey() { return ctx.streamKey; },
    get done() { return runtime.state.donePromise; },
    start: () => startRedisApprovalAdapter(ctx, runtime),
    stop: runtime.stop,
  };
}
