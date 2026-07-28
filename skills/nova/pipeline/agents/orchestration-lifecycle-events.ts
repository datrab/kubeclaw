import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

export function telemetryModuleId(opts: AnyRecord = {}, fallback: string | null = null) {
  return Object.prototype.hasOwnProperty.call(opts, 'module_id') ? opts.module_id : fallback;
}

function buildSpawnTelemetryPayload({
  label,
  model,
  dispatch,
  moduleId = null,
  gateId = null,
  gateType = null,
  substep = null,
  attempt = null,
  dispatchId = null,
  timeoutSeconds = null,
  sessionKey = null,
  thinkingLevel = null,
}: AnyRecord = {}) {
  return {
    label,
    model,
    dispatch,
    module_id: moduleId,
    gate_id: gateId,
    gate_type: gateType,
    substep,
    attempt,
    dispatch_id: dispatchId,
    timeout_minutes: timeoutSeconds ? Math.round(timeoutSeconds / 60) : null,
    session_key: sessionKey,
    thinking_level: thinkingLevel,
  };
}

function optionalKillTelemetryFields(entry: AnyRecord | null): AnyRecord {
  return {
    gate_type: entry?.telemetry_gate_type ?? null,
    session_key: entry?.sessionKey ?? null,
    attempt: entry?.telemetry_attempt ?? null,
    dispatch_id: entry?.telemetry_dispatch_id ?? null,
  };
}

function killChangeFields(filesChanged: unknown, baselineTracked: boolean): AnyRecord {
  if (filesChanged === undefined && !baselineTracked) return {};
  return {
    has_changes: baselineTracked ? filesChanged !== null : null,
    files_changed: filesChanged,
  };
}

function buildKillTelemetryPayload({
  entry = null,
  fallbackLabel = null,
  fallbackModuleId = null,
  fallbackGateId = null,
  filesChanged = undefined,
  baselineTracked = false,
}: AnyRecord = {}) {
  const label = entry?.gatewayLabel ?? fallbackLabel;
  const moduleId = entry?.telemetry_module_id ?? fallbackModuleId;
  const gateId = entry?.telemetry_gate_id ?? fallbackGateId;
  const payload: AnyRecord = {
    label,
    module_id: moduleId,
    gate_id: gateId,
    ...optionalKillTelemetryFields(entry),
    ...killChangeFields(filesChanged, baselineTracked),
  };
  return payload;
}
