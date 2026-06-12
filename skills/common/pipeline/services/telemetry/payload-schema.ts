type UnknownRecord = Record<string, any>;
type Validator = (value: any) => boolean;
interface TelemetryPayloadSchema {
  required: Record<string, Validator>;
  optional: Record<string, Validator>;
}

export class TelemetryPayloadInvalidError extends Error {
  code: string;
  eventType: string;
  validationErrors: string[];

  constructor(eventType: string, errors: string[] = []) {
    super(`Invalid telemetry payload for '${eventType}': ${errors.join('; ')}`);
    this.name = 'TelemetryPayloadInvalidError';
    this.code = 'TELEMETRY_PAYLOAD_INVALID';
    this.eventType = eventType;
    this.validationErrors = [...errors];
  }
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optional(validator: Validator): Validator {
  return (value: any) => value === undefined || validator(value);
}

function nullable(validator: Validator): Validator {
  return (value: any) => value === null || value === undefined || validator(value);
}

const string: Validator = (value: any) => typeof value === 'string';
const nonEmptyString: Validator = (value: any) => isNonEmptyString(value);
const number: Validator = (value: any) => isFiniteNumber(value);
const boolean: Validator = (value: any) => typeof value === 'boolean';
const object: Validator = (value: any) => isPlainObject(value);
const array: Validator = (value: any) => Array.isArray(value);
const stringArray: Validator = (value: any) => Array.isArray(value) && value.every((item: any) => typeof item === 'string');
const verdict: Validator = (value: any) => value === 'GO' || value === 'NO-GO';
const any: Validator = () => true;
const arrayOrObject: Validator = (value: any) => Array.isArray(value) || isPlainObject(value);
const jsonScalar: Validator = (value: any) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
function isJsonSafe(value: any, seen: Set<any> = new Set()): boolean {
  if (jsonScalar(value)) return typeof value !== 'number' || Number.isFinite(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    const ok = value.every((item) => isJsonSafe(item, seen));
    seen.delete(value);
    return ok;
  }
  if (!isPlainObject(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const ok = Object.values(value).every((item: any) => item === undefined || isJsonSafe(item, seen));
  seen.delete(value);
  return ok;
}
const jsonObject: Validator = (value: any) => isPlainObject(value) && isJsonSafe(value);

const commonFields: Record<string, Validator> = {
  source: optional(nonEmptyString),
  emitter: optional(nonEmptyString),
};

function schema(required: Record<string, Validator> = {}, optionalFields: Record<string, Validator> = {}): TelemetryPayloadSchema {
  return {
    required,
    optional: { ...commonFields, ...optionalFields },
  };
}

export const TELEMETRY_PAYLOAD_SCHEMAS: Record<string, TelemetryPayloadSchema> = Object.freeze({
  'agent.killed': schema({}, {
    agent_type: nullable(nonEmptyString),
    label: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    has_changes: nullable(boolean),
    duration_seconds: nullable(number),
    files_changed: nullable(stringArray),
    reason: nullable(string),
  }),
  'agent.progress': schema({}, {
    agent_type: nullable(nonEmptyString),
    label: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    elapsed_seconds: nullable(number),
    transcript_events: nullable(number),
    files_touched: nullable(array),
    last_activity: nullable(string),
    status: optional(nonEmptyString),
  }),
  'agent.spawn.requested': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    requester_session_key: nullable(nonEmptyString),
    child_run_id: nullable(nonEmptyString),
    mode: nullable(nonEmptyString),
    spawn_mode: nullable(nonEmptyString),
    thread: nullable(boolean),
    expects_completion_message: nullable(boolean),
    requester_origin: nullable(jsonObject),
    requested_at: nullable(nonEmptyString),
  }),
  'agent.spawned': schema({}, {
    agent_type: nullable(nonEmptyString),
    label: nullable(string),
    model: nullable(nonEmptyString),
    dispatch: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    substep: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    timeout_minutes: nullable(number),
    session_key: nullable(nonEmptyString),
    thinking_level: nullable(nonEmptyString),
  }),
  'agent.delivery.target': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    requester_session_key: nullable(nonEmptyString),
    child_session_key: nullable(nonEmptyString),
    child_run_id: nullable(nonEmptyString),
    spawn_mode: nullable(nonEmptyString),
    expects_completion_message: nullable(boolean),
    requester_origin: nullable(jsonObject),
    targeted_at: nullable(nonEmptyString),
  }),
  'agent.ended': schema({}, {
    agent_type: nullable(nonEmptyString),
    agent_scope: nullable(nonEmptyString),
    label: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    outcome: nullable(nonEmptyString),
    reason: nullable(string),
    duration_seconds: nullable(number),
    final_message_count: nullable(number),
    error: nullable(jsonObject),
    error_message: nullable(string),
    ended_at: nullable(nonEmptyString),
  }),
  'agent.llm.input.summary': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    provider: nullable(nonEmptyString),
    model: nullable(nonEmptyString),
    model_call_id: nullable(nonEmptyString),
    prompt_chars: nullable(number),
    system_prompt_chars: nullable(number),
    history_message_count: nullable(number),
    request: nullable(jsonObject),
    masking_profile: nullable(nonEmptyString),
    masked: nullable(stringArray),
  }),
  'agent.llm.output.summary': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    provider: nullable(nonEmptyString),
    model: nullable(nonEmptyString),
    model_call_id: nullable(nonEmptyString),
    response_chars: nullable(number),
    assistant_response_chars: nullable(number),
    history_message_count: nullable(number),
    usage: nullable(jsonObject),
    input_tokens: nullable(number),
    output_tokens: nullable(number),
    masking_profile: nullable(nonEmptyString),
    masked: nullable(stringArray),
  }),
  'agent.tool.started': schema({ tool_name: nonEmptyString }, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    tool_call_id: nullable(nonEmptyString),
    params_bytes: nullable(number),
    param_keys: nullable(stringArray),
    masking_profile: nullable(nonEmptyString),
    masked: nullable(stringArray),
  }),
  'agent.tool.finished': schema({ tool_name: nonEmptyString }, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    tool_call_id: nullable(nonEmptyString),
    outcome: nullable(nonEmptyString),
    reason: nullable(string),
    duration_seconds: nullable(number),
    result_bytes: nullable(number),
    error: nullable(jsonObject),
    error_message: nullable(string),
    masking_profile: nullable(nonEmptyString),
    masked: nullable(stringArray),
  }),
  'agent.model.started': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    provider: nullable(nonEmptyString),
    model: nullable(nonEmptyString),
    model_call_id: nullable(nonEmptyString),
    request: nullable(jsonObject),
  }),
  'agent.model.ended': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    provider: nullable(nonEmptyString),
    model: nullable(nonEmptyString),
    model_call_id: nullable(nonEmptyString),
    outcome: nullable(nonEmptyString),
    reason: nullable(string),
    duration_seconds: nullable(number),
    usage: nullable(jsonObject),
    input_tokens: nullable(number),
    output_tokens: nullable(number),
    cost_usd: nullable(number),
    error: nullable(jsonObject),
    error_message: nullable(string),
  }),
  'agent.session.started': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    session_id: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    started_at: nullable(nonEmptyString),
  }),
  'agent.session.ended': schema({}, {
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    session_id: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    outcome: nullable(nonEmptyString),
    reason: nullable(string),
    duration_seconds: nullable(number),
    error: nullable(jsonObject),
    error_message: nullable(string),
    ended_at: nullable(nonEmptyString),
  }),
  'agent.transcript': schema({}, {
    agent_type: nullable(nonEmptyString),
    label: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    line_kind: optional(nonEmptyString),
    text: optional(string),
    transcript_offset: nullable(number),
    line_count: nullable(number),
  }),
  'approval.requested': schema({ approval_id: nonEmptyString, prompt: nonEmptyString, options: array }, {
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    gate_title: nullable(string),
    timeout_minutes: nullable(number),
    timeout_policy: optional((value: any) => value === 'BLOCK' || value === 'CONTINUE'),
  }),
  'approval.resolved': schema({ approval_id: nonEmptyString }, {
    module_id: nullable(nonEmptyString),
    choice: nullable(string),
    resolved_by: nullable(string),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    status: nullable(string),
    decision_by: nullable(string),
  }),
  'budget.exceeded': schema({ threshold: any, current: number, limit: number, unit: nonEmptyString }, {
    current_cost_usd: nullable(number),
    budget_usd: nullable(number),
    percent_used: nullable(number),
  }),
  'budget.warning': schema({ threshold: any, current: number, limit: number, unit: nonEmptyString }, {
    current_cost_usd: nullable(number),
    budget_usd: nullable(number),
    percent_used: nullable(number),
  }),
  'cost.update': schema({}, {
    module_id: nullable(nonEmptyString),
    agent_type: nullable(nonEmptyString),
    label: nullable(string),
    cost_usd: nullable(number),
    total_cost_usd: nullable(number),
    input_tokens: nullable(number),
    output_tokens: nullable(number),
    gate_id: nullable(nonEmptyString),
    model: nullable(nonEmptyString),
    estimated_cost_usd: nullable(number),
    cumulative_cost_usd: nullable(number),
    tokens_in: nullable(number),
    tokens_out: nullable(number),
  }),
  'error.escalation': schema({}, {
    terminal_status: nullable(nonEmptyString),
    terminal_decision: nullable(jsonObject),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    fail_count: nullable(number),
    last_failure: nullable(string),
    action: nullable(nonEmptyString),
    step_type: nullable(nonEmptyString),
    step_id: nullable(nonEmptyString),
  }),
  'gate.started': schema({ gate_id: nonEmptyString }, {
    gate_type: nullable(nonEmptyString),
    title: nullable(string),
    reviewers: nullable(arrayOrObject),
  }),
  'gate.verdict': schema({ gate_id: nonEmptyString, verdict }, {
    run_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    issues_count: nullable(number),
    blockers_count: nullable(number),
    fix_cycle: nullable(number),
    duration_seconds: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    reason: nullable(string),
    gateway_label: nullable(string),
  }),
  'module.started': schema({ module_id: nonEmptyString }, {
    model: nullable(nonEmptyString),
    attempt: nullable(number),
  }),
  'module.status_changed': schema({ module_id: nonEmptyString }, {
    title: nullable(string),
    old_status: nullable(string),
    new_status: nullable(string),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    phase: nullable(nonEmptyString),
    model: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    duration_seconds: nullable(number),
    cost_estimate_usd: nullable(number),
    commit_hash: nullable(nonEmptyString),
    reason: nullable(string),
  }),
  'observability.degraded': schema({ component: nonEmptyString, surface: nonEmptyString, reason: nonEmptyString }, {
    detail: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    gateway_label: nullable(string),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    agent_type: nullable(nonEmptyString),
    impacted_event_type: nullable(nonEmptyString),
    stream_key: nullable(nonEmptyString),
    degraded_at: nullable(nonEmptyString),
    hook_id: nullable(nonEmptyString),
    stage_id: nullable(nonEmptyString),
    validation_errors: nullable(array),
    stdout: nullable(string),
    error: nullable(string),
    authorization: nullable(string),
    payload: nullable(object),
    transcript: nullable(arrayOrObject),
  }),
  'observability.restored': schema({ component: nonEmptyString, surface: nonEmptyString, reason: nonEmptyString }, {
    detail: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    gateway_label: nullable(string),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    agent_type: nullable(nonEmptyString),
    impacted_event_type: nullable(nonEmptyString),
    stream_key: nullable(nonEmptyString),
    hook_id: nullable(nonEmptyString),
    stage_id: nullable(nonEmptyString),
    validation_errors: nullable(array),
    stdout: nullable(string),
    error: nullable(string),
    authorization: nullable(string),
    payload: nullable(object),
    transcript: nullable(arrayOrObject),
    degraded_at: nullable(nonEmptyString),
    restored_at: nullable(nonEmptyString),
    restored_after_ms: nullable(number),
  }),
  'phase.completed': schema({ module_id: nonEmptyString, phase: nonEmptyString }),
  'phase.started': schema({ module_id: nonEmptyString, phase: nonEmptyString }, {
    model: nullable(nonEmptyString),
  }),
  'pipeline.completed': schema({ terminal_status: nonEmptyString }, {
    reason_code: nullable(string),
    duration_seconds: nullable(number),
    modules_passed: nullable(number),
    modules_failed: nullable(number),
    modules_total: nullable(number),
    total_cost_usd: nullable(number),
  }),
  'pipeline.halted': schema({ reason: nonEmptyString }, {
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    terminal_status: nullable(nonEmptyString),
    terminal_decision: nullable(jsonObject),
    rate_limit_exhausted: nullable(boolean),
    max_rate_limit_pauses: nullable(number),
    step_type: nullable(nonEmptyString),
    step_id: nullable(nonEmptyString),
  }),
  'plugin.event': schema({ plugin_id: nonEmptyString, plugin_event: nonEmptyString, details: jsonObject }, {
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    agent_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    status: nullable(nonEmptyString),
    outcome: nullable(nonEmptyString),
    reason: nullable(string),
    severity: nullable(nonEmptyString),
    duration_seconds: nullable(number),
  }),
  'pipeline.started': schema({ modules: array, gates: array, execution_order: array, resume: boolean }, {
    models: nullable(object),
    nova_prompt: nullable(string),
  }),
  'rate_limit.detected': schema({}, {
    run_id: nullable(nonEmptyString),
    agent_type: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    gateway_label: nullable(string),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    provider: nullable(nonEmptyString),
    retry_after_seconds: nullable(number),
    pause_count: nullable(number),
    max_pauses: nullable(number),
    cooldown_ms: nullable(number),
    resume_at: nullable(nonEmptyString),
    detail: nullable(string),
  }),
  'retry.exhausted': schema({}, {
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    attempt: nullable(number),
    phase: nullable(nonEmptyString),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    session_key: nullable(nonEmptyString),
    reason: nullable(string),
    max_attempts: nullable(number),
    max_fails: nullable(number),
  }),
  'retry.scheduled': schema({ module_id: nonEmptyString }, {
    attempt: nullable(number),
    max_attempts: nullable(number),
    delay_seconds: nullable(number),
    reason: nullable(string),
    dispatch_id: nullable(nonEmptyString),
    gateway_label: nullable(string),
    session_key: nullable(nonEmptyString),
    max_fails: nullable(number),
  }),
  'system.io_warning': schema({ component: nonEmptyString, surface: nonEmptyString, reason: nonEmptyString, operation: nonEmptyString, path: nonEmptyString }, {
    path_role: nullable(nonEmptyString),
    detail: nullable(string),
    code: nullable(nonEmptyString),
    errno: nullable(number),
    syscall: nullable(nonEmptyString),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    warning_at: nullable(nonEmptyString),
  }),
  'summary.completed': schema({ summary_type: nonEmptyString }, {
    gateway_label: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    status: nullable(string),
    reason: nullable(string),
    model: nullable(nonEmptyString),
    runtime: nullable(nonEmptyString),
    output: nullable(string),
    output_path: nullable(string),
    output_dir: nullable(string),
    markdown_path: nullable(string),
    data_path: nullable(string),
    case_study_base_path: nullable(string),
    summary_json_path: nullable(string),
    pipeline_summary_path: nullable(string),
    latest_json_path: nullable(string),
    terminal_status: nullable(nonEmptyString),
    terminal_decision: nullable(jsonObject),
    reason_code: nullable(string),
  }),
  'summary.started': schema({ summary_type: nonEmptyString }, {
    gateway_label: nullable(string),
    module_id: nullable(nonEmptyString),
    gate_id: nullable(nonEmptyString),
    gate_type: nullable(nonEmptyString),
    session_key: nullable(nonEmptyString),
    attempt: nullable(number),
    dispatch_id: nullable(nonEmptyString),
    status: nullable(string),
    model: nullable(nonEmptyString),
    runtime: nullable(nonEmptyString),
    output_dir: nullable(string),
    terminal_status: nullable(nonEmptyString),
    terminal_decision: nullable(jsonObject),
    reason_code: nullable(string),
  }),
});

