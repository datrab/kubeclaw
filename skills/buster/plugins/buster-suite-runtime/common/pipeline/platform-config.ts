import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';
declare const process: {
  env: Record<string, string | undefined>;
};

export const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';
const STANDARD_PROFILE_NAME = 'standard';
function resolveProfileUrl(file: string): URL {
  const packaged = new URL(`./config-profiles/${file}`, import.meta.url);
  if (fs.existsSync(packaged)) return packaged;
  let cursor = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(cursor, 'common', 'pipeline', 'config-profiles', file);
    if (fs.existsSync(candidate)) return pathToFileURL(candidate);
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`config profile asset not found: ${file}`);
    cursor = parent;
  }
}
const PROFILE_URLS: Record<string, URL> = {
  [STANDARD_PROFILE_NAME]: resolveProfileUrl('standard.json'),
};
const COMPACT_CONFIG_FIELDS = new Set(['_doc', 'profile', 'features', 'tuning', 'overrides', 'discord_webhook_url', 'run_id']);
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

const cachedProfiles = new Map<string, AnyRecord>();

function loadProfile(profileName: string, stack: string[] = []): AnyRecord {
  if (cachedProfiles.has(profileName)) return cloneJson(cachedProfiles.get(profileName) as AnyRecord);
  const profileUrl = PROFILE_URLS[profileName];
  if (!profileUrl) {
    throw new Error(`config.profile: supported profiles are ${Object.keys(PROFILE_URLS).map((name) => `'${name}'`).join(', ')}`);
  }
  if (stack.includes(profileName)) {
    throw new Error(`config.profile: circular profile inheritance: ${[...stack, profileName].join(' -> ')}`);
  }
  try {
    const rawProfile = JSON.parse(fs.readFileSync(profileUrl, 'utf8'));
    let profile;
    if (typeof rawProfile?.extends === 'string') {
      profile = loadProfile(rawProfile.extends, [...stack, profileName]);
      const overrides = configOverrides(rawProfile.overrides, 'profile.overrides');
      assertOverrideTargets(profile, overrides, [], `profile.${profileName}.overrides`);
      mergeKnownOverrides(profile, overrides);
      if (typeof rawProfile._doc === 'string') profile._doc = rawProfile._doc;
    } else {
      profile = rawProfile;
    }
    cachedProfiles.set(profileName, cloneJson(profile));
    return cloneJson(profile);
  } catch (error) {
    throw new Error(`Swarm config profile '${profileName}' invalid: ${profileUrl.pathname}\n  ${(error as Error).message}`);
  }
}

function assertExactObject(input: any, expected: AnyRecord, label: string) {
  if (!isPlainObject(input)) {
    throw new Error(`${label}: required object`);
  }
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      throw new Error(`${label}.${key}: unsupported key for ${STANDARD_PROFILE_NAME} profile`);
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

function configOverrides(value: any, label: string) {
  if (value === undefined) return {};
  if (isPlainObject(value)) return value;
  throw new Error(`${label}: required object when provided`);
}

function assertOverrideTargets(base: AnyRecord, overrides: AnyRecord, pathParts: string[] = [], labelPrefix = 'overrides') {
  for (const [key, value] of Object.entries(overrides)) {
    const nextPath = [...pathParts, key];
    const label = `${labelPrefix}.${nextPath.join('.')}`;
    if (selectTruthyValue(() => (!isPlainObject(base)), () => (!hasOwn(base, key)))) {
      throw new Error(`${label}: unsupported effective config path`);
    }
    if (isPlainObject(value)) {
      if (!isPlainObject(base[key])) {
        throw new Error(`${label}: cannot merge object into non-object effective config value`);
      }
      assertOverrideTargets(base[key], value, nextPath, labelPrefix);
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

function substituteProfileTemplates(value: any, context: AnyRecord, pathParts: string[] = []): any {
  if (typeof value === 'string') {
    return value.replace(/\$\{([a-z_]+)\}/g, (match: string, key: string): string => {
      const replacement = context[key];
      if (selectTruthyValue(() => (typeof replacement !== 'string'), () => (!replacement.trim()))) {
        throw new Error(`config.${pathParts.join('.')}: profile placeholder ${match} requires config.${key} or ${key.toUpperCase()}`);
      }
      return replacement;
    });
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => substituteProfileTemplates(entry, context, [...pathParts, String(index)]));
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      value[key] = substituteProfileTemplates(child, context, [...pathParts, key]);
    }
  }
  return value;
}

export function isCompactSwarmConfig(config: any) {
  return isPlainObject(config) && hasCompactConfigAuthority(config);
}

function hasCompactConfigAuthority(config: AnyRecord) {
  for (const field of ['profile', 'features', 'tuning', 'overrides']) {
    if (hasOwn(config, field)) return true;
  }
  return false;
}

export function expandSwarmConfig(rawConfig: any) {
  if (!isCompactSwarmConfig(rawConfig)) return rawConfig;
  if (!isPlainObject(rawConfig)) throw new Error('swarm.config.json: required object');

  for (const key of Object.keys(rawConfig)) {
    if (!COMPACT_CONFIG_FIELDS.has(key) && !RUNTIME_DERIVED_FIELDS.has(key)) {
      throw new Error(`config.${key}: unsupported compact swarm config field`);
    }
  }

  if (!PROFILE_URLS[rawConfig.profile]) {
    throw new Error(`config.profile: supported profiles are ${Object.keys(PROFILE_URLS).map((name) => `'${name}'`).join(', ')}`);
  }
  assertExactObject(rawConfig.features, STANDARD_FEATURES, 'config.features');
  assertExactObject(rawConfig.tuning, STANDARD_TUNING, 'config.tuning');
  if (rawConfig.overrides !== undefined && !isPlainObject(rawConfig.overrides)) {
    throw new Error('config.overrides: required object when provided');
  }
  if (rawConfig.discord_webhook_url !== undefined && typeof rawConfig.discord_webhook_url !== 'string') {
    throw new Error('config.discord_webhook_url: must be a string');
  }

  const expanded = loadProfile(rawConfig.profile);
  if (rawConfig.discord_webhook_url !== undefined) {
    expanded.discord_webhook_url = rawConfig.discord_webhook_url;
  }
  for (const key of RUNTIME_DERIVED_FIELDS) {
    if (hasOwn(rawConfig, key)) expanded[key] = rawConfig[key];
  }
  if (hasOwn(rawConfig, 'run_id')) expanded.run_id = rawConfig.run_id;
  const overrides = configOverrides(rawConfig.overrides, 'config.overrides');
  assertOverrideTargets(expanded, overrides);
  mergeKnownOverrides(expanded, overrides);
  substituteProfileTemplates(expanded, {
    repo_root: rawConfig.repo_root
  });
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
    process.env.SWARM_CONFIG,
    DEFAULT_SWARM_CONFIG_PATH,
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
    .map(candidate => path.resolve(candidate)))];
}

export function discoverSwarmConfigPath(candidates = discoverPlatformSwarmConfigCandidates()): string {
  const normalizedCandidates = [...new Set(candidates.filter(Boolean).map(candidate => path.resolve(candidate)))];
  for (const candidate of normalizedCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return normalizedCandidates[0] ?? DEFAULT_SWARM_CONFIG_PATH;
}

export function loadPlatformSwarmConfig(configPath: string = discoverSwarmConfigPath()) {
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
