import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { readTestBundle, writeTestBundle, bundleFromConfigMap, bundleNames } from '../../fixtures/config/swarm-bundle.mjs';
import { loadBusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

for (const name of ['kubeclaw', 'prism']) test(`actual ${name} Helm and loader enforce shared cluster invoker policy`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-invoker-chart-'));
  try {
    const chart = path.join(root, name);
    fs.cpSync(`charts/${name}`, chart, { recursive: true, dereference: true });
    const mutationFiles = [...bundleNames, 'profiles/buster-engine.runtime.config.json', 'swarm.schema.json', 'swarm-components.schema.json'];
    const originals = mutationFiles.map(file => {
      const source = path.join(`charts/${name}`, 'files/config', file);
      return { path: fs.realpathSync(source), stat: fs.statSync(source) };
    });
    const privateRoot = fs.realpathSync(root);
    const assertPrivate = target => {
      const parent = fs.realpathSync(path.dirname(target));
      assert.ok(parent.startsWith(`${privateRoot}${path.sep}`));
      const actual = fs.realpathSync(target), stat = fs.statSync(target);
      assert.ok(actual.startsWith(`${privateRoot}${path.sep}`));
      assert.equal(fs.lstatSync(target).isSymbolicLink(), false);
      assert.equal(stat.isFile(), true);
      for (const original of originals) {
        assert.notEqual(actual, original.path);
        assert.ok(stat.dev !== original.stat.dev || stat.ino !== original.stat.ino,
          'private mutation target must not alias an original inode');
      }
    };
    // Detach aliases in the private directory before any writable open.
    for (const file of mutationFiles) {
      const target = path.join(chart, 'files/config', file);
      assert.ok(fs.realpathSync(path.dirname(target)).startsWith(`${privateRoot}${path.sep}`));
      const bytes = fs.readFileSync(target), initial = fs.statSync(target);
      const aliasesOriginal = originals.some(original => initial.dev === original.stat.dev && initial.ino === original.stat.ino);
      if (fs.lstatSync(target).isSymbolicLink() || aliasesOriginal) {
        fs.unlinkSync(target);
        fs.writeFileSync(target, bytes, { flag: 'wx' });
      }
    }
    // Validate all destinations before the first mutation, including hardlink identities.
    for (const file of mutationFiles) assertPrivate(path.join(chart, 'files/config', file));
    const writePrivateBundle = (entry, document) => {
      for (const file of mutationFiles) assertPrivate(path.join(chart, 'files/config', file));
      writeTestBundle(entry, document);
    };
    const values = name === 'prism' ? yaml.load(fs.readFileSync('charts/prism/ci-values.yaml', 'utf8'))
      : yaml.load(fs.readFileSync('my-values/buster-values.yaml', 'utf8'));
    const namespace = name === 'prism' ? 'default' : 'readiness-test';
    if (name === 'kubeclaw') {
      const policy = yaml.load(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
      policy.nodeName = 'readiness-render-only'; policy.pools.buster.namespace = namespace;
      const binding = nativePoolPolicy(policy, 'buster');
      values.busterNative = { namespace, nodeName: binding.nodeName, policyDigest: binding.policyDigest };
      values.runtimeInfrastructure = { registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } };
      values.extraContainers.find(item => item.name === 'buster-v2-runtime').image = `ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`;
    }
    values.busterComponentFile = 'files/config/buster-engine.config.json'; // Explicit complete profile under mutation.
    const file = path.join(root, 'values.yaml'); fs.writeFileSync(file, yaml.dump(values));
    const entry = path.join(chart, 'files/config/swarm.config.json');
    const baseline = readTestBundle(entry);
    const render = () => spawnSync('helm', ['template', 'readiness', chart, '--namespace', namespace, '-f', file],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const profileName = 'files/config/profiles/buster-engine.runtime.config.json';
    const profileFile = path.join(chart, profileName);
    const selectedBytes = fs.readFileSync(profileFile, 'utf8');
    execFileSync('helm', ['package', chart, '--destination', root]);
    const archive = path.join(root, fs.readdirSync(root).find(item => item.endsWith('.tgz')));
    assert.equal(execFileSync('tar', ['-xzOf', archive, `${name}/${profileName}`], { encoding: 'utf8' }), selectedBytes);
    values.busterComponentFile = profileName; fs.writeFileSync(file, yaml.dump(values));
    const selectedRender = render(); assert.equal(selectedRender.status, 0, selectedRender.stderr);
    const selectedDocuments = yaml.loadAll(selectedRender.stdout);
    const selectedMap = selectedDocuments.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['swarm.config.json']);
    assert.equal(selectedMap.data['buster-engine.config.json'], selectedBytes);
    const delivered = JSON.parse(selectedMap.data['buster-engine.config.json']);
    assert.deepEqual(delivered.settings.clusterInvokers.kubernetesFixture.allowedSecretReferences,
      ['kubeclaw-fixture-preflight', 'prism-test-provider', 'prism-test-runtime', 'prism-test-postgresql-auth', 'prism-test-ghcr']);
    const checksums = documents => documents.filter(doc => doc?.spec?.template?.metadata?.annotations?.['checksum/swarm-config'])
      .map(doc => doc.spec.template.metadata.annotations['checksum/swarm-config']);
    assert(checksums(selectedDocuments).length > 0);
    // Mutating an inactive complete profile cannot change the selected bytes or checksum.
    const inactive = structuredClone(baseline);
    inactive['buster-engine'].settings.clusterInvokers.kubernetesFixture.diagnosticCodeUnits++;
    writePrivateBundle(entry, inactive);
    const inactiveRender = render(); assert.equal(inactiveRender.status, 0, inactiveRender.stderr);
    assert.deepEqual(checksums(yaml.loadAll(inactiveRender.stdout)), checksums(selectedDocuments));
    writePrivateBundle(entry, baseline);
    const changedProfile = JSON.parse(selectedBytes);
    changedProfile.settings.clusterInvokers.kubernetesFixture.diagnosticCodeUnits++;
    assertPrivate(profileFile); fs.writeFileSync(profileFile, JSON.stringify(changedProfile));
    const changedRender = render(); assert.equal(changedRender.status, 0, changedRender.stderr);
    assert.notDeepEqual(checksums(yaml.loadAll(changedRender.stdout)), checksums(selectedDocuments));
    assertPrivate(profileFile); fs.writeFileSync(profileFile, selectedBytes);
    for (const selection of [null, '', '../buster-engine.config.json', 'files/config/prism-worker.config.json',
      'files/config/profiles/buster-engine.missing.config.json']) {
      values.busterComponentFile = selection; fs.writeFileSync(file, yaml.dump(values));
      const rejected = render(); assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /[Bb]uster.*[Cc]omponent/);
    }
    values.busterComponentFile = profileName;
    fs.writeFileSync(file, yaml.dump(values));
    assertPrivate(profileFile); fs.writeFileSync(profileFile, '');
    const emptyProfile = render(); assert.notEqual(emptyProfile.status, 0);
    assert.match(emptyProfile.stderr, /[Bb]uster.*[Cc]omponent/);
    assertPrivate(profileFile); fs.writeFileSync(profileFile, selectedBytes);
    const wrongOwner = JSON.parse(selectedBytes); wrongOwner.owner = 'prism-worker';
    assertPrivate(profileFile); fs.writeFileSync(profileFile, JSON.stringify(wrongOwner)); fs.writeFileSync(file, yaml.dump(values));
    assert.notEqual(render().status, 0);
    assertPrivate(profileFile); fs.writeFileSync(profileFile, selectedBytes);
    values.busterComponentFile = 'files/config/buster-engine.config.json'; fs.writeFileSync(file, yaml.dump(values));
    const renderPolicy = policy => {
      const document = structuredClone(baseline);
      document['buster-engine'].settings.clusterInvokers = policy;
      writePrivateBundle(entry, document);
      return render();
    };
    const selected = baseline['buster-engine'].settings.clusterInvokers;
    const changed = structuredClone(selected);
    changed.shared.leaseApiGroup = 'leases.example.test';
    changed.shared.leaseApiVersion = 'v2';
    changed.kubernetesFixture.pollIntervalMs = 75;
    changed.kubernetesFixture.shortCommandTimeoutMs = 700;
    changed.kubernetesFixture.diagnosticCodeUnits = 96;
    changed.tailscaleExposure.pollIntervalMs = 25;
    changed.tailscaleExposure.maximumCommandOutputBytes = 2048;
    for (const policy of [selected, changed]) {
      const result = renderPolicy(policy); assert.equal(result.status, 0, result.stderr);
      const docs = yaml.loadAll(result.stdout);
      const map = docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['swarm.config.json']);
      assert(map);
      const mounted = path.join(root, 'mounted/swarm.config.json');
      fs.mkdirSync(path.dirname(mounted), { recursive: true });
      writeTestBundle(mounted, bundleFromConfigMap(map.data));
      assert.deepEqual(loadBusterSettings({ SWARM_CONFIG: mounted }).clusterInvokers, policy);
      if (name === 'kubeclaw') {
        const crd = docs.find(doc => doc?.kind === 'CustomResourceDefinition' && doc.spec?.names?.plural === 'busternamespaceleases');
        assert(crd); assert.equal(crd.spec.group, policy.shared.leaseApiGroup);
        assert.equal(crd.spec.versions[0].name, policy.shared.leaseApiVersion);
        const client = docs.find(doc => doc?.kind === 'Role' && doc.metadata?.name?.endsWith('namespace-lease-client'));
        assert(client); assert(client.rules.filter(rule => rule.resources?.includes('busternamespaceleases'))
          .every(rule => rule.apiGroups.length === 1 && rule.apiGroups[0] === policy.shared.leaseApiGroup));
        const controller = docs.find(doc => doc?.kind === 'Deployment' && doc.spec.template.spec.containers
          .some(container => container.env?.some(entry => entry.name === 'BUSTER_LEASE_API_GROUP')));
        assert(controller);
        const environment = controller.spec.template.spec.containers.flatMap(container => container.env ?? []);
        assert.equal(environment.find(entry => entry.name === 'BUSTER_LEASE_API_GROUP').value, policy.shared.leaseApiGroup);
        assert.equal(environment.find(entry => entry.name === 'BUSTER_LEASE_API_VERSION').value, policy.shared.leaseApiVersion);
      }

    }
    for (const version of ['v1', 'v1alpha1', 'v2beta12']) {
      const policy = structuredClone(selected); policy.shared.leaseApiVersion = version;
      const result = renderPolicy(policy); assert.equal(result.status, 0, result.stderr);
      assert.equal(loadBusterSettings({ SWARM_CONFIG: entry }).clusterInvokers.shared.leaseApiVersion, version);
    }
    const invalid = [undefined, { ...selected, extra: 1 }];
    for (const version of ['v1alpha', 'v1beta', 'v1rc1', 'v1alpha1x', '']) {
      const policy = structuredClone(selected); policy.shared.leaseApiVersion = version; invalid.push(policy);
    }
    const collect = (value, prefix = []) => Object.entries(value).flatMap(([key, child]) =>
      child && typeof child === 'object' && !Array.isArray(child) ? collect(child, [...prefix, key]) : [[...prefix, key]]);
    for (const location of collect(selected)) {
      const current = location.reduce((value, key) => value[key], selected);
      const invalidValues = typeof current === 'number' ? [undefined, null, true, '10', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]
        : typeof current === 'boolean' ? [undefined, null, 0, 'true'] : [undefined, null, 42, {}];
      for (const value of invalidValues) {
        const variant = structuredClone(selected);
        const parent = location.slice(0, -1).reduce((item, key) => item[key], variant);
        parent[location.at(-1)] = value; invalid.push(variant);
      }
    }
    const incoherent = structuredClone(selected);
    incoherent.kubernetesFixture.maximumPersistentVolumeTotalBytes = 1; invalid.push(incoherent);
    const tailPoll = structuredClone(selected);
    tailPoll.tailscaleExposure.pollIntervalMs = tailPoll.tailscaleExposure.maximumExecutionMs + 1; invalid.push(tailPoll);
    for (const key of ['leaseApiGroup', 'leaseApiVersion']) for (const value of ['', key === 'leaseApiGroup' ? selected.shared.leaseApiGroup : selected.shared.leaseApiVersion]) {
      values.busterNamespaceBroker = { ...values.busterNamespaceBroker, [key]: value };
      fs.writeFileSync(file, yaml.dump(values));
      const rejected = render(); assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /retired busterNamespaceBroker/);
      delete values.busterNamespaceBroker[key];
    }
    fs.writeFileSync(file, yaml.dump(values));
    for (const policy of invalid) {
      const result = renderPolicy(policy); assert.notEqual(result.status, 0);
      assert.match(result.stderr, /cluster/i);
      assert.throws(() => loadBusterSettings({ SWARM_CONFIG: entry }), /SWARM_CONFIG/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
