import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';

const configured = {
  enabled: true, issuer: 'prism:product-test', operators: ['user-0123456789abcdef01234567'],
  origin: 'https://studio.example.test', authorityRevision: 'test-key-1',
  signingSecretName: 'product-signing-test', signingSecretKey: 'private-key.pem',
  controllerUrl: 'https://controller.example.test:8443', controllerNamespace: 'workers',
  controllerRelease: 'buster-test', controllerCaSecretName: 'controller-ca-test',
  controllerCaSecretKey: 'ca.crt', tokenAudience: 'product-test', tokenExpirationSeconds: 600,
};
function render(config, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-chart-'));
  try {
    const file = path.join(root, 'values.yaml');
    fs.writeFileSync(file, yaml.dump({ control: { productDecisions: config }, ...extra }));
    return spawnSync('helm', ['template', 'prism-test', 'charts/prism', '--namespace', 'prism-test',
      '-f', 'charts/prism/ci-values.yaml', '-f', file], { encoding: 'utf8' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return yaml.loadAll(result.stdout).filter(Boolean);
}
function role(docs, name) { return docs.find(doc => doc.kind === 'Deployment' && doc.metadata.name === `prism-${name}`); }

test('disabled product authority creates no key mount, audience token, environment or network access', () => {
  const docs = success(render({ enabled: false }));
  for (const name of ['control', 'studio', 'worker']) {
    const pod = role(docs, name).spec.template.spec;
    assert.equal(pod.automountServiceAccountToken, false);
    assert(!pod.volumes.some(volume => volume.name.startsWith('product-decision')));
    assert(!pod.containers.flatMap(container => container.env ?? []).some(item => item.name.startsWith('PRISM_PRODUCT_')));
  }
  assert(!docs.some(doc => doc.metadata.name === 'prism-product-decisions'));
});

test('explicit product authority belongs only to Control and uses separate signing and scoped transport', () => {
  const docs = success(render(configured));
  const control = role(docs, 'control');
  const pod = control.spec.template.spec;
  assert.equal(pod.serviceAccountName, 'prism-control');
  assert.equal(pod.automountServiceAccountToken, false);
  const env = Object.fromEntries(pod.containers[0].env.map(item => [item.name, item.value]));
  assert.equal(env.PRISM_PRODUCT_ISSUER, configured.issuer);
  assert.deepEqual(JSON.parse(env.PRISM_PRODUCT_OPERATORS), configured.operators);
  assert.equal(env.PRISM_PRODUCT_CONTROLLER_URL, configured.controllerUrl);
  const signing = pod.volumes.find(volume => volume.name === 'product-decision-signing');
  assert.equal(signing.secret.secretName, configured.signingSecretName);
  assert.equal(signing.secret.defaultMode, 0o440);
  const transport = pod.volumes.find(volume => volume.name === 'product-decision-controller');
  assert.equal(transport.projected.sources[0].secret.name, configured.controllerCaSecretName);
  assert.deepEqual(transport.projected.sources[1].serviceAccountToken,
    { audience: configured.tokenAudience, expirationSeconds: 600, path: 'token' });
  const access = docs.find(doc => doc.metadata.name === 'prism-product-decisions').spec;
  assert.deepEqual(access.podSelector.matchLabels, { app: 'prism-control' });
  assert.deepEqual(access.egress[0].to[0].namespaceSelector.matchLabels, { 'kubernetes.io/metadata.name': 'workers' });
  assert.equal(access.egress[0].to[0].podSelector.matchLabels['app.kubernetes.io/instance'], 'buster-test');
  assert.deepEqual(access.egress[0].ports, [{ protocol: 'TCP', port: 8443 }]);
  for (const name of ['studio', 'worker']) {
    assert(!role(docs, name).spec.template.spec.volumes.some(volume => volume.name.startsWith('product-decision')));
  }
  const rotated = role(success(render({ ...configured, authorityRevision: 'test-key-2' })), 'control');
  assert.notEqual(control.spec.template.metadata.annotations['checksum/product-decisions'],
    rotated.spec.template.metadata.annotations['checksum/product-decisions']);
  const withTrust = role(success(render(configured, { workerTrust: { spiffe: { enabled: true } } })), 'control');
  assert(withTrust.spec.template.metadata.annotations['checksum/worker-trust']);
  assert(withTrust.spec.template.metadata.annotations['checksum/product-decisions']);
});

test('incomplete or ambiguous product authority fails actual Helm validation', () => {
  const invalid = [{ enabled: true }, { ...configured, operators: [] },
    { ...configured, operators: ['same', 'same'] }, { ...configured, operators: [' padded '] },
    { ...configured, signingSecretName: 'prism-runtime' }, { ...configured, tokenAudience: '' },
    { ...configured, controllerNamespace: '' }, { ...configured, tokenExpirationSeconds: 0 },
    { ...configured, controllerUrl: 'http://controller.example.test' },
    { ...configured, controllerUrl: 'https://controller.example.test:9443' },
    { ...configured, controllerUrl: 'https://controller.example.test/path' },
    { ...configured, origin: 'https://user:password@studio.example.test' },
    { ...configured, origin: 'https://studio.example.test#fragment' }];
  for (const value of invalid) assert.notEqual(render(value).status, 0, JSON.stringify(value));
  assert.notEqual(render(configured, { tailscale: { enabled: false } }).status, 0);
});
