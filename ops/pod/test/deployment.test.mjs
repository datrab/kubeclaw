import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const helm = process.env.HELM_BIN || 'helm';
const codex = fileURLToPath(new URL('../node_modules/.bin/codex', import.meta.url));
const args = ['template', 'codex-ops', join(repo, 'charts/ops-pod'), '-n', 'kubeclaw-ops',
  '--set-string', 'codexImage=example/codex@sha256:' + 'a'.repeat(64),
  '--set-string', 'mcpImage=example/mcp@sha256:' + 'b'.repeat(64),
  '--set', 'networkPolicy.apiServerCIDRs[0]=10.0.0.1/32'];
const render = extra => parseAllDocuments(execFileSync(helm, [...args, ...extra], { encoding: 'utf8' })).map(doc => {
  assert.deepEqual(doc.errors, []);
  return doc.toJSON();
}).filter(Boolean);

const noExecClients = parseAllDocuments(readFileSync(join(repo, 'charts/ops-pod/values.yaml'), 'utf8'))[0].toJSON().mcp.clients.map(client => ({ ...client, exec: [] }));

test('real Helm render isolates credentials and persists a single non-root Codex identity', () => {
  const resources = render([]);
  const stateful = resources.find(x => x.kind === 'StatefulSet');
  assert.equal(stateful.spec.replicas, 1);
  const pod = stateful.spec.template.spec;
  assert.equal(pod.automountServiceAccountToken, false);
  assert.equal(pod.hostNetwork, undefined);
  assert.equal(pod.shareProcessNamespace, undefined);
  assert.equal(pod.securityContext.runAsNonRoot, true);
  assert.deepEqual(pod.containers.map(c => c.name), ['codex']);
  const codex = pod.containers[0];
  const mcpPod = resources.find(x => x.kind === 'Deployment').spec.template.spec;
  const mcp = mcpPod.containers[0];
  assert.equal(mcpPod.serviceAccountName, 'codex-ops-mcp');
  assert.equal(pod.serviceAccountName, 'codex-ops');
  assert.equal(codex.volumeMounts.some(m => ['kube-api', 'kubeconfig', 'policy'].includes(m.name)), false);
  assert.equal(codex.env.some(e => e.name === 'KUBECONFIG'), false);
  assert.equal(codex.env.find(e => e.name === 'OPS_MCP_URL').value, 'https://codex-ops-mcp.kubeclaw-ops.svc:8080/mcp');
  assert.ok(codex.volumeMounts.some(m => m.name === 'mcp-ca' && m.readOnly));
  assert.equal(resources.some(x => x.kind === 'ConfigMap' && x.metadata.name.includes('kubeconfig')), false);
  for (const binding of resources.filter(x => ['RoleBinding', 'ClusterRoleBinding'].includes(x.kind))) {
    assert.deepEqual(binding.subjects, [{ kind: 'ServiceAccount', name: 'codex-ops-mcp', namespace: 'kubeclaw-ops' }]);
  }
  const policyData = JSON.parse(resources.find(x => x.kind === 'ConfigMap' && x.data['policy.json']).data['policy.json']);
  assert.deepEqual(policyData.clients.map(x => x.id), ['codex', 'nova']);
  assert.equal(policyData.clients[0].tokenFile, '/var/run/ops-clients/codex/token');
  assert.ok(policyData.clients.every(x => !('token' in x)));
  assert.equal(mcp.volumeMounts.some(m => ['home', 'workspace'].includes(m.name)), false);
  assert.ok(mcp.volumeMounts.some(m => m.name === 'kube-api' && m.readOnly));
  assert.deepEqual(stateful.spec.volumeClaimTemplates.map(x => x.metadata.name), ['home', 'workspace']);
  for (const container of [...pod.containers, mcp]) {
    assert.equal(container.securityContext.allowPrivilegeEscalation, false);
    assert.equal(container.securityContext.readOnlyRootFilesystem, true);
    assert.deepEqual(container.securityContext.capabilities.drop, ['ALL']);
  }
  const bound = resources.filter(x => x.kind === 'RoleBinding' && x.roleRef.kind === 'ClusterRole').map(x => x.metadata.namespace);
  assert.deepEqual(bound, ['kubeclaw']);
  for (const role of resources.filter(x => x.kind === 'ClusterRole')) {
    for (const rule of role.rules) {
      assert.deepEqual(rule.verbs, ['get', 'list']);
      for (const resource of rule.resources) assert.ok(!['*', 'secrets', 'configmaps', 'pods/exec', 'pods/portforward', 'nodes/proxy', 'serviceaccounts/token'].includes(resource));
    }
  }
  const policy = resources.find(x => x.kind === 'NetworkPolicy');
  assert.deepEqual(policy.spec.ingress, []);
  assert.equal(policy.spec.egress.some(x => x.to.some(y => y.ipBlock?.cidr === '10.0.0.1/32')), false);
  const mcpPolicy = resources.find(x => x.kind === 'NetworkPolicy' && x.metadata.name === 'codex-ops-mcp');
  assert.equal(mcpPolicy.spec.ingress.length, 2);
  assert.ok(mcpPolicy.spec.egress.some(x => x.to.some(y => y.ipBlock?.cidr === '10.0.0.1/32')));
});

