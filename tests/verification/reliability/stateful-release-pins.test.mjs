import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadAll } from 'js-yaml';
import { prepareInfrastructureRelease, renderInfrastructureChart } from '../../../scripts/infrastructure-release.mjs';
import { infrastructureChart, verifyInfrastructureChart } from '../../../scripts/infrastructure-chart.mjs';
import { bindInfrastructureImages } from '../../../scripts/infrastructure-image-renderer.mjs';
import { requireCompatibleStatefulRelease, requireRedisAofPolicy } from '../../../scripts/stateful-release-preflight.mjs';

const helm = process.env.HELM_BIN ?? 'helm';
for (const name of ['redis', 'postgresql']) {
  test(`${name} actual locked install/upgrade Helm render binds every image and protects retained claims`, { timeout: 30000 }, () => {
    const values = `my-values/infra/${name}-values.yaml`;
    const archive = prepareInfrastructureRelease(name, name, 'stateful-test', values, helm);
    const lock = infrastructureChart(name);
    const metadata = verifyInfrastructureChart(name, archive);
    const expectedVersion = lock.appVersion;
    assert.equal(String(metadata.appVersion).replace(/^v/, ''), expectedVersion);
    assert.match(lock.url, /@sha256:[a-f0-9]{64}$/u);
    assert.match(lock.sha256, /^[a-f0-9]{64}$/u);
    const manifests = loadAll(renderInfrastructureChart(name, name, 'stateful-test', archive, values, helm, true)).filter(Boolean);
    const bound = bindInfrastructureImages(name, manifests);
    const workload = bound.find(value => value.kind === 'StatefulSet');
    assert.ok(workload); assert.equal(workload.spec.replicas, 1);
    const image = JSON.parse(fs.readFileSync('versions.json', 'utf8')).infrastructure[name].replace(/:[^:@]+@/u, '@');
    assert.ok(workload.spec.template.spec.containers.every(container => container.image.replace(/:[^:@]+@/u, '@') === image));
    // These are manifest-contract cases; no fake kubectl or cluster is used.
    const claims = workload.spec.volumeClaimTemplates.map(claim => ({ metadata: { name: `${claim.metadata.name}-${workload.metadata.name}-0` },
      spec: structuredClone(claim.spec), status: { phase: 'Bound' } }));
    assert.deepEqual(requireCompatibleStatefulRelease(null, workload, [], null, expectedVersion), { action: 'fresh-install', version: expectedVersion });
    assert.throws(() => requireCompatibleStatefulRelease(null, workload, claims, null, expectedVersion), /STATEFUL_ORPHANED_PVC_RESTORE_REQUIRED/u);
    assert.deepEqual(requireCompatibleStatefulRelease(workload, workload, claims, expectedVersion, expectedVersion), { action: 'compatible-upgrade', version: expectedVersion });
    assert.throws(() => requireCompatibleStatefulRelease(workload, workload, claims, '0.0.0', expectedVersion), /STATEFUL_VERSION_MIGRATION_REQUIRED/u);
    const prior = structuredClone(workload); prior.spec.volumeClaimTemplates[0].spec.resources.requests.storage = '1Gi';
    assert.throws(() => requireCompatibleStatefulRelease(prior, workload, claims, expectedVersion, expectedVersion), /STATEFUL_STORAGE_MIGRATION_REQUIRED/u);
    const changed = structuredClone(bound); changed.find(value => value.kind === 'StatefulSet').spec.template.spec.containers[0].image = 'registry-1.docker.io/bitnami/redis:latest';
    assert.throws(() => bindInfrastructureImages(name, changed), /INFRASTRUCTURE_IMAGE_NOT_PINNED/u);
  });
}

test('Redis policy refuses a restart-based RDB-to-AOF conversion or implicit dedup eviction', () => {
  const policy = { appendonly: 'yes', appendfsync: 'always', 'no-appendfsync-on-rewrite': 'no', 'aof-load-truncated': 'no', 'maxmemory-policy': 'noeviction' };
  requireRedisAofPolicy(policy);
  for (const key of Object.keys(policy)) assert.throws(() => requireRedisAofPolicy({ ...policy, [key]: 'different' }), /REDIS_DURABILITY_MIGRATION_REQUIRED/u);
});

test('Redis migration release renders independently and an explicitly restored PVC must remain bound', () => {
  const archive = prepareInfrastructureRelease('redis', 'redis-next', 'stateful-test', 'my-values/infra/redis-values.yaml', helm);
  const manifests = loadAll(renderInfrastructureChart('redis', 'redis-next', 'stateful-test', archive,
    'my-values/infra/redis-values.yaml', helm, true)).filter(Boolean);
  const workload = manifests.find(value => value.kind === 'StatefulSet');
  assert.equal(workload.metadata.name, 'redis-next-master');
  assert.equal(workload.metadata.labels['app.kubernetes.io/instance'], 'redis-next');
  const restored = structuredClone(workload);
  restored.spec.volumeClaimTemplates = [];
  restored.spec.template.spec.volumes.push({ name: 'restored-data', persistentVolumeClaim: { claimName: 'redis-restored' } });
  const version = infrastructureChart('redis').appVersion;
  assert.throws(() => requireCompatibleStatefulRelease(restored, restored, [], version, version), /BOUND_PVC_REQUIRED/);
  const claims = [{ metadata: { name: 'redis-restored' }, status: { phase: 'Bound' } }];
  assert.equal(requireCompatibleStatefulRelease(restored, restored, claims, version, version).action, 'compatible-upgrade');
  assert.throws(() => requireCompatibleStatefulRelease(null, restored, claims, null, version), /ORPHANED_PVC_RESTORE_REQUIRED/);
});
