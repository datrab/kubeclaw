import { exchange } from './exchange.ts';
import { streamIdentity } from './stream-identity.ts';
import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';

interface Config {
  readonly url: URL;
  readonly passwordSecret: string;
  readonly streamPrefix: string;
  readonly maxLen: number;
  readonly dedupTtlMs: number;
  readonly timeoutMs: number;
}

export const REDIS_PUBLISH_LUA = `
local prior = redis.call('GET', KEYS[2])
if prior then return prior end
local entry = redis.call('XADD', KEYS[1], 'MAXLEN', '~', ARGV[1], '*',
  'idempotency_key', ARGV[2], 'payload', ARGV[3])
redis.call('SET', KEYS[2], entry, 'PX', ARGV[4])
return entry
`.trim();

function config(value: Readonly<Record<string, unknown>>): Config {
  const allowed = new Set(['url', 'passwordSecret', 'streamPrefix', 'maxLen', 'dedupTtlMs', 'timeoutMs']);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error('REDIS_CONFIG_UNKNOWN_FIELD');
  if (typeof value.url !== 'string' || typeof value.passwordSecret !== 'string' || typeof value.streamPrefix !== 'string') {
    throw new Error('REDIS_CONFIG_INVALID');
  }
  const url = new URL(value.url);
  if (!['redis:', 'rediss:'].includes(url.protocol) || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash) {
    throw new Error('REDIS_CONFIG_INVALID:url');
  }
  if (!/^[a-z][a-z0-9._-]{0,127}$/u.test(value.passwordSecret) || !/^[a-z][a-z0-9:_-]{0,127}$/u.test(value.streamPrefix)) {
    throw new Error('REDIS_CONFIG_INVALID');
  }
  const integer = (input: unknown, label: string, maximum: number): number => {
    if (!Number.isSafeInteger(input) || Number(input) < 1 || Number(input) > maximum) throw new Error(`REDIS_CONFIG_INVALID:${label}`);
    return Number(input);
  };
  return {
    url,
    passwordSecret: value.passwordSecret,
    streamPrefix: value.streamPrefix,
    maxLen: integer(value.maxLen, 'maxLen', 1_000_000),
    dedupTtlMs: integer(value.dedupTtlMs, 'dedupTtlMs', 31_536_000_000),
    timeoutMs: integer(value.timeoutMs, 'timeoutMs', 300_000),
  };
}

function streamId(value: string | number | null): string {
  if (typeof value !== 'string' || !/^[0-9]+-[0-9]+$/u.test(value)) throw new Error('REDIS_STREAM_ID_INVALID');
  return value;
}

function activate(kind: 'publisher' | 'telemetry', context: AdapterActivationContext): AdapterInstance {
  const options = config(context.config);
  let stopping = false;
  return {
    async ready() {
      if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
    },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      const expected = kind === 'publisher'
        ? { capability: 'transport.publish', operation: 'publish', resource: 'transport.target' }
        : { capability: 'telemetry.emit', operation: 'append', resource: 'telemetry.event' };
      if (request.capability !== expected.capability || request.operation !== expected.operation || request.resource.type !== expected.resource) {
        throw new Error('REDIS_OPERATION_UNSUPPORTED');
      }
      const secret = await context.invoke('secrets.read', {
        operation: 'resolve',
        resource: { type: 'secret.name', canonicalId: options.passwordSecret },
        payload: {},
      });
      if (typeof secret.value !== 'string' || !secret.value || /[\r\n]/u.test(secret.value)) throw new Error('REDIS_SECRET_INVALID');
      const payload = JSON.stringify(request.payload);
      if (Buffer.byteLength(payload) > 1_048_576) throw new Error('REDIS_PAYLOAD_SIZE_EXCEEDED');
      const { stream, dedup } = streamIdentity(options.streamPrefix, kind, request.resource.canonicalId, request.idempotencyKey);
      const result = await exchange(options, secret.value, [
        'EVAL', REDIS_PUBLISH_LUA, '2', stream, dedup,
        String(options.maxLen), request.idempotencyKey, payload, String(options.dedupTtlMs),
      ], signal);
      return Object.freeze({ accepted: true, stream, entryId: streamId(result) });
    },
    async shutdown() { stopping = true; },
  };
}

export const activatePublisher = (context: AdapterActivationContext): AdapterInstance => activate('publisher', context);
export const activateTelemetry = (context: AdapterActivationContext): AdapterInstance => activate('telemetry', context);
