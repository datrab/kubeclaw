import { log, getActiveContext } from '../core/logger.ts';
import { emitObservabilityDegraded, emitObservabilityRestored } from '../services/telemetry.ts';
import { getGatewaySessionStatus } from '../integrations/gateway.ts';
import { parseSessionState, readAcpTranscriptState, transcriptShowsProgress } from './acp-monitor.ts';
import { getTrackedAgent } from './lifecycle.ts';
import { sleep } from '../timing.ts';
import { gatewayInvokePolicy } from '../core/session-policy.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function errorMessage(error) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function agentLabel(agentType: string, moduleId: string) {
  return `${agentType}-${moduleId}`;
}

function transcriptStateRecord(entry: AnyRecord | null): AnyRecord {
  return entry?.transcriptState && typeof entry.transcriptState === 'object' ? entry.transcriptState : {};
}

function readTrackedTranscriptState(entry: AnyRecord | null) {
  const transcript = readAcpTranscriptState(entry?.streamLogPath, transcriptStateRecord(entry));
  if (entry) entry.transcriptState = transcript;
  return transcript;
}

function setHealthCheckMode(entry: AnyRecord | null, mode: string | null = null) {
  if (!entry) return;
  if (mode) entry.healthCheckMode = mode;
  else delete entry.healthCheckMode;
}

function healthCheckReason(ok: boolean, input: AnyRecord = {}) {
  if (input.reason !== undefined && input.reason !== null) return input.reason;
  return ok ? 'running' : 'healthcheck_failed';
}

function healthCheckObservabilityState(entry: AnyRecord) {
  if (entry.healthCheckObservability && typeof entry.healthCheckObservability === 'object') {
    return entry.healthCheckObservability;
  }
  return { active: false, degradedAt: null, reason: null };
}

function healthCheckWaitMs(config: AnyRecord, waitMsOrOpts: number | AnyRecord): number {
  if (typeof waitMsOrOpts === 'number') return waitMsOrOpts;
  if (waitMsOrOpts?.waitMs !== undefined && waitMsOrOpts?.waitMs !== null) return waitMsOrOpts.waitMs;
  return sessionHealthCheckWaitMs(config);
}

function healthCheckTrackingLabel(trackingLabel: string | null, agentType: string, moduleId: string): string {
  return selectDefinedValue(() => (trackingLabel), () => (agentLabel(agentType, moduleId)));
}

function gatewayStatusDetails(raw: AnyRecord) {
  if (raw?.result?.details !== undefined && raw?.result?.details !== null) return raw.result.details;
  return raw;
}

function logTranscriptFallbackOnce(entry: AnyRecord | null, label: string, sessionKey: string, detail: string) {
  const mode = `transcript_fallback:${detail}`;
  if (entry?.healthCheckMode === mode) return;
  setHealthCheckMode(entry, mode);
  log('WARN', `Agent health check using transcript fallback${detail ? ` (${detail})` : ''}: ${label} (${sessionKey})`);
}

