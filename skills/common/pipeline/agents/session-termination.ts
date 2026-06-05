type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

import {
  clearActiveSession,
  getActiveSession,
  killSession,
} from './lifecycle.ts';
import {
  assertValidSessionTerminationResult,
} from '../services/acp-gateway-contract.ts';

export const SESSION_TERMINATION_POLICY_DEFAULTS = Object.freeze({
  graceMs: 5000,
  maxGraceMs: 10000,
  pollMs: 500,
  gatewayRequestMaxMs: 1000,
  cleanupConfirmTimeoutMs: 0,
});
const GRACE_EXPIRED = Symbol('sessionTerminationGraceExpired');

function resolvePolicyMs(value: any, fallback: number, field: string, { min = 0, max = Infinity } = {}) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric < min) throw new Error(`Session termination policy ${field} must be a finite number >= ${min}`);
  return Math.min(Math.round(numeric), max);
}

export function resolveSessionTerminationPolicy(opts: AnyRecord = {}) {
  const graceMs = resolvePolicyMs(opts.graceMs, SESSION_TERMINATION_POLICY_DEFAULTS.graceMs, 'graceMs', { max: SESSION_TERMINATION_POLICY_DEFAULTS.maxGraceMs });
  const gatewayRequestMs = Math.min(SESSION_TERMINATION_POLICY_DEFAULTS.gatewayRequestMaxMs, Math.max(graceMs, 1));
  return {
    graceMs,
    confirmPollMs: resolvePolicyMs(opts.confirmPollMs, SESSION_TERMINATION_POLICY_DEFAULTS.pollMs, 'confirmPollMs', { min: 1, max: Math.max(graceMs, 1) }),
    cleanupConfirmTimeoutMs: resolvePolicyMs(opts.cleanupConfirmTimeoutMs, SESSION_TERMINATION_POLICY_DEFAULTS.cleanupConfirmTimeoutMs, 'cleanupConfirmTimeoutMs'),
    statusTimeoutMs: resolvePolicyMs(opts.statusTimeoutMs, gatewayRequestMs, 'statusTimeoutMs'),
    requestTimeoutMs: resolvePolicyMs(opts.requestTimeoutMs, gatewayRequestMs, 'requestTimeoutMs'),
    stopRequestTimeoutMs: resolvePolicyMs(opts.stopRequestTimeoutMs, gatewayRequestMs, 'stopRequestTimeoutMs'),
    listTimeoutMs: resolvePolicyMs(opts.listTimeoutMs, gatewayRequestMs, 'listTimeoutMs'),
    acpxTimeoutMs: resolvePolicyMs(opts.acpxTimeoutMs, gatewayRequestMs, 'acpxTimeoutMs'),
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
    sessionKey: sessionKey || null,
    requested: requested === true,
    confirmed: confirmed === true,
    unconfirmed: confirmed !== true,
    terminal: confirmed === true,
    state: state || 'unknown',
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
    return { attempted: true, confirmed: false, error: (error as any)?.message || String(error) };
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

export async function terminateSession(childSessionKey: any, opts: AnyRecord = {}) {
  const policy = resolveSessionTerminationPolicy(opts);
  const graceMs = policy.graceMs;
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

  let killResult;
  const killSessionFn = typeof opts.killSession === 'function' ? opts.killSession : killSession;
  const killController = new AbortController();
  const externalSignal = opts.signal || null;
  let removeExternalAbortListener: AnyFunction | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) killController.abort(externalSignal.reason);
    else {
      const onExternalAbort = () => killController.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      removeExternalAbortListener = () => externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
  const { killSession: _killSession, ...killOpts } = opts;
  const killPromise = Promise.resolve().then(() => killSessionFn(childSessionKey, {
    ...killOpts,
    signal: killController.signal,
    confirmTimeoutMs: graceMs,
    cleanupConfirmTimeoutMs: policy.cleanupConfirmTimeoutMs,
    confirmPollMs: policy.confirmPollMs,
    statusTimeoutMs: policy.statusTimeoutMs,
    requestTimeoutMs: policy.requestTimeoutMs,
    stopRequestTimeoutMs: policy.stopRequestTimeoutMs,
    listTimeoutMs: policy.listTimeoutMs,
    acpxTimeoutMs: policy.acpxTimeoutMs,
  }));
  killPromise.catch(() => {});
  try {
    killResult = await awaitWithGrace(killPromise, graceMs, () => killController.abort('session_termination_grace_expired'));
    if (killResult === GRACE_EXPIRED) {
      return buildTerminationResult({
        sessionKey: childSessionKey,
        requested: false,
        confirmed: false,
        state: 'termination_grace_expired',
        cleanupAttempted: false,
        cleanupConfirmed: false,
        graceMs,
      });
    }
  } catch (error) {
    return buildTerminationResult({
      sessionKey: childSessionKey,
      requested: false,
      confirmed: false,
      state: 'termination_error',
      cleanupAttempted: false,
      cleanupConfirmed: false,
      cleanupError: (error as any)?.message || String(error),
      graceMs,
    });
  } finally {
    removeExternalAbortListener?.();
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
    cleanupAttempted: killResult.cleanupAttempted || cleanup.attempted,
    cleanupConfirmed: (killResult.cleanupAttempted && killResult.confirmed) || cleanup.confirmed,
    cleanupError: cleanup.error,
    graceMs,
  });
}

export async function terminateActiveSession(opts: AnyRecord = {}) {
  const session = getActiveSession() as AnyRecord | null;
  if (!session) {
    return await terminateSession(null, opts);
  }
  const result = await terminateSession(session.childSessionKey, {
    ...opts,
    runtime: opts.runtime ?? session.runtime,
    model: opts.model ?? session.model ?? null,
    agentId: opts.agentId ?? session.agentId,
    label: opts.label ?? session.gatewayLabel ?? session.label,
  }) as AnyRecord;
  clearActiveSession({ preserveFile: result.unconfirmed });
  return result;
}
