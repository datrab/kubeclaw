import { readTestBundle, writeTestBundle, bundleFromConfigMap } from '../../fixtures/config/swarm-bundle.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';
import { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { loadBusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

const retired = ['BUSTER_V2_MAX_ACTIVE_JOBS', 'BUSTER_V2_MAX_QUEUED_JOBS', 'BUSTER_V2_MAX_CONCURRENT_ATTEMPTS'];
test('actual Buster chart mounts both authored admission profiles and rejects retired ENV authors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-admission-render-'));
  try {
    const values = yaml.load(fs.readFileSync('my-values/buster-values.yaml', 'utf8'));
    values.busterComponentFile = 'files/config/buster-engine.config.json'; // Explicit full profile exercised by original mutations.
    const policy = yaml.load(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
    policy.nodeName = 'admission-render-only'; policy.pools.buster.namespace = 'buster-admission';
    const binding = nativePoolPolicy(policy, 'buster');
    values.busterNative = { namespace: 'buster-admission', nodeName: binding.nodeName, policyDigest: binding.policyDigest };
    values.runtimeInfrastructure = { registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } };
    const container = values.extraContainers.find(item => item.name === 'buster-v2-runtime');
    // Valid-shaped image and node identities exercise rendering only, never host/deployment proof.
    container.image = `ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`;
    const file = path.join(root, 'values.yaml'), config = path.join(root, 'swarm.json');
    const chart = path.join(root, 'kubeclaw');
    fs.cpSync('charts/kubeclaw', chart, { recursive: true, dereference: true });
    const render = () => {
      fs.writeFileSync(file, yaml.dump(values));
      return spawnSync('helm', ['template', 'buster', chart, '--namespace', 'buster-admission', '-f', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    };
    const checksums = [];
    for (const maximumQueuedJobs of [8, 3]) {
      const document = readTestBundle(path.resolve('charts/kubeclaw/files/config/swarm.config.json'));
      document['buster-engine'].settings.admission.maximumQueuedJobs = maximumQueuedJobs;
      writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), document);
      const result = render(); assert.equal(result.status, 0, result.stderr);
      const docs = yaml.loadAll(result.stdout);
      const map = docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['swarm.config.json']);
      writeTestBundle(config, bundleFromConfigMap(map.data));
      assert.equal(loadBusterSettings({ SWARM_CONFIG: config }).admission.maximumQueuedJobs, maximumQueuedJobs);
      const deployment = docs.find(doc => doc?.kind === 'Deployment'
        && doc.spec.template.spec.containers.some(item => item.name === 'buster-v2-runtime'));
      checksums.push(deployment.spec.template.metadata.annotations['checksum/swarm-config']);
      const actual = deployment.spec.template.spec.containers.find(item => item.name === 'buster-v2-runtime');
      assert.equal(actual.env.find(item => item.name === 'SWARM_CONFIG').value, '/etc/kubeclaw/swarm/swarm.config.json');
      assert.ok(actual.volumeMounts.some(item => item.name === 'init-swarm-config' && item.mountPath === '/etc/kubeclaw/swarm' && !('subPath' in item) && item.readOnly));
      for (const name of retired) assert.ok(!actual.env.some(item => item.name === name));
    }
    assert.notEqual(checksums[0], checksums[1]);
    for (const name of retired) {
      container.env.push({ name, value: '8' });
      const result = render(); assert.notEqual(result.status, 0);
      assert.match(result.stderr, /duplicates the native Buster startup author/);
      container.env.pop();
    }
    const dockerfile = fs.readFileSync('docker/Dockerfile.buster-runtime', 'utf8');
    const entrypoint = fs.readFileSync('docker/buster-runtime-entrypoint.sh', 'utf8');
    for (const name of retired) { assert.ok(!dockerfile.includes(name)); assert.ok(!entrypoint.includes(name)); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('actual service CLI rejects inherited retired ENV before opening its parent channel', () => {
  assert.equal(process.getuid(), 1000, 'this unprivileged CLI proof uses its real service identity');
  assert.equal(process.getgid(), 1000);
  for (const name of retired) {
    const environment = { ...process.env, SWARM_CONFIG: path.resolve('charts/kubeclaw/files/config/swarm.config.json'), [name]: '2' };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['skills/buster/engine/remote-plan-cli.ts', '--config', '/unused-runtime.json'],
      { env: environment, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`SWARM_CONFIG_LEGACY_OVERRIDE:${name}`), result.stderr);
    assert.doesNotMatch(result.stderr, /EBADF|ENOENT|BUSTER_SERVICE_IDENTITY_REQUIRED/);
  }
});
