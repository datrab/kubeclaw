import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import yaml from 'js-yaml';
import {buildBusterImageBundle} from '../../../scripts/build-buster-image-bundle.mjs';

test('central OpenClaw observer profile reaches actual Helm/config receiver A/B with no ENV policy fallback', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-observer-owner-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {encoding: 'utf8'}).trim();
  const builtAt = new Date().toISOString();
  const built = await buildBusterImageBundle({repository: process.cwd(), output: path.join(root, 'image'), revision, builtAt});
  assert.equal(built.metadata.revision, revision);
  const manifest = JSON.parse(fs.readFileSync(path.join(built.packageRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.commit, revision);
  assert.equal(manifest.builtAt, builtAt);
  // Use the real role's delivered extension and generated contract, not the source-tree resolver.
  const {resolveAgentObserverConfig} = await import(pathToFileURL(path.join(built.packageRoot,
    'skills/plugins/openclaw-agent-observer/src/config.ts')).href);
  const chart = path.join(root, 'chart');
  fs.cpSync('charts/kubeclaw', chart, {recursive: true, dereference: true});
  const packaged = path.join(root, 'packaged'); fs.mkdirSync(packaged);
  execFileSync('helm', ['package', chart, '--destination', packaged], {stdio: 'pipe'});
  const archives = fs.readdirSync(packaged).filter(file => file.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const archive = path.join(packaged, archives[0]);
  const base = yaml.load(fs.readFileSync(path.join(chart, 'values.yaml'), 'utf8')).agentObserverPolicy;
  const values = yaml.load(fs.readFileSync('my-values/buster-values.yaml', 'utf8'));
  values.pipelineDelivery = {buster: built.metadata};
  // Explicit shape-only render inputs: these are NOT a built OCI/native identity.
  values.busterNative = {namespace: 'kubeclaw', nodeName: 'fixture-node', policyDigest: 'a'.repeat(64)};
  values.runtimeInfrastructure = {registry: {endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'fixture'}};
  values.extraContainers.find(c => c.name === 'buster-v2-runtime').image = 'ghcr.io/datrab/kubeclaw-buster-runtime@sha256:' + 'a'.repeat(64);
  const file = path.join(root, 'values.yaml');
  const render = () => {
    fs.writeFileSync(file, yaml.dump(values));
    return yaml.loadAll(execFileSync('helm', ['template', 'agent-buster', archive, '--namespace', 'kubeclaw', '-f', file],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})).filter(Boolean);
  };
  const received = [], checksums = [];
  for (const maxQueuePerStream of [100, 25, 100]) {
    values.agentObserverPolicy = {...base, maxQueuePerStream};
    const docs = render();
    const configMap = docs.find(d => d.kind === 'ConfigMap' && d.metadata.name === 'agent-buster-config');
    assert.ok(configMap);
    const deployment = docs.find(d => d.kind === 'Deployment' && d.metadata.name === 'agent-buster');
    assert.ok(deployment, 'complete normally packaged chart retains the actual gateway workload');
    assert.ok(deployment.spec.template.spec.volumes.some(volume => volume.configMap?.name === configMap.metadata.name),
      'the actual workload references the selected gateway configuration');
    const gateway = JSON.parse(configMap.data['openclaw.json']);
    const actual = gateway.plugins.entries['kubeclaw-agent-observer'].config;
    assert.deepEqual(actual, values.agentObserverPolicy);
    const resolved = resolveAgentObserverConfig(actual, {REDIS_HOST: 'redis.internal', REDIS_PORT: '6379'});
    assert.equal(resolved.maxQueuePerStream, maxQueuePerStream);
    assert.equal(resolved.redisHost, 'redis.internal'); assert.equal(resolved.redisTls, false);
    assert(Object.isFrozen(resolved)); received.push(resolved);
    checksums.push(deployment.spec.template.metadata.annotations['checksum/config']);
    // Authored policy mutation after the real consumer must not change its captured selection.
    actual.maxQueuePerStream = 1;
    assert.equal(resolved.maxQueuePerStream, maxQueuePerStream);
  }
  fs.unlinkSync(file);
  assert.equal(received[0].maxQueuePerStream, 100);
  assert.notEqual(checksums[0], checksums[1]);
  assert.equal(checksums[2], checksums[0]);
  assert.deepEqual(received[2], received[0]);
  for (const key of Object.keys(base).filter(k => k !== 'policyVersion')) {
    const missing = {...base}; delete missing[key];
    assert.throws(() => resolveAgentObserverConfig(missing, {}), /FIELD_REQUIRED/);
  }
  assert.throws(() => resolveAgentObserverConfig(base, {OPENCLAW_AGENT_OBSERVER_MAX_QUEUE_PER_STREAM: '100'}), /COMPETING_AUTHOR/);
  assert.throws(() => resolveAgentObserverConfig(base, {REDIS_TLS: 'false'}), /COMPETING_AUTHOR/);
  assert.throws(() => resolveAgentObserverConfig({...base, policyVersion: 'future'}, {}), /POLICY_VERSION/);
  values.agentObserverPolicy = null;
  assert.throws(render, /Central agentObserverPolicy is required/);
  values.agentObserverPolicy = {...base};
  const restored = render().find(d => d.kind === 'ConfigMap' && d.metadata.name === 'agent-buster-config');
  assert.deepEqual(JSON.parse(restored.data['openclaw.json']).plugins.entries['kubeclaw-agent-observer'].config, base);
});
