import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { extractRenderedStorePolicy } from '../../scripts/lib/docs-store-policy-rendered.mjs';

const source = 'my-values/infra/registry-local.yaml';
const text = fs.readFileSync(new URL('../../my-values/infra/registry-local.yaml', import.meta.url), 'utf8');
const resources = YAML.parseAllDocuments(text).map(document => ({ source, origin: source,
  value: { ...document.toJSON(), metadata: { ...document.toJSON().metadata, namespace: 'kubeclaw' } },
  line: 1, namespaceAuthority: 'deployment' }));
const selector = { kind: 'rendered-resource', origin: source,
  resource: { kind: 'ConfigMap', name: 'registry-local-config', namespace: 'kubeclaw' },
  path: ['data', 'config.yml'], embeddedYaml: { path: ['storage', 'delete', 'enabled'] } };
const acquire = (s = selector, r = resources) => extractRenderedStorePolicy(source, text, s, r);

test('actual embedded registry policy retains outer source and false without claiming execution', () => {
  const result = acquire();
  assert.equal(result.value, false);
  assert.equal(result.representation, 'selected-native-resource-value');
  assert.equal(result.sourceSha256, createHash('sha256').update(text).digest('hex'));
  assert.equal(result.resourceProvenance.namespaceAuthority, 'deployment');
  assert.equal(result.resourceProvenance.sourceLocationMeaning,
    'Native resource declaration; not the selected field offset');
  assert.equal(Object.hasOwn(result, 'expression'), false);
  const pvc = acquire({ kind: 'rendered-resource', origin: source,
    resource: { kind: 'PersistentVolumeClaim', name: 'registry-local-data', namespace: 'kubeclaw' },
    path: ['spec', 'resources', 'requests', 'storage'] });
  assert.equal(pvc.value, 'REQUIRED_CAPACITY');
});

test('resource identity and source cardinality cannot fall back to another profile or namespace', () => {
  for (const key of ['kind', 'name', 'namespace']) {
    assert.throws(() => acquire({ ...selector, resource: { ...selector.resource, [key]: 'wrong' } }), /expected one exact/u);
  }
  assert.throws(() => acquire({ ...selector, origin: 'other-profile' }), /expected one exact/u);
  assert.throws(() => acquire(selector, resources.map(r => ({ ...r, source: 'other.yaml' }))), /expected one exact/u);
  assert.throws(() => acquire(selector, [...resources, ...resources]), /found 2/u);
  assert.throws(() => extractRenderedStorePolicy(source, text, selector, undefined), /acquisition is required/u);
});

test('guarded positions refuse actual named environment reordering', () => {
  const file = 'my-values/infra/registry-mirror.yaml';
  const raw = fs.readFileSync(new URL('../../my-values/infra/registry-mirror.yaml', import.meta.url), 'utf8');
  const entries = YAML.parseAllDocuments(raw).map(d => ({ source: file, origin: file, line: 1,
    value: { ...d.toJSON(), metadata: { ...d.toJSON().metadata, namespace: 'kubeclaw' } } }));
  const prefix = ['spec', 'template', 'spec', 'containers', 0];
  const select = { kind: 'rendered-resource', origin: file,
    resource: { kind: 'Deployment', name: 'registry-mirror', namespace: 'kubeclaw' },
    path: [...prefix, 'env', 1, 'value'], identityExpectations: [
      { path: [...prefix, 'name'], equals: 'registry' },
      { path: [...prefix, 'env', 1, 'name'], equals: 'REGISTRY_STORAGE_DELETE_ENABLED' },
    ] };
  assert.equal(extractRenderedStorePolicy(file, raw, select, entries).value, 'true');
  const env = entries.find(r => r.value.kind === 'Deployment').value.spec.template.spec.containers[0].env;
  [env[0], env[1]] = [env[1], env[0]];
  assert.throws(() => extractRenderedStorePolicy(file, raw, select, entries), /identity changed/u);
});

test('missing own fields remain distinct from present null, false and empty values', () => {
  const base = { ...selector, path: ['testValue'] }; delete base.embeddedYaml;
  for (const value of [null, false, '', 0]) {
    const entries = resources.map(r => ({ ...r, value: { ...r.value, testValue: value } }));
    assert.deepEqual(acquire(base, entries).value, value);
  }
  assert.throws(() => acquire(base), /missing native resource field/u);
  for (const path of [[], ['__proto__'], ['constructor'], [-1], ['data', 'missing']]) {
    assert.throws(() => acquire({ ...base, path }), /DOC_DRIFT_STORE_POLICY/u);
  }
});

test('embedded YAML rejects ambiguous documents, duplicate keys, aliases and missing values', () => {
  for (const inner of ['[', '---\na: 1\n---\na: 2', 'a: 1\na: 2', 'a: &a true\nb: *a', 'a: 1', false]) {
    const entries = resources.map(r => ({ ...r, value: { ...r.value,
      ...(r.value.kind === 'ConfigMap' ? { data: { 'config.yml': inner } } : {}) } }));
    assert.throws(() => acquire(selector, entries), /DOC_DRIFT_STORE_POLICY/u);
  }
});

test('conditional fixture provenance is retained and absent selected resources never trigger acquisition', () => {
  const fixture = { ...resources.find(r => r.value.kind === 'ConfigMap'), origin: 'policy-only-comparison',
    activationState: 'conditional', activationCondition: 'selected profile disables this resource',
    policyComparisonFixture: { limit: 'Not selected defaults; sizing is a render fixture' } };
  const selected = { ...selector, origin: fixture.origin };
  const before = JSON.stringify(fixture);
  assert.equal(acquire(selected, [fixture]).resourceProvenance.activationState, 'conditional');
  assert.match(acquire(selected, [fixture]).resourceProvenance.policyComparisonFixture.limit, /Not selected defaults/u);
  assert.equal(JSON.stringify(fixture), before);
  assert.throws(() => acquire(selected, resources), /found 0/u);
});
