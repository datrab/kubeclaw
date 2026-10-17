import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prismChartProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const helm = process.env.KUBECLAW_TEST_HELM ?? 'helm';
const sizing = { requests: { cpu: '125m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } };
// Original resources/probes/TTL obligations use the sole central author and normal
// complete chart package. Render-only OCI vectors do not prove image/native boot.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestion-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const author = path.join(root, 'config'), chart = path.join(root, 'chart'), packaged = path.join(root, 'packaged');
  fs.cpSync('config', author, { recursive: true });
  fs.cpSync('charts/prism', chart, { recursive: true, dereference: true });
  const owner = path.join(author, 'components/prism-control.config.json');
  const original = fs.readFileSync(owner);
  const selectTtl = quarantineTtlMs => {
    const document = JSON.parse(original);
    document.profiles.standard.settings.ingestionServer.quarantineTtlMs = quarantineTtlMs;
    fs.writeFileSync(owner, JSON.stringify(document));
    return prismChartProjection(author);
  };
  selectTtl(120000);
  const render = ingestion => {
    const projection = prismChartProjection(author);
    fs.writeFileSync(path.join(chart, 'files/pipeline/prism-topology.json'), JSON.stringify(projection));
    fs.rmSync(packaged, { recursive: true, force: true }); fs.mkdirSync(packaged);
    execFileSync(helm, ['package', chart, '--destination', packaged], { stdio: 'pipe' });
    const archives = fs.readdirSync(packaged).filter(file => file.endsWith('.tgz')); assert.equal(archives.length, 1);
    const archive = path.join(packaged, archives[0]);
    assert.deepEqual(JSON.parse(execFileSync('tar', ['-xOf', archive, 'prism/files/pipeline/prism-topology.json'], { encoding: 'utf8' })), projection);
    const args = ['template', projection.deployment.releaseName, archive, '-f', 'charts/prism/ci-values.yaml', '--namespace', projection.deployment.namespace, '--set-string', 'postgresql.existingSecret=render-only-database-secret'];
    // Image digest vectors satisfy the immutable-image shape contract; no image is pulled.
    for (const image of ['control', 'studio', 'worker', 'ingestion']) {
      args.push('--set-string', `images.${image}.digest=sha256:${'a'.repeat(64)}`);
    }
    if (ingestion) args.push('--set-json', `ingestion=${JSON.stringify(ingestion)}`);
    return spawnSync(helm, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  };
  return { render, selectTtl };
}
function documents(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return YAML.parseAllDocuments(result.stdout).map(document => document.toJSON()).filter(Boolean);
}
function configured(resources = sizing) {
  return { enabled: true, replicas: 1, resources };
}

test('disabled ingestion renders no Deployment and requires no invented sizing', t => {
  const { render } = fixture(t);
  const docs = documents(render());
  assert.equal(docs.some(document => document.kind === 'Deployment' && document.metadata.name === 'prism-ingestion'), false);
});

test('enabled ingestion renders supplied resources, actual probes and quarantine-only TTL', t => {
  const { render, selectTtl } = fixture(t);
  assert.equal(selectTtl(120000).operator.prism.ingestion.quarantineTtlMs, 120000);
  const paused = documents(render({ ...configured(), replicas: 0 }));
  assert.equal(paused.find(document => document.kind === 'Deployment' && document.metadata.name === 'prism-ingestion').spec.replicas, 0);
  for (const resources of [sizing, { requests: { cpu: 0.25, memory: '256Mi' }, limits: { cpu: 2, memory: '1Gi' } }]) {
    const docs = documents(render(configured(resources)));
    const pod = docs.find(document => document.kind === 'Deployment' && document.metadata.name === 'prism-ingestion').spec.template.spec;
    const container = pod.containers[0];
    assert.deepEqual(container.resources, Object.fromEntries(Object.entries(resources).map(([kind, pair]) => [kind,
      Object.fromEntries(Object.entries(pair).map(([key, value]) => [key, String(value)]))])));
    assert.deepEqual(container.livenessProbe.httpGet, { path: '/health', port: 8080 });
    assert.deepEqual(container.readinessProbe.httpGet, { path: '/ready', port: 8080 });
    assert.equal(container.env.some(entry => entry.name === 'PRISM_QUARANTINE_TTL_MS'), false);
    assert.deepEqual(container.volumeMounts, [{ name: 'quarantine', mountPath: '/quarantine' }]);
    assert.deepEqual(pod.volumes, [{ name: 'quarantine', emptyDir: { sizeLimit: '4Gi' } }]);
    assert.equal(pod.automountServiceAccountToken, false);
  }
  const checksums = [];
  for (const ttl of [120000, 240000, 120000]) {
    assert.equal(selectTtl(ttl).operator.prism.ingestion.quarantineTtlMs, ttl);
    const docs = documents(render(configured()));
    const workload = docs.find(document => document.kind === 'Deployment' && document.metadata.name === 'prism-ingestion');
    checksums.push(workload.spec.template.metadata.annotations['checksum/pipeline-config']);
  }
  assert.notEqual(checksums[0], checksums[1]); assert.equal(checksums[0], checksums[2]);
});

test('enabled ingestion rejects missing sizing, invalid quantities and invalid quarantine TTL', t => {
  const { render, selectTtl } = fixture(t);
  for (const kind of ['requests', 'limits']) {
    for (const key of ['cpu', 'memory']) {
      for (const value of ['', 'invalid', '0', -1]) {
        const resources = structuredClone(sizing); resources[kind][key] = value;
        const result = render(configured(resources));
        assert.notEqual(result.status, 0); assert.match(result.stderr, /ingestion\.resources/u);
      }
    }
  }
  const missing = render({ enabled: true, replicas: 1 });
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /ingestion\.resources/u);
  for (const quarantineTtlMs of [59999, 86400001, 60000.5, 'NaN']) {
    assert.throws(() => selectTtl(quarantineTtlMs), /SWARM_CONFIG_INVALID:component:prism-control/u);
  }
  selectTtl(120000);
  const duplicate = render({ ...configured(), quarantineTtlMs: 120000 });
  assert.notEqual(duplicate.status, 0); assert.match(duplicate.stderr, /quarantineTtlMs/u);
});
