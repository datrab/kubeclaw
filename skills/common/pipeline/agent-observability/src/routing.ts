import {
  AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES,
  AGENT_OBSERVABILITY_CONTROL_STREAM,
  AGENT_OBSERVABILITY_DEFAULT_MAX_EVENT_BYTES,
  AGENT_OBSERVABILITY_PAYLOAD_STREAM,
  AGENT_OBSERVABILITY_PAYLOAD_TOO_LARGE_REASON,
} from './constants.ts';
import type {
  AgentObservabilityIngressEventType,
  AgentObservabilityIngressEventV1,
  AgentObservabilityPayloadSizeCheckV1,
  AgentObservabilityStreamKind,
} from './types.ts';

const PAYLOAD_STREAM_EVENTS = Object.freeze([
  'openclaw.llm.input',
  'openclaw.llm.output',
  'openclaw.tool.started',
  'openclaw.tool.finished',
] as const);

export function selectAgentObservabilityStreamKind(type: AgentObservabilityIngressEventType): AgentObservabilityStreamKind {
  return PAYLOAD_STREAM_EVENTS.includes(type as (typeof PAYLOAD_STREAM_EVENTS)[number]) ? 'payload' : 'control';
}

export function selectAgentObservabilityStreamKey(type: AgentObservabilityIngressEventType): string {
  return selectAgentObservabilityStreamKind(type) === 'payload'
    ? AGENT_OBSERVABILITY_PAYLOAD_STREAM
    : AGENT_OBSERVABILITY_CONTROL_STREAM;
}

export function normalizeAgentObservabilityMaxEventBytes(value: unknown): number {
  if (value === undefined || value === null || value === '') return AGENT_OBSERVABILITY_DEFAULT_MAX_EVENT_BYTES;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error('agent observability max event bytes must be a positive integer');
  }
  if (numberValue > AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES) {
    throw new Error(`agent observability max event bytes cannot exceed ${AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES}`);
  }
  return numberValue;
}

export function measureAgentObservabilityEventBytes(event: AgentObservabilityIngressEventV1): number {
  return new TextEncoder().encode(JSON.stringify(event)).byteLength;
}

export function checkAgentObservabilityPayloadSize(
  event: AgentObservabilityIngressEventV1,
  maxBytes = AGENT_OBSERVABILITY_DEFAULT_MAX_EVENT_BYTES,
): AgentObservabilityPayloadSizeCheckV1 {
  const normalizedMax = normalizeAgentObservabilityMaxEventBytes(maxBytes);
  const bytes = measureAgentObservabilityEventBytes(event);
  if (bytes <= normalizedMax) return { ok: true, bytes, max_bytes: normalizedMax };
  return {
    ok: false,
    bytes,
    max_bytes: normalizedMax,
    reason: AGENT_OBSERVABILITY_PAYLOAD_TOO_LARGE_REASON,
    identity: { ...event.identity },
  };
}
