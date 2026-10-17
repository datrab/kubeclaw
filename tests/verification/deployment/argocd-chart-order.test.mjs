import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prismChartProjection, prismAgentBridgeProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { busterChartProjection } from '../../../scripts/generate-buster-chart-config.mjs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { loadAll } from 'js-yaml';

const helm = process.env.HELM_BIN ?? 'helm';
// Original Argo ordering/retention assertions run against normal complete chart
// archives. Central topology selects the release/namespace; Helm cannot author it.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'argocd-chart-order-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const archives = new Map();
const projection = prismChartProjection(path.resolve('config'));
const bridge = prismAgentBridgeProjection(path.resolve('config'));
const tools = { ...bridge.deployment, ...bridge.toolPlugin };
function render(chart, options = []) {
  if (!archives.has(chart)) {
    const directory = path.join(root, chart);
    fs.cpSync(`charts/${chart}`, directory, { recursive: true, dereference: true });
    const topology = chart === 'prism' ? projection : busterChartProjection(path.resolve('config'));
    const member = chart === 'prism' ? 'prism-topology.json' : 'buster-topology.json';
    fs.writeFileSync(path.join(directory, 'files/pipeline', member), JSON.stringify(topology));
    if (chart === 'kubeclaw') fs.writeFileSync(path.join(directory, 'files/pipeline/prism-agent-tools.json'), JSON.stringify(tools));
    const output = path.join(root, `${chart}-package`); fs.mkdirSync(output);
    execFileSync(helm, ['package', directory, '--destination', output], { stdio: 'pipe' });
    const files = fs.readdirSync(output).filter(file => file.endsWith('.tgz'));
    assert.equal(files.length, 1);
    const archive = path.join(output, files[0]);
    assert.deepEqual(JSON.parse(execFileSync('tar', ['-xOf', archive,
      `${chart}/files/pipeline/${member}`], { encoding: 'utf8' })), topology);
    if (chart === 'kubeclaw') assert.deepEqual(JSON.parse(execFileSync('tar', ['-xOf', archive,
      'kubeclaw/files/pipeline/prism-agent-tools.json'], { encoding: 'utf8' })), tools);
    archives.set(chart, archive);
  }
  const deployment = chart === 'prism' ? projection.deployment
    : options.includes('agentRole=prism') ? bridge.deployment : { releaseName: 'agent-nova', namespace: 'kubeclaw' };
  return loadAll(execFileSync(helm, ['template', deployment.releaseName, archives.get(chart),
    '--namespace', deployment.namespace, ...options], { encoding: 'utf8' })).filter(Boolean);
}
const prism = ['-f', 'charts/prism/ci-values.yaml'];
const wave = resource => Number(resource.metadata.annotations?.['argocd.argoproj.io/sync-wave'] ?? 0);

test('Prism database and migration prerequisites precede its Argo migration hook and all application deployments', () => {
  const docs = render('prism', [...prism, '--set', 'ingestion.enabled=true',
    '--set', 'ingestion.resources.requests.cpu=100m', '--set', 'ingestion.resources.requests.memory=128Mi',
    '--set', 'ingestion.resources.limits.cpu=1', '--set', 'ingestion.resources.limits.memory=512Mi']);
  const migration = docs.find(resource => resource.kind === 'Job' && resource.metadata.name === 'prism-migrate');
  const hooks = docs.filter(resource => resource.metadata.annotations?.['argocd.argoproj.io/hook']);
  assert.deepEqual(hooks.map(hook => hook.metadata.name).sort(), ['prism-backup-storage-check', 'prism-migrate']);
  assert.equal(migration.metadata.annotations['argocd.argoproj.io/hook'], 'Sync');
  assert.equal(migration.metadata.annotations['argocd.argoproj.io/hook-delete-policy'], 'BeforeHookCreation,HookSucceeded');
  const prerequisites = docs.filter(resource => ['StatefulSet', 'ConfigMap', 'ServiceAccount', 'NetworkPolicy'].includes(resource.kind));
  assert(prerequisites.some(resource => resource.kind === 'StatefulSet' && resource.metadata.name === 'prism-postgresql'));
  assert(prerequisites.some(resource => resource.kind === 'ServiceAccount' && resource.metadata.name === migration.spec.template.spec.serviceAccountName));
  for (const resource of prerequisites) assert(wave(resource) < wave(migration), `${resource.kind}/${resource.metadata.name}`);
  const deployments = docs.filter(resource => resource.kind === 'Deployment');
  assert.deepEqual(deployments.map(resource => resource.metadata.name).sort(), ['prism-control', 'prism-ingestion', 'prism-studio', 'prism-worker']);
  for (const resource of deployments) assert(wave(resource) > wave(migration), resource.metadata.name);
  // Helm retains its separate original lifecycle; Argo explicitly ignores those
  // Helm hook mappings when a native Argo hook is defined on the resource.
  assert.equal(migration.metadata.annotations['helm.sh/hook'], 'post-install,pre-upgrade');
});

test('all standalone data claims and PostgreSQL-generated claims retain data on Argo prune/delete', () => {
  const docs = [...render('prism', prism), ...render('kubeclaw', ['--set', 'busterRuntimePersistence.enabled=true', '--set', 'busterRuntimePersistence.claimName=retained-buster'])];
  const claims = docs.filter(resource => resource.kind === 'PersistentVolumeClaim');
  for (const resource of docs.filter(resource => resource.kind === 'StatefulSet')) claims.push(...resource.spec.volumeClaimTemplates);
  assert(claims.length >= 6);
  for (const claim of claims) {
    assert.deepEqual(new Set(claim.metadata.annotations['argocd.argoproj.io/sync-options'].split(',')), new Set(['Prune=false', 'Delete=false']));
  }
});

test('an external database selection does not create a phantom migration hook or PostgreSQL data claim', () => {
  const docs = render('prism', [...prism, '--set', 'postgresql.enabled=false']);
  assert(!docs.some(resource => resource.metadata.name === 'prism-migrate'));
  assert(!docs.some(resource => resource.kind === 'StatefulSet'));
  assert(!docs.some(resource => resource.metadata.annotations?.['argocd.argoproj.io/hook']));
});


test('every standalone claim has a same-wave consumer, including backup storage before its first schedule', () => {
  const docs = [...render('prism', prism), ...render('kubeclaw', ['--set', 'agentRole=prism'])];
  const consumers = docs.filter(doc => ['Deployment', 'Job', 'StatefulSet'].includes(doc.kind));
  for (const claim of docs.filter(doc => doc.kind === 'PersistentVolumeClaim')) {
    assert(consumers.some(consumer => wave(consumer) === wave(claim) && consumer.spec.template.spec.volumes?.some(volume => volume.persistentVolumeClaim?.claimName === claim.metadata.name)), claim.metadata.name);
  }
  const storage = docs.find(doc => doc.metadata.name === 'prism-backup-storage-check');
  assert.equal(storage.spec.activeDeadlineSeconds, 120);
  assert.equal(storage.spec.template.spec.automountServiceAccountToken, false);
  assert.equal(storage.spec.template.spec.containers[0].env, undefined);
  assert.equal(storage.spec.template.spec.volumes.length, 1);
});
