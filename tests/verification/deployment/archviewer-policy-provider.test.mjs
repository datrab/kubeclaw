import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import yaml from 'js-yaml';

function render(extra = []) {
  return yaml.loadAll(execFileSync('helm', ['template', 'agent-nova',
    'charts/kubeclaw', '-n', 'kubeclaw', '-f', 'releases/values/nova.yaml',
    '-f', 'gitops/production/overlays/nova-ax41.yaml', ...extra],
  {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024})).filter(Boolean);
}

test('AX41 allows only the dedicated Tailscale proxy on the viewer port without Cilium CRDs', () => {
  const docs = render();
  assert.equal(docs.some(d => d.kind === 'CiliumNetworkPolicy'), false);
  const policy = docs.find(d => d.kind === 'NetworkPolicy' && d.metadata.name === 'agent-nova-archviewer');
  const pod = docs.find(d => d.kind === 'Deployment' && d.metadata.name === 'agent-nova').spec.template;
  for (const [key, value] of Object.entries(policy.spec.podSelector.matchLabels)) {
    assert.equal(pod.metadata.labels[key], value);
  }
  assert.deepEqual(policy.spec.policyTypes, ['Ingress']);
  assert.equal(policy.spec.ingress.length, 1);
  const rule = policy.spec.ingress[0];
  assert.deepEqual(rule.ports, [{port: 3456, protocol: 'TCP'}]);
  // Namespace AND proxy identity must be in a single peer, never separate OR peers.
  assert.deepEqual(rule.from, [{
    namespaceSelector: {matchLabels: {'kubernetes.io/metadata.name': 'tailscale'}},
    podSelector: {matchLabels: {
      'tailscale.com/managed': 'true',
      'tailscale.com/parent-resource-type': 'ingress',
      'tailscale.com/parent-resource': 'agent-nova-archviewer',
      'tailscale.com/parent-resource-ns': 'kubeclaw',
    }},
  }]);
  assert.equal(docs.find(d => d.kind === 'Service' && d.metadata.name === policy.metadata.name).spec.type, 'ClusterIP');
  assert.ok(pod.spec.volumes.some(v => v.secret?.secretName === 'nova-archviewer-auth'));
});

test('Cilium mode retains the selected proxy identity and unknown providers fail rendering', () => {
  const docs = render(['--set', 'archviewer.networkPolicyProvider=cilium']);
  const policy = docs.find(d => d.kind === 'CiliumNetworkPolicy');
  assert.equal(policy.spec.ingress[0].fromEndpoints[0].matchLabels['tailscale.com/parent-resource'], 'agent-nova-archviewer');
  assert.equal(docs.some(d => d.kind === 'NetworkPolicy' && d.metadata.name === policy.metadata.name), false);
  assert.throws(() => render(['--set', 'archviewer.networkPolicyProvider=disabled']), /must be cilium or kubernetes/);
});
