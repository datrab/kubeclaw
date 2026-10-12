import { ingressComplexityError } from './complexity.ts';
export { AGENT_OBSERVABILITY_MAX_JSON_DEPTH, AGENT_OBSERVABILITY_MAX_JSON_NODES } from './complexity.ts';
import {
  AGENT_OBSERVABILITY_HOOKS,
  AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES,
  AGENT_OBSERVABILITY_SCHEMA_VERSION,
  AGENT_OBSERVABILITY_SOURCE,
} from './constants.ts';
import type {
  AgentObservabilityHistoryMessageV1,
  AgentObservabilityIngressEventType,
  AgentObservabilityIngressEventV1,
  AgentObservabilityJsonValue,
  AgentObservabilityValidationResult,
} from './types.ts';

const TYPE_TO_HOOK: Record<AgentObservabilityIngressEventType, string> = Object.freeze({
  'openclaw.agent.ended': 'agent_end',
  'openclaw.llm.input': 'llm_input',
  'openclaw.llm.output': 'llm_output',
  'openclaw.subagent.spawned': 'subagent_spawned',
  'openclaw.subagent.delivery_target': 'subagent_delivery_target',
  'openclaw.subagent.ended': 'subagent_ended',
  'openclaw.tool.started': 'before_tool_call',
  'openclaw.tool.finished': 'after_tool_call',
  'openclaw.model.started': 'model_call_started',
  'openclaw.model.ended': 'model_call_ended',
  'openclaw.model.usage': 'model_usage',
  'openclaw.session.started': 'session_start',
  'openclaw.session.ended': 'session_end',
});

const IDENTITY_FIELDS = Object.freeze([
  'run_id',
  'project',
  'session_key',
  'session_id',
  'gateway_label',
  'dispatch_id',
  'agent_id',
  'agent_type',
  'module_id',
  'gate_id',
  'attempt',
  'tool_call_id',
  'model_call_id',
  'parent_session_key',
  'child_session_key',
]);
// Agent timestamps originate from ECMAScript clocks. This ingress profile
// accepts RFC 3339 date/time and offset syntax but deliberately excludes
// leap-second notation, which ECMAScript cannot represent or validate.
const RFC3339_INGRESS_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/iu;
const DAYS_IN_MONTH = Object.freeze([0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

export class AgentObservabilityContractError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(`Invalid agent observability ingress event: ${errors.join('; ')}`);
    this.name = 'AgentObservabilityContractError';
    this.errors = [...errors];
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isJsonSafe(value: unknown, seen = new Set<object>()): value is AgentObservabilityJsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) && !isPlainObject(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const ok = Array.isArray(value)
    ? value.every((item) => isJsonSafe(item, seen))
    : Object.values(value).every((item) => item !== undefined && isJsonSafe(item, seen));
  seen.delete(value);
  return ok;
}

function validateTimestamp(value: unknown, errors: string[]): void {
  if (!isNonEmptyString(value)) {
    errors.push('ts must be a non-empty ISO timestamp string');
    return;
  }
  const match = RFC3339_INGRESS_TIMESTAMP.exec(value);
  if (!match) {
    errors.push('ts must be an RFC 3339 timestamp without leap-second notation');
    return;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maximumDay = month === 2 && leapYear ? 29 : (DAYS_IN_MONTH[month] ?? 0);
  if (day < 1 || day > maximumDay || !Number.isFinite(Date.parse(value))) {
    errors.push('ts must be an RFC 3339 timestamp without leap-second notation');
  }
}

function validateIdentity(identity: unknown, errors: string[]): void {
  if (!isPlainObject(identity)) {
    errors.push('identity must be an object');
    return;
  }
  for (const [key, value] of Object.entries(identity)) {
    if (!IDENTITY_FIELDS.includes(key)) errors.push(`identity.${key} is not allowed`);
    if (key === 'attempt' && value !== undefined && value !== null && (!Number.isInteger(value) || Number(value) < 1)) {
      errors.push('identity.attempt must be a positive integer when present');
    } else if (key !== 'attempt' && value !== undefined && value !== null && !isNonEmptyString(value)) {
      errors.push(`identity.${key} must be a non-empty string when present`);
    }
  }
}

function validateHistoryMessages(value: unknown, field: string, errors: string[], required: boolean): void {
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (!isPlainObject(item)) {
      errors.push(`${field}[${index}] must be an object`);
      continue;
    }
    const message = item as Partial<AgentObservabilityHistoryMessageV1>;
    if (!('content' in message)) errors.push(`${field}[${index}].content is required`);
    if ('content' in message && !isJsonSafe(message.content)) errors.push(`${field}[${index}].content must be JSON-safe`);
    for (const stringField of ['role', 'name', 'tool_call_id']) {
      const stringValue = item[stringField];
      if (stringValue !== undefined && stringValue !== null && !isNonEmptyString(stringValue)) {
        errors.push(`${field}[${index}].${stringField} must be a non-empty string when present`);
      }
    }
    if (item.metadata !== undefined && !isJsonSafe(item.metadata)) errors.push(`${field}[${index}].metadata must be JSON-safe`);
  }
}

function requireJsonField(payload: Record<string, unknown>, field: string, errors: string[]): void {
  if (!(field in payload)) {
    errors.push(`payload.${field} is required`);
    return;
  }
  if (!isJsonSafe(payload[field])) errors.push(`payload.${field} must be JSON-safe`);
}

function optionalJsonField(payload: Record<string, unknown>, field: string, errors: string[]): void {
  if (field in payload && !isJsonSafe(payload[field])) errors.push(`payload.${field} must be JSON-safe`);
}

function optionalStringField(payload: Record<string, unknown>, field: string, errors: string[]): void {
  const value = payload[field];
  if (value !== undefined && value !== null && !isNonEmptyString(value)) {
    errors.push(`payload.${field} must be null or a non-empty string`);
  }
}

function optionalNumberField(payload: Record<string, unknown>, field: string, errors: string[]): void {
  const value = payload[field];
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    errors.push(`payload.${field} must be null or a finite number`);
  }
}

