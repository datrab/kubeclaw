import {
  AGENT_OBSERVABILITY_CONTROL_STREAM,
  AGENT_OBSERVABILITY_PAYLOAD_STREAM,
} from '../../agent-observability/src/index.ts';
import type { AgentObservabilityIngressEventV1 } from '../../agent-observability/src/index.ts';
import { createRedisClient, loadRedisCtor } from '../../redis-transport.ts';
import type { AgentObservabilityIngesterConfig } from './config.ts';

export interface RedisClient {
  status?: string;
  connect?: () => Promise<unknown> | unknown;
  ping?: () => Promise<unknown> | unknown;
  xgroup?: (...args: unknown[]) => Promise<unknown> | unknown;
  xreadgroup?: (...args: unknown[]) => Promise<unknown> | unknown;
  xack?: (...args: unknown[]) => Promise<unknown> | unknown;
  xadd?: (...args: unknown[]) => Promise<unknown> | unknown;
  xtrim?: (...args: unknown[]) => Promise<unknown> | unknown;
  xlen?: (...args: unknown[]) => Promise<unknown> | unknown;
  xpending?: (...args: unknown[]) => Promise<unknown> | unknown;
  call?: (...args: unknown[]) => Promise<unknown> | unknown;
  quit?: () => Promise<unknown> | unknown;
  disconnect?: () => unknown;
}

export type Logger = Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;
export type RedisClientFactory = (config: AgentObservabilityIngesterConfig) => RedisClient;
export type EmitEvent = (ctx: unknown, eventType: string, payload: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
export type ObservabilityReporter = (ctx: unknown, data: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
export type ArtifactPublisher = (ctx: unknown, event: AgentObservabilityIngressEventV1, entry: StreamEntry) => { reference: string } | null;

export interface StreamEntry {
  stream: AgentObservabilityStreamKey;
  id: string;
  data: Record<string, string>;
  reclaimed: boolean;
}

export type AgentObservabilityStreamKey =
  | typeof AGENT_OBSERVABILITY_CONTROL_STREAM
  | typeof AGENT_OBSERVABILITY_PAYLOAD_STREAM;

export function createDefaultAgentObservabilityRedisClient(config: AgentObservabilityIngesterConfig): RedisClient {
  const RedisCtor = loadRedisCtor();
  return createRedisClient(RedisCtor, {
    host: config.redisHost, port: config.redisPort, username: config.redisUsername,
    password: config.redisPassword, tls: config.redisTls, networkIsolation: config.redisNetworkIsolation,
  }, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false }) as RedisClient;
}
