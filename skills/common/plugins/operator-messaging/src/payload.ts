import type { EffectRequest } from '@kubeclaw/plugin-sdk';

const MESSAGE_TYPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const PAYLOAD_KEYS = new Set(['type', 'message', 'eventId', 'runId', 'stageId', 'artifactId', 'artifact', 'approvalId', 'summary', 'fields', 'footer', 'occurredAt', 'severity', 'title', 'reasonCode', 'signalType', 'authorizedIssuer', 'expiresAt']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, error: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${error}:${key}`);
}

function boundedString(value: unknown, label: string, maximum: number, nullable = false): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}`);
  }
  return value;
}

function validateObjectKey(key: string, label: string): void {
  const reserved = key === '__proto__' || key === 'constructor' || key === 'prototype';
  if (key.length < 1 || key.length > 128 || /[\u0000-\u001f\u007f]/.test(key) || reserved) {
    throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:key`);
  }
}

function validateJson(value: unknown, label: string, depth = 0): void {
  if (depth > 20) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:depth`);
  const scalar = value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
  if (scalar) return;
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:array`);
    value.forEach((entry, index) => validateJson(entry, `${label}[${index}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:json`);
  const entries = Object.entries(value);
  if (entries.length > 1_000) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:object`);
  for (const [key, entry] of entries) {
    validateObjectKey(key, label);
    validateJson(entry, `${label}.${key}`, depth + 1);
  }
}

function validateFields(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 25) throw new Error('OPERATOR_PAYLOAD_INVALID:fields');
  value.forEach((field, index) => {
    if (!isRecord(field)) throw new Error(`OPERATOR_PAYLOAD_INVALID:fields[${index}]`);
    exactKeys(field, new Set(['name', 'value', 'inline']), 'OPERATOR_PAYLOAD_UNKNOWN_FIELD_ITEM');
    boundedString(field.name, `fields[${index}].name`, 256);
    boundedString(field.value, `fields[${index}].value`, 1_024);
    if (field.inline !== undefined && typeof field.inline !== 'boolean') {
      throw new Error(`OPERATOR_PAYLOAD_INVALID:fields[${index}].inline`);
    }
  });
}

function validateDate(value: unknown, label: string): void {
  if (value === undefined) return;
  const date = boundedString(value, label, 64);
  if (!date || Number.isNaN(Date.parse(date))) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}`);
}

function validateIssuer(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error('OPERATOR_PAYLOAD_INVALID:authorizedIssuer');
  exactKeys(value, new Set(['type', 'id']), 'OPERATOR_PAYLOAD_UNKNOWN_ISSUER_FIELD');
  if (value.type !== 'operator') throw new Error('OPERATOR_PAYLOAD_INVALID:authorizedIssuer.type');
  boundedString(value.id, 'authorizedIssuer.id', 512);
}

function validateKnownFields(raw: Record<string, unknown>): void {
  const strings: ReadonlyArray<readonly [string, number, boolean?]> = [
    ['message', 16_384], ['eventId', 512], ['runId', 512], ['stageId', 512, true],
    ['artifactId', 512, true], ['approvalId', 512], ['summary', 16_384], ['footer', 2_048],
    ['severity', 32], ['title', 512], ['reasonCode', 256, true], ['signalType', 256],
  ];
  for (const [key, limit, nullable] of strings) boundedString(raw[key], key, limit, nullable);
  validateDate(raw.occurredAt, 'occurredAt');
  validateDate(raw.expiresAt, 'expiresAt');
  validateFields(raw.fields);
  validateIssuer(raw.authorizedIssuer);
  if (raw.artifact !== undefined) validateJson(raw.artifact, 'artifact');
}

export function parsePayload(raw: Readonly<Record<string, unknown>>, maxPayloadBytes: number): Readonly<Record<string, unknown>> {
  if (!isRecord(raw)) throw new Error('OPERATOR_PAYLOAD_INVALID:root');
  exactKeys(raw, PAYLOAD_KEYS, 'OPERATOR_PAYLOAD_UNKNOWN_FIELD');
  if (typeof raw.type !== 'string' || !MESSAGE_TYPE.test(raw.type) || raw.type.length > 128) throw new Error('OPERATOR_PAYLOAD_INVALID:type');
  validateKnownFields(raw);
  validateJson(raw, 'payload');
  if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > maxPayloadBytes) throw new Error('OPERATOR_PAYLOAD_SIZE_EXCEEDED');
  return Object.freeze({ ...raw });
}

export function assertRequest(request: EffectRequest, isTargetId: (value: string) => boolean): void {
  if (request.capability !== 'operator.request' || request.operation !== 'publish') throw new Error('OPERATOR_OPERATION_UNSUPPORTED');
  if (request.resource.type !== 'operator.target') throw new Error('OPERATOR_RESOURCE_TYPE_INVALID');
  if (!isTargetId(request.resource.canonicalId)) throw new Error('OPERATOR_TARGET_INVALID');
}

export function secretValue(response: Readonly<Record<string, unknown>>): string {
  exactKeys(response as Record<string, unknown>, new Set(['value']), 'OPERATOR_SECRET_RESPONSE_UNKNOWN_FIELD');
  if (typeof response.value !== 'string' || response.value.length < 1) throw new Error('OPERATOR_SECRET_UNAVAILABLE');
  return response.value;
}

export function responseMessageId(response: Readonly<Record<string, unknown>>): string | undefined {
  if (!isRecord(response.body)) return undefined;
  const value = response.body.messageId ?? response.body.id;
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined;
}
