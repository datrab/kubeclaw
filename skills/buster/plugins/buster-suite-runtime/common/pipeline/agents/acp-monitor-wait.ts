import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.js';
import { createBudget, isBudgetExhaustedError } from '../timing.js';
import { createPipelineEventBus, waitForAny } from '../services/pipeline-event-contract.js';
import { isSessionTerminalState, isUnreachableSessionState } from './session-semantics.js';
import { createAcpMonitorEventAdapter, buildAcpEventIdentity, monitorStateFromAcpEvent } from './acp-monitor-events.js';
import { getAcpMonitorConfig, objectRecordOrEmpty, transcriptShowsProgress } from './acp-monitor-transcript.js';
import { writeRuntimeLog } from '../runtime-log.js';
type AnyRecord = Record<string, any>;
function log(level: any, msg: any) { writeRuntimeLog(String(level).toLowerCase() as 'debug' | 'info' | 'warn' | 'error', 'common/acp-monitor', String(msg)); }

export function isBudgetOwnedPipelineEventAbort(error: any, budget: AnyRecord) {
  return error?.code === 'PIPELINE_EVENT_WAIT_ABORTED'
    && budget?.signal?.aborted
    && isBudgetExhaustedError(budget.signal.reason);
}

function validateIdleOptions(opts: AnyRecord) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!opts), () => (typeof opts !== 'object'))), () => (Array.isArray(opts)))) {
    throw new TypeError('waitForSessionIdle requires an options object with acp_monitor policy fields');
  }
  if (selectTruthyValue(() => (!Number.isFinite(opts.extraGraceMs)), () => (opts.extraGraceMs < 0))) {
    throw new Error('waitForSessionIdle requires explicit extraGraceMs from swarm.config.json');
  }
  if (selectTruthyValue(() => (!Number.isFinite(opts.totalTimeoutMs)), () => (opts.totalTimeoutMs <= 0))) {
    throw new Error('waitForSessionIdle requires explicit totalTimeoutMs from swarm.config.json');
  }
}

function createIdleRuntime(childSessionKey: any, opts: AnyRecord) {
  validateIdleOptions(opts);
  const monitorCfg = getAcpMonitorConfig(opts);
  const budget = opts.budget !== undefined
    ? opts.budget
    : createBudget({ timeoutMs: opts.totalTimeoutMs, signal: opts.signal, label: 'acp-session-idle' });
  const eventBus = opts.eventBus !== undefined ? opts.eventBus : createPipelineEventBus();
  const pollMs = opts.pollMs !== undefined ? opts.pollMs : monitorCfg.monitorPollMs;
  const adapter = createAcpMonitorEventAdapter(childSessionKey, selectDefinedValue(() => (opts.streamLogPath), () => (null)), {
    eventBus,
    identity: buildAcpEventIdentity(objectRecordOrEmpty(opts.identity), childSessionKey),
    budget,
    pollMs,
    monitorOpts: {
      ...monitorCfg,
      gatewayUrl: resolveGatewayBaseUrl(opts.gatewayUrl),
      gatewayToken: resolveGatewayToken(opts.gatewayToken),
      gatewayStatusPolicy: opts.gatewayStatusPolicy,
    },
    stopOnTerminal: false,
  });
  return { adapter, budget, eventBus, extraGraceMs: opts.extraGraceMs, totalTimeoutMs: opts.totalTimeoutMs };
}

function waitForMonitorEvent(runtime: AnyRecord, timeoutMs: number | null) {
  return waitForAny(runtime.eventBus, ['acp.session.state', 'acp.transcript.delta'], runtime.adapter.identity, {
    signal: runtime.budget.signal,
    budget: runtime.budget,
    timeoutMs,
  });
}

function isExpectedWaitEnd(error: any, runtime: AnyRecord) {
  return isBudgetExhaustedError(error)
    || error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'
    || isBudgetOwnedPipelineEventAbort(error, runtime.budget)
    || (error?.code === 'PIPELINE_EVENT_WAIT_ABORTED' && runtime.budget.remainingMs() <= 0);
}

function sessionIdleDisposition(monitorState: AnyRecord) {
  if (!monitorState?.sessionState) return 'continue';
  const sessionState = monitorState.sessionState;
  const transcriptActive = transcriptShowsProgress(monitorState.transcript as AnyRecord);
  if (isSessionTerminalState(sessionState)) return 'done';
  if (isUnreachableSessionState(sessionState) && !transcriptActive) return 'done';
  if (!monitorState.sessionActive && !isUnreachableSessionState(sessionState)) return 'grace';
  return 'continue';
}

async function waitForGrace(runtime: AnyRecord, monitorState: AnyRecord) {
  const sessionState = monitorState.sessionState;
  log('DEBUG', `Session ${sessionState} - waiting ${runtime.extraGraceMs / 1000}s grace period for thread summary`);
  try {
    const timeoutMs = Math.min(runtime.extraGraceMs, runtime.budget.remainingMs());
    const graceEvent = await waitForMonitorEvent(runtime, timeoutMs);
    return { finished: false, state: monitorStateFromAcpEvent(graceEvent) || monitorState };
  } catch (error) {
    if (isExpectedWaitEnd(error, runtime)) return { finished: true, state: monitorState };
    throw error;
  }
}

async function runIdleLoop(runtime: AnyRecord) {
  let monitorState: AnyRecord = {};
  while (runtime.budget.remainingMs() > 0) {
    let event;
    try {
      event = await waitForMonitorEvent(runtime, runtime.budget.remainingMs());
    } catch (error) {
      if (isExpectedWaitEnd(error, runtime)) return true;
      throw error;
    }
    monitorState = monitorStateFromAcpEvent(event) || monitorState;
    const disposition = sessionIdleDisposition(monitorState);
    if (disposition === 'done') {
      log('DEBUG', `Session already ${monitorState.sessionState} - no grace needed`);
      return false;
    }
    if (disposition !== 'grace') continue;
    const graceResult = await waitForGrace(runtime, monitorState);
    monitorState = graceResult.state;
    if (graceResult.finished) return false;
  }
  return true;
}

// ── Wait for Idle ────────────────────────────────────────────────────────────

export async function waitForSessionIdle(childSessionKey: any, opts: AnyRecord = {}) {
  const runtime = createIdleRuntime(childSessionKey, opts);
  runtime.adapter.start();
  let timedOut = false;
  try {
    timedOut = await runIdleLoop(runtime);
  } finally {
    runtime.adapter.stop('waitForSessionIdle_done');
    await runtime.adapter.done?.catch?.(() => {});
  }
  if (timedOut) {
    log('DEBUG', `Grace timeout (${runtime.totalTimeoutMs / 1000}s) - proceeding with kill`);
  }
}
