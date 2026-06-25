import { log, getActiveContext } from '../core/logger.ts';
import { emitObservabilityDegraded, emitObservabilityRestored } from '../services/telemetry.ts';
import { getGatewaySessionStatus } from '../integrations/gateway.ts';
import { parseSessionState, readAcpTranscriptState, transcriptShowsProgress } from './acp-monitor.ts';
import { getTrackedAgent } from './lifecycle.ts';
import { sleep } from '../timing.ts';
import { gatewayInvokePolicy } from '../core/session-policy.ts';

type AnyRecord = Record<string, any>;

function agentLabel(agentType: string, moduleId: string) {
  return `${agentType}-${moduleId}`;
}

function readTrackedTranscriptState(entry: AnyRecord | null) {
  const transcript = readAcpTranscriptState(entry?.streamLogPath, entry?.transcriptState || {});
  if (entry) entry.transcriptState = transcript;
  return transcript;
}

function setHealthCheckMode(entry: AnyRecord | null, mode: string | null = null) {
  if (!entry) return;
  if (mode) entry.healthCheckMode = mode;
  else delete entry.healthCheckMode;
}

function logTranscriptFallbackOnce(entry: AnyRecord | null, label: string, sessionKey: string, detail: string) {
  const mode = `transcript_fallback:${detail}`;
  if (entry?.healthCheckMode === mode) return;
  setHealthCheckMode(entry, mode);
  log('WARN', `Agent health check using transcript fallback${detail ? ` (${detail})` : ''}: ${label} (${sessionKey})`);
}

export function healthCheckIdentity(entry: AnyRecord | null, agentType: string, sessionKey: string | null) {
  return {
    module_id: entry?.telemetry_module_id ?? entry?.moduleId ?? null,
    gate_id: entry?.telemetry_gate_id ?? null,
    gate_type: entry?.telemetry_gate_type ?? null,
    gateway_label: entry?.gatewayLabel || null,
    session_key: sessionKey || null,
    attempt: entry?.telemetry_attempt ?? null,
    dispatch_id: entry?.telemetry_dispatch_id || null,
    agent_type: agentType || null,
  };
}

function updateHealthCheckObservability(
  config: AnyRecord,
  entry: AnyRecord | null,
  agentType: string,
  sessionKey: string,
  issue: AnyRecord | null = null,
) {
  if (!entry) return;
  const state = entry.healthCheckObservability || { active: false, degradedAt: null, reason: null };
  const ctx = getActiveContext() || { config, runId: config?._runId || config?.run_id || null };
  const identity = healthCheckIdentity(entry, agentType, sessionKey);

  if (issue) {
    if (state.active) {
      entry.healthCheckObservability = state;
      return;
    }
    state.active = true;
    state.degradedAt = new Date().toISOString();
    state.reason = issue.reason || 'gateway_status_failed';
    entry.healthCheckObservability = state;
    emitObservabilityDegraded(ctx, {
      component: 'acp_monitor',
      surface: 'gateway',
      reason: state.reason,
      detail: issue.detail || 'session status unavailable',
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
    reason: state.reason || 'gateway_status_failed',
    detail: 'session status reachable again',
    degraded_at: state.degradedAt || null,
    restored_at: restoredAt,
    restored_after_ms: state.degradedAt ? Math.max(0, Date.now() - new Date(state.degradedAt).getTime()) : null,
    ...identity,
  });
  delete entry.healthCheckObservability;
}

function sessionHealthCheckWaitMs(config: AnyRecord): number {
  const value = config?.session?.health_check_wait_ms;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('config.session.health_check_wait_ms: required non-negative number in swarm.config.json');
  }
  return value;
}

export async function verifyAgentAlive(config: AnyRecord, agentType: string, moduleId: string, waitMsOrOpts: number | AnyRecord = {}) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return false;
  if (agentConfig.dispatch === 'redis') return true;
  const waitMs = typeof waitMsOrOpts === 'number' ? waitMsOrOpts : (waitMsOrOpts?.waitMs ?? sessionHealthCheckWaitMs(config));
  const trackingLabel = typeof waitMsOrOpts === 'object' ? waitMsOrOpts?.trackingLabel || null : null;
  await sleep(waitMs);
  const label = trackingLabel || agentLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('ERROR', `Agent health check failed: no sessionKey for '${label}'`);
    return false;
  }
  try {
    const statusPolicy = gatewayInvokePolicy(config, 'session_status');
    const raw = await getGatewaySessionStatus(sessionKey, statusPolicy.timeoutMs, statusPolicy);
    const result = raw?.result?.details || raw;
    const { state } = parseSessionState(result);
    if (/^(closed|error)$/i.test(state)) {
      updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
      setHealthCheckMode(entry, null);
      log('ERROR', `Agent health check: session in terminal state '${state}': ${label}`);
      return false;
    }
    if (/^(unknown|unreachable)$/i.test(state)) {
      updateHealthCheckObservability(config, entry, agentType, sessionKey, {
        reason: /^unreachable$/i.test(state) ? 'gateway_unreachable' : 'gateway_status_unknown',
        detail: `gateway status ${state}`,
      });
      const transcript = readTrackedTranscriptState(entry);
      if (transcriptShowsProgress(transcript)) {
        logTranscriptFallbackOnce(entry, label, sessionKey, `gateway status ${state}`);
        return true;
      }
      setHealthCheckMode(entry, null);
      log('WARN', `Agent health check failed: session state '${state}' without transcript progress: ${label} (${sessionKey})`);
      return false;
    }
    updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
    setHealthCheckMode(entry, null);
    log('OK', `Agent health check passed: ${label} (${state})`);
    return true;
  } catch (e: any) {
    updateHealthCheckObservability(config, entry, agentType, sessionKey, {
      reason: 'gateway_status_failed',
      detail: e.message || String(e),
    });
    const transcript = readTrackedTranscriptState(entry);
    if (transcriptShowsProgress(transcript)) {
      logTranscriptFallbackOnce(entry, label, sessionKey, 'after gateway status failure');
      return true;
    }
    setHealthCheckMode(entry, null);
    log('ERROR', `Agent health check failed for '${label}': ${e.message}`);
    return false;
  }
}
