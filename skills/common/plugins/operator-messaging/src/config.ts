import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';

const TARGET_ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const TARGET_KEYS = new Set(['endpoint', 'endpointOrigin', 'endpointSecret', 'tokenSecret', 'maxPayloadBytes', 'format']);

export interface TargetConfig {
  readonly endpoint?: string;
  readonly endpointOrigin?: string;
  readonly endpointSecret?: string;
  readonly tokenSecret?: string;
  readonly maxPayloadBytes: number;
  readonly format: 'json' | 'discord_webhook';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, error: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${error}:${key}`);
}

function parseUrl(value: unknown, error: string): URL {
  if (typeof value !== 'string') throw new Error(error);
  try { return new URL(value); } catch { throw new Error(error); }
}

function validateEndpoint(endpoint: URL, targetId: string, originOnly: boolean): void {
  const invalidBase = !['http:', 'https:'].includes(endpoint.protocol)
    || Boolean(endpoint.username) || Boolean(endpoint.password) || Boolean(endpoint.hash);
  const invalidOrigin = originOnly && (endpoint.pathname !== '/' || Boolean(endpoint.search));
  if (invalidBase || invalidOrigin) throw new Error(`OPERATOR_CONFIG_INVALID:endpoint${originOnly ? 'Origin' : ''}:${targetId}`);
}

function parsePayloadLimit(value: unknown, targetId: string): number {
  const limit = value ?? 65_536;
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 1_048_576) {
    throw new Error(`OPERATOR_CONFIG_INVALID:maxPayloadBytes:${targetId}`);
  }
  return Number(limit);
}

function parseTarget(targetId: string, raw: unknown): TargetConfig {
  if (!TARGET_ID.test(targetId) || !isRecord(raw)) throw new Error(`OPERATOR_CONFIG_INVALID:target:${targetId}`);
  exactKeys(raw, TARGET_KEYS, 'OPERATOR_CONFIG_UNKNOWN_TARGET_FIELD');
  const usesSecretEndpoint = raw.endpointSecret !== undefined || raw.endpointOrigin !== undefined;
  if (usesSecretEndpoint === (raw.endpoint !== undefined)) throw new Error(`OPERATOR_CONFIG_INVALID:endpoint_mode:${targetId}`);
  const maxPayloadBytes = parsePayloadLimit(raw.maxPayloadBytes, targetId);
  const format = raw.format ?? 'json';
  if (format !== 'json' && format !== 'discord_webhook') throw new Error(`OPERATOR_CONFIG_INVALID:format:${targetId}`);
  if (usesSecretEndpoint) {
    if (typeof raw.endpointSecret !== 'string' || !TARGET_ID.test(raw.endpointSecret)) {
      throw new Error(`OPERATOR_CONFIG_INVALID:endpointSecret:${targetId}`);
    }
    const endpointOrigin = parseUrl(raw.endpointOrigin, `OPERATOR_CONFIG_INVALID:endpointOrigin:${targetId}`);
    validateEndpoint(endpointOrigin, targetId, true);
    return Object.freeze({ endpointOrigin: endpointOrigin.origin, endpointSecret: raw.endpointSecret, maxPayloadBytes, format });
  }
  const endpoint = parseUrl(raw.endpoint, `OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
  validateEndpoint(endpoint, targetId, false);
  if (typeof raw.tokenSecret !== 'string' || !TARGET_ID.test(raw.tokenSecret)) {
    throw new Error(`OPERATOR_CONFIG_INVALID:tokenSecret:${targetId}`);
  }
  return Object.freeze({ endpoint: endpoint.href, tokenSecret: raw.tokenSecret, maxPayloadBytes, format });
}

export function parseConfig(config: AdapterActivationContext['config']): ReadonlyMap<string, TargetConfig> {
  exactKeys(config as Record<string, unknown>, new Set(['targets']), 'OPERATOR_CONFIG_UNKNOWN_FIELD');
  if (!isRecord(config.targets) || Object.keys(config.targets).length < 1) throw new Error('OPERATOR_CONFIG_INVALID:targets');
  return new Map(Object.entries(config.targets).map(([id, raw]) => [id, parseTarget(id, raw)]));
}

export function isTargetId(value: string): boolean { return TARGET_ID.test(value); }
