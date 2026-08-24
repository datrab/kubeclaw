import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages } from '@kubeclaw/nova-core';
import { TailscaleExposureCapabilityInvoker } from '@kubeclaw/buster-engine';

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
console.log(JSON.stringify({ ok: true, phase: 'tailscale-exposure-implementation', providerKind: 'fixture',
  typedLinks: true, narrowCapability: true, mocks: 0, emulators: 0 }));
