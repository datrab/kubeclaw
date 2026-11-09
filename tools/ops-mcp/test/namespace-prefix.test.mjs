import test from 'node:test';
import assert from 'node:assert/strict';
import { namespaceAllowed, parsePolicy, authorizeTool, authorizeExec } from '../src/access-policy.mjs';
import { reconcileNamespaceAccess, createNamespaceAccessRequest } from '../src/namespace-access.mjs';
import { loadOpsMcpConfig } from '../src/config.mjs';

const client = { id: 'buster', tokenFile: '/token', namespaces: [], namespacePrefixes: ['TEST'],
  tools: ['get_pod', 'exec_pod'], exec: [{ namespacePrefix: 'test', allPods: true, allContainers: true, timeoutSeconds: 30, maxOutputBytes: 65536 }] };
const parse = actor => parsePolicy(JSON.stringify({ clients: [actor] }), ['kubeclaw'], ['test'])[0];

test('test prefix covers any current/future namespace case-insensitively without broadening Buster outside it', () => {
  const actor = parse(client);
  for (const namespace of ['test', 'test123', 'test-build-1', 'testing', 'TEST-NEW', 'TeStCase']) {
    assert.equal(namespaceAllowed(namespace, [], actor.namespacePrefixes), true);
    assert.doesNotThrow(() => authorizeTool(actor, 'get_pod', { namespace }, 'argocd'));
    const args = { namespace, container: 'anything', timeoutSeconds: 100, maxOutputBytes: 999999 };
    assert.equal(authorizeExec(actor, args, { spec: { containers: [{ name: 'anything' }] } }).timeoutSeconds, 30);
  }
  for (const namespace of ['kubeclaw', 'kubeclaw-ops', 'argocd', 'prod-test', 'contest', 'test/../prod', 'test%2fprod', 'test.foo', '']) {
    assert.throws(() => authorizeTool(actor, 'get_pod', { namespace: namespace || 'prod' }, 'argocd'), /NAMESPACE_FORBIDDEN/);
    assert.throws(() => authorizeExec(actor, { namespace, container: 'anything' }, { spec: { containers: [{ name: 'anything' }] } }), /TARGET_FORBIDDEN/);
  }
  assert.throws(() => authorizeTool(actor, 'platform_cluster_state', {}, 'argocd'), /TOOL_FORBIDDEN/);
  assert.throws(() => authorizeExec(actor, { namespace: 'test', container: 'absent' }, { spec: { containers: [{ name: 'runtime' }] } }), /TARGET_FORBIDDEN/);
  assert.throws(() => parse({ ...client, namespacePrefixes: ['prod'] }), /policy/);
  assert.throws(() => parse({ ...client, exec: [{ ...client.exec[0], namespacePrefix: 'prod' }] }), /grant/);
  assert.throws(() => parse({ ...client, exec: [{ ...client.exec[0], allContainers: false }] }), /grant/);
  const nova = parse({ ...client, id: 'nova', namespaces: ['kubeclaw'] });
  assert.doesNotThrow(() => authorizeTool(nova, 'get_pod', { namespace: 'kubeclaw' }, 'argocd'));
  assert.doesNotThrow(() => authorizeTool(nova, 'get_pod', { namespace: 'test-future' }, 'argocd'));
  assert.deepEqual(loadOpsMcpConfig({ OPS_ALLOWED_NAMESPACE_PREFIXES: 'TEST' }).namespacePrefixes, ['test']);
});

const config = { namespace: 'kubeclaw-ops', serviceAccount: 'codex-ops-mcp', prefixes: ['test'], roles: ['ops-reader', 'ops-exec'] };
test('reconciler discovers existing and newly created namespaces, repairs drift and excludes other/terminating namespaces', async () => {
  let names = ['test', 'test-old', 'testing', 'kubeclaw', 'prod-test'];
  const stored = new Map(), writes = [];
  const api = async (method, path, body) => {
    if (path.startsWith('/api/v1/namespaces?')) return { items: names.map(name => ({ metadata: { name, ...(name === 'test-deleting' ? { deletionTimestamp: 'now' } : {}) } })) };
    const name = body?.metadata?.name ?? path.split('/').at(-1);
    const key = path.includes('/rolebindings/') ? path : path + '/' + name;
    if (method === 'GET') {
      if (!stored.has(key)) { const error = new Error('not found'); error.status = 404; throw error; }
      return structuredClone(stored.get(key));
    }
    writes.push({ method, path, body });
    stored.set(key, method === 'POST' ? structuredClone(body) : { ...stored.get(key), subjects: body.subjects });
    return {};
  };
  await reconcileNamespaceAccess(config, api);
  assert.equal(writes.length, 6);
  assert.ok(writes.every(x => x.path.split('/')[5].startsWith('test')));
  assert.ok(writes.every(x => x.body.subjects[0].name === 'codex-ops-mcp'));
  await reconcileNamespaceAccess(config, api);
  assert.equal(writes.length, 6, 'stable reconciliation must not write');
  names.push('test-new', 'test-deleting');
  const first = stored.values().next().value;
  first.subjects = [{ kind: 'ServiceAccount', name: 'agent-nova', namespace: 'kubeclaw' }];
  first.metadata.resourceVersion = '42';
  await reconcileNamespaceAccess(config, api);
  assert.equal(writes.length, 9);
  assert.equal(writes.filter(x => x.method === 'PATCH').length, 1);
  assert.equal(writes.find(x => x.method === 'PATCH').body.metadata.resourceVersion, '42');
  assert.ok(writes.every(x => !x.path.includes('test-deleting')));
  names = ['test-new'];
  stored.clear();
  await reconcileNamespaceAccess(config, api);
  assert.equal(writes.length, 11, 'namespace recreation restores bindings');
});

