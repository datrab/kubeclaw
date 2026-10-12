import { readTestBundle, projectTestBundle, canonicalSwarmEntry } from '../../fixtures/config/swarm-bundle.mjs';
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

test('authored Argo ingress and operator values identify external OAuth and shared proxy tags', () => {
  const [ingress] = documents(readFileSync('my-values/infra/argocd-tailscale-ingress.yaml', 'utf8'));
  assert.equal(ingress.metadata.namespace, 'argocd');
  assert.equal(ingress.spec.ingressClassName, 'tailscale');
  assert.deepEqual(ingress.spec.defaultBackend.service, { name: 'argocd-server', port: { number: 80 } });
  assert.deepEqual(ingress.spec.tls, [{ hosts: ['argocd'] }]);
  assert.equal(ingress.metadata.annotations?.['tailscale.com/tags'], undefined);
  const [operator] = documents(readFileSync('my-values/infra/tailscale-operator-values.yaml', 'utf8'));
  assert.deepEqual(operator.oauth, { clientId: '', clientSecret: '' });
  assert.deepEqual(operator.operatorConfig.defaultTags, ['tag:k8s-operator']);
  assert.equal(operator.proxyConfig.defaultTags, 'tag:k8s');
});

test('actual Prism render binds private Studio ingress to its Service and removes only ingress when disabled', () => {
  const settings = projectTestBundle(readTestBundle(canonicalSwarmEntry));
  for (const enabled of [true, false]) {
    const manifests = documents(execFileSync(process.env.HELM ?? 'helm', ['template', 'prism', 'charts/prism',
      '--namespace', 'default', '-f', 'charts/prism/ci-values.yaml',
      '--set', `tailscale.enabled=${enabled}`, '--set', 'tailscale.hostname=private-studio-test'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const service = manifests.find(item => item.kind === 'Service' && item.metadata.name === 'prism-studio');
    assert.deepEqual(service.spec.ports, [{ port: 80, targetPort: settings.operator.prism.studio.port }]);
    assert.equal(service.spec.type ?? 'ClusterIP', 'ClusterIP');
    const ingress = manifests.filter(item => item.kind === 'Ingress');
    assert.equal(ingress.length, enabled ? 1 : 0);
    if (enabled) {
      assert.equal(ingress[0].spec.ingressClassName, 'tailscale');
      assert.deepEqual(ingress[0].spec.defaultBackend.service, { name: service.metadata.name, port: { number: 80 } });
      assert.deepEqual(ingress[0].spec.tls, [{ hosts: ['private-studio-test'] }]);
      assert.equal(ingress[0].metadata.annotations?.['tailscale.com/tags'], undefined);
    }
  }
});

test('actual Ops render exposes optional outbound SOCKS only and retains incoming deny policy', () => {
  for (const enabled of [true, false]) {
    const manifests = documents(execFileSync(process.env.HELM ?? 'helm', ['template', 'ops', 'charts/ops-pod',
      '--set', `tailscale.enabled=${enabled}`, '--set', 'networkPolicy.enabled=true',
      '--set-string', `codexImage=example.invalid/codex@sha256:${'a'.repeat(64)}`,
      '--set-string', `mcpImage=example.invalid/mcp@sha256:${'b'.repeat(64)}`,
      '--set', 'networkPolicy.apiServerCIDRs[0]=192.0.2.1/32'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(manifests.some(item => item.kind === 'Ingress'), false);
    const services = manifests.filter(item => item.kind === 'Service');
    assert.equal(services.length, 1);
    assert.equal(services[0].spec.clusterIP, 'None');
    assert.equal(services[0].spec.type ?? 'ClusterIP', 'ClusterIP');
    const policy = manifests.find(item => item.kind === 'NetworkPolicy');
    assert.deepEqual(policy.spec.ingress, []);
    const pod = manifests.find(item => item.kind === 'StatefulSet').spec.template.spec;
    const sidecar = pod.containers.find(item => item.name === 'tailscale');
    assert.equal(Boolean(sidecar), enabled);
    if (enabled) {
      const env = Object.fromEntries(sidecar.env.map(item => [item.name, item]));
      assert.equal(env.TS_SOCKS5_SERVER.value, '127.0.0.1:1055');
      assert.equal(env.TS_USERSPACE.value, 'true');
      assert.equal(env.TS_AUTH_ONCE.value, 'true');
      assert.deepEqual(env.TS_AUTHKEY.valueFrom.secretKeyRef, { name: 'codex-ops-tailscale', key: 'authkey' });
      assert.equal(env.TS_AUTHKEY.value, undefined);
      assert.deepEqual(pod.volumes.find(item => item.name === 'tailscale-state').persistentVolumeClaim, { claimName: 'ops-tailscale' });
    }
  }
});
