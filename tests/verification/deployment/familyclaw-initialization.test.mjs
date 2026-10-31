import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import {platformServices} from '../../../scripts/platform-services.mjs';
import {requestHouseholdSync} from '../../../gitops/platform/familyclaw-initialization/argo-sync.mjs';

const resources = yaml.loadAll(fs.readFileSync('gitops/platform/familyclaw-initialization/resources.yaml', 'utf8'));
test('a superseded in-progress sync is terminated before requesting the fixed revision without prune', async () => {
  const patches = [];
  let reads = 0;
  const run = args => {
    if (args.includes('get')) return JSON.stringify(++reads < 3
      ? {operation: {sync: {revision: 'old'}}, status: {operationState: {phase: reads === 1 ? 'Running' : 'Terminating'}}}
      : {status: {operationState: {phase: 'Failed'}}});
    patches.push(JSON.parse(args.at(-1)));
    return '';
  };
  const result = await requestHouseholdSync('new', run, async () => {});
  assert.deepEqual(patches[0], {status: {operationState: {phase: 'Terminating'}}});
  assert.equal(patches[1].operation.sync.revision, 'new');
  assert.equal(patches[1].operation.sync.prune, false);
  assert.equal(patches[1].operation.retry.limit, 0);
  assert.equal(result.argoSyncRequested, true);
});
test('a current revision is left running and failed termination cannot overwrite an operation', async () => {
  let patches = 0;
  const same = args => {
    assert.ok(args.includes('get'));
    return JSON.stringify({operation: {sync: {revision: 'new'}}});
  };
  assert.equal((await requestHouseholdSync('new', same, async () => {})).alreadyInProgress, true);
  const stuck = args => {
    if (args.includes('get')) return JSON.stringify({operation: {sync: {revision: 'old'}}});
    patches++;
    return '';
  };
  await assert.rejects(requestHouseholdSync('new', stuck, async () => {}), /did not terminate/u);
  assert.equal(patches, 1);
});
test('household bootstrap can create but cannot overwrite or delete family credentials', () => {
  const roles = resources.filter(x => x.kind === 'Role');
  const household = roles.find(x => x.metadata.namespace === 'familyclaw');
  assert.deepEqual(household.rules, [
    {apiGroups: [''], resources: ['secrets', 'configmaps', 'persistentvolumeclaims'], verbs: ['get']},
    {apiGroups: [''], resources: ['secrets', 'configmaps'], verbs: ['create']},
  ]);
  const argo = roles.find(x => x.metadata.namespace === 'argocd');
  assert.deepEqual(argo.rules, [
    {apiGroups: ['argoproj.io'], resources: ['applications'], resourceNames: ['familyclaw'], verbs: ['get', 'patch']},
    {apiGroups: [''], resources: ['secrets'], resourceNames: ['familyclaw-repository'], verbs: ['get']},
    {apiGroups: [''], resources: ['configmaps'], resourceNames: ['argocd-ssh-known-hosts-cm'], verbs: ['get']},
  ]);
  const bindings = resources.filter(x => x.kind === 'RoleBinding');
  assert.ok(bindings.every(x => x.subjects.length === 1 && x.subjects[0].name === 'familyclaw-initialization'));
  assert.ok(!resources.some(x => x.kind === 'Secret' || x.kind === 'ClusterRole'));
});
test('namespace retention, a bounded nonroot bootstrap, and narrow Argo project are preserved', () => {
  const namespace = resources.find(x => x.kind === 'Namespace');
  assert.equal(namespace.metadata.name, 'familyclaw');
  assert.equal(namespace.metadata.annotations['argocd.argoproj.io/sync-options'], 'Prune=false,Delete=false');
  const job = resources.find(x => x.kind === 'Job');
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(job.spec.activeDeadlineSeconds, 1800);
  assert.equal(job.spec.template.spec.securityContext.runAsNonRoot, true);
  assert.equal(job.metadata.namespace, 'kubeclaw-ops');
  assert.deepEqual(job.spec.template.spec.imagePullSecrets, [{name: 'ghcr-secret'}]);
  const objects = platformServices(JSON.parse(fs.readFileSync('versions.json', 'utf8')), 'https://github.com/datrab/kubeclaw.git');
  const project = objects.find(x => x.kind === 'AppProject' && x.metadata.name === 'familyclaw-initialization');
  assert.deepEqual(project.spec.clusterResourceWhitelist, [{group: '', kind: 'Namespace'}]);
  assert.ok(!project.spec.namespaceResourceWhitelist.some(x => x.kind === 'Secret' || x.kind === '*'));
});