test('reconciler transport rejects off-scope writes and arbitrary APIs before reading a credential', async () => {
  const api = createNamespaceAccessRequest(config, { tokenFile: '/does-not-exist', caFile: '/does-not-exist' });
  for (const [method, path, body] of [
    ['POST', '/apis/rbac.authorization.k8s.io/v1/namespaces/kubeclaw/rolebindings', { metadata: { name: 'ops-reader' } }],
    ['POST', '/apis/rbac.authorization.k8s.io/v1/namespaces/test/rolebindings', { metadata: { name: 'admin' } }],
    ['GET', '/api/v1/namespaces/test/secrets'],
    ['PATCH', '/apis/rbac.authorization.k8s.io/v1/namespaces/test/rolebindings/other', {}],
  ]) assert.throws(() => api(method, path, body), /INVALID_NAMESPACE_ACCESS_REQUEST/);
});

test('a binding collision or API failure cannot prevent other test namespaces being reconciled', async () => {
  const created = [];
  const api = async (method, path, body) => {
    if (path.startsWith('/api/v1/namespaces?')) return { items: ['test-conflict', 'test-next'].map(name => ({ metadata: { name } })) };
    if (method === 'GET' && path.includes('test-conflict')) return { metadata: {}, roleRef: {} };
    if (method === 'GET') { const error = new Error('not found'); error.status = 404; throw error; }
    created.push(body);
    return {};
  };
  await assert.rejects(reconcileNamespaceAccess(config, api), error => error.failures.length === 2);
  assert.equal(created.length, 2);
  assert.ok(created.every(x => x.metadata.namespace === 'test-next'));
});

test('exact Helm-owned reader grants satisfy broad reconciliation without ownership changes', async () => {
  const broad = { ...config, allNonSystemNamespaces: true };
  const names = ['argocd', 'kubeclaw', 'kubeclaw-ops', 'spire-server', 'spire-system', 'tailscale', 'test-new'];
  const writes = [];
  const api = async (method, path, body) => {
    if (path.startsWith('/api/v1/namespaces?')) return { items: names.map(name => ({ metadata: { name } })) };
    if (method === 'GET' && !path.includes('test-new') && path.endsWith('/ops-reader')) return {
      metadata: { annotations: { 'argocd.argoproj.io/tracking-id': 'codex-ops' } },
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'ops-reader' },
      subjects: [{ kind: 'ServiceAccount', name: broad.serviceAccount, namespace: broad.namespace, apiGroup: '' }],
    };
    if (method === 'GET') { const error = new Error('not found'); error.status = 404; throw error; }
    writes.push({ method, body }); return {};
  };
  await reconcileNamespaceAccess(broad, api);
  assert.equal(writes.length, 8, 'six exec grants plus both grants for the new namespace');
  assert.ok(writes.every(write => write.method === 'POST'));
  assert.equal(writes.filter(write => write.body.metadata.name === 'ops-reader').length, 1);
  assert.equal(writes.find(write => write.body.metadata.name === 'ops-reader').body.metadata.namespace, 'test-new');
});

test('unowned grants with different roles or subjects remain collisions and are never patched', async () => {
  const matching = { metadata: {},
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'ops-reader' },
    subjects: [{ kind: 'ServiceAccount', name: config.serviceAccount, namespace: config.namespace }],
  };
  for (const changed of [
    { roleRef: { ...matching.roleRef, name: 'cluster-admin' } },
    { roleRef: { ...matching.roleRef, kind: 'Role' } },
    { roleRef: { ...matching.roleRef, apiGroup: 'other' } },
    { subjects: [] }, { subjects: [...matching.subjects, ...matching.subjects] },
    { subjects: [{ ...matching.subjects[0], name: 'other' }] },
    { subjects: [{ ...matching.subjects[0], namespace: 'other' }] },
    { subjects: [{ ...matching.subjects[0], kind: 'User' }] },
    { subjects: [{ ...matching.subjects[0], apiGroup: 'rbac.authorization.k8s.io' }] },
  ]) {
    const api = async (method, path) => {
      if (path.startsWith('/api/v1/namespaces?')) return { items: [{ metadata: { name: 'test' } }] };
      assert.equal(method, 'GET', 'collisions must never cause writes');
      if (path.endsWith('/ops-reader')) return { ...structuredClone(matching), ...changed };
      return { ...structuredClone(matching), metadata: { labels: { 'ops.kubeclaw.io/namespace-access': 'true' } },
        roleRef: { ...matching.roleRef, name: 'ops-exec' } };
    };
    await assert.rejects(reconcileNamespaceAccess(config, api), error => {
      assert.deepEqual(error.failures, [{ namespace: 'test', role: 'ops-reader', error: 'NAMESPACE_ACCESS_BINDING_COLLISION' }]);
      return true;
    });
  }
});
