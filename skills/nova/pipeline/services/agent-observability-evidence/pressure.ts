import type {
  AgentObservabilityRedisPressureSnapshot,
  AgentObservabilityRedisPressureSummary,
} from './types.ts';

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requiredThreshold(value: unknown, label: string): number {
  const normalized = numberValue(value);
  if (normalized === null) throw new Error(`${label}: required numeric threshold`);
  return normalized;
}

function exceeds(value: number | null, threshold: number | null): boolean {
  return value !== null && threshold !== null && value > threshold;
}

export function summarizeRedisPressure(input?: AgentObservabilityRedisPressureSnapshot): AgentObservabilityRedisPressureSummary {
  if (!input) return {
    control_pending: null, control_lag: null, payload_length: null,
    payload_bytes: null, memory_bytes: null, degraded: [],
  };
  const controlPending = numberValue(input.controlPending);
  const controlLag = numberValue(input.controlLag) ?? controlPending;
  const payloadLength = numberValue(input.payloadLength);
  const payloadBytes = numberValue(input.payloadBytes);
  const memoryBytes = numberValue(input.memoryBytes);
  const thresholds = {
    controlLag: requiredThreshold(input.controlLagThreshold, 'redisPressure.controlLagThreshold'),
    payload: requiredThreshold(input.payloadPressureThreshold, 'redisPressure.payloadPressureThreshold'),
    payloadBytes: numberValue(input.payloadBytesThreshold),
    memory: numberValue(input.memoryPressureThreshold),
  };
  const degraded: string[] = [];
  if (exceeds(controlLag, thresholds.controlLag)) degraded.push('control_lag');
  if (exceeds(payloadLength, thresholds.payload)) degraded.push('payload_stream_length');
  if (exceeds(payloadBytes, thresholds.payloadBytes)) degraded.push('payload_stream_bytes');
  if (exceeds(memoryBytes, thresholds.memory)) degraded.push('redis_memory');
  return {
    control_pending: controlPending, control_lag: controlLag, payload_length: payloadLength,
    payload_bytes: payloadBytes, memory_bytes: memoryBytes, degraded,
  };
}
