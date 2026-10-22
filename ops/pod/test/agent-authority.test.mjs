import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const render = (role, extra = []) => parseAllDocuments(execFileSync('helm', ['template', `agent-${role}`, root + 'charts/kubeclaw', '-n', 'kubeclaw',
  '-f', root + `my-values/${role}-values.yaml`, ...(role === 'buster' ? ['-f', root + 'gitops/production/overlays/buster-ax41.yaml'] : []), ...extra], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).map(x => { assert.deepEqual(x.errors, []); return x.toJSON(); }).filter(Boolean);

test('Nova has no API token or grants and explicitly revokes old RBAC even without pruning', () => {
  for (const extra of [[], ['--set', 'serviceAccount.automount=true', '--set', 'busterNamespaceBroker.leaseClient.enabled=true', '--set', 'busterNamespaceBroker.leaseClient.verificationRead.enabled=true']]) {
    const resources = render('nova', extra);
    const retired = resources.filter(x => ['RoleBinding', 'ClusterRoleBinding', 'Role', 'ClusterRole'].includes(x.kind));
    assert.equal(retired.length, 6);
    for (const resource of retired) assert.deepEqual(resource.rules ?? resource.subjects, []);
    assert.ok(retired.some(x => x.kind === 'ClusterRoleBinding' && x.metadata.name === 'agent-nova-verification-read'));
    assert.ok(retired.some(x => x.kind === 'RoleBinding' && x.metadata.namespace === 'tailscale'));
    const pod = resources.find(x => x.kind === 'Deployment' && x.metadata.name === 'agent-nova').spec.template.spec;
    assert.equal(pod.automountServiceAccountToken, false);
    assert.equal(pod.volumes.some(v => v.projected?.sources?.some(s => s.serviceAccountToken)), false);
    const gateway = pod.containers.find(c => c.name === 'kubeclaw');
    assert.equal(gateway.env.find(e => e.name === 'OPS_MCP_URL').value, 'https://codex-ops-mcp.kubeclaw-ops.svc:8080/mcp');
    assert.ok(gateway.volumeMounts.find(m => m.name === 'ops-mcp-token').readOnly);
    assert.equal(pod.initContainers.some(c => c.volumeMounts?.some(m => m.name === 'ops-mcp-token')), false);
    assert.equal(resources.find(x => x.kind === 'ServiceAccount' && x.metadata.name === 'agent-nova').automountServiceAccountToken, false);
  }
});

test('Buster retains its explicit runtime token and broker but cannot delegate lease namespaces to Nova', () => {
  const resources = render('buster');
  const pod = resources.find(x => x.kind === 'Deployment' && x.metadata.name === 'agent-buster').spec.template.spec;
  assert.equal(pod.automountServiceAccountToken, false);
  assert.equal(pod.volumes.find(v => v.name === 'ops-mcp-token').secret.secretName, 'buster-ops-bearer');
  const gateway = pod.containers.find(c => c.name === 'kubeclaw');
  assert.ok(gateway.volumeMounts.find(v => v.name === 'ops-mcp-token').readOnly);
  const leaseBinding = resources.find(x => x.kind === 'RoleBinding' && x.metadata.name.endsWith('namespace-lease-client'));
  assert.deepEqual(leaseBinding.subjects, [{ kind: 'ServiceAccount', name: 'agent-buster', namespace: 'kubeclaw' }]);
  assert.ok(pod.volumes.some(v => v.projected?.sources?.some(s => s.serviceAccountToken)));
  const controller = resources.find(x => x.kind === 'Deployment' && x.metadata.name.endsWith('namespace-controller'));
  assert.ok(controller);
  const controllerEnv = controller.spec.template.spec.containers[0].env;
  assert.equal(controllerEnv.find(e => e.name === 'BUSTER_OPS_MCP_NAMESPACE').value, 'kubeclaw-ops');
  assert.equal(controllerEnv.find(e => e.name === 'BUSTER_OPS_MCP_RELEASE').value, 'codex-ops');
  const rendered = JSON.stringify(resources);
  assert.doesNotMatch(rendered, /"subject":"(?:kubeclaw\/)?agent-nova"/);
});
