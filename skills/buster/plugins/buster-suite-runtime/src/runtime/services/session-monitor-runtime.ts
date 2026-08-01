import { createAcpMonitorEventAdapter, getAcpMonitorConfig, monitorStateFromAcpEvent, isSessionTerminal } from '../agents/acp-monitor.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.ts';
import { createBudget } from '../timing.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { createPipelineEventBus, waitForAny } from './pipeline-event-contract.ts';
import { assertValidSessionTerminationResult } from './acp-gateway-contract.ts';
import { createLogger } from './logger.ts';
import { createRateLimitState, handleRateLimit, shouldRetryAfterRateLimit } from './rate-limit.ts';
import type { RateLimitState } from './rate-limit.ts';
import type { RateLimitOptions } from './rate-limit.ts';
import { loadBusterSessionPolicies } from './runtime-policy.ts';
import { emitEvent, emitPluginEvent } from './telemetry.ts';

type AnyRecord = Record<string, any>;
type Adapter = ReturnType<typeof createAcpMonitorEventAdapter>;
type Logger = ReturnType<typeof createLogger>;

export interface MonitorRuntime {
  childSessionKey: string; streamLogPath: string | null; payload: AnyRecord; telemetryContext: AnyRecord | null; moduleId: string;
  spawnedAt: number; logger: Logger; now: () => number; getState: any; terminateChild: typeof terminateSession;
  timeoutSeconds: number; hardDeadlineMs: number | null; policies: AnyRecord; killGraceMs: number; gatewayUrl: string;
  gatewayToken: string; eventBus: ReturnType<typeof createPipelineEventBus>; identity: AnyRecord; budget: ReturnType<typeof createBudget> | null;
  monitorConfig: AnyRecord; monitorOptions: AnyRecord; rateLimitState: RateLimitState; previous: AnyRecord; pollCount: number;
  gatewayDegradedAt: string | null; adapter: Adapter | null;
}

