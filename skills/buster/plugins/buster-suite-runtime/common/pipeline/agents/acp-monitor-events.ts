import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { isBudgetExhaustedError, sleep } from '../timing.js';
import { createPipelineEventBus } from '../services/pipeline-event-contract.js';
import { assertValidAcpSessionStateEventPayload, assertValidAcpTranscriptDeltaEventPayload } from '../services/acp-gateway-contract.js';
import { getAcpMonitorState, getDirectAcpMonitorState } from './acp-monitor-state.js';
import {
  errorMessage,
  getAcpMonitorConfig,
  objectRecord,
  objectRecordOrEmpty,
} from './acp-monitor-transcript.js';
type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

export function buildAcpEventIdentity(identity: AnyRecord = {}, childSessionKey: any = null) {
  return {
    ...identity,
    session_key: (selectDefinedValue(() => (identity.session_key), () => (null))),
  };
}

export function sessionStateSignature(state: AnyRecord = {}) {
  return JSON.stringify({
    sessionKey: selectDefinedValue(() => (state.sessionKey), () => (null)),
    sessionState: selectDefinedValue(() => (state.sessionState), () => (null)),
    sessionActive: state.sessionActive === true,
    gatewayUnreachable: state.gatewayUnreachable === true,
    gatewayDetail: selectDefinedValue(() => (state.gatewayDetail), () => (null)),
    terminal: state.terminal === true,
    rateLimited: state.rateLimited === true,
    reason: selectDefinedValue(() => (state.reason), () => (null)),
    detail: selectDefinedValue(() => (state.detail), () => (null)),
    failed: state.failed === true,
    sessionTerminal: state.sessionTerminal === true,
    stopped: state.stopped === true,
  });
}

export function buildSessionStatePayload(state: AnyRecord = {}) {
  return assertValidAcpSessionStateEventPayload({
    session_key: selectDefinedValue(() => (state.sessionKey), () => (null)),
    session_state: selectDefinedValue(() => (state.sessionState), () => (null)),
    session_active: state.sessionActive === true,
    gateway_unreachable: state.gatewayUnreachable === true,
    gateway_detail: selectDefinedValue(() => (state.gatewayDetail), () => (null)),
    terminal: state.terminal === true,
    rate_limited: state.rateLimited === true,
    reason: selectDefinedValue(() => (state.reason), () => (null)),
    detail: selectDefinedValue(() => (state.detail), () => (null)),
    monitor_state: state,
  });
}

export function buildTranscriptDeltaPayload(state: AnyRecord = {}) {
  const transcript = objectRecordOrEmpty(state.transcript);
  const newLines = Array.isArray(transcript.newLines) ? transcript.newLines : [];
  return assertValidAcpTranscriptDeltaEventPayload({
    session_key: selectTruthyValue(() => (state.sessionKey), () => (null)),
    new_lines: newLines,
    line_count: newLines.length,
    transcript_offset: selectDefinedValue(() => (transcript.offset), () => (null)),
    byte_offset: selectDefinedValue(() => (transcript.byteOffset), () => (null)),
    transcript,
    monitor_state: state,
  });
}

function createAdapterContext(childSessionKey: any, streamLogPath: any, opts: AnyRecord) {
  const eventBus = opts.eventBus !== undefined ? opts.eventBus : createPipelineEventBus();
  const identity = buildAcpEventIdentity(objectRecordOrEmpty(opts.identity), childSessionKey);
  const budget = selectDefinedValue(() => (opts.budget), () => (null));
  const controller = new AbortController();
  const signal = controller.signal;
  const externalSignal = selectDefinedValue(() => (opts.signal), () => (null));
  const monitorOpts = { ...(selectDefinedValue(() => (objectRecord(opts.monitorOpts)), () => (opts))), budget, signal };
  const monitorCfg = getAcpMonitorConfig(monitorOpts);
  const pollMs = opts.pollMs !== undefined ? opts.pollMs : monitorCfg.monitorPollMs;
  const getState: AnyFunction = selectDefinedValue(() => (opts.getAcpMonitorState), () => (((request: AnyRecord = {}) => getDirectAcpMonitorState(request.childSessionKey, request.streamLogPath, request.previousState, request.monitorOptions))));
  return {
    childSessionKey,
    streamLogPath,
    eventBus,
    identity,
    budget,
    controller,
    signal,
    externalSignal,
    monitorOpts,
    pollMs,
    getState,
    stopOnTerminal: opts.stopOnTerminal !== false,
    previousState: objectRecordOrEmpty(opts.initialState),
    lastSessionSignature: null as string | null,
  };
}

