import { getAcpMonitorState } from '../agents/acp-monitor.ts';
import { sendDiscord } from './discord.ts';
import { emitEvent } from './telemetry.ts';
import {
  buildRateLimitDetectedPayload,
  formatRateLimitEmbed,
  resolveRateLimitRecoveryAction,
} from './rate-limit-contract.ts';
import { buildSessionRateLimitDiscordFields } from './discord-fields.ts';
import { sleep } from '../timing.ts';

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

interface RateLimitOptions {
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

export type BusterSessionLivenessState = 'active' | 'closed' | 'gateway_unreachable' | 'probe_error' | 'unknown';

interface BusterSessionLiveness {
  state: BusterSessionLivenessState;
  sessionAlive: boolean | null;
  gatewayUnreachable: boolean;
  gatewayDetail: string | null;
  detail: string | null;
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
  console.log(`[RATE-LIMIT] [${label.toUpperCase()}] ${msg}`);
}

function requiredNumber(config: RateLimitConfig, field: keyof RateLimitConfig): number {
  const raw = config[field];
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value) || value < 0) {
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

function sendRateLimitEmbed({
  moduleId,
  gateId,
  gateType,
  phase,
  provider,
  detail,
  cooldownMs,
  pauseCount,
  maxPauses,
  childSessionKey,
  project,
  runId,
  attempt,
  dispatchId,
  gatewayLabel,
  logDir,
  webhookUrl,
}: {
  moduleId: string;
  gateId: string | null;
  gateType: string | null;
  phase: string;
  provider: string;
  detail: string;
  cooldownMs: number;
  pauseCount: number;
  maxPauses: number;
  childSessionKey: string;
  project: string;
  runId: string | null;
  attempt: number | null;
  dispatchId: string | null;
  gatewayLabel: string | null;
  logDir: string | null;
  webhookUrl: string | null;
}): void {
  const embed = formatRateLimitEmbed({ detail }, pauseCount, maxPauses, cooldownMs) as { title: string; description: string; fields: Record<string, unknown>[] };
  void Promise.resolve(sendDiscord({
    title: embed.title,
    description: embed.description,
    color: 16776960,
    fields: buildSessionRateLimitDiscordFields({
      run_id: runId,
      module_id: moduleId,
      gate_id: gateId,
      gate_type: gateType,
      phase,
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: childSessionKey,
    }, [
      { name: 'Provider', value: String(provider), inline: true },
      ...embed.fields,
    ]),
    footer: { text: 'Buster Pipeline v2.0' },
    timestamp: new Date().toISOString(),
  }, {
    module_id: moduleId,
    gate_id: gateId,
    gate_type: gateType,
    project,
    run_id: runId,
    attempt,
    dispatch_id: dispatchId,
    session_key: childSessionKey,
    log_dir: logDir,
    webhook_url: webhookUrl,
  })).catch((error) => log('WARN', `Rate-limit Discord notice failed: ${errorMessage(error)}`));
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown');
}

export function buildProbeMonitorOptions(gatewayUrl: string | null, gatewayToken: string | null, acpMonitorConfig: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const monitorOptions = { ...(acpMonitorConfig || {}) };
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
    const gatewayDetail = stringField(monitorState.gatewayDetail) || stringField(monitorState.detail);
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
      state: 'unknown',
      sessionAlive: null,
      gatewayUnreachable: false,
      gatewayDetail,
      detail: gatewayDetail || 'monitor returned no explicit sessionActive state',
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
  // Probe errors, unknown state, and gateway degradation preserve monitoring.
  if (liveness.state === 'closed') {
    return resolveRateLimitRecoveryAction({ sessionAlive: false, gatewayUnreachable: false });
  }
  return 'resume';
}

export async function handleRateLimit(state: RateLimitState, opts: RateLimitOptions): Promise<RateLimitRecoveryResult> {
  const {
    childSessionKey,
    gatewayUrl = null,
    gatewayToken = null,
    discord = null,
    telemetryCtx = null,
    moduleId,
    gateId = null,
    gateType = null,
    provider,
    detail = null,
    taskType = null,
    phase = 'buster',
    project = telemetryCtx?.project || '',
    runId = telemetryCtx?.runId || null,
    attempt = null,
    dispatchId = null,
    gatewayLabel = dispatchId || null,
    logDir = telemetryCtx?.logDir || null,
    acpMonitorConfig = null,
    ownsCanonicalSignal = true,
  } = opts;
  const resolvedGateId = gateId || (taskType === 'gate_test' ? moduleId : null);
  const resolvedGateType = gateType || null;
  const signalModuleId = taskType === 'gate_test' ? null : moduleId;

  state.pauseCount += 1;
  const cooldownS = state.currentCooldownS;
  const cooldownMs = cooldownS * 1000;
  const resumeAt = new Date(Date.now() + cooldownMs).toISOString();
  const resolvedDetail = detail || `rate limit pause ${state.pauseCount}/${state.maxPauses}`;

  log('WARN', `Rate limit detected — module=${moduleId} session=${childSessionKey} provider=${provider} pause=${state.pauseCount}/${state.maxPauses} cooldown=${cooldownS}s`);

  if (ownsCanonicalSignal) {
    const signalIdentity = {
      run_id: runId,
      module_id: signalModuleId,
      gate_id: resolvedGateId,
      gate_type: resolvedGateType,
      agent_type: phase,
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: childSessionKey,
    };
    await emitEvent(telemetryCtx, 'rate_limit.detected', buildRateLimitDetectedPayload(signalIdentity, {
      provider,
      pauseCount: state.pauseCount,
      maxPauses: state.maxPauses,
      cooldownMs,
      resumeAt,
      detail: resolvedDetail,
    }));

    sendRateLimitEmbed({
      moduleId,
      gateId: resolvedGateId,
      gateType: resolvedGateType,
      phase,
      provider,
      detail: resolvedDetail,
      cooldownMs,
      pauseCount: state.pauseCount,
      maxPauses: state.maxPauses,
      childSessionKey,
      project,
      runId,
      attempt,
      dispatchId,
      gatewayLabel,
      logDir,
      webhookUrl: discord?.webhookUrl || null,
    });
  } else {
    // KEEP_TYPED_POLICY: explicit duplicate-owner calls still sleep/probe but
    // suppress canonical pause telemetry/Discord to avoid duplicate signals.
    log('INFO', `Suppressing canonical pause signal for caller-owned duplicate: module=${moduleId} session=${childSessionKey}`);
  }

  log('INFO', `Sleeping ${cooldownS}s for rate-limit cooldown...`);
  await sleep(cooldownMs);

  const liveness = await probeSessionLiveness(childSessionKey, gatewayUrl, gatewayToken, acpMonitorConfig);
  log('INFO', `Post-cooldown liveness check: session=${childSessionKey} state=${liveness.state} alive=${liveness.sessionAlive} gatewayUnreachable=${liveness.gatewayUnreachable}`);

  state.currentCooldownS = Math.min(state.currentCooldownS * 2, state.maxCooldownS);

  const action = recoveryActionForLiveness(liveness);
  if (liveness.state === 'gateway_unreachable') {
    log('WARN', `Gateway unreachable after cooldown, preserving degraded visibility and resuming monitor for session=${childSessionKey}`);
  } else if (liveness.state === 'probe_error' || liveness.state === 'unknown') {
    log('WARN', `Liveness state ${liveness.state} after cooldown, preserving monitor for session=${childSessionKey}`);
  }

  return {
    action,
    cooldownMs,
    gatewayUnreachable: liveness.gatewayUnreachable,
    gatewayDetail: liveness.gatewayDetail,
    sessionAlive: liveness.sessionAlive,
    liveness_state: liveness.state,
    liveness_detail: liveness.detail,
  };
}
