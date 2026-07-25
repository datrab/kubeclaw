import { STATUS } from '../core/constants.ts';
import { buildModuleSessionRateLimitStatus, getRateLimitConfig, processSessionRateLimit } from '../services/rate-limit.ts';
import { resolveStatusDispatchId, resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { selectDefinedValue } from '../optional-absence.ts';

export type AnyRecord = Record<string, any>;

const ACP_STARTUP_RATE_LIMIT_EXHAUSTED = 'ACP startup rate limit pauses exhausted';
const ACP_STARTUP_RATE_LIMITED = 'ACP startup rate limited';

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

export function requireNonEmptyString(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized) throw new Error(`module worker requires ${field}`);
  return normalized;
}

export function objectRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

export function requireObjectRecord(value: unknown, field: string): AnyRecord {
  const record = objectRecord(value);
  if (Object.keys(record).length === 0) throw new Error(`module worker requires ${field}`);
  return record;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

export function isJsonParseFailure(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const message = errorMessage(error).toLowerCase();
  return message.includes('json') && ['parse', 'unexpected', 'expected', 'property name'].some((part) => message.includes(part));
}

export function retryableStartupFailure(error: AnyRecord | null = null) {
  const reason = typeof error?.reason === 'string' ? error.reason.trim().toLowerCase() : '';
  return error?.observability_required === true || reason === 'missing_agent_observability_startup_evidence';
}

export function normalizeHealthCheckResult(result: unknown): AnyRecord {
  if (result && typeof result === 'object') return result as AnyRecord;
  return { ok: result === true };
}

export function requireWorkerDependency(deps: AnyRecord, name: string) {
  const dependency = deps?.[name];
  if (typeof dependency !== 'function') throw new Error(`module worker requires deps.${name}`);
  return dependency;
}

export function isResumedBusterDispatch(status: AnyRecord | null, dispatchId: string | null): boolean {
  return status?.status === STATUS.TESTING
    && status?.current_phase === 'buster'
    && normalizeString(dispatchId) !== null
    && normalizeString(resolveStatusDispatchId(status)) === normalizeString(dispatchId);
}

export function resumedBusterDispatch(
  status: AnyRecord,
  workerInput: AnyRecord,
  runId: string | null,
  attempt: number | null,
  dispatchId: string | null,
): AnyRecord {
  const active = objectRecord(status.active_agent);
  const backend = objectRecord(workerInput?.worker?.backendConfig);
  return {
    label: dispatchId,
    session_key: normalizeString(resolveStatusSessionKey(status)),
    stream_log_path: normalizeString(active.stream_log_path),
    gateway_label: normalizeString(resolveStatusGatewayLabel(status)),
    dispatch_id: dispatchId,
    run_id: runId,
    attempt,
    runtime: normalizeString(active.runtime),
    model: normalizeString(active.model) || normalizeString(backend.model),
    model_source: normalizeString(active.model_source) || normalizeString(backend.modelSource),
    reasoning_level: normalizeString(active.reasoning_level) || normalizeString(backend.reasoningLevel),
    thinking_source: normalizeString(active.thinking_source) || normalizeString(backend.thinkingSource),
    agent_id: normalizeString(active.agent_id),
    phase: 'buster',
    resumed: true,
  };
}

function rateLimitStatus(input: AnyRecord, health: AnyRecord) {
  return buildModuleSessionRateLimitStatus({
    ...objectRecord(health.status),
    module_id: input.moduleId,
    run_id: input.runId,
    attempt: input.attempt,
    dispatch_id: selectDefinedValue(() => (input.dispatchId), () => (null)),
    gateway_label: selectDefinedValue(() => (health.gatewayLabel), () => (null)),
    session_key: selectDefinedValue(() => (health.sessionKey), () => (null)),
    detail: selectDefinedValue(() => (health.detail), () => (null)),
    reason: 'rate_limited',
  }, {
    moduleId: input.moduleId,
    phase: input.phase,
    identity: objectRecord(health.identity),
  });
}

function rateLimitResult(rateLimitStep: AnyRecord, health: AnyRecord, pauseCount: number, maxPauses: number) {
  const exhausted = rateLimitStep.exhausted === true;
  return {
    reason: exhausted ? 'rate_limit_exhausted' : 'rate_limited',
    nextAction: exhausted ? 'block' : 'retry',
    issueType: 'environment',
    outcomeClass: exhausted ? 'rate_limited' : 'retrying',
    failureClass: exhausted ? 'rate_limit_exhausted' : 'rate_limited',
    rateLimitStatus: requireObjectRecord(rateLimitStep.status, 'rateLimitStep.status'),
    rateLimitPauses: pauseCount,
    maxRateLimitPauses: maxPauses,
    error: (typeof health.detail === 'string' && health.detail)
      || (exhausted ? ACP_STARTUP_RATE_LIMIT_EXHAUSTED : ACP_STARTUP_RATE_LIMITED),
  };
}

export async function processStartupRateLimit(input: AnyRecord, health: AnyRecord = {}) {
  const status = rateLimitStatus(input, health);
  const maxPauses = getRateLimitConfig(input.config).max_pauses_per_module;
  const priorPauseCount = Number(input.workerInput?.executionContext?.startupRateLimitPauseCount);
  const pauseCount = (Number.isFinite(priorPauseCount) && priorPauseCount >= 0 ? priorPauseCount : 0) + 1;
  const rateLimitStep = await processSessionRateLimit(input.config, status, {
    pauseCount,
    maxPauses,
    normalizeStatus: (value: AnyRecord = {}) => rateLimitStatus(input, { ...health, status: value }),
    pauseLogMessage: ({ pauseCount: count, maxPauses: max, cooldownHours, resumeAt }: AnyRecord) =>
      `[${input.phase}-${input.moduleId}] ACP startup rate limited (pause ${count}/${max}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
    resumeLogMessage: () => `[${input.phase}-${input.moduleId}] ACP startup rate limit cooldown complete — retrying spawn`,
  });
  return rateLimitResult(rateLimitStep, health, pauseCount, maxPauses);
}
