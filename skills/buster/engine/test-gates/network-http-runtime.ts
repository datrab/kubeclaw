import crypto from 'node:crypto';
import WebSocket from 'ws';
import type { ResolvedInputV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderCapabilityInvoker } from './runner.ts';

const MAX_TIMER_MS = 2_147_483_647;
const METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
const DENIED_HEADERS = new Set(['connection', 'content-length', 'host', 'proxy-authorization', 'transfer-encoding', 'upgrade']);

export interface NetworkHttpCapabilityInvokerOptions {
  readonly allowedOrigins: readonly string[];
  readonly allowedHostSuffixes: readonly string[];
  readonly allowedPorts: readonly number[];
  readonly maximumResponseBytes: number;
  readonly maximumRequestBytes?: number;
  readonly maximumExecutionMs: number;
  readonly allowedMethods?: readonly string[];
  readonly allowedRequestHeaders?: readonly string[];
  readonly allowWebSocket?: boolean;
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

function deploymentOrigins(inputs: readonly ResolvedInputV1[] | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const input of inputs ?? []) {
    if (input.kind === 'value' && input.schemaId === 'kubeclaw.public-endpoint-fixture@1' && input.value && typeof input.value === 'object' && !Array.isArray(input.value)) {
      const endpoint = input.value as Record<string, unknown>;
      if (endpoint.schemaVersion === 'public-endpoint-fixture.v1' && typeof endpoint.url === 'string') {
        try { origins.add(new URL(endpoint.url).origin); } catch { /* Invalid fixture data grants nothing. */ }
      }
    }
    if (input.kind !== 'value' || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1'
      || !input.value || typeof input.value !== 'object' || Array.isArray(input.value)) continue;
    const deployment = input.value as Record<string, unknown>;
    if (deployment.schemaVersion !== 'kubernetes-deployment-fixture.v1' || !Array.isArray(deployment.endpoints)
      || deployment.endpoints.length > 64) continue;
    for (const endpoint of deployment.endpoints) {
      if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)
        || typeof (endpoint as Record<string, unknown>).url !== 'string') continue;
      try { origins.add(canonicalOrigin(String((endpoint as Record<string, unknown>).url))); } catch { /* Invalid fixture data grants nothing. */ }
    }
  }
  return origins;
}