export function healthCheckIdentity(entry: AnyRecord | null, agentType: string, sessionKey: string | null) {
  return {
    module_id: selectDefinedValue(() => (selectDefinedValue(() => (entry?.telemetry_module_id), () => (entry?.moduleId))), () => (null)),
    gate_id: selectDefinedValue(() => (entry?.telemetry_gate_id), () => (null)),
    gate_type: selectDefinedValue(() => (entry?.telemetry_gate_type), () => (null)),
    gateway_label: selectDefinedValue(() => (entry?.gatewayLabel), () => (null)),
    session_key: selectDefinedValue(() => (sessionKey), () => (null)),
    attempt: selectDefinedValue(() => (entry?.telemetry_attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (entry?.telemetry_dispatch_id), () => (null)),
    agent_type: selectDefinedValue(() => (agentType), () => (null)),
  };
}

function buildHealthCheckResult(ok: boolean, input: AnyRecord = {}) {
  return {
    ok,
    reason: healthCheckReason(ok, input),
    detail: selectDefinedValue(() => (input.detail), () => (null)),
    rateLimited: input.rateLimited === true,
    status: selectDefinedValue(() => (input.status), () => (null)),
    identity: selectDefinedValue(() => (input.identity), () => (null)),
    sessionKey: (selectDefinedValue(() => (input.sessionKey), () => (null))),
    gatewayLabel: (selectDefinedValue(() => (input.gatewayLabel), () => (null))),
    streamLogPath: selectDefinedValue(() => (input.streamLogPath), () => (null)),
  };
}

function gatewayStatusIssueReason(issue: AnyRecord | null): string {
  return typeof issue?.reason === 'string' && issue.reason.trim() ? issue.reason : 'gateway_status_failed';
}

function updateHealthCheckObservability(
  config: AnyRecord,
  entry: AnyRecord | null,
  agentType: string,
  sessionKey: string,
  issue: AnyRecord | null = null,
) {
  if (!entry) return;
  const state = healthCheckObservabilityState(entry);
  const ctx = selectDefinedValue(() => (getActiveContext()), () => ({ config, runId: (selectDefinedValue(() => (config?._runId), () => (null))) }));
  const identity = healthCheckIdentity(entry, agentType, sessionKey);

  if (issue) {
    if (state.active) {
      entry.healthCheckObservability = state;
      return;
    }
    state.active = true;
    state.degradedAt = new Date().toISOString();
    state.reason = gatewayStatusIssueReason(issue);
    entry.healthCheckObservability = state;
    emitObservabilityDegraded(ctx, {
      component: 'acp_monitor',
      surface: 'gateway',
      reason: state.reason,
      detail: (selectDefinedValue(() => (issue.detail), () => ('session status unavailable'))),
      degraded_at: state.degradedAt,
      ...identity,
    });
    return;
  }

  if (!state.active) return;
  const restoredAt = new Date().toISOString();
  emitObservabilityRestored(ctx, {
    component: 'acp_monitor',
    surface: 'gateway',
    reason: gatewayStatusIssueReason(state),
    detail: 'session status reachable again',
    degraded_at: selectDefinedValue(() => (state.degradedAt), () => (null)),
    restored_at: restoredAt,
    restored_after_ms: state.degradedAt ? Math.max(0, Date.now() - new Date(state.degradedAt).getTime()) : null,
    ...identity,
  });
  delete entry.healthCheckObservability;
}

function sessionHealthCheckWaitMs(config: AnyRecord): number {
  const value = Number(config?.session?.health_check_timeout_ms);
  if (selectTruthyValue(() => (!Number.isFinite(value)), () => (value < 0))) {
    throw new Error('config.session.health_check_timeout_ms: required non-negative number in swarm.config.json');
  }
  return value;
}

export async function verifyAgentAlive(config: AnyRecord, agentType: string, moduleId: string, waitMsOrOpts: number | AnyRecord = {}) {
  return (await verifyAgentHealth(config, agentType, moduleId, waitMsOrOpts)).ok;
}

export async function verifyAgentHealth(config: AnyRecord, agentType: string, moduleId: string, waitMsOrOpts: number | AnyRecord = {}) {
  const agentConfig = config?.agents?.[agentType];
  if (!agentConfig) return buildHealthCheckResult(false, { reason: 'agent_config_missing' });
  if (agentConfig.dispatch === 'redis') return buildHealthCheckResult(true, { reason: 'redis_dispatch' });
  const waitMs = healthCheckWaitMs(config, waitMsOrOpts);
  const trackingLabel = typeof waitMsOrOpts === 'object' ? selectDefinedValue(() => (waitMsOrOpts?.trackingLabel), () => (null)) : null;
  await sleep(waitMs);
  const label = healthCheckTrackingLabel(trackingLabel, agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  const identity = healthCheckIdentity(entry, agentType, selectDefinedValue(() => (sessionKey), () => (null)));
  if (!sessionKey) {
    log('ERROR', `Agent health check failed: no sessionKey for '${label}'`);
    return buildHealthCheckResult(false, { reason: 'session_key_missing', identity, streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)) });
  }
  try {
    const statusPolicy = gatewayInvokePolicy(config, ['session', 'status'].join('_'));
    const raw = await getGatewaySessionStatus(sessionKey, statusPolicy.timeoutMs, statusPolicy);
    const result = gatewayStatusDetails(raw);
    const parsed = parseSessionState(result);
    const state = parsed.state;
    const transcript = readTrackedTranscriptState(entry);
    if ([parsed.rateLimited, transcript.rateLimited].some(Boolean)) {
      updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
      setHealthCheckMode(entry, null);
      const detail = (selectDefinedValue(() => (parsed.detail), () => ('ACP session rate limited during health check')));
      log('WARN', `Agent health check detected rate limit: ${label}`);
      return buildHealthCheckResult(false, {
        reason: 'rate_limited',
        detail,
        rateLimited: true,
        status: {
          ...identity,
          status: 'RATE_LIMITED',
          reason: 'rate_limited',
          detail,
        },
        identity,
        streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
      });
    }
    if (/^(closed|error)$/i.test(state)) {
      updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
      setHealthCheckMode(entry, null);
      log('ERROR', `Agent health check: session in terminal state '${state}': ${label}`);
      return buildHealthCheckResult(false, {
        reason: 'healthcheck_failed',
        detail: (selectDefinedValue(() => (parsed.detail), () => (`session in terminal state '${state}'`))),
        status: { ...identity, session_state: state, detail: selectDefinedValue(() => (parsed.detail), () => (null)) },
        identity,
        streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
      });
    }
    if (/^(unknown|unreachable)$/i.test(state)) {
      updateHealthCheckObservability(config, entry, agentType, sessionKey, {
        reason: /^unreachable$/i.test(state) ? 'gateway_unreachable' : 'gateway_session_state_unknown',
        detail: `gateway status ${state}`,
      });
      if (transcriptShowsProgress(transcript)) {
        logTranscriptFallbackOnce(entry, label, sessionKey, `gateway status ${state}`);
        return buildHealthCheckResult(true, {
          reason: 'transcript_progress',
          status: { ...identity, session_state: state, detail: selectDefinedValue(() => (transcript.lastDetail), () => (null)) },
          identity,
          streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
        });
      }
      setHealthCheckMode(entry, null);
      log('WARN', `Agent health check failed: session state '${state}' without transcript progress: ${label} (${sessionKey})`);
      return buildHealthCheckResult(false, {
        reason: 'healthcheck_failed',
        detail: `session state '${state}' without transcript progress`,
        status: { ...identity, session_state: state, detail: selectDefinedValue(() => (result?.detail), () => (null)) },
        identity,
        streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
      });
    }
    updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
    setHealthCheckMode(entry, null);
    log('OK', `Agent health check passed: ${label} (${state})`);
    return buildHealthCheckResult(true, {
      reason: 'running',
      status: { ...identity, session_state: state },
      identity,
      streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
    });
  } catch (e: any) {
    updateHealthCheckObservability(config, entry, agentType, sessionKey, {
      reason: 'gateway_status_failed',
      detail: errorMessage(e),
    });
    const transcript = readTrackedTranscriptState(entry);
    if (transcript.rateLimited) {
      setHealthCheckMode(entry, null);
      log('WARN', `Agent health check detected transcript rate limit after gateway status failure: ${label}`);
      return buildHealthCheckResult(false, {
        reason: 'rate_limited',
        detail: (selectDefinedValue(() => (transcript.lastDetail), () => ('ACP transcript rate limited during health check'))),
        rateLimited: true,
        status: {
          ...identity,
          status: 'RATE_LIMITED',
          reason: 'rate_limited',
          detail: selectDefinedValue(() => (transcript.lastDetail), () => (null)),
        },
        identity,
        streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
      });
    }
    if (transcriptShowsProgress(transcript)) {
      logTranscriptFallbackOnce(entry, label, sessionKey, 'after gateway status failure');
      return buildHealthCheckResult(true, {
        reason: 'transcript_progress',
        status: { ...identity, detail: selectDefinedValue(() => (transcript.lastDetail), () => (null)) },
        identity,
        streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
      });
    }
    setHealthCheckMode(entry, null);
    log('ERROR', `Agent health check failed for '${label}': ${e.message}`);
    return buildHealthCheckResult(false, {
      reason: 'healthcheck_failed',
      detail: errorMessage(e),
      status: { ...identity, detail: errorMessage(e) },
      identity,
      streamLogPath: selectDefinedValue(() => (entry?.streamLogPath), () => (null)),
    });
  }
}
