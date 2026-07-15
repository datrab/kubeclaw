import {
  spawnSession,
  clearActiveSession,
} from '../../agents/lifecycle.ts';
import { terminateSession } from '../../agents/session-termination.ts';
import { assertValidSessionTerminationResult } from '../acp-gateway-contract.ts';
import {
  resolveBusterActiveSessionPath,
  buildSessionSpawnEmbed,
  buildTimeoutEmbed,
  buildSessionCompleteEmbed,
  resolveBusterAgentResult,
} from '../pipeline-helpers.ts';
import { monitorSession } from '../session-monitor.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
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
  [key: string]: unknown;
}

interface SessionTestHooks {
  spawnSession?: typeof spawnSession;
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

function resolveTaskThinking(payload: BusterTaskPayload): string | null {
  const sessionThinking = normalizeThinking(payload?.session?.thinking);
  if (sessionThinking) return sessionThinking;
  const sessionThinkingLevel = normalizeThinking(payload?.session?.thinking_level);
  if (sessionThinkingLevel) return sessionThinkingLevel;
  const taskThinking = normalizeThinking(payload?.thinking);
  if (taskThinking) return taskThinking;
  return normalizeThinking(payload?.thinking_level);
}

function resolveCompletionDispatchId(dispatchIdForCompletion: string | null, sessionData: SessionData): string {
  if (dispatchIdForCompletion !== null) return requireNonEmptyString(dispatchIdForCompletion, 'dispatchIdForCompletion');
  return requireNonEmptyString(sessionData.label, 'sessionData.label');
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

function normalizeThinking(value: unknown): string | null {
  return normalizeRequiredString(value);
}

function normalizeRuntime(value: unknown): 'acp' | 'subagent' | null {
  const runtime = normalizeRequiredString(value)?.toLowerCase();
  return selectTruthyValue(() => (runtime === 'acp'), () => (runtime === 'subagent')) ? runtime : null;
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

export async function spawnTaskSession({
  payload,
  prompt,
  timeoutSeconds,
  moduleId,
  project,
  taskType,
  logger,
  tctx,
  currentDiscordContext,
  discord,
  dispatchIdForCompletion,
  budget = null,
  signal = null,
  sessionPolicies = {},
  testHooks = {},
}: {
  payload: BusterTaskPayload;
  prompt: string;
  timeoutSeconds: number;
  moduleId: string;
  project: string;
  taskType: string;
  logger: Logger;
  tctx: TelemetryContext;
  currentDiscordContext: DiscordContextBuilder;
  discord: DiscordSender;
  dispatchIdForCompletion: string | null;
  budget?: unknown;
  signal?: AbortSignal | null;
  sessionPolicies?: BusterSessionPolicies;
  testHooks?: SessionTestHooks;
}): Promise<{
  ok: boolean;
  reason?: string;
  sessionData?: SessionData;
  sessionKeyForCompletion?: string;
  dispatchIdForCompletion?: string;
}> {
  const model = normalizeRequiredString(payload?.session?.model);
  const runtime = normalizeRuntime(payload?.session?.runtime);
  const primaryAgentId = normalizeRequiredString(payload?.session?.agentId);
  const agentId = primaryAgentId ? primaryAgentId : normalizeRequiredString(payload?.session?.agent_id);
  const cwd = normalizeRequiredString(payload?.session?.cwd);
  const label = normalizeRequiredString(payload?.session?.label);
  const thinking = resolveTaskThinking(payload);
  const spawnChildSession = testHooks.spawnSession ? testHooks.spawnSession : spawnSession;
  let sessionData: SessionData;
  try {
    sessionData = await spawnChildSession({
      ...payload,
      session: {
        ...payload.session,
        runtime,
        model,
        agentId,
        cwd,
        label,
      },
    }, prompt, timeoutSeconds, {
      runtime,
      model,
      agentId,
      cwd,
      label,
      thinking,
      activeStatePath: resolveBusterActiveSessionPath(cwd),
      spawnPolicy: sessionPolicies.spawnPolicy,
      budget,
      signal,
      observabilityIdentity: {
        run_id: selectDefinedValue(() => (selectDefinedValue(() => (payload?.run_id), () => (payload?.session?.run_id))), () => (null)),
        project: selectDefinedValue(() => (payload?.project), () => (null)),
        agent_type: 'buster',
        module_id: moduleId,
        gate_id: selectDefinedValue(() => (payload?.gate_id), () => (null)),
        gate_type: selectDefinedValue(() => (payload?.gate_type), () => (null)),
        attempt: selectDefinedValue(() => (payload?.attempt), () => (null)),
        dispatch_id: payload?.dispatch_id !== undefined ? payload.dispatch_id : label,
        gateway_label: label,
      },
    }) as SessionData;
  } catch (err: unknown) {
    const spawnErrorDetail = safeErrorMessage(err);
    logger.error('SPAWN', `Spawn failed: ${spawnErrorDetail}`, {
      error_name: errorField(err, 'name'),
      error_code: errorField(err, 'code'),
    });
    return { ok: false, reason: `spawn_failed: ${spawnErrorDetail}` };
  }

  logger.info('SPAWN', `Session spawned: ${sessionData.childSessionKey}`, {
    runtime: sessionData.runtime,
  });
  const nextDispatchId = resolveCompletionDispatchId(dispatchIdForCompletion, sessionData);
  tctx.sessionKey = sessionData.childSessionKey;
  tctx.dispatchId = nextDispatchId;
  const sessionSpawnData = {
    ...sessionData,
    taskType,
    timeoutSeconds,
  };
  discord(buildSessionSpawnEmbed(moduleId, project, sessionSpawnData), currentDiscordContext({
    dispatch_id: nextDispatchId,
    session_key: sessionData.childSessionKey,
  }));

  return {
    ok: true,
    sessionData,
    sessionKeyForCompletion: sessionData.childSessionKey,
    dispatchIdForCompletion: nextDispatchId,
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
    const elapsedSeconds = Math.round((Date.now() - monitorStart) / 1000);
    const monitorReason = safeErrorMessage(monitorError);
    logger.error('MONITOR', `Monitor failed for ${sessionData.childSessionKey}: ${monitorReason}`, {
      error_name: errorField(monitorError, 'name'),
      error_code: errorField(monitorError, 'code'),
    });

    let termination: SessionTerminationResult | null = null;
    try {
      termination = assertValidSessionTerminationResult(await terminateChildSession(sessionData.childSessionKey, {
        ...sessionPolicies,
        runtime: sessionData.runtime,
        agentId: sessionData.agentId,
        label:   sessionData.label,
      })) as SessionTerminationResult;
    } catch (terminationError: unknown) {
      logger.error('SESSION', `Failed to terminate ${sessionData.childSessionKey} after monitor error: ${safeErrorMessage(terminationError)}`, {
        error_name: errorField(terminationError, 'name'),
        error_code: errorField(terminationError, 'code'),
      });
    } finally {
      clearActiveChildSession({ preserveFile: termination?.unconfirmed === true });
    }

    return {
      ok: true,
      sessionResult: {
        terminal: true,
        failed: true,
        reason: 'monitor_error',
        detail: monitorReason,
        state: { sessionState: 'error', detail: monitorReason },
        termination,
      },
      elapsedSeconds,
    };
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
    termination = assertValidSessionTerminationResult(await resolveTerminationResult(sessionResult, terminateChildSession, sessionData, sessionPolicies)) as SessionTerminationResult;
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
