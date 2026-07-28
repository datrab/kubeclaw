import { readAcpTranscriptState } from './acp-monitor.ts';

type AnyRecord = Record<string, any>;

export function healthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

export function readTrackedTranscriptState(entry: AnyRecord | null): AnyRecord {
  const state = entry?.transcriptState && typeof entry.transcriptState === 'object'
    ? entry.transcriptState
    : {};
  const transcript = readAcpTranscriptState(entry?.streamLogPath, state) as AnyRecord;
  if (entry) entry.transcriptState = transcript;
  return transcript;
}

export function setHealthCheckMode(entry: AnyRecord | null, mode: string | null = null): void {
  if (!entry) return;
  if (mode) entry.healthCheckMode = mode;
  else delete entry.healthCheckMode;
}

export function healthCheckWaitMs(config: AnyRecord, waitMsOrOpts: number | AnyRecord): number {
  if (typeof waitMsOrOpts === 'number') return waitMsOrOpts;
  if (waitMsOrOpts?.waitMs !== undefined && waitMsOrOpts.waitMs !== null) return waitMsOrOpts.waitMs;
  const value = Number(config?.session?.health_check_timeout_ms);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('config.session.health_check_timeout_ms: required non-negative number in swarm.config.json');
  }
  return value;
}

export function healthCheckTrackingLabel(
  trackingLabel: string | null,
  agentType: string,
  moduleId: string,
): string {
  return trackingLabel ?? `${agentType}-${moduleId}`;
}

export function gatewayStatusDetails(raw: AnyRecord): AnyRecord {
  return raw?.result?.details ?? raw;
}

export function healthCheckIdentity(
  entry: AnyRecord | null,
  agentType: string,
  sessionKey: string | null,
): AnyRecord {
  const moduleId = entry?.telemetry_module_id !== undefined
    ? entry.telemetry_module_id
    : entry?.moduleId;
  return {
    module_id: moduleId ?? null,
    gate_id: entry?.telemetry_gate_id ?? null,
    gate_type: entry?.telemetry_gate_type ?? null,
    gateway_label: entry?.gatewayLabel ?? null,
    session_key: sessionKey,
    attempt: entry?.telemetry_attempt ?? null,
    dispatch_id: entry?.telemetry_dispatch_id ?? null,
    agent_type: agentType,
  };
}

export function buildHealthCheckResult(ok: boolean, input: AnyRecord = {}) {
  return {
    ok,
    reason: input.reason ?? (ok ? 'running' : 'healthcheck_failed'),
    detail: input.detail ?? null,
    rateLimited: input.rateLimited === true,
    status: input.status ?? null,
    identity: input.identity ?? null,
    sessionKey: input.sessionKey ?? null,
    gatewayLabel: input.gatewayLabel ?? null,
    streamLogPath: input.streamLogPath ?? null,
  };
}
