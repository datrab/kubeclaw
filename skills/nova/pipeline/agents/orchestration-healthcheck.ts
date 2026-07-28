import { log, getActiveContext } from '../core/logger.ts';
import { emitObservabilityDegraded, emitObservabilityRestored } from '../services/telemetry.ts';
import { getGatewaySessionStatus } from '../integrations/gateway.ts';
import { parseSessionState, transcriptShowsProgress } from './acp-monitor.ts';
import { getTrackedAgent } from './lifecycle.ts';
import { sleep } from '../timing.ts';
import { sessionStatusGatewayPolicy } from '../core/session-policy.ts';
import {
  buildHealthCheckResult,
  gatewayStatusDetails,
  healthCheckIdentity,
  healthCheckTrackingLabel,
  healthCheckWaitMs,
  healthErrorMessage as errorMessage,
  readTrackedTranscriptState,
  setHealthCheckMode,
} from './orchestration-health-values.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function healthCheckObservabilityState(entry: AnyRecord) {
  if (entry.healthCheckObservability && typeof entry.healthCheckObservability === 'object') {
    return entry.healthCheckObservability;
  }
  return { active: false, degradedAt: null, reason: null };
}

function logTranscriptFallbackOnce(entry: AnyRecord | null, label: string, sessionKey: string, detail: string) {
  const mode = `transcript_fallback:${detail}`;
  if (entry?.healthCheckMode === mode) return;
  setHealthCheckMode(entry, mode);
  log('WARN', `Agent health check using transcript fallback${detail ? ` (${detail})` : ''}: ${label} (${sessionKey})`);
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

export async function verifyAgentAlive(config: AnyRecord, agentType: string, moduleId: string, waitMsOrOpts: number | AnyRecord = {}) {
  return (await verifyAgentHealth(config, agentType, moduleId, waitMsOrOpts)).ok;
}

function healthResultBase(entry: AnyRecord, identity: AnyRecord) {
  return {
    identity,
    streamLogPath: entry?.streamLogPath ?? null,
  };
}

function rateLimitedHealthResult(
  config: AnyRecord,
  entry: AnyRecord,
  agentType: string,
  sessionKey: string,
  label: string,
  identity: AnyRecord,
  parsedDetail: unknown,
) {
  updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
  setHealthCheckMode(entry, null);
  const detail = parsedDetail ?? 'ACP session rate limited during health check';
  log('WARN', `Agent health check detected rate limit: ${label}`);
  return buildHealthCheckResult(false, {
    reason: 'rate_limited',
    detail,
    rateLimited: true,
    status: { ...identity, status: 'RATE_LIMITED', reason: 'rate_limited', detail },
    ...healthResultBase(entry, identity),
  });
}

function terminalHealthResult(
  config: AnyRecord,
  entry: AnyRecord,
  agentType: string,
  sessionKey: string,
  label: string,
  identity: AnyRecord,
  parsed: AnyRecord,
) {
  updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
  setHealthCheckMode(entry, null);
  log('ERROR', `Agent health check: session in terminal state '${parsed.state}': ${label}`);
  return buildHealthCheckResult(false, {
    reason: 'healthcheck_failed',
    detail: parsed.detail ?? `session in terminal state '${parsed.state}'`,
    status: { ...identity, session_state: parsed.state, detail: parsed.detail ?? null },
    ...healthResultBase(entry, identity),
  });
}

function uncertainHealthResult(
  context: {
    config: AnyRecord;
    entry: AnyRecord;
    agentType: string;
    sessionKey: string;
    label: string;
    identity: AnyRecord;
  },
  parsed: AnyRecord,
  transcript: AnyRecord,
  result: AnyRecord,
) {
  const { config, entry, agentType, sessionKey, label, identity } = context;
  const state = parsed.state;
  updateHealthCheckObservability(config, entry, agentType, sessionKey, {
    reason: /^unreachable$/i.test(state) ? 'gateway_unreachable' : 'gateway_session_state_unknown',
    detail: `gateway status ${state}`,
  });
  if (transcriptShowsProgress(transcript)) {
    logTranscriptFallbackOnce(entry, label, sessionKey, `gateway status ${state}`);
    return buildHealthCheckResult(true, {
      reason: 'transcript_progress',
      status: { ...identity, session_state: state, detail: transcript.lastDetail ?? null },
      ...healthResultBase(entry, identity),
    });
  }
  setHealthCheckMode(entry, null);
  log('WARN', `Agent health check failed: session state '${state}' without transcript progress: ${label} (${sessionKey})`);
  return buildHealthCheckResult(false, {
    reason: 'healthcheck_failed',
    detail: `session state '${state}' without transcript progress`,
    status: { ...identity, session_state: state, detail: result?.detail ?? null },
    ...healthResultBase(entry, identity),
  });
}

function runningHealthResult(
  config: AnyRecord,
  entry: AnyRecord,
  agentType: string,
  sessionKey: string,
  label: string,
  identity: AnyRecord,
  state: string,
) {
  updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
  setHealthCheckMode(entry, null);
  log('OK', `Agent health check passed: ${label} (${state})`);
  return buildHealthCheckResult(true, {
    reason: 'running',
    status: { ...identity, session_state: state },
    ...healthResultBase(entry, identity),
  });
}

function failedGatewayHealthResult(
  config: AnyRecord,
  entry: AnyRecord,
  agentType: string,
  sessionKey: string,
  label: string,
  identity: AnyRecord,
  error: unknown,
) {
  updateHealthCheckObservability(config, entry, agentType, sessionKey, {
    reason: 'gateway_status_failed',
    detail: errorMessage(error),
  });
  const transcript = readTrackedTranscriptState(entry);
  if (transcript.rateLimited) {
    return transcriptRateLimitedHealthResult(entry, label, identity, transcript);
  }
  if (transcriptShowsProgress(transcript)) {
    logTranscriptFallbackOnce(entry, label, sessionKey, 'after gateway status failure');
    return buildHealthCheckResult(true, {
      reason: 'transcript_progress',
      status: { ...identity, detail: transcript.lastDetail ?? null },
      ...healthResultBase(entry, identity),
    });
  }
  setHealthCheckMode(entry, null);
  log('ERROR', `Agent health check failed for '${label}': ${errorMessage(error)}`);
  return buildHealthCheckResult(false, {
    reason: 'healthcheck_failed',
    detail: errorMessage(error),
    status: { ...identity, detail: errorMessage(error) },
    ...healthResultBase(entry, identity),
  });
}

function transcriptRateLimitedHealthResult(
  entry: AnyRecord,
  label: string,
  identity: AnyRecord,
  transcript: AnyRecord,
) {
  setHealthCheckMode(entry, null);
  log('WARN', `Agent health check detected transcript rate limit after gateway status failure: ${label}`);
  const detail = transcript.lastDetail ?? 'ACP transcript rate limited during health check';
  return buildHealthCheckResult(false, {
    reason: 'rate_limited',
    detail,
    rateLimited: true,
    status: { ...identity, status: 'RATE_LIMITED', reason: 'rate_limited', detail: transcript.lastDetail ?? null },
    ...healthResultBase(entry, identity),
  });
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
    const statusPolicy = sessionStatusGatewayPolicy(config);
    const raw = await getGatewaySessionStatus(sessionKey, statusPolicy.timeoutMs, statusPolicy);
    const result = gatewayStatusDetails(raw as AnyRecord);
    const parsed = parseSessionState(result);
    const transcript = readTrackedTranscriptState(entry);
    if ([parsed.rateLimited, transcript.rateLimited].some(Boolean)) {
      return rateLimitedHealthResult(config, entry, agentType, sessionKey, label, identity, parsed.detail);
    }
    if (/^(closed|error)$/i.test(parsed.state)) {
      return terminalHealthResult(config, entry, agentType, sessionKey, label, identity, parsed);
    }
    if (/^(unknown|unreachable)$/i.test(parsed.state)) {
      return uncertainHealthResult(
        { config, entry, agentType, sessionKey, label, identity },
        parsed,
        transcript,
        result,
      );
    }
    return runningHealthResult(config, entry, agentType, sessionKey, label, identity, parsed.state);
  } catch (e: any) {
    return failedGatewayHealthResult(config, entry, agentType, sessionKey, label, identity, e);
  }
}
