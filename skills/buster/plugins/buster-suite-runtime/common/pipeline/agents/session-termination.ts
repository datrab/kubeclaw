import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

import {
  clearActiveSession,
  getActiveSession,
  killSession,
} from './lifecycle.js';
import {
  assertValidSessionTerminationResult,
} from '../services/acp-gateway-contract.js';

const GRACE_EXPIRED = Symbol('sessionTerminationGraceExpired');

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AnyRecord).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function cleanupAttempted(killResult: AnyRecord, cleanup: AnyRecord) {
  return selectTruthyValue(() => (killResult.cleanupAttempted === true), () => (cleanup.attempted === true));
}

function cleanupConfirmed(killResult: AnyRecord, cleanup: AnyRecord) {
  if (killResult.cleanupAttempted === true && killResult.confirmed === true) return true;
  return cleanup.confirmed === true;
}

function activeSessionTerminationOptions(opts: AnyRecord, session: AnyRecord) {
  return {
    ...opts,
    terminationPolicy: opts.terminationPolicy,
    killPolicy: firstDefined(opts.killPolicy, session.killPolicy),
    runtime: firstDefined(opts.runtime, session.runtime),
    model: firstDefined(opts.model, session.model),
    agentId: firstDefined(opts.agentId, session.agentId),
    label: firstDefined(opts.label, session.gatewayLabel, session.label),
  };
}

function resolvePolicyMs(value: any, field: string, { min = 0, max = Infinity } = {}) {
  const numeric = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(numeric)), () => (numeric < min))) throw new Error(`Session termination policy ${field} must be a finite number >= ${min}`);
  return Math.min(Math.round(numeric), max);
}

export function resolveSessionTerminationPolicy(opts: AnyRecord = {}) {
  const policy = opts.terminationPolicy && typeof opts.terminationPolicy === 'object' && !Array.isArray(opts.terminationPolicy)
    ? opts.terminationPolicy
    : opts;
  const maxGraceMs = resolvePolicyMs(policy.maxGraceMs, 'maxGraceMs');
  const gatewayRequestMaxMs = resolvePolicyMs(policy.gatewayRequestMaxMs, 'gatewayRequestMaxMs', { min: 1 });
  const graceMs = resolvePolicyMs(policy.graceMs, 'graceMs', { max: maxGraceMs });
  for (const [field, value] of Object.entries({
    statusTimeoutMs: policy.statusTimeoutMs,
    requestTimeoutMs: policy.requestTimeoutMs,
    stopRequestTimeoutMs: policy.stopRequestTimeoutMs,
    listTimeoutMs: policy.listTimeoutMs,
    acpxTimeoutMs: policy.acpxTimeoutMs,
  })) {
    if (Number(value) > gatewayRequestMaxMs) {
      throw new Error(`Session termination policy ${field} must be <= gatewayRequestMaxMs`);
    }
  }
  return {
    graceMs,
    confirmPollMs: resolvePolicyMs(policy.confirmPollMs, 'confirmPollMs', { min: 1, max: Math.max(graceMs, 1) }),
    cleanupConfirmTimeoutMs: resolvePolicyMs(policy.cleanupConfirmTimeoutMs, 'cleanupConfirmTimeoutMs'),
    statusTimeoutMs: resolvePolicyMs(policy.statusTimeoutMs, 'statusTimeoutMs'),
    requestTimeoutMs: resolvePolicyMs(policy.requestTimeoutMs, 'requestTimeoutMs'),
    stopRequestTimeoutMs: resolvePolicyMs(policy.stopRequestTimeoutMs, 'stopRequestTimeoutMs'),
    listTimeoutMs: resolvePolicyMs(policy.listTimeoutMs, 'listTimeoutMs'),
    acpxTimeoutMs: resolvePolicyMs(policy.acpxTimeoutMs, 'acpxTimeoutMs'),
  };
}

function buildTerminationResult({
  sessionKey,
  requested,
  confirmed,
  state,
  cleanupAttempted,
  cleanupConfirmed,
  cleanupError = null,
  graceMs,
}: AnyRecord) {
  const result = {
    sessionKey: selectTruthyValue(() => (sessionKey), () => (null)),
    requested: requested === true,
    confirmed: confirmed === true,
    unconfirmed: confirmed !== true,
    terminal: confirmed === true,
    state: state ? state : 'session_stop_status_not_reported',
    cleanupAttempted: cleanupAttempted === true,
    cleanupConfirmed: cleanupConfirmed === true,
    cleanupError: cleanupError ? String(cleanupError) : null,
    graceMs,
  };
  return assertValidSessionTerminationResult(result);
}

