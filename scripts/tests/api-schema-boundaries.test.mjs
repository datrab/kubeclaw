import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
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

test('Cilium presence alternatives retain their conditions and expose all declared directions', () => {
  for (const kind of ['CiliumNetworkPolicy', 'CiliumClusterwideNetworkPolicy']) {
    const rows = apiResourceFieldBoundaries('cilium.io/v2', kind);
    const spec = rows.find((row) => row.fieldPath === '$.spec');
    assert.deepEqual(spec.contract.anyOf.map((branch) => branch.required),
      [['ingress'], ['ingressDeny'], ['egress'], ['egressDeny']]);
    for (const direction of ['ingress', 'ingressDeny', 'egress', 'egressDeny']) {
      assert(rows.some((row) => row.fieldPath === `$.spec.${direction}[]`));
    }
    assert(rows.some((row) => row.fieldPath === '$.spec.egress[].toFQDNs[].matchName'));
    assert.equal(new Set(rows.map((row) => row.fieldPath)).size, rows.length);
  }
});

test('a new structural alternative fails coverage instead of silently losing its field', async () => {
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'api-boundary-mutation-'));
  const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  try {
    fs.mkdirSync(path.join(temporary, 'scripts/vendor/api-authorities'), { recursive: true });
    for (const name of ['docs-api-schema-authorities.mjs', 'yaml-field-path.mjs']) {
      fs.copyFileSync(path.join(repository, 'scripts', name), path.join(temporary, 'scripts', name));
    }
    fs.symlinkSync(path.join(repository, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    const lock = JSON.parse(fs.readFileSync(path.join(repository, 'scripts/docs-api-authority-lock.json')));
    const swagger = JSON.parse(gunzipSync(fs.readFileSync(path.join(repository, lock.kubernetes.path))));
    const variants = [
      { properties: { newlyExposedAlternative: { type: 'string' } } },
      { allOf: [{ properties: { newlyExposedAlternative: { type: 'string' } } }] },
      { allOf: [{ patternProperties: { '^newlyExposed': { type: 'string' } } }] },
    ];
    const spec = swagger.definitions['io.k8s.api.core.v1.Service'].properties.spec;
    const originalSpec = structuredClone(spec);
    const mutations = variants.map(branch => ({ anyOf: [branch] }));
    for (const keyword of ['prefixItems', 'contains', 'additionalItems', 'unevaluatedItems', 'unevaluatedProperties']) {
      const fragment = keyword === 'prefixItems'
        ? [{ properties: { lostChild: { type: 'string' } } }]
        : { properties: { lostChild: { type: 'string' } } };
      mutations.push({ [keyword]: fragment }, { anyOf: [{ [keyword]: fragment }] });
    }
    mutations.push({ oneOf: [{ type: 'string', unknownNestedConstraint: true }] });
    mutations.push({ propertyNames: { type: 'string', unknownNestedConstraint: true } });
    swagger.definitions['io.k8s.example.HiddenNameConstraint'] = {
      type: 'string', unknownReferencedConstraint: true,
    };
    mutations.push({ propertyNames: { $ref: '#/definitions/io.k8s.example.HiddenNameConstraint' } });
    mutations.push({ items: false }, { items: true }, { anyOf: [{ items: false }] });
    for (const [index, mutation] of mutations.entries()) {
      swagger.definitions['io.k8s.api.core.v1.Service'].properties.spec = { ...originalSpec, ...mutation };
      const bytes = Buffer.from(JSON.stringify(swagger));
      const compressed = gzipSync(bytes);
      Object.assign(lock.kubernetes, { contentSha256: digest(bytes), compressedSha256: digest(compressed), compressedSize: compressed.length });
      fs.writeFileSync(path.join(temporary, lock.kubernetes.path), compressed);
      const lockBytes = `${JSON.stringify(lock)}\n`;
      fs.writeFileSync(path.join(temporary, 'scripts/docs-api-authority-lock.json'), lockBytes);
      fs.writeFileSync(path.join(temporary, 'scripts/docs-api-authority-lock.sha256'), `${digest(lockBytes)}  docs-api-authority-lock.json\n`);
      const fixture = await import(`${pathToFileURL(path.join(temporary, 'scripts/docs-api-schema-authorities.mjs')).href}?variant=${index}`);
      assert.throws(() => fixture.apiResourceFieldBoundaries('v1', 'Service'),
        /API_SCHEMA_(?:COMPOSITION_BOUNDARY|STRUCTURAL_BRANCH|COLLECTION_KEYWORD)_UNQUALIFIED/);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
