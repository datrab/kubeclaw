import { normalizeAgentObservabilityMaxEventBytes } from './agent-observability/index.ts';
// @ts-expect-error kubeclaw plugin builds intentionally avoid a repo-wide @types/node dependency.
import fs from 'node:fs';

declare const process: { env: Record<string, unknown> };

const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';
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

function activeProfile(agentObservability: UnknownRecord): UnknownRecord {
  const profileName = stringValue(agentObservability.profile);
  if (!profileName) throw new Error('agent_observability.profile must be configured');
  const profiles = asRecord(agentObservability.profiles);
  const profile = asRecord(profiles[profileName]);
  if (!Object.keys(profile).length) {
    throw new Error(`agent_observability.profile references missing profile '${profileName}'`);
  }
  return profile;
}

function loadSwarmAgentObserverConfig(env: UnknownRecord): UnknownRecord {
  const configPath = String(env.SWARM_CONFIG || DEFAULT_SWARM_CONFIG_PATH).trim();
  try {
    const platformConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const agentObservability = asRecord(platformConfig?.agent_observability);
    const profile = activeProfile(agentObservability);
    const plugin = asRecord(profile.plugin);
    const payload = asRecord(profile.payload);
    const ingester = asRecord(agentObservability.ingester);
    const runtimePlugin = asRecord(agentObservability.plugin);
    const redisPolicy = asRecord(profile.redis);
    const streamPolicy = asRecord(profile.streams);
    const controlWritePolicy = asRecord(plugin.control_write);
    const hookPolicy = asRecord(plugin.hook);
    return {
      enabled: runtimePlugin.enabled,
      maxEventBytes: payload.max_event_bytes,
      maxQueuePerStream: plugin.max_queue_per_stream,
      redisCommandTimeoutMs: redisPolicy.command_timeout_ms,
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

export function resolveAgentObserverConfig(pluginConfig: unknown = {}, env: UnknownRecord = process.env): AgentObserverConfig {
  const swarmConfig = loadSwarmAgentObserverConfig(env);
  const config = { ...swarmConfig, ...asRecord(pluginConfig) };
  return {
    enabled: requiredBooleanValue(config.enabled ?? env.OPENCLAW_AGENT_OBSERVER_ENABLED, 'enabled'),
    redisHost: stringValue(config.redisHost ?? env.REDIS_HOST),
    redisPort: positivePort(config.redisPort ?? env.REDIS_PORT),
    redisUsername: stringValue(config.redisUsername ?? env.REDIS_USERNAME),
    redisPassword: stringValue(config.redisPassword ?? env.REDIS_PASSWORD),
    redisTls: boolValue(config.redisTls ?? env.REDIS_TLS ?? env.REDIS_TLS_ENABLED, false),
    redisNetworkIsolation: config.redisNetworkIsolation as boolean | string | undefined ?? stringValue(env.REDIS_NETWORK_ISOLATION),
    maxEventBytes: normalizeAgentObservabilityMaxEventBytes(config.maxEventBytes ?? env.OPENCLAW_AGENT_OBSERVER_MAX_EVENT_BYTES),
    maxQueuePerStream: positiveInteger(config.maxQueuePerStream ?? env.OPENCLAW_AGENT_OBSERVER_MAX_QUEUE_PER_STREAM, 'maxQueuePerStream'),
    redisCommandTimeoutMs: positiveInteger(config.redisCommandTimeoutMs ?? env.OPENCLAW_AGENT_OBSERVER_REDIS_COMMAND_TIMEOUT_MS, 'redisCommandTimeoutMs'),
    streamMaxLen: positiveInteger(config.streamMaxLen ?? env.OPENCLAW_AGENT_OBSERVER_STREAM_MAXLEN, 'streamMaxLen'),
    deadLetterMaxLen: positiveInteger(config.deadLetterMaxLen ?? env.OPENCLAW_AGENT_OBSERVER_DEADLETTER_MAXLEN, 'deadLetterMaxLen'),
    controlWriteMaxAttempts: positiveInteger(config.controlWriteMaxAttempts ?? env.OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_MAX_ATTEMPTS, 'controlWriteMaxAttempts'),
    controlWriteRetryBaseMs: positiveInteger(config.controlWriteRetryBaseMs ?? env.OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_BASE_MS, 'controlWriteRetryBaseMs'),
    controlWriteRetryMaxMs: positiveInteger(config.controlWriteRetryMaxMs ?? env.OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_MAX_MS, 'controlWriteRetryMaxMs'),
    hookPriority: integerValue(config.hookPriority ?? env.OPENCLAW_AGENT_OBSERVER_HOOK_PRIORITY, 'hookPriority'),
    hookTimeoutMs: positiveInteger(config.hookTimeoutMs ?? env.OPENCLAW_AGENT_OBSERVER_HOOK_TIMEOUT_MS, 'hookTimeoutMs'),
  };
}
