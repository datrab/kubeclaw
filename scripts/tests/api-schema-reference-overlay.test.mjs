import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { apiAuthorityLock, apiFieldCollectionAuthority, apiResourceFieldBoundaries } from '../docs-api-schema-authorities.mjs';
import { jsonPatchSelectedEntries } from '../docs-api-product-scope.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const referenceName = 'io.k8s.api.core.v1.ObjectReference';
const specName = 'io.k8s.api.core.v1.PersistentVolumeSpec';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('pinned PV claimRef retains its field override and original referenced contract', () => {
  const lock = apiAuthorityLock();
  const swagger = JSON.parse(gunzipSync(fs.readFileSync(path.join(repository, lock.kubernetes.path))));
  const edge = swagger.definitions[specName].properties.claimRef;
  const target = swagger.definitions[referenceName];
  assert.equal(edge['x-kubernetes-map-type'], 'granular');
  assert.equal(target['x-kubernetes-map-type'], 'atomic');
  const selected = apiFieldCollectionAuthority('v1', 'PersistentVolume', '$.spec.claimRef');
  assert.equal(selected.authoritySha256, lock.kubernetes.contentSha256);
  assert.equal(selected.contract['x-kubernetes-map-type'], 'granular');
  assert.equal(selected.contract.referencedContract['x-kubernetes-map-type'], 'atomic');
  assert.equal(selected.contract.description, edge.description);
  assert.equal(selected.contract.referencedContract.description, target.description);
  assert.deepEqual(selected.contract.schemaReferenceChain, [edge.$ref]);
  assert.deepEqual(Object.keys(selected.children).sort(), Object.keys(target.properties).sort());
  const rows = apiResourceFieldBoundaries('v1', 'PersistentVolume');
  assert.deepEqual(rows.find(row => row.fieldPath === '$.spec.claimRef').contract, selected.contract);
  for (const name of ['namespace', 'name', 'uid']) {
    assert.equal(rows.find(row => row.fieldPath === `$.spec.claimRef.${name}`).contract.type, 'string');
    const child = apiFieldCollectionAuthority('v1', 'PersistentVolume', `$.spec.claimRef.${name}`);
    assert.equal(child.parent['x-kubernetes-map-type'], 'granular');
    assert.equal(child.parent.referencedContract['x-kubernetes-map-type'], 'atomic');
  }
  // Reusing the same definition without the PV field override stays atomic.
  assert.equal(apiFieldCollectionAuthority('v1', 'Event', '$.involvedObject').contract['x-kubernetes-map-type'], 'atomic');
});

test('remove-qdrant PV patch selects its three binding preconditions and reclaim-policy destination', () => {
  const source = fs.readFileSync(path.join(repository, 'scripts/remove-qdrant.sh'), 'utf8');
  const literals = [...source.matchAll(/"op": "(test|add)", "path": "([^"]+)"/gu)]
    .map(([, op, pointer]) => [op, pointer]);
  assert.deepEqual(literals, [
    ['test', '/spec/claimRef/namespace'], ['test', '/spec/claimRef/name'],
    ['test', '/spec/claimRef/uid'], ['add', '/spec/persistentVolumeReclaimPolicy'],
  ]);
  // Controlled values exercise the actual source-authored pointer sequence.
  // This checks schema selection, not shell execution or live storage effects.
  const values = ['kubeclaw', '__docs_controlled_claim_name__', '__docs_controlled_claim_uid__', 'Delete'];
  const entries = jsonPatchSelectedEntries('v1', 'PersistentVolume',
    literals.map(([op, pointer], index) => ({ op, path: pointer, value: values[index] })));
  assert.deepEqual(entries.map(entry => [entry.actual.join('.'), entry.role, entry.node]), [
    ['spec.claimRef.namespace', 'precondition', values[0]],
    ['spec.claimRef.name', 'precondition', values[1]],
    ['spec.claimRef.uid', 'precondition', values[2]],
    ['spec.persistentVolumeReclaimPolicy', 'destination', 'Delete'],
  ]);
});

