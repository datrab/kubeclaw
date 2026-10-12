import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundleNames, readTestBundle, writeTestBundle } from '../../fixtures/config/swarm-bundle.mjs';
import yaml from 'js-yaml';
import { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';

for (const chart of ['prism', 'kubeclaw']) test(`${chart} package contains the complete canonical bundle and shared validator`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'component-package-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  execFileSync('helm', ['package', `charts/${chart}`, '--destination', directory]);
  const archive = path.join(directory, fs.readdirSync(directory).find(name => name.endsWith('.tgz')));
  for (const name of bundleNames) {
    const actual = execFileSync('tar', ['-xzOf', archive, `${chart}/files/config/${name}`]);
    assert.deepEqual(actual, fs.readFileSync(`charts/kubeclaw/files/config/${name}`));
  }
  const helper = chart === 'prism' ? '_swarm-bundle.tpl' : '_swarm-config.tpl';
  assert.deepEqual(execFileSync('tar', ['-xzOf', archive, `${chart}/templates/${helper}`]),
    fs.readFileSync('charts/kubeclaw/templates/_swarm-config.tpl'));
});

function isolatedChart(t, name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'component-delivery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const chart = path.join(directory, name);
  fs.cpSync(`charts/${name}`, chart, { recursive: true, dereference: true });
  // Do not rely on cp's dereference option: inspect and detach each authored
  // input explicitly before this fixture is allowed to mutate any file.
  for (const relative of [...bundleNames, 'swarm.schema.json', 'swarm-components.schema.json'].map(file => `files/config/${file}`)
    .concat(name === 'prism' ? ['templates/_swarm-bundle.tpl', 'templates/workloads.yaml']
      : ['templates/_swarm-config.tpl', 'templates/deployment.yaml'])) {
    const file = path.join(chart, relative), source = path.join(`charts/${name}`, relative);
    const original = fs.statSync(source), initial = fs.statSync(file);
    if (fs.lstatSync(file).isSymbolicLink() || (original.dev === initial.dev && original.ino === initial.ino)) fs.unlinkSync(file);
    fs.copyFileSync(source, file);
    assert.equal(fs.realpathSync(file), file);
    const copied = fs.statSync(file);
    assert(original.dev !== copied.dev || original.ino !== copied.ino, 'fixture must not share the authored inode');
  }
  const valuesFile = path.join(directory, 'values.yaml');
  if (name === 'prism') fs.copyFileSync(path.join(chart, 'ci-values.yaml'), valuesFile);
  else {
    const values = yaml.load(fs.readFileSync('my-values/buster-values.yaml', 'utf8'));
    const policy = yaml.load(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
    policy.nodeName = 'component-render-test'; policy.pools.buster.namespace = 'default';
    values.busterNative = { nodeName: policy.nodeName, namespace: 'default', policyDigest: nativePoolPolicy(policy, 'buster').policyDigest };
    values.runtimeInfrastructure = { registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } };
    values.extraContainers.find(item => item.name === 'buster-v2-runtime').image = `ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`;
    fs.writeFileSync(valuesFile, yaml.dump(values));
  }
  const render = () => yaml.loadAll(execFileSync('helm', ['template', name, chart, '--namespace', 'default', '-f', valuesFile],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).filter(Boolean);
  return { directory, chart, render };
}

const changes = {
  'prism-control': settings => { settings.dispatchTimeoutMs++; },
  'prism-studio': settings => { settings.controlTimeoutMs++; },
  'prism-worker': settings => { settings.ingress.maximumConnections++; },
  'prism-execution': settings => { settings.maximumResultBytes++; },
  'buster-engine': settings => { settings.admission.maximumQueuedJobs++; },
  'worker-core': settings => { settings.localRuntime.replayLimit++; },
};

function checksums(documents) {
  return Object.fromEntries(documents.filter(doc => doc.kind === 'Deployment'
    && doc.spec.template.metadata.annotations?.['checksum/swarm-config'])
    .map(doc => [doc.metadata.name, doc.spec.template.metadata.annotations['checksum/swarm-config']]));
}

function writeAuthoredBundle(file, documents) {
  writeTestBundle(file, documents);
  // Canonical authored JSON ends with a newline; compare literal-block delivery
  // byte for byte without trimming or normalizing the actual rendered output.
  for (const name of bundleNames) fs.appendFileSync(path.join(path.dirname(file), name), '\n');
}

for (const name of ['prism', 'kubeclaw']) test(`${name}: each component changes real rollout checksum; omitted checksum is detected`, t => {
  const f = isolatedChart(t, name), file = path.join(f.chart, 'files/config/swarm.config.json');
  const canonical = readTestBundle(file);
  writeAuthoredBundle(file, canonical);
  const original = checksums(f.render());
  assert(Object.keys(original).length > 0);
  for (const [owner, change] of Object.entries(changes)) {
    const changed = structuredClone(canonical); change(changed[owner].settings); writeAuthoredBundle(file, changed);
    const documents = f.render(), next = checksums(documents);
    assert.deepEqual(Object.keys(next), Object.keys(original));
    for (const role of Object.keys(original)) assert.notEqual(next[role], original[role], `${name}/${role}/${owner}`);
    const map = documents.find(doc => doc.kind === 'ConfigMap' && doc.data?.['swarm.config.json']);
    for (const component of bundleNames) assert.equal(map.data[component], fs.readFileSync(path.join(f.chart, 'files/config', component), 'utf8'));
  }
  const template = path.join(f.chart, 'templates', name === 'prism' ? 'workloads.yaml' : 'deployment.yaml');
  const before = fs.readFileSync(template, 'utf8');
  const mutated = before.replace(/checksum\/swarm-config: [^\n]+/,
    'checksum/swarm-config: {{ omit (include "kubeclaw.swarmBundle" $ | mustFromJson) "buster-engine.config.json" | toJson | sha256sum }}');
  assert.notEqual(mutated, before); fs.writeFileSync(template, mutated);
  writeAuthoredBundle(file, canonical); const frozen = checksums(f.render());
  const changed = structuredClone(canonical); changes['buster-engine'](changed['buster-engine'].settings); writeAuthoredBundle(file, changed);
  const after = checksums(f.render());
  assert.throws(() => { for (const role of Object.keys(frozen)) assert.notEqual(after[role], frozen[role]); }, { code: 'ERR_ASSERTION' });
});

for (const name of ['prism', 'kubeclaw']) test(`${name}: real archive missing a required component fails the complete delivery oracle`, t => {
  const f = isolatedChart(t, name), missing = 'prism-execution.config.json';
  fs.unlinkSync(path.join(f.chart, 'files/config', missing));
  execFileSync('helm', ['package', f.chart, '--destination', f.directory]);
  const archive = path.join(f.directory, fs.readdirSync(f.directory).find(file => file.endsWith('.tgz')));
  assert.throws(() => execFileSync('tar', ['-xzOf', archive, `${name}/files/config/${missing}`], { stdio: 'pipe' }));
  assert.throws(f.render, /component|prism-execution|config/i);
});

test('Buster image COPY contains all authored files; removing one source fails the same structural oracle', () => {
  const dockerfile = fs.readFileSync('docker/Dockerfile.buster-runtime', 'utf8');
  const assertCopy = source => {
    const line = source.split('\n').find(row => /^COPY /.test(row) && row.endsWith(' /etc/kubeclaw/swarm/'));
    assert(line, 'required explicit bundle COPY');
    const inputs = line.split(/\s+/).slice(1, -1);
    for (const name of bundleNames) assert(inputs.includes(`charts/kubeclaw/files/config/${name}`), name);
  };
  assertCopy(dockerfile);
  const mutated = dockerfile.replace('charts/kubeclaw/files/config/prism-execution.config.json ', '');
  assert.notEqual(mutated, dockerfile);
  assert.throws(() => assertCopy(mutated), { code: 'ERR_ASSERTION' });
});


for (const chart of ['prism', 'kubeclaw']) test(`${chart}: worker-core AJV/Helm integer-boundary parity`, async t => {
  const { loadSwarmSettings } = await import('../../../skills/common/plugin-runtime/foundation/config/swarm.ts');
  const fixture = isolatedChart(t, chart);
  const file = path.join(fixture.chart, 'files/config/swarm.config.json');
  const canonical = readTestBundle(file);
  for (const [field, maximum] of [['drainTimeoutMs', 2147483647], ['cancellationTimeoutMs', 2147483647], ['replayLimit', 1000000]]) {
    for (const value of [undefined, null, true, '1', 0, -1, 1.5, maximum + 1]) {
      const invalid = structuredClone(canonical);
      if (value === undefined) delete invalid['worker-core'].settings.localRuntime[field];
      else invalid['worker-core'].settings.localRuntime[field] = value;
      writeAuthoredBundle(file, invalid);
      assert.throws(() => loadSwarmSettings({ SWARM_CONFIG: file }), /SWARM_CONFIG_INVALID/,
        `${chart}/${field}=${String(value)} must fail AJV`);
      assert.throws(fixture.render, /worker-core/, `${chart}/${field}=${String(value)} must fail Helm`);
    }
    for (const value of [1, maximum]) {
      const valid = structuredClone(canonical);
      valid['worker-core'].settings.localRuntime[field] = value;
      writeAuthoredBundle(file, valid);
      assert.equal(loadSwarmSettings({ SWARM_CONFIG: file }).workerCore.localRuntime[field], value);
      assert.doesNotThrow(fixture.render, `${chart}/${field}=${value} inclusive boundary`);
    }
  }
});
