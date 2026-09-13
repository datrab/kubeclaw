import test from 'node:test';
import assert from 'node:assert/strict';
import { renderQdrantMigrationStorage } from '../../../scripts/render-qdrant-migration-storage.mjs';

test('actual pinned Qdrant chart produces fresh storage claims and a network-isolated transfer Pod', () => {
  const docs = renderQdrantMigrationStorage('migration-test', 'qdrant-migrated', 'my-values/infra/qdrant-values.yaml', process.env.HELM_BIN ?? 'helm');
  const claims = docs.filter(value => value.kind === 'PersistentVolumeClaim');
  assert.deepEqual(claims.map(value => value.metadata.name), ['qdrant-storage-qdrant-migrated-0', 'qdrant-snapshots-qdrant-migrated-0']);
  assert.deepEqual(claims.map(value => value.spec.resources.requests.storage), ['15Gi', '30Gi']);
  const pod = docs.find(value => value.kind === 'Pod');
  assert.deepEqual(pod.spec.volumes.map(value => value.persistentVolumeClaim.claimName), claims.map(value => value.metadata.name));
  assert.deepEqual(pod.spec.containers[0].volumeMounts.map(value => value.mountPath), ['/qdrant/storage', '/qdrant/snapshots']);
  assert.match(pod.spec.containers[0].image, /@sha256:[a-f0-9]{64}$/);
  assert.equal(pod.spec.automountServiceAccountToken, false);
  assert.equal(pod.spec.containers[0].env, undefined);
  assert.equal(pod.spec.activeDeadlineSeconds, 3600);
  const policy = docs.find(value => value.kind === 'NetworkPolicy');
  assert.deepEqual(policy.spec.podSelector.matchLabels, pod.metadata.labels);
  assert.deepEqual(policy.spec.ingress, []); assert.deepEqual(policy.spec.egress, []);
});