type PayloadValidator = (payload: Record<string, unknown>, errors: string[]) => void;
const strings = (payload: Record<string, unknown>, errors: string[], fields: readonly string[]): void => fields.forEach((field) => optionalStringField(payload, field, errors));
const json = (payload: Record<string, unknown>, errors: string[], fields: readonly string[]): void => fields.forEach((field) => optionalJsonField(payload, field, errors));
const numbers = (payload: Record<string, unknown>, errors: string[], fields: readonly string[]): void => fields.forEach((field) => optionalNumberField(payload, field, errors));
const validateLlmInput: PayloadValidator = (payload, errors) => {
  requireJsonField(payload, 'prompt', errors); strings(payload, errors, ['system_prompt', 'provider', 'model']);
  validateHistoryMessages(payload.history_messages, 'payload.history_messages', errors, true); json(payload, errors, ['request']);
};
const validateLlmOutput: PayloadValidator = (payload, errors) => {
  requireJsonField(payload, 'response', errors); strings(payload, errors, ['assistant_response', 'provider', 'model']);
  json(payload, errors, ['assistant_message', 'usage']); validateHistoryMessages(payload.history_messages, 'payload.history_messages', errors, false);
};
const validateToolStarted: PayloadValidator = (payload, errors) => {
  if (!isNonEmptyString(payload.tool_name)) errors.push('payload.tool_name must be a non-empty string'); requireJsonField(payload, 'params', errors);
};
const validateToolFinished: PayloadValidator = (payload, errors) => {
  if (!isNonEmptyString(payload.tool_name)) errors.push('payload.tool_name must be a non-empty string');
  json(payload, errors, ['params', 'result', 'error']); numbers(payload, errors, ['duration_ms']); strings(payload, errors, ['outcome']);
};
const validateAgentEnded: PayloadValidator = (payload, errors) => {
  strings(payload, errors, ['outcome', 'reason']); json(payload, errors, ['error']); numbers(payload, errors, ['duration_ms']);
  validateHistoryMessages(payload.final_messages, 'payload.final_messages', errors, false);
};
const validateModelStarted: PayloadValidator = (payload, errors) => { strings(payload, errors, ['provider', 'model']); json(payload, errors, ['request']); };
const validateModelEnded: PayloadValidator = (payload, errors) => { strings(payload, errors, ['provider', 'model', 'outcome']); json(payload, errors, ['error', 'usage']); numbers(payload, errors, ['duration_ms']); };
const validateModelUsage: PayloadValidator = (payload, errors) => { strings(payload, errors, ['provider', 'model']); numbers(payload, errors, ['cost_usd', 'duration_ms']); json(payload, errors, ['context', 'usage']); };
const validateSession: PayloadValidator = (payload, errors) => { strings(payload, errors, ['session_key', 'session_id', 'outcome', 'reason']); json(payload, errors, ['error']); numbers(payload, errors, ['duration_ms']); };
const validateSubagent: PayloadValidator = (payload, errors) => {
  strings(payload, errors, ['child_session_key', 'child_session_id', 'agent_id', 'requester_session_key', 'child_run_id', 'mode', 'spawn_mode', 'outcome', 'reason']);
  json(payload, errors, ['error', 'requester_origin']); numbers(payload, errors, ['duration_ms']);
  for (const field of ['thread', 'expects_completion_message']) {
    if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== 'boolean') errors.push(`payload.${field} must be null or a boolean`);
  }
};
const validators: Record<AgentObservabilityIngressEventType, PayloadValidator> = {
  'openclaw.llm.input': validateLlmInput, 'openclaw.llm.output': validateLlmOutput, 'openclaw.tool.started': validateToolStarted,
  'openclaw.tool.finished': validateToolFinished, 'openclaw.agent.ended': validateAgentEnded, 'openclaw.model.started': validateModelStarted,
  'openclaw.model.ended': validateModelEnded, 'openclaw.model.usage': validateModelUsage,
  'openclaw.subagent.spawned': validateSubagent, 'openclaw.subagent.delivery_target': validateSubagent, 'openclaw.subagent.ended': validateSubagent,
  'openclaw.session.started': validateSession, 'openclaw.session.ended': validateSession,
};

