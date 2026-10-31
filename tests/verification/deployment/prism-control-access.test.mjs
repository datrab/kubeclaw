import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
import {appendPrismControlAccess} from '../../../scripts/gitops-continuous.mjs';
const config = JSON.parse(fs.readFileSync('gitops/production/config.json'));
const repository = 'https://github.com/datrab/kubeclaw.git';
test('production grants only Nova to same-namespace Control mTLS', () => {
  const docs = yaml.loadAll(fs.readFileSync('gitops/production/prism-control-access/resources.yaml', 'utf8')).filter(Boolean);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].kind, 'NetworkPolicy');
  assert.equal(docs[0].metadata.namespace, config.namespace);
  assert.deepEqual(docs[0].spec, {
    podSelector: {matchLabels: {'app.kubernetes.io/name': 'kubeclaw', 'app.kubernetes.io/instance': 'agent-nova', 'app.kubernetes.io/component': 'nova'}},
    policyTypes: ['Egress'], egress: [{to: [{podSelector: {matchLabels: {app: 'prism-control'}}}], ports: [{protocol: 'TCP', port: 8443}]}],
  });
});
test('network-only application is opt-in, non-pruning and retained by production generation', () => {
  assert.deepEqual(appendPrismControlAccess([], {...config, prismControlAccess: false}, repository), []);
  assert.throws(() => appendPrismControlAccess([], {...config, namespace: 'other'}, repository), /NAMESPACE_MISMATCH/);
  const [app] = appendPrismControlAccess([], config, repository);
  assert.equal(app.spec.project, config.naming.workloadProject);
  assert.deepEqual(app.metadata.annotations, {'kubeclaw.io/health-mode':'observed'});
  const runtimeApps=yaml.loadAll(fs.readFileSync('gitops/production/apps/applications.yaml','utf8')).filter(x=>['kubeclaw-nova','kubeclaw-prism','kubeclaw-buster'].includes(x?.metadata?.name));
  assert.equal(runtimeApps.length,3);
  for(const runtime of runtimeApps)assert.notEqual(runtime.metadata.annotations?.['kubeclaw.io/health-mode'],'observed');
  assert.equal(app.spec.source.path, 'gitops/production/prism-control-access');
  assert.equal(app.spec.source.repoURL, repository);
  assert.deepEqual(app.spec.syncPolicy.automated, {prune: false, selfHeal: true, allowEmpty: false});
  const saved = yaml.loadAll(fs.readFileSync('gitops/production/apps/applications.yaml', 'utf8')).find(x => x?.metadata?.name === app.metadata.name);
  assert.deepEqual(saved, app);
});
test('access selectors and port match the actually selected immutable workloads', () => {
  const {directory} = JSON.parse(fs.readFileSync('gitops/production/selection.json'));
  const read = role => yaml.loadAll(fs.readFileSync(`${directory}/${role}/resources.yaml`, 'utf8')).filter(Boolean);
  const [policy] = yaml.loadAll(fs.readFileSync('gitops/production/prism-control-access/resources.yaml', 'utf8')).filter(Boolean);
  const nova = read('nova').find(d => d.kind === 'Deployment' && d.metadata.name === 'agent-nova');
  for (const [key, value] of Object.entries(policy.spec.podSelector.matchLabels)) assert.equal(nova.spec.template.metadata.labels[key], value);
  const control = read('prism').find(d => d.kind === 'Deployment' && d.metadata.name === 'prism-control');
  const service = read('prism').find(d => d.kind === 'Service' && d.metadata.name === 'prism-control-internal');
  for (const [key, value] of Object.entries(policy.spec.egress[0].to[0].podSelector.matchLabels)) assert.equal(control.spec.template.metadata.labels[key], value);
  const port = control.spec.template.spec.containers.flatMap(c => c.ports ?? []).find(p => p.name === service.spec.ports[0].targetPort);
  assert.equal(policy.spec.egress[0].ports[0].port, port.containerPort);
});
