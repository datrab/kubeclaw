// Runs inside the built prism-worker image through check-built-runtime-image.sh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadWorkerConfig } from '/app/prism/skills/prism/server/worker-config.ts';
const file = process.env.SWARM_CONFIG;
const expected = JSON.parse(fs.readFileSync(file, 'utf8')).operator.prism.worker;
const actual = loadWorkerConfig({ SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://image-proof/control' });
const { shutdownTimeoutMs, ...ingress } = expected;
assert.equal(actual.shutdownTimeoutMs, shutdownTimeoutMs);
assert.deepEqual(actual.ingress, { ...ingress, maximumInputBytes: 16777216 });
assert.throws(() => loadWorkerConfig({ SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://image-proof/control', PRISM_WORKER_SHUTDOWN_TIMEOUT_MS: String(shutdownTimeoutMs) }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
console.log('PRISM_SWARM_IMAGE_LOADER_VERIFIED');
