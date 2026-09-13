import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadAll } from 'js-yaml';
import { infrastructureChart, verifyInfrastructureChart,
  validateInfrastructureChartLock } from '../../../scripts/infrastructure-chart.mjs';
import { prepareInfrastructureRelease } from '../../../scripts/infrastructure-release.mjs';
import { bindInfrastructureImages } from '../../../scripts/infrastructure-image-renderer.mjs';
import { requireCompatibleQdrantClaims } from '../../../scripts/qdrant-storage-preflight.mjs';

const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
const digestOnly = reference => reference.replace(/:[^:@]+@/, '@');
const render = (name, file, values) => loadAll(execFileSync(process.env.HELM ?? 'helm',
  ['template', name, file, '-f', values, '--namespace', 'example-project',
    '--post-renderer', path.resolve('scripts/infrastructure-image-renderer.mjs'),
    '--post-renderer-args', name === 'qdrant' ? 'qdrant' : 'tailscale'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).filter(Boolean);

test('actual checked Tailscale archive renders pinned operator and proxy images', () => {
  const archive = prepareInfrastructureRelease('tailscale', 'tailscale-operator', 'example-project',
    'my-values/infra/tailscale-operator-values.yaml', process.env.HELM ?? 'helm');
  assert.equal(verifyInfrastructureChart('tailscale', archive).version, versions.infrastructureCharts.tailscale.version);
  const documents = render('tailscale-operator', archive, 'my-values/infra/tailscale-operator-values.yaml');
  const operator = documents.find(item => item.kind === 'Deployment').spec.template.spec.containers[0];
  assert.equal(operator.image, digestOnly(versions.infrastructure.tailscaleOperator));
  assert.equal(operator.env.find(item => item.name === 'PROXY_IMAGE').value, digestOnly(versions.infrastructure.tailscaleProxy));
  assert.equal(documents.some(item => item.kind === 'Secret' && item.metadata.name === 'operator-oauth'), false,
    'external credentials must not become generated or embedded chart data');
  operator.env.push({ name: 'PROXY_IMAGE', value: 'unapproved:latest' });
  assert.throws(() => bindInfrastructureImages('tailscale', documents), /DUPLICATE_ENVIRONMENT/);
});

test('actual checked Qdrant archive pins both data workload images and rejects archive corruption', () => {
  const archive = prepareInfrastructureRelease('qdrant', 'qdrant', 'example-project',
    'my-values/infra/qdrant-values.yaml', process.env.HELM ?? 'helm');
  const documents = render('qdrant', archive, 'my-values/infra/qdrant-values.yaml');
  const pod = documents.find(item => item.kind === 'StatefulSet').spec.template.spec;
  for (const container of [...pod.initContainers, ...pod.containers]) assert.equal(container.image, versions.infrastructure.qdrant);
  const server = pod.containers.find(item => item.name === 'qdrant');
  assert.equal(server.readinessProbe.httpGet.scheme, 'HTTPS');
  assert.deepEqual(server.env.find(value => value.name === 'QDRANT__SERVICE__API_KEY').valueFrom.secretKeyRef,
    { name: 'qdrant-auth', key: 'api-key' });
  assert.deepEqual(server.env.find(value => value.name === 'QDRANT__SERVICE__READ_ONLY_API_KEY').valueFrom.secretKeyRef,
    { name: 'qdrant-auth', key: 'read-only-api-key' });
  assert.equal(pod.volumes.find(value => value.name === 'qdrant-tls').secret.secretName, 'qdrant-tls');
  const claims = documents.find(item => item.kind === 'StatefulSet').spec.volumeClaimTemplates;
  assert.ok(claims.some(value => value.spec.resources.requests.storage === '30Gi'));
  const desired = documents.find(value => value.kind === 'StatefulSet');
  const prior = loadAll(execFileSync(process.env.HELM ?? 'helm', ['template', 'qdrant', archive,
    '-f', 'my-values/infra/qdrant-values.yaml', '--set', 'snapshotPersistence.enabled=false'], { encoding: 'utf8' }))
    .find(value => value?.kind === 'StatefulSet');
  assert.throws(() => requireCompatibleQdrantClaims(prior, desired), /QDRANT_STORAGE_MIGRATION_REQUIRED/);
  requireCompatibleQdrantClaims(desired, desired);
  requireCompatibleQdrantClaims(null, desired);
  const hook = documents.find(item => item.kind === 'Pod' && item.metadata.annotations['helm.sh/hook'] === 'test');
  assert.equal(hook.spec.containers[0].image, versions.infrastructure.qdrantTest);
  pod.containers[0].image = 'docker.io/foreign/qdrant@sha256:' + 'b'.repeat(64);
  assert.throws(() => bindInfrastructureImages('qdrant', documents), /QDRANT_IMAGE_OVERRIDE/);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-corruption-'));
  try {
    const file = path.join(temporary, 'wrong.tgz');
    const bytes = fs.readFileSync(archive); bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(file, bytes);
    assert.throws(() => verifyInfrastructureChart('qdrant', file), /DIGEST_MISMATCH/);
    assert.throws(() => verifyInfrastructureChart('tailscale', archive), /DIGEST_MISMATCH/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('actual agent render gives Qdrant health only read credentials and the CA in the release namespace', () => {
  const manifests = loadAll(execFileSync(process.env.HELM ?? 'helm', ['template', 'agent-nova', 'charts/kubeclaw',
    '-f', 'my-values/nova-values.yaml', '--namespace', 'example-project', '--set', 'probes.dependencies.qdrant.enabled=true'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).filter(Boolean);
  const pod = manifests.find(value => value.kind === 'Deployment').spec.template.spec;
  assert.deepEqual(pod.volumes.find(value => value.name === 'qdrant-client-auth').secret.items,
    [{ key: 'read-only-api-key', path: 'api-key' }]);
  assert.deepEqual(pod.volumes.find(value => value.name === 'qdrant-client-ca').secret.items, [{ key: 'ca.crt', path: 'ca.crt' }]);
  const client = pod.containers.find(value => value.env?.some(entry => entry.name === 'QDRANT_URL'));
  assert.equal(client.env.find(value => value.name === 'QDRANT_URL').value, 'https://qdrant.example-project.svc.cluster.local:6333');
  for (const name of ['qdrant-client-auth', 'qdrant-client-ca']) {
    const mount = client.volumeMounts.find(value => value.name === name);
    assert.equal(mount.readOnly, true); assert.equal(mount.subPath, undefined);
  }
});

test('chart authority refuses mutable versions, credential URLs and non-HTTPS sources', () => {
  const lock = infrastructureChart('qdrant');
  for (const change of [{ version: 'latest' }, { sha256: '' }, { url: 'http://example.test/chart.tgz' },
    { url: 'https://user:password@example.test/chart.tgz' }]) {
    assert.throws(() => validateInfrastructureChartLock({ ...lock, ...change }), /INFRASTRUCTURE_CHART_/);
  }
});
