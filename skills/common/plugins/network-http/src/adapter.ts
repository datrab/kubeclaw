import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';

function positiveInteger(value: unknown, label: string, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || Number(resolved) < 1) throw new Error(`NETWORK_CONFIG_INVALID:${label}`);
  return Number(resolved);
}

interface NetworkConfig {
  readonly origins: ReadonlySet<string>;
  readonly methods: ReadonlySet<string>;
  readonly headers: ReadonlySet<string>;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}

function parseConfig(config: Readonly<Record<string, unknown>>): NetworkConfig {
  const origins = config.allowedOrigins;
  if (!Array.isArray(origins) || !origins.every((value) => typeof value === 'string')) {
    throw new Error('allowedOrigins is required');
  }
  const rawHeaders = config.allowedHeaders ?? ['accept', 'content-type', 'idempotency-key'];
  if (!Array.isArray(rawHeaders) || rawHeaders.some((item) => typeof item !== 'string')) {
    throw new Error('NETWORK_CONFIG_INVALID:allowedHeaders');
  }
  return {
    origins: new Set(origins.map((origin) => new URL(origin).origin)),
    methods: new Set((config.allowedMethods as string[] | undefined ?? ['GET']).map((method) => method.toUpperCase())),
    headers: new Set(rawHeaders.map((item) => item.toLowerCase())),
    maxRequestBytes: positiveInteger(config.maxRequestBytes, 'maxRequestBytes', 1_048_576),
    maxResponseBytes: positiveInteger(config.maxResponseBytes, 'maxResponseBytes', 1_048_576),
    timeoutMs: positiveInteger(config.timeoutMs, 'timeoutMs', 30_000),
  };
}

function requestHeaders(value: unknown, allowed: ReadonlySet<string>): Record<string, string> {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new Error('NETWORK_HEADERS_INVALID');
  }
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value as Record<string, unknown> | undefined ?? {})) {
    const normalized = name.toLowerCase();
    if (!allowed.has(normalized) || typeof headerValue !== 'string' || /[\r\n]/.test(headerValue)) {
      throw new Error(`NETWORK_HEADER_DENIED:${normalized}`);
    }
    headers[normalized] = headerValue;
  }
  headers.connection = 'close';
  return headers;
}

async function performRequest(
  url: URL, method: string, headers: Record<string, string>, body: string | undefined,
  signal: AbortSignal, timeoutMs: number, maximum: number,
): Promise<{ response: Response; text: string; contentType: string | undefined }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = AbortSignal.any([signal, timeout]);
  try {
    const response = await fetch(url, {
      method, headers, ...(body === undefined ? {} : { body }),
      signal: requestSignal, redirect: 'manual',
    });
    return { response, ...await responseBody(response, maximum) };
  } catch (error) {
    if (requestSignal.aborted) {
      const timedOut = timeout.aborted && requestSignal.reason === timeout.reason;
      throw new Error(timedOut ? 'NETWORK_TIMEOUT' : 'ADAPTER_CANCELLED', { cause: requestSignal.reason });
    }
    throw error;
  }
}

async function responseBody(response: Response, maximum: number): Promise<{ text: string; contentType: string | undefined }> {
  const reader = response.body?.getReader();
  try {
    if (response.status >= 300 && response.status < 400) throw new Error('NETWORK_REDIRECT_DENIED');
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maximum) throw new Error('NETWORK_RESPONSE_SIZE_EXCEEDED');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      // Fetch delivers decompressed bytes. Never retain a chunk over budget.
      if (value.byteLength > maximum - total) throw new Error('NETWORK_RESPONSE_SIZE_EXCEEDED');
      chunks.push(value);
      total += value.byteLength;
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks, total));
    if (!response.ok) throw new Error(`HTTP_${response.status}:${text.slice(0, 1000)}`);
    return { text, contentType: response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() };
  } finally {
    if (reader) {
      try { await reader.cancel(); }
      catch { /* INTENTIONAL_NONCRITICAL(response_cancel_failed): Preserve the request failure if its stream is already errored. */ }
      reader.releaseLock();
    }
  }
}

function decodedBody(text: string, contentType: string | undefined): unknown {
  if (text.length === 0) return null;
  return contentType === 'application/json' || contentType?.endsWith('+json') ? JSON.parse(text) : text;
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const config = parseConfig(context.config);
  return {
    async ready() {},
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (request.capability !== 'network.http' || request.operation !== 'request') {
        throw new Error('NETWORK_OPERATION_UNSUPPORTED');
      }
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED', { cause: signal.reason });
      const url = new URL(request.resource.canonicalId);
      if (!config.origins.has(url.origin)) throw new Error(`NETWORK_ORIGIN_DENIED:${url.origin}`);
      if (url.username || url.password) throw new Error('NETWORK_CREDENTIALS_DENIED');
      const method = typeof request.payload.method === 'string' ? request.payload.method.toUpperCase() : 'GET';
      if (!config.methods.has(method)) throw new Error(`NETWORK_METHOD_DENIED:${method}`);
      const headers = requestHeaders(request.payload.headers, config.headers);
      const body = request.payload.body === undefined ? undefined : JSON.stringify(request.payload.body);
      if (body && Buffer.byteLength(body, 'utf8') > config.maxRequestBytes) throw new Error('NETWORK_REQUEST_SIZE_EXCEEDED');
      const { response, text, contentType } = await performRequest(url, method, headers, body, signal, config.timeoutMs, config.maxResponseBytes);
      return {
        status: response.status,
        headers: {
          'content-type': contentType ?? null,
          'docker-content-digest': response.headers.get('docker-content-digest'),
        },
        body: decodedBody(text, contentType),
      };
    },
    async shutdown() {},
  };
}
