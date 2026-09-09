import assert from 'node:assert/strict';
import path from 'node:path';

// Real ServiceAccount TokenRequest -> authentication -> original RBAC -> original VAP.
// Rendering a Deployment does not install it: only the explicit safe kind set below is posted.
export async function runNamespaceFenceMatrix({ request, run, chart, convert, record, sleep }) {
  const results = [];
  const check = async (label, method, url, body, expected, options) => {
    const response = await request(method, url, body, options);
    results.push({ label, method, url, ...response }); record('native-fence-matrix.json', results);
    assert.equal(response.status, expected, `${label}: ${response.body}`);
    return JSON.parse(response.body);
  };
  const render = (template, namespace, release, prefix) => run(process.env.HELM ?? 'helm', ['template', release, chart, '-n', namespace, '-f', path.resolve(chart, '../../my-values/buster-values.yaml'), '--show-only', `templates/${template}`, '--set', 'agentRole=buster', '--set', 'busterNamespaceBroker.enabled=true', '--set', `busterNamespaceBroker.allowedPrefixes[0]=${prefix}`, '--set', 'runtimeInfrastructure.registry.endpoint=http://registry.render-test:5000', '--set', 'runtimeInfrastructure.registry.transport=http-lab']);
  const namespaceBody = (name, managed = false) => ({ apiVersion: 'v1', kind: 'Namespace', metadata: { name, ...(managed ? { labels: { 'kubeclaw/managed-by': 'buster-namespace-controller' } } : {}) } });
  for (const [namespace, release, prefix] of [['native-alternate-a', 'native-a', 'proofa'], ['native-alternate-b', 'native-b', 'proofb']]) {
    await check(`${namespace}: namespace`, 'POST', '/api/v1/namespaces', namespaceBody(namespace), 201);
    const controllerYaml = render('buster-namespace-controller.yaml', namespace, release, prefix);
    const fenceYaml = render('buster-namespace-fence.yaml', namespace, release, prefix);
    record(`${namespace}-original-controller.yaml`, controllerYaml);
    record(`${namespace}-original-fence.yaml`, fenceYaml);
    const controllerResources = convert(controllerYaml).items;
    const routes = { ServiceAccount: `/api/v1/namespaces/${namespace}/serviceaccounts`, ClusterRole: '/apis/rbac.authorization.k8s.io/v1/clusterroles', ClusterRoleBinding: '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings', Role: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/roles`, RoleBinding: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/rolebindings` };
    for (const item of controllerResources) {
      if (item.kind === 'Deployment') continue;
      assert(routes[item.kind], `Unexpected resource kind ${item.kind}; refuse installation`);
      const previous = item.kind === 'ClusterRole' ? await request('GET', `${routes[item.kind]}/${item.metadata.name}`) : undefined;
      if (previous?.status === 200) {
        assert.deepEqual(JSON.parse(previous.body).rules, item.rules, 'Shared original ClusterRole rules differ across namespace variants');
      } else {
        await check(`${namespace}: install ${item.kind}`, 'POST', routes[item.kind], item, 201);
      }
    }
    const sa = controllerResources.find(item => item.kind === 'ServiceAccount');
    assert(sa && sa.metadata.namespace === namespace);
    const tokenResponse = await request('POST', `/api/v1/namespaces/${namespace}/serviceaccounts/${sa.metadata.name}/token`, { apiVersion: 'authentication.k8s.io/v1', kind: 'TokenRequest', spec: { audiences: ['https://127.0.0.1'], expirationSeconds: 600 } });
    assert.equal(tokenResponse.status, 201, tokenResponse.body);
    const saToken = JSON.parse(tokenResponse.body).status.token;
    const reviewed = await request('POST', '/apis/authentication.k8s.io/v1/tokenreviews', { apiVersion: 'authentication.k8s.io/v1', kind: 'TokenReview', spec: { token: saToken, audiences: ['https://127.0.0.1'] } });
    assert.equal(reviewed.status, 201);
    const identity = JSON.parse(reviewed.body).status;
    assert.equal(identity.authenticated, true);
    assert.equal(identity.user.username, `system:serviceaccount:${namespace}:${sa.metadata.name}`);
    results.push({ label: `${namespace}: genuine authenticated identity`, identity }); record('native-fence-matrix.json', results);
    for (const item of convert(fenceYaml).items) {
      const route = { ValidatingAdmissionPolicy: 'validatingadmissionpolicies', ValidatingAdmissionPolicyBinding: 'validatingadmissionpolicybindings' }[item.kind];
      assert(route);
      await check(`${namespace}: install ${item.kind}`, 'POST', `/apis/admissionregistration.k8s.io/v1/${route}`, item, 201);
    }
    // Admission caches are asynchronous. A denied dry-run is the readiness barrier;
    // it never creates a forbidden namespace while the new policy is propagating.
    let barrier;
    for (let i = 0; i < 80; i++) {
      barrier = await request('POST', '/api/v1/namespaces?dryRun=All', namespaceBody(`${namespace}-forbidden`), { token: saToken });
      if (barrier.status === 422 && barrier.body.includes('Broker may only')) break;
      await sleep(100);
    }
    results.push({ label: `${namespace}: admission readiness`, ...barrier }); record('native-fence-matrix.json', results);
    assert.equal(barrier.status, 422); assert.match(barrier.body, /Broker may only/);
    const policy = convert(fenceYaml).items.find(item => item.kind === 'ValidatingAdmissionPolicy');
    const installedPolicy = await check(`${namespace}: native policy status`, 'GET', `/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies/${policy.metadata.name}`, undefined, 200);
    assert.equal(installedPolicy.status?.typeChecking?.expressionWarnings?.length ?? 0, 0);
    const allowed = `${prefix}-allowed`;
    await check(`${namespace}: allowed create`, 'POST', '/api/v1/namespaces', namespaceBody(allowed, true), 201, { token: saToken });
    await check(`${namespace}: allowed delete`, 'DELETE', `/api/v1/namespaces/${allowed}`, {}, 200, { token: saToken });
    for (const [label, body] of [['wrong prefix', namespaceBody(`${namespace}-wrong`, true)], ['missing label', namespaceBody(`${prefix}-missing`)]]) {
      const denied = await check(`${namespace}: deny create ${label}`, 'POST', '/api/v1/namespaces', body, 422, { token: saToken });
      assert.match(denied.message, /Broker may only/);
    }
    const deniedDelete = await check(`${namespace}: deny control namespace deletion`, 'DELETE', `/api/v1/namespaces/${namespace}`, {}, 422, { token: saToken });
    assert.match(deniedDelete.message, /Broker may only/);
    const retained = await check(`${namespace}: control namespace retained`, 'GET', `/api/v1/namespaces/${namespace}`, undefined, 200);
    assert.equal(retained.metadata.deletionTimestamp, undefined);
    // The original chart uses one role-derived cluster binding name. These are
    // sequential namespace configurations, not a claim of simultaneous releases.
    for (const binding of controllerResources.filter(item => item.kind === 'ClusterRoleBinding')) {
      await check(`${namespace}: remove own test binding`, 'DELETE', `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${binding.metadata.name}`, {}, 200);
    }
  }
}
