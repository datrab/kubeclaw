import crypto from 'node:crypto';
import type { TestProviderCapabilityInvoker } from './runner.ts';

const MAX_TIMER_MS = 2_147_483_647;
const METHODS = new Set(['GET', 'HEAD']);

export interface NetworkHttpCapabilityInvokerOptions {
  readonly allowedOrigins: readonly string[];
  readonly allowedHostSuffixes: readonly string[];
  readonly allowedPorts: readonly number[];
  readonly maximumResponseBytes: number;
  readonly maximumExecutionMs: number;
}

function positiveInteger(value: unknown, code: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) throw new Error(code);
  return Number(value);
}

function canonicalOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password) {
    throw new Error('HTTP_RUNTIME_ORIGIN_INVALID');
  }
  return url.origin;
}

function canonicalSuffix(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(normalized) || normalized.includes('..')) {
    throw new Error('HTTP_RUNTIME_HOST_SUFFIX_INVALID');
  }
  return normalized;
}

function requestHeaders(value: unknown): Record<string, string> {
  if (value === undefined) return { accept: '*/*', connection: 'close' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HTTP_REQUEST_HEADERS_INVALID');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([name, content]) => name.toLowerCase() !== 'accept' || typeof content !== 'string'
    || content.length < 1 || content.length > 512 || /[\r\n]/u.test(content))) {
    throw new Error('HTTP_REQUEST_HEADER_DENIED');
  }
  return { ...Object.fromEntries(entries.map(([name, content]) => [name.toLowerCase(), String(content)])), connection: 'close' };
}

function exactPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HTTP_REQUEST_PAYLOAD_INVALID');
  const payload = value as Record<string, unknown>;
  const allowed = new Set(['method', 'headers', 'timeoutMs', 'maximumResponseBytes']);
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw new Error('HTTP_REQUEST_PAYLOAD_UNKNOWN_FIELD');
  return payload;
}

async function responseBytes(response: Response, maximum: number, signal: AbortSignal): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) {
    throw new Error('HTTP_RESPONSE_SIZE_EXCEEDED');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Error('HTTP_REQUEST_CANCELLED');
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) throw new Error('HTTP_RESPONSE_SIZE_EXCEEDED');
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    if (total > maximum || signal.aborted) await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks, total);
}

export class NetworkHttpCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #allowedOrigins: ReadonlySet<string>;
  readonly #allowedHostSuffixes: readonly string[];
  readonly #allowedPorts: ReadonlySet<number>;
  readonly #maximumResponseBytes: number;
  readonly #maximumExecutionMs: number;

  constructor(options: NetworkHttpCapabilityInvokerOptions) {
    this.#allowedOrigins = new Set(options.allowedOrigins.map(canonicalOrigin));
    this.#allowedHostSuffixes = Object.freeze(options.allowedHostSuffixes.map(canonicalSuffix));
    this.#allowedPorts = new Set(options.allowedPorts.map((port) => positiveInteger(port, 'HTTP_RUNTIME_PORT_INVALID', 65_535)));
    this.#maximumResponseBytes = positiveInteger(options.maximumResponseBytes, 'HTTP_RUNTIME_RESPONSE_LIMIT_INVALID');
    this.#maximumExecutionMs = positiveInteger(options.maximumExecutionMs, 'HTTP_RUNTIME_EXECUTION_LIMIT_INVALID', MAX_TIMER_MS);
    if (this.#allowedOrigins.size === 0 && this.#allowedHostSuffixes.length === 0) throw new Error('HTTP_RUNTIME_TARGET_POLICY_REQUIRED');
    if (this.#allowedPorts.size === 0) throw new Error('HTTP_RUNTIME_PORT_POLICY_REQUIRED');
  }

  #target(value: string): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('HTTP_REQUEST_URL_INVALID'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('HTTP_REQUEST_URL_INVALID');
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!this.#allowedPorts.has(port)) throw new Error(`HTTP_REQUEST_PORT_DENIED:${port}`);
    const hostname = url.hostname.toLowerCase();
    const suffixAllowed = this.#allowedHostSuffixes.some((suffix) => hostname.endsWith(suffix)
      && hostname.length > suffix.length);
    if (!this.#allowedOrigins.has(url.origin) && !suffixAllowed) throw new Error(`HTTP_REQUEST_ORIGIN_DENIED:${url.origin}`);
    return url;
  }

  async invoke(capability: string, request: any, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'network.http' || request?.operation !== 'request'
      || request?.resource?.type !== 'network.url' || typeof request?.resource?.canonicalId !== 'string') {
      throw new Error('HTTP_CAPABILITY_REQUEST_INVALID');
    }
    if (signal.aborted) throw new Error('HTTP_REQUEST_CANCELLED');
    const url = this.#target(request.resource.canonicalId);
    const payload = exactPayload(request.payload);
    const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : 'GET';
    if (!METHODS.has(method)) throw new Error(`HTTP_REQUEST_METHOD_DENIED:${method}`);
    const timeoutMs = positiveInteger(payload.timeoutMs ?? this.#maximumExecutionMs,
      'HTTP_REQUEST_TIMEOUT_INVALID', this.#maximumExecutionMs);
    const maximumResponseBytes = positiveInteger(payload.maximumResponseBytes ?? this.#maximumResponseBytes,
      'HTTP_REQUEST_RESPONSE_LIMIT_INVALID', this.#maximumResponseBytes);
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, { method, headers: requestHeaders(payload.headers), redirect: 'manual', signal: combined });
      if (response.status >= 300 && response.status < 400) throw new Error('HTTP_RESPONSE_REDIRECT_DENIED');
      const bytes = method === 'HEAD' ? Buffer.alloc(0) : await responseBytes(response, maximumResponseBytes, combined);
      if (method === 'HEAD') await response.body?.cancel().catch(() => undefined);
      return Object.freeze({
        status: response.status,
        headers: Object.freeze({ 'content-type': response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? null }),
        body: bytes.toString('utf8'),
        sizeBytes: bytes.byteLength,
        bodyDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (signal.aborted) throw new Error('HTTP_REQUEST_CANCELLED');
      if (timeout.aborted) throw new Error('HTTP_REQUEST_TIMEOUT');
      if (error instanceof Error && error.message.startsWith('HTTP_')) throw error;
      throw new Error(`HTTP_REQUEST_FAILED:${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}
