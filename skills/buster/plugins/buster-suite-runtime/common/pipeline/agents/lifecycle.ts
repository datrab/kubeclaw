import {
  getGatewaySessionStatus,
  killGatewaySubagent,
  listGatewaySubagents,
  resolveGatewayBaseUrl,
  resolveGatewayToken,
  sendGatewaySessionMessage,
} from '../integrations/gateway.js';
import { parseSessionState, isStoppedSessionState } from './session-semantics.js';
import { resolveRuntime } from './runtime.js';
import { sleep } from '../timing.js';
import {
  assertValidKillSessionResult,
} from '../services/acp-gateway-contract.js';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import {
  type AnyRecord,
  isCallerAbort,
  requestGateway,
  requireGatewayDetails,
  resolveKillPolicy,
  sessionErrorMessage as errorMessage,
  sessionLifecycleLog as log,
  throwIfCallerAbort,
} from './session-gateway-support.js';
import { acpxCleanup } from './acpx-cleanup.js';
import {
  clearActiveSession,
  getActiveSession,
  resolveActiveSessionStatePath,
  resolveSpawnTranscriptPath,
  resolveSubagentTranscriptPath,
  setActiveSession,
} from './session-state.js';
export { spawnSession } from './session-spawn.js';
export { acpxCleanup } from './acpx-cleanup.js';
export {
  clearActiveSession,
  getActiveSession,
  resolveSpawnTranscriptPath,
  resolveSubagentTranscriptPath,
} from './session-state.js';
export {
  getTrackedAgent,
  getTrackedAgentCount,
  listTrackedAgents,
  trackAgent,
  untrackAgent,
} from './tracked-agents.js';

async function readSessionLifecycleState(
  childSessionKey: any,
  gatewayUrl: any,
  gatewayToken: any,
  timeoutMs: number,
  waitOptions: AnyRecord = {},
): Promise<AnyRecord> {
  try {
    const raw = await requestGateway(getGatewaySessionStatus, 'session status', childSessionKey, timeoutMs, { gatewayUrl, gatewayToken, ...waitOptions });
    const result: AnyRecord = requireGatewayDetails(raw, 'session status');
    const parsed = parseSessionState(result);
    return { active: parsed.active, state: parsed.state, raw: result };
  } catch (err) {
    if (isCallerAbort(err, waitOptions.signal, waitOptions.budget)) throw err;
    const msg = errorMessage(err);
    if (/\b404\b|not found|unrecognized session/i.test(msg)) {
      return { active: false, state: 'closed', raw: null };
    }
    return { active: false, state: 'unreachable', raw: null, error: err };
  }
}

async function waitForSessionStop(
  childSessionKey: any,
  gatewayUrl: any,
  gatewayToken: any,
  timeoutMs: number,
  pollMs: number,
  statusTimeoutMs: number,
  waitOptions: AnyRecord = {},
): Promise<AnyRecord> {
  const deadline = Date.now() + Math.max(timeoutMs, 0);
  let lastState: AnyRecord = { active: false, state: 'session_status_not_observed', raw: null };

  while (Date.now() <= deadline) {
    throwIfCallerAbort(waitOptions.signal, waitOptions.budget);
    const remainingForStatus = Math.max(deadline - Date.now(), 1);
    lastState = await readSessionLifecycleState(childSessionKey, gatewayUrl, gatewayToken, Math.min(statusTimeoutMs, remainingForStatus), waitOptions);
    if (!lastState.active && isStoppedSessionState(lastState.state)) {
      return { confirmed: true, ...lastState };
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollMs, remainingMs), waitOptions);
  }

  return { confirmed: false, ...lastState };
}

function resolveCleanupConfirmTimeoutMs(value: any, confirmTimeoutMs: number) {
  if (value === 'match_confirm_timeout') return confirmTimeoutMs;
  return value;
}

// ── Kill ─────────────────────────────────────────────────────────────────────

function normalizeGatewayDetails(raw: AnyRecord) {
  return requireGatewayDetails(raw, 'details');
}

