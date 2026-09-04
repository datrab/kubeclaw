import { integer, object, policy, result, safePart, SEVERITIES } from './common.js';

const PROFILES = Object.freeze({
  'api-http-v1': Object.freeze([
    { id: 'content-type-nosniff', header: 'x-content-type-options', severity: 'high', kind: 'equals', value: 'nosniff' },
    { id: 'content-security-policy', header: 'content-security-policy', severity: 'high', kind: 'present' },
    { id: 'referrer-policy', header: 'referrer-policy', severity: 'medium', kind: 'present' },
    { id: 'permissions-policy', header: 'permissions-policy', severity: 'medium', kind: 'present' },
  ]),
  'web-https-v1': Object.freeze([
    { id: 'hsts', header: 'strict-transport-security', severity: 'high', kind: 'hsts-min-age', value: '31536000' },
    { id: 'content-type-nosniff', header: 'x-content-type-options', severity: 'high', kind: 'equals', value: 'nosniff' },
    { id: 'content-security-policy', header: 'content-security-policy', severity: 'high', kind: 'present' },
    { id: 'frame-options', header: 'x-frame-options', severity: 'medium', kind: 'present' },
    { id: 'referrer-policy', header: 'referrer-policy', severity: 'medium', kind: 'present' },
    { id: 'permissions-policy', header: 'permissions-policy', severity: 'medium', kind: 'present' },
  ]),
});

function rule(value) {
  const item = object(value, 'SECURITY_HEADERS_RULE_INVALID');
  if (typeof item.id !== 'string' || !/^[a-z0-9.-]+$/u.test(item.id) || item.id.length > 128
    || typeof item.header !== 'string' || !/^[a-z0-9-]+$/u.test(item.header) || item.header.length > 128
    || !SEVERITIES.includes(item.severity) || !['present', 'equals', 'contains', 'hsts-min-age'].includes(item.kind)
    || (item.kind !== 'present' && (typeof item.value !== 'string' || item.value.length < 1 || item.value.length > 1024))
    || (item.kind === 'hsts-min-age' && (!/^\d+$/u.test(item.value) || Number(item.value) < 1))) {
    throw new Error('SECURITY_HEADERS_RULE_INVALID');
  }
  return { id: item.id, header: item.header, severity: item.severity, kind: item.kind,
    ...(item.kind === 'present' ? {} : { value: item.value }) };
}

function rules(profileName, overrides) {
  const base = PROFILES[profileName];
  if (!base) throw new Error('SECURITY_HEADERS_PROFILE_INVALID');
  const value = overrides === undefined ? {} : object(overrides, 'SECURITY_HEADERS_RULES_INVALID');
  const remove = value.remove ?? [];
  if (!Array.isArray(remove) || remove.length > 32 || new Set(remove).size !== remove.length
    || remove.some((id) => typeof id !== 'string')) throw new Error('SECURITY_HEADERS_RULES_INVALID');
  const replace = (value.replace ?? []).map(rule); const add = (value.add ?? []).map(rule);
  const replacement = new Map(replace.map((item) => [item.id, item]));
  if (replacement.size !== replace.length || new Set(add.map((item) => item.id)).size !== add.length
    || add.some((item) => base.some((existing) => existing.id === item.id) || replacement.has(item.id))
    || replace.some((item) => !base.some((existing) => existing.id === item.id))) throw new Error('SECURITY_HEADERS_RULES_INVALID');
  const resolved = base.filter((item) => !remove.includes(item.id)).map((item) => replacement.get(item.id) ?? item).concat(add);
  if (resolved.length < 1 || resolved.length > 64 || new Set(resolved.map((item) => item.id)).size !== resolved.length) {
    throw new Error('SECURITY_HEADERS_RULES_INVALID');
  }
  return resolved;
}

