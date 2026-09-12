import assert from 'node:assert/strict';
import test from 'node:test';
import { renderRegistryLocal } from '../../../scripts/render-registry-local.mjs';

const config = { capacity: '8Gi', storageClassName: 'test-csi' };
const docs = renderRegistryLocal(config);
const deployment = docs.find(doc => doc.kind === 'Deployment');
const pvc = docs.find(doc => doc.kind === 'PersistentVolumeClaim');

test('storage is explicit, persistent and excludes simultaneous writer/GC Pods', () => {
  assert.deepEqual(pvc.spec.accessModes, ['ReadWriteOncePod']);
  assert.equal(pvc.spec.resources.requests.storage, config.capacity);
  assert.equal(deployment.spec.strategy.type, 'Recreate');
  for (const mode of ['gc', 'gc-dry-run']) {
    const rendered = renderRegistryLocal(config, mode, deployment, pvc);
    assert.equal(rendered.find(doc => doc.kind === 'Deployment').spec.replicas, 0);
    const job = rendered.find(doc => doc.kind === 'Job');
    const container = job.spec.template.spec.containers[0];
    assert.deepEqual(container.args, ['garbage-collect', ...(mode === 'gc-dry-run' ? ['--dry-run'] : []), '/etc/kubeclaw-registry/config.yml']);
    assert.equal(job.spec.backoffLimit, 0);
    assert.deepEqual(job.spec.template.spec.volumes, deployment.spec.template.spec.volumes);
    assert.notEqual(job.spec.template.metadata.labels.app, 'registry-local');
  }
});

test('ambiguous storage, legacy writable layers and online/unknown GC fail before rendering', () => {
  for (const invalid of [{}, { ...config, capacity: '0Gi' }, { ...config, capacity: '8Gi\n' },
    { ...config, storageClassName: '' }, { ...config, deleteUntagged: true }]) {
    assert.throws(() => renderRegistryLocal(invalid), /REGISTRY_STORAGE_CONFIG_INVALID/);
  }
  assert.throws(() => renderRegistryLocal(config, 'gc'), /REGISTRY_GC_EXISTING/);
  assert.throws(() => renderRegistryLocal(config, 'serve', {}), /REGISTRY_DEPLOYMENT_INVALID/);
  const old = structuredClone(deployment); delete old.spec.template.spec.volumes;
  assert.throws(() => renderRegistryLocal(config, 'serve', old, pvc), /REGISTRY_EPHEMERAL_MIGRATION_REQUIRED/);
  assert.throws(() => renderRegistryLocal(config, 'gc', deployment), /REGISTRY_EXISTING_STORAGE_MISSING/);
  const rwo = structuredClone(pvc); rwo.spec.accessModes = ['ReadWriteOnce'];
  assert.throws(() => renderRegistryLocal(config, 'gc', deployment, rwo), /REGISTRY_EXISTING_STORAGE_MISMATCH/);
  assert.throws(() => renderRegistryLocal({ ...config, capacity: '9Gi' }, 'gc', deployment, pvc), /REGISTRY_EXISTING_STORAGE_MISMATCH/);
  const alias = structuredClone(deployment); alias.spec.template.spec.containers[0].volumeMounts[0].subPath = 'other';
  assert.throws(() => renderRegistryLocal(config, 'gc', alias, pvc), /REGISTRY_EPHEMERAL_MIGRATION_REQUIRED/);
});