function requestHeaders(value: unknown, allowed: ReadonlySet<string>, closeConnection = true): Record<string, string> {
  if (value === undefined) return {
    ...(allowed.has('accept') ? { accept: '*/*' } : {}),
    ...(closeConnection ? { connection: 'close' } : {}),
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HTTP_REQUEST_HEADERS_INVALID');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 32 || entries.some(([name, content]) => !/^[a-z0-9!#$%&'*+.^_`|~-]+$/iu.test(name)
    || DENIED_HEADERS.has(name.toLowerCase()) || !allowed.has(name.toLowerCase()) || typeof content !== 'string'
    || content.length < 1 || content.length > 4096 || /[\r\n]/u.test(content))) {
    throw new Error('HTTP_REQUEST_HEADER_DENIED');
  }
  return { ...Object.fromEntries(entries.map(([name, content]) => [name.toLowerCase(), String(content)])),
    ...(closeConnection ? { connection: 'close' } : {}) };
}

function responseHeaderNames(value: unknown): readonly string[] {
  if (value === undefined) return Object.freeze(['content-type']);
  if (!Array.isArray(value) || value.length > 32 || value.some((name) => typeof name !== 'string'
    || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/iu.test(name)
    || (DENIED_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== 'content-length'))) {
    throw new Error('HTTP_RESPONSE_HEADERS_INVALID');
  }
  return Object.freeze([...new Set(['content-type', ...value.map((name) => name.toLowerCase())])]);
}

function exactPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HTTP_REQUEST_PAYLOAD_INVALID');
  const payload = value as Record<string, unknown>;
  const allowed = new Set(['method', 'headers', 'body', 'messages', 'minimumMessages', 'timeoutMs', 'maximumResponseBytes', 'responseHeaders']);
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw new Error('HTTP_REQUEST_PAYLOAD_UNKNOWN_FIELD');
  return payload;
}

function requestBody(value: unknown, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || Buffer.byteLength(value) > maximum) throw new Error('HTTP_REQUEST_BODY_INVALID');
  return value;
}

async function websocket(url: URL, payload: Record<string, unknown>, signal: AbortSignal,
  timeoutMs: number, maximumResponseBytes: number, maximumRequestBytes: number,
  allowedHeaders: ReadonlySet<string>): Promise<Readonly<Record<string, unknown>>> {
  const messages = payload.messages ?? [];
  if (!Array.isArray(messages) || messages.length > 64 || messages.some((item) => typeof item !== 'string'
    || Buffer.byteLength(item) > maximumRequestBytes)
    || messages.reduce((total, item) => total + Buffer.byteLength(String(item)), 0) > maximumRequestBytes) {
    throw new Error('HTTP_WEBSOCKET_MESSAGES_INVALID');
  }
  const minimumMessages = positiveInteger(payload.minimumMessages ?? 1, 'HTTP_WEBSOCKET_MINIMUM_INVALID', 64);
  const wsUrl = new URL(url.href); wsUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const received: string[] = []; let total = 0; let settled = false;
    const socket = new WebSocket(wsUrl, {
      headers: requestHeaders(payload.headers, allowedHeaders, false),
      maxPayload: maximumResponseBytes,
    });
    const finish = (error?: Error): void => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      try { socket.terminate(); } catch { /* The peer can close first. */ }
      if (error) reject(error); else resolve(Object.freeze({ messages: Object.freeze(received),
        messageCount: received.length, sizeBytes: total, durationMs: Date.now() - startedAt }));
    };
    const abort = (): void => finish(new Error('HTTP_REQUEST_CANCELLED'));
    const timer = setTimeout(() => finish(new Error('HTTP_REQUEST_TIMEOUT')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    socket.on('open', () => { for (const message of messages) socket.send(message); if (minimumMessages === 0) finish(); });
    socket.on('message', (data) => {
      const value = String(data); total += Buffer.byteLength(value);
      if (total > maximumResponseBytes) { finish(new Error('HTTP_RESPONSE_SIZE_EXCEEDED')); return; }
      received.push(value); if (received.length >= minimumMessages) finish();
    });
    socket.on('error', (error) => finish(new Error(`HTTP_REQUEST_FAILED:${error.name}`)));
    socket.on('close', () => received.length >= minimumMessages
      ? finish() : finish(new Error('HTTP_WEBSOCKET_MESSAGES_MISSING')));
  });
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
  readonly #maximumRequestBytes: number;
  readonly #maximumExecutionMs: number;
  readonly #allowedMethods: ReadonlySet<string>;
  readonly #allowedRequestHeaders: ReadonlySet<string>;
  readonly #allowWebSocket: boolean;

  constructor(options: NetworkHttpCapabilityInvokerOptions) {
    this.#allowedOrigins = new Set(options.allowedOrigins.map(canonicalOrigin));
    this.#allowedHostSuffixes = Object.freeze(options.allowedHostSuffixes.map(canonicalSuffix));
    this.#allowedPorts = new Set(options.allowedPorts.map((port) => positiveInteger(port, 'HTTP_RUNTIME_PORT_INVALID', 65_535)));
    this.#maximumResponseBytes = positiveInteger(options.maximumResponseBytes, 'HTTP_RUNTIME_RESPONSE_LIMIT_INVALID');
    this.#maximumRequestBytes = positiveInteger(options.maximumRequestBytes ?? options.maximumResponseBytes,
      'HTTP_RUNTIME_REQUEST_LIMIT_INVALID');
    this.#maximumExecutionMs = positiveInteger(options.maximumExecutionMs, 'HTTP_RUNTIME_EXECUTION_LIMIT_INVALID', MAX_TIMER_MS);
    const methods = options.allowedMethods ?? ['GET', 'HEAD'];
    if (!methods.length || methods.some((method) => !METHODS.has(method))) throw new Error('HTTP_RUNTIME_METHOD_POLICY_INVALID');
    this.#allowedMethods = new Set(methods);
    const headers = (options.allowedRequestHeaders ?? ['accept']).map((name) => name.toLowerCase());
    if (headers.some((name) => !/^[a-z0-9!#$%&'*+.^_`|~-]+$/u.test(name)
      || DENIED_HEADERS.has(name))) throw new Error('HTTP_RUNTIME_HEADER_POLICY_INVALID');
    this.#allowedRequestHeaders = new Set(headers);
    this.#allowWebSocket = options.allowWebSocket === true;
    if (this.#allowedOrigins.size === 0 && this.#allowedHostSuffixes.length === 0) throw new Error('HTTP_RUNTIME_TARGET_POLICY_REQUIRED');
    if (this.#allowedPorts.size === 0) throw new Error('HTTP_RUNTIME_PORT_POLICY_REQUIRED');
  }

  #target(value: string, inputs?: readonly ResolvedInputV1[]): Readonly<{ url: URL; exactOrigin: boolean }> {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('HTTP_REQUEST_URL_INVALID'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('HTTP_REQUEST_URL_INVALID');
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!this.#allowedPorts.has(port)) throw new Error(`HTTP_REQUEST_PORT_DENIED:${port}`);
    const hostname = url.hostname.toLowerCase();
    const suffixAllowed = this.#allowedHostSuffixes.some((suffix) => hostname.endsWith(suffix)
      && hostname.length > suffix.length);
    const configuredExactOrigin = this.#allowedOrigins.has(url.origin);
    if (!configuredExactOrigin && !suffixAllowed) throw new Error(`HTTP_REQUEST_ORIGIN_DENIED:${url.origin}`);
    const exactOrigin = configuredExactOrigin || deploymentOrigins(inputs).has(url.origin);
    if (!exactOrigin) throw new Error(`HTTP_REQUEST_EXACT_ORIGIN_REQUIRED:${url.origin}`);
    return Object.freeze({ url, exactOrigin });
  }

  async invoke(capability: string, request: any, signal: AbortSignal,
    inputs?: readonly ResolvedInputV1[]): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'network.http' || !['request', 'websocket'].includes(request?.operation)
      || request?.resource?.type !== 'network.url' || typeof request?.resource?.canonicalId !== 'string') {
      throw new Error('HTTP_CAPABILITY_REQUEST_INVALID');
    }
    if (signal.aborted) throw new Error('HTTP_REQUEST_CANCELLED');
    const { url, exactOrigin } = this.#target(request.resource.canonicalId, inputs);
    const payload = exactPayload(request.payload);
    if (request.operation === 'websocket') {
      if (!this.#allowWebSocket) throw new Error('HTTP_WEBSOCKET_DENIED');
      if (!exactOrigin) throw new Error('HTTP_WEBSOCKET_EXACT_ORIGIN_REQUIRED');
      if (!this.#allowedMethods.has('GET')) throw new Error('HTTP_REQUEST_METHOD_DENIED:GET');
      const timeoutMs = positiveInteger(payload.timeoutMs ?? this.#maximumExecutionMs,
        'HTTP_REQUEST_TIMEOUT_INVALID', this.#maximumExecutionMs);
      const maximumResponseBytes = positiveInteger(payload.maximumResponseBytes ?? this.#maximumResponseBytes,
        'HTTP_REQUEST_RESPONSE_LIMIT_INVALID', this.#maximumResponseBytes);
      return websocket(url, payload, signal, timeoutMs, maximumResponseBytes, this.#maximumRequestBytes,
        this.#allowedRequestHeaders);
    }
    const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : 'GET';
    if (!METHODS.has(method) || !this.#allowedMethods.has(method)) throw new Error(`HTTP_REQUEST_METHOD_DENIED:${method}`);
    const timeoutMs = positiveInteger(payload.timeoutMs ?? this.#maximumExecutionMs,
      'HTTP_REQUEST_TIMEOUT_INVALID', this.#maximumExecutionMs);
    const maximumResponseBytes = positiveInteger(payload.maximumResponseBytes ?? this.#maximumResponseBytes,
      'HTTP_REQUEST_RESPONSE_LIMIT_INVALID', this.#maximumResponseBytes);
    const returnedHeaders = responseHeaderNames(payload.responseHeaders);
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    const startedAt = Date.now();
    let response: Response;
    try {
      const body = ['GET', 'HEAD'].includes(method) ? undefined
        : requestBody(payload.body, this.#maximumRequestBytes);
      const permittedHeaders = this.#allowedRequestHeaders;
      response = await fetch(url, { method, headers: requestHeaders(payload.headers, permittedHeaders),
        ...(body === undefined ? {} : { body }), redirect: 'manual', signal: combined });
      if (response.status >= 300 && response.status < 400) throw new Error('HTTP_RESPONSE_REDIRECT_DENIED');
      const bytes = method === 'HEAD' ? Buffer.alloc(0) : await responseBytes(response, maximumResponseBytes, combined);
      if (method === 'HEAD') await response.body?.cancel().catch(() => undefined);
      return Object.freeze({
        status: response.status,
        headers: Object.freeze(Object.fromEntries(returnedHeaders.map((name) => [name,
          name === 'content-type' ? response.headers.get(name)?.split(';', 1)[0]?.trim().toLowerCase() ?? null
            : response.headers.get(name)]))),
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
