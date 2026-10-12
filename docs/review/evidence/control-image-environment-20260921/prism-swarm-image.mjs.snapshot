// Runs inside the built prism-worker and prism-control images through check-built-runtime-image.sh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadControlServerConfig } from '/app/prism/skills/prism/server/control-config.ts';
import { loadWorkerConfig } from '/app/prism/skills/prism/server/worker-config.ts';
const file = process.env.SWARM_CONFIG;
const settings = JSON.parse(fs.readFileSync(file, 'utf8')).operator.prism;
const expected = settings.worker;
const actual = loadWorkerConfig({ ...process.env, SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://image-proof/control' });
const { shutdownTimeoutMs, ...ingress } = expected;
assert.equal(actual.shutdownTimeoutMs, shutdownTimeoutMs);
assert.deepEqual(actual.ingress, ingress);
assert.throws(() => loadWorkerConfig({ ...process.env, SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://image-proof/control', PRISM_WORKER_SHUTDOWN_TIMEOUT_MS: String(shutdownTimeoutMs) }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
assert.deepEqual(actual.native, settings.native);
const control = loadControlServerConfig({ ...process.env, SWARM_CONFIG: file, PRISM_SESSION_SECRET: 'image-proof', PRISM_INGRESS_SECRET: 'image-proof',
  PRISM_INGESTION_SECRET: 'image-proof', PRISM_DISPATCH_SECRET: 'image-proof', PRISM_WORKER_SECRET: 'image-proof' });
assert.equal(control.maximumWorkerResponseBytes, settings.native.maximumResultBytes);
assert.equal(control.nativeWorkerDispatchTimeoutMs, settings.native.dispatchTimeoutMs);
assert.equal(control.artifactRoot, settings.control.artifactRoot);
assert.equal(control.studioPublicUrl, settings.control.studioPublicUrl);
assert.equal(control.pipelinePreferenceSubject, settings.control.pipelinePreferenceSubject ?? undefined);
console.log('PRISM_SWARM_IMAGE_LOADER_VERIFIED');
