import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { gitOpsDigest, inspectGitOpsResources } from '../../../scripts/gitops-bundle.mjs';
import { describeNodeResources } from '../../../tools/ops-mcp/src/node-resources.mjs';

const baseline = 'releases/gitops/runtime-40422265477-3';
const selected = 'releases/gitops/prism-cpu-headroom-20261027';
const beforeReceipt = JSON.parse(fs.readFileSync(`${baseline}/bundle.receipt`));
const afterReceipt = JSON.parse(fs.readFileSync(`${selected}/bundle.receipt`));
const read = (directory, role) => fs.readFileSync(`${directory}/${role}/resources.yaml`, 'utf8');
const documents = bytes => yaml.loadAll(bytes).filter(Boolean);
const targets = new Map([
  ['Deployment/prism-control/control', ['500m', '100m']],
  ['Deployment/prism-worker/worker', ['1', '100m']],
  ['Deployment/prism-studio/studio', ['250m', '50m']],
  ['StatefulSet/prism-postgresql/postgresql', ['500m', '100m']],
]);

test('headroom release changes exactly four Prism CPU requests without changing images, limits, RAM or data', () => {
  const before = documents(read(baseline, 'prism')), after = documents(read(selected, 'prism'));
  const restored = structuredClone(after);
  let changed = 0;
  for (const doc of restored) {
    for (const container of doc.spec?.template?.spec?.containers ?? []) {
      const pair = targets.get(`${doc.kind}/${doc.metadata.name}/${container.name}`);
      if (!pair) continue;
      assert.equal(container.resources.requests.cpu, pair[1]);
      container.resources.requests.cpu = pair[0];
      changed++;
    }
  }
  assert.equal(changed, 4);
  assert.deepEqual(restored, before);
  assert.deepEqual(afterReceipt.receipt, beforeReceipt.receipt);
  for (const role of ['buster', 'nova']) assert.equal(read(selected, role), read(baseline, role));
});

test('bundle digests and inventories match the new immutable manifests', () => {
  for (const group of afterReceipt.groups) {
    assert.equal(group.path, `${selected}/${group.role}`);
    const bytes = read(selected, group.role);
    assert.equal(gitOpsDigest(bytes), group.manifestDigest);
    const inspection = inspectGitOpsResources(documents(bytes), group.namespace);
    for (const field of ['resources', 'images', 'requiredSecrets']) assert.deepEqual(inspection[field], group[field]);
  }
  const overlay = yaml.load(fs.readFileSync('gitops/production/overlays/prism-ax41.yaml', 'utf8'));
  for (const [key, [, expected]] of targets) {
    const component = key.split('/').at(-1);
    assert.equal(overlay[component].resources.requests.cpu, expected);
  }
});

test('init-aware Kubernetes accounting confirms 1900m freed with replicas and sidecars unchanged', async () => {
  const allocation = async directory => {
    const pods = documents(read(directory, 'prism')).filter(doc => ['Deployment', 'StatefulSet'].includes(doc.kind))
      .flatMap(doc => Array.from({ length: doc.spec.replicas ?? 1 }, () => ({
        metadata: { name: doc.metadata.name, namespace: doc.metadata.namespace },
        spec: { ...doc.spec.template.spec, nodeName: 'ax41-production' }, status: { phase: 'Running' },
      })));
    return describeNodeResources(async () => ({ metadata: { name: 'ax41-production' }, status: { allocatable: { cpu: '7' } } }),
      async (_path, options) => ({ items: pods.map(options.mapItem), pages: 1, partial: false }), 'ax41-production');
  };
  const before = await allocation(baseline), after = await allocation(selected);
  const millicores = value => value.endsWith('m') ? Number(value.slice(0, -1)) : Number(value) * 1000;
  assert.equal(millicores(before.allocatedResources.cpu.requests) - millicores(after.allocatedResources.cpu.requests), 1900);
  assert.equal(before.nonTerminatedPodCount, after.nonTerminatedPodCount);
  assert.equal(before.allocatedResources.memory.requests, after.allocatedResources.memory.requests);
  assert.deepEqual(before.allocatedResources.cpu.limits, after.allocatedResources.cpu.limits);
});
