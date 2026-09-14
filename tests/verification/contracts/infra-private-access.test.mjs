import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadAll } from 'js-yaml';

const documents = text => loadAll(text).filter(Boolean);
const render = (...args) => documents(execFileSync(process.env.HELM ?? 'helm', ['template', 'agent-nova', 'charts/kubeclaw',
  '-f', 'my-values/nova-values.yaml', '--namespace', 'example-project', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

test('actual Nova Helm render exposes architecture only through its private authenticated service', () => {
  const manifests = render('--set', 'archviewer.tailscaleOperatorNamespace=private-access');
  const service = manifests.find(item => item.kind === 'Service' && item.metadata.name.endsWith('-archviewer'));
  assert.equal(service.spec.type, 'ClusterIP');
  assert.equal(manifests.some(item => item.kind === 'Service' && item.spec.ports.some(port => port.nodePort === 30456)), false);
  const ingress = manifests.find(item => item.kind === 'Ingress' && item.metadata.name === service.metadata.name);
  assert.equal(ingress.spec.ingressClassName, 'tailscale');
  assert.equal(ingress.spec.defaultBackend.service.name, service.metadata.name);
  const rule = manifests.find(item => item.kind === 'CiliumNetworkPolicy' && item.metadata.name === service.metadata.name).spec;
  assert.deepEqual(rule.ingress[0].fromEndpoints[0].matchLabels, {
    'k8s:io.kubernetes.pod.namespace': 'private-access', 'tailscale.com/managed': 'true',
    'tailscale.com/parent-resource-type': 'ingress', 'tailscale.com/parent-resource': service.metadata.name,
    'tailscale.com/parent-resource-ns': 'example-project',
  });
  const pod = manifests.find(item => item.kind === 'Deployment').spec.template.spec;
  const sidecar = pod.containers.find(item => item.name === 'archviewer');
  assert.deepEqual(sidecar.readinessProbe.httpGet, { path: '/healthz', port: 'archviewer' });
  assert.equal(pod.volumes.find(item => item.name === 'archviewer-auth').secret.secretName, 'nova-archviewer-auth');
  assert.equal(sidecar.volumeMounts.find(item => item.name === 'archviewer-auth').readOnly, true);
  const policy = documents(readFileSync('my-values/infra/network-policies.yaml', 'utf8'));
  assert.equal(policy.some(item => item.spec.ingress?.some(rule => rule.from?.some(source => source.ipBlock?.cidr === '0.0.0.0/0')
    && rule.ports?.some(port => port.port === 3456))), false);
});

test('actual Helm rejects credential omission and a carried-over legacy architecture NodePort', () => {
  assert.throws(() => render('--set', 'archviewer.existingSecret='), /archviewer.existingSecret/);
  assert.throws(() => render('--set', 'service.extraPorts[0].name=archviewer,service.extraPorts[0].port=3456,service.extraPorts[0].targetPort=archviewer,service.extraPorts[0].nodePort=30456'), /Remove legacy archviewer/);
});

test('rendered Ops RBAC has only the two intended namespace grants and mandatory Secret auth', () => {
  const manifests = documents(execFileSync('bash', ['scripts/deploy-ops-mcp.sh', 'render'], { encoding: 'utf8',
    env: { ...process.env, OPS_MCP_IMAGE: 'ghcr.io/datrab/kubeclaw-ops-mcp@sha256:' + 'a'.repeat(64) } }));
  assert.equal(manifests.some(item => ['ClusterRole', 'ClusterRoleBinding'].includes(item.kind)), false);
  const roles = manifests.filter(item => item.kind === 'Role');
  assert.deepEqual(roles.map(role => role.metadata.namespace).sort(), ['argocd', 'kubeclaw']);
  assert.deepEqual(roles.find(role => role.metadata.namespace === 'argocd').rules,
    [{ apiGroups: ['argoproj.io'], resources: ['applications'], verbs: ['get', 'list'] }]);
  for (const role of roles) for (const rule of role.rules) {
    assert.ok(rule.verbs.every(verb => ['get', 'list'].includes(verb)));
    assert.ok(rule.resources.every(resource => !['secrets', 'pods/exec', '*', 'namespaces'].includes(resource)));
  }
  const pod = manifests.find(item => item.kind === 'Deployment').spec.template.spec;
  const mount = pod.containers[0].volumeMounts.find(item => item.name === 'backend-auth');
  assert.equal(mount.readOnly, true);
  const tokenPath = pod.containers[0].env.find(item => item.name === 'OPS_MCP_BEARER_TOKEN_FILE').value;
  assert.equal(tokenPath, mount.mountPath + '/token');
  assert.equal(pod.volumes.find(item => item.name === 'backend-auth').secret.secretName, 'ops-mcp-auth');
});
