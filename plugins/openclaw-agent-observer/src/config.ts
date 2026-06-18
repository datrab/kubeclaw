import { normalizeAgentObservabilityMaxEventBytes } from './agent-observability/index.ts';

declare const process: { env: Record<string, unknown> };

const DEFAULT_MAX_QUEUE_PER_STREAM = 100;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 1000;
const DEFAULT_STREAM_MAXLEN = 10000;
const DEFAULT_DEADLETTER_MAXLEN = 1000;
const DEFAULT_CONTROL_WRITE_MAX_ATTEMPTS = 3;
const DEFAULT_CONTROL_WRITE_RETRY_BASE_MS = 100;
const DEFAULT_CONTROL_WRITE_RETRY_MAX_MS = 1000;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

type UnknownRecord = Record<string, unknown>;

export interface AgentObserverConfig {
  enabled: boolean;
  redisHost?: string;
  redisPort?: number;
  redisUsername?: string;
  redisPassword?: string;
  redisTls?: boolean;
  redisNetworkIsolation?: boolean | string;
  maxEventBytes: number;
  maxQueuePerStream: number;
  redisCommandTimeoutMs: number;
  streamMaxLen: number;
  deadLetterMaxLen: number;
  controlWriteMaxAttempts: number;
  controlWriteRetryBaseMs: number;
  controlWriteRetryMaxMs: number;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function stringValue(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function positiveInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return numberValue;
}

function positivePort(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0 || numberValue > 65535) {
    throw new Error('redisPort must be an integer between 1 and 65535');
  }
  return numberValue;
}

export function resolveAgentObserverConfig(pluginConfig: unknown = {}, env: UnknownRecord = process.env): AgentObserverConfig {
  const config = asRecord(pluginConfig);
  return {
    enabled: boolValue(config.enabled ?? env.OPENCLAW_AGENT_OBSERVER_ENABLED, true),
    redisHost: stringValue(config.redisHost ?? env.REDIS_HOST),
    redisPort: positivePort(config.redisPort ?? env.REDIS_PORT),
    redisUsername: stringValue(config.redisUsername ?? env.REDIS_USERNAME),
    redisPassword: stringValue(config.redisPassword ?? env.REDIS_PASSWORD),
    redisTls: boolValue(config.redisTls ?? env.REDIS_TLS ?? env.REDIS_TLS_ENABLED, false),
    redisNetworkIsolation: config.redisNetworkIsolation as boolean | string | undefined ?? stringValue(env.REDIS_NETWORK_ISOLATION),
    maxEventBytes: normalizeAgentObservabilityMaxEventBytes(config.maxEventBytes ?? env.OPENCLAW_AGENT_OBSERVER_MAX_EVENT_BYTES),
    maxQueuePerStream: positiveInteger(config.maxQueuePerStream ?? env.OPENCLAW_AGENT_OBSERVER_MAX_QUEUE_PER_STREAM, DEFAULT_MAX_QUEUE_PER_STREAM, 'maxQueuePerStream'),
    redisCommandTimeoutMs: positiveInteger(config.redisCommandTimeoutMs ?? env.OPENCLAW_AGENT_OBSERVER_REDIS_COMMAND_TIMEOUT_MS, DEFAULT_REDIS_COMMAND_TIMEOUT_MS, 'redisCommandTimeoutMs'),
    streamMaxLen: positiveInteger(config.streamMaxLen ?? env.OPENCLAW_AGENT_OBSERVER_STREAM_MAXLEN, DEFAULT_STREAM_MAXLEN, 'streamMaxLen'),
    deadLetterMaxLen: positiveInteger(config.deadLetterMaxLen ?? env.OPENCLAW_AGENT_OBSERVER_DEADLETTER_MAXLEN, DEFAULT_DEADLETTER_MAXLEN, 'deadLetterMaxLen'),
    controlWriteMaxAttempts: positiveInteger(config.controlWriteMaxAttempts ?? env.OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_MAX_ATTEMPTS, DEFAULT_CONTROL_WRITE_MAX_ATTEMPTS, 'controlWriteMaxAttempts'),
    controlWriteRetryBaseMs: positiveInteger(config.controlWriteRetryBaseMs ?? env.OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_BASE_MS, DEFAULT_CONTROL_WRITE_RETRY_BASE_MS, 'controlWriteRetryBaseMs'),
    controlWriteRetryMaxMs: positiveInteger(config.controlWriteRetryMaxMs ?? env.OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_MAX_MS, DEFAULT_CONTROL_WRITE_RETRY_MAX_MS, 'controlWriteRetryMaxMs'),
  };
}
