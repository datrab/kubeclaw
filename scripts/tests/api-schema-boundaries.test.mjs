import assert from 'node:assert/strict';
import test from 'node:test';
import { apiResourceFieldBoundaries, apiFieldCollectionAuthority } from '../docs-api-schema-authorities.mjs';

test('recursive discovery includes unselected Deployment volume alternatives', () => {
  const rows = apiResourceFieldBoundaries('apps/v1', 'Deployment');
  const paths = new Set(rows.map((row) => row.fieldPath));
  assert.equal(paths.size, rows.length);
  for (const path of [
    '$.spec.template.spec.volumes[].awsElasticBlockStore.volumeID',
    '$.spec.template.spec.volumes[].ephemeral.volumeClaimTemplate.spec.dataSourceRef.namespace',
    '$.spec.template.spec.volumes[].projected.sources[].clusterTrustBundle.labelSelector.matchExpressions[].values[]',
    '$.spec.template.spec.initContainers[].securityContext.capabilities.add[]',
    '$.spec.template.spec.containers[].securityContext.capabilities.add[]',
  ]) assert(paths.has(path), `Unselected or reused schema boundary missing: ${path}`);
});

test('array items and map values retain their exact schema constraints and pinned identity', () => {
  const rows = apiResourceFieldBoundaries('networking.k8s.io/v1', 'NetworkPolicy');
  for (const path of ['$.spec.podSelector.matchLabels["*"]', '$.spec.ingress[].ports[].port']) {
    const row = rows.find((entry) => entry.fieldPath === path);
    assert(row, `Missing collection boundary: ${path}`);
    const selected = apiFieldCollectionAuthority(row.apiVersion, row.kind, path);
    assert.deepEqual(row.contract, selected.contract);
    assert.equal(row.authoritySha256, selected.authoritySha256);
  }
  assert.equal(rows.find((row) => row.fieldPath === '$.spec.ingress[].ports[].port').contract.format, 'int-or-string');
});

test('discovery includes status fields separately from spec fields and rejects unknown authorities', () => {
  const rows = apiResourceFieldBoundaries('admissionregistration.k8s.io/v1', 'ValidatingAdmissionPolicy');
  assert(rows.some((row) => row.fieldPath === '$.status.typeChecking.expressionWarnings[].warning'));
  assert(rows.some((row) => row.fieldPath === '$.spec.validations[].messageExpression'));
  assert.throws(() => apiResourceFieldBoundaries('v1', 'UnknownKind'), /API_SCHEMA_AUTHORITY_MISSING/);
});
