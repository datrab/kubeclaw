import crypto from 'node:crypto';
import { extractRuntimeDispatchProfile, type AdapterActivationContext, type AdapterInstance, type EffectRequest } from '@kubeclaw/plugin-sdk';
import { createDispatchAdapter } from './dispatch-adapter.ts';

const ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
interface Target {
  readonly endpoint: string;
  readonly authentication: 'hmac' | 'spiffe-proxy';
  readonly tokenSecret?: string;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
}

function boundedInteger(value: unknown, fallback: number, id: string, label: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 8_388_608) throw new Error(`RUNTIME_CONFIG_INVALID:${label}:${id}`);
  return parsed;
}

function endpointFrom(value: unknown, id: string): URL {
  if (typeof value !== 'string') throw new Error(`RUNTIME_CONFIG_INVALID:endpoint:${id}`);
  const endpoint = new URL(value);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) throw new Error(`RUNTIME_CONFIG_INVALID:endpoint:${id}`);
  return endpoint;
}

function loopback(endpoint: URL): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(endpoint.hostname);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, allowed: ReadonlySet<string>, code: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${code}:${key}`);
}

function scalar(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

// eslint-disable-next-line complexity -- Recursive JSON validation checks every supported scalar and container bound.
function json(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error('RUNTIME_PAYLOAD_DEPTH_EXCEEDED');
  if (scalar(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error('RUNTIME_PAYLOAD_ARRAY_EXCEEDED');
    value.forEach((entry) => json(entry, depth + 1));
    return;
  }
  if (!record(value)) throw new Error('RUNTIME_PAYLOAD_INVALID');
  if (Object.keys(value).length > 1_000) throw new Error('RUNTIME_PAYLOAD_OBJECT_EXCEEDED');
  for (const [key, entry] of Object.entries(value)) {
    if (!key || key.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new Error('RUNTIME_PAYLOAD_KEY_INVALID');
    }
    json(entry, depth + 1);
  }
}

function targetFrom(id: string, value: unknown): Target {
    if (!ID.test(id) || !record(value)) throw new Error(`RUNTIME_CONFIG_INVALID:target:${id}`);
    exact(value, new Set([
      'endpoint', 'tokenSecret', 'maxRequestBytes', 'maxResponseBytes',
      'authentication',
    ]), 'RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD');
    const endpoint = endpointFrom(value.endpoint, id);
    const authentication = value.authentication === 'spiffe-proxy' ? 'spiffe-proxy' : 'hmac';
    if (authentication === 'hmac' && (typeof value.tokenSecret !== 'string' || !ID.test(value.tokenSecret))) {
      throw new Error(`RUNTIME_CONFIG_INVALID:tokenSecret:${id}`);
    }
    if (authentication === 'hmac' && endpoint.protocol !== 'https:' && !loopback(endpoint)) {
      throw new Error(`RUNTIME_CONFIG_INVALID:plaintextHmac:${id}`);
    }
    if (authentication === 'spiffe-proxy'
      && !loopback(endpoint)) {
      throw new Error(`RUNTIME_CONFIG_INVALID:spiffeProxy:${id}`);
    }
    const maxRequestBytes = boundedInteger(value.maxRequestBytes, 1_048_576, id, 'maxRequestBytes');
    const maxResponseBytes = boundedInteger(value.maxResponseBytes, 1_048_576, id, 'maxResponseBytes');
    return {
      endpoint: endpoint.href,
      authentication,
      ...(authentication === 'hmac' ? { tokenSecret: value.tokenSecret as string } : {}),
      maxRequestBytes,
      maxResponseBytes,
    };
}

function config(raw: Readonly<Record<string, unknown>>): ReadonlyMap<string, Target> {
  exact(raw as Record<string, unknown>, new Set(['targets']), 'RUNTIME_CONFIG_UNKNOWN_FIELD');
  if (!record(raw.targets) || Object.keys(raw.targets).length === 0) throw new Error('RUNTIME_CONFIG_INVALID:targets');
  return new Map(Object.entries(raw.targets).map(([id, value]) => [id, targetFrom(id, value)]));
}

function assertRequest(request: EffectRequest): void {
  if (request.capability !== 'runtime.dispatch' || request.operation !== 'dispatch') {
    throw new Error('RUNTIME_OPERATION_UNSUPPORTED');
  }
  if (request.resource.type !== 'runtime.agent' || !ID.test(request.resource.canonicalId)) {
    throw new Error('RUNTIME_TARGET_INVALID');
  }
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const targets = config(context.config);
  // eslint-disable-next-line complexity -- Authentication, size, signature, and response checks share one dispatch boundary.
  return createDispatchAdapter(context, targets, assertRequest, async ({ request, signal, target }) => {
      json(request.payload);
      const { payload } = extractRuntimeDispatchProfile(request.payload);
      const body = JSON.stringify(payload);
      if (Buffer.byteLength(body, 'utf8') > target.maxRequestBytes) throw new Error('RUNTIME_REQUEST_SIZE_EXCEEDED');
      const secret = target.authentication === 'hmac' ? await context.invokeConfidential('secrets.read', {
        operation: 'resolve', resource: { type: 'secret.name', canonicalId: target.tokenSecret! }, payload: {},
      }) : undefined;
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      if (secret && (typeof secret.value !== 'string' || secret.value.length < 1)) throw new Error('RUNTIME_SECRET_UNAVAILABLE');
      const secretValue = secret?.value;
      const signature = typeof secretValue === 'string' ? crypto.createHmac('sha256', secretValue)
        .update(`${request.idempotencyKey}.${body}`, 'utf8').digest('hex') : undefined;
      const response = await context.invokeConfidential('network.http', {
        operation: 'request',
        resource: { type: 'network.url', canonicalId: target.endpoint },
        payload: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': request.idempotencyKey,
            ...(signature ? { 'x-kubeclaw-signature': `v1=${signature}` } : {}),
          },
          body: payload,
        },
      });
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      if (!Number.isSafeInteger(response.status) || Number(response.status) < 200 || Number(response.status) > 299) {
        throw new Error('RUNTIME_RESPONSE_STATUS_INVALID');
      }
      if (!record(response.body)) throw new Error('RUNTIME_RESPONSE_BODY_INVALID');
      json(response.body);
      if (Buffer.byteLength(JSON.stringify(response.body), 'utf8') > target.maxResponseBytes) {
        throw new Error('RUNTIME_RESPONSE_SIZE_EXCEEDED');
      }
      return Object.freeze({ ...response.body });
  });
}
