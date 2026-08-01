import { getAcpMonitorState } from '../agents/acp-monitor.ts';
import { emitEvent } from './telemetry.ts';
import {
  buildRateLimitDetectedPayload,
  resolveRateLimitRecoveryAction,
} from './rate-limit-contract.ts';
import { sendRateLimitEmbed } from './rate-limit-discord.ts';
import { sleep } from '../timing.ts';
import { writeBusterRuntimeLog } from './logger.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
interface RateLimitConfig {
  maxPauses?: number | string | null;
  initialCooldownS?: number | string | null;
  maxCooldownS?: number | string | null;
}

export interface RateLimitState {
  maxPauses: number;
  initialCooldownS: number;
  maxCooldownS: number;
  pauseCount: number;
  currentCooldownS: number;
}

interface DiscordConfig {
  webhookUrl?: string | null;
}

interface TelemetryContext {
  project?: string;
  runId?: string | null;
  logDir?: string | null;
  [key: string]: unknown;
}

export interface RateLimitOptions {
  childSessionKey: string;
  gatewayUrl?: string | null;
  gatewayToken?: string | null;
  discord?: DiscordConfig | null;
  telemetryCtx?: TelemetryContext | null;
  moduleId: string;
  gateId?: string | null;
  gateType?: string | null;
  provider: string;
  detail?: string | null;
  taskType?: string | null;
  phase?: string;
  project?: string;
  runId?: string | null;
  attempt?: number | null;
  dispatchId?: string | null;
  gatewayLabel?: string | null;
  logDir?: string | null;
  acpMonitorConfig?: Record<string, unknown> | null;
  ownsCanonicalSignal?: boolean;
}

type BusterSessionLivenessState = 'active' | 'closed' | 'gateway_unreachable' | 'probe_error' | 'session_active_state_missing';

interface BusterSessionLiveness {
  state: BusterSessionLivenessState;
  sessionAlive: boolean | null;
  gatewayUnreachable: boolean;
  gatewayDetail: string | null;
  detail: string | null;
}

interface ResolvedRateLimitContext {
  gateId: string | null;
  gateType: string | null;
  signalModuleId: string | null;
  project: string;
  runId: string | null;
  gatewayLabel: string | null;
  logDir: string | null;
  detail: string;
  cooldownS: number;
  cooldownMs: number;
  resumeAt: string;
}

export interface RateLimitRecoveryResult {
  action: string;
  cooldownMs: number;
  gatewayUnreachable: boolean;
  gatewayDetail: string | null;
  sessionAlive: boolean | null;
  liveness_state: BusterSessionLivenessState;
  liveness_detail: string | null;
}

function log(label: string, msg: string): void {
  const normalized = label.toLowerCase();
  const level = normalized === 'error' ? 'error' : normalized === 'warn' ? 'warn' : 'info';
  writeBusterRuntimeLog(level, 'rate-limit', msg);
}

function requiredNumber(config: RateLimitConfig, field: keyof RateLimitConfig): number {
  const raw = config[field];
  const value = Number(raw);
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (raw === undefined), () => (raw === null))), () => (raw === ''))), () => (!Number.isFinite(value)))), () => (value < 0))) {
    throw new Error(`Buster rate-limit config invalid: ${field} is required as a non-negative number`);
  }
  return value;
}

export function createRateLimitState(config: RateLimitConfig = {}): RateLimitState {
  const initialCooldownS = requiredNumber(config, 'initialCooldownS');
  return {
    maxPauses: requiredNumber(config, 'maxPauses'),
    initialCooldownS,
    maxCooldownS: requiredNumber(config, 'maxCooldownS'),
    pauseCount: 0,
    currentCooldownS: initialCooldownS,
  };
}

export function shouldRetryAfterRateLimit(state: RateLimitState): boolean {
  return state.pauseCount < state.maxPauses;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(selectTruthyValue(() => (error), () => ('missing_error_detail')));
}

function monitorGatewayDetailAuthority(monitorState: Record<string, unknown>): string | null {
  const explicitGatewayDetail = stringField(monitorState.gatewayDetail);
  if (explicitGatewayDetail) return explicitGatewayDetail;
  return stringField(monitorState.detail);
}

