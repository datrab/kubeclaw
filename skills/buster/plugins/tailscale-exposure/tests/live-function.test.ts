import assert from 'node:assert/strict';
import { testContract } from '../src/provider.js';

const invocation: any = {
  configuration: { values: { path: '/preview', readinessTimeoutSeconds: 90 } },
  inputs: [{ name: 'deployment', kind: 'value', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1', value: {
    schemaVersion: 'kubernetes-deployment-fixture.v1', leaseName: 'test-123', namespace: 'test-123',
    expiresAt: '2030-01-01T00:00:00.000Z', endpoints: [{ name: 'web', url: 'http://web.test-123.svc.cluster.local:8080' }],
  } }],
};
assert.deepEqual(testContract.configuration(invocation), {
  endpointName: undefined, hostname: undefined, path: '/preview', readinessTimeoutSeconds: 90, retentionMode:'release',
});
assert.deepEqual(testContract.deploymentInput(invocation, undefined), {
  leaseName: 'test-123', namespace: 'test-123', expiresAt: '2030-01-01T00:00:00.000Z',
  serviceName: 'web', servicePort: 8080,
});
for (const [port, expected] of [[':80', 80], ['', 80], [':8080', 8080]] as const) {
  const candidate = structuredClone(invocation);
  candidate.inputs[0].value.endpoints[0].url = `http://web.test-123.svc.cluster.local${port}`;
  assert.equal(testContract.deploymentInput(candidate, undefined).servicePort, expected);
}
for (const host of ['evil.example', 'other.test-123.svc.cluster.local', 'web.other.svc.cluster.local']) {
  const candidate = structuredClone(invocation);
  candidate.inputs[0].value.endpoints[0].url = `http://${host}:80`;
  assert.throws(() => testContract.deploymentInput(candidate, undefined), /INTERNAL_ENDPOINT_INVALID/);
}
assert.throws(() => testContract.deploymentInput({ ...invocation, inputs: [{ ...invocation.inputs[0], value: {
  ...invocation.inputs[0].value, endpoints: [{ name: 'web', url: 'http://evil.example:8080' }],
} }] }, undefined), /TAILSCALE_EXPOSURE_INTERNAL_ENDPOINT_INVALID/);
assert.throws(() => testContract.configuration({ ...invocation, configuration: { values: { path: '//evil.example' } } }),
  /TAILSCALE_EXPOSURE_PATH_INVALID/);
console.log(JSON.stringify({ ok: true, provider: 'tailscale-exposure', contractValidation: true,
  mocks: 0, emulators: 0, liveAcceptance: 'verify:test-gate:tailscale-exposure-live' }));