function emitSessionState(context: AnyRecord, state: AnyRecord) {
    const signature = sessionStateSignature(state);
    if (signature === context.lastSessionSignature) return false;
    context.lastSessionSignature = signature;
    context.eventBus.emit({
      type: 'acp.session.state',
      source: 'acp_gateway',
      identity: context.identity,
      payload: buildSessionStatePayload(state),
    });
    return true;
}

function emitTranscriptDelta(context: AnyRecord, state: AnyRecord) {
    const newLines = selectDefinedValue(() => (state?.transcript?.newLines), () => ([]));
    if (selectTruthyValue(() => (!Array.isArray(newLines)), () => (newLines.length === 0))) return false;
    context.eventBus.emit({
      type: 'acp.transcript.delta',
      source: 'acp_gateway',
      identity: context.identity,
      payload: buildTranscriptDeltaPayload(state),
    });
    return true;
}

function isAdapterStop(error: unknown) {
  return isBudgetExhaustedError(error)
    || (error as any)?.name === 'AbortError'
    || (error as any)?.code === 'ABORT_ERR';
}

async function runAdapterLoop(context: AnyRecord) {
  while (!context.signal.aborted) {
    context.budget?.throwIfExhausted?.('acp_monitor_event_adapter_budget_exhausted');
    const state = await context.getState({
      childSessionKey: context.childSessionKey,
      streamLogPath: context.streamLogPath,
      previousState: context.previousState,
      monitorOptions: context.monitorOpts,
      budget: context.budget,
      signal: context.signal,
    });
    emitSessionState(context, state);
    emitTranscriptDelta(context, state);
    context.previousState = state;
    if (context.stopOnTerminal && state?.terminal === true) break;
    await sleep(context.pollMs, { budget: context.budget, signal: context.signal });
  }
  return { stopped: true, reason: context.signal.aborted ? 'aborted' : 'completed', state: context.previousState };
}

async function runAdapter(context: AnyRecord, abortFromExternal: () => void) {
  try {
    return await runAdapterLoop(context);
  } catch (error) {
    if (isAdapterStop(error)) {
      return {
        stopped: true,
        reason: isBudgetExhaustedError(error) ? 'budget_exhausted' : 'aborted',
        state: context.previousState,
        error,
      };
    }
    context.eventBus.emit({
      type: 'fatal.error',
      source: 'acp_gateway',
      identity: context.identity,
      payload: { adapter: 'acp_monitor', reason: 'acp_monitor_adapter_failed', error: errorMessage(error) },
    });
    throw error;
  } finally {
    context.externalSignal?.removeEventListener?.('abort', abortFromExternal);
  }
}

export function createAcpMonitorEventAdapter(childSessionKey: any, streamLogPath: any = null, opts: AnyRecord = {}) {
  const context = createAdapterContext(childSessionKey, streamLogPath, opts);
  let donePromise: Promise<any> | null = null;
  const stop = (reason = 'stopped') => {
    if (!context.signal.aborted) context.controller.abort(reason);
  };
  const abortFromExternal = () => stop('external_abort');

  if (context.externalSignal?.aborted) {
    context.controller.abort(selectDefinedValue(() => (context.externalSignal.reason), () => ('external_abort')));
  } else {
    context.externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }

  return {
    eventBus: context.eventBus,
    identity: context.identity,
    get signal() { return context.signal; },
    get done() { return donePromise; },
    start() {
      if (donePromise === null) donePromise = runAdapter(context, abortFromExternal);
      return donePromise;
    },
    stop,
  };
}

export function monitorStateFromAcpEvent(event: AnyRecord = {}) {
  return selectTruthyValue(() => (event?.payload?.monitor_state), () => (null));
}

// ── Terminal Check ───────────────────────────────────────────────────────────

export function isSessionTerminal(stateOrLabel: any) {
  if (stateOrLabel && typeof stateOrLabel === 'object' && ['terminal', 'sessionState'].some(field => field in stateOrLabel)) {
    return !!stateOrLabel.terminal;
  }

  throw new TypeError('isSessionTerminal expects an ACP monitor state object; await getAcpMonitorState(...) for label or session-key checks');
}