function rateLimitGateIdAuthority(gateId: string | null, taskType: string | null, moduleId: string): string | null {
  if (stringField(gateId)) return gateId;
  if (taskType === 'gate_test') return moduleId;
  return null;
}

export function buildProbeMonitorOptions(gatewayUrl: string | null, gatewayToken: string | null, acpMonitorConfig: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const monitorOptions = { ...objectRecord(acpMonitorConfig) };
  if (stringField(gatewayUrl)) monitorOptions.gatewayUrl = gatewayUrl;
  if (stringField(gatewayToken)) monitorOptions.gatewayToken = gatewayToken;
  return monitorOptions;
}

async function probeSessionLiveness(childSessionKey: string, gatewayUrl: string | null, gatewayToken: string | null, acpMonitorConfig: Record<string, unknown> | null | undefined): Promise<BusterSessionLiveness> {
  try {
    const monitorState = await getAcpMonitorState({
      childSessionKey,
      streamLogPath: null,
      previousState: {},
      monitorOptions: buildProbeMonitorOptions(gatewayUrl, gatewayToken, acpMonitorConfig),
    });
    const gatewayUnreachable = monitorState.gatewayUnreachable === true;
    const gatewayDetail = monitorGatewayDetailAuthority(monitorState);
    if (gatewayUnreachable) {
      return {
        state: 'gateway_unreachable',
        sessionAlive: null,
        gatewayUnreachable: true,
        gatewayDetail,
        detail: gatewayDetail,
      };
    }
    if (monitorState.sessionActive === true) {
      return {
        state: 'active',
        sessionAlive: true,
        gatewayUnreachable: false,
        gatewayDetail,
        detail: gatewayDetail,
      };
    }
    if (monitorState.sessionActive === false) {
      return {
        state: 'closed',
        sessionAlive: false,
        gatewayUnreachable: false,
        gatewayDetail,
        detail: gatewayDetail,
      };
    }
    return {
      state: 'session_active_state_missing',
      sessionAlive: null,
      gatewayUnreachable: false,
      gatewayDetail,
      detail: selectDefinedValue(() => (gatewayDetail), () => ('monitor returned no explicit sessionActive state')),
    };
  } catch (error: unknown) {
    const detail = errorMessage(error);
    log('WARN', `Liveness check failed after cooldown: ${detail}`);
    return {
      state: 'probe_error',
      sessionAlive: null,
      gatewayUnreachable: false,
      gatewayDetail: null,
      detail,
    };
  }
}

function recoveryActionForLiveness(liveness: BusterSessionLiveness): string {
  // STRICTIFY_TS_SLICE: only a confirmed closed session can move to kill.
  // Probe errors, missing active-state authority, and gateway degradation preserve monitoring.
  if (liveness.state === 'closed') {
    return resolveRateLimitRecoveryAction({ sessionAlive: false, gatewayUnreachable: false });
  }
  return 'resume';
}

function resolveRateLimitContext(state: RateLimitState, opts: RateLimitOptions): ResolvedRateLimitContext {
  const cooldownS = state.currentCooldownS;
  const runId = opts.runId ?? stringField(opts.telemetryCtx?.runId);
  const dispatchId = opts.dispatchId ?? null;
  const telemetryProject = stringField(opts.telemetryCtx?.project);
  const project = opts.project !== undefined ? opts.project : (telemetryProject ?? '');
  return {
    gateId: rateLimitGateIdAuthority(opts.gateId ?? null, opts.taskType ?? null, opts.moduleId),
    gateType: opts.gateType ?? null,
    signalModuleId: opts.taskType === 'gate_test' ? null : opts.moduleId,
    project,
    runId,
    gatewayLabel: opts.gatewayLabel ?? dispatchId,
    logDir: opts.logDir ?? stringField(opts.telemetryCtx?.logDir),
    detail: stringField(opts.detail) ?? `rate limit pause ${state.pauseCount}/${state.maxPauses}`,
    cooldownS,
    cooldownMs: cooldownS * 1000,
    resumeAt: new Date(Date.now() + cooldownS * 1000).toISOString(),
  };
}

