import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { apiProductSelection, jsonPatchSelectedEntries, inheritedSecretFieldSelection, versionedApiReceiverRegistries } from '../docs-api-product-scope.mjs';

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

test('merge patch selects actual submitted fields without full replacement requirements or defaults', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-merge-patch-'));
  try {
    const value = {apiVersion:'apps/v1',kind:'Deployment',spec:{replicas:3}};
    const bytes = YAML.stringify(value);
    fs.writeFileSync(path.join(root,'patch.yaml'),bytes);
    const selected = apiProductSelection(value.apiVersion,value.kind,[{path:'patch.yaml',document:0,
      sourceDigest:createHash('sha256').update(bytes).digest('hex'),requestMethod:'PATCH',inferredIdentity:true}],
      versionedApiReceiverRegistries.get(value.apiVersion),root);
    assert.deepEqual(selected.fieldPaths,['$','$.spec','$.spec.replicas']);
    assert.equal(selected.applicability['$.spec.replicas'][0].reason,'authored-resource-field');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

function inheritedSecret() {
  return {sourceReceiver:{apiVersion:'v1',kind:'Secret',requestMethod:'GET'},
    retainedRootFields:['apiVersion','kind','metadata','data','type','immutable'],excludedRootFields:['stringData'],
    removedPaths:['$.metadata.resourceVersion','$.metadata.uid','$.metadata.creationTimestamp','$.metadata.managedFields',
      '$.metadata.selfLink','$.metadata.generation','$.metadata.ownerReferences','$.metadata.finalizers'],
    rewrittenPaths:[{fieldPath:'$.metadata.namespace',value:{__docsDynamicExpression:'targetNamespace'}}]};
}

test('inherited Secret selection retains served source fields and subtracts actual removed metadata', () => {
  const selected=inheritedSecretFieldSelection('v1','Secret',inheritedSecret());
  const fields=selected.boundaries.map(row=>row.fieldPath);
  assert.ok(fields.includes('$.data'));
  assert.ok(fields.includes('$.type'));
  assert.ok(fields.includes('$.immutable'));
  assert.equal(fields.some(field=>field.startsWith('$.stringData')),false);
  assert.ok(selected.metadataPaths.includes('$.metadata.namespace'));
  assert.ok(selected.metadataPaths.includes('$.metadata.name'));
  for(const removed of inheritedSecret().removedPaths) assert.equal(selected.metadataPaths.some(field=>field===removed||field.startsWith(removed+'.')||field.startsWith(removed+'[')),false);
  assert.deepEqual(selected.rewrites,inheritedSecret().rewrittenPaths);
});

test('inherited source selection refuses unknown fields, receiver drift and removal of its rewritten destination', () => {
  const unknown=inheritedSecret();unknown.retainedRootFields.push('inventedSourceField');
  assert.throws(()=>inheritedSecretFieldSelection('v1','Secret',unknown),/INHERITED_SECRET_FIELD_SET/);
  const receiver=inheritedSecret();receiver.sourceReceiver.kind='ConfigMap';
  assert.throws(()=>inheritedSecretFieldSelection('v1','Secret',receiver),/INHERITED_SECRET_RECEIVER/);
  const namespace=inheritedSecret();namespace.removedPaths.push('$.metadata.namespace');
  assert.throws(()=>inheritedSecretFieldSelection('v1','Secret',namespace),/INHERITED_SECRET_REWRITE/);
});


test('symbolic inherited sequence checks appended authored values without claiming live indices', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'api-inherited-append-'));
  try {
    const value={apiVersion:'apps/v1',kind:'Deployment',spec:{template:{spec:{containers:{__docsDynamicExpression:'append(inherited, container)',
      __docsSupportedSequenceAppend:{items:[{name:'worker',image:'worker:current'}],spread:false}}}}}};
    const selectValue=body=>{
      const bytes=YAML.stringify(body);fs.writeFileSync(path.join(root,'append.yaml'),bytes);
      return apiProductSelection('apps/v1','Deployment',[{path:'append.yaml',document:0,inferredIdentity:true,
        requestMethod:'PATCH',sourceDigest:createHash('sha256').update(bytes).digest('hex')}],
        versionedApiReceiverRegistries.get('apps/v1'),root);
    };
    const selected=selectValue(value);
    const evidence=selected.applicability['$.spec.template.spec.containers[].image'][0];
    assert.equal(evidence.fieldPath,'$.spec.template.spec.containers[].image');
    assert.equal(evidence.appendedItemOrdinal,0);
    assert.match(evidence.itemPosition,/length is unknown/);
    value.spec.template.spec.containers.__docsSupportedSequenceAppend.items[0].inventedUnservedField=true;
    assert.throws(()=>selectValue(value));
    delete value.spec.template.spec.containers.__docsSupportedSequenceAppend.items[0].inventedUnservedField;
    value.spec.template.spec.containers.__docsSupportedSequenceAppend.spread=true;
    assert.throws(()=>selectValue(value),/SEQUENCE_APPEND_UNQUALIFIED/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
