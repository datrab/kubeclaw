import { normalizeAgentObservabilityMaxEventBytes } from './agent-observability/index.ts';
import fs from 'node:fs';

declare const process: { env: Record<string, unknown> };

const STANDARD_PROFILE_NAME = 'standard';
const STANDARD_FEATURES: UnknownRecord = {
  observability: true,
  buster: true,
  discord_alerts: true,
};
const STANDARD_TUNING: UnknownRecord = {
  safety_margins: 'high',
  retention: 'high',
  alerts: 'rich',
  logs: 'verbose',
  checks: 'strict',
  determinism: 'strict',
};
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

function cloneJson(value: unknown): UnknownRecord {
  return JSON.parse(JSON.stringify(value));
}

function assertExactObject(input: unknown, expected: UnknownRecord, label: string) {
  const record = asRecord(input);
  if (!Object.keys(record).length) {
    throw new Error(`${label}: required object`);
  }
  for (const key of Object.keys(record)) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      throw new Error(`${label}.${key}: unknown key for ${STANDARD_PROFILE_NAME} profile`);
    }
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) {
      throw new Error(`${label}.${key}: ${STANDARD_PROFILE_NAME} profile requires ${JSON.stringify(expectedValue)}`);
    }
  }
}

function loadStandardProfile(env: UnknownRecord): UnknownRecord {
  const candidates = [
    stringValue(env.KUBECLAW_SWARM_STANDARD_PROFILE),
    '/app/skills/pipeline/config-profiles/standard.json',
    new URL('../../../pipeline/config-profiles/standard.json', import.meta.url),
  ].filter(Boolean) as Array<string | URL>;
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (_error) {
      continue;
    }
  }
  throw new Error('standard swarm config profile must be available to resolve compact swarm config');
}

function assertOverrideTargets(base: UnknownRecord, overrides: UnknownRecord, pathParts: string[] = []) {
  for (const [key, value] of Object.entries(overrides)) {
    const nextPath = [...pathParts, key];
    const label = `overrides.${nextPath.join('.')}`;
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      throw new Error(`${label}: unknown effective config path`);
    }
    if (Object.keys(asRecord(value)).length) {
      const baseValue = asRecord(base[key]);
      if (!Object.keys(baseValue).length) {
        throw new Error(`${label}: cannot merge object into non-object effective config value`);
      }
      assertOverrideTargets(baseValue, asRecord(value), nextPath);
    }
  }
}

function mergeKnownOverrides(target: UnknownRecord, overrides: UnknownRecord): UnknownRecord {
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.keys(asRecord(value)).length) {
      target[key] = mergeKnownOverrides({ ...asRecord(target[key]) }, asRecord(value));
    } else {
      target[key] = value;
    }
  }
  return target;
}

function expandPlatformConfigForObserver(platformConfig: UnknownRecord, env: UnknownRecord): UnknownRecord {
  if (platformConfig.profile !== STANDARD_PROFILE_NAME) return platformConfig;

  assertExactObject(platformConfig.features, STANDARD_FEATURES, 'config.features');
  assertExactObject(platformConfig.tuning, STANDARD_TUNING, 'config.tuning');
  const overrides = asRecord(platformConfig.overrides);
  const expanded = cloneJson(loadStandardProfile(env));
  assertOverrideTargets(expanded, overrides);
  mergeKnownOverrides(expanded, overrides);
  return expanded;
}

function loadSwarmAgentObserverConfig(env: UnknownRecord): UnknownRecord {
  const configPath = stringValue(env.SWARM_CONFIG);
  if (!configPath) return {};
  try {
    const platformConfig = expandPlatformConfigForObserver(JSON.parse(fs.readFileSync(configPath, 'utf8')), env);
    const agentObservability = asRecord(platformConfig?.agent_observability);
    const plugin = asRecord(agentObservability.plugin);
    const payload = asRecord(agentObservability.payload);
    const ingester = asRecord(agentObservability.ingester);
    const streamPolicy = asRecord(agentObservability.streams);
    const hookPolicy = asRecord(plugin.hook);
    const controlWritePolicy = asRecord(plugin.control_write);
    return {
      enabled: plugin.enabled,
      maxEventBytes: payload.max_event_bytes,
      maxQueuePerStream: plugin.max_queue_per_stream,
      redisCommandTimeoutMs: ingester.redis_command_timeout_ms,
      streamMaxLen: streamPolicy.stream_max_len,
      deadLetterMaxLen: streamPolicy.dead_letter_max_len,
      controlWriteMaxAttempts: controlWritePolicy.max_attempts,
      controlWriteRetryBaseMs: controlWritePolicy.retry_base_ms,
      controlWriteRetryMaxMs: controlWritePolicy.retry_max_ms,
      hookPriority: hookPolicy.priority,
      hookTimeoutMs: hookPolicy.timeout_ms,
      redisNetworkIsolation: ingester.redisNetworkIsolation,
    };
  } catch (_error) {
    return {};
  }
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
  const swarmConfig = loadSwarmAgentObserverConfig(env);
  const config = { ...swarmConfig, ...asRecord(pluginConfig) };
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
