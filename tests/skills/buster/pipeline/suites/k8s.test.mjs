import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildK8sSuiteNamespace,
  normalizeTestCredentialSpecs,
  renderManifestForK8sSuite,
  renderManifestForK8sSuiteWithStats,
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

test('normalizeTestCredentialSpecs keeps only explicit app test credential keys', () => {
  const specs = normalizeTestCredentialSpecs({
    test_credentials: [
      { secret: 'app-preview-login', keys: ['username', 'password'], purpose: 'login' },
      { secret: 'ghcr-secret', keys: [] },
      { secret: '../bad', keys: ['token'] },
    ],
  }, {
    reveal_credentials: true,
    credentials_ref: 'secret/final-preview-login',
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
