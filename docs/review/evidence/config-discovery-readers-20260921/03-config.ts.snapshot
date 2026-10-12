import { normalizeAgentObservabilityMaxEventBytes } from './generated/agent-observability/index.ts';

declare const process: { env: Record<string, unknown> };

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
  hookPriority: number;
  hookTimeoutMs: number;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function requiredBooleanValue(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') {
    throw new Error(`${field} must be configured as a boolean`);
  }
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function stringValue(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function positiveInteger(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${field} must be configured as a positive integer`);
  }
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

function integerValue(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${field} must be configured as an integer`);
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${field} must be an integer`);
  }
  return numberValue;
}

function configuredValue(
  config: UnknownRecord,
  env: UnknownRecord,
  configKey: string,
  environmentKey: string,
): unknown {
  return config[configKey] !== undefined ? config[configKey] : env[environmentKey];
}

export function resolveAgentObserverConfig(pluginConfig: unknown = {}, env: UnknownRecord = process.env): AgentObserverConfig {
  const config = asRecord(pluginConfig);
  return {
    enabled: requiredBooleanValue(configuredValue(config, env, 'enabled', 'OPENCLAW_AGENT_OBSERVER_ENABLED'), 'enabled'),
    redisHost: stringValue(configuredValue(config, env, 'redisHost', 'REDIS_HOST')),
    redisPort: positivePort(configuredValue(config, env, 'redisPort', 'REDIS_PORT')),
    redisUsername: stringValue(configuredValue(config, env, 'redisUsername', 'REDIS_USERNAME')),
    redisPassword: stringValue(configuredValue(config, env, 'redisPassword', 'REDIS_PASSWORD')),
    redisTls: boolValue(configuredValue(config, env, 'redisTls', 'REDIS_TLS'), false),
    redisNetworkIsolation: configuredValue(config, env, 'redisNetworkIsolation', 'REDIS_NETWORK_ISOLATION') as boolean | string | undefined,
    maxEventBytes: normalizeAgentObservabilityMaxEventBytes(configuredValue(config, env, 'maxEventBytes', 'OPENCLAW_AGENT_OBSERVER_MAX_EVENT_BYTES')),
    maxQueuePerStream: positiveInteger(configuredValue(config, env, 'maxQueuePerStream', 'OPENCLAW_AGENT_OBSERVER_MAX_QUEUE_PER_STREAM'), 'maxQueuePerStream'),
    redisCommandTimeoutMs: positiveInteger(configuredValue(config, env, 'redisCommandTimeoutMs', 'OPENCLAW_AGENT_OBSERVER_REDIS_COMMAND_TIMEOUT_MS'), 'redisCommandTimeoutMs'),
    streamMaxLen: positiveInteger(configuredValue(config, env, 'streamMaxLen', 'OPENCLAW_AGENT_OBSERVER_STREAM_MAXLEN'), 'streamMaxLen'),
    deadLetterMaxLen: positiveInteger(configuredValue(config, env, 'deadLetterMaxLen', 'OPENCLAW_AGENT_OBSERVER_DEADLETTER_MAXLEN'), 'deadLetterMaxLen'),
    controlWriteMaxAttempts: positiveInteger(configuredValue(config, env, 'controlWriteMaxAttempts', 'OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_MAX_ATTEMPTS'), 'controlWriteMaxAttempts'),
    controlWriteRetryBaseMs: positiveInteger(configuredValue(config, env, 'controlWriteRetryBaseMs', 'OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_BASE_MS'), 'controlWriteRetryBaseMs'),
    controlWriteRetryMaxMs: positiveInteger(configuredValue(config, env, 'controlWriteRetryMaxMs', 'OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_MAX_MS'), 'controlWriteRetryMaxMs'),
    hookPriority: integerValue(configuredValue(config, env, 'hookPriority', 'OPENCLAW_AGENT_OBSERVER_HOOK_PRIORITY'), 'hookPriority'),
    hookTimeoutMs: positiveInteger(configuredValue(config, env, 'hookTimeoutMs', 'OPENCLAW_AGENT_OBSERVER_HOOK_TIMEOUT_MS'), 'hookTimeoutMs'),
  };
}

export function agentObserverRuntimeEnvironment(): UnknownRecord {
  return process.env;
}
