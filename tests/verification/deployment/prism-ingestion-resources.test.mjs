import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const helm = process.env.KUBECLAW_TEST_HELM ?? 'helm';
const sizing = { requests: { cpu: '125m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } };
function render(ingestion) {
  const args = ['template', 'ingestion-contract', 'charts/prism', '--set-string', 'postgresql.existingSecret=render-only-database-secret'];
  // Image digest vectors satisfy the existing immutable-image contract; no image is pulled.
  for (const image of ['control', 'studio', 'worker', 'ingestion']) {
    args.push('--set-string', `images.${image}.digest=sha256:${'a'.repeat(64)}`);
  }
  if (ingestion) args.push('--set-json', `ingestion=${JSON.stringify(ingestion)}`);
  return spawnSync(helm, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
function documents(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return YAML.parseAllDocuments(result.stdout).map(document => document.toJSON()).filter(Boolean);
}
function configured(resources = sizing) {
  return { enabled: true, replicas: 1, resources, quarantineTtlMs: 120000 };
}

test('disabled ingestion renders no Deployment and requires no invented sizing', () => {
  const docs = documents(render());
  assert.equal(docs.some(document => document.kind === 'Deployment' && document.metadata.name === 'prism-ingestion'), false);
});

test('enabled ingestion renders supplied resources, actual probes and quarantine-only TTL', () => {
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
    assert.equal(container.env.find(entry => entry.name === 'PRISM_QUARANTINE_TTL_MS').value, '120000');
    assert.deepEqual(pod.volumes, [{ name: 'quarantine', emptyDir: { sizeLimit: '4Gi' } }]);
    assert.equal(pod.automountServiceAccountToken, false);
  }
});

test('enabled ingestion rejects missing sizing, invalid quantities and invalid quarantine TTL', () => {
  for (const kind of ['requests', 'limits']) {
    for (const key of ['cpu', 'memory']) {
      for (const value of ['', 'invalid', '0', -1]) {
        const resources = structuredClone(sizing); resources[kind][key] = value;
        const result = render(configured(resources));
        assert.notEqual(result.status, 0); assert.match(result.stderr, /ingestion\.resources/u);
      }
    }
  }
  const missing = render({ enabled: true, replicas: 1, quarantineTtlMs: 3600000 });
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /ingestion\.resources/u);
  for (const quarantineTtlMs of [59999, 86400001, 60000.5, 'NaN']) {
    const result = render({ ...configured(), quarantineTtlMs });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /quarantineTtlMs/u);
  }
});
