import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import {platformServices} from '../../../scripts/platform-services.mjs';
const load = file => yaml.loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean);
const resources = load('gitops/platform/nova-argocd-access/resources.yaml');

test('Argo access registration survives regeneration and ignores only the operator CNAME', () => {
  const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
  const generated = platformServices(versions, 'https://github.com/datrab/kubeclaw.git').find(x => x.metadata.name === 'nova-argocd-access');
  const committed = load('gitops/platform/bootstrap/nova-argocd-access.yaml')[0];
  delete committed.metadata.annotations;
  assert.deepEqual(committed, generated);
  assert.equal(generated.spec.destination.namespace, 'kubeclaw');
  assert.deepEqual(generated.spec.syncPolicy.automated, {prune: false, selfHeal: true, allowEmpty: false});
  assert.deepEqual(generated.spec.ignoreDifferences, [{group: '', kind: 'Service', name: 'nova-argocd-egress', namespace: 'kubeclaw', jsonPointers: ['/spec/externalName']}]);
});
test('proxy forwards only the configured Argo HTTPS port, without injected credentials or RBAC', () => {
  assert.deepEqual(resources.map(x => x.kind), ['Service', 'CiliumNetworkPolicy']);
  const service = resources[0];
  assert.equal(service.metadata.annotations['tailscale.com/tailnet-fqdn'], 'argocd.tail576648.ts.net');
  assert.deepEqual(service.spec, {type: 'ExternalName', externalName: 'placeholder', ports: [{name: 'https', port: 443, protocol: 'TCP'}]});
  assert.ok(resources.every(x => x.metadata.namespace === 'kubeclaw'));
});
test('network allowance selects Nova and exact Argo/proxy identities, never namespace-wide egress', () => {
  const spec = resources[1].spec;
  assert.deepEqual(spec.endpointSelector.matchLabels, {'app.kubernetes.io/name': 'kubeclaw', 'app.kubernetes.io/instance': 'agent-nova', 'app.kubernetes.io/component': 'nova'});
  assert.deepEqual(spec.enableDefaultDeny, {egress: false});
  assert.equal(spec.egress.length, 2);
  const [internal, proxy] = spec.egress;
  assert.deepEqual(internal.toEndpoints, [{matchLabels: {'k8s:io.kubernetes.pod.namespace': 'argocd', 'app.kubernetes.io/name': 'argocd-server'}}]);
  assert.deepEqual(proxy.toEndpoints, [{matchLabels: {'k8s:io.kubernetes.pod.namespace': 'tailscale', 'tailscale.com/managed': 'true', 'tailscale.com/parent-resource': 'nova-argocd-egress', 'tailscale.com/parent-resource-ns': 'kubeclaw'}}]);
  assert.deepEqual(spec.egress.map(x => x.toPorts), [[{ports: [{port: '8080', protocol: 'TCP'}]}], [{ports: [{port: '443', protocol: 'TCP'}]}]]);
});