test('optional Tailscale and Cilium render without privileged access or operator dependency', () => {
  const resources = render(['--set', 'tailscale.enabled=true', '--set', 'networkPolicy.cilium=true']);
  const pod = resources.find(x => x.kind === 'StatefulSet').spec.template.spec;
  const ts = pod.containers.find(x => x.name === 'tailscale');
  assert.equal(ts.env.find(x => x.name === 'TS_USERSPACE').value, 'true');
  assert.equal(ts.env.find(x => x.name === 'TS_KUBE_SECRET').value, '');
  assert.equal(ts.volumeMounts.some(x => x.name === 'kube-api'), false);
  assert.deepEqual(ts.securityContext.capabilities.drop, ['ALL']);
  assert.ok(resources.some(x => x.kind === 'CiliumNetworkPolicy'));
});

test('mutable images and undiscovered API endpoints are rejected before deployment', () => {
  assert.throws(() => execFileSync(helm, [...args, '--set-string', 'codexImage=example/codex:latest'], { stdio: 'pipe' }));
  assert.throws(() => execFileSync(helm, args.slice(0, -2), { stdio: 'pipe' }));
});

test('the actual pinned Codex CLI accepts the installed MCP config and exposes pairing/device auth', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-pod-test-'));
  try {
    mkdirSync(join(dir, '.codex'));
    copyFileSync(join(repo, 'ops/pod/config.toml'), join(dir, '.codex/config.toml'));
    const env = { PATH: process.env.PATH, HOME: dir, KUBECLAW_MCP_TOKEN: 'test-only-' + 'x'.repeat(32) };
    const run = a => execFileSync(codex, a, { env, encoding: 'utf8', timeout: 15000 });
    const pinnedVersion = JSON.parse(readFileSync(join(repo, 'versions.json'), 'utf8')).codex.version;
    assert.equal(run(['--version']).trim(), `codex-cli ${pinnedVersion}`);
    assert.match(run(['remote-control', '--help']), /pair/);
    assert.match(run(['remote-control', 'start', '--help']), /daemon/);
    assert.match(run(['remote-control', 'stop', '--help']), /daemon/);
    assert.match(run(['login', '--help']), /--device-auth/);
    const servers = JSON.parse(run(['mcp', 'list', '--json']));
    const mcp = servers.find(x => x.name === 'kubeclaw_ops');
    assert.ok(mcp, 'real Codex must load the MCP definition');
    assert.equal(spawnSync(codex, ['login', 'status'], { env, stdio: 'pipe' }).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('client namespaces cannot exceed the MCP identity scope', () => {
  assert.throws(() => render(['--set-json', 'rbac.namespaces=["platform"]', '--set', 'defaultNamespace=platform']));
  assert.throws(() => render(['--set-json', 'mcp.clients[0].namespaces=["private"]']));
});

test('exec is namespace scoped, independent of observer discovery, and removable', () => {
  const resources = render(['--set-json', 'rbac.namespaces=["kubeclaw","argocd","kube-system"]']);
  const roles = resources.filter(x => x.kind === 'Role');
  assert.equal(roles.length, 1);
  assert.equal(roles[0].metadata.namespace, 'kubeclaw');
  assert.deepEqual(roles[0].rules, [
    { apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] },
    { apiGroups: [''], resources: ['pods/exec'], verbs: ['get', 'create'] },
  ]);
  const binding = resources.find(x => x.kind === 'RoleBinding' && x.roleRef.kind === 'Role');
  assert.equal(binding.metadata.namespace, 'kubeclaw');
  assert.equal(binding.roleRef.name, roles[0].metadata.name);
  assert.deepEqual(binding.subjects, [{ kind: 'ServiceAccount', name: 'codex-ops-mcp', namespace: 'kubeclaw-ops' }]);
  const disabled = render(['--set-json', 'rbac.execNamespaces=[]', '--set-json', 'mcp.clients=' + JSON.stringify(noExecClients)]);
  assert.ok(!disabled.some(x => x.kind === 'Role'));
  const codex = disabled.find(x => x.kind === 'StatefulSet').spec.template.spec.containers[0];
  assert.ok(!codex.volumeMounts.some(m => m.name === 'kube-api'));
  assert.ok(!codex.env.some(e => e.name === 'KUBECONFIG'));
  assert.ok(disabled.some(x => x.kind === 'Deployment'));
  assert.ok(!codex.env.some(e => e.name === 'OPS_EXEC_NAMESPACES'));
  const custom = render(['--set-json', 'rbac.execNamespaces=["buster","prism"]', '--set-json', 'mcp.clients=' + JSON.stringify(noExecClients)]);
  assert.deepEqual(custom.filter(x => x.kind === 'Role').map(x => x.metadata.namespace), ['buster', 'prism']);
  assert.throws(() => render(['--set-json', 'rbac.execNamespaces=["*"]']));
});