function deployment(invocation) {
  if (!Array.isArray(invocation.inputs) || invocation.inputs.length !== 1) throw new Error('SECURITY_HEADERS_DEPLOYMENT_REQUIRED');
  const input = invocation.inputs[0];
  if (input.name !== 'deployment' || input.kind !== 'value' || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1') {
    throw new Error('SECURITY_HEADERS_DEPLOYMENT_REQUIRED');
  }
  const value = object(input.value, 'SECURITY_HEADERS_DEPLOYMENT_INVALID');
  if (value.schemaVersion !== 'kubernetes-deployment-fixture.v1' || !Array.isArray(value.endpoints) || value.endpoints.length !== 1) {
    throw new Error('SECURITY_HEADERS_DEPLOYMENT_INVALID');
  }
  const endpoint = object(value.endpoints[0], 'SECURITY_HEADERS_DEPLOYMENT_INVALID');
  if (typeof endpoint.url !== 'string') throw new Error('SECURITY_HEADERS_DEPLOYMENT_INVALID');
  const url = new URL(endpoint.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SECURITY_HEADERS_DEPLOYMENT_INVALID');
  }
  return url.origin;
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'SECURITY_HEADERS_CONFIG_INVALID');
  if (!Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > 32
    || new Set(value.paths).size !== value.paths.length || value.paths.some((item) => typeof item !== 'string'
      || !item.startsWith('/') || item.startsWith('//') || item.length > 2048 || /[\\\r\n#?]/u.test(item))) {
    throw new Error('SECURITY_HEADERS_PATHS_INVALID');
  }
  const origin = deployment(invocation);
  if (value.profile === 'web-https-v1' && !origin.startsWith('https://')) throw new Error('SECURITY_HEADERS_HTTPS_REQUIRED');
  return { origin, profile: value.profile, paths: value.paths, rules: rules(value.profile, value.rules),
    requestTimeoutMs: integer(value.requestTimeoutMs, 10_000, 1, 300_000, 'SECURITY_HEADERS_TIMEOUT_INVALID'),
    policy: policy(value.policy) };
}

function check(value, item) {
  if (item.kind === 'present') return typeof value === 'string' && value.length > 0;
  if (typeof value !== 'string') return false;
  if (item.kind === 'equals') return value.toLowerCase() === item.value.toLowerCase();
  if (item.kind === 'contains') return value.toLowerCase().includes(item.value.toLowerCase());
  const match = /(?:^|;)\s*max-age=(\d+)(?:;|$)/iu.exec(value);
  return Boolean(match && Number(match[1]) >= Number(item.value));
}

export function provider() {
  return { async execute(invocation, context) {
    const config = configuration(invocation); const findings = []; const observations = [];
    const responseHeaders = [...new Set(config.rules.map((item) => item.header))];
    for (const path of config.paths) {
      const target = new URL(path, `${config.origin}/`);
      if (target.origin !== config.origin) throw new Error('SECURITY_HEADERS_PATHS_INVALID');
      const url = target.href;
      const response = object(await context.invoke('network.http', { operation: 'request',
        resource: { type: 'network.url', canonicalId: url }, payload: { method: 'GET', timeoutMs: config.requestTimeoutMs,
          maximumResponseBytes: 65_536, responseHeaders } }), 'SECURITY_HEADERS_RESPONSE_INVALID');
      const headers = object(response.headers, 'SECURITY_HEADERS_RESPONSE_INVALID');
      observations.push({ path, status: response.status, headers: responseHeaders.filter((name) => typeof headers[name] === 'string') });
      for (const item of config.rules) if (!check(headers[item.header], item)) findings.push({
        id: `header:${safePart(item.id)}:${safePart(path)}`, severity: item.severity,
        message: `${path} does not satisfy security-header rule ${item.id}.`, rule: `security-header.${item.id}`,
        category: 'header', status: 'affected',
      });
    }
    return result(invocation, 'headers', findings, config.policy,
      { profile: config.profile, resolvedRules: config.rules, observations });
  } };
}

export const testContract = Object.freeze({ configuration, rules });
