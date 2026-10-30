import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseAllDocuments, parse } from 'yaml';
import { parsePolicy, authorizeTool, authorizeExec } from '../../../tools/ops-mcp/src/access-policy.mjs';

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
  const clients = parsePolicy(JSON.stringify(policy), ['kubeclaw'], backend.prefixes, true, backend.allNonSystemNamespaces);
  assert.deepEqual(clients.map(c => c.id), ['codex', 'nova', 'buster']);
  for (const client of clients) {
    assert.deepEqual(client.namespacePrefixes, ['test']);
    if (client.id === 'codex') {
      assert.equal(client.readOnly, true);
      assert.deepEqual(client.exec, []);
      assert.ok(!client.tools.includes('exec_pod'));
    } else assert.ok(client.exec.some(g => g.namespacePrefix === 'test' && g.allPods && g.allContainers));
  }
  assert.deepEqual(clients.find(c => c.id === 'buster').namespaces, []);
  const guard = resources.find(x => x.kind === 'ValidatingAdmissionPolicy');
  const binding = resources.find(x => x.kind === 'ValidatingAdmissionPolicyBinding');
  assert.equal(backend.allNonSystemNamespaces, true);
  assert.equal(guard.spec.validations[0].expression, "!request.namespace.startsWith('kube-')");
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
  const clients = parsePolicy(JSON.stringify({clients: values.mcp.clients.map(c => ({...c, tokenFile: '/token/'+c.id}))}), values.rbac.namespaces, ['test'], values.rbac.readAllNamespaces, values.rbac.execAllNonSystemNamespaces);
  assert.deepEqual(clients[0].namespaces, values.rbac.namespaces);
  assert.ok(clients[0].tools.includes('list_argocd_applications'));
  assert.deepEqual(clients.find(c => c.id === 'buster').namespaces, []);
  assert.ok(clients.every(c => c.namespacePrefixes.includes('test')));
  const nova = clients.find(c => c.id === 'nova');
  const pod = { spec: { containers: [{ name: 'arbitrary-sidecar' }] } };
  for (const namespace of ['kubeclaw', 'test', 'testing', 'test-future']) {
    for (const tool of ['namespace_overview', 'get_pod', 'get_events', 'get_pod_logs', 'get_hubble_flows', 'get_pod_metrics', 'get_resource_inventory', 'exec_pod']) {
      assert.doesNotThrow(() => authorizeTool(nova, tool, { namespace }, 'argocd'));
    }
    const args = { namespace, container: 'arbitrary-sidecar', timeoutSeconds: 120, maxOutputBytes: 999999 };
    assert.deepEqual(authorizeExec(nova, args, pod), { ...args, timeoutSeconds: 30, maxOutputBytes: 65536 });
  }
  for (const namespace of ['kubeclaw-ops', 'kubeclaw-other', 'argocd', 'prod-test']) {
    assert.throws(() => authorizeExec(nova, { namespace, container: 'arbitrary-sidecar' }, pod), /TARGET_FORBIDDEN/);
  }
  assert.throws(() => authorizeTool(nova, 'platform_cluster_state', { resource: 'namespaces' }, 'argocd'), /TOOL_FORBIDDEN/);
  assert.throws(() => authorizeTool(nova, 'get_resource_inventory', { namespace: 'kubeclaw', resource: 'persistentvolumes' }, 'argocd'), /TOOL_FORBIDDEN/);

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

test('broad backend is explicit and reconciler retains API egress without namespace prefixes', () => {
  const defaults = parse(readFileSync(root + 'charts/ops-pod/values.yaml', 'utf8'));
  // Explicit non-read-only fixture retains coverage of broad backend grants.
  const clients = defaults.mcp.clients.map(c => ({ ...c, readOnly: false, namespacePrefixes: [], exec: c.id === 'codex' ? [{ allNonSystemNamespaces: true, allPods: true, allContainers: true, timeoutSeconds: 30, maxOutputBytes: 65536 }] : [] }));
  const args = ['template', 'codex-ops', root + 'charts/ops-pod', '-n', 'kubeclaw-ops',
    '--set-string', 'codexImage=example/codex@sha256:' + 'a'.repeat(64),
    '--set-string', 'mcpImage=example/mcp@sha256:' + 'b'.repeat(64),
    '--set', 'networkPolicy.apiServerCIDRs[0]=10.0.0.1/32', '--set', 'networkPolicy.cilium=true',
    '--set-json', 'rbac.namespacePrefixes=[]', '--set-json', 'mcp.clients=' + JSON.stringify(clients)];
  const docs = parseAllDocuments(execFileSync('helm', args, { encoding: 'utf8' })).map(doc => {
    assert.deepEqual(doc.errors, []); return doc.toJSON();
  }).filter(Boolean);
  const backend = JSON.parse(docs.find(x => x.kind === 'ConfigMap' && x.metadata.name.endsWith('-namespace-access')).data['config.json']);
  assert.deepEqual(backend.prefixes, []);
  assert.equal(backend.allNonSystemNamespaces, true);
  const policy = JSON.parse(docs.find(x => x.kind === 'ConfigMap' && x.data['policy.json']).data['policy.json']);
  assert.doesNotThrow(() => parsePolicy(JSON.stringify(policy), ['kubeclaw'], [], true, true));
  assert.throws(() => parsePolicy(JSON.stringify(policy), ['kubeclaw'], [], true, false), /grant/);
  const deployment = docs.find(x => x.kind === 'Deployment' && x.metadata.name === 'codex-ops-mcp');
  assert.equal(deployment.spec.template.spec.containers[0].env.find(x => x.name === 'OPS_EXEC_ALL_NON_SYSTEM_NAMESPACES').value, '1');
  assert.ok(docs.some(x => x.kind === 'NetworkPolicy' && x.metadata.name.endsWith('-namespace-access')));
  assert.ok(docs.find(x => x.kind === 'CiliumNetworkPolicy').spec.endpointSelector.matchExpressions[0].values.includes('codex-ops-mcp-namespace-access'));
  assert.throws(() => execFileSync('helm', [...args, '--set', 'rbac.execAllNonSystemNamespaces=false'], { stdio: 'pipe' }));
});
