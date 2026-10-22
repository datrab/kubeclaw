import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseAllDocuments, parse } from 'yaml';
import { parsePolicy } from '../../../tools/ops-mcp/src/access-policy.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const resources = parseAllDocuments(execFileSync('helm', ['template', 'codex-ops', root + 'charts/ops-pod', '-n', 'kubeclaw-ops',
  '--set-string', 'codexImage=example/codex@sha256:' + 'a'.repeat(64), '--set-string', 'mcpImage=example/mcp@sha256:' + 'b'.repeat(64),
  '--set', 'networkPolicy.apiServerCIDRs[0]=10.0.0.1/32', '--set', 'networkPolicy.cilium=true'], { encoding: 'utf8' })).map(doc => {
  assert.deepEqual(doc.errors, []); return doc.toJSON();
}).filter(Boolean);

test('rendered MCP scope, dynamic backend, admission guard and network edge agree for all three clients', () => {
  const config = resources.find(x => x.kind === 'ConfigMap' && x.data['config.json'] && x.metadata.name.endsWith('-namespace-access'));
  const backend = JSON.parse(config.data['config.json']);
  assert.deepEqual(backend.prefixes, ['test']);
  assert.equal(backend.serviceAccount, 'codex-ops-mcp');
  const policy = JSON.parse(resources.find(x => x.kind === 'ConfigMap' && x.data['policy.json']).data['policy.json']);
  const clients = parsePolicy(JSON.stringify(policy), ['kubeclaw'], backend.prefixes, true);
  assert.deepEqual(clients.map(c => c.id), ['codex', 'nova', 'buster']);
  for (const client of clients) {
    assert.deepEqual(client.namespacePrefixes, ['test']);
    assert.ok(client.exec.some(g => g.namespacePrefix === 'test' && g.allPods && g.allContainers));
  }
  assert.deepEqual(clients.find(c => c.id === 'buster').namespaces, []);
  const guard = resources.find(x => x.kind === 'ValidatingAdmissionPolicy');
  const binding = resources.find(x => x.kind === 'ValidatingAdmissionPolicyBinding');
  assert.equal(guard.spec.failurePolicy, 'Fail');
  assert.deepEqual(binding.spec.validationActions, ['Deny']);
  assert.equal(binding.spec.policyName, guard.metadata.name);
  assert.equal(guard.metadata.annotations['argocd.argoproj.io/sync-wave'], '-3');
  const role = resources.find(x => x.kind === 'ClusterRole' && x.metadata.name.endsWith('-namespace-access'));
  assert.equal(role.metadata.annotations['argocd.argoproj.io/sync-wave'], '-2');
  assert.deepEqual(role.rules.find(x => x.verbs.includes('bind')).resourceNames, backend.roles);
  assert.ok(role.rules.every(x => !x.resources.some(r => ['pods', 'pods/exec', 'secrets', 'serviceaccounts/token', 'clusterrolebindings'].includes(r))));
  const deployment = resources.find(x => x.kind === 'Deployment' && x.metadata.name.endsWith('-namespace-access')).spec.template.spec;
  assert.equal(deployment.serviceAccountName, role.metadata.name);
  assert.equal(deployment.automountServiceAccountToken, false);
  assert.ok(deployment.volumes.every(x => !x.secret));
  const cilium = resources.find(x => x.kind === 'CiliumNetworkPolicy');
  assert.ok(cilium.spec.endpointSelector.matchExpressions[0].values.includes(role.metadata.name));
  const edge = resources.find(x => x.kind === 'NetworkPolicy' && x.metadata.name.endsWith('-client-buster'));
  assert.deepEqual(edge.spec.podSelector.matchLabels, { 'app.kubernetes.io/instance': 'agent-buster' });
  assert.equal(edge.metadata.namespace, 'kubeclaw');
});


test('production Ops retains its platform read scopes and all clients receive test access', () => {
  const values = parse(readFileSync(root + 'gitops/platform/values/codex-ops.yaml', 'utf8'));
  const clients = parsePolicy(JSON.stringify({clients: values.mcp.clients.map(c => ({...c, tokenFile: '/token/'+c.id}))}), values.rbac.namespaces, ['test'], values.rbac.readAllNamespaces);
  assert.deepEqual(clients[0].namespaces, values.rbac.namespaces);
  assert.ok(clients[0].tools.includes('list_argocd_applications'));
  assert.deepEqual(clients.find(c => c.id === 'buster').namespaces, []);
  assert.ok(clients.every(c => c.namespacePrefixes.includes('test')));
});


test('global observer binding grants only MCP reads and cannot introduce cluster-wide exec', () => {
  const binding = resources.find(x => x.kind === 'ClusterRoleBinding' && x.metadata.name.endsWith('-all-namespace-reader'));
  assert.deepEqual(binding.subjects, [{ kind: 'ServiceAccount', name: 'codex-ops-mcp', namespace: 'kubeclaw-ops' }]);
  const role = resources.find(x => x.kind === 'ClusterRole' && x.metadata.name === binding.roleRef.name);
  assert.ok(role.rules.every(rule => rule.verbs.every(verb => ['get', 'list'].includes(verb))));
  assert.ok(role.rules.every(rule => !rule.resources.some(resource => ['secrets', 'pods/exec', 'pods/portforward', '*'].includes(resource))));
  assert.ok(resources.filter(x => x.kind === 'ClusterRoleBinding').every(x => !x.roleRef.name.endsWith('-test-exec') && !x.roleRef.name.endsWith('-exec')));
  const policy = JSON.parse(resources.find(x => x.kind === 'ConfigMap' && x.data['policy.json']).data['policy.json']);
  assert.deepEqual(policy.clients.filter(c => c.readAllNamespaces).map(c => c.id), ['codex']);
  assert.ok(policy.clients.find(c => c.id === 'codex').tools.includes('platform_cluster_state'));
});
