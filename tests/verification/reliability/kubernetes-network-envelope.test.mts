import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateFixtureNetworkPolicy as check } from '../../../skills/buster/engine/test-gates/kubernetes-network-envelope.ts';
const policy = { podSelector: { matchLabels: { app: 'core' } }, policyTypes: ['Egress'],
  egress: [{ to: [{ podSelector: { matchLabels: { app: 'database' } } }], ports: [{ port: 5432, protocol: 'TCP' }] }] };
test('local application edge and default-deny fit the controller envelope', () => {
  check(policy); check({ podSelector: {}, policyTypes: ['Ingress', 'Egress'] });
});
test('namespace escape, ipBlock, unrestricted peer and unrestricted ports are rejected', () => {
  for (const peer of [{ podSelector: {} }, {}, { ipBlock: { cidr: '0.0.0.0/0' } }, { podSelector: {}, namespaceSelector: {} }]) {
    assert.throws(() => check({ ...policy, egress: [{ ...policy.egress[0], to: [peer] }] }));
  }
  assert.throws(() => check({ ...policy, egress: [{ to: policy.egress[0].to }] }));
});
test('DNS exception is exactly kube-dns and port 53, egress only', () => {
  const peer = { namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } }, podSelector: { matchLabels: { 'k8s-app': 'kube-dns' } } };
  check({ ...policy, egress: [{ to: [peer], ports: [{ port: 53, protocol: 'UDP' }] }] });
  assert.throws(() => check({ ...policy, egress: [{ to: [peer], ports: [{ port: 443 }] }] }));
  assert.throws(() => check({ podSelector: {}, policyTypes: ['Ingress'], ingress: [{ from: [peer], ports: [{ port: 53 }] }] }));
});
