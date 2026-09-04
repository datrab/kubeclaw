import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages } from '@kubeclaw/nova-core';
import { TailscaleExposureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/tailscale-exposure-runtime.ts';

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'tailscale-exposure-implementation',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.tailscale-exposure@1');
assert.ok(entry);
assert.equal(entry.registration.kind, 'fixture');
assert.deepEqual(entry.registration.capabilities, ['kubernetes.exposure']);
assert.equal(entry.registration.retrySafe, false);
assert.equal(entry.registration.inputs[0]?.schemaId, 'kubeclaw.kubernetes-deployment-fixture@1');
assert.equal(entry.registration.outputs[0]?.schemaId, 'kubeclaw.public-endpoint-fixture@1');
const provider = fs.readFileSync('skills/buster/plugins/tailscale-exposure/src/provider.js', 'utf8');
const runtime = fs.readFileSync('skills/buster/engine/test-gates/tailscale-exposure-runtime.ts', 'utf8');
const controller = fs.readFileSync('cmd/buster-namespace-controller/main.go', 'utf8');
const crd = fs.readFileSync('charts/kubeclaw/templates/buster-namespace-lease-crd.yaml', 'utf8');
assert.doesNotMatch(provider, /expectedText|smoke|fetch\(/u);
assert.match(provider, /kubeclaw\.public-endpoint-fixture@1/u);
assert.match(runtime, /protocol !== 'https:'|url\.protocol !== 'https:'/u);
assert.match(runtime, /allowedHostSuffixes/u);
assert.match(runtime, /TAILSCALE_EXPOSURE_CANCELLED/u);
assert.match(runtime, /TAILSCALE_EXPOSURE_READINESS_TIMEOUT/u);
assert.match(runtime, /'purpose':? 'final-preview'|purpose: 'final-preview'/u);
assert.match(runtime, /purpose: 'gate'[^]*provider: 'off'/u);
assert.match(controller, /ensurePreviewExposure/u);
assert.match(controller, /tailscale-ingress/u);
assert.match(crd, /purpose:\s*\n\s*type: string/u);
assert.doesNotMatch(crd, /self == oldSelf/u);
assert.match(crd, /access is immutable/u);
assert.match(crd, /previewUrl:\s*\n\s*type: string\s*\n\s*nullable: true/u);
assert.match(controller, /legacyMutableExposureDigest/u);
assert.match(controller, /return "https:\/\/" \+ host \+ "\/"/u);
assert.equal(fs.existsSync('/usr/local/bin/kubectl'), true);
const capability = new TailscaleExposureCapabilityInvoker({ kubectlExecutable: '/usr/local/bin/kubectl',
  controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
  allowedNamespacePrefixes: ['test'], allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 30_000 });
await assert.rejects(() => capability.invoke('kubernetes.exposure', { operation: 'prepare',
  resource: { type: 'kubernetes.exposure', canonicalId: 'invalid' }, payload: {} } as any,
new AbortController().signal), /TAILSCALE_EXPOSURE_CAPABILITY_REQUEST_INVALID/u);
const cancellation = new AbortController();
const patches: string[] = [];
const expiresAt = new Date(Date.now() + 60_000).toISOString();
let exposureOwner: string | undefined;
let resourceVersion = '1';
const cancellable = new TailscaleExposureCapabilityInvoker({ kubectlExecutable: '/usr/local/bin/kubectl',
  controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
  allowedNamespacePrefixes: ['test'], allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 30_000,
  async execute(_command, args) {
    if (args[0] === 'auth') return { stdout: 'yes\n' };
    if (args[0] === 'get') return { stdout: JSON.stringify({
      metadata: { name: 'preview-one', resourceVersion,
        ...(exposureOwner ? { annotations: { 'kubeclaw.forgestack.ai/exposure-owner': exposureOwner } } : {}) },
      spec: { namespaceName: 'test-one', serviceName: 'service-one', servicePort: 8080 },
      status: { phase: 'Ready', exposurePhase: 'Pending', namespaceName: 'test-one', expiresAt },
    }) };
    if (args[0] === 'patch') {
      const body = String(args[args.indexOf('-p') + 1]);
      patches.push(body);
      const patch = JSON.parse(body);
      if (body.includes('final-preview')) {
        exposureOwner = patch.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
        resourceVersion = '2';
        cancellation.abort();
      } else {
        assert.equal(patch.metadata.resourceVersion, '2');
        exposureOwner = undefined;
        resourceVersion = '3';
      }
      return { stdout: '{}' };
    }
    throw new Error(`unexpected kubectl operation: ${args.join(' ')}`);
  },
});
await assert.rejects(() => cancellable.invoke('kubernetes.exposure', { operation: 'prepare',
  resource: { type: 'kubernetes.exposure', canonicalId: 'kubernetes-exposure:attempt:test' },
  payload: { leaseName: 'preview-one', namespace: 'test-one', serviceName: 'service-one', servicePort: 8080,
    expiresAt, path: '/', readinessTimeoutMs: 10_000 } } as any, cancellation.signal),
/TAILSCALE_EXPOSURE_CANCELLED/u);
assert.equal(patches.length, 2);
assert.match(patches[0]!, /final-preview/u);
assert.match(patches[1]!, /"provider":"off"/u);
const rollbackFailure = Object.freeze(new Error('rollback unavailable'));
let failedOwner: string | undefined;
const failedRollback = new TailscaleExposureCapabilityInvoker({ kubectlExecutable: '/usr/local/bin/kubectl',
  controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
  allowedNamespacePrefixes: ['test'], allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 30_000,
  async execute(_command, args) {
    if (args[0] === 'auth') return { stdout: 'yes\n' };
    if (args[0] === 'get') return { stdout: JSON.stringify({
      metadata: { name: 'preview-one', resourceVersion: '2',
        ...(failedOwner ? { annotations: { 'kubeclaw.forgestack.ai/exposure-owner': failedOwner } } : {}) },
      spec: { namespaceName: 'test-one', serviceName: 'service-one', servicePort: 8080 },
      status: { phase: 'Ready', exposurePhase: 'Failed', namespaceName: 'test-one', expiresAt, message: 'enable failed' },
    }) };
    if (args[0] === 'patch' && String(args[args.indexOf('-p') + 1]).includes('final-preview')) {
      const patch = JSON.parse(String(args[args.indexOf('-p') + 1]));
      failedOwner = patch.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
      return { stdout: '{}' };
    }
    if (args[0] === 'patch') throw rollbackFailure;
    throw new Error(`unexpected kubectl operation: ${args.join(' ')}`);
  },
});
await assert.rejects(
  () => failedRollback.invoke('kubernetes.exposure', { operation: 'prepare',
    resource: { type: 'kubernetes.exposure', canonicalId: 'kubernetes-exposure:attempt:test' },
    payload: { leaseName: 'preview-one', namespace: 'test-one', serviceName: 'service-one', servicePort: 8080,
      expiresAt, path: '/', readinessTimeoutMs: 10_000 } } as any, new AbortController().signal),
  (error: unknown) => error instanceof AggregateError
    && error.message === 'TAILSCALE_EXPOSURE_ROLLBACK_FAILED'
    && String(error.errors[0]).includes('TAILSCALE_EXPOSURE_CONTROLLER_FAILED')
    && error.errors[1] === rollbackFailure,
);
const staleCancellation = new AbortController();
const stalePatches: string[] = [];
let staleOwner: string | undefined;
let supersededOwner: string | undefined;
const staleRollback = new TailscaleExposureCapabilityInvoker({ kubectlExecutable: '/usr/local/bin/kubectl',
  controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
  allowedNamespacePrefixes: ['test'], allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 30_000,
  async execute(_command, args) {
    if (args[0] === 'auth') return { stdout: 'yes\n' };
    if (args[0] === 'get') return { stdout: JSON.stringify({
      metadata: { name: 'preview-one', resourceVersion: '3',
        ...(staleOwner ? { annotations: { 'kubeclaw.forgestack.ai/exposure-owner': staleOwner } } : {}) },
      spec: { namespaceName: 'test-one', serviceName: 'service-one', servicePort: 8080 },
      status: { phase: 'Ready', exposurePhase: 'Pending', namespaceName: 'test-one', expiresAt },
    }) };
    if (args[0] === 'patch') {
      const body = String(args[args.indexOf('-p') + 1]);
      stalePatches.push(body);
      if (body.includes('final-preview')) {
        const patch = JSON.parse(body);
        supersededOwner = patch.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
        staleOwner = randomUUID();
        assert.notEqual(staleOwner, supersededOwner,
          'a newer prepare for the same canonical resource must have a distinct owner');
        staleCancellation.abort();
      }
      return { stdout: '{}' };
    }
    throw new Error(`unexpected kubectl operation: ${args.join(' ')}`);
  },
});
await assert.rejects(() => staleRollback.invoke('kubernetes.exposure', { operation: 'prepare',
  resource: { type: 'kubernetes.exposure', canonicalId: 'kubernetes-exposure:attempt:stale' },
  payload: { leaseName: 'preview-one', namespace: 'test-one', serviceName: 'service-one', servicePort: 8080,
    expiresAt, path: '/', readinessTimeoutMs: 10_000 } } as any, staleCancellation.signal),
/TAILSCALE_EXPOSURE_CANCELLED/u);
assert.equal(stalePatches.length, 1, 'a stale rollback must not disable the newer exposure owner');
const ownershipPatches: string[] = [];
let requestedOwner: string | undefined;
let ownershipReads = 0;
const supersededReady = new TailscaleExposureCapabilityInvoker({ kubectlExecutable: '/usr/local/bin/kubectl',
  controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
  allowedNamespacePrefixes: ['test'], allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 30_000,
  async execute(_command, args) {
    if (args[0] === 'auth') return { stdout: 'yes\n' };
    if (args[0] === 'get') {
      ownershipReads += 1;
      const newerOwner = requestedOwner === undefined ? undefined : randomUUID();
      return { stdout: JSON.stringify({
        metadata: { name: 'preview-one', resourceVersion: String(ownershipReads),
          ...(newerOwner ? { annotations: { 'kubeclaw.forgestack.ai/exposure-owner': newerOwner } } : {}) },
        spec: { namespaceName: 'test-one', serviceName: 'service-one', servicePort: 8080 },
        status: { phase: 'Ready', exposurePhase: requestedOwner === undefined ? 'Pending' : 'Ready',
          namespaceName: 'test-one', expiresAt, previewUrl: 'https://preview.ts.net/',
          exposureHostname: 'preview.ts.net', createdAt: new Date().toISOString() },
      }) };
    }
    if (args[0] === 'patch') {
      const body = String(args[args.indexOf('-p') + 1]);
      ownershipPatches.push(body);
      const patch = JSON.parse(body);
      requestedOwner = patch.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
      return { stdout: '{}' };
    }
    throw new Error(`unexpected kubectl operation: ${args.join(' ')}`);
  },
});
await assert.rejects(() => supersededReady.invoke('kubernetes.exposure', { operation: 'prepare',
  resource: { type: 'kubernetes.exposure', canonicalId: 'kubernetes-exposure:attempt:superseded-ready' },
  payload: { leaseName: 'preview-one', namespace: 'test-one', serviceName: 'service-one', servicePort: 8080,
    expiresAt, path: '/', readinessTimeoutMs: 10_000 } } as any, new AbortController().signal),
/TAILSCALE_EXPOSURE_LEASE_CHANGED/u);
assert.equal(ownershipPatches.length, 1,
  'a superseded prepare must neither report success nor disable the newer exposure owner');
console.log(JSON.stringify({ ok: true, phase: 'tailscale-exposure-implementation', providerKind: 'fixture',
  typedLinks: true, narrowCapability: true, mocks: 0, emulators: 0 }));
