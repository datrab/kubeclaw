import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
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
  loopDelayMs: number;
  trimIntervalMs: number;
  stopTimeoutMs: number;
  deadLetterMaxLen: number;
  controlStreamMaxLen: number;
  payloadStreamMaxLen: number;
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
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function envBoolean(env: UnknownRecord, field: string): boolean | undefined {
  const value = env[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(`${field} must be a boolean environment value`);
}

function typedString(config: UnknownRecord, field: string): string | undefined {
  const value = config[field];
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function requiredString(config: UnknownRecord, field: string): string {
  const value = typedString(config, field);
  if (value === undefined) throw new Error(`${field} is required when agent observability ingester is enabled`);
  return value;
}

function envString(env: UnknownRecord, field: string): string | undefined {
  const value = env[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function requiredPositiveInteger(config: UnknownRecord, field: string): number {
  const value = config[field];
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) {
    throw new Error(`${field} is required when agent observability ingester is enabled`);
  }
  if (typeof value !== 'number') throw new Error(`${field} must be a positive integer`);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requiredNonNegativeInteger(config: UnknownRecord, field: string): number {
  const value = config[field];
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) {
    throw new Error(`${field} is required when agent observability ingester is enabled`);
  }
  if (typeof value !== 'number') throw new Error(`${field} must be a non-negative integer`);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function typedRedisPort(config: UnknownRecord): number | undefined {
  const value = config.redisPort;
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return undefined;
  if (typeof value !== 'number') throw new Error('redisPort must be an integer between 1 and 65535');
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error('redisPort must be an integer between 1 and 65535');
  }
  return value;
}

function envRedisPort(env: UnknownRecord): number | undefined {
  const value = env.REDIS_PORT;
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return undefined;
  const normalized = Number(value);
  if (selectTruthyValue(() => (selectTruthyValue(() => (!Number.isInteger(normalized)), () => (normalized <= 0))), () => (normalized > 65535))) {
    throw new Error('REDIS_PORT must be an integer between 1 and 65535');
  }
  return normalized;
}

function typedNetworkIsolation(config: UnknownRecord): boolean | string | undefined {
  const value = config.redisNetworkIsolation;
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  throw new Error('redisNetworkIsolation must be a boolean or non-empty string');
}

export function resolveAgentObservabilityIngesterConfig(
  input: unknown = {},
  env: UnknownRecord = process.env,
): AgentObservabilityIngesterConfig {
  const config = asRecord(input);
  const enabled = typedBoolean(config, 'enabled', false);
  const resolved: AgentObservabilityIngesterConfig = enabled
    ? enabledIngesterConfig(config)
    : disabledIngesterConfig();

  const redisTls = typedBoolean(config, 'redisTls', envBoolean(env, 'REDIS_TLS') ?? false);
  if (redisTls) resolved.redisTls = redisTls;

  const redisHost = typedString(config, 'redisHost')
  if (redisHost !== undefined) resolved.redisHost = redisHost;
  const configuredRedisPort = typedRedisPort(config);
  const redisPort = configuredRedisPort !== undefined ? configuredRedisPort : envRedisPort(env);
  if (redisPort !== undefined) resolved.redisPort = redisPort;
  const redisUsername = typedString(config, 'redisUsername')
  if (redisUsername !== undefined) resolved.redisUsername = redisUsername;
  const redisPassword = typedString(config, 'redisPassword')
  if (redisPassword !== undefined) resolved.redisPassword = redisPassword;
  const redisNetworkIsolation = typedNetworkIsolation(config)
  if (redisNetworkIsolation !== undefined) resolved.redisNetworkIsolation = redisNetworkIsolation;

  return resolved;
}

function enabledIngesterConfig(config: UnknownRecord): AgentObservabilityIngesterConfig {
  return {
    enabled: true,
    groupName: requiredString(config, 'groupName'),
    consumerName: requiredString(config, 'consumerName'),
    pollBlockMs: requiredPositiveInteger(config, 'pollBlockMs'),
    reclaimIdleMs: requiredPositiveInteger(config, 'reclaimIdleMs'),
    redisCommandTimeoutMs: requiredPositiveInteger(config, 'redisCommandTimeoutMs'),
    loopDelayMs: requiredPositiveInteger(config, 'loopDelayMs'),
    trimIntervalMs: requiredPositiveInteger(config, 'trimIntervalMs'),
    stopTimeoutMs: requiredNonNegativeInteger(config, 'stopTimeoutMs'),
    deadLetterMaxLen: requiredPositiveInteger(config, 'deadLetterMaxLen'),
    controlStreamMaxLen: requiredPositiveInteger(config, 'controlStreamMaxLen'),
    payloadStreamMaxLen: requiredPositiveInteger(config, 'payloadStreamMaxLen'),
    controlLagDegradedThreshold: requiredNonNegativeInteger(config, 'controlLagDegradedThreshold'),
    payloadPressureDegradedThreshold: requiredNonNegativeInteger(config, 'payloadPressureDegradedThreshold'),
  };
}

function disabledIngesterConfig(): AgentObservabilityIngesterConfig {
  return {
    enabled: false,
    groupName: '', consumerName: '', pollBlockMs: 0, reclaimIdleMs: 0,
    redisCommandTimeoutMs: 0, loopDelayMs: 0, trimIntervalMs: 0, stopTimeoutMs: 0,
    deadLetterMaxLen: 0, controlStreamMaxLen: 0, payloadStreamMaxLen: 0,
    controlLagDegradedThreshold: 0, payloadPressureDegradedThreshold: 0,
  };
}
