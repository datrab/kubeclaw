import { publishedControlConfig } from './fixtures/published-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const configRoot = fileURLToPath(new URL('../../../config/', import.meta.url));
const canonical = path.join(configRoot, 'pipeline.config.json');
const authored = {
  entry: JSON.parse(fs.readFileSync(canonical, 'utf8')),
  'prism-worker': JSON.parse(fs.readFileSync(path.join(configRoot, 'components/prism-worker.config.json'), 'utf8')).profiles.standard,
};
const keys = Object.keys(authored['prism-worker'].settings.ingress);
const trusted = { WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control' };
test('CW01 canonical author values reach the selected worker consumer view', async t => {
  const {workerCapture, loadWorkerConfig: configured} = await publishedControlConfig(t, {}, {});
  const runtime = configured(workerCapture, trusted);
  assert.equal(runtime.shutdownTimeoutMs, authored['prism-worker'].settings.ingress.shutdownTimeoutMs);
  assert.equal(runtime.port, authored['prism-worker'].settings.ingress.port);
  for (const key of keys.filter(k => k !== 'shutdownTimeoutMs' && k !== 'port')) assert.equal(runtime.ingress[key as keyof typeof runtime.ingress], authored['prism-worker'].settings.ingress[key]);
});
test('CW02 every alternate author value reaches the actual consumer', async t => {
  const values = { port: 23458, maximumActiveRequests: 7, maximumProbeRequests: 2, maximumConnections: 40, requestTimeoutMs: 3000, shutdownTimeoutMs: 5000, maximumInputBytes: 8192 };
  const supervisor = {...authored['prism-worker'].settings.supervisor, closeTimeoutMs: 3000, drainTimeoutMs: 1000};
  const {workerCapture, loadWorkerConfig: configured} = await publishedControlConfig(t, {}, {ingress: values, supervisor});
  const runtime = configured(workerCapture, trusted);
  assert.deepEqual(runtime.ingress, { maximumActiveRequests: 7, maximumProbeRequests: 2, maximumConnections: 40, requestTimeoutMs: 3000, maximumInputBytes: 8192 });
  assert.equal(runtime.shutdownTimeoutMs, 5000);
  assert.equal(runtime.port, 23458);
});
for (const location of ['entry', 'prism-worker', 'prism-worker.settings', 'prism-worker.settings.ingress']) test(`CW03 unknown key at ${location || 'root'}`, async t => {
  await assert.rejects(publishedControlConfig(t, {}, {}, undefined, (author: string) => {
    const isEntry = location === 'entry';
    const file = path.join(author, isEntry ? 'pipeline.config.json' : 'components/prism-worker.config.json');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    let object = value;
    if (location === 'prism-worker.settings') object = value.profiles.standard.settings;
    if (location === 'prism-worker.settings.ingress') object = value.profiles.standard.settings.ingress;
    object.unknown = 1;
    fs.writeFileSync(file, JSON.stringify(value));
  }), /SWARM_CONFIG_INVALID/);
});
for (const key of keys) for (const invalid of ['3', null, -1, 0, 1.5, 2147483648, undefined]) test(`CW04 ${key} rejects ${String(invalid)}`, async t => {
  const ingress = {...authored['prism-worker'].settings.ingress, [key]: invalid};
  await assert.rejects(publishedControlConfig(t, {}, {ingress}), /SWARM_CONFIG_INVALID/);
});
for (const key of ['PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS', 'PRISM_WORKER_MAXIMUM_PROBE_REQUESTS', 'PRISM_WORKER_MAXIMUM_CONNECTIONS', 'PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS', 'PRISM_WORKER_SHUTDOWN_TIMEOUT_MS', 'PRISM_NATIVE_MAXIMUM_INPUT_BYTES', 'PRISM_NATIVE_ASSIGNED_INPUT_BYTES']) test(`CW05 rejects legacy authority ${key}`, async t => {
  const {workerCapture, loadWorkerConfig: configured} = await publishedControlConfig(t, {}, {});
  assert.throws(() => configured(workerCapture, { ...trusted, [key]: key.includes('INPUT_BYTES') ? String(authored['prism-worker'].settings.ingress.maximumInputBytes) : '120000' }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
});
for (const key of ['profile', 'features', 'tuning', 'overrides']) test(`CW06 rejects unsupported ${key}`, async t => {
  await assert.rejects(publishedControlConfig(t, {}, {}, undefined, (author: string) => {
    const file = path.join(author, 'pipeline.config.json');
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    entry[key] = key === 'profile' ? 'unknown' : { unknown: true };
    fs.writeFileSync(file, JSON.stringify(entry));
  }), /SWARM_CONFIG_INVALID/);
});
test('CW07 missing or broken authorship never falls back to defaults', async t => {
  await assert.rejects(publishedControlConfig(t, {}, {}, undefined, (author: string) => {
    fs.writeFileSync(path.join(author, 'pipeline.config.json'), '{');
  }), SyntaxError);
  await assert.rejects(publishedControlConfig(t, {}, {}, undefined, (author: string) => {
    fs.unlinkSync(path.join(author, 'pipeline.config.json'));
  }), /ENOENT/);
});
for (const key of ['maximumActiveRequests', 'maximumProbeRequests']) test(`CW08 ${key} cannot exceed connection reservation`, async t => {
  const ingress = {...authored['prism-worker'].settings.ingress, [key]: 128};
  await assert.rejects(publishedControlConfig(t, {}, {ingress}), /CONNECTION_BUDGET_INVALID/);
});
test('CW09 shutdown budget remains independent of request admission deadline', async t => {
  const ingress = {...authored['prism-worker'].settings.ingress, shutdownTimeoutMs: 100};
  const supervisor = {...authored['prism-worker'].settings.supervisor, closeTimeoutMs: 60, drainTimeoutMs: 30};
  const {workerCapture, loadWorkerConfig: configured} = await publishedControlConfig(t, {}, {ingress, supervisor});
  const runtime = configured(workerCapture, trusted);
  assert.equal(runtime.shutdownTimeoutMs, 100);
  assert.equal(runtime.ingress.requestTimeoutMs, 120000);
});
test('CW10 effective settings omit secrets and original authentication still fails closed', async t => {
  const {workerCapture, loadWorkerConfig: configured} = await publishedControlConfig(t, {}, {});
  const env = { PRISM_WORKER_SECRET: 'sensitive' };
  assert.ok(!JSON.stringify(workerCapture).includes(env.PRISM_WORKER_SECRET));
  const runtime = configured(workerCapture, { ...trusted, ...env });
  assert.ok(!JSON.stringify(runtime.ingress).includes(env.PRISM_WORKER_SECRET));
  assert.throws(() => configured(workerCapture, {}), /PRISM_WORKER_SECRET is required/);
  assert.throws(() => configured(workerCapture, env), /DATABASE_URL is required/);
  assert.throws(() => configured(workerCapture, { WORKER_TRUST_SPIFFE_ENABLED: 'true' }), /SPIFFE trust policy is incomplete/);
});
