import { AGENT_OBSERVABILITY_HOOKS, AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES, AGENT_OBSERVABILITY_SCHEMA_VERSION, AGENT_OBSERVABILITY_SOURCE, } from "./constants.js";
const TYPE_TO_HOOK = Object.freeze({
    'openclaw.agent.ended': 'agent_end',
    'openclaw.llm.input': 'llm_input',
    'openclaw.llm.output': 'llm_output',
    'openclaw.subagent.spawning': 'subagent_spawning',
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
export class AgentObservabilityContractError extends Error {
    errors;
    constructor(errors) {
        super(`Invalid agent observability ingress event: ${errors.join('; ')}`);
        this.name = 'AgentObservabilityContractError';
        this.errors = [...errors];
    }
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function isJsonSafe(value, seen = new Set()) {
    if (value === null)
        return true;
    if (typeof value === 'string' || typeof value === 'boolean')
        return true;
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (Array.isArray(value))
        return value.every((item) => isJsonSafe(item, seen));
    if (!isPlainObject(value))
        return false;
    if (seen.has(value))
        return false;
    seen.add(value);
    const ok = Object.values(value).every((item) => item !== undefined && isJsonSafe(item, seen));
    seen.delete(value);
    return ok;
}
function validateTimestamp(value, errors) {
    if (!isNonEmptyString(value)) {
        errors.push('ts must be a non-empty ISO timestamp string');
        return;
    }
    const ms = Date.parse(value);
    if (!Number.isFinite(ms))
        errors.push('ts must be parseable as an ISO timestamp');
}
function validateIdentity(identity, errors) {
    if (!isPlainObject(identity)) {
        errors.push('identity must be an object');
        return;
    }
    for (const [key, value] of Object.entries(identity)) {
        if (!IDENTITY_FIELDS.includes(key))
            errors.push(`identity.${key} is not allowed`);
        if (key === 'attempt' && value !== undefined && value !== null && (!Number.isInteger(value) || Number(value) < 1)) {
            errors.push('identity.attempt must be a positive integer when present');
        }
        else if (key !== 'attempt' && value !== undefined && value !== null && !isNonEmptyString(value)) {
            errors.push(`identity.${key} must be a non-empty string when present`);
        }
    }
}
function validateHistoryMessages(value, field, errors, required) {
    if (value === undefined && !required)
        return;
    if (!Array.isArray(value)) {
        errors.push(`${field} must be an array`);
        return;
    }
    for (const [index, item] of value.entries()) {
        if (!isPlainObject(item)) {
            errors.push(`${field}[${index}] must be an object`);
            continue;
        }
        const message = item;
        if (!('content' in message))
            errors.push(`${field}[${index}].content is required`);
        if ('content' in message && !isJsonSafe(message.content))
            errors.push(`${field}[${index}].content must be JSON-safe`);
        for (const stringField of ['role', 'name', 'tool_call_id']) {
            const stringValue = item[stringField];
            if (stringValue !== undefined && stringValue !== null && !isNonEmptyString(stringValue)) {
                errors.push(`${field}[${index}].${stringField} must be a non-empty string when present`);
            }
        }
        if (item.metadata !== undefined && !isJsonSafe(item.metadata))
            errors.push(`${field}[${index}].metadata must be JSON-safe`);
    }
}
function requireJsonField(payload, field, errors) {
    if (!(field in payload)) {
        errors.push(`payload.${field} is required`);
        return;
    }
    if (!isJsonSafe(payload[field]))
        errors.push(`payload.${field} must be JSON-safe`);
}
function optionalJsonField(payload, field, errors) {
    if (field in payload && !isJsonSafe(payload[field]))
        errors.push(`payload.${field} must be JSON-safe`);
}
function optionalStringField(payload, field, errors) {
    const value = payload[field];
    if (value !== undefined && value !== null && !isNonEmptyString(value)) {
        errors.push(`payload.${field} must be null or a non-empty string`);
    }
}
function optionalNumberField(payload, field, errors) {
    const value = payload[field];
    if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
        errors.push(`payload.${field} must be null or a finite number`);
    }
}
function validatePayload(type, payload, errors) {
    if (!isPlainObject(payload)) {
        errors.push('payload must be an object');
        return;
    }
    const expectedHook = TYPE_TO_HOOK[type];
    if (payload.hook !== expectedHook)
        errors.push(`payload.hook must be '${expectedHook}' for ${type}`);
    if (payload.metadata !== undefined && !isJsonSafe(payload.metadata))
        errors.push('payload.metadata must be JSON-safe');
    optionalNumberField(payload, 'event_bytes', errors);
    switch (type) {
        case 'openclaw.llm.input':
            requireJsonField(payload, 'prompt', errors);
            optionalStringField(payload, 'system_prompt', errors);
            validateHistoryMessages(payload.history_messages, 'payload.history_messages', errors, true);
            optionalStringField(payload, 'provider', errors);
            optionalStringField(payload, 'model', errors);
            optionalJsonField(payload, 'request', errors);
            break;
        case 'openclaw.llm.output':
            requireJsonField(payload, 'response', errors);
            optionalStringField(payload, 'assistant_response', errors);
            optionalJsonField(payload, 'assistant_message', errors);
            validateHistoryMessages(payload.history_messages, 'payload.history_messages', errors, false);
            optionalStringField(payload, 'provider', errors);
            optionalStringField(payload, 'model', errors);
            optionalJsonField(payload, 'usage', errors);
            break;
        case 'openclaw.tool.started':
            if (!isNonEmptyString(payload.tool_name))
                errors.push('payload.tool_name must be a non-empty string');
            requireJsonField(payload, 'params', errors);
            break;
        case 'openclaw.tool.finished':
            if (!isNonEmptyString(payload.tool_name))
                errors.push('payload.tool_name must be a non-empty string');
            optionalJsonField(payload, 'params', errors);
            optionalJsonField(payload, 'result', errors);
            optionalJsonField(payload, 'error', errors);
            optionalNumberField(payload, 'duration_ms', errors);
            optionalStringField(payload, 'outcome', errors);
            break;
        case 'openclaw.agent.ended':
            optionalStringField(payload, 'outcome', errors);
            optionalStringField(payload, 'reason', errors);
            optionalJsonField(payload, 'error', errors);
            optionalNumberField(payload, 'duration_ms', errors);
            validateHistoryMessages(payload.final_messages, 'payload.final_messages', errors, false);
            break;
        case 'openclaw.model.started':
            optionalStringField(payload, 'provider', errors);
            optionalStringField(payload, 'model', errors);
            optionalJsonField(payload, 'request', errors);
            break;
        case 'openclaw.model.ended':
            optionalStringField(payload, 'provider', errors);
            optionalStringField(payload, 'model', errors);
            optionalStringField(payload, 'outcome', errors);
            optionalJsonField(payload, 'error', errors);
            optionalNumberField(payload, 'duration_ms', errors);
            optionalJsonField(payload, 'usage', errors);
            break;
        case 'openclaw.model.usage':
            optionalStringField(payload, 'provider', errors);
            optionalStringField(payload, 'model', errors);
            optionalNumberField(payload, 'cost_usd', errors);
            optionalNumberField(payload, 'duration_ms', errors);
            optionalJsonField(payload, 'context', errors);
            optionalJsonField(payload, 'usage', errors);
            break;
        case 'openclaw.subagent.spawning':
        case 'openclaw.subagent.spawned':
        case 'openclaw.subagent.delivery_target':
        case 'openclaw.subagent.ended':
            optionalStringField(payload, 'child_session_key', errors);
            optionalStringField(payload, 'child_session_id', errors);
            optionalStringField(payload, 'agent_id', errors);
            optionalStringField(payload, 'requester_session_key', errors);
            optionalStringField(payload, 'child_run_id', errors);
            optionalStringField(payload, 'mode', errors);
            optionalStringField(payload, 'spawn_mode', errors);
            optionalStringField(payload, 'outcome', errors);
            optionalStringField(payload, 'reason', errors);
            optionalJsonField(payload, 'error', errors);
            optionalJsonField(payload, 'requester_origin', errors);
            optionalNumberField(payload, 'duration_ms', errors);
            if (payload.thread !== undefined && payload.thread !== null && typeof payload.thread !== 'boolean') {
                errors.push('payload.thread must be null or a boolean');
            }
            if (payload.expects_completion_message !== undefined && payload.expects_completion_message !== null && typeof payload.expects_completion_message !== 'boolean') {
                errors.push('payload.expects_completion_message must be null or a boolean');
            }
            break;
        case 'openclaw.session.started':
        case 'openclaw.session.ended':
            optionalStringField(payload, 'session_key', errors);
            optionalStringField(payload, 'session_id', errors);
            optionalStringField(payload, 'outcome', errors);
            optionalStringField(payload, 'reason', errors);
            optionalJsonField(payload, 'error', errors);
            optionalNumberField(payload, 'duration_ms', errors);
            break;
        default:
            errors.push(`unsupported payload type ${type}`);
    }
}
export function validateAgentObservabilityIngressEvent(value) {
    const errors = [];
    if (!isPlainObject(value))
        return { ok: false, errors: ['event must be an object'] };
    if (value.v !== AGENT_OBSERVABILITY_SCHEMA_VERSION)
        errors.push('v must be 1');
    if (!AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES.includes(value.type)) {
        errors.push(`type must be one of: ${AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES.join(', ')}`);
    }
    if (value.source !== AGENT_OBSERVABILITY_SOURCE)
        errors.push(`source must be '${AGENT_OBSERVABILITY_SOURCE}'`);
    validateTimestamp(value.ts, errors);
    validateIdentity(value.identity, errors);
    const identity = isPlainObject(value.identity) ? value.identity : {};
    if (['openclaw.tool.started', 'openclaw.tool.finished'].includes(String(value.type))) {
        if (!isNonEmptyString(identity.tool_call_id))
            errors.push('identity.tool_call_id is required for tool events');
        if (!isNonEmptyString(identity.model_call_id))
            errors.push('identity.model_call_id is required for tool parent correlation');
    }
    if (AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES.includes(value.type)) {
        validatePayload(value.type, value.payload, errors);
    }
    else if (!isPlainObject(value.payload)) {
        errors.push('payload must be an object');
    }
    return { ok: errors.length === 0, errors };
}
export function assertAgentObservabilityIngressEvent(value) {
    const result = validateAgentObservabilityIngressEvent(value);
    if (!result.ok)
        throw new AgentObservabilityContractError(result.errors);
}
export function isAgentObservabilityIngressEvent(value) {
    return validateAgentObservabilityIngressEvent(value).ok;
}
export function expectedHookForIngressType(type) {
    return TYPE_TO_HOOK[type];
}
export function knownAgentObservabilityHooks() {
    return AGENT_OBSERVABILITY_HOOKS;
}
