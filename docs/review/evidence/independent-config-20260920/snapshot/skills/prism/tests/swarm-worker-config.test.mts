import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkerConfig } from '../server/worker-config.ts';
import { loadPrismWorkerSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
const canonical = fileURLToPath(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
const authored = JSON.parse(fs.readFileSync(canonical, 'utf8'));
const keys = Object.keys(authored.operator.prism.worker);
const trusted = { WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' };
function config(t: { after(fn: () => void): void }, mutate: (value: typeof authored) => void) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'swarm-worker-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const value = structuredClone(authored); mutate(value); const file = path.join(dir, 'swarm.config.json');
  fs.writeFileSync(file, JSON.stringify(value)); return { ...trusted, SWARM_CONFIG: file };
}
test('CW01 canonical author values reach the actual production worker composition', () => {
  const runtime = loadWorkerConfig({ ...trusted, SWARM_CONFIG: canonical });
  assert.equal(runtime.shutdownTimeoutMs, authored.operator.prism.worker.shutdownTimeoutMs);
  for (const key of keys.filter(k => k !== 'shutdownTimeoutMs')) assert.equal(runtime.ingress[key as keyof typeof runtime.ingress], authored.operator.prism.worker[key]);
});
test('CW02 every alternate author value reaches the actual consumer', t => {
  const values = { maximumActiveRequests: 7, maximumProbeRequests: 2, maximumConnections: 40, requestTimeoutMs: 3000, shutdownTimeoutMs: 5000 };
  const runtime = loadWorkerConfig(config(t, value => { value.operator.prism.worker = values; }));
  assert.deepEqual(runtime.ingress, { maximumActiveRequests: 7, maximumProbeRequests: 2, maximumConnections: 40, requestTimeoutMs: 3000, maximumInputBytes: 16777216 });
  assert.equal(runtime.shutdownTimeoutMs, 5000);
});
for (const location of ['', 'operator', 'operator.prism', 'operator.prism.worker']) test(`CW03 unknown key at ${location || 'root'}`, t => {
  const env = config(t, value => { let object = value; for (const key of location.split('.').filter(Boolean)) object = object[key]; object.unknown = 1; });
  assert.throws(() => loadWorkerConfig(env), /SWARM_CONFIG_INVALID/);
});
for (const key of keys) for (const invalid of ['3', 0, 1.5, 2147483648, undefined]) test(`CW04 ${key} rejects ${String(invalid)}`, t => {
  const env = config(t, value => { value.operator.prism.worker[key] = invalid; });
  assert.throws(() => loadWorkerConfig(env), /SWARM_CONFIG_INVALID/);
});
for (const key of ['PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS', 'PRISM_WORKER_MAXIMUM_PROBE_REQUESTS', 'PRISM_WORKER_MAXIMUM_CONNECTIONS', 'PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS', 'PRISM_WORKER_SHUTDOWN_TIMEOUT_MS']) test(`CW05 rejects legacy authority ${key}`, () => {
  assert.throws(() => loadWorkerConfig({ ...trusted, SWARM_CONFIG: canonical, [key]: '120000' }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
});
for (const key of ['profile', 'features', 'tuning', 'overrides']) test(`CW06 rejects unsupported ${key}`, t => {
  const env = config(t, value => { value[key] = key === 'profile' ? 'unknown' : { unknown: true }; });
  assert.throws(() => loadWorkerConfig(env), /SWARM_CONFIG_INVALID/);
});
test('CW07 missing or broken authorship never falls back to defaults', t => {
  const env = config(t, () => {});
  fs.writeFileSync(env.SWARM_CONFIG, '{'); assert.throws(() => loadWorkerConfig(env), SyntaxError);
  fs.unlinkSync(env.SWARM_CONFIG); assert.throws(() => loadWorkerConfig(env), /ENOENT/);
});
for (const key of ['maximumActiveRequests', 'maximumProbeRequests']) test(`CW08 ${key} cannot exceed connection reservation`, t => {
  const env = config(t, value => { value.operator.prism.worker[key] = 128; });
  assert.throws(() => loadWorkerConfig(env), /CONNECTION_BUDGET_INVALID/);
});
test('CW09 shutdown budget remains independent of request admission deadline', t => {
  const env = config(t, value => { value.operator.prism.worker.shutdownTimeoutMs = 100; });
  assert.equal(loadWorkerConfig(env).shutdownTimeoutMs, 100);
  assert.equal(loadWorkerConfig(env).ingress.requestTimeoutMs, 120000);
});
test('CW10 effective settings omit secrets and original authentication still fails closed', () => {
  const env = { SWARM_CONFIG: canonical, PRISM_WORKER_SECRET: 'sensitive' };
  assert.ok(!JSON.stringify(loadPrismWorkerSettings(env)).includes('sensitive'));
  assert.throws(() => loadWorkerConfig({ SWARM_CONFIG: canonical }), /PRISM_WORKER_SECRET is required/);
  assert.throws(() => loadWorkerConfig(env), /DATABASE_URL is required/);
  assert.throws(() => loadWorkerConfig({ SWARM_CONFIG: canonical, WORKER_TRUST_SPIFFE_ENABLED: 'true' }), /SPIFFE trust policy is incomplete/);
});
