import crypto from 'node:crypto';
import type {
  AdapterActivationContext,
  AdapterInstance,
  EffectRequest,
} from '@kubeclaw/plugin-sdk';

const TARGET_ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const MESSAGE_TYPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const ALLOWED_PAYLOAD_KEYS = new Set([
  'type',
  'message',
  'eventId',
  'runId',
  'stageId',
  'artifactId',
  'artifact',
  'approvalId',
  'summary',
  'signalType',
  'authorizedIssuer',
  'expiresAt',
]);

interface TargetConfig {
  readonly endpoint: string;
  readonly tokenSecret: string;
  readonly maxPayloadBytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  error: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${error}:${key}`);
  }
}

function boundedString(
  value: unknown,
  label: string,
  maximum: number,
  nullable = false,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}`);
  }
  return value;
}

function validateJson(value: unknown, label: string, depth = 0): void {
  if (depth > 20) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:depth`);
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) return;
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:array`);
    value.forEach((entry, index) => validateJson(entry, `${label}[${index}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:json`);
  const entries = Object.entries(value);
  if (entries.length > 1_000) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:object`);
  for (const [key, entry] of entries) {
    if (
      key.length < 1
      || key.length > 128
      || /[\u0000-\u001f\u007f]/.test(key)
      || key === '__proto__'
      || key === 'constructor'
      || key === 'prototype'
    ) throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:key`);
    validateJson(entry, `${label}.${key}`, depth + 1);
  }
}

function parsePayload(
  raw: Readonly<Record<string, unknown>>,
  maxPayloadBytes: number,
): Readonly<Record<string, unknown>> {
  if (!isRecord(raw)) throw new Error('OPERATOR_PAYLOAD_INVALID:root');
  exactKeys(raw, ALLOWED_PAYLOAD_KEYS, 'OPERATOR_PAYLOAD_UNKNOWN_FIELD');
  if (typeof raw.type !== 'string' || !MESSAGE_TYPE.test(raw.type) || raw.type.length > 128) {
    throw new Error('OPERATOR_PAYLOAD_INVALID:type');
  }
  boundedString(raw.message, 'message', 16_384);
  boundedString(raw.eventId, 'eventId', 512);
  boundedString(raw.runId, 'runId', 512);
  boundedString(raw.stageId, 'stageId', 512, true);
  boundedString(raw.artifactId, 'artifactId', 512, true);
  boundedString(raw.approvalId, 'approvalId', 512);
  boundedString(raw.summary, 'summary', 16_384);
  boundedString(raw.signalType, 'signalType', 256);
  if (raw.expiresAt !== undefined) {
    const expiresAt = boundedString(raw.expiresAt, 'expiresAt', 64);
    if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) throw new Error('OPERATOR_PAYLOAD_INVALID:expiresAt');
  }
  if (raw.authorizedIssuer !== undefined) {
    if (!isRecord(raw.authorizedIssuer)) throw new Error('OPERATOR_PAYLOAD_INVALID:authorizedIssuer');
    exactKeys(raw.authorizedIssuer, new Set(['type', 'id']), 'OPERATOR_PAYLOAD_UNKNOWN_ISSUER_FIELD');
    if (raw.authorizedIssuer.type !== 'operator') throw new Error('OPERATOR_PAYLOAD_INVALID:authorizedIssuer.type');
    boundedString(raw.authorizedIssuer.id, 'authorizedIssuer.id', 512);
  }
  if (raw.artifact !== undefined) validateJson(raw.artifact, 'artifact');
  validateJson(raw, 'payload');
  const serialized = JSON.stringify(raw);
  if (Buffer.byteLength(serialized, 'utf8') > maxPayloadBytes) throw new Error('OPERATOR_PAYLOAD_SIZE_EXCEEDED');
  return Object.freeze({ ...raw });
}

