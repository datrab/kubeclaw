import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBusterNamespaceLease,
  buildK8sSuiteNamespace,
  buildLocalServiceHealthUrl,
  kubectlOutputLooksLikeHtml,
  normalizeTestCredentialSpecs,
  renderManifestForK8sSuite,
  renderManifestForK8sSuiteWithStats,
  resolveK8sLocalRegistry,
  shouldUsePortForwardHealthCheck,
  validateK8sServicePort,
} from '../../../../../skills/buster/pipeline/suites/k8s.ts';

test('renderManifestForK8sSuite rejects cluster-scoped manifests', () => {
  const manifest = `
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: unsafe-role
rules: []
`;

  assert.throws(
    () => renderManifestForK8sSuite(manifest, 'app', 'registry/app:test', 'buster-test'),
    /cluster-scoped resources: ClusterRole\/unsafe-role/,
  );
});

test('renderManifestForK8sSuite rejects cluster-scoped manifests inside lists', () => {
  const manifest = `
apiVersion: v1
kind: List
items:
  - apiVersion: apiextensions.k8s.io/v1
    kind: CustomResourceDefinition
    metadata:
      name: widgets.example.com
    spec: {}
`;

  assert.throws(
    () => renderManifestForK8sSuite(manifest, 'app', 'registry/app:test', 'buster-test'),
    /cluster-scoped resources: CustomResourceDefinition\/widgets.example.com/,
  );
});

test('renderManifestForK8sSuite still rewrites namespaced manifests', () => {
  const manifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: prod
spec:
  template:
    spec:
      initContainers:
        - name: migrate
          image: example.com/app-migrate:old
      containers:
        - name: app
          image: example.com/app:old
`;

  const rendered = renderManifestForK8sSuite(manifest, 'app', 'registry/app:test', 'buster-test');

  assert.match(rendered, /namespace: buster-test/);
  assert.equal(rendered.match(/image: registry\/app:test/g)?.length, 2);
  assert.doesNotMatch(rendered, /namespace: prod/);
});

test('renderManifestForK8sSuiteWithStats reports zero image matches', () => {
  const manifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
spec:
  template:
    spec:
      containers:
        - name: worker
          image: registry.example.com/worker:old
`;

  const rendered = renderManifestForK8sSuiteWithStats(manifest, 'app', 'registry/app:test', 'buster-test');

  assert.equal(rendered.imageRewrites, 0);
  assert.match(rendered.content, /image: registry.example.com\/worker:old/);
  assert.doesNotMatch(rendered.content, /image: registry\/app:test/);
});

