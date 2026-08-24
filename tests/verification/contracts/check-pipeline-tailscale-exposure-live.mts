import assert from 'node:assert/strict';
import { TailscaleExposureCapabilityInvoker, NetworkHttpCapabilityInvoker } from '@kubeclaw/buster-engine';

if (process.env.KUBECLAW_TAILSCALE_EXPOSURE_LIVE !== '1') throw new Error('KUBECLAW_TAILSCALE_EXPOSURE_LIVE=1 is required');
const leaseName = process.env.KUBECLAW_TAILSCALE_LIVE_LEASE;
const namespace = process.env.KUBECLAW_TAILSCALE_LIVE_NAMESPACE;
const serviceName = process.env.KUBECLAW_TAILSCALE_LIVE_SERVICE;
const servicePort = Number(process.env.KUBECLAW_TAILSCALE_LIVE_PORT);
const expiresAt = process.env.KUBECLAW_TAILSCALE_LIVE_EXPIRES_AT;
if (!leaseName || !namespace || !serviceName || !Number.isSafeInteger(servicePort) || !expiresAt
  || !Number.isFinite(Date.parse(expiresAt))) throw new Error('TAILSCALE_EXPOSURE_LIVE_INPUT_REQUIRED');
const controllerNamespace = process.env.KUBECLAW_CONTROLLER_NAMESPACE ?? 'kubeclaw';
const exposure = new TailscaleExposureCapabilityInvoker({ kubectlExecutable: '/usr/local/bin/kubectl', controllerNamespace,
  leaseApiGroup: process.env.KUBECLAW_LEASE_API_GROUP ?? 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
  allowedNamespacePrefixes: ['test'], allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 300_000, pollIntervalMs: 1000 });
const signal = new AbortController().signal;
let prepared: Readonly<Record<string, unknown>> | null = null;
try {
  prepared = await exposure.invoke('kubernetes.exposure', { operation: 'prepare',
    resource: { type: 'kubernetes.exposure', canonicalId: 'kubernetes-exposure:attempt:live' }, payload: {
      leaseName, namespace, serviceName, servicePort, path: '/', expiresAt, readinessTimeoutMs: 240_000,
    } } as any, signal);
  assert.equal(prepared.ok, true); assert.match(String(prepared.url), /^https:\/\/.+\.ts\.net\//u);
  const target = new URL(String(prepared.url));
  const http = new NetworkHttpCapabilityInvoker({ allowedOrigins: [target.origin], allowedHostSuffixes: ['.ts.net'],
    allowedPorts: [443], maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 30_000 });
  const response = await http.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: target.href }, payload: { method: 'GET', timeoutMs: 30_000, maximumResponseBytes: 1024 * 1024 } } as any, signal);
  assert.ok(Number(response.status) >= 200 && Number(response.status) < 300);
  console.log(JSON.stringify({ ok: true, phase: 'tailscale-exposure-live', boundary: 'real-kubernetes-and-tailscale',
    url: prepared.url, httpStatus: response.status, mocks: 0, emulators: 0 }));
} finally {
  if (prepared) await exposure.invoke('kubernetes.exposure', { operation: 'release',
    resource: { type: 'kubernetes.exposure', canonicalId: 'kubernetes-exposure:attempt:live' }, payload: {
      leaseName, namespace, serviceName, servicePort, expiresAt,
    } } as any, signal);
}
