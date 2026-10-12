import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { loadWorkerConfig } from '../../../skills/prism/server/worker-config.ts';
const root = path.resolve(import.meta.dirname, '../../..');
const canonical = path.join(root, 'charts/kubeclaw/files/config/swarm.config.json');
const base = JSON.parse(fs.readFileSync(canonical, 'utf8'));
const helm = (chart, extra = []) => spawnSync('helm', ['template', 'config-review', chart, '--namespace', 'default', '-f', path.join(chart, 'ci-values.yaml'), ...extra], { encoding: 'utf8' });
function copiedChart(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-swarm-chart-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const chart = path.join(temp, 'prism'); fs.cpSync(path.join(root, 'charts/prism'), chart, { recursive: true, dereference: true });
  for (const name of ['swarm.config.json', 'swarm.schema.json']) {
    const file = path.join(chart, 'files/config', name);
    const content = fs.readFileSync(file);
    if (fs.lstatSync(file).isSymbolicLink()) fs.unlinkSync(file);
    fs.writeFileSync(file, content);
    assert.ok(!fs.lstatSync(file).isSymbolicLink(), 'isolated mutation cannot follow canonical author symlink');
  }
  return chart;
}
function render(chart, extra) {
  const result = helm(chart, extra); assert.equal(result.status, 0, result.stderr);
  return yaml.loadAll(result.stdout).filter(Boolean);
}
function delivery(docs) {
  const config = docs.find(d => d.kind === 'ConfigMap' && d.metadata.name === 'prism-swarm-config');
  const deployment = docs.find(d => d.kind === 'Deployment' && d.metadata.name === 'prism-worker');
  const worker = deployment.spec.template.spec.containers.find(c => c.name === 'worker');
  const env = Object.fromEntries(worker.env.filter(e => 'value' in e).map(e => [e.name, e.value]));
  assert.equal(env.SWARM_CONFIG, '/etc/kubeclaw/swarm/swarm.config.json');
  assert.ok(!Object.keys(env).some(k => /^PRISM_WORKER_(?:MAXIMUM_|REQUEST_BODY_TIMEOUT|SHUTDOWN_TIMEOUT)/.test(k)));
  const mount = worker.volumeMounts.find(m => m.name === 'swarm-config');
  assert.deepEqual(mount, { name: 'swarm-config', mountPath: '/etc/kubeclaw/swarm', readOnly: true });
  assert.equal(deployment.spec.template.spec.volumes.find(v => v.name === mount.name).configMap.name, config.metadata.name);
  assert.match(deployment.spec.template.metadata.annotations['checksum/swarm-config'], /^[a-f0-9]{64}$/);
  return config.data['swarm.config.json'];
}
test('CD01 original chart delivers the one canonical config to the worker mount', () => {
  const bytes = delivery(render(path.join(root, 'charts/prism')));
  assert.deepEqual(JSON.parse(bytes), base);
});
test('CD02 real Helm output from two author profiles drives the actual production loader', t => {
  const chart = copiedChart(t);
  const profiles = [base, structuredClone(base)];
  profiles[1].operator.prism.worker = { maximumActiveRequests: 7, maximumProbeRequests: 2, maximumConnections: 40, requestTimeoutMs: 3000, shutdownTimeoutMs: 130000 };
  for (const authored of profiles) {
    fs.writeFileSync(path.join(chart, 'files/config/swarm.config.json'), JSON.stringify(authored));
    const rendered = delivery(render(chart));
    const file = path.join(chart, 'mounted-swarm.config.json'); fs.writeFileSync(file, rendered);
    const actual = loadWorkerConfig({ SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://test/control' });
    assert.equal(actual.shutdownTimeoutMs, authored.operator.prism.worker.shutdownTimeoutMs);
    const { shutdownTimeoutMs, ...ingress } = authored.operator.prism.worker;
    assert.deepEqual(actual.ingress, { ...ingress, maximumInputBytes: 16777216 });
  }
});
test('CD03 old Helm shutdown authority is rejected', () => {
  const result = helm(path.join(root, 'charts/prism'), ['--set', 'worker.shutdownTimeoutMs=120000']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /worker.shutdownTimeoutMs moved/);
});
for (const key of Object.keys(base.operator.prism.worker)) for (const invalid of ['3', 0, 1.5, 2147483648, undefined]) test(`CD04 ${key} rejects ${String(invalid)} before rendering`, t => {
  const chart = copiedChart(t); const config = structuredClone(base); config.operator.prism.worker[key] = invalid;
  fs.writeFileSync(path.join(chart, 'files/config/swarm.config.json'), JSON.stringify(config));
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm worker/);
});
for (const location of ['', 'operator', 'operator.prism', 'operator.prism.worker']) test(`CD04 unknown key ${location || 'root'}`, t => {
  const chart = copiedChart(t); const config = structuredClone(base); let object = config;
  for (const key of location.split('.').filter(Boolean)) object = object[key]; object.unknown = 1;
  fs.writeFileSync(path.join(chart, 'files/config/swarm.config.json'), JSON.stringify(config));
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm/);
});
test('CD04 connection overcommit fails Helm rendering', t => {
  const chart = copiedChart(t); const config = structuredClone(base); config.operator.prism.worker.maximumConnections = 16;
  fs.writeFileSync(path.join(chart, 'files/config/swarm.config.json'), JSON.stringify(config));
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /connection budget/);
});
for (const shutdownTimeoutMs of [100000, 150000]) test(`CD05 shutdown ${shutdownTimeoutMs} violates native-close or Pod grace`, t => {
  const chart = copiedChart(t); const config = structuredClone(base); config.operator.prism.worker.shutdownTimeoutMs = shutdownTimeoutMs;
  fs.writeFileSync(path.join(chart, 'files/config/swarm.config.json'), JSON.stringify(config));
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /worker shutdown must cover/);
});
test('CD06 Helm packaging dereferences the canonical author/schema without manual synchronization', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-swarm-package-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('helm', ['package', path.join(root, 'charts/prism'), '--destination', dir], { stdio: 'pipe' });
  const archive = path.join(dir, fs.readdirSync(dir).find(name => name.endsWith('.tgz')));
  const contents = execFileSync('tar', ['-xzOf', archive, 'prism/files/config/swarm.config.json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(contents), base);
  const schema = execFileSync('tar', ['-xzOf', archive, 'prism/files/config/swarm.schema.json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(schema), JSON.parse(fs.readFileSync(path.join(root, 'skills/common/plugin-runtime/foundation/config/swarm.schema.json'))));
});
