import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function normalizeLocalhostPort(port) {
  const normalizedPort = typeof port === 'string' && /^\d+$/.test(port)
    ? Number(port)
    : port;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!Number.isInteger(normalizedPort)), () => (normalizedPort < 0))), () => (normalizedPort > 65535))) {
    throw new Error('localhost suite port must be an integer between 0 and 65535');
  }
  return normalizedPort;
}

export function buildLocalhostSuiteUrl(port, routePath, field) {
  if (selectTruthyValue(() => (typeof routePath !== 'string'), () => (routePath.length === 0))) {
    throw new Error(`${field} must be an absolute localhost URL path`);
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (!routePath.startsWith('/')), () => (routePath.startsWith('//')))), () => (/[\u0000-\u001f\u007f]/.test(routePath)))) {
    throw new Error(`${field} must be an absolute localhost URL path without authority, protocol, or control characters`);
  }
  const base = new URL(`http://localhost:${normalizeLocalhostPort(port)}`);
  const url = new URL(routePath, base);
  if (url.origin !== base.origin) {
    throw new Error(`${field} resolved outside localhost origin`);
  }
  return url.href;
}
