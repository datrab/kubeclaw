import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';
import { parsePolicy, authorizeTool } from '../../../tools/ops-mcp/src/access-policy.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = ['template', 'codex-ops', root + 'charts/ops-pod', '-n', 'kubeclaw-ops',
  '-f', root + 'gitops/platform/values/codex-ops.yaml',
  '--set-string', 'codexImage=example/codex@sha256:' + 'a'.repeat(64),
  '--set-string', 'mcpImage=example/mcp@sha256:' + 'b'.repeat(64)];
const docs = parseAllDocuments(execFileSync('helm', args, { encoding: 'utf8' })).map(d => {
  assert.deepEqual(d.errors, []); return d.toJSON();
}).filter(Boolean);

test('production policy is read-only for Codex and uses only internal monitoring egress', () => {
  const policy = docs.find(d => d.kind === 'ConfigMap' && d.data['policy.json']);
  const clients = parsePolicy(policy.data['policy.json'], ['kubeclaw-ops', 'kubeclaw', 'argocd', 'kube-system', 'tailscale', 'spire-server', 'spire-system'], ['test'], true, true);
  const codex = clients.find(c => c.id === 'codex');
  assert.equal(codex.readOnly, true);
  assert.deepEqual(codex.exec, []);
  assert.ok(!codex.tools.includes('exec_pod'));
  assert.throws(() => authorizeTool(codex, 'exec_pod', { namespace: 'test-demo' }, 'argocd'), /TOOL_FORBIDDEN/);
  for (const tool of ['get_resource_inventory', 'get_monitoring_metrics', 'get_monitoring_alerts']) assert.ok(codex.tools.includes(tool));
  // Existing agent grants are independent and unchanged by Codex's read policy.
  assert.ok(clients.find(c => c.id === 'nova').exec.length);
  assert.ok(clients.find(c => c.id === 'buster').exec.length);
  const mcp = docs.find(d => d.kind === 'Deployment' && d.metadata.name === 'codex-ops-mcp').spec.template.spec;
  assert.equal(mcp.containers[0].env.find(e => e.name === 'OPS_PROMETHEUS_ORIGIN').value,
    'http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090');
  const network = docs.find(d => d.kind === 'NetworkPolicy' && d.metadata.name === 'codex-ops-mcp');
  const monitoring = network.spec.egress.find(e => e.to.some(t => t.namespaceSelector?.matchLabels?.['kubernetes.io/metadata.name'] === 'monitoring'));
  assert.deepEqual(monitoring.ports, [{ protocol: 'TCP', port: 9090 }]);
  assert.deepEqual(monitoring.to[0].podSelector.matchLabels, { 'app.kubernetes.io/name': 'prometheus' });
  assert.ok(!docs.some(d => d.kind === 'NetworkPolicy' && d.metadata.namespace === 'monitoring'), 'do not isolate existing Prometheus clients by introducing a new ingress policy');
  const roles = docs.filter(d => d.kind === 'ClusterRole' && /-(cluster-reader|reader)$/.test(d.metadata.name));
  for (const role of roles) for (const rule of role.rules) {
    assert.ok(rule.verbs.every(v => ['get', 'list'].includes(v)));
    assert.ok(!rule.resources.some(r => ['secrets', 'nodes/proxy', 'pods/exec', 'pods/attach', 'pods/portforward', '*'].includes(r)));
  }
});

test('Helm fails closed if a read-only client regains an exec tool or grant', () => {
  assert.throws(() => execFileSync('helm', [...args, '--set', 'mcp.clients[0].id=codex', '--set', 'mcp.clients[0].readOnly=true',
    '--set-json', 'mcp.clients[0].namespaces=[]', '--set-json', 'mcp.clients[0].namespacePrefixes=[]',
    '--set-json', 'mcp.clients[0].tools=["exec_pod"]', '--set-json', 'mcp.clients[0].exec=[]'], { stdio: 'pipe' }), /Read-only MCP/);
});