test('reference overlay rejects contradictory constraints, unknown annotations and invalid references', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'api-reference-overlay-'));
  try {
    fs.mkdirSync(path.join(temporary, 'scripts/vendor/api-authorities'), { recursive: true });
    fs.copyFileSync(path.join(repository, 'scripts/docs-api-schema-authorities.mjs'), path.join(temporary, 'scripts/docs-api-schema-authorities.mjs'));
    for (const name of ['yaml-field-path.mjs', 'docs-api-output-discovery.mjs']) {
      fs.symlinkSync(path.join(repository, 'scripts', name), path.join(temporary, 'scripts', name));
    }
    fs.symlinkSync(path.join(repository, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    const originalLock = apiAuthorityLock();
    const original = JSON.parse(gunzipSync(fs.readFileSync(path.join(repository, originalLock.kubernetes.path))));
    const variants = [
      ['conflicting type', (edge) => { edge.type = 'string'; }, /API_SCHEMA_REFERENCE_CONFLICT/],
      ['conflicting required', (edge, target) => { edge.required = ['name']; target.required = ['uid']; }, /API_SCHEMA_REFERENCE_CONFLICT/],
      ['conflicting additionalProperties', (edge, target) => { edge.additionalProperties = false; target.additionalProperties = true; }, /API_SCHEMA_REFERENCE_CONFLICT/],
      ['unknown edge annotation', edge => { edge['x-kubernetes-unreviewed-map-option'] = true; }, /API_SCHEMA_COLLECTION_KEYWORD_UNQUALIFIED/],
      ['unknown target annotation', (edge, target) => { target['x-kubernetes-unreviewed-map-option'] = true; }, /API_SCHEMA_COLLECTION_KEYWORD_UNQUALIFIED/],
      ['invalid edge map type', edge => { edge['x-kubernetes-map-type'] = 'separable'; }, /API_SCHEMA_REFERENCE_MAP_TYPE_UNQUALIFIED/],
      ['invalid target map type', (edge, target) => { target['x-kubernetes-map-type'] = 'unreviewed'; }, /API_SCHEMA_REFERENCE_MAP_TYPE_UNQUALIFIED/],
      ['map annotation on scalar', (edge, target) => { target.type = 'string'; }, /API_SCHEMA_REFERENCE_MAP_TYPE_UNQUALIFIED/],
      ['map annotation on array', (edge, target) => { target.type = 'array'; target.items = { type: 'string' }; }, /API_SCHEMA_REFERENCE_MAP_TYPE_UNQUALIFIED/],
      ['missing reference', edge => { edge.$ref = '#/definitions/io.k8s.example.Missing'; }, /missing OpenAPI definition/],
      ['external reference', edge => { edge.$ref = 'https://example.invalid/schema'; }, /unsupported OpenAPI reference/],
      ['cyclic reference', (edge, target) => { target.$ref = edge.$ref; }, /cyclic OpenAPI reference/],
      ['intermediate constraint conflict', (edge, target, swagger) => {
        const oldRef = edge.$ref;
        edge.$ref = '#/definitions/io.k8s.example.Intermediate';
        edge.minProperties = 1;
        swagger.definitions['io.k8s.example.Intermediate'] = { $ref: oldRef, minProperties: 2 };
      }, /API_SCHEMA_REFERENCE_CONFLICT/],
    ];
    for (const [index, [name, mutate, error]] of variants.entries()) {
      const swagger = structuredClone(original), lock = structuredClone(originalLock);
      mutate(swagger.definitions[specName].properties.claimRef, swagger.definitions[referenceName], swagger);
      const bytes = Buffer.from(JSON.stringify(swagger)), compressed = gzipSync(bytes);
      Object.assign(lock.kubernetes, { contentSha256: digest(bytes), compressedSha256: digest(compressed), compressedSize: compressed.length });
      fs.writeFileSync(path.join(temporary, lock.kubernetes.path), compressed);
      const lockBytes = `${JSON.stringify(lock)}\n`;
      fs.writeFileSync(path.join(temporary, 'scripts/docs-api-authority-lock.json'), lockBytes);
      fs.writeFileSync(path.join(temporary, 'scripts/docs-api-authority-lock.sha256'), `${digest(lockBytes)}  docs-api-authority-lock.json\n`);
      const fixture = await import(`${pathToFileURL(path.join(temporary, 'scripts/docs-api-schema-authorities.mjs')).href}?variant=${index}`);
      assert.throws(() => fixture.apiFieldCollectionAuthority('v1', 'PersistentVolume', '$.spec.claimRef'), error, name);
      assert.throws(() => fixture.apiResourceFieldBoundaries('v1', 'PersistentVolume'), error, name);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
