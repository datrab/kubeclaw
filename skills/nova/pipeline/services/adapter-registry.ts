import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/adapter-registry.ts — Static adapter registry for critical pipeline extension points.
//
// Critical runtime adapters must resolve through this registry instead of loading
// arbitrary config-provided module paths. Only canonical registry keys and active
// runtime tool paths are accepted; non-registered values fail closed.

import path from 'path';
import { fileURLToPath } from 'url';

import redisTool from '../tools/redis.ts';
import { generateSummary as canonicalGenerateSummary } from '../tools/project-summary.ts';

const CANONICAL_REDIS_TOOL_PATH = path.resolve(fileURLToPath(new URL('../tools/redis.ts', import.meta.url)));
const CANONICAL_PROJECT_SUMMARY_PATH = path.resolve(fileURLToPath(new URL('../tools/project-summary.ts', import.meta.url)));
const PROJECT_SUMMARY_GENERATOR_KEY = 'pipeline-project-summary';

function normalizePathAlias(value) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) return null;
  if (!value.includes('/') && !value.startsWith('.')) return null;
  return path.resolve(value);
}

function normalizeKey(value, fallback) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) return fallback;
  const pathAlias = normalizePathAlias(value);
  if (pathAlias) return pathAlias;
  return value.trim().toLowerCase();
}

function adapterModuleAuthority(moduleValue) {
  if (moduleValue?.default !== undefined && moduleValue?.default !== null) return moduleValue.default;
  return moduleValue;
}

function buildRegistry(entries = []) {
  const registry = new Map();
  for (const [aliases, adapter] of entries) {
    for (const alias of aliases) registry.set(normalizeKey(alias, alias), adapter);
  }
  return registry;
}

const REDIS_ADAPTERS = buildRegistry([
  [[
    'redis',
    'canonical',
    'pipeline-redis',
    '/app/skills/pipeline/tools/redis.ts',
    CANONICAL_REDIS_TOOL_PATH,
  ], adapterModuleAuthority(redisTool)],
]);

const PROJECT_SUMMARY_GENERATORS = buildRegistry([
  [[
    'project-summary',
    'canonical',
    'pipeline-project-summary',
    '/app/skills/pipeline/tools/project-summary.ts',
    CANONICAL_PROJECT_SUMMARY_PATH,
  ], canonicalGenerateSummary],
]);

export class UnknownAdapterError extends Error {
  constructor(label, rawKey, fallbackKey, registeredKeys = []) {
    super(`${label}: '${selectTruthyValue(() => (selectTruthyValue(() => (rawKey), () => (fallbackKey))), () => ('missing_adapter_key'))}' is not a registered adapter. Use one of: ${registeredKeys.join(', ')}`);
    this.name = 'UnknownAdapterError';
  }
}

function resolveFromRegistry(registry, rawKey, fallbackKey, label) {
  const normalizedKey = normalizeKey(rawKey, fallbackKey);
  const adapter = registry.get(normalizedKey);
  if (!adapter) {
    throw new UnknownAdapterError(label, rawKey, fallbackKey, [...registry.keys()]);
  }
  return { adapter, key: normalizedKey };
}

function projectSummaryGeneratorKey(config) {
  if (config?.paths?.project_summary_generator !== undefined) {
    return normalizeKey(config.paths.project_summary_generator, PROJECT_SUMMARY_GENERATOR_KEY);
  }
  if (config?.paths?.project_summary_adapter !== undefined) return config.paths.project_summary_adapter;
  if (config?.paths?.project_summary_js !== undefined) return config.paths.project_summary_js;
  return PROJECT_SUMMARY_GENERATOR_KEY;
}

function validateMethods(adapter, methods = [], label) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== 'function') {
      throw new Error(`${label}: registered adapter must expose ${method}(...)`);
    }
  }
}

export function resolveRegisteredRedisAdapter(config = {}, {
  agentType = null,
  source = 'redis',
  requiredMethods = [],
} = {}) {
  const agentConf = agentType
    ? config?.agents?.[agentType]
    : Object.values(selectDefinedValue(() => (config?.agents), () => ({}))).find(a => typeof a === 'object' && a?.dispatch === 'redis');
  const rawKey = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (agentConf?.redis_adapter), () => (agentConf?.redis_adapter_id))), () => (agentConf?.redis_js_path))), () => ('pipeline-redis'));
  const result = resolveFromRegistry(REDIS_ADAPTERS, rawKey, 'pipeline-redis', `${source} Redis adapter`);
  validateMethods(result.adapter, requiredMethods, `${source} Redis adapter '${rawKey}'`);
  return result;
}

export function resolveRegisteredProjectSummaryGenerator(config = {}) {
  const rawKey = projectSummaryGeneratorKey(config);
  const result = resolveFromRegistry(PROJECT_SUMMARY_GENERATORS, rawKey, PROJECT_SUMMARY_GENERATOR_KEY, 'project_summary generator');
  if (typeof result.adapter !== 'function') {
    throw new Error(`project_summary generator '${rawKey}' must be a function`);
  }
  return { generateSummary: result.adapter, key: result.key };
}

export function listRegisteredAdapters() {
  return {
    redis: [...REDIS_ADAPTERS.keys()],
    project_summary: [...PROJECT_SUMMARY_GENERATORS.keys()],
  };
}
