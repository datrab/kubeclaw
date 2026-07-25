import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';
import { createPipelineEventBus, waitForAny } from '../services/pipeline-event-contract.ts';
import { createRedisApprovalSignalEventAdapter } from '../services/approval-signal-event-adapter.ts';
import { approvalRunId } from './approval-gate-telemetry.ts';
import { resolveObservedApprovalState } from './approval-gate-observation.ts';

function eventAdapterNumber(config: any, field: any) {
  const value = Number(config?.event_adapters?.[field]);
  if (!Number.isFinite(value)) throw new Error(`config.event_adapters.${field}: required number in swarm.config.json`);
  return value;
}
function deadlineRemainingMs(state: any = {}) {
  const deadlineMs = new Date(state?.deadline).getTime();
  return Number.isFinite(deadlineMs) ? Math.max(0, deadlineMs - Date.now()) : 0;
}
function isPipelineEventWaitTimeout(error: any) {
  return selectTruthyValue(() => error?.name === 'PipelineEventWaitTimeoutError', () => error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT');
}

async function waitForApprovalEvent(eventBus: any, identity: any, remainingMs: number, adapter: any, adapterStarted: boolean) {
  const waitController = new AbortController();
  let waiter: any = null;
  try {
    waiter = waitForAny(eventBus, ['approval.signal', 'fatal.error'], identity, {
      signal: waitController.signal,
      timeoutMs: remainingMs,
    });
    if (!adapterStarted) adapter.start();
    return { event: await waiter, adapterStarted: true };
  } catch (error: unknown) {
    if (waiter) void waiter.catch(() => {});
    if (!isPipelineEventWaitTimeout(error)) throw error;
    return { event: null, adapterStarted };
  } finally {
    waitController.abort('approval_signal_wait_complete');
  }
}

async function reloadObservedApproval(context: any, observed: any) {
  return resolveObservedApprovalState(
    context.config,
    context.gateId,
    context.gate,
    context.deps.loadGateState(context.config, context.gateId),
    observed.timeoutPolicy,
    context.deps,
    context.opts,
  );
}

export async function waitForApprovalSignalFlow({ config, gateId, gate, state, progress, timeoutPolicy, deps, opts = {} }: any) {
  const initialObservedState = selectDefinedValue(() => (deps.loadGateState(config, gateId)), () => (state));
  let observed = await resolveObservedApprovalState(config, gateId, gate, initialObservedState, timeoutPolicy, deps, opts);
  if (observed.result) return observed.result;

  const eventBus = selectDefinedValue(() => (opts.eventBus), () => (createPipelineEventBus()));
  const adapter = selectDefinedValue(() => (opts.approvalSignalAdapter), () => (createRedisApprovalSignalEventAdapter(config, {
    eventBus,
    gateId,
    gate,
    blockMs: eventAdapterNumber(config, 'approval_signal_debounce_ms'),
    debounceMs: eventAdapterNumber(config, 'approval_signal_debounce_ms'),
    loadState: deps.loadGateState,
    waitRef: selectDefinedValue(() => (selectDefinedValue(() => (observed.state?.wait_ref), () => (opts?.input?.refs?.waitRef))), () => (null)),
    emitExisting: true,
    stopOnTerminal: true,
})));
  const runId = approvalRunId(config);
  const identity = { gate_id: gateId, ...(runId ? { run_id: runId } : {}) };

  try {
    let adapterStarted = false;
    while (true) {
      const remainingMs = deadlineRemainingMs(observed.state);
      log('INFO', `Gate '${gateId}' PENDING_APPROVAL — waiting for approval.signal until deadline.`);
      const waited = await waitForApprovalEvent(eventBus, identity, remainingMs, adapter, adapterStarted);
      adapterStarted = waited.adapterStarted;
      observed = await reloadObservedApproval({ config, gateId, gate, deps, opts }, observed);
      if (observed.result) return observed.result;
      if (waited.event?.type === 'fatal.error') {
        throw new Error(`Approval signal adapter failed for gate '${gateId}': ${waited.event.payload?.reason ?? 'approval_signal_reason_missing'}`);
      }
    }
  } finally {
    adapter.stop?.('approval_wait_complete');
  }
}

