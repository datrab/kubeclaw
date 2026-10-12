// Local Redis transport for the OpenClaw plugin runtime.
// Keep this plugin self-contained: do not import from the pipeline skill tree.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url) as (id: string) => unknown;

const REDIS_TRANSPORT_POLICY_ERROR_CODE = 'SECURE_REDIS_TRANSPORT_POLICY_VIOLATION';
export const MISSING_DEPENDENCY_ERROR_CODE = 'MISSING_DEPENDENCY';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'required', 'enabled']);
const ISOLATION_VALUES = new Set(['1', 'true', 'yes', 'on', 'required', 'enabled', 'isolated', 'network-policy', 'network_policy', 'documented']);

type RedisCtor = new (options: Record<string, unknown>) => unknown;
type RedisModule = RedisCtor | { default?: RedisCtor };

export class RedisTransportPolicyError extends Error {
  readonly code = REDIS_TRANSPORT_POLICY_ERROR_CODE;
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(`Secure Redis transport policy violation: ${message}`);
    this.name = 'RedisTransportPolicyError';
    this.details = details;
  }
}

export class MissingDependencyError extends Error {
  readonly code = MISSING_DEPENDENCY_ERROR_CODE;
  readonly dependency: string;

  constructor(dependency: string, cause: unknown = null) {
    super(`Missing required dependency: ${dependency}`);
    this.name = 'MissingDependencyError';
    this.dependency = dependency;
    if (cause) this.cause = cause;
  }
}

export function loadRedisCtor(): RedisCtor {
  try {
    const mod = require('ioredis') as RedisModule;
    const ctor = typeof mod === 'function' ? mod : mod.default;
    if (!ctor) throw new Error('ioredis default export missing');
    return ctor;
  } catch (error) {
    throw new MissingDependencyError('ioredis', error);
  }
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return false;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function normalizeIsolation(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return false;
  return ISOLATION_VALUES.has(String(value).trim().toLowerCase());
}

function normalizeRedisPort(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    throw new RedisTransportPolicyError('REDIS_PORT is required for agent observability Redis clients', { port: value });
  }
  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new RedisTransportPolicyError('REDIS_PORT must be an integer between 1 and 65535', { port: value });
  }
  return port;
}

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function isLocalRedisHost(host: unknown): boolean {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized.startsWith('127.');
}

function configuredRedisValue(
  opts: Record<string, unknown>,
  env: Record<string, unknown>,
  optionKey: string,
  environmentKey: string,
): unknown {
  return opts[optionKey] !== undefined ? opts[optionKey] : env[environmentKey];
}

function buildResolvedRedisOptions(
  host: string,
  port: number,
  username: string | undefined,
  password: string | undefined,
  tlsEnabled: boolean,
  tlsOptions: unknown,
): Record<string, unknown> {
  const redisOptions: Record<string, unknown> = { host, port };
  if (username) redisOptions.username = username;
  if (password) redisOptions.password = password;
  if (tlsEnabled) redisOptions.tls = tlsOptions || {};
  return redisOptions;
}

export function resolveRedisTransportConfig(opts: Record<string, unknown> = {}, env: Record<string, unknown> = {}): {
  redisOptions: Record<string, unknown>;
  policy: Record<string, unknown>;
} {
  const host = normalizeString(configuredRedisValue(opts, env, 'host', 'REDIS_HOST'));
  if (!host) {
    throw new RedisTransportPolicyError('REDIS_HOST is required for agent observability Redis clients');
  }
  const port = normalizeRedisPort(configuredRedisValue(opts, env, 'port', 'REDIS_PORT'));
  const password = normalizeString(configuredRedisValue(opts, env, 'password', 'REDIS_PASSWORD')) ?? undefined;
  const username = normalizeString(configuredRedisValue(opts, env, 'username', 'REDIS_USERNAME')) ?? undefined;
  const tlsEnabled = normalizeBoolean(configuredRedisValue(opts, env, 'tls', 'REDIS_TLS'));
  const networkIsolation = normalizeIsolation(configuredRedisValue(opts, env, 'networkIsolation', 'REDIS_NETWORK_ISOLATION'));
  const enforceSecureMode = opts.enforceSecureMode !== false;

  const hasSecureTransport = [password, tlsEnabled, networkIsolation].some(Boolean);
  if (!hasSecureTransport && enforceSecureMode) {
    throw new RedisTransportPolicyError('REDIS_PASSWORD, REDIS_TLS=true, or REDIS_NETWORK_ISOLATION=isolated is required for non-local Redis clients', {
      host,
      port,
      tls: tlsEnabled,
      networkIsolation,
    });
  }

  if (!enforceSecureMode && !hasSecureTransport && !isLocalRedisHost(host)) {
    throw new RedisTransportPolicyError('insecure verification mode is restricted to localhost Redis endpoints', { host, port });
  }

  return {
    redisOptions: buildResolvedRedisOptions(host, port, username, password, tlsEnabled, opts.tlsOptions),
    policy: {
      enforceSecureMode,
      authenticated: Boolean(password),
      tls: tlsEnabled,
      networkIsolation,
      insecureLocalVerification: !hasSecureTransport && !enforceSecureMode,
    },
  };
}

function buildRedisClientOptions(
  transportOpts: Record<string, unknown> = {},
  clientOpts: Record<string, unknown> = {},
  env: Record<string, unknown> = {},
): Record<string, unknown> {
  const { redisOptions } = resolveRedisTransportConfig(transportOpts, env);
  return { ...clientOpts, ...redisOptions };
}

export function createRedisClient(
  RedisCtor: RedisCtor,
  transportOpts: Record<string, unknown> = {},
  clientOpts: Record<string, unknown> = {},
  env: Record<string, unknown> = {},
): unknown {
  return new RedisCtor(buildRedisClientOptions(transportOpts, clientOpts, env));
}
