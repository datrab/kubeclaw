import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import {provision, publicKey, repository} from '../../../gitops/platform/familyclaw-repository/provision-key.mjs';
import {platformServices} from '../../../scripts/platform-services.mjs';

const resources = yaml.loadAll(fs.readFileSync('gitops/platform/familyclaw-repository/resources.yaml', 'utf8'));
const seed = () => ({...structuredClone(resources[0]), metadata: {...resources[0].metadata, resourceVersion: '1'}});
test('provisioning emits only a public key and preserves the same private key on retries', async () => {
  const secret = seed();
  let patches = 0;
  const api = async (method, path, body) => {
    assert.equal(path, '/api/v1/namespaces/argocd/secrets/familyclaw-repository');
    if (method === 'GET') return structuredClone(secret);
    assert.equal(method, 'PATCH');
    assert.equal(body.metadata.resourceVersion, '1');
    assert.deepEqual(Object.keys(body.data), ['sshPrivateKey']);
    secret.data = {...secret.data, ...body.data};
    patches++;
    return structuredClone(secret);
  };
  const first = await provision(api);
  assert.match(first.publicKey, /^ssh-ed25519 [A-Za-z0-9+/]+=* familyclaw-argocd-readonly$/u);
  assert.equal(first.repository, repository);
  assert.equal(Buffer.from(first.publicKey.split(' ')[1], 'base64').length, 51);
  assert.match(first.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/u);
  const persisted = secret.data.sshPrivateKey;
  assert.deepEqual(await provision(api), first);
  assert.equal(patches, 1);
  assert.equal(secret.data.sshPrivateKey, persisted);
  assert.equal(JSON.stringify(first).includes(persisted), false);
  assert.equal(JSON.stringify(first).includes('PRIVATE'), false);
});
test('unexpected repository bindings or key types cannot silently replace credentials', async () => {
  const secret = seed();
  secret.data.url = Buffer.from('ssh://git@unrelated.invalid/repo').toString('base64');
  await assert.rejects(provision(async method => {
    assert.equal(method, 'GET');
    return secret;
  }), /binding mismatch/u);
  const rsa = generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey;
  assert.throws(() => publicKey(rsa), /Unexpected repository key type/u);
});
test('bootstrap permissions are confined to a single precreated repository Secret', () => {
  const role = resources.find(x => x.kind === 'Role');
  assert.deepEqual(role.rules, [{apiGroups: [''], resources: ['secrets'], resourceNames: ['familyclaw-repository'], verbs: ['get', 'patch']}]);
  assert.ok(resources.every(x => x.metadata.namespace === 'argocd'));
  assert.equal(resources[0].data.sshPrivateKey, undefined);
  const job = resources.find(x => x.kind === 'Job');
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(job.spec.template.spec.securityContext.runAsNonRoot, true);
});
test('GitOps regeneration preserves generated key data and leaves household workload sync manual', () => {
  const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
  const app = platformServices(versions, 'https://github.com/datrab/kubeclaw.git').find(x => x.metadata.name === 'familyclaw-repository');
  assert.deepEqual(app.spec.ignoreDifferences, [{group: '', kind: 'Secret', name: 'familyclaw-repository', namespace: 'argocd', jsonPointers: ['/data']}]);
  assert.ok(app.spec.syncPolicy.syncOptions.includes('RespectIgnoreDifferences=true'));
  const household = yaml.loadAll(fs.readFileSync('gitops/production/household-applications.yaml', 'utf8'));
  const workload = household.find(x => x.kind === 'Application');
  assert.equal(workload.spec.source.repoURL, repository);
  assert.equal(workload.spec.syncPolicy.automated, undefined);
  assert.ok(household.find(x => x.kind === 'AppProject').spec.sourceRepos.includes(repository));
});