test('renderManifestForK8sSuite does not rewrite substring image collisions', () => {
  const manifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: helper
spec:
  template:
    spec:
      initContainers:
        - name: helper-init
          image: registry.example.com/my-app-helper:old
      containers:
        - name: helper
          image: registry.example.com/my-app-helper:old
`;

  const rendered = renderManifestForK8sSuiteWithStats(manifest, 'app', 'registry/app:test', 'buster-test');

  assert.equal(rendered.imageRewrites, 0);
  assert.match(rendered.content, /image: registry.example.com\/my-app-helper:old/);
  assert.doesNotMatch(rendered.content, /image: registry\/app:test/);
});

test('buildK8sSuiteNamespace normalizes unsafe project names', () => {
  const namespace = buildK8sSuiteNamespace('test', 'My_App/../Prod', 'abc123');

  assert.equal(namespace, 'test-my-app-prod-abc123');
  assert.match(namespace, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  assert.ok(namespace.length <= 63);
});

test('buildK8sSuiteNamespace truncates project segment while preserving suffix', () => {
  const namespace = buildK8sSuiteNamespace('test', `${'Project_'.repeat(20)}Tail`, 'xyz789');

  assert.ok(namespace.length <= 63);
  assert.match(namespace, /^test-[a-z0-9-]+-xyz789$/);
  assert.match(namespace, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
});

test('buildLocalServiceHealthUrl points service checks at the local port-forward', () => {
  assert.equal(buildLocalServiceHealthUrl(49152, '/ready'), 'http://127.0.0.1:49152/ready');
  assert.equal(buildLocalServiceHealthUrl(49152, 'ready'), 'http://127.0.0.1:49152/ready');
});

test('shouldUsePortForwardHealthCheck skips port-forward for final-preview Tailscale exposure', () => {
  assert.equal(shouldUsePortForwardHealthCheck({ purpose: 'final-preview', previewExposureProvider: 'tailscale-ingress' }), false);
  assert.equal(shouldUsePortForwardHealthCheck({ purpose: 'final-preview', previewExposureProvider: 'off' }), true);
  assert.equal(shouldUsePortForwardHealthCheck({ purpose: 'pretest', previewExposureProvider: 'off' }), true);
});

test('resolveK8sLocalRegistry requires deployment-provided registry authority', () => {
  assert.equal(
    resolveK8sLocalRegistry({ KUBECLAW_LOCAL_REGISTRY: 'http://registry-local.kubeclaw.svc.cluster.local:5001/' }),
    'registry-local.kubeclaw.svc.cluster.local:5001',
  );
  assert.throws(
    () => resolveK8sLocalRegistry({}),
    /KUBECLAW_LOCAL_REGISTRY is required deployment infrastructure env/,
  );
});

test('validateK8sServicePort accepts only Kubernetes service port integers', () => {
  assert.equal(validateK8sServicePort(1), true);
  assert.equal(validateK8sServicePort(65535), true);
  assert.equal(validateK8sServicePort(0), false);
  assert.equal(validateK8sServicePort(70000), false);
  assert.equal(validateK8sServicePort(3000.5), false);
});

test('normalizeTestCredentialSpecs keeps only explicit app test credential keys', () => {
  const specs = normalizeTestCredentialSpecs({
    test_credentials: [
      { secret_name: 'app-preview-login', keys: ['username', 'password'], purpose: 'login' },
      { secret_name: 'ghcr-secret', keys: [] },
      { secret_name: '../bad', keys: ['token'] },
    ],
  }, {
    reveal_credentials: true,
    credentials_secret_name: 'final-preview-login',
    credentials_keys: ['code'],
  });

  assert.deepEqual(specs, [
    {
      secretName: 'app-preview-login',
      keys: ['username', 'password'],
      purpose: 'login',
    },
    {
      secretName: 'final-preview-login',
      keys: ['code'],
      purpose: 'final-preview login',
    },
  ]);
});

test('kubectlOutputLooksLikeHtml identifies proxy HTML responses', () => {
  assert.equal(kubectlOutputLooksLikeHtml('<html><body>bad gateway</body></html>'), true);
  assert.equal(kubectlOutputLooksLikeHtml('   <!doctype html><html></html>'), true);
  assert.equal(kubectlOutputLooksLikeHtml('{"major":"1","minor":"30"}'), false);
});

test('buildBusterNamespaceLease builds canonical namespace controller object', () => {
  const lease = buildBusterNamespaceLease({
    leaseName: 'test-project-abc123',
    namespaceName: 'test-project-abc123',
    namespacePrefix: 'test',
    serviceName: 'web',
    secretsToCopy: ['app-secret'],
    payload: { run_id: 'run-1', project: 'project-a', module_id: 'web', attempt: 1 },
    ttlSeconds: 7200,
    cleanupPolicy: 'delete',
    purpose: 'final-preview',
    exposure: { provider: 'tailscale-ingress', serviceName: 'web', servicePort: 3000 },
  });

  assert.equal(lease.apiVersion, 'kubeclaw.forgestack.ai/v1alpha1');
  assert.equal(lease.kind, 'BusterNamespaceLease');
  assert.equal(lease.metadata.name, 'test-project-abc123');
  assert.equal(lease.metadata.namespace, 'kubeclaw');
  assert.equal(lease.spec.namespaceName, 'test-project-abc123');
  assert.equal(lease.spec.namespacePrefix, 'test');
  assert.equal(lease.spec.runId, 'run-1');
  assert.equal(lease.spec.project, 'project-a');
  assert.deepEqual(lease.spec.secretsToCopy, ['app-secret']);
  assert.equal(lease.spec.exposure.provider, 'tailscale-ingress');
});
