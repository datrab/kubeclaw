import { selectTruthyValue } from '../optional-absence.ts';
import { getRunId } from '../core/runtime.ts';
import { buildDiscordIdentitySurfaceFields } from '../services/discord-fields.ts';

function firstDefined(...values: any[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function requiredMessage(messages: any, key: string, context: any) {
  const value = messages?.[key];
  if (typeof value === 'function') return value(context);
  if (typeof value === 'string') return value;
  throw new Error(`Gate fix-cycle message '${key}' is required`);
}

export function createGateForgeFixContext(input: any) {
  const normalized = {
    ...input,
    issues: input.issues ?? [],
    fixHistory: input.fixHistory ?? [],
    initialCorrelation: input.initialCorrelation ?? {},
    buildActiveSessionExtra: input.buildActiveSessionExtra ?? (() => ({})),
    buildNextControlResult: input.buildNextControlResult ?? (() => input.controlResult),
    includeControlResultOnSuccess: input.includeControlResultOnSuccess ?? true,
  };
  const correlation = {
    sessionKey: normalized.initialCorrelation.sessionKey ?? null,
    gatewayLabel: normalized.initialCorrelation.gatewayLabel ?? null,
    dispatchId: normalized.initialCorrelation.dispatchId ?? null,
  };
  const snapshot = () => ({
    dispatch_id: correlation.dispatchId,
    gateway_label: correlation.gatewayLabel,
    session_key: correlation.sessionKey,
  });
  const identity = (overrides: any = {}) => ({
    run_id: selectTruthyValue(() => getRunId(input.config), () => 'missing_run_id'),
    gate_id: input.gateId,
    gate_type: input.gate?.type,
    attempt: firstDefined(overrides.attempt, input.cycle),
    dispatch_id: firstDefined(overrides.dispatch_id, snapshot().dispatch_id),
    gateway_label: firstDefined(overrides.gateway_label, snapshot().gateway_label),
    session_key: firstDefined(overrides.session_key, snapshot().session_key),
  });
  const base = { ...normalized, correlation, snapshot, identity };
  const msg = (key: string, overrides: any = {}) => requiredMessage(normalized.messages, key, { ...base, ...overrides });
  const fields = (overrides: any = {}, extra: any[] = []) => buildDiscordIdentitySurfaceFields(normalized.discordIdentitySurface, identity(overrides), extra);
  const send = (level: any, titleKey: string, descriptionKey: string, overrides: any = {}, fieldOverrides: any = {}, extraFields: any[] = []) =>
    normalized.deps.discord(normalized.config, level, msg(titleKey, overrides), msg(descriptionKey, overrides), fields(fieldOverrides, extraFields), { correlation: identity(fieldOverrides) });
  const emitFailure = (reasonKey: string, overrides: any = {}) => normalized.emitFixCycleFail(
    normalized.config, normalized.gateId, normalized.gate.type, normalized.cycle, normalized.gateStartedAt, msg(reasonKey, overrides),
    { issues_count: normalized.issues.length, session_key: snapshot().session_key },
  );
  return { ...base, msg, fields, send, emitFailure };
}

export function updateGateForgeFixCorrelation(ctx: any, next: any) {
  ctx.correlation.sessionKey = selectTruthyValue(() => next.sessionKey, () => null);
  ctx.correlation.gatewayLabel = selectTruthyValue(() => next.gatewayLabel, () => null);
  ctx.correlation.dispatchId = selectTruthyValue(() => next.dispatchId, () => null);
}
