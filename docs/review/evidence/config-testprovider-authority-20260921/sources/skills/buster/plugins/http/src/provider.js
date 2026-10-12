import crypto from 'node:crypto';

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

function integer(value, fallback, minimum, maximum, code) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) throw new Error(code);
  return resolved;
}

function pathValue(value) {
  const resolved = value ?? '/';
  if (typeof resolved !== 'string' || resolved.length > 2048 || !resolved.startsWith('/') || resolved.startsWith('//')
    || /[\r\n#]/u.test(resolved)) throw new Error('HTTP_CONFIG_PATH_INVALID');
  return resolved;
}

function parsedBase(value, allowPath) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('HTTP_CONFIG_URL_INVALID');
  let url;
  try { url = new URL(value); } catch { throw new Error('HTTP_CONFIG_URL_INVALID'); }
  const canonical = url.origin + url.pathname;
  const canonicalMatch = value === canonical || (!allowPath && url.pathname === '/' && value === url.origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
    || (!allowPath && url.pathname !== '/') || url.search || !canonicalMatch) {
    throw new Error('HTTP_CONFIG_URL_INVALID');
  }
  return { origin: url.origin, path: url.pathname };
}

function explicitBase(value) {
  return parsedBase(value, false).origin;
}

function deploymentInput(invocation) {
  const unknown = invocation.inputs.filter((input) => !['deployment', 'endpoint'].includes(input.name));
  if (unknown.length) throw new Error('HTTP_INPUT_UNKNOWN');
  const inputs = invocation.inputs.filter((input) => input.name === 'deployment');
  if (inputs.length > 1 || inputs.some((input) => input.kind !== 'value'
    || input.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1')) throw new Error('HTTP_INPUT_INVALID');
  const endpointInputs = invocation.inputs.filter((input) => input.name === 'endpoint');
  if (endpointInputs.length > 1 || endpointInputs.some((input) => input.kind !== 'value'
    || input.schemaId !== 'kubeclaw.public-endpoint-fixture@1')) throw new Error('HTTP_INPUT_INVALID');
  if (inputs.length && endpointInputs.length) throw new Error('HTTP_TARGET_AMBIGUOUS');
  if (endpointInputs.length) {
    const value = object(endpointInputs[0].value, 'HTTP_INPUT_INVALID');
    if (value.schemaVersion !== 'public-endpoint-fixture.v1' || value.provider !== 'tailscale-ingress'
      || typeof value.url !== 'string') throw new Error('HTTP_INPUT_ENDPOINT_INVALID');
    const endpoint = parsedBase(value.url, true);
    return [{ name: 'public', url: endpoint.origin, defaultPath: endpoint.path }];
  }
  if (inputs.length === 0) return null;
  const value = object(inputs[0].value, 'HTTP_INPUT_INVALID');
  if (!Array.isArray(value.endpoints) || value.endpoints.length < 1 || value.endpoints.length > 32) {
    throw new Error('HTTP_INPUT_ENDPOINTS_INVALID');
  }
  const endpoints = value.endpoints.map((entry) => {
    const endpoint = object(entry, 'HTTP_INPUT_ENDPOINT_INVALID');
    if (typeof endpoint.name !== 'string' || !DNS_LABEL.test(endpoint.name) || typeof endpoint.url !== 'string') {
      throw new Error('HTTP_INPUT_ENDPOINT_INVALID');
    }
    return { name: endpoint.name, url: explicitBase(endpoint.url), defaultPath: '/' };
  });
  return endpoints;
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'HTTP_CONFIG_INVALID');
  const deployment = deploymentInput(invocation);
  if (value.url !== undefined && deployment) throw new Error('HTTP_TARGET_AMBIGUOUS');
  if (value.endpointName !== undefined && (!deployment || typeof value.endpointName !== 'string' || !DNS_LABEL.test(value.endpointName))) {
    throw new Error('HTTP_CONFIG_ENDPOINT_NAME_INVALID');
  }
  let base; let defaultPath = '/';
  if (value.url !== undefined) base = explicitBase(value.url);
  else if (deployment) {
    const selected = value.endpointName === undefined
      ? (deployment.length === 1 ? deployment[0] : null)
      : deployment.find((endpoint) => endpoint.name === value.endpointName);
    if (!selected) throw new Error('HTTP_TARGET_ENDPOINT_NOT_FOUND');
    base = selected.url; defaultPath = selected.defaultPath;
  } else throw new Error('HTTP_TARGET_REQUIRED');
  const method = value.method ?? 'GET';
  if (!['GET', 'HEAD'].includes(method)) throw new Error('HTTP_CONFIG_METHOD_INVALID');
  const accept = value.accept ?? '*/*';
  if (typeof accept !== 'string' || accept.length < 1 || accept.length > 512 || /[\r\n]/u.test(accept)) {
    throw new Error('HTTP_CONFIG_ACCEPT_INVALID');
  }
  const expectedStatuses = value.expectedStatuses ?? null;
  if (expectedStatuses !== null && (!Array.isArray(expectedStatuses) || expectedStatuses.length < 1
    || expectedStatuses.length > 32 || new Set(expectedStatuses).size !== expectedStatuses.length
    || expectedStatuses.some((status) => !Number.isSafeInteger(status) || status < 100 || status > 599))) {
    throw new Error('HTTP_CONFIG_STATUSES_INVALID');
  }
  const expectedText = value.expectedText ?? null;
  if (expectedText !== null && (typeof expectedText !== 'string' || expectedText.length < 1 || expectedText.length > 4096
    || method === 'HEAD')) throw new Error('HTTP_CONFIG_EXPECTED_TEXT_INVALID');
  const expectedContentType = value.expectedContentType ?? null;
  if (expectedContentType !== null && (typeof expectedContentType !== 'string' || expectedContentType.length > 128
    || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(expectedContentType))) {
    throw new Error('HTTP_CONFIG_CONTENT_TYPE_INVALID');
  }
  const path = pathValue(value.path ?? defaultPath);
  return { url: new URL(path, `${base}/`).href, method, accept, expectedStatuses, expectedText,
    expectedContentType, maximumResponseBytes: integer(value.maximumResponseBytes, 1_048_576, 1, 16_777_216,
      'HTTP_CONFIG_RESPONSE_LIMIT_INVALID'),
    requestTimeoutMs: integer(value.requestTimeoutMs, 10_000, 1, 300_000, 'HTTP_CONFIG_TIMEOUT_INVALID') };
}

function details(values) {
  const schemaId = 'kubeclaw.http-details.v1';
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

function result(invocation, config, response) {
  const statusPassed = config.expectedStatuses ? config.expectedStatuses.includes(response.status)
    : response.status >= 200 && response.status < 300;
  const textPassed = config.expectedText === null || response.body.includes(config.expectedText);
  const contentType = response.headers?.['content-type'] ?? null;
  const contentTypePassed = config.expectedContentType === null || contentType === config.expectedContentType;
  const findings = [
    ...(!statusPassed ? [{ id: `http:${invocation.testIdentity}:status`, severity: 'high',
      message: `HTTP status ${response.status} did not match the declared status rule.`, rule: 'http.status' }] : []),
    ...(!textPassed ? [{ id: `http:${invocation.testIdentity}:text`, severity: 'high',
      message: 'The response did not contain the declared text.', rule: 'http.response-text' }] : []),
    ...(!contentTypePassed ? [{ id: `http:${invocation.testIdentity}:content-type`, severity: 'high',
      message: `Content type ${String(contentType)} did not match ${config.expectedContentType}.`, rule: 'http.content-type' }] : []),
  ];
  const passed = findings.length === 0;
  return { schemaVersion: 'provider-result.v1', outcome: passed ? 'passed' : 'failed',
    summary: passed ? `HTTP ${response.status} matched all assertions.` : `${findings.length} HTTP assertion${findings.length === 1 ? '' : 's'} failed.`,
    counts: { total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0 }, findings,
    metrics: [{ name: 'http.response.duration', value: response.durationMs, unit: 'milliseconds' },
      { name: 'http.response.bytes', value: response.sizeBytes, unit: 'bytes' }],
    evidenceFiles: [], reports: [], outputs: [], exitCode: null, signal: null,
    providerDetails: details({ url: config.url, method: config.method, status: response.status,
      contentType, sizeBytes: response.sizeBytes, bodyDigest: response.bodyDigest, durationMs: response.durationMs }) };
}

function failedRequest(invocation, config, error) {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : 'HTTP_REQUEST_FAILED';
  if (!['HTTP_REQUEST_FAILED', 'HTTP_REQUEST_TIMEOUT'].includes(code)) throw error;
  return { schemaVersion: 'provider-result.v1', outcome: 'failed', summary: code === 'HTTP_REQUEST_TIMEOUT'
    ? 'The HTTP request timed out.' : 'The HTTP target was not reachable.',
    counts: { total: 1, passed: 0, failed: 1, skipped: 0 }, findings: [{ id: `http:${invocation.testIdentity}:request`, severity: 'high',
      message: code === 'HTTP_REQUEST_TIMEOUT' ? 'The HTTP request timed out.' : 'The HTTP request failed before a response arrived.',
      rule: code === 'HTTP_REQUEST_TIMEOUT' ? 'http.timeout' : 'http.connection' }],
    metrics: [], evidenceFiles: [], reports: [], outputs: [], exitCode: null, signal: null,
    providerDetails: details({ url: config.url, method: config.method, errorCode: code }) };
}

export function provider() {
  return { async execute(invocation, context) {
    const config = configuration(invocation);
    context.log('stdout', `Requesting ${config.method} ${config.url}.\n`);
    try {
      const response = await context.invoke('network.http', { operation: 'request',
        resource: { type: 'network.url', canonicalId: config.url }, payload: { method: config.method,
          headers: { accept: config.accept }, timeoutMs: Math.min(config.requestTimeoutMs, invocation.timeoutMs),
          maximumResponseBytes: config.maximumResponseBytes } });
      const checked = object(response, 'HTTP_RESPONSE_INVALID');
      if (!Number.isSafeInteger(checked.status) || typeof checked.body !== 'string'
        || !Number.isSafeInteger(checked.sizeBytes) || typeof checked.bodyDigest !== 'string'
        || !Number.isSafeInteger(checked.durationMs)) throw new Error('HTTP_RESPONSE_INVALID');
      return result(invocation, config, checked);
    } catch (error) { return failedRequest(invocation, config, error); }
  } };
}

export const testContract = Object.freeze({ configuration });
