import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { prismChartProjection } from '../../../scripts/generate-prism-chart-config.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-central-chart-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const author = path.join(root, 'config'), chart = path.join(root, 'chart');
  fs.cpSync('config', author, { recursive: true }); fs.cpSync('charts/prism', chart, { recursive: true });
  const values = yaml.load(fs.readFileSync('charts/prism/ci-values.yaml', 'utf8'));
  values.ingestion = { enabled: true, replicas: 1, resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '1Gi' } } };
  const valuesFile = path.join(root, 'values.yaml');
  const render = (namespace = 'kubeclaw') => {
    fs.writeFileSync(valuesFile, yaml.dump(values));
    fs.writeFileSync(path.join(chart, 'files/pipeline/prism-topology.json'), JSON.stringify(prismChartProjection(author)));
    return yaml.loadAll(execFileSync('helm', ['template', 'prism', chart, '--namespace', namespace, '-f', valuesFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  };
  return { root, author, chart, values, render };
}

test('normal Prism chart uses selected central ports/paths without legacy ENV or author mounts', t => {
  const f = fixture(t);
  for (const port of [9030, 9040]) {
    const file = path.join(f.author, 'components/prism-control.config.json');
    const doc = JSON.parse(fs.readFileSync(file));
    doc.profiles.standard.settings.ingestionServer.port = port;
    doc.profiles.standard.settings.ingestionServer.quarantineRoot = `/quarantine-${port}`;
    fs.writeFileSync(file, JSON.stringify(doc));
    const rendered = f.render();
    const workloads = rendered.filter(item => item?.kind === 'Deployment');
    const ingestion = workloads.find(item => item.metadata.name === 'prism-ingestion').spec.template.spec;
    const container = ingestion.containers.find(item => item.name === 'ingestion');
    assert.equal(container.readinessProbe.httpGet.port, port);
    assert.equal(container.livenessProbe.httpGet.port, port);
    assert.equal(container.volumeMounts.find(item => item.name === 'quarantine').mountPath, `/quarantine-${port}`);
    const service = rendered.find(item => item?.kind === 'Service' && item.metadata.name === 'prism-ingestion');
    assert.equal(service.spec.ports[0].targetPort, port);
    for (const workload of workloads) {
      for (const container of workload.spec.template.spec.containers) {
        assert(!(container.env ?? []).some(item => ['SWARM_CONFIG', 'PORT', 'PRISM_WORKER_URL', 'PRISM_CONTROL_INTERNAL_URL', 'PRISM_INGESTION_URL', 'PRISM_QUARANTINE_ROOT', 'PRISM_QUARANTINE_TTL_MS'].includes(item.name)));
        assert(!(container.volumeMounts ?? []).some(item => item.mountPath === '/etc/kubeclaw/swarm'));
      }
    }
    assert(!rendered.some(item => item?.kind === 'ConfigMap' && item.metadata.name === 'prism-swarm-config'));
  }
});

test('central Prism publication/rendering rejects missing source settings, wrong deployment and duplicate TTL author', t => {
  const f = fixture(t);
  assert.throws(() => f.render('other-namespace'), /Prism release identity/);
  f.values.ingestion.quarantineTtlMs = 3600000;
  assert.throws(() => f.render(), /quarantineTtlMs/);
  delete f.values.ingestion.quarantineTtlMs;
  const file = path.join(f.author, 'components/prism-control.config.json');
  const doc = JSON.parse(fs.readFileSync(file)); delete doc.profiles.standard.settings.ingestionServer.maximumSourceBytes;
  fs.writeFileSync(file, JSON.stringify(doc));
  assert.throws(() => prismChartProjection(f.author), /SWARM_CONFIG/);
});

test('generated Prism chart projection is current and contains no competing flat author', () => {
  execFileSync(process.execPath, ['scripts/generate-prism-chart-config.mjs', '--check']);
  assert.equal(fs.existsSync('charts/prism/files/config'), false);
  assert.equal(fs.existsSync('charts/prism/templates/_swarm-bundle.tpl'), false);
});
