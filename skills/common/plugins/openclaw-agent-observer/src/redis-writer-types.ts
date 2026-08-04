import type { AgentObservabilityStreamKind } from './generated/agent-observability/index.ts';
import type { AgentObserverConfig } from './config.ts';

export type RedisClient = {
  xadd: (...args: unknown[]) => Promise<unknown> | unknown;
  quit?: () => Promise<unknown> | unknown;
  disconnect?: () => unknown;
};

export type RedisClientFactory = (config: AgentObserverConfig) => RedisClient;
export type Logger = Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;

export interface QueuedEvent {
  kind: AgentObservabilityStreamKind;
  stream: string;
  data: string;
}

export interface AgentObserverWriterStats {
  enqueued: number;
  enqueuedControl: number;
  enqueuedPayload: number;
  written: number;
  writtenControl: number;
  writtenPayload: number;
  droppedDisabled: number;
  droppedQueueFull: number;
  droppedQueueFullControl: number;
  droppedQueueFullPayload: number;
  droppedOversize: number;
  droppedWriteFailure: number;
  droppedWriteFailureControl: number;
  droppedWriteFailurePayload: number;
  droppedInvalidConfig: number;
  retriedControlWrites: number;
  deadLetterWritten: number;
  deadLetterFailed: number;
  queuedControl: number;
  queuedPayload: number;
  lastError?: string;
  lastErrorAt?: string;
}

export interface AgentObserverRedisWriterOptions {
  config: AgentObserverConfig;
  logger?: Logger;
  redisClientFactory?: RedisClientFactory;
}
