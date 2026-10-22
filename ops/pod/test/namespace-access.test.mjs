import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';
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
  const clients = parsePolicy(JSON.stringify(policy), ['kubeclaw'], backend.prefixes);
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
