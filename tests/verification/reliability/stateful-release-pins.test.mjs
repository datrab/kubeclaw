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
    assert.equal(verifyInfrastructureChart(name, archive).appVersion, lock.appVersion);
    assert.match(lock.url, /@sha256:[a-f0-9]{64}$/u);
    const manifests = loadAll(renderInfrastructureChart(name, name, 'stateful-test', archive, values, helm, true)).filter(Boolean);
    const bound = bindInfrastructureImages(name, manifests);
    const workload = bound.find(value => value.kind === 'StatefulSet');
    assert.ok(workload); assert.equal(workload.spec.replicas, 1);
    const image = JSON.parse(fs.readFileSync('versions.json', 'utf8')).infrastructure[name].replace(/:[^:@]+@/u, '@');
    assert.ok(workload.spec.template.spec.containers.every(container => container.image === image));
    // These are manifest-contract cases; no fake kubectl or cluster is used.
    const claims = workload.spec.volumeClaimTemplates.map(claim => ({ metadata: { name: `${claim.metadata.name}-${workload.metadata.name}-0` },
      spec: structuredClone(claim.spec), status: { phase: 'Bound' } }));
    assert.deepEqual(requireCompatibleStatefulRelease(null, workload, [], null, lock.appVersion), { action: 'fresh-install', version: lock.appVersion });
    assert.throws(() => requireCompatibleStatefulRelease(null, workload, claims, null, lock.appVersion), /STATEFUL_ORPHANED_PVC_RESTORE_REQUIRED/u);
    assert.deepEqual(requireCompatibleStatefulRelease(workload, workload, claims, lock.appVersion, lock.appVersion), { action: 'compatible-upgrade', version: lock.appVersion });
    assert.throws(() => requireCompatibleStatefulRelease(workload, workload, claims, '0.0.0', lock.appVersion), /STATEFUL_VERSION_MIGRATION_REQUIRED/u);
    const prior = structuredClone(workload); prior.spec.volumeClaimTemplates[0].spec.resources.requests.storage = '1Gi';
    assert.throws(() => requireCompatibleStatefulRelease(prior, workload, claims, lock.appVersion, lock.appVersion), /STATEFUL_STORAGE_MIGRATION_REQUIRED/u);
    const changed = structuredClone(bound); changed.find(value => value.kind === 'StatefulSet').spec.template.spec.containers[0].image = 'registry-1.docker.io/bitnami/redis:latest';
    assert.throws(() => bindInfrastructureImages(name, changed), /INFRASTRUCTURE_IMAGE_NOT_PINNED/u);
  });
}

test('Redis policy refuses a restart-based RDB-to-AOF conversion or implicit dedup eviction', () => {
  const policy = { appendonly: 'yes', appendfsync: 'always', 'no-appendfsync-on-rewrite': 'no', 'aof-load-truncated': 'no', 'maxmemory-policy': 'noeviction' };
  requireRedisAofPolicy(policy);
  for (const key of Object.keys(policy)) assert.throws(() => requireRedisAofPolicy({ ...policy, [key]: 'different' }), /REDIS_DURABILITY_MIGRATION_REQUIRED/u);
});