async function emitRateLimitSignal(state: RateLimitState, opts: RateLimitOptions, resolved: ResolvedRateLimitContext): Promise<void> {
  const phase = opts.phase ?? 'buster';
  const attempt = opts.attempt ?? null;
  const dispatchId = opts.dispatchId ?? null;
  const identity = {
    run_id: resolved.runId, module_id: resolved.signalModuleId, gate_id: resolved.gateId,
    gate_type: resolved.gateType, agent_type: phase, attempt, dispatch_id: dispatchId,
    gateway_label: resolved.gatewayLabel, session_key: opts.childSessionKey,
  };
  await emitEvent(opts.telemetryCtx ?? null, 'rate_limit.detected', buildRateLimitDetectedPayload(identity, {
    provider: opts.provider,
    pauseCount: state.pauseCount,
    maxPauses: state.maxPauses,
    cooldownMs: resolved.cooldownMs,
    resumeAt: resolved.resumeAt,
    detail: resolved.detail,
  }));
  sendRateLimitEmbed({
    moduleId: opts.moduleId, gateId: resolved.gateId, gateType: resolved.gateType, phase,
    provider: opts.provider, detail: resolved.detail, cooldownMs: resolved.cooldownMs,
    pauseCount: state.pauseCount, maxPauses: state.maxPauses, childSessionKey: opts.childSessionKey,
    project: resolved.project || opts.moduleId, runId: resolved.runId, attempt, dispatchId,
    gatewayLabel: resolved.gatewayLabel, logDir: resolved.logDir, webhookUrl: opts.discord?.webhookUrl ?? null,
  }, log);
}

function logPostCooldownLiveness(sessionKey: string, liveness: BusterSessionLiveness): void {
  log('INFO', `Post-cooldown liveness check: session=${sessionKey} state=${liveness.state} alive=${liveness.sessionAlive} gatewayUnreachable=${liveness.gatewayUnreachable}`);
  if (liveness.state === 'gateway_unreachable') {
    log('WARN', `Gateway unreachable after cooldown, preserving degraded visibility and resuming monitor for session=${sessionKey}`);
  } else if (liveness.state === 'probe_error' || liveness.state === 'session_active_state_missing') {
    log('WARN', `Liveness state ${liveness.state} after cooldown, preserving monitor for session=${sessionKey}`);
  }
}

export async function handleRateLimit(state: RateLimitState, opts: RateLimitOptions): Promise<RateLimitRecoveryResult> {
  state.pauseCount += 1;
  const resolved = resolveRateLimitContext(state, opts);
  log('WARN', `Rate limit detected — module=${opts.moduleId} session=${opts.childSessionKey} provider=${opts.provider} pause=${state.pauseCount}/${state.maxPauses} cooldown=${resolved.cooldownS}s`);
  if (opts.ownsCanonicalSignal !== false) {
    await emitRateLimitSignal(state, opts, resolved);
  } else {
    log('INFO', `Suppressing canonical pause signal for caller-owned duplicate: module=${opts.moduleId} session=${opts.childSessionKey}`);
  }
  log('INFO', `Sleeping ${resolved.cooldownS}s for rate-limit cooldown...`);
  await sleep(resolved.cooldownMs);
  const liveness = await probeSessionLiveness(opts.childSessionKey, opts.gatewayUrl ?? null, opts.gatewayToken ?? null, opts.acpMonitorConfig);
  logPostCooldownLiveness(opts.childSessionKey, liveness);
  state.currentCooldownS = Math.min(state.currentCooldownS * 2, state.maxCooldownS);
  return {
    action: recoveryActionForLiveness(liveness),
    cooldownMs: resolved.cooldownMs,
    gatewayUnreachable: liveness.gatewayUnreachable,
    gatewayDetail: liveness.gatewayDetail,
    sessionAlive: liveness.sessionAlive,
    liveness_state: liveness.state,
    liveness_detail: liveness.detail,
  };
}
