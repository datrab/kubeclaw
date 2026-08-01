import { readCommonEnvironment } from '../runtime-environment.js';

export const LOCAL_DEVELOPMENT_GATEWAY_BASE_URL = 'http://127.0.0.1:18789';

export type GatewayHeaders = Record<string, string>;

function trimGatewayUrl(value: unknown): string {
  return String(value ?? '').trim().replace(/\/$/, '');
}

function stripInvokeSuffix(value: unknown): string {
  return trimGatewayUrl(value).replace(/\/tools\/invoke$/, '');
}

function configuredGatewayUrl(override?: string | null): string {
  const raw = override ?? readCommonEnvironment('OPENCLAW_GATEWAY_URL');
  const base = stripInvokeSuffix(raw);
  if (!base) {
    throw new Error('Gateway URL is required; provide gatewayUrl or OPENCLAW_GATEWAY_URL');
  }
  return base;
}

export function resolveLocalDevelopmentGatewayBaseUrl(): string {
  return LOCAL_DEVELOPMENT_GATEWAY_BASE_URL;
}

export function resolveGatewayBaseUrl(override?: string | null): string {
  return stripInvokeSuffix(configuredGatewayUrl(override));
}

export function resolveGatewayInvokeUrl(override?: string | null): string {
  const raw = trimGatewayUrl(configuredGatewayUrl(override));
  if (raw.endsWith('/tools/invoke')) return raw;
  return `${stripInvokeSuffix(raw)}/tools/invoke`;
}

export function resolveGatewayHealthUrl(override?: string | null): string {
  return `${stripInvokeSuffix(configuredGatewayUrl(override))}/health`;
}

export function resolveGatewayToken(override?: string | null): string {
  if (override !== undefined && override !== null) return String(override);
  const token = readCommonEnvironment('OPENCLAW_GATEWAY_TOKEN');
  if (token === undefined) {
    throw new Error('Gateway token policy is required; provide gatewayToken or OPENCLAW_GATEWAY_TOKEN');
  }
  return token;
}

export function gatewayHeaders(
  gatewayToken: string | null | undefined,
  extraHeaders: GatewayHeaders = {},
): GatewayHeaders {
  const token = resolveGatewayToken(gatewayToken);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

export function optionalGatewayHeaders(
  gatewayToken: string | null | undefined,
  extraHeaders: GatewayHeaders = {},
): GatewayHeaders {
  const token = gatewayToken ?? readCommonEnvironment('OPENCLAW_GATEWAY_TOKEN');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}