async function runCleanup(cleanup: any, context: AnyRecord) {
  if (typeof cleanup !== 'function') return { attempted: false, confirmed: false, error: null };
  try {
    await cleanup(context);
    return { attempted: true, confirmed: true, error: null };
  } catch (error) {
    return { attempted: true, confirmed: false, error: errorMessage(error) };
  }
}

async function awaitWithGrace(promise: Promise<any>, graceMs: number, onGraceExpired: AnyFunction | null = null) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          onGraceExpired?.();
          resolve(GRACE_EXPIRED);
        }, graceMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function forwardAbort(signal: AbortSignal | null, controller: AbortController): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function buildKillPolicy(opts: AnyRecord, policy: AnyRecord, graceBounded: boolean): AnyRecord {
  return {
    ...(selectDefinedValue(() => opts.killPolicy, () => ({}))),
    ...(graceBounded ? {
      acpConfirmTimeoutMs: policy.graceMs,
      subagentConfirmTimeoutMs: policy.graceMs,
      confirmPollMs: policy.confirmPollMs,
      cleanupConfirmTimeoutMs: policy.cleanupConfirmTimeoutMs,
      statusTimeoutMs: policy.statusTimeoutMs,
      requestTimeoutMs: policy.requestTimeoutMs,
      stopRequestTimeoutMs: policy.stopRequestTimeoutMs,
      listTimeoutMs: policy.listTimeoutMs,
      acpxTimeoutMs: policy.acpxTimeoutMs,
    } : {}),
  };
}

async function requestSessionTermination(
  childSessionKey: string,
  opts: AnyRecord,
  policy: AnyRecord,
): Promise<AnyRecord | typeof GRACE_EXPIRED> {
  const killSessionFn = typeof opts.killSession === 'function' ? opts.killSession : killSession;
  const controller = new AbortController();
  const removeAbortListener = forwardAbort(opts.signal ?? null, controller);
  const { killSession: _killSession, ...killOpts } = opts;
  const promise = Promise.resolve().then(() => killSessionFn(childSessionKey, {
    ...killOpts,
    killPolicy: buildKillPolicy(opts, policy, opts.graceBounded !== false),
    signal: controller.signal,
  }));
  void promise.catch(() => { /* INTENTIONAL_NONCRITICAL(wait_observed_by_owner): the authoritative await below handles the failure. */ });
  try {
    if (opts.graceBounded === false) return await promise;
    return await awaitWithGrace(promise, policy.graceMs, () => {
      controller.abort('session_termination_grace_expired');
    });
  } finally {
    removeAbortListener();
  }
}

function failedTerminationResult(sessionKey: string, state: string, graceMs: number, error?: unknown) {
  return buildTerminationResult({
    sessionKey,
    requested: false,
    confirmed: false,
    state,
    cleanupAttempted: false,
    cleanupConfirmed: false,
    cleanupError: error === undefined ? null : errorMessage(error),
    graceMs,
  });
}

export async function terminateSession(childSessionKey: any, opts: AnyRecord = {}) {
  const policy = resolveSessionTerminationPolicy(opts);
  const graceMs = policy.graceMs;
  const graceBounded = opts.graceBounded !== false;
  if (!childSessionKey) {
    return buildTerminationResult({
      sessionKey: null,
      requested: false,
      confirmed: true,
      state: 'no_session_key',
      cleanupAttempted: false,
      cleanupConfirmed: false,
      graceMs,
    });
  }

  let killResult: AnyRecord | typeof GRACE_EXPIRED;
  try {
    killResult = await requestSessionTermination(childSessionKey, opts, policy);
    if (killResult === GRACE_EXPIRED) {
      return failedTerminationResult(childSessionKey, 'termination_grace_expired', graceMs);
    }
  } catch (error) {
    return failedTerminationResult(childSessionKey, 'termination_error', graceMs, error);
  }

  const cleanup = await runCleanup(opts.cleanup, {
    sessionKey: childSessionKey,
    killResult,
    options: opts,
  });

  return buildTerminationResult({
    sessionKey: childSessionKey,
    requested: killResult.requested,
    confirmed: killResult.confirmed,
    state: killResult.state,
    cleanupAttempted: cleanupAttempted(killResult, cleanup),
    cleanupConfirmed: cleanupConfirmed(killResult, cleanup),
    cleanupError: cleanup.error,
    graceMs,
  });
}

export async function terminateActiveSession(opts: AnyRecord = {}) {
  const session = getActiveSession() as AnyRecord | null;
  if (!session) {
    return await terminateSession(null, opts);
  }
  const result = await terminateSession(session.childSessionKey, activeSessionTerminationOptions(opts, session)) as AnyRecord;
  clearActiveSession({ preserveFile: result.unconfirmed });
  return result;
}
