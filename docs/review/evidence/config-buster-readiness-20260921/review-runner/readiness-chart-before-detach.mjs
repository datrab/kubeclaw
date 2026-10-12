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

for (const name of ['kubeclaw', 'prism']) test(`actual ${name} Helm rejects malformed readiness policy and delivers both authored profiles`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-chart-'));
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
    const file = path.join(root, 'values.yaml'); fs.writeFileSync(file, yaml.dump(values));
    const entry = path.join(chart, 'files/config/swarm.config.json');
    const baseline = readTestBundle(entry);
    const render = () => spawnSync('helm', ['template', 'readiness', chart, '--namespace', namespace, '-f', file],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const checksums = [];
    for (const policy of [{ maximumExecutionMs: 300, maximumOutputBytes: 64 }, { maximumExecutionMs: 2500, maximumOutputBytes: 1024 }]) {
      const document = structuredClone(baseline); document['buster-engine'].settings.dependencyReadiness = policy;
      writePrivateBundle(entry, document);
      const result = render(); assert.equal(result.status, 0, result.stderr);
      const docs = yaml.loadAll(result.stdout), map = docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['swarm.config.json']);
      const mounted = path.join(root, 'mounted/swarm.config.json'); fs.mkdirSync(path.dirname(mounted), { recursive: true });
      writeTestBundle(mounted, bundleFromConfigMap(map.data));
      assert.deepEqual(loadBusterSettings({ SWARM_CONFIG: mounted }).dependencyReadiness, policy);
      const deployment = docs.find(doc => doc?.kind === 'Deployment' && doc.spec.template.metadata.annotations?.['checksum/swarm-config']);
      checksums.push(deployment.spec.template.metadata.annotations['checksum/swarm-config']);
    }
    assert.notEqual(checksums[0], checksums[1], 'owner change must trigger rollout');
    const original = baseline['buster-engine'].settings.dependencyReadiness;
    const malformed = [undefined, null, [], {}, { ...original, extra: 1 }];
    for (const [field, maximum] of [['maximumExecutionMs', 30000], ['maximumOutputBytes', 1048576]]) {
      for (const value of [undefined, null, false, true, '1000', [], {}, 0, -1, 1.5, maximum + 1]) {
        const policy = { ...original, [field]: value }; if (value === undefined) delete policy[field]; malformed.push(policy);
      }
      for (const value of [1, maximum]) {
        const document = structuredClone(baseline); document['buster-engine'].settings.dependencyReadiness = { ...original, [field]: value };
        writePrivateBundle(entry, document); const result = render(); assert.equal(result.status, 0, result.stderr);
      }
    }
    for (const policy of malformed) {
      const document = structuredClone(baseline); document['buster-engine'].settings.dependencyReadiness = policy;
      writePrivateBundle(entry, document); const result = render(); assert.notEqual(result.status, 0);
      assert.match(result.stderr, /swarm|dependencyReadiness|maximumExecutionMs|maximumOutputBytes/);
    }
    assert.doesNotMatch(fs.readFileSync('docker/buster-runtime-entrypoint.sh', 'utf8'), /dependencyReadiness/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