function parseConfig(config: Readonly<Record<string, unknown>>): ReadonlyMap<string, TargetConfig> {
  exactKeys(config as Record<string, unknown>, new Set(['targets']), 'OPERATOR_CONFIG_UNKNOWN_FIELD');
  if (!isRecord(config.targets) || Object.keys(config.targets).length < 1) {
    throw new Error('OPERATOR_CONFIG_INVALID:targets');
  }
  const targets = new Map<string, TargetConfig>();
  for (const [targetId, raw] of Object.entries(config.targets)) {
    if (!TARGET_ID.test(targetId) || !isRecord(raw)) throw new Error(`OPERATOR_CONFIG_INVALID:target:${targetId}`);
    exactKeys(raw, new Set(['endpoint', 'tokenSecret', 'maxPayloadBytes']), 'OPERATOR_CONFIG_UNKNOWN_TARGET_FIELD');
    if (typeof raw.endpoint !== 'string') throw new Error(`OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
    let endpoint: URL;
    try {
      endpoint = new URL(raw.endpoint);
    } catch {
      throw new Error(`OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
    }
    if (
      !['http:', 'https:'].includes(endpoint.protocol)
      || endpoint.username
      || endpoint.password
      || endpoint.hash
    ) throw new Error(`OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
    if (
      typeof raw.tokenSecret !== 'string'
      || !TARGET_ID.test(raw.tokenSecret)
    ) throw new Error(`OPERATOR_CONFIG_INVALID:tokenSecret:${targetId}`);
    const maxPayloadBytes = raw.maxPayloadBytes ?? 65_536;
    if (!Number.isSafeInteger(maxPayloadBytes) || Number(maxPayloadBytes) < 1 || Number(maxPayloadBytes) > 1_048_576) {
      throw new Error(`OPERATOR_CONFIG_INVALID:maxPayloadBytes:${targetId}`);
    }
    targets.set(targetId, Object.freeze({
      endpoint: endpoint.href,
      tokenSecret: raw.tokenSecret,
      maxPayloadBytes: Number(maxPayloadBytes),
    }));
  }
  return targets;
}

function secretValue(response: Readonly<Record<string, unknown>>): string {
  exactKeys(response as Record<string, unknown>, new Set(['value']), 'OPERATOR_SECRET_RESPONSE_UNKNOWN_FIELD');
  if (typeof response.value !== 'string' || response.value.length < 1) {
    throw new Error('OPERATOR_SECRET_UNAVAILABLE');
  }
  return response.value;
}

function responseMessageId(response: Readonly<Record<string, unknown>>): string | undefined {
  const body = response.body;
  if (!isRecord(body)) return undefined;
  const value = body.messageId ?? body.id;
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined;
}

function assertRequest(request: EffectRequest): void {
  if (request.capability !== 'operator.request' || request.operation !== 'publish') {
    throw new Error('OPERATOR_OPERATION_UNSUPPORTED');
  }
  if (request.resource.type !== 'operator.target') throw new Error('OPERATOR_RESOURCE_TYPE_INVALID');
  if (!TARGET_ID.test(request.resource.canonicalId)) throw new Error('OPERATOR_TARGET_INVALID');
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const targets = parseConfig(context.config);
  let shuttingDown = false;
  return {
    async ready() {
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
    },
    async invoke({ request, signal }) {
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      assertRequest(request);
      const targetId = request.resource.canonicalId;
      const target = targets.get(targetId);
      if (!target) throw new Error(`OPERATOR_TARGET_DENIED:${targetId}`);
      const payload = parsePayload(request.payload, target.maxPayloadBytes);
      const body = JSON.stringify(payload);
      const resolved = await context.invoke('secrets.read', {
        operation: 'resolve',
        resource: { type: 'secret.name', canonicalId: target.tokenSecret },
        payload: {},
      });
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      const secret = secretValue(resolved);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${request.idempotencyKey}.${body}`, 'utf8')
        .digest('hex');
      const response = await context.invoke('network.http', {
        operation: 'request',
        resource: { type: 'network.url', canonicalId: target.endpoint },
        payload: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': request.idempotencyKey,
            'x-kubeclaw-signature': `v1=${signature}`,
          },
          body: payload,
        },
      });
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      if (!Number.isSafeInteger(response.status) || Number(response.status) < 200 || Number(response.status) > 299) {
        throw new Error('OPERATOR_DELIVERY_INVALID_RESPONSE');
      }
      const messageId = responseMessageId(response);
      return Object.freeze({
        accepted: true,
        target: targetId,
        status: Number(response.status),
        ...(messageId === undefined ? {} : { messageId }),
      });
    },
    async shutdown() {
      shuttingDown = true;
    },
  };
}
