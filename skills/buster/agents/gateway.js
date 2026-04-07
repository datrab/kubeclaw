export const DEFAULT_GATEWAY_BASE_URL = 'http://127.0.0.1:18789';
export const DEFAULT_GATEWAY_INVOKE_URL = `${DEFAULT_GATEWAY_BASE_URL}/tools/invoke`;

export function resolveGatewayBaseUrl(override = null) {
  return override || process.env.GATEWAY_URL || DEFAULT_GATEWAY_BASE_URL;
}

export function resolveGatewayInvokeUrl(override = null) {
  const base = resolveGatewayBaseUrl(override).replace(/\/$/, '');
  if (base.endsWith('/tools/invoke')) return base;
  return `${base}/tools/invoke`;
}

export function gatewayHeaders(gatewayToken = null) {
  return {
    'Content-Type': 'application/json',
    ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
  };
}

export async function invokeGatewayTool(tool, args, { gatewayUrl = null, gatewayToken = null, timeoutMs = 10000 } = {}) {
  const url = resolveGatewayInvokeUrl(gatewayUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: gatewayHeaders(gatewayToken || process.env.GATEWAY_TOKEN || null),
    body: JSON.stringify({ tool, args }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
  return res.json();
}
