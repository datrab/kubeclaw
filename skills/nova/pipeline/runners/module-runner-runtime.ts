import { STATUS } from '../core/constants.ts';
import { getActiveContext } from '../core/logger.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { resolveResultSessionKey, resolveStatusDispatchId, resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { onModuleBlocked, onModuleFail, onRetryExhausted } from '../services/telemetry.ts';
import { selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstText(...values: unknown[]) {
  for (const value of values) { const candidate = text(value); if (candidate) return candidate; }
  return null;
}

function required(value: unknown, label: string) {
  const candidate = text(value);
  if (!candidate) throw new Error(`${label}: required non-empty string`);
  return candidate;
}

export function _telemetryCtx(config: AnyRecord, deps: AnyRecord | null = null) {
  const active = getActiveContext();
  return { ...selectTruthyValue(() => active, () => ({ config, runId: required(getRunId(config), 'run_id'), stats: { errors: [] } })), deps };
}

export function computeElapsedSeconds(fromIso: unknown, toIso: any = new Date().toISOString()) {
  if (!fromIso) return 0;
  const delta = new Date(String(toIso)).getTime() - new Date(String(fromIso)).getTime();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : 0;
}

export function getAttemptStartedAt(status: AnyRecord) {
  if (status?.attempt_started_at) return status.attempt_started_at;
  return status?.started_at ?? null;
}

export function getPhaseStartedAt(status: AnyRecord) {
  return selectTruthyValue(() => status?.phase_started_at, () => getAttemptStartedAt(status));
}

export function formatDurationCompact(seconds: unknown) {
  const numeric = Number(seconds);
  const total = Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return secs ? `${hours}h ${minutes}m ${secs}s` : `${hours}h ${minutes}m`;
  return secs ? `${minutes}m ${secs}s` : `${minutes}m`;
}

export function currentAttemptNumber(status: AnyRecord) {
  const failCount = Number(status?.fail_count);
  return (Number.isFinite(failCount) && failCount >= 0 ? Math.floor(failCount) : 0) + 1;
}

export function ensureValidationState(status: AnyRecord) {
  const attempt = currentAttemptNumber(status);
  if (selectTruthyValue(() => !status.validation, () => status.validation.attempt !== attempt)) status.validation = {
    attempt, delivery_lint_passed: false, delivery_lint_passed_at: null,
    pre_check_passed: false, pre_check_passed_at: null,
  };
  return status.validation;
}

export function markValidationPassed(status: AnyRecord, key: string) {
  const validation = ensureValidationState(status);
  validation[key] = true;
  validation[`${key}_at`] = new Date().toISOString();
}

function terminalEvent(status: AnyRecord, mod: AnyRecord, phase: unknown, model: unknown, oldStatus: unknown, reason: unknown, correlation: AnyRecord) {
  const dispatchId = correlation.dispatchId ?? resolveStatusDispatchId(status);
  const gatewayLabel = correlation.gatewayLabel ?? resolveStatusGatewayLabel(status);
  const sessionKey = correlation.sessionKey ?? resolveStatusSessionKey(status);
  const statusValue = oldStatus !== undefined ? oldStatus : status.status;
  return {
    title: firstText(mod.title, status.title), old_status: statusValue,
    attempt: currentAttemptNumber(status), phase: firstText(phase, status.current_phase),
    model: firstText(model, status.active_agent?.model),
    dispatch_id: required(dispatchId, 'module fail dispatchId'),
    gateway_label: required(gatewayLabel, 'module fail gatewayLabel'),
    session_key: required(sessionKey, 'module fail sessionKey'),
    duration_seconds: computeElapsedSeconds(getPhaseStartedAt(status)), cost_estimate_usd: null,
    commit_hash: firstText(status.commit_hash, status.forge_commit_hash, status.buster_commit_hash, status.forge_commit, status.buster_commit),
    reason: reason ?? null,
  };
}

export function buildTerminalBusterCrashFailEvent(status: AnyRecord, mod: AnyRecord, model: unknown, oldStatus: unknown, reason: unknown, correlation: AnyRecord = {}) {
  return { ...terminalEvent(status, mod, 'buster', model, oldStatus, reason, correlation), phase: 'buster' };
}

export function emitTerminalModuleFailTelemetry(input: AnyRecord) {
  const event = terminalEvent(input.status, input.mod, input.phase, input.model, input.oldStatus, input.reason, selectTruthyValue(() => input.correlation, () => ({})));
  onModuleFail(_telemetryCtx(input.config, selectTruthyValue(() => input.explicitDeps, () => null)), input.moduleId, event);
}

export async function emitTerminalBusterCrashTelemetry(config: AnyRecord, moduleId: string, event: AnyRecord, blockedReason: unknown, retryBudget: unknown, explicitDeps: AnyRecord | null = null) {
  const ctx = _telemetryCtx(config, explicitDeps);
  await onModuleFail(ctx, moduleId, event);
  await onRetryExhausted(ctx, moduleId, {
    attempt: event?.attempt ?? null, phase: firstText(event?.phase), dispatch_id: event?.dispatch_id ?? null,
    gateway_label: event?.gateway_label ?? null, session_key: resolveResultSessionKey(event),
    max_attempts: retryBudget ?? null, max_fails: retryBudget ?? null, reason: event?.reason ?? blockedReason,
  });
  await onModuleBlocked(ctx, moduleId, { ...event, old_status: STATUS.FAIL, reason: blockedReason ?? event?.reason });
}

export function setLogScope(moduleId: unknown, phase: unknown) {
  const ctx = getActiveContext();
  if (!ctx) return;
  if (moduleId !== undefined) ctx._logModule = moduleId === null ? null : String(moduleId);
  if (phase !== undefined) ctx._logPhase = phase === null ? null : String(phase);
}

export function getModuleStats(config: AnyRecord) {
  return getRunStats(config);
}