function subagentListConfirmsInactive(raw: AnyRecord, childSessionKey: any, label: any) {
  const details = normalizeGatewayDetails(raw);
  const active = Array.isArray(details?.active) ? details.active : null;
  if (!active) return false;
  return !active.some((entry: AnyRecord) => (
    selectTruthyValue(() => (selectTruthyValue(() => (entry?.sessionKey === childSessionKey), () => (entry?.key === childSessionKey))), () => ((label && entry?.label === label)))
  ));
}

function buildKillContext(childSessionKey: string, opts: AnyRecord): AnyRecord {
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const runtime = resolveRuntime({ runtime: opts.runtime, model: selectTruthyValue(() => (opts.model), () => (null)) });
  const isSubagent = runtime === 'subagent';
  const label = selectDefinedValue(() => (opts.label), () => (''));
  const killPolicy = resolveKillPolicy(opts, isSubagent);
  const budget = selectTruthyValue(() => (opts.budget), () => (null));
  const signal = selectTruthyValue(() => (opts.signal), () => (null));
  return {
    childSessionKey,
    opts,
    gatewayUrl,
    gatewayToken,
    isSubagent,
    label,
    killPolicy,
    budget,
    signal,
    waitOptions: { budget, signal },
  };
}

function statusWaitOptions(context: AnyRecord): AnyRecord {
  return {
    ...context.waitOptions,
    maxRetries: context.killPolicy.statusGateway.maxRetries,
    retryDelayMs: context.killPolicy.statusGateway.retryDelayMs,
  };
}

async function currentKillState(context: AnyRecord): Promise<AnyRecord> {
  throwIfCallerAbort(context.signal, context.budget);
  const confirmation = await readSessionLifecycleState(
    context.childSessionKey,
    context.gatewayUrl,
    context.gatewayToken,
    context.killPolicy.statusTimeoutMs,
    statusWaitOptions(context),
  );
  const stopped = !confirmation.active && isStoppedSessionState(confirmation.state);
  return {
    requested: false,
    confirmed: stopped,
    state: confirmation.state || 'session_stop_status_not_observed',
    cleanupAttempted: false,
  };
}

async function requestSubagentKill(context: AnyRecord): Promise<boolean> {
  if (!context.isSubagent) return false;
  try {
    await requestGateway(killGatewaySubagent, 'subagent kill', context.childSessionKey, context.killPolicy.requestTimeoutMs, {
      gatewayUrl: context.gatewayUrl,
      gatewayToken: context.gatewayToken,
      maxRetries: context.killPolicy.requestGateway.maxRetries,
      retryDelayMs: context.killPolicy.requestGateway.retryDelayMs,
      ...context.waitOptions,
    });
    log('INFO', `Subagent kill requested for session: ${context.childSessionKey}`);
    return true;
  } catch (error) {
    if (isCallerAbort(error, context.signal, context.budget)) throw error;
    log('WARN', `Could not request subagent kill for session '${context.childSessionKey}' - ${errorMessage(error)}`);
    return false;
  }
}

async function requestSessionStop(context: AnyRecord): Promise<boolean> {
  try {
    const sendStop = (sessionKey: string, timeoutMs: number, waitOptions: AnyRecord) => (
      sendGatewaySessionMessage(sessionKey, context.killPolicy.stopMessage, timeoutMs, waitOptions)
    );
    await requestGateway(sendStop, 'session message', context.childSessionKey, context.killPolicy.stopRequestTimeoutMs, {
      gatewayUrl: context.gatewayUrl,
      gatewayToken: context.gatewayToken,
      maxRetries: context.killPolicy.stopGateway.maxRetries,
      retryDelayMs: context.killPolicy.stopGateway.retryDelayMs,
      ...context.waitOptions,
    });
    log('INFO', `Stop requested for session: ${context.childSessionKey}`);
    return true;
  } catch (error) {
    if (isCallerAbort(error, context.signal, context.budget)) throw error;
    log('WARN', `Could not request stop for session '${context.childSessionKey}' - ${errorMessage(error)}`);
    return false;
  }
}

