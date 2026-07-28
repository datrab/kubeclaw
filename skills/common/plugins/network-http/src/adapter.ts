import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';

function positiveInteger(value: unknown, label: string, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || Number(resolved) < 1) throw new Error(`NETWORK_CONFIG_INVALID:${label}`);
  return Number(resolved);
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const origins = context.config.allowedOrigins;
  if (!Array.isArray(origins) || !origins.every((value) => typeof value === 'string')) {
    throw new Error('allowedOrigins is required');
  }
  const allowed = new Set(origins.map((origin) => new URL(origin).origin));
  const methods = new Set((context.config.allowedMethods as string[] | undefined ?? ['GET'])
    .map((method) => method.toUpperCase()));
  const rawAllowedHeaders = context.config.allowedHeaders ?? ['accept', 'content-type', 'idempotency-key'];
  if (!Array.isArray(rawAllowedHeaders) || rawAllowedHeaders.some((item) => typeof item !== 'string')) {
    throw new Error('NETWORK_CONFIG_INVALID:allowedHeaders');
  }
  const headersAllowed = new Set(rawAllowedHeaders.map((item) => item.toLowerCase()));
  const maxRequestBytes = positiveInteger(context.config.maxRequestBytes, 'maxRequestBytes', 1_048_576);
  const maxResponseBytes = positiveInteger(context.config.maxResponseBytes, 'maxResponseBytes', 1_048_576);
  const timeoutMs = positiveInteger(context.config.timeoutMs, 'timeoutMs', 30_000);
  return {
    async ready() {},
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (request.capability !== 'network.http' || request.operation !== 'request') {
        throw new Error('NETWORK_OPERATION_UNSUPPORTED');
      }
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      const url = new URL(request.resource.canonicalId);
      if (!allowed.has(url.origin)) throw new Error(`NETWORK_ORIGIN_DENIED:${url.origin}`);
      if (url.username || url.password) throw new Error('NETWORK_CREDENTIALS_DENIED');
      const method = typeof request.payload.method === 'string' ? request.payload.method.toUpperCase() : 'GET';
      if (!methods.has(method)) throw new Error(`NETWORK_METHOD_DENIED:${method}`);
      const headerInput = request.payload.headers;
      if (headerInput !== undefined && (!headerInput || typeof headerInput !== 'object' || Array.isArray(headerInput))) {
        throw new Error('NETWORK_HEADERS_INVALID');
      }
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(headerInput as Record<string, unknown> | undefined ?? {})) {
        const normalized = name.toLowerCase();
        if (!headersAllowed.has(normalized) || typeof value !== 'string' || /[\r\n]/.test(value)) {
          throw new Error(`NETWORK_HEADER_DENIED:${normalized}`);
        }
        headers[normalized] = value;
      }
      const body = request.payload.body === undefined ? undefined : JSON.stringify(request.payload.body);
      if (body && Buffer.byteLength(body, 'utf8') > maxRequestBytes) throw new Error('NETWORK_REQUEST_SIZE_EXCEEDED');
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.any([signal, timeout]),
          redirect: 'manual',
        });
      } catch (error) {
        if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
        if (timeout.aborted) throw new Error('NETWORK_TIMEOUT');
        throw error;
      }
      if (response.status >= 300 && response.status < 400) throw new Error('NETWORK_REDIRECT_DENIED');
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > maxResponseBytes) throw new Error('NETWORK_RESPONSE_SIZE_EXCEEDED');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxResponseBytes) throw new Error('NETWORK_RESPONSE_SIZE_EXCEEDED');
      const text = new TextDecoder().decode(bytes);
      if (!response.ok) throw new Error(`HTTP_${response.status}:${text.slice(0, 1000)}`);
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      return {
        status: response.status,
        headers: { 'content-type': contentType ?? null },
        body: text.length === 0
          ? null
          : contentType === 'application/json' || contentType?.endsWith('+json')
            ? JSON.parse(text)
            : text,
      };
    },
    async shutdown() {},
  };
}