function validatePayload(type: AgentObservabilityIngressEventType, payload: unknown, errors: string[]): void {
  if (!isPlainObject(payload)) { errors.push('payload must be an object'); return; }
  const expectedHook = TYPE_TO_HOOK[type];
  if (payload.hook !== expectedHook) errors.push(`payload.hook must be '${expectedHook}' for ${type}`);
  if (payload.metadata !== undefined && !isJsonSafe(payload.metadata)) errors.push('payload.metadata must be JSON-safe');
  optionalNumberField(payload, 'event_bytes', errors);
  const validator = validators[type];
  if (validator) validator(payload, errors); else errors.push(`unsupported payload type ${type}`);
}

export function validateAgentObservabilityIngressEvent(value: unknown): AgentObservabilityValidationResult {
  const complexityError = ingressComplexityError(value);
  if (complexityError) return { ok: false, errors: [complexityError] };
  const errors: string[] = [];
  if (!isPlainObject(value)) return { ok: false, errors: ['event must be an object'] };

  if (value.v !== AGENT_OBSERVABILITY_SCHEMA_VERSION) errors.push('v must be 1');
  if (!AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES.includes(value.type as AgentObservabilityIngressEventType)) {
    errors.push(`type must be one of: ${AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES.join(', ')}`);
  }
  if (value.source !== AGENT_OBSERVABILITY_SOURCE) errors.push(`source must be '${AGENT_OBSERVABILITY_SOURCE}'`);
  validateTimestamp(value.ts, errors);
  validateIdentity(value.identity, errors);
  const identity = isPlainObject(value.identity) ? value.identity : {};
  if (['openclaw.tool.started','openclaw.tool.finished'].includes(String(value.type))) {
    if (!isNonEmptyString(identity.tool_call_id)) errors.push('identity.tool_call_id is required for tool events');
    if (!isNonEmptyString(identity.model_call_id)) errors.push('identity.model_call_id is required for tool parent correlation');
  }
  if (AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES.includes(value.type as AgentObservabilityIngressEventType)) {
    validatePayload(value.type as AgentObservabilityIngressEventType, value.payload, errors);
  } else if (!isPlainObject(value.payload)) {
    errors.push('payload must be an object');
  }
  return { ok: errors.length === 0, errors };
}

export function assertAgentObservabilityIngressEvent(value: unknown): asserts value is AgentObservabilityIngressEventV1 {
  const result = validateAgentObservabilityIngressEvent(value);
  if (!result.ok) throw new AgentObservabilityContractError(result.errors);
}

export function isAgentObservabilityIngressEvent(value: unknown): value is AgentObservabilityIngressEventV1 {
  return validateAgentObservabilityIngressEvent(value).ok;
}

export function expectedHookForIngressType(type: AgentObservabilityIngressEventType): string {
  return TYPE_TO_HOOK[type];
}

export function knownAgentObservabilityHooks(): readonly string[] {
  return AGENT_OBSERVABILITY_HOOKS;
}
