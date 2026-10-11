import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { apiProductSelection, jsonPatchSelectedEntries, versionedApiReceiverRegistries } from '../docs-api-product-scope.mjs';

const apiVersion = 'admissionregistration.k8s.io/v1';
const kind = 'ValidatingWebhookConfiguration';
function select(patch, apiVersion = 'admissionregistration.k8s.io/v1', kind = 'ValidatingWebhookConfiguration') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-json-patch-'));
  try {
    const bytes = YAML.stringify(patch);
    fs.writeFileSync(path.join(root, 'patch.yaml'), bytes);
    return apiProductSelection(apiVersion, kind, [{path:'patch.yaml', document:0,
      sourceDigest:createHash('sha256').update(bytes).digest('hex'), requestMethod:'PATCH', requestPatchType:'json',
      requestReceiver:{apiVersion,kind,name:'selected-webhook'},patchOperations:patch}], versionedApiReceiverRegistries.get(apiVersion), root);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
}

test('guarded webhook move selects actual preconditions and both move endpoints without create defaults', () => {
  const selected = select([
    {op:'test',path:'/metadata/resourceVersion',value:'123'},
    {op:'test',path:'/webhooks/0/name',value:'second'},
    {op:'test',path:'/webhooks/1/name',value:'first'},
    {op:'move',from:'/webhooks/1',path:'/webhooks/0'},
  ]);
  assert.ok(selected.metadataPaths.includes('$.metadata.resourceVersion'));
  assert.ok(selected.fieldPaths.includes('$.webhooks[].name'));
  assert.deepEqual(selected.applicability['$.webhooks[]'].filter(row=>row.operation==='move').map(row=>[row.role,row.fieldPath]),
    [['destination','$.webhooks[0]'],['source','$.webhooks[1]']]);
  assert.equal(selected.fieldPaths.includes('$.webhooks[].failurePolicy'),false);
  assert.equal(selected.fieldPaths.includes('$.webhooks[].clientConfig'),false);
  assert.ok(Object.values(selected.applicability).flat().every(row=>row.reason.startsWith('json-patch-')));
});

test('new selected metadata label preserves escaped literal key and its actual patch effect', () => {
  const selected = select([{op:'add',path:'/metadata/labels/example.invalid~1selected~0key',value:'yes'}]);
  assert.ok(selected.metadataPaths.includes('$.metadata.labels["example.invalid/selected~key"]'));
  const entries=jsonPatchSelectedEntries(apiVersion,kind,[{op:'add',path:'/metadata/labels/0',value:'yes'}]);
  assert.deepEqual(entries[0].actual,['metadata','labels','0']);
});

test('added webhook value selects only submitted descendants and no required sibling', () => {
  const selected = select([{op:'add',path:'/webhooks/-',value:{name:'new-hook'}}]);
  assert.ok(selected.fieldPaths.includes('$.webhooks[].name'));
  assert.equal(selected.fieldPaths.includes('$.webhooks[].clientConfig'),false);
  assert.equal(selected.fieldPaths.includes('$.webhooks[].timeoutSeconds'),false);
});

test('patch pointers and unsupported operations fail explicitly', () => {
  for (const operation of [
    {op:'test',path:'/webhooks/00/name',value:'bad'},
    {op:'test',path:'/webhooks/-/name',value:'bad'},
    {op:'test',path:'/metadata/labels/key~2',value:'bad'},
    {op:'merge',path:'/webhooks',value:[]},
    {op:'move',path:'/webhooks/0'},
    {op:'add',path:'/metadata/labels/key'},
  ]) assert.throws(()=>jsonPatchSelectedEntries(apiVersion,kind,[operation]),/API_PRODUCT_JSON_PATCH_/);
  assert.throws(()=>select([{op:'add',path:'/notAWebhookField',value:'bad'}]),/API_PRODUCT_(?:FIELD|AUTHORED)/);
});

test('partial CSI patch does not materialize an empty-list default or unrelated admission fields', () => {
  const selected = select([{op:'replace',path:'/spec/volumeLifecycleModes',value:[]}], 'storage.k8s.io/v1', 'CSIDriver');
  assert.ok(selected.fieldPaths.includes('$.spec.volumeLifecycleModes'));
  assert.equal(selected.fieldPaths.includes('$.spec.volumeLifecycleModes[]'),false);
  assert.equal(selected.fieldPaths.includes('$.spec.podInfoOnMount'),false);
  assert.ok(Object.values(selected.applicability).flat().every(row=>row.reason.startsWith('json-patch-')));
});
