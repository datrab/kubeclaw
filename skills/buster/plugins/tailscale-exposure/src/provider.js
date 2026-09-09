import crypto from 'node:crypto';

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`TAILSCALE_EXPOSURE_CONFIG_INVALID:${label}`);
  return value;
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'root');
  const endpointName = value.endpointName;
  const hostname = value.hostname;
  const path = value.path ?? '/';
  const readinessTimeoutSeconds = value.readinessTimeoutSeconds ?? 120;
  if (endpointName !== undefined && (typeof endpointName !== 'string' || !DNS_LABEL.test(endpointName))) throw new Error('TAILSCALE_EXPOSURE_ENDPOINT_NAME_INVALID');
  if (hostname !== undefined && (typeof hostname !== 'string' || !DNS_LABEL.test(hostname))) throw new Error('TAILSCALE_EXPOSURE_HOSTNAME_INVALID');
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.length > 1024
    || /[\0\r\n?#]/u.test(path)) throw new Error('TAILSCALE_EXPOSURE_PATH_INVALID');
  if (!Number.isSafeInteger(readinessTimeoutSeconds) || readinessTimeoutSeconds < 1 || readinessTimeoutSeconds > 3600) {
    throw new Error('TAILSCALE_EXPOSURE_READINESS_TIMEOUT_INVALID');
  }
  return { endpointName, hostname, path, readinessTimeoutSeconds };
}

function deploymentInput(invocation, endpointName) {
  if (invocation.inputs.some((item) => item.name !== 'deployment')) throw new Error('TAILSCALE_EXPOSURE_INPUT_UNKNOWN');
  const inputs = invocation.inputs.filter((item) => item.name === 'deployment');
  if (inputs.length !== 1 || inputs[0].kind !== 'value' || inputs[0].schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1') {
    throw new Error('TAILSCALE_EXPOSURE_DEPLOYMENT_INPUT_INVALID');
  }
  const value = object(inputs[0].value, 'deployment');
  if (value.schemaVersion !== 'kubernetes-deployment-fixture.v1' || typeof value.leaseName !== 'string'
    || !DNS_LABEL.test(value.leaseName) || typeof value.namespace !== 'string' || !DNS_LABEL.test(value.namespace)
    || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))
    || !Array.isArray(value.endpoints) || value.endpoints.length < 1) throw new Error('TAILSCALE_EXPOSURE_DEPLOYMENT_INVALID');
  const endpoints = value.endpoints.map((entry) => object(entry, 'endpoint'));
  const selected = endpointName === undefined
    ? (endpoints.length === 1 ? endpoints[0] : null)
    : endpoints.find((entry) => entry.name === endpointName);
  if (!selected || typeof selected.name !== 'string' || !DNS_LABEL.test(selected.name) || typeof selected.url !== 'string') {
    throw new Error(endpointName === undefined ? 'TAILSCALE_EXPOSURE_ENDPOINT_AMBIGUOUS' : 'TAILSCALE_EXPOSURE_ENDPOINT_NOT_FOUND');
  }
  const url = new URL(selected.url);
  if (url.protocol !== 'http:' || url.username || url.password || url.hash || url.pathname !== '/' || url.search) {
    throw new Error('TAILSCALE_EXPOSURE_INTERNAL_ENDPOINT_INVALID');
  }
  const expectedHost = `${selected.name}.${value.namespace}.svc.cluster.local`;
  const servicePort = url.port === '' ? 80 : Number(url.port);
  if (url.hostname !== expectedHost || !Number.isSafeInteger(servicePort) || servicePort < 1 || servicePort > 65535) {
    throw new Error('TAILSCALE_EXPOSURE_INTERNAL_ENDPOINT_INVALID');
  }
  return { leaseName: value.leaseName, namespace: value.namespace, expiresAt: value.expiresAt,
    serviceName: selected.name, servicePort };
}

function details(values) {
  const schemaId = 'kubeclaw.tailscale-exposure-details.v1';
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

export function provider() {
  return {
    async execute(invocation, context) {
      const config = configuration(invocation);
      const deployment = deploymentInput(invocation, config.endpointName);
      const result = await context.invoke('kubernetes.exposure', {
        operation: 'prepare', resource: { type: 'kubernetes.exposure', canonicalId: `kubernetes-exposure:${invocation.attemptId}` },
        payload: { ...deployment, path: config.path, ...(config.hostname ? { hostname: config.hostname } : {}),
          readinessTimeoutMs: Math.min(invocation.timeoutMs, config.readinessTimeoutSeconds * 1000) },
      });
      if (result.ok !== true || typeof result.url !== 'string' || typeof result.hostname !== 'string'
        || result.expiresAt !== deployment.expiresAt) {
        throw new Error('TAILSCALE_EXPOSURE_PREPARATION_FAILED');
      }
      const exposure = { schemaVersion: 'public-endpoint-fixture.v1', provider: 'tailscale-ingress',
        url: result.url, hostname: result.hostname, namespace: deployment.namespace, leaseName: deployment.leaseName,
        createdAt: result.createdAt, expiresAt: result.expiresAt, releaseAction: result.releaseAction };
      context.log('stdout', `Prepared Tailscale exposure ${result.url}.\n`);
      return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: `Prepared Tailscale exposure ${result.hostname}.`,
        counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [], evidenceFiles: [], reports: [],
        outputs: [{ name: 'exposure', kind: 'value', schemaId: 'kubeclaw.public-endpoint-fixture@1', value: exposure }],
        exitCode: null, signal: null, providerDetails: details({ leaseName: deployment.leaseName,
          namespace: deployment.namespace, hostname: result.hostname, expiresAt: deployment.expiresAt }) };
    },
    async cleanup(invocation, context) {
      const config = configuration(invocation);
      const deployment = deploymentInput(invocation, config.endpointName);
      await context.invoke('kubernetes.exposure', { operation: 'release',
        resource: { type: 'kubernetes.exposure', canonicalId: `kubernetes-exposure:${invocation.attemptId}` },
        payload: { ...deployment, path: config.path, ...(config.hostname ? { hostname: config.hostname } : {}) } });
    },
  };
}

export const testContract = Object.freeze({ configuration, deploymentInput });
