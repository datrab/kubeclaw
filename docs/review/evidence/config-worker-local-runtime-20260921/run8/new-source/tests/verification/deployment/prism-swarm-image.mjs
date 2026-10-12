// Runs inside the built prism-worker and prism-control images through check-built-runtime-image.sh.
import assert from 'node:assert/strict';
import { readTestBundle, projectTestBundle } from '/app/prism/tests/fixtures/config/swarm-bundle.mjs';
const file = process.env.SWARM_CONFIG;
const settings = projectTestBundle(readTestBundle(file)).operator.prism;
const role = process.argv[2];
assert.ok(['prism-control', 'prism-worker', 'prism-studio'].includes(role), 'explicit image role required');
if (role === 'prism-worker') {
const {loadWorkerConfig} = await import('/app/prism/skills/prism/server/worker-config.ts');
const expected = settings.worker;
const actual = loadWorkerConfig({ ...process.env, SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://image-proof/control' });
const { shutdownTimeoutMs, port, ...ingress } = expected;
assert.equal(actual.port, port);
for (const legacy of [String(port), '']) {
  assert.throws(() => loadWorkerConfig({ ...process.env, SWARM_CONFIG: file, PORT: legacy }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
}
assert.equal(actual.shutdownTimeoutMs, shutdownTimeoutMs);
assert.deepEqual(actual.ingress, ingress);
assert.throws(() => loadWorkerConfig({ ...process.env, SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://image-proof/control', PRISM_WORKER_SHUTDOWN_TIMEOUT_MS: String(shutdownTimeoutMs) }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
assert.deepEqual(actual.native, settings.native);
}
if (role === 'prism-control') {
const {loadControlServerConfig} = await import('/app/prism/skills/prism/server/control-config.ts');
const control = loadControlServerConfig({ ...process.env, SWARM_CONFIG: file, PRISM_SESSION_SECRET: 'image-proof', PRISM_INGRESS_SECRET: 'image-proof',
  PRISM_INGESTION_SECRET: 'image-proof', PRISM_DISPATCH_SECRET: 'image-proof', PRISM_WORKER_SECRET: 'image-proof' });
assert.equal(control.maximumWorkerResponseBytes, settings.native.maximumResultBytes);
assert.equal(control.nativeWorkerDispatchTimeoutMs, settings.native.dispatchTimeoutMs);
assert.equal(control.artifactRoot, settings.control.artifactRoot);
assert.equal(control.studioPublicUrl, settings.control.studioPublicUrl);
assert.equal(control.pipelinePreferenceSubject, settings.control.pipelinePreferenceSubject ?? undefined);
assert.equal(control.port, settings.control.port);
}
if (role === 'prism-studio') {
const {loadStudioConfig} = await import('/app/prism/skills/prism/server/studio-config.ts');
const actual = loadStudioConfig({...process.env, SWARM_CONFIG: file});
assert.equal(actual.port, settings.studio.port);
assert.equal(actual.controlTimeoutMs, settings.studio.controlTimeoutMs);
assert.equal(actual.control.href, new URL(settings.studio.controlUrl).href);
for (const key of ['PORT', 'PRISM_CONTROL_URL', 'PRISM_CONTROL_TIMEOUT_MS']) {
  assert.throws(() => loadStudioConfig({...process.env, SWARM_CONFIG: file, [key]: ''}), /SWARM_CONFIG_LEGACY_OVERRIDE/);
}
}
console.log('PRISM_SWARM_IMAGE_LOADER_VERIFIED');
