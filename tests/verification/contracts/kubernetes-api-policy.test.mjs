import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadAll } from 'js-yaml';

test('shipped Cilium API grants cover pre/post DNAT only for intended workload identities', () => {
  const policies = loadAll(fs.readFileSync('my-values/infra/network-policies.yaml', 'utf8')).filter(Boolean);
  const grants = policies.filter(policy => policy.spec?.egress?.some(rule => rule.toEntities?.includes('kube-apiserver')));
  assert.deepEqual(grants.map(policy => policy.metadata.name).sort(), [
    'kubeclaw-buster-namespace-controller-api-egress', 'kubeclaw-lease-clients-api-egress',
  ]);
  for (const policy of grants) {
    assert.equal(policy.kind, 'CiliumNetworkPolicy');
    assert.equal(policy.spec.egress.length, 1);
    const grant = policy.spec.egress[0];
    assert.deepEqual(grant.toEntities, ['kube-apiserver']);
    assert.deepEqual(grant.toPorts[0].ports.map(port => `${port.protocol}/${port.port}`).sort(), ['TCP/443', 'TCP/6443']);
    assert.equal(grant.toCIDR, undefined); assert.equal(grant.toCIDRSet, undefined);
  }
  const controller = grants.find(value => value.metadata.name.includes('controller'));
  assert.equal(controller.spec.endpointSelector.matchLabels['app.kubernetes.io/component'], 'buster-namespace-controller');
  const agents = grants.find(value => value.metadata.name.includes('lease-clients'));
  assert.deepEqual(agents.spec.endpointSelector.matchExpressions, [{ key: 'app.kubernetes.io/component', operator: 'In', values: ['nova', 'buster'] }]);
});

test('actual Ops Helm supports discovered endpoint ports, exact CIDRs and both CNI paths', () => {
  const digest = 'a'.repeat(64);
  const args = ['template', 'recovery-ops', 'charts/ops-pod', '--namespace', 'recovery',
    '--set', `codexImage=example.invalid/codex@sha256:${digest},mcpImage=example.invalid/mcp@sha256:${digest}`,
    '--set', 'networkPolicy.apiServerCIDRs[0]=10.43.0.1/32,networkPolicy.apiServerCIDRs[1]=192.0.2.10/32,networkPolicy.apiServerPort=7443'];
  for (const cilium of [false, true]) {
    const manifests = loadAll(execFileSync(process.env.HELM ?? 'helm', [...args, '--set', `networkPolicy.cilium=${cilium}`], { encoding: 'utf8' })).filter(Boolean);
    const portable = manifests.find(value => value.kind === 'NetworkPolicy');
    const api = portable.spec.egress.find(value => value.to.some(target => target.ipBlock?.cidr === '10.43.0.1/32'));
    assert.deepEqual(api.to.map(value => value.ipBlock.cidr), ['10.43.0.1/32', '192.0.2.10/32']);
    assert.deepEqual(api.ports, [{ protocol: 'TCP', port: 443 }, { protocol: 'TCP', port: 7443 }]);
    const entity = manifests.find(value => value.kind === 'CiliumNetworkPolicy');
    assert.equal(Boolean(entity), cilium);
    if (cilium) assert.deepEqual(entity.spec.egress[0].toPorts[0].ports, [{ port: '443', protocol: 'TCP' }, { port: '7443', protocol: 'TCP' }]);
  }
});
