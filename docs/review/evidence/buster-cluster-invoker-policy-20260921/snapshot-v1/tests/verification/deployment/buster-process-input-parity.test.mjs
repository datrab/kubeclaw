import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { readTestBundle, writeTestBundle, bundleFromConfigMap, bundleNames } from '../../fixtures/config/swarm-bundle.mjs';
import { loadBusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

for (const name of ['kubeclaw', 'prism']) test(`actual ${name} Helm and loader enforce shared process-input policy`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'process-input-chart-'));
  try {
    const chart = path.join(root, name);
    fs.cpSync(`charts/${name}`, chart, { recursive: true, dereference: true });
    const mutationFiles = [...bundleNames, 'swarm.schema.json', 'swarm-components.schema.json'];
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
    const renderPolicy = policy => {
      const document = structuredClone(baseline);
      document['buster-engine'].settings.execution.processInput = policy;
      writePrivateBundle(entry, document);
      return render();
    };
    for (const policy of [
      { cleanupTimeoutMs: 1500, terminationGraceMs: 250, acknowledgementPollMs: 10 },
      { cleanupTimeoutMs: 2400, terminationGraceMs: 400, acknowledgementPollMs: 25 },
    ]) {
      const result = renderPolicy(policy); assert.equal(result.status, 0, result.stderr);
      const docs = yaml.loadAll(result.stdout);
      const map = docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['swarm.config.json']);
      assert(map);
      const mounted = path.join(root, 'mounted/swarm.config.json');
      fs.mkdirSync(path.dirname(mounted), { recursive: true });
      writeTestBundle(mounted, bundleFromConfigMap(map.data));
      assert.deepEqual(loadBusterSettings({ SWARM_CONFIG: mounted }).execution.processInput, policy);
    }
    const selected = baseline['buster-engine'].settings.execution.processInput;
    const invalid = [undefined, { ...selected, extra: 1 },
      { ...selected, terminationGraceMs: selected.cleanupTimeoutMs },
      { ...selected, acknowledgementPollMs: selected.cleanupTimeoutMs + 1 }];
    for (const field of Object.keys(selected)) {
      for (const value of [undefined, null, true, '10', 0, -1, 1.5, 2147483648]) {
        invalid.push({ ...selected, [field]: value });
      }
    }
    for (const policy of invalid) {
      const result = renderPolicy(policy); assert.notEqual(result.status, 0);
      assert.match(result.stderr, /buster execution/);
      assert.throws(() => loadBusterSettings({ SWARM_CONFIG: entry }), /SWARM_CONFIG/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
