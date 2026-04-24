const DEFAULT_GATEWAY_BASE_URL = 'http://127.0.0.1:18789';
const DEFAULT_GATEWAY_INVOKE_URL = `${DEFAULT_GATEWAY_BASE_URL}/tools/invoke`;
const DEFAULT_GATEWAY_HEALTH_URL = `${DEFAULT_GATEWAY_BASE_URL}/health`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function trimGatewayUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function stripInvokeSuffix(value) {
  return trimGatewayUrl(value).replace(/\/tools\/invoke$/, '');
}

export function resolveGatewayBaseUrl(override = null) {
  const raw = override
    || process.env.OPENCLAW_GATEWAY_URL
    || process.env.GATEWAY_URL
    || DEFAULT_GATEWAY_BASE_URL;
  const base = stripInvokeSuffix(raw);
  return base || DEFAULT_GATEWAY_BASE_URL;
}

export function resolveGatewayInvokeUrl(override = null) {
  const raw = trimGatewayUrl(
    override
      || process.env.OPENCLAW_GATEWAY_URL
      || process.env.GATEWAY_URL
      || DEFAULT_GATEWAY_BASE_URL,
  );
  if (!raw) return DEFAULT_GATEWAY_INVOKE_URL;
  if (raw.endsWith('/tools/invoke')) return raw;
  return `${stripInvokeSuffix(raw)}/tools/invoke`;
}

export function resolveGatewayHealthUrl(override = null) {
  const raw = trimGatewayUrl(
    override
      || process.env.OPENCLAW_GATEWAY_URL
      || process.env.GATEWAY_URL
      || DEFAULT_GATEWAY_BASE_URL,
  );
  if (!raw) return DEFAULT_GATEWAY_HEALTH_URL;
  return `${stripInvokeSuffix(raw)}/health`;
}

export function resolveGatewayToken(override = null) {
  return override
    || process.env.OPENCLAW_GATEWAY_TOKEN
    || process.env.GATEWAY_TOKEN
    || '';
}

function gatewayHeaders(gatewayToken = null, extraHeaders = {}) {
  const token = resolveGatewayToken(gatewayToken);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

function isNetworkError(err) {
  return !err?.httpStatus && (
    err?.name === 'AbortError'
    || err?.code === 'ECONNREFUSED'
    || err?.code === 'ECONNRESET'
    || err?.code === 'ETIMEDOUT'
    || err?.cause?.code === 'ECONNREFUSED'
    || err?.cause?.code === 'ECONNRESET'
    || /fetch failed|network|socket/i.test(err?.message || '')
  );
}

async function invokeGatewayTool(tool, args, {
  gatewayUrl = null,
  gatewayToken = null,
  timeoutMs = 30000,
  maxRetries = 3,
  retryDelayMs = 5000,
  body = {},
  extraHeaders = {},
} = {}) {
  const url = resolveGatewayInvokeUrl(gatewayUrl);
  const headers = gatewayHeaders(gatewayToken, extraHeaders);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tool, args, ...body }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const err = new Error(`Gateway ${tool} failed: ${response.status} ${response.statusText}`);
        err.httpStatus = response.status;
        err.httpBody = text;
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    } catch (err) {
      if (!isNetworkError(err) || attempt >= maxRetries) throw err;
      await sleep(retryDelayMs);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function gatewayInvoke(tool, args, timeoutMs = 30000, opts = {}, extraHeaders = {}) {
  const {
    gatewayUrl = null,
    gatewayToken = null,
    body = {},
    extraHeaders: optHeaders = {},
    ...bodyFields
  } = opts || {};

  return invokeGatewayTool(tool, args, {
    gatewayUrl,
    gatewayToken,
    timeoutMs,
    body: {
      ...body,
      ...bodyFields,
    },
    extraHeaders: {
      ...optHeaders,
      ...extraHeaders,
    },
  });
}