async function waitForKillConfirmation(context: AnyRecord): Promise<AnyRecord> {
  return waitForSessionStop(
    context.childSessionKey,
    context.gatewayUrl,
    context.gatewayToken,
    context.killPolicy.confirmTimeoutMs,
    context.killPolicy.confirmPollMs,
    context.killPolicy.statusTimeoutMs,
    statusWaitOptions(context),
  );
}

async function confirmSubagentInactive(context: AnyRecord, state: AnyRecord): Promise<void> {
  if (state.confirmed || !context.isSubagent || !state.requested) return;
  try {
    const list = (_unused: unknown, timeoutMs: number, waitOptions: AnyRecord) => listGatewaySubagents(timeoutMs, waitOptions);
    const raw = await requestGateway(list, 'subagent list', null, context.killPolicy.listTimeoutMs, {
      gatewayUrl: context.gatewayUrl,
      gatewayToken: context.gatewayToken,
      maxRetries: context.killPolicy.listGateway.maxRetries,
      retryDelayMs: context.killPolicy.listGateway.retryDelayMs,
      ...context.waitOptions,
    });
    if (subagentListConfirmsInactive(raw as AnyRecord, context.childSessionKey, context.label)) {
      state.confirmed = true;
      state.state = isStoppedSessionState(state.state) ? state.state : 'not_active';
    }
  } catch (error) {
    if (isCallerAbort(error, context.signal, context.budget)) throw error;
    log('WARN', `Could not confirm subagent inactivity for session '${context.childSessionKey}' - ${errorMessage(error)}`);
  }
}

async function cleanupAcpSession(context: AnyRecord, state: AnyRecord): Promise<void> {
  if (state.confirmed || context.isSubagent || !context.opts.agentId) return;
  throwIfCallerAbort(context.signal, context.budget);
  state.cleanupAttempted = true;
  await acpxCleanup(context.opts.agentId, context.label, {
    timeoutMs: context.killPolicy.acpxTimeoutMs,
    ...context.waitOptions,
  });
  const confirmation = await waitForSessionStop(
    context.childSessionKey,
    context.gatewayUrl,
    context.gatewayToken,
    resolveCleanupConfirmTimeoutMs(context.killPolicy.cleanupConfirmTimeoutMs, context.killPolicy.confirmTimeoutMs),
    context.killPolicy.confirmPollMs,
    context.killPolicy.statusTimeoutMs,
    statusWaitOptions(context),
  );
  state.confirmed = confirmation.confirmed;
  if (confirmation.state) state.state = confirmation.state;
}

export async function killSession(childSessionKey: any, opts: AnyRecord = {}) {
  if (!childSessionKey) {
    return assertValidKillSessionResult({ requested: false, confirmed: true, state: 'no_session_key', cleanupAttempted: false });
  }
  const context = buildKillContext(String(childSessionKey), opts);
  log('STEP', `Killing ${context.isSubagent ? 'subagent' : 'ACP'} session: ${context.childSessionKey}`);
  const state = await currentKillState(context);
  if (state.confirmed) return assertValidKillSessionResult(state);
  state.requested = await requestSubagentKill(context);
  if (!state.requested) state.requested = await requestSessionStop(context);
  const confirmation = await waitForKillConfirmation(context);
  state.confirmed = confirmation.confirmed;
  if (confirmation.state) state.state = confirmation.state;
  await confirmSubagentInactive(context, state);
  await cleanupAcpSession(context, state);
  log(state.confirmed ? 'OK' : 'WARN', `Session ${state.confirmed ? 'stopped' : 'stop unconfirmed'}: ${context.childSessionKey} (${state.state})`);
  return assertValidKillSessionResult(state);
}

// ── Active session helpers ───────────────────────────────────────────────────

export async function killActiveSession() {
  const session = getActiveSession();
  if (!session) {
    log('DEBUG', 'killActiveSession: no active session tracked');
    return false;
  }
  log('INFO', `killActiveSession: killing ${session.childSessionKey} (${session.label})`);
  const result = await killSession(session.childSessionKey, {
    killPolicy: session.killPolicy,
    runtime: session.runtime,
    model: session.model,
    agentId: session.agentId,
    label: session.gatewayLabel,
  }) as AnyRecord;
  clearActiveSession({ preserveFile: !result?.confirmed });
  return !!result?.confirmed;
}
