const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

export interface AgentObservabilityIngesterConfig {
  enabled: boolean;
  redisHost?: string;
  redisPort?: number;
  redisUsername?: string;
  redisPassword?: string;
  redisTls?: boolean;
  redisNetworkIsolation?: boolean | string;
  groupName: string;
  consumerName: string;
  pollBlockMs: number;
  reclaimIdleMs: number;
  redisCommandTimeoutMs: number;
  deadLetterMaxLen: number;
  controlStreamMaxLen: number;
  controlLagDegradedThreshold: number;
  payloadPressureDegradedThreshold: number;
}

type UnknownRecord = Record<string, unknown>;

declare const process: { env: Record<string, unknown> };

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function typedBoolean(config: UnknownRecord, field: string, fallback: boolean): boolean {
  const value = config[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function envBoolean(env: UnknownRecord, field: string): boolean | undefined {
  const value = env[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(`${field} must be a boolean environment value`);
}

function typedString(config: UnknownRecord, field: string): string | undefined {
  const value = config[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  return normalized || undefined;
}

function envString(env: UnknownRecord, field: string): string | undefined {
  const normalized = String(env[field] ?? '').trim();
  return normalized || undefined;
}

function positiveInteger(config: UnknownRecord, field: string, fallback: number): number {
  const value = config[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(config: UnknownRecord, field: string, fallback: number): number {
  const value = config[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function typedRedisPort(config: UnknownRecord): number | undefined {
  const value = config.redisPort;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error('redisPort must be an integer between 1 and 65535');
  }
  return value;
}

function envRedisPort(env: UnknownRecord): number | undefined {
  const value = env.REDIS_PORT;
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0 || normalized > 65535) {
    throw new Error('REDIS_PORT must be an integer between 1 and 65535');
  }
  return normalized;
}

function typedNetworkIsolation(config: UnknownRecord): boolean | string | undefined {
  const value = config.redisNetworkIsolation;
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }
  throw new Error('redisNetworkIsolation must be a boolean or non-empty string');
}

export function resolveAgentObservabilityIngesterConfig(
  input: unknown = {},
  env: UnknownRecord = process.env,
): AgentObservabilityIngesterConfig {
  const config = asRecord(input);
  const resolved: AgentObservabilityIngesterConfig = {
    enabled: typedBoolean(config, 'enabled', false),
    groupName: typedString(config, 'groupName') ?? 'kubeclaw-agent-observability-ingester',
    consumerName: typedString(config, 'consumerName') ?? 'kubeclaw-agent-observability-ingester-1',
    pollBlockMs: positiveInteger(config, 'pollBlockMs', 1000),
    reclaimIdleMs: positiveInteger(config, 'reclaimIdleMs', 60000),
    redisCommandTimeoutMs: positiveInteger(config, 'redisCommandTimeoutMs', 1000),
    deadLetterMaxLen: positiveInteger(config, 'deadLetterMaxLen', 1000),
    controlStreamMaxLen: positiveInteger(config, 'controlStreamMaxLen', 10000),
    controlLagDegradedThreshold: nonNegativeInteger(config, 'controlLagDegradedThreshold', 1000),
    payloadPressureDegradedThreshold: nonNegativeInteger(config, 'payloadPressureDegradedThreshold', 10000),
  };

  const redisTls = typedBoolean(config, 'redisTls', envBoolean(env, 'REDIS_TLS') ?? envBoolean(env, 'REDIS_TLS_ENABLED') ?? false);
  if (redisTls) resolved.redisTls = redisTls;

  const redisHost = typedString(config, 'redisHost') ?? envString(env, 'REDIS_HOST');
  if (redisHost !== undefined) resolved.redisHost = redisHost;
  const redisPort = typedRedisPort(config) ?? envRedisPort(env);
  if (redisPort !== undefined) resolved.redisPort = redisPort;
  const redisUsername = typedString(config, 'redisUsername') ?? envString(env, 'REDIS_USERNAME');
  if (redisUsername !== undefined) resolved.redisUsername = redisUsername;
  const redisPassword = typedString(config, 'redisPassword') ?? envString(env, 'REDIS_PASSWORD');
  if (redisPassword !== undefined) resolved.redisPassword = redisPassword;
  const redisNetworkIsolation = typedNetworkIsolation(config) ?? envString(env, 'REDIS_NETWORK_ISOLATION');
  if (redisNetworkIsolation !== undefined) resolved.redisNetworkIsolation = redisNetworkIsolation;

  return resolved;
}