function objectRecord(value: unknown): AnyRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}; }
function nonEmptyString(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function firstDefined<T>(...values: Array<T | null | undefined>): T | null { for (const value of values) if (value !== null && value !== undefined) return value; return null; }
function firstNonEmpty(...values: unknown[]): string | null { for (const value of values) { const text = nonEmptyString(value); if (text) return text; } return null; }
function deadline(spawnedAt: number, timeoutSeconds: number): number | null { return Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? spawnedAt + (timeoutSeconds * 1000) : null; }

export function createMonitorRuntime(childSessionKey: string, streamLogPath: string | null, payload: AnyRecord, telemetryContext: unknown, meta: AnyRecord): MonitorRuntime {
  const config = getAcpMonitorConfig(payload.acp_monitor);
  const moduleId = firstNonEmpty(meta.moduleId, payload.module_id);
  if (!moduleId) throw new Error('Buster session monitor requires module_id');
  const spawnedAt = firstDefined(numberValue(meta.spawnedAt), Date.now())!;
  const hooks = objectRecord(meta.testHooks);
  const timeoutSeconds = Number(meta.timeoutSeconds);
  const hardDeadlineMs = deadline(spawnedAt, timeoutSeconds);
  const policies = loadBusterSessionPolicies();
  const monitorPollMs = numberValue(config.monitorPollMs);
  if (monitorPollMs === null) throw new Error('Buster ACP monitor policy requires monitorPollMs');
  const requestedGrace = meta.killGraceMs == null ? Number(policies.terminationPolicy.graceMs) : Number(meta.killGraceMs);
  const gatewayUrl = resolveGatewayBaseUrl(meta.gatewayUrl);
  const gatewayToken = resolveGatewayToken(meta.gatewayToken);
  const eventBus = createPipelineEventBus();
  const identity = { module_id: moduleId, gate_id: payload.gate_id ?? null,
    dispatch_id: firstDefined(payload.dispatch_id, payload.session?.label), session_key: childSessionKey };
  const budget = hardDeadlineMs ? createBudget({ deadlineMs: hardDeadlineMs, label: `buster-monitor-${moduleId}` }) : null;
  const rate = objectRecord(payload.rate_limit);
  return { childSessionKey, streamLogPath, payload, telemetryContext: Object.keys(objectRecord(telemetryContext)).length ? objectRecord(telemetryContext) : null, moduleId, spawnedAt,
    logger: meta.logger ?? createLogger({ module: moduleId }), now: typeof hooks.now === 'function' ? hooks.now : Date.now,
    getState: hooks.getAcpMonitorState ?? null, terminateChild: typeof hooks.terminateSession === 'function' ? hooks.terminateSession : terminateSession,
    timeoutSeconds, hardDeadlineMs, policies, killGraceMs: Math.min(Math.max(requestedGrace, monitorPollMs), policies.terminationPolicy.maxGraceMs),
    gatewayUrl, gatewayToken, eventBus, identity, budget, monitorConfig: config,
    monitorOptions: { ...config, gatewayUrl, gatewayToken, gatewayStatusPolicy: policies.gatewayStatusPolicy },
    rateLimitState: createRateLimitState({ maxPauses: rate.max_pauses, initialCooldownS: rate.initial_cooldown_s, maxCooldownS: rate.max_cooldown_s }),
    previous: {}, pollCount: 0, gatewayDegradedAt: null, adapter: null };
}

export function startMonitorAdapter(runtime: MonitorRuntime): void {
  runtime.adapter = createAcpMonitorEventAdapter(runtime.childSessionKey, runtime.streamLogPath, {
    eventBus: runtime.eventBus, identity: runtime.identity, budget: runtime.budget, pollMs: runtime.monitorConfig.monitorPollMs,
    monitorOpts: runtime.monitorOptions, initialState: runtime.previous, stopOnTerminal: false,
    ...(runtime.getState ? { getAcpMonitorState: runtime.getState } : {}),
  });
  runtime.adapter.start();
}

export async function stopMonitorAdapter(runtime: MonitorRuntime, reason: string): Promise<void> {
  if (!runtime.adapter) return;
  const adapter = runtime.adapter; runtime.adapter = null; adapter.stop(reason);
  await adapter.done?.catch?.(() => {});
}

export async function waitForMonitorState(runtime: MonitorRuntime): Promise<AnyRecord> {
  const timeoutMs = runtime.hardDeadlineMs ? Math.max(0, runtime.hardDeadlineMs - runtime.now()) : null;
  const event = await waitForAny(runtime.eventBus, ['acp.session.state', 'acp.transcript.delta', 'fatal.error'], runtime.identity, {
    signal: runtime.budget?.signal ?? runtime.adapter?.signal, ...(runtime.budget ? { budget: runtime.budget } : {}), timeoutMs,
  });
  if (event?.type === 'fatal.error') return { outcome: { terminal: false, reason: 'monitor_adapter_failed', detail: event.payload?.error ?? 'missing_acp_monitor_adapter_error', state: runtime.previous } };
  return { event, state: monitorStateFromAcpEvent(event) };
}

export async function enforceHardTimeout(runtime: MonitorRuntime): Promise<AnyRecord> {
  const elapsed = Math.round((runtime.now() - runtime.spawnedAt) / 1000);
  await stopMonitorAdapter(runtime, 'hard_timeout');
  const session = runtime.payload.session ?? {};
  const termination = assertValidSessionTerminationResult(await runtime.terminateChild(runtime.childSessionKey, {
    ...runtime.policies, runtime: session.runtime, model: session.model ?? null, agentId: session.agentId ?? null,
    label: firstDefined(session.label, runtime.payload.dispatch_id), graceMs: runtime.killGraceMs,
  }));
  const reason = termination.confirmed ? 'session_timeout_kill_confirmed' : 'session_timeout_kill_unconfirmed';
  const detail = termination.confirmed
    ? `hard timeout reached after ${elapsed}s; explicit termination confirmed as ${termination.state}`
    : `hard timeout reached after ${elapsed}s; explicit termination unconfirmed as ${termination.state} after ${Math.round(termination.graceMs / 1000)}s grace`;
  runtime.logger.warn('MONITOR', detail);
  return { terminal: false, reason, detail, state: runtime.previous, termination };
}

export async function emitMonitorState(runtime: MonitorRuntime, state: AnyRecord): Promise<void> {
  runtime.pollCount += 1;
  runtime.logger.info('MONITOR', `State event #${runtime.pollCount}`, { sessionState: state.sessionState, active: state.sessionActive,
    stalePolls: state.transcriptStalePolls, unknownPolls: state.unknownPolls, terminal: state.terminal });
  await emitPluginEvent(runtime.telemetryContext, 'session_monitor', { module_id: runtime.moduleId, session_key: runtime.childSessionKey,
    agent_type: 'buster', elapsed_seconds: Math.round((runtime.now() - runtime.spawnedAt) / 1000), acp_state: state.sessionState,
    transcript_events: numberValue(state.transcript?.eventCount), rate_limited: state.rateLimited, gateway_unreachable: state.gatewayUnreachable === true });
}

export async function syncGatewayHealth(runtime: MonitorRuntime, state: AnyRecord): Promise<void> {
  if (state.gatewayUnreachable === true && !runtime.gatewayDegradedAt) {
    runtime.gatewayDegradedAt = new Date().toISOString();
    await emitEvent(runtime.telemetryContext, 'observability.degraded', { component: 'acp_monitor', surface: 'gateway', reason: 'gateway_unreachable',
      detail: firstNonEmpty(state.gatewayDetail, state.detail) ?? 'session status unreachable', module_id: runtime.moduleId,
      session_key: runtime.childSessionKey, agent_type: 'buster', degraded_at: runtime.gatewayDegradedAt });
  } else if (state.gatewayUnreachable !== true && runtime.gatewayDegradedAt) {
    const degradedAt = runtime.gatewayDegradedAt; runtime.gatewayDegradedAt = null;
    await emitEvent(runtime.telemetryContext, 'observability.restored', { component: 'acp_monitor', surface: 'gateway', reason: 'gateway_unreachable',
      detail: 'session status reachable again', module_id: runtime.moduleId, session_key: runtime.childSessionKey, agent_type: 'buster',
      degraded_at: degradedAt, restored_at: new Date().toISOString(), restored_after_ms: Math.max(0, Date.now() - new Date(degradedAt).getTime()) });
  }
}

function rateLimitStatus(state: RateLimitState): AnyRecord { return { pause_count: state.pauseCount, max_rate_limit_pauses: state.maxPauses, current_cooldown_s: state.currentCooldownS }; }
function hasRateLimit(state: AnyRecord): boolean { return [state.rateLimited, state.transcript?.rateLimited].includes(true); }
function rateLimitOptions(runtime: MonitorRuntime, state: AnyRecord): RateLimitOptions {
  return { childSessionKey: runtime.childSessionKey, gatewayUrl: runtime.gatewayUrl, gatewayToken: runtime.gatewayToken,
    telemetryCtx: runtime.telemetryContext, moduleId: runtime.moduleId, gateId: runtime.payload.gate_id ?? null,
    gateType: runtime.payload.gate_type ?? null, phase: 'buster', project: runtime.payload.project ?? null,
    attempt: runtime.payload.attempt ?? null, dispatchId: runtime.payload.dispatch_id ?? null,
    gatewayLabel: firstDefined(runtime.payload.session?.label, runtime.payload.dispatch_id), detail: state.detail ?? null,
    provider: 'anthropic', acpMonitorConfig: runtime.monitorConfig, ownsCanonicalSignal: true };
}

function applyRateLimitRecovery(runtime: MonitorRuntime, state: AnyRecord, recovery: AnyRecord): void {
  runtime.previous = { ...state, gatewayUnreachable: [recovery.gatewayUnreachable, state.gatewayUnreachable].includes(true),
    gatewayDetail: firstDefined(recovery.gatewayDetail, state.gatewayDetail), rateLimited: false,
    transcript: state.transcript ? { ...state.transcript, rateLimited: false } : state.transcript };
  startMonitorAdapter(runtime);
}

export async function handleMonitorRateLimit(runtime: MonitorRuntime, state: AnyRecord): Promise<AnyRecord | null> {
  if (!hasRateLimit(state)) return null;
  if (!shouldRetryAfterRateLimit(runtime.rateLimitState)) return { terminal: false, reason: 'rate_limited', detail: state.detail, state,
    max_rate_limit_pauses: runtime.rateLimitState.maxPauses, rate_limit_status: rateLimitStatus(runtime.rateLimitState) };
  await stopMonitorAdapter(runtime, 'rate_limit_cooldown');
  const recovery = await handleRateLimit(runtime.rateLimitState, rateLimitOptions(runtime, state));
  if (recovery.action === 'resume') {
    applyRateLimitRecovery(runtime, state, recovery); return null;
  }
  return { terminal: false, reason: 'rate_limited', detail: state.detail, state, max_rate_limit_pauses: runtime.rateLimitState.maxPauses,
    rate_limit_status: rateLimitStatus(runtime.rateLimitState) };
}

export function terminalOutcome(state: AnyRecord): AnyRecord | null {
  return isSessionTerminal(state) ? { terminal: true, reason: state.reason, detail: state.detail, state } : null;
}
