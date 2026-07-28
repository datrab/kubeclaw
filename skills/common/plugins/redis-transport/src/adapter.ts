import net from 'node:net';
import tls from 'node:tls';
import type { AdapterActivationContext, AdapterInstance, EffectRequest } from '@kubeclaw/plugin-sdk';

interface Config {
  readonly url: URL;
  readonly passwordSecret: string;
  readonly streamPrefix: string;
  readonly maxLen: number;
  readonly dedupTtlMs: number;
  readonly timeoutMs: number;
}

const LUA = `
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

function command(parts: readonly string[]): Buffer {
  return Buffer.from(`*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`);
}

function parseReply(buffer: Buffer): { readonly value: string | number | null; readonly bytes: number } | undefined {
  const lineEnd = buffer.indexOf('\r\n');
  if (lineEnd < 0) return undefined;
  const prefix = String.fromCharCode(buffer[0] ?? 0);
  const header = buffer.subarray(1, lineEnd).toString('utf8');
  if (prefix === '+') return { value: header, bytes: lineEnd + 2 };
  if (prefix === '-') throw new Error(`REDIS_ERROR:${header.replace(/[\r\n]/gu, ' ')}`);
  if (prefix === ':') return { value: Number(header), bytes: lineEnd + 2 };
  if (prefix !== '$') throw new Error('REDIS_RESPONSE_INVALID');
  const length = Number(header);
  if (length === -1) return { value: null, bytes: lineEnd + 2 };
  if (!Number.isSafeInteger(length) || length < 0 || length > 1_048_576) throw new Error('REDIS_RESPONSE_INVALID');
  const end = lineEnd + 2 + length;
  if (buffer.length < end + 2) return undefined;
  return { value: buffer.subarray(lineEnd + 2, end).toString('utf8'), bytes: end + 2 };
}

async function exchange(options: Config, password: string, parts: readonly string[], signal: AbortSignal): Promise<string | number | null> {
  if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
  const socket = options.url.protocol === 'rediss:'
    ? tls.connect({ host: options.url.hostname, port: Number(options.url.port), servername: options.url.hostname })
    : net.connect({ host: options.url.hostname, port: Number(options.url.port) });
  let buffer = Buffer.alloc(0);
  let settled = false;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, value?: string | number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      socket.destroy();
      if (error) reject(error); else resolve(value ?? null);
    };
    const abort = () => finish(new Error('ADAPTER_CANCELLED'));
    const timeout = setTimeout(() => finish(new Error('REDIS_TIMEOUT')), options.timeoutMs);
    timeout.unref();
    signal.addEventListener('abort', abort, { once: true });
    socket.once('error', (error) => finish(new Error(`REDIS_CONNECTION_FAILED:${error.message}`)));
    const replies: Array<string | number | null> = [];
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      try {
        while (true) {
          const parsed = parseReply(buffer);
          if (!parsed) break;
          replies.push(parsed.value);
          buffer = buffer.subarray(parsed.bytes);
          if (replies.length === 2) finish(undefined, replies[1]);
        }
      } catch (error) {
        finish(error as Error);
      }
    });
    socket.once('connect', () => socket.write(Buffer.concat([
      command(['AUTH', password]),
      command(parts),
    ])));
  });
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
      const target = request.resource.canonicalId.replace(/[^a-zA-Z0-9:_-]/gu, '_');
      const stream = `${options.streamPrefix}:${target}`;
      const dedup = `${options.streamPrefix}:dedup:${request.idempotencyKey}`;
      const result = await exchange(options, secret.value, [
        'EVAL', LUA, '2', stream, dedup,
        String(options.maxLen), request.idempotencyKey, payload, String(options.dedupTtlMs),
      ], signal);
      return Object.freeze({ accepted: true, stream, entryId: streamId(result) });
    },
    async shutdown() { stopping = true; },
  };
}

export const activatePublisher = (context: AdapterActivationContext): AdapterInstance => activate('publisher', context);
export const activateTelemetry = (context: AdapterActivationContext): AdapterInstance => activate('telemetry', context);
