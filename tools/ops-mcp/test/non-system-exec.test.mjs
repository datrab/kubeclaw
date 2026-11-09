import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy, authorizeTool, authorizeExec } from '../src/access-policy.mjs';
import { reconcileNamespaceAccess, createNamespaceAccessRequest } from '../src/namespace-access.mjs';

const grant = { allNonSystemNamespaces: true, allPods: true, allContainers: true, timeoutSeconds: 30, maxOutputBytes: 65536 };
const client = { id: 'codex', tokenFile: '/token', namespaces: ['kubeclaw', 'kube-system'], readAllNamespaces: true, tools: ['get_pod', 'exec_pod'], exec: [grant] };
const parse = (actor = client, enabled = true) => parsePolicy(JSON.stringify({ clients: [actor] }), client.namespaces, [], true, enabled)[0];
const pod = { spec: { containers: [{ name: 'kubeclaw' }] } };

test('Devbox broad exec needs explicit backend and client grants and excludes system workloads', () => {
  const actor = parse();
  for (const namespace of ['kubeclaw', 'default', 'argocd', 'paperless', 'future-project', 'test-new']) {
    const args = { namespace, container: 'kubeclaw', timeoutSeconds: 120, maxOutputBytes: 65536 };
    assert.doesNotThrow(() => authorizeTool(actor, 'exec_pod', args, 'argocd'));
    assert.equal(authorizeExec(actor, args, pod).timeoutSeconds, 30);
  }
  for (const namespace of ['kube-system', 'kube-public', 'kube-node-lease', 'kube-future', 'KUBE-SYSTEM', 'bad/../ns', '*', '']) {
    assert.throws(() => authorizeExec(actor, { namespace, container: 'kubeclaw' }, pod), /TARGET_FORBIDDEN/);
  }
  assert.throws(() => authorizeTool(actor, 'exec_pod', { namespace: 'kube-public' }, 'argocd'), /NAMESPACE_FORBIDDEN/);
  for (const spec of [{ priorityClassName: 'system-node-critical' }, { priorityClassName: 'system-cluster-critical' }, { priority: 2000000000 }, { priority: 2000001000 }]) {
    assert.throws(() => authorizeExec(actor, { namespace: 'default', container: 'kubeclaw' }, { spec: { ...pod.spec, ...spec } }), /TARGET_FORBIDDEN/);
  }
  assert.throws(() => authorizeExec(actor, { namespace: 'default', container: 'missing' }, pod), /TARGET_FORBIDDEN/);
  assert.throws(() => parse(client, false), /grant/);
  assert.throws(() => parse({ ...client, readAllNamespaces: false }), /grant/);
  for (const changed of [{ allNonSystemNamespaces: 'true' }, { allContainers: false }, { namespacePrefix: 'test' }, { podLabels: { app: 'buster' } }]) {
    assert.throws(() => parse({ ...client, exec: [{ ...grant, ...changed }] }), /grant/);
  }
  const scoped = parse({ ...client, id: 'nova', namespaces: ['kubeclaw'], readAllNamespaces: false, exec: [] });
  assert.throws(() => authorizeTool(scoped, 'exec_pod', { namespace: 'paperless' }, 'argocd'), /NAMESPACE_FORBIDDEN/);
  assert.throws(() => authorizeExec(scoped, { namespace: 'kubeclaw', container: 'kubeclaw' }, pod), /TARGET_FORBIDDEN/);
});

test('namespace reconciler covers present and future workload namespaces without binding kube-*', async () => {
  const config = { namespace: 'kubeclaw-ops', serviceAccount: 'codex-ops-mcp', prefixes: ['test'], allNonSystemNamespaces: true, roles: ['ops-reader', 'ops-exec'] };
  const created = [];
  let names = ['default', 'paperless', 'kubeclaw', 'kube-system', 'kube-public', 'kube-node-lease', 'kube-future'];
  const api = async (method, path, body) => {
    if (path.startsWith('/api/v1/namespaces?')) return { items: names.map(name => ({ metadata: { name } })) };
    if (method === 'GET') { const error = new Error('not found'); error.status = 404; throw error; }
    created.push(body); return {};
  };
  await reconcileNamespaceAccess(config, api);
  assert.equal(created.length, 6);
  assert.ok(created.every(x => !x.metadata.namespace.startsWith('kube-')));
  names = ['brand-new-project'];
  await reconcileNamespaceAccess(config, api);
  assert.deepEqual(created.slice(-2).map(x => x.metadata.namespace), ['brand-new-project', 'brand-new-project']);
  const transport = createNamespaceAccessRequest(config, { tokenFile: '/does-not-exist', caFile: '/does-not-exist' });
  for (const namespace of ['kube-system', 'kube-public', 'kube-node-lease', 'kube-future']) {
    assert.throws(() => transport('POST', `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/rolebindings`, { metadata: { name: 'ops-exec' } }), /INVALID_NAMESPACE_ACCESS_REQUEST/);
  }
});