export const TELEMETRY_PAYLOAD_EVENT_TYPES: readonly string[] = Object.freeze(Object.keys(TELEMETRY_PAYLOAD_SCHEMAS).sort());

export function validateTelemetryEventPayload(eventType: string, payload: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(eventType)) errors.push('eventType must be a non-empty string');
  if (!isPlainObject(payload)) {
    errors.push('payload must be an object');
    return errors;
  }

  const eventSchema = TELEMETRY_PAYLOAD_SCHEMAS[eventType];
  if (!eventSchema) {
    errors.push(`eventType '${eventType}' is not registered in TELEMETRY_PAYLOAD_SCHEMAS`);
    return errors;
  }

  const required = eventSchema.required || {};
  const optionalFields = eventSchema.optional || {};
  const allowed = new Set([...Object.keys(required), ...Object.keys(optionalFields)]);

  for (const [field, validator] of Object.entries(required)) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      errors.push(`${field} is required`);
    } else if (!validator(payload[field])) {
      errors.push(`${field} has invalid type or value`);
    }
  }

  for (const [field, value] of Object.entries(payload)) {
    if (!allowed.has(field)) {
      errors.push(`${field} is not allowed for ${eventType}`);
      continue;
    }
    const optionalValidator = optionalFields[field];
    if (!Object.prototype.hasOwnProperty.call(required, field) && typeof optionalValidator === 'function' && !optionalValidator(value)) {
      errors.push(`${field} has invalid type or value`);
    }
  }

  return errors;
}

export function assertTelemetryEventPayload(eventType: string, payload: unknown = {}): UnknownRecord {
  const errors = validateTelemetryEventPayload(eventType, payload);
  if (errors.length > 0) throw new TelemetryPayloadInvalidError(eventType, errors);
  return payload as UnknownRecord;
}


const PLUGIN_EVENT_TOP_LEVEL_FIELDS = new Set<string>([
  'module_id',
  'gate_id',
  'gate_type',
  'agent_type',
  'session_key',
  'attempt',
  'dispatch_id',
  'gateway_label',
  'status',
  'outcome',
  'reason',
  'severity',
  'duration_seconds',
]);

export function buildPluginTelemetryPayload(pluginId: string, pluginEvent: string, data: unknown = {}): UnknownRecord {
  const payload: UnknownRecord = {
    plugin_id: pluginId,
    plugin_event: pluginEvent,
    details: {} as UnknownRecord,
  };
  const source = isPlainObject(data) ? data : { value: data };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (PLUGIN_EVENT_TOP_LEVEL_FIELDS.has(key)) {
      payload[key] = value;
    } else if (key === 'details' && isPlainObject(value)) {
      payload.details = { ...payload.details, ...value };
    } else {
      payload.details[key] = value;
    }
  }
  return payload;
}
