import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dump, loadAll } from 'js-yaml';

const render = (chart, settings = []) => loadAll(execFileSync('helm', ['template', 'review', `charts/${chart}`,
  ...(chart === 'kubeclaw' ? ['--set', 'serviceAccount.create=true'] : []),
  ...(settings.includes('agentRole=buster') ? ['-f', 'my-values/buster-values.yaml', '--set', 'runtimeInfrastructure.registry.endpoint=https://registry.example.test', '--set', 'runtimeInfrastructure.registry.transport=https', '--set', 'runtimeInfrastructure.registry.authSecretName=registry-test'] : []),
  ...(chart === 'prism' ? ['-f', 'charts/prism/ci-values.yaml'] : []),
  '--set', 'workerTrust.spiffe.enabled=true', ...settings.flatMap(value => ['--set', value])], { encoding: 'utf8' })).filter(Boolean);
const deployment = (documents, name) => documents.find(value => value.kind === 'Deployment' && value.metadata.name === name);
const trustMap = documents => documents.find(value => value.kind === 'ConfigMap' && value.metadata.name.endsWith('worker-trust'));
const checksum = pod => pod.spec.template.metadata.annotations?.['checksum/worker-trust'];

for (const role of ['nova', 'buster', 'prism']) {
  const baseline = render('kubeclaw', [`agentRole=${role}`]);
  const changed = render('kubeclaw', [`agentRole=${role}`, 'workerTrust.spiffe.trustDomain=changed.internal']);
  const unrelated = render('kubeclaw', [`agentRole=${role}`, 'service.type=NodePort']);
  const before = deployment(baseline, `agent-${role}`);
  assert.match(checksum(before), /^[a-f0-9]{64}$/u);
  assert.notEqual(trustMap(baseline).data['envoy.yaml'], trustMap(changed).data['envoy.yaml']);
  assert.notEqual(checksum(before), checksum(deployment(changed, `agent-${role}`)));
  assert.deepEqual(before.spec.template, deployment(unrelated, `agent-${role}`).spec.template);
}

const prism = render('prism');
const changedPeer = render('prism', ['workerTrust.spiffe.novaServiceAccount=other-nova']);
const changedTrust = render('prism', ['workerTrust.spiffe.trustDomain=changed.internal']);
const unrelatedPrism = render('prism', ['tailscale.hostname=other-studio']);
for (const name of ['control', 'worker']) {
  assert.match(checksum(deployment(prism, `prism-${name}`)), /^[a-f0-9]{64}$/u);
  assert.notEqual(trustMap(prism).data[`${name}.yaml`], trustMap(changedTrust).data[`${name}.yaml`]);
  assert.notEqual(checksum(deployment(prism, `prism-${name}`)), checksum(deployment(changedTrust, `prism-${name}`)));
}
assert.notEqual(trustMap(prism).data['control.yaml'], trustMap(changedPeer).data['control.yaml']);
assert.equal(trustMap(prism).data['worker.yaml'], trustMap(changedPeer).data['worker.yaml']);
assert.notEqual(checksum(deployment(prism, 'prism-control')), checksum(deployment(changedPeer, 'prism-control')));
for (const name of ['worker', 'studio']) {
  assert.deepEqual(deployment(prism, `prism-${name}`).spec.template, deployment(changedPeer, `prism-${name}`).spec.template);
  assert.deepEqual(deployment(prism, `prism-${name}`).spec.strategy, name === 'worker' ? { type: 'Recreate' } : undefined);
}
for (const name of ['control', 'studio', 'worker']) {
  assert.deepEqual(deployment(prism, `prism-${name}`).spec.template, deployment(unrelatedPrism, `prism-${name}`).spec.template);
}
assert.deepEqual(deployment(prism, 'prism-control').spec.strategy, { type: 'Recreate' });
assert.equal(deployment(prism, 'prism-control').spec.replicas, 1);
assert.deepEqual(prism.find(value => value.kind === 'PersistentVolumeClaim' && value.metadata.name === 'prism-artifacts').spec.accessModes, ['ReadWriteOnce']);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rollout-health-'));
try {
  const original = fs.readFileSync('my-values/infra/litellm-config.yaml', 'utf8');
  const changedConfig = original.replace('gemini-embedding-001', 'embedding-route-review');
  assert.notEqual(original, changedConfig);
  const configFile = path.join(temporary, 'config.yaml');
  const manifestFile = path.join(temporary, 'deployment.yaml');
  fs.copyFileSync('my-values/infra/litellm-deployment.yaml', manifestFile);
  const litellm = config => {
    fs.writeFileSync(configFile, config);
    return loadAll(execFileSync(process.execPath, ['scripts/render-litellm-deployment.mjs', configFile, manifestFile], { encoding: 'utf8' }));
  };
  const baseline = litellm(original);
  assert.equal(baseline[0].kind, 'ConfigMap');
  assert.equal(baseline[0].data['config.yaml'], original);
  const changed = litellm(changedConfig);
  assert.equal(changed[0].data['config.yaml'], changedConfig);
  const before = deployment(baseline, 'litellm');
  const after = deployment(changed, 'litellm');
  assert.notEqual(before.spec.template.metadata.annotations['checksum/litellm-config'], after.spec.template.metadata.annotations['checksum/litellm-config']);
  const manifests = loadAll(fs.readFileSync(manifestFile, 'utf8'));
  manifests.find(value => value.kind === 'Service').metadata.annotations = { 'review-note': 'unrelated service edit' };
  fs.writeFileSync(manifestFile, manifests.map(value => dump(value)).join('---\n'));
  assert.deepEqual(before.spec.template, deployment(litellm(original), 'litellm').spec.template);
  const container = before.spec.template.spec.containers.find(value => value.name === 'litellm');
  assert.deepEqual(container.startupProbe.httpGet, { path: '/health/liveliness', port: 'http' });
  assert.deepEqual(container.livenessProbe.httpGet, container.startupProbe.httpGet);
  assert.deepEqual(container.readinessProbe.httpGet, { path: '/health/readiness', port: 'http' });
  assert.equal(container.volumeMounts.find(value => value.name === 'config').subPath, 'config.yaml');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, scope: 'actual-helm-and-config-render-sensitivity', liveRollout: false, pinnedLiteLLMProbeExecution: false }));
