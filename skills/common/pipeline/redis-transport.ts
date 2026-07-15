// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { createRequire } from 'module';

import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';
const require = createRequire(import.meta.url);

declare const process: {
  env: Record<string, string | undefined>;
};

export const REDIS_TRANSPORT_POLICY_ERROR_CODE = 'SECURE_REDIS_TRANSPORT_POLICY_VIOLATION';
export const MISSING_DEPENDENCY_ERROR_CODE = 'MISSING_DEPENDENCY';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'required', 'enabled']);
const ISOLATION_VALUES = new Set(['1', 'true', 'yes', 'on', 'required', 'enabled', 'isolated', 'network-policy', 'network_policy', 'documented']);

type RedisPolicyDetails = Record<string, unknown>;

type RedisTransportOptions = {
  host?: unknown;
  redisHost?: unknown;
  port?: unknown;
  redisPort?: unknown;
  password?: unknown;
  redisPassword?: unknown;
  username?: unknown;
  redisUsername?: unknown;
  tls?: unknown;
  redisTls?: unknown;
  tlsOptions?: unknown;
  networkIsolation?: unknown;
  redisNetworkIsolation?: unknown;
  enforceSecureMode?: boolean;
};

type RedisClientOptions = Record<string, unknown>;

type RedisCtor = new (options: RedisClientOptions) => unknown;

export class RedisTransportPolicyError extends Error {
  code: string;
  details: RedisPolicyDetails;

  constructor(message: string, details: RedisPolicyDetails = {}) {
    super(`Secure Redis transport policy violation: ${message}`);
    this.name = 'RedisTransportPolicyError';
    this.code = REDIS_TRANSPORT_POLICY_ERROR_CODE;
    this.details = details;
  }
}

export class MissingDependencyError extends Error {
  code: string;
  dependency: string;
  cause?: unknown;

  constructor(dependency: string, cause: unknown = null) {
    super(`Missing required dependency: ${dependency}`);
    this.name = 'MissingDependencyError';
    this.code = MISSING_DEPENDENCY_ERROR_CODE;
    this.dependency = dependency;
    if (cause) this.cause = cause;
  }
}

export function loadRedisCtor() {
  try {
    const mod = require('ioredis');
    return redisConstructorAuthority(mod);
  } catch (error) {
    throw new MissingDependencyError('ioredis', error);
  }
}

function redisConstructorAuthority(mod: any): any {
  if (mod?.default) return mod.default;
  return mod;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return false;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function normalizeIsolation(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return false;
  return ISOLATION_VALUES.has(String(value).trim().toLowerCase());
}

function normalizeRedisPort(value: unknown) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) {
    throw new RedisTransportPolicyError('REDIS_PORT is required', { port: value });
  }
  const normalized = String(value).trim();
  const port = /^[0-9]+$/.test(normalized) ? Number(normalized) : NaN;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!Number.isInteger(port)), () => (port <= 0))), () => (port > 65535))) {
    throw new RedisTransportPolicyError('REDIS_PORT must be an integer between 1 and 65535', { port: value });
  }
  return port;
}

function normalizeString(value: unknown) {
  const normalized = String(value == null ? '' : value).trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function normalizeTlsOptions(value: unknown): RedisClientOptions {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RedisClientOptions : {};
}

function isLocalRedisHost(host: unknown) {
  const normalized = String(selectDefinedValue(() => (host), () => (''))).trim().toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (normalized === 'localhost'), () => (normalized === '::1'))), () => (normalized === '[::1]'))), () => (normalized.startsWith('127.')));
}

export function resolveRedisTransportConfig(opts: RedisTransportOptions = {}, env: Record<string, string | undefined> = process.env) {
  const host = normalizeString(selectDefinedValue(() => (opts.host), () => (opts.redisHost), () => (env.REDIS_HOST)));
  if (!host) throw new RedisTransportPolicyError('REDIS_HOST is required', { host });
  const port = normalizeRedisPort(selectDefinedValue(() => (opts.port), () => (opts.redisPort), () => (env.REDIS_PORT)));
  const password = selectTruthyValue(() => (normalizeString(selectDefinedValue(() => (opts.password), () => (opts.redisPassword), () => (env.REDIS_PASSWORD)))), () => (undefined));
  const username = selectTruthyValue(() => (normalizeString(selectDefinedValue(() => (opts.username), () => (opts.redisUsername), () => (env.REDIS_USERNAME)))), () => (undefined));
  const tlsEnabled = normalizeBoolean(selectDefinedValue(() => (opts.tls), () => (opts.redisTls), () => (env.REDIS_TLS)));
  const networkIsolation = normalizeIsolation(selectDefinedValue(() => (opts.networkIsolation), () => (opts.redisNetworkIsolation), () => (env.REDIS_NETWORK_ISOLATION)));
  const enforceSecureMode = opts.enforceSecureMode !== false;

  const hasSecureTransport = Boolean(selectTruthyValue(() => (selectTruthyValue(() => (password), () => (tlsEnabled))), () => (networkIsolation)));
  if (!hasSecureTransport && enforceSecureMode) {
    throw new RedisTransportPolicyError('REDIS_PASSWORD, REDIS_TLS=true, or REDIS_NETWORK_ISOLATION=isolated is required for non-local Redis clients', {
      host,
      port,
      tls: tlsEnabled,
      networkIsolation,
    });
  }

  if (!enforceSecureMode && !hasSecureTransport && !isLocalRedisHost(host)) {
    throw new RedisTransportPolicyError('insecure verification mode is restricted to localhost Redis endpoints', {
      host,
      port,
    });
  }

  const redisOptions: RedisClientOptions = { host, port };
  if (username) redisOptions.username = username;
  if (password) redisOptions.password = password;
  if (tlsEnabled) redisOptions.tls = normalizeTlsOptions(selectDefinedValue(() => (opts.tlsOptions), () => ({})));

  return {
    redisOptions,
    policy: {
      enforceSecureMode,
      authenticated: Boolean(password),
      tls: tlsEnabled,
      networkIsolation,
      insecureLocalVerification: !hasSecureTransport && !enforceSecureMode,
    },
  };
}

export function buildRedisClientOptions(
  transportOpts: RedisTransportOptions = {},
  clientOpts: RedisClientOptions = {},
  env: Record<string, string | undefined> = process.env,
) {
  const { redisOptions } = resolveRedisTransportConfig(transportOpts, env);
  return { ...clientOpts, ...redisOptions };
}

export function createRedisClient(
  RedisCtorImpl: RedisCtor,
  transportOpts: RedisTransportOptions = {},
  clientOpts: RedisClientOptions = {},
  env: Record<string, string | undefined> = process.env,
) {
  return new RedisCtorImpl(buildRedisClientOptions(transportOpts, clientOpts, env));
}
