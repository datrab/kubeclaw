#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '..');
const read = file => yaml.load(fs.readFileSync(path.join(root, file), 'utf8'));
const objects = new Set();
const renders = {};
const clusterKinds = new Set(['Namespace', 'ClusterRole', 'ClusterRoleBinding', 'CustomResourceDefinition', 'CSIDriver', 'ClusterSPIFFEID', 'ValidatingWebhookConfiguration']);
for (const name of ['spire-crds', 'spire', 'csi-driver-smb', 'litellm']) {
  const app = read(`gitops/platform/bootstrap/${name}.yaml`);
  assert.equal(app.spec.syncPolicy.automated, undefined);
  assert.equal(app.metadata.finalizers, undefined);
  assert.ok(app.spec.syncPolicy.syncOptions.includes('FailOnSharedResource=true'));
  const project = read(`gitops/platform/bootstrap/${app.spec.project}-project.yaml`);
  let content;
  if (name === 'litellm') content = fs.readFileSync(path.join(root, 'gitops/platform/litellm/resources.yaml'), 'utf8');
  else {
    const source = app.spec.sources[0];
    assert.ok(project.spec.sourceRepos.includes(source.repoURL));
    assert.ok(app.spec.syncPolicy.syncOptions.includes('ServerSideApply=true'));
    content = process.env.PLATFORM_RENDER_DIR
      ? fs.readFileSync(path.join(process.env.PLATFORM_RENDER_DIR, `${name}-render.yaml`), 'utf8')
      : execFileSync(process.env.HELM_BIN ?? 'helm', ['template', name, source.chart, '--repo', source.repoURL,
        '--version', source.targetRevision, '--namespace', app.spec.destination.namespace,
        '--include-crds', '--skip-tests', '--kube-version', '1.36.4', '-f', path.join(root, source.helm.valueFiles[0].replace('$values/', ''))],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 180000 });
  }
  renders[name] = yaml.loadAll(content).filter(Boolean);
  for (const doc of renders[name]) {
    assert.ok(!doc.metadata.annotations?.['helm.sh/hook'], 'Helm lifecycle jobs must not run during adoption');
    assert.notEqual(doc.kind, 'Secret', 'Existing credentials remain externally managed');
    const group = doc.apiVersion.includes('/') ? doc.apiVersion.split('/')[0] : '';
    const namespace = clusterKinds.has(doc.kind) ? '' : doc.metadata.namespace ?? app.spec.destination.namespace;
    if (clusterKinds.has(doc.kind)) assert.ok(project.spec.clusterResourceWhitelist.some(rule => rule.kind === doc.kind && rule.group === group), `Project denies ${doc.kind}`);
    else assert.ok(project.spec.destinations.some(d => d.namespace === namespace));
    const key = [group, doc.kind, namespace, doc.metadata.name].join('/');
    assert.ok(!objects.has(key), `Duplicate ownership: ${key}`);
    objects.add(key);
  }
}
const find = (app, kind, name) => {
  const result = renders[app].find(d => d.kind === kind && d.metadata.name === name);
  assert.ok(result, `Missing ${app}: ${kind}/${name}`);
  return result;
};
const stateful = find('spire', 'StatefulSet', 'spire-server');
assert.equal(stateful.spec.volumeClaimTemplates[0].metadata.name, 'spire-data');
assert.equal(stateful.spec.volumeClaimTemplates[0].spec.resources.requests.storage, '1Gi');
assert.notEqual(stateful.spec.persistentVolumeClaimRetentionPolicy?.whenDeleted, 'Delete');
assert.equal(renders['spire-crds'].filter(d => d.kind === 'CustomResourceDefinition').length, 3);
find('spire', 'CSIDriver', 'csi.spiffe.io');
find('csi-driver-smb', 'CSIDriver', 'smb.csi.k8s.io');
assert.equal(find('csi-driver-smb', 'Deployment', 'csi-smb-controller').spec.replicas, 1);
const spireApp = read('gitops/platform/bootstrap/spire.yaml');
assert.ok(spireApp.spec.syncPolicy.syncOptions.includes('RespectIgnoreDifferences=true'));
assert.deepEqual(spireApp.spec.ignoreDifferences[0].jqPathExpressions, ['.webhooks[]?.clientConfig.caBundle', '.webhooks[]?.failurePolicy']);
const litellm = find('litellm', 'Deployment', 'litellm').spec;
assert.equal(litellm.strategy.type, 'Recreate');
assert.equal(litellm.template.spec.volumes.find(v => v.name === 'config').configMap.name, 'litellm-config');
assert.equal(find('litellm', 'Service', 'litellm').spec.ports[0].nodePort, 30050);
assert.equal(renders.litellm.length, 2, 'Do not adopt or replace the live ConfigMap');
assert.match(litellm.template.spec.containers[0].image, /@sha256:[a-f0-9]{64}$/);
console.log(`PASS: ${objects.size} platform resources, separate ownership, manual sync, storage and external credentials preserved.`);
