// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

declare const process: {
  env: Record<string, string | undefined>;
};

export const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';
const STANDARD_PROFILE_NAME = 'standard';
const STANDARD_PROFILE_URL = new URL('./config-profiles/standard.json', import.meta.url);
const COMPACT_CONFIG_FIELDS = new Set(['_doc', 'profile', 'features', 'tuning', 'overrides', 'discord_webhook_url']);
const RUNTIME_DERIVED_FIELDS = new Set(['project', 'repo_root', 'paths']);
const STANDARD_FEATURES = {
  observability: true,
  buster: true,
  discord_alerts: true,
};
const STANDARD_TUNING = {
  safety_margins: 'high',
  retention: 'high',
  alerts: 'rich',
  logs: 'verbose',
  checks: 'strict',
  determinism: 'strict',
};

type AnyRecord = Record<string, any>;

function isPlainObject(value: any): value is AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

let cachedStandardProfile: AnyRecord | null = null;

function loadStandardProfile() {
  if (cachedStandardProfile) return cloneJson(cachedStandardProfile);
  try {
    cachedStandardProfile = JSON.parse(fs.readFileSync(STANDARD_PROFILE_URL, 'utf8'));
    return cloneJson(cachedStandardProfile);
  } catch (error) {
    throw new Error(`Standard swarm config profile invalid: ${STANDARD_PROFILE_URL.pathname}\n  ${(error as Error).message}`);
  }
}

function assertExactObject(input: any, expected: AnyRecord, label: string) {
  if (!isPlainObject(input)) {
    throw new Error(`${label}: required object`);
  }
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      throw new Error(`${label}.${key}: unknown key for ${STANDARD_PROFILE_NAME} profile`);
    }
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (input[key] !== expectedValue) {
      throw new Error(`${label}.${key}: ${STANDARD_PROFILE_NAME} profile requires ${JSON.stringify(expectedValue)}`);
    }
  }
}

function hasOwn(value: any, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertOverrideTargets(base: AnyRecord, overrides: AnyRecord, pathParts: string[] = []) {
  for (const [key, value] of Object.entries(overrides)) {
    const nextPath = [...pathParts, key];
    const label = `overrides.${nextPath.join('.')}`;
    if (!isPlainObject(base) || !hasOwn(base, key)) {
      throw new Error(`${label}: unknown effective config path`);
    }
    if (isPlainObject(value)) {
      if (!isPlainObject(base[key])) {
        throw new Error(`${label}: cannot merge object into non-object effective config value`);
      }
      assertOverrideTargets(base[key], value, nextPath);
    }
  }
}

function mergeKnownOverrides(target: AnyRecord, overrides: AnyRecord) {
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value)) {
      target[key] = mergeKnownOverrides({ ...target[key] }, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export function isCompactSwarmConfig(config: any) {
  return isPlainObject(config) && (
    hasOwn(config, 'profile') ||
    hasOwn(config, 'features') ||
    hasOwn(config, 'tuning') ||
    hasOwn(config, 'overrides')
  );
}

export function expandSwarmConfig(rawConfig: any) {
  if (!isCompactSwarmConfig(rawConfig)) return rawConfig;
  if (!isPlainObject(rawConfig)) throw new Error('swarm.config.json: required object');

  for (const key of Object.keys(rawConfig)) {
    if (!COMPACT_CONFIG_FIELDS.has(key) && !RUNTIME_DERIVED_FIELDS.has(key)) {
      throw new Error(`config.${key}: unknown compact swarm config field`);
    }
  }

  if (rawConfig.profile !== STANDARD_PROFILE_NAME) {
    throw new Error(`config.profile: only '${STANDARD_PROFILE_NAME}' is supported`);
  }
  assertExactObject(rawConfig.features, STANDARD_FEATURES, 'config.features');
  assertExactObject(rawConfig.tuning, STANDARD_TUNING, 'config.tuning');
  if (rawConfig.overrides !== undefined && !isPlainObject(rawConfig.overrides)) {
    throw new Error('config.overrides: required object when provided');
  }
  if (rawConfig.discord_webhook_url !== undefined && typeof rawConfig.discord_webhook_url !== 'string') {
    throw new Error('config.discord_webhook_url: must be a string');
  }

  const expanded = loadStandardProfile();
  if (rawConfig.discord_webhook_url !== undefined) {
    expanded.discord_webhook_url = rawConfig.discord_webhook_url;
  }
  for (const key of RUNTIME_DERIVED_FIELDS) {
    if (hasOwn(rawConfig, key)) expanded[key] = rawConfig[key];
  }
  const overrides = rawConfig.overrides || {};
  assertOverrideTargets(expanded, overrides);
  mergeKnownOverrides(expanded, overrides);
  return expanded;
}

export function normalizeSwarmConfigInPlace(config: any) {
  const expanded = expandSwarmConfig(config);
  if (expanded === config) return config;
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, expanded);
  return config;
}

export function discoverPlatformSwarmConfigCandidates() {
  return [...new Set([
    DEFAULT_SWARM_CONFIG_PATH,
    process.env.SWARM_CONFIG,
  ].filter(Boolean).map(candidate => path.resolve(candidate)))];
}

export function discoverSwarmConfigPath(candidates = discoverPlatformSwarmConfigCandidates()) {
  const normalizedCandidates = [...new Set(candidates.filter(Boolean).map(candidate => path.resolve(candidate)))];
  for (const candidate of normalizedCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return normalizedCandidates[0];
}

export function loadPlatformSwarmConfig(configPath = discoverSwarmConfigPath()) {
  const resolvedPath = path.resolve(configPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Swarm config missing: ${resolvedPath}\n` +
      `  Expected ${DEFAULT_SWARM_CONFIG_PATH}; SWARM_CONFIG is checked only as a secondary candidate`
    );
  }
  try {
    return {
      path: resolvedPath,
      config: expandSwarmConfig(JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))),
    };
  } catch (error) {
    throw new Error(
      `Swarm config invalid: ${resolvedPath}\n` +
      `  ${(error as Error).message}`
    );
  }
}
