import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { loadAll } from 'js-yaml';
import { infrastructureChart, verifyInfrastructureChart } from './infrastructure-chart.mjs';
import { bindInfrastructureImages } from './infrastructure-image-renderer.mjs';
import { renderInfrastructureChart } from './infrastructure-release.mjs';

function immutableSpec(workload) {
  const spec = workload.spec;
  return { selector: spec.selector, serviceName: spec.serviceName,
    podManagementPolicy: spec.podManagementPolicy ?? 'OrderedReady',
    claims: (spec.volumeClaimTemplates ?? []).map(claim => ({ name: claim.metadata.name, spec: {
      ...claim.spec, volumeMode: claim.spec.volumeMode ?? 'Filesystem', storageClassName: claim.spec.storageClassName ?? null,
    } })) };
}

function requireMountedClaims(desired, claims) {
  for (const volume of desired.spec.template.spec.volumes ?? []) {
    const name = volume.persistentVolumeClaim?.claimName;
    if (name && !claims.some(claim => claim.metadata.name === name && claim.status?.phase === 'Bound')) {
      throw new Error('STATEFUL_BOUND_PVC_REQUIRED');
    }
  }
}

export function requireCompatibleStatefulRelease(existing, desired, claims, actualVersion, expectedVersion) {
  if (!desired || desired.kind !== 'StatefulSet') throw new Error('STATEFUL_DESIRED_WORKLOAD_REQUIRED');
  if (!existing) {
    if (claims.length) throw new Error('STATEFUL_ORPHANED_PVC_RESTORE_REQUIRED');
    return { action: 'fresh-install', version: expectedVersion };
  }
  if (!isDeepStrictEqual(immutableSpec(existing), immutableSpec(desired))) {
    throw new Error('STATEFUL_STORAGE_MIGRATION_REQUIRED: immutable templates differ; preserve existing PVCs');
  }
  if (actualVersion !== expectedVersion) throw new Error('STATEFUL_VERSION_MIGRATION_REQUIRED: back up, restore into fresh compatible storage and verify before switching clients');
  const desiredClaims = desired.spec.volumeClaimTemplates ?? [];
  requireMountedClaims(desired, claims);
  for (const claim of desiredClaims) {
    const name = `${claim.metadata.name}-${desired.metadata.name}-0`;
    const actual = claims.find(value => value.metadata.name === name);
    if (!actual || actual.status?.phase !== 'Bound') throw new Error('STATEFUL_BOUND_PVC_REQUIRED');
    if (actual.spec.resources.requests.storage !== claim.spec.resources.requests.storage) throw new Error('STATEFUL_PVC_CAPACITY_MIGRATION_REQUIRED');
  }
  return { action: 'compatible-upgrade', version: actualVersion };
}

export function requireRedisAofPolicy(configuration) {
  const expected = { appendonly: 'yes', appendfsync: 'always', 'no-appendfsync-on-rewrite': 'no',
    'aof-load-truncated': 'no', 'maxmemory-policy': 'noeviction' };
  for (const [name, value] of Object.entries(expected)) {
    if (configuration[name] !== value) throw new Error(`REDIS_DURABILITY_MIGRATION_REQUIRED:${name}`);
  }
}

function kube(namespace, args) {
  return execFileSync('kubectl', ['-n', namespace, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function runtimeVersion(name, namespace, workload) {
  const target = `statefulset/${workload}`;
  if (name === 'postgresql') {
    const version = kube(namespace, ['exec', target, '--', 'postgres', '--version']).match(/PostgreSQL\) (\d+\.\d+)/)?.[1];
    return version ? `${version}.0` : null;
  }
  const password = 'if [ -n "${REDIS_PASSWORD_FILE:-}" ]; then REDISCLI_AUTH="$(cat "$REDIS_PASSWORD_FILE")"; else REDISCLI_AUTH="${REDIS_PASSWORD:-}"; fi; export REDISCLI_AUTH; ';
  const config = JSON.parse(kube(namespace, ['exec', target, '--', '/bin/sh', '-c', password
    + 'exec redis-cli --json CONFIG GET appendonly appendfsync no-appendfsync-on-rewrite aof-load-truncated maxmemory-policy']));
  requireRedisAofPolicy(config);
  return kube(namespace, ['exec', target, '--', 'redis-server', '--version']).match(/\bv=(\d+\.\d+\.\d+)\b/)?.[1] ?? null;
}

export function preflightStatefulRelease(name, namespace, archive, values, helm = 'helm', release = name) {
  if (!['redis', 'postgresql'].includes(name) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(namespace)) throw new Error('STATEFUL_PREFLIGHT_IDENTITY_INVALID');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,51}[a-z0-9])?$/.test(release)) throw new Error('STATEFUL_PREFLIGHT_RELEASE_INVALID');
  verifyInfrastructureChart(name, archive);
  const desired = bindInfrastructureImages(name, loadAll(renderInfrastructureChart(name, release, namespace, archive, values, helm, true))
    .filter(Boolean)).find(value => value.kind === 'StatefulSet');
  if (!desired) throw new Error('STATEFUL_DESIRED_WORKLOAD_REQUIRED');
  const prior = kube(namespace, ['get', 'statefulset', desired.metadata.name, '--ignore-not-found', '-o', 'json']);
  const existing = prior.trim() ? JSON.parse(prior) : null;
  const prefixes = (desired.spec.volumeClaimTemplates ?? []).map(claim => `${claim.metadata.name}-${desired.metadata.name}-`);
  const namedClaims = (desired.spec.template.spec.volumes ?? []).map(volume => volume.persistentVolumeClaim?.claimName).filter(Boolean);
  const claims = JSON.parse(kube(namespace, ['get', 'pvc', '-o', 'json'])).items.filter(claim =>
    namedClaims.includes(claim.metadata.name) || claim.metadata.labels?.['app.kubernetes.io/instance'] === release
      || prefixes.some(prefix => claim.metadata.name.startsWith(prefix)));
  const version = existing ? runtimeVersion(name, namespace, desired.metadata.name) : null;
  return requireCompatibleStatefulRelease(existing, desired, claims, version, infrastructureChart(name).appVersion);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (![6, 7].includes(process.argv.length)) throw new Error('Usage: stateful-release-preflight.mjs PROFILE NAMESPACE VERIFIED_CHART VALUES [RELEASE]');
  const [name, namespace, archive, values, release] = process.argv.slice(2);
  console.log(JSON.stringify(preflightStatefulRelease(name, namespace, archive, values, 'helm', release ?? name)));
}
