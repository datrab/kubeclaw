import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';

const TARGET_ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const TARGET_KEYS = new Set(['endpoint', 'endpointOrigin', 'endpointSecret', 'tokenSecret', 'maxPayloadBytes', 'format', 'receiptEndpoint']);

export interface TargetConfig {
  readonly endpoint?: string;
  readonly receiptEndpoint?: string;
  readonly endpointOrigin?: string;
  readonly endpointSecret?: string;
  readonly tokenSecret?: string;
  readonly maxPayloadBytes: number;
  readonly format: 'json' | 'discord_webhook';
}
export interface OperatorConfig {
  readonly targets: ReadonlyMap<string, TargetConfig>;
  readonly deliveryRoot: string;
  readonly maximumDeliveryRecords: number;
  readonly maximumDeliveryBytes: number;
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

function receiptConfig(raw: Record<string, unknown>, targetId: string, origin: string): { readonly receiptEndpoint?: string } {
  if (raw.receiptEndpoint === undefined) return {};
  const endpoint = parseUrl(raw.receiptEndpoint, `OPERATOR_CONFIG_INVALID:receiptEndpoint:${targetId}`);
  validateEndpoint(endpoint, targetId, false);
  if (endpoint.origin !== origin) throw new Error('OPERATOR_RECEIPT_ORIGIN_DENIED');
  return { receiptEndpoint: endpoint.href };
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
    return Object.freeze({ ...receiptConfig(raw, targetId, endpointOrigin.origin), endpointOrigin: endpointOrigin.origin, endpointSecret: raw.endpointSecret, maxPayloadBytes, format });
  }
  const endpoint = parseUrl(raw.endpoint, `OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
  validateEndpoint(endpoint, targetId, false);
  if (typeof raw.tokenSecret !== 'string' || !TARGET_ID.test(raw.tokenSecret)) {
    throw new Error(`OPERATOR_CONFIG_INVALID:tokenSecret:${targetId}`);
  }
  return Object.freeze({ ...receiptConfig(raw, targetId, endpoint.origin), endpoint: endpoint.href, tokenSecret: raw.tokenSecret, maxPayloadBytes, format });
}

export function parseConfig(config: AdapterActivationContext['config']): OperatorConfig {
  exactKeys(config as Record<string, unknown>, new Set([
    'targets', 'deliveryRoot', 'maximumDeliveryRecords', 'maximumDeliveryBytes',
  ]), 'OPERATOR_CONFIG_UNKNOWN_FIELD');
  if (!isRecord(config.targets) || Object.keys(config.targets).length < 1) throw new Error('OPERATOR_CONFIG_INVALID:targets');
  if (typeof config.deliveryRoot !== 'string' || config.deliveryRoot.length === 0) {
    throw new Error('OPERATOR_CONFIG_INVALID:deliveryRoot');
  }
  const maximumDeliveryRecords = Number(config.maximumDeliveryRecords ?? 100_000);
  const maximumDeliveryBytes = Number(config.maximumDeliveryBytes ?? 256 * 1024 * 1024);
  if (!Number.isSafeInteger(maximumDeliveryRecords) || maximumDeliveryRecords < 1) {
    throw new Error('OPERATOR_CONFIG_INVALID:maximumDeliveryRecords');
  }
  if (!Number.isSafeInteger(maximumDeliveryBytes) || maximumDeliveryBytes < 1) {
    throw new Error('OPERATOR_CONFIG_INVALID:maximumDeliveryBytes');
  }
  return Object.freeze({
    targets: new Map(Object.entries(config.targets).map(([id, raw]) => [id, parseTarget(id, raw)])),
    deliveryRoot: config.deliveryRoot,
    maximumDeliveryRecords,
    maximumDeliveryBytes,
  });
}

export function isTargetId(value: string): boolean { return TARGET_ID.test(value); }
