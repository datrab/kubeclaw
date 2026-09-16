import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadAll } from 'js-yaml';
import { validateInfrastructureChartLock } from '../../../scripts/infrastructure-chart-lock.mjs';
import { infrastructureChart, verifyInfrastructureChart } from '../../../scripts/infrastructure-chart.mjs';
import { prepareInfrastructureRelease } from '../../../scripts/infrastructure-release.mjs';
import { bindInfrastructureImages } from '../../../scripts/infrastructure-image-renderer.mjs';

const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
const digestOnly = reference => reference.replace(/:[^:@]+@/, '@');
const render = (name, file, values) => loadAll(execFileSync(process.env.HELM ?? 'helm',
  ['template', name, file, '-f', values, '--namespace', 'example-project',
    '--post-renderer', path.resolve('scripts/infrastructure-image-renderer.mjs'),
    '--post-renderer-args', 'tailscale'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).filter(Boolean);

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
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-corruption-'));
  try {
    const file = path.join(temporary, 'wrong.tgz');
    const bytes = fs.readFileSync(archive); bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(file, bytes);
    assert.throws(() => verifyInfrastructureChart('tailscale', file), /DIGEST_MISMATCH/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  operator.env.push({ name: 'PROXY_IMAGE', value: 'unapproved:latest' });
  assert.throws(() => bindInfrastructureImages('tailscale', documents), /DUPLICATE_ENVIRONMENT/);
});

test('agent renders no retired vector database endpoint, health probe or Secret mount', () => {
  for (const role of ['nova', 'buster']) {
    const rendered = execFileSync(process.env.HELM ?? 'helm', ['template', `agent-${role}`, 'charts/kubeclaw',
      '-f', `my-values/${role}-values.yaml`, '--namespace', 'example-project',
      '--set', 'runtimeInfrastructure.registry.endpoint=https://registry.example.test',
      '--set', 'runtimeInfrastructure.registry.transport=https',
      '--set', 'runtimeInfrastructure.registry.authSecretName=registry-test'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.ok(loadAll(rendered).some(document => document?.kind === 'Deployment'));
    assert.doesNotMatch(rendered, /qdrant/i);
  }
});

test('chart authority refuses mutable versions, credential URLs and non-HTTPS sources', () => {
  const lock = infrastructureChart('tailscale');
  for (const change of [{ version: 'latest' }, { sha256: '' }, { url: 'http://example.test/chart.tgz' },
    { url: 'https://user:password@example.test/chart.tgz' }]) {
    assert.throws(() => validateInfrastructureChartLock({ ...lock, ...change }), /INFRASTRUCTURE_CHART_/);
  }
});
