import { clearActiveSession } from '../../agents/lifecycle.ts';
import { terminateSession } from '../../agents/session-termination.ts';
import { assertValidSessionTerminationResult } from '../acp-gateway-contract.ts';
import {
  buildTimeoutEmbed,
  buildSessionCompleteEmbed,
  resolveBusterAgentResult,
} from '../pipeline-helpers.ts';
import { monitorSession } from '../session-monitor.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
export { spawnTaskSession } from './session-spawn.ts';
interface Logger {
  info: (tag: string, msg: string, data?: Record<string, unknown>) => void;
  error: (tag: string, msg: string, data?: Record<string, unknown>) => void;
}

interface TelemetryContext {
  sessionKey?: string;
  dispatchId?: string;
  [key: string]: unknown;
}

interface BusterTaskPayload {
  session?: {
    runtime?: string;
    model?: string;
    agentId?: string;
    agent_id?: string;
    cwd?: string;
    label?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface SessionData {
  childSessionKey: string;
  streamLogPath: string;
  runtime: string;
  model?: string;
  agentId?: string;
  label: string;
  [key: string]: unknown;
}

interface SessionResult {
  terminal?: boolean;
  reason?: string;
  detail?: string;
  termination?: unknown;
  [key: string]: unknown;
}

interface SessionTerminationResult {
  confirmed: boolean;
  unconfirmed: boolean;
}

interface SessionTestHooks {
  monitorSession?: typeof monitorSession;
  terminateSession?: typeof terminateSession;
  clearActiveSession?: typeof clearActiveSession;
}

interface BusterSessionPolicies {
  spawnPolicy?: Record<string, unknown>;
  killPolicy?: Record<string, unknown>;
  terminationPolicy?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DiscordContextInput {
  dispatch_id?: string | null;
  session_key?: string | null;
  [key: string]: unknown;
}

type DiscordContextBuilder = (extra?: DiscordContextInput) => Record<string, unknown>;
type DiscordSender = (message: unknown, context?: Record<string, unknown>) => unknown;

function errorField(error: unknown, field: 'name' | 'code'): string | null {
  if (error && typeof error === 'object' && field in error) {
    const value = (error as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function normalizeRequiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const normalized = normalizeRequiredString(value);
  if (!normalized) throw new Error(`${label}: required non-empty string`);
  return normalized;
}

function resolveTerminationResult(sessionResult: SessionResult, terminateChildSession: typeof terminateSession, sessionData: SessionData, sessionPolicies: BusterSessionPolicies) {
  if (sessionResult.termination) return sessionResult.termination;
  return terminateChildSession(sessionData.childSessionKey, {
    ...sessionPolicies,
    runtime: sessionData.runtime,
    agentId: sessionData.agentId,
    label:   sessionData.label,
  });
}

function isMonitorHardTimeout(sessionResult: SessionResult): boolean {
  return selectTruthyValue(() => (sessionResult?.reason === 'session_timeout_kill_confirmed'), () => (sessionResult?.reason === 'session_timeout_kill_unconfirmed'));
}

function resolveTaskAgentResult(payload: BusterTaskPayload, sessionResult: SessionResult): Record<string, unknown> {
  if (isMonitorHardTimeout(sessionResult)) {
    const outputAuthority = resolveBusterAgentResult(payload, sessionResult) as Record<string, unknown>;
    if (outputAuthority.source !== 'session_monitor') return outputAuthority;
    const timeoutDetail = requireNonEmptyString(sessionResult.detail, 'session monitor timeout detail');
    return {
      outcome: 'TIMEOUT',
      reason: sessionResult.reason,
      summary: timeoutDetail,
      detail: timeoutDetail,
      source: 'session_monitor',
    };
  }

  return resolveBusterAgentResult(payload, sessionResult) as Record<string, unknown>;
}

async function monitorFailure(request: {
  error: unknown;
  monitorStart: number;
  sessionData: SessionData;
  logger: Logger;
  sessionPolicies: BusterSessionPolicies;
  terminateChildSession: typeof terminateSession;
  clearActiveChildSession: typeof clearActiveSession;
}) {
  const detail = safeErrorMessage(request.error);
  request.logger.error('MONITOR', `Monitor failed for ${request.sessionData.childSessionKey}: ${detail}`, {
    error_name: errorField(request.error, 'name'), error_code: errorField(request.error, 'code'),
  });
  let termination: SessionTerminationResult | null = null;
  try {
    termination = assertValidSessionTerminationResult(await request.terminateChildSession(request.sessionData.childSessionKey, {
      ...request.sessionPolicies, runtime: request.sessionData.runtime,
      agentId: request.sessionData.agentId, label: request.sessionData.label,
    }));
  } catch (error) {
    request.logger.error('SESSION', `Failed to terminate ${request.sessionData.childSessionKey} after monitor error: ${safeErrorMessage(error)}`, {
      error_name: errorField(error, 'name'), error_code: errorField(error, 'code'),
    });
  } finally {
    request.clearActiveChildSession({ preserveFile: termination?.unconfirmed === true });
  }
  return {
    ok: true,
    sessionResult: { terminal: true, failed: true, reason: 'monitor_error', detail,
      state: { sessionState: 'error', detail }, termination },
    elapsedSeconds: Math.round((Date.now() - request.monitorStart) / 1000),
  };
}

export async function monitorTaskSession({
  sessionData,
  payload,
  tctx,
  moduleId,
  timeoutSeconds,
  logger,
  sessionPolicies = {},
  testHooks = {},
}: {
  sessionData: SessionData;
  payload: BusterTaskPayload;
  tctx: TelemetryContext;
  moduleId: string;
  timeoutSeconds: number;
  logger: Logger;
  sessionPolicies?: BusterSessionPolicies;
  testHooks?: SessionTestHooks;
}): Promise<{ ok: boolean; sessionResult?: SessionResult; elapsedSeconds?: number; reason?: string }> {
  const monitorStart = Date.now();
  const monitorChildSession = testHooks.monitorSession ? testHooks.monitorSession : monitorSession;
  const terminateChildSession = testHooks.terminateSession ? testHooks.terminateSession : terminateSession;
  const clearActiveChildSession = testHooks.clearActiveSession ? testHooks.clearActiveSession : clearActiveSession;
  try {
    const sessionResult = await monitorChildSession(
      sessionData.childSessionKey,
      sessionData.streamLogPath,
      payload,
      tctx,
      { moduleId, spawnedAt: monitorStart, timeoutSeconds, logger },
    ) as SessionResult;
    const elapsedSeconds = Math.round((Date.now() - monitorStart) / 1000);
    return { ok: true, sessionResult, elapsedSeconds };
  } catch (monitorError: unknown) {
    return monitorFailure({ error: monitorError, monitorStart, sessionData, logger, sessionPolicies,
      terminateChildSession, clearActiveChildSession });
  }
}

export async function killTaskSession({
  sessionData,
  sessionResult,
  elapsedSeconds,
  moduleId,
  tctx,
  logger,
  sessionPolicies = {},
  testHooks = {},
}: {
  sessionData: SessionData;
  sessionResult: SessionResult;
  elapsedSeconds: number;
  moduleId: string;
  tctx: TelemetryContext;
  logger: Logger;
  sessionPolicies?: BusterSessionPolicies;
  testHooks?: SessionTestHooks;
}): Promise<unknown> {
  const terminateChildSession = testHooks.terminateSession ? testHooks.terminateSession : terminateSession;
  const clearActiveChildSession = testHooks.clearActiveSession ? testHooks.clearActiveSession : clearActiveSession;
  let termination: SessionTerminationResult | null = null;
  try {
    termination = assertValidSessionTerminationResult(await resolveTerminationResult(sessionResult, terminateChildSession, sessionData, sessionPolicies));
    if (sessionResult.termination) {
      logger.info('SESSION', 'Timeout termination already completed by monitor', {
        confirmed: termination.confirmed,
        unconfirmed: termination.unconfirmed,
      });
    }
  } catch (terminationError: unknown) {
    logger.error('SESSION', `Failed to terminate ${sessionData.childSessionKey}: ${safeErrorMessage(terminationError)}`, {
      error_name: errorField(terminationError, 'name'),
      error_code: errorField(terminationError, 'code'),
    });
    throw terminationError;
  } finally {
    clearActiveChildSession({ preserveFile: termination?.unconfirmed === true });
  }

  logger.info('SESSION', 'Session killed', {
    reason: sessionResult.reason,
    elapsed: elapsedSeconds,
  });

  return termination;
}

export function publishTaskOutcome({
  payload,
  sessionData,
  sessionResult,
  elapsedSeconds,
  timeoutSeconds,
  moduleId,
  project,
  commitHash,
  currentDiscordContext,
  discord,
  logger,
  dispatchIdForCompletion,
}: {
  payload: BusterTaskPayload;
  sessionData: SessionData;
  sessionResult: SessionResult;
  elapsedSeconds: number;
  timeoutSeconds: number;
  moduleId: string;
  project: string;
  commitHash: string | null;
  currentDiscordContext: DiscordContextBuilder;
  discord: DiscordSender;
  logger: Logger;
  dispatchIdForCompletion: string | null;
}): { outcome: string; reason: string; agentResult: Record<string, unknown> } {
  const agentResult = resolveTaskAgentResult(payload, sessionResult);
  if (selectTruthyValue(() => (!agentResult.outcome), () => (!agentResult.reason))) throw new Error('Buster agent result requires explicit outcome and reason');
  const outcome = String(agentResult.outcome);
  const reason = String(agentResult.reason);

  if (outcome === 'TIMEOUT') {
    discord(buildTimeoutEmbed(moduleId, project, {
      elapsedSeconds,
      timeoutSeconds,
      childSessionKey: sessionData.childSessionKey,
    }), currentDiscordContext({
      dispatch_id: dispatchIdForCompletion,
      session_key: sessionData.childSessionKey,
    }));
  } else {
    const sessionCompleteData = {
      outcome,
      reason,
      commitHash,
      durationSeconds: elapsedSeconds,
      childSessionKey: sessionData.childSessionKey,
      summary: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (agentResult.summary), () => (sessionResult.detail))), () => (sessionResult.reason))), () => ('test')),
      source: selectDefinedValue(() => (agentResult.source), () => ('session_monitor')),
    };
    discord(buildSessionCompleteEmbed(moduleId, project, sessionCompleteData), currentDiscordContext({
      dispatch_id: dispatchIdForCompletion,
      session_key: sessionData.childSessionKey,
    }));
  }

  logger.info('OUTCOME', `Task outcome: ${outcome}`, { reason });
  return { outcome, reason, agentResult };
}
