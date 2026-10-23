import {capturePayloadStructure, OPERATOR_PAYLOAD_PROTOCOL_LIMITS, type PayloadStructure} from './payload-structure.ts';
import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';

const TARGET_ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const TARGET_KEYS = new Set(['endpoint', 'endpointOrigin', 'endpointSecret', 'tokenSecret', 'payloadProfile', 'format', 'receiptEndpoint']);

export interface TargetConfig {
  readonly payloadStructure: PayloadStructure;
  readonly endpoint?: string;
  readonly receiptEndpoint?: string;
  readonly endpointOrigin?: string;
  readonly endpointSecret?: string;
  readonly tokenSecret?: string;
  readonly maxPayloadBytes: number;
  readonly format: 'json' | 'discord_webhook';
}
export interface OperatorConfig {
  readonly failureExcerptCharacters: number;
  readonly targets: ReadonlyMap<string, TargetConfig>;
  readonly deliveryRoot: string;
  readonly maximumDeliveryRecords: number;
  readonly maximumDeliveryBytes: number;
  readonly maximumRecordBytes: number;
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
  const limit = value;
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

function parseTarget(targetId: string, raw: unknown, profiles: ReadonlyMap<string, number>, payloadStructure: PayloadStructure): TargetConfig {
  if (!TARGET_ID.test(targetId) || !isRecord(raw)) throw new Error(`OPERATOR_CONFIG_INVALID:target:${targetId}`);
  exactKeys(raw, TARGET_KEYS, 'OPERATOR_CONFIG_UNKNOWN_TARGET_FIELD');
  const usesSecretEndpoint = raw.endpointSecret !== undefined || raw.endpointOrigin !== undefined;
  if (usesSecretEndpoint === (raw.endpoint !== undefined)) throw new Error(`OPERATOR_CONFIG_INVALID:endpoint_mode:${targetId}`);
  if (typeof raw.payloadProfile !== 'string' || !profiles.has(raw.payloadProfile)) throw new Error(`OPERATOR_CONFIG_INVALID:payloadProfile:${targetId}`);
  const maxPayloadBytes = profiles.get(raw.payloadProfile)!;
  const format = raw.format ?? 'json';
  if (format !== 'json' && format !== 'discord_webhook') throw new Error(`OPERATOR_CONFIG_INVALID:format:${targetId}`);
  if (usesSecretEndpoint) {
    if (typeof raw.endpointSecret !== 'string' || !TARGET_ID.test(raw.endpointSecret)) {
      throw new Error(`OPERATOR_CONFIG_INVALID:endpointSecret:${targetId}`);
    }
    const endpointOrigin = parseUrl(raw.endpointOrigin, `OPERATOR_CONFIG_INVALID:endpointOrigin:${targetId}`);
    validateEndpoint(endpointOrigin, targetId, true);
    return Object.freeze({ payloadStructure, ...receiptConfig(raw, targetId, endpointOrigin.origin), endpointOrigin: endpointOrigin.origin, endpointSecret: raw.endpointSecret, maxPayloadBytes, format });
  }
  const endpoint = parseUrl(raw.endpoint, `OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
  validateEndpoint(endpoint, targetId, false);
  if (typeof raw.tokenSecret !== 'string' || !TARGET_ID.test(raw.tokenSecret)) {
    throw new Error(`OPERATOR_CONFIG_INVALID:tokenSecret:${targetId}`);
  }
  return Object.freeze({ payloadStructure, ...receiptConfig(raw, targetId, endpoint.origin), endpoint: endpoint.href, tokenSecret: raw.tokenSecret, maxPayloadBytes, format });
}

export function parseConfig(config: AdapterActivationContext['config']): OperatorConfig {
  exactKeys(config as Record<string, unknown>, new Set([
    'payloadPolicyVersion', 'payloadStructure', 'targets', 'deliveryRoot', 'maximumDeliveryRecords', 'maximumDeliveryBytes', 'maximumRecordBytes', 'targetPayloadProfiles', 'failureExcerptCharacters',
  ]), 'OPERATOR_CONFIG_UNKNOWN_FIELD');
  if (!isRecord(config.targetPayloadProfiles) || Object.keys(config.targetPayloadProfiles).length === 0) throw new Error('OPERATOR_CONFIG_INVALID:targetPayloadProfiles');
  const current = config.payloadPolicyVersion === 'operator-payload.v2';
  if ((!current && Object.hasOwn(config, 'payloadPolicyVersion')) || current !== Object.hasOwn(config,'payloadStructure')) throw new Error('OPERATOR_PAYLOAD_STRUCTURE_VERSION_INVALID');
  // The absent discriminator is the original closed receiver contract. This
  // preserves old captures; v2 always requires an explicitly selected policy.
  const payloadStructure = current ? capturePayloadStructure(config.payloadStructure) : OPERATOR_PAYLOAD_PROTOCOL_LIMITS;
  const profiles = new Map<string, number>();
  for (const [id, value] of Object.entries(config.targetPayloadProfiles)) {
    if (!/^[a-z][a-z0-9._-]{0,127}$/.test(id) || !isRecord(value)) throw new Error('OPERATOR_CONFIG_INVALID:targetPayloadProfiles');
    exactKeys(value, new Set(['maxPayloadBytes']), 'OPERATOR_CONFIG_INVALID:profile');
    profiles.set(id, parsePayloadLimit(value.maxPayloadBytes, id));
  }
  if (!isRecord(config.targets) || Object.keys(config.targets).length < 1) throw new Error('OPERATOR_CONFIG_INVALID:targets');
  if (typeof config.deliveryRoot !== 'string' || config.deliveryRoot.length === 0) {
    throw new Error('OPERATOR_CONFIG_INVALID:deliveryRoot');
  }
  const maximumDeliveryRecords = Number(config.maximumDeliveryRecords);
  const maximumDeliveryBytes = Number(config.maximumDeliveryBytes);
  const maximumRecordBytes = config.maximumRecordBytes;
  if (!Number.isSafeInteger(maximumRecordBytes) || Number(maximumRecordBytes) < 1) throw new Error('OPERATOR_CONFIG_INVALID:maximumRecordBytes');
  if (typeof config.maximumDeliveryRecords !== 'number' || !Number.isSafeInteger(maximumDeliveryRecords) || maximumDeliveryRecords < 1) {
    throw new Error('OPERATOR_CONFIG_INVALID:maximumDeliveryRecords');
  }
  if (typeof config.maximumDeliveryBytes !== 'number' || !Number.isSafeInteger(maximumDeliveryBytes) || maximumDeliveryBytes < 1) {
    throw new Error('OPERATOR_CONFIG_INVALID:maximumDeliveryBytes');
  }
  if (!Number.isSafeInteger(config.failureExcerptCharacters) || Number(config.failureExcerptCharacters) < 1 || Number(config.failureExcerptCharacters) > 2048) throw new Error('OPERATOR_CONFIG_INVALID:failureExcerptCharacters');
  return Object.freeze({
    failureExcerptCharacters: Number(config.failureExcerptCharacters),
    targets: new Map(Object.entries(config.targets).map(([id, raw]) => [id, parseTarget(id, raw, profiles, payloadStructure)])),
    deliveryRoot: config.deliveryRoot,
    maximumDeliveryRecords,
    maximumDeliveryBytes,
    maximumRecordBytes: Number(maximumRecordBytes),
  });
}

export function isTargetId(value: string): boolean { return TARGET_ID.test(value); }
