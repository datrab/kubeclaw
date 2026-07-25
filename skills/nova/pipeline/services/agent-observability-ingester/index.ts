import {
  AgentObservabilityIngester,
} from './consumer.ts';

export { resolveAgentObservabilityIngesterConfig } from './config.ts';
export type { AgentObservabilityIngesterConfig } from './config.ts';
export { mapAgentObservabilityEventToTelemetry } from './mapper.ts';
export type { AgentObservabilityTelemetryEmission } from './mapper.ts';
export { AgentObservabilityIngester } from './consumer.ts';
export type {
  AgentObservabilityIngesterOptions,
  AgentObservabilityIngesterStats,
  AgentObservabilityPressureStatus,
} from './consumer.ts';

export function createAgentObservabilityIngester(options: any = {}) {
  return new AgentObservabilityIngester(options);
}
