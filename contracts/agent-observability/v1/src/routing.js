import { AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES, AGENT_OBSERVABILITY_CONTROL_STREAM, AGENT_OBSERVABILITY_PAYLOAD_STREAM, AGENT_OBSERVABILITY_PAYLOAD_TOO_LARGE_REASON, } from "./constants.js";
const PAYLOAD_STREAM_EVENTS = Object.freeze([
    'openclaw.llm.input',
    'openclaw.llm.output',
    'openclaw.tool.started',
    'openclaw.tool.finished',
]);
export function selectAgentObservabilityStreamKind(type) {
    return PAYLOAD_STREAM_EVENTS.includes(type) ? 'payload' : 'control';
}
export function selectAgentObservabilityStreamKey(type) {
    return selectAgentObservabilityStreamKind(type) === 'payload'
        ? AGENT_OBSERVABILITY_PAYLOAD_STREAM
        : AGENT_OBSERVABILITY_CONTROL_STREAM;
}
export function normalizeAgentObservabilityMaxEventBytes(value) {
    if (value === undefined || value === null || value === '') {
        throw new Error('agent observability max event bytes is required');
    }
    const numberValue = Number(value);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw new Error('agent observability max event bytes must be a positive integer');
    }
    if (numberValue > AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES) {
        throw new Error(`agent observability max event bytes cannot exceed ${AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES}`);
    }
    return numberValue;
}
export function measureAgentObservabilityEventBytes(event) {
    return new TextEncoder().encode(JSON.stringify(event)).byteLength;
}
export function checkAgentObservabilityPayloadSize(event, maxBytes) {
    const normalizedMax = normalizeAgentObservabilityMaxEventBytes(maxBytes);
    const bytes = measureAgentObservabilityEventBytes(event);
    if (bytes <= normalizedMax)
        return { ok: true, bytes, max_bytes: normalizedMax };
    return {
        ok: false,
        bytes,
        max_bytes: normalizedMax,
        reason: AGENT_OBSERVABILITY_PAYLOAD_TOO_LARGE_REASON,
        identity: { ...event.identity },
    };
}
