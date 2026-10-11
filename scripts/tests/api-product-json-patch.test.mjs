import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { apiProductSelection, jsonPatchSelectedEntries, inheritedSecretFieldSelection, serializedSecretFieldSelection, jsonSecretFieldSelection, versionedApiReceiverRegistries } from '../docs-api-product-scope.mjs';

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
      sourceDigest:createHash('sha256').update(bytes).digest('hex'),requestMethod:'MethodPatch',inferredIdentity:true}],
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

function serializedSecret() {
  return {...inheritedSecret(),operation:'source-bound-kubernetes-get-serialized-text-transform-apply',
    sourceReceiver:{apiVersion:'v1',kind:'Secret',requestMethod:'GET',format:'yaml',
      nameExpression:'${3:-$name}',namespaceExpression:'$SRC_NS'},
    removedPaths:[],rewrittenPaths:[],unknownLiveValues:true,
    serializedTransforms:[{tool:'sed',argv:['s/namespace: ${SRC_NS}/namespace: ${target_namespace}/'],
      inputFormat:'yaml',scope:'first matching text sequence per line',patternTemplate:'namespace: ${SRC_NS}',
      replacementTemplate:'namespace: ${target_namespace}',sourceNamespaceExpression:'$SRC_NS',
      targetNamespaceExpression:'${2:-$NAMESPACE}'}]};
}
test('serialized Secret transfer preserves server metadata without inventing a structural namespace rewrite', () => {
  const transfer=serializedSecret(),selected=serializedSecretFieldSelection('v1','Secret',transfer);
  for(const field of ['$.metadata.uid','$.metadata.resourceVersion','$.metadata.creationTimestamp','$.metadata.ownerReferences','$.metadata.finalizers'])assert(selected.metadataPaths.includes(field),field);
  assert(selected.boundaries.some(row=>row.fieldPath==='$.data'));
  assert(selected.boundaries.some(row=>row.fieldPath==='$.immutable'));
  assert.deepEqual(selected.rewrites,[]);
  assert.match(selected.valueStatus,/not a structural namespace rewrite/);
});
test('serialized Secret transfer rejects changed text transforms, field filters and claimed live values', () => {
  for(const mutate of [t=>t.serializedTransforms[0].argv[0]+='g',
    t=>t.serializedTransforms[0].tool='awk',t=>t.serializedTransforms[0].scope='all matches',
    t=>t.rewrittenPaths.push({fieldPath:'$.metadata.namespace',value:'target'}),
    t=>t.removedPaths.push('$.metadata.uid'),t=>t.unknownLiveValues=false,
    t=>t.retainedRootFields.push('inventedField'),
    t=>{t.retainedRootFields=t.retainedRootFields.filter(f=>f!=='data');t.excludedRootFields.push('data');},
    t=>t.sourceReceiver.kind='ConfigMap']){
    const transfer=serializedSecret();mutate(transfer);
    assert.throws(()=>serializedSecretFieldSelection('v1','Secret',transfer),/SERIALIZED_SECRET_|INHERITED_SECRET_/);
  }
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
    assert.throws(()=>selectValue(value),/API_PRODUCT_FIELD_OUTSIDE_AUTHORITY/);
    delete value.spec.template.spec.containers.__docsSupportedSequenceAppend.items[0].inventedUnservedField;
    value.spec.template.spec.containers.__docsSupportedSequenceAppend.spread=true;
    assert.throws(()=>selectValue(value),/SEQUENCE_APPEND_UNQUALIFIED/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});


test('native partial lease PATCH resolves inherited finalizers through ObjectMeta authority', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'api-native-finalizers-'));
  try {
    const value={apiVersion:'kubeclaw.forgestack.ai/v1alpha1',kind:'BusterNamespaceLease',
      metadata:{finalizers:{__docsDynamicExpression:'append(item.Metadata.Finalizers, c.finalizer)',
        __docsSupportedSequenceAppend:{items:[{__docsDynamicExpression:'c.finalizer'}],spread:false}}}};
    const bytes=YAML.stringify(value);fs.writeFileSync(path.join(root,'finalizers.yaml'),bytes);
    const selected=apiProductSelection(value.apiVersion,value.kind,[{path:'finalizers.yaml',document:0,
      requestMethod:'MethodPatch',sourceDigest:createHash('sha256').update(bytes).digest('hex')}],[],root);
    assert.ok(selected.metadataPaths.includes('$.metadata.finalizers'));
    assert.ok(selected.metadataPaths.includes('$.metadata.finalizers[]'));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});


test('source-bound range templates select authored subject fields without inventing a singleton', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'api-range-subjects-'));
  try {
    const value={apiVersion:'rbac.authorization.k8s.io/v1',kind:'RoleBinding',metadata:{name:'binding'},
      roleRef:{apiGroup:'rbac.authorization.k8s.io',kind:'Role',name:'role'},
      subjects:{__docsDynamicExpression:'subjects',__docsSupportedSequenceTransform:{operation:'range-append',
        items:[{kind:'ServiceAccount',name:{__docsDynamicExpression:'account.Name'},namespace:{__docsDynamicExpression:'account.Namespace'}}],
        sourceExpression:'accounts',cardinality:'unknown-runtime-count'}}};
    const selectValue=()=>{
      const bytes=YAML.stringify(value);fs.writeFileSync(path.join(root,'subjects.yaml'),bytes);
      return apiProductSelection(value.apiVersion,value.kind,[{path:'subjects.yaml',document:0,
        requestMethod:'MethodPost',sourceDigest:createHash('sha256').update(bytes).digest('hex')}],
        versionedApiReceiverRegistries.get(value.apiVersion),root);
    };
    const selected=selectValue(),evidence=selected.applicability['$.subjects[].name'][0];
    assert.equal(evidence.fieldPath,'$.subjects[].name');
    assert.equal(evidence.cardinality,'unknown-runtime-count');
    assert.equal(evidence.sourceTemplateOrdinal,0);
    assert.equal(Object.hasOwn(evidence,'appendedItemOrdinal'),false);
    value.subjects.__docsSupportedSequenceTransform.items[0].inventedUnservedField=true;
    assert.throws(selectValue,/API_PRODUCT_FIELD_OUTSIDE_AUTHORITY/);
    delete value.subjects.__docsSupportedSequenceTransform.items[0].inventedUnservedField;
    value.subjects.__docsSupportedSequenceTransform.operation='unknown-transform';
    assert.throws(selectValue,/SEQUENCE_APPEND_UNQUALIFIED/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

function selectPartialMerge(value, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-partial-merge-'));
  try {
    const bytes = YAML.stringify(value);
    fs.writeFileSync(path.join(root, 'patch.yaml'), bytes);
    const context = {path:'patch.yaml',document:0,
      sourceDigest:createHash('sha256').update(bytes).digest('hex'),requestMethod:'PATCH',requestPatchType:'merge',
      requestReceiver:{apiVersion:'v1',kind:'Secret',name:'$name',nameExpression:'$name',namespaceExpression:'$namespace'},
      ...overrides};
    return apiProductSelection('v1','Secret',[context],versionedApiReceiverRegistries.get('v1'),root);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}

test('receiver-qualified partial Secret merge selects submitted data without invented identity or defaults', () => {
  const selected = selectPartialMerge({data:{'actual-key':'c2VjcmV0'}});
  assert.ok(selected.fieldPaths.includes('$.data'));
  assert.equal(selected.fieldPaths.includes('$.apiVersion'),false);
  assert.equal(selected.fieldPaths.includes('$.kind'),false);
  assert.equal(selected.fieldPaths.includes('$.type'),false);
  assert.equal(selected.fieldPaths.includes('$.immutable'),false);
  assert.equal(selected.metadataPaths.length,0);
  assert.equal(selected.applicability['$.data'][0].requestReceiver.name,'$name');
  assert.equal(selected.applicability['$.data'][0].requestPatchType,'merge');
});

test('partial merge rejects missing receivers, conflicting identities and non-object request bodies', () => {
  for (const overrides of [
    {requestReceiver:undefined},
    {requestReceiver:{apiVersion:'v1',kind:'ConfigMap',name:'$name'}},
    {requestReceiver:{apiVersion:'apps/v1',kind:'Secret',name:'$name'}},
    {requestReceiver:{apiVersion:'v1',kind:'Secret',name:' '}},
    {requestMethod:'POST'},
  ]) assert.throws(()=>selectPartialMerge({data:{key:'eA=='}},overrides),/API_PRODUCT_MERGE_PATCH_RECEIVER_UNQUALIFIED/);
  for (const value of [[],null,'body']) assert.throws(()=>selectPartialMerge(value),/API_PRODUCT_MERGE_PATCH_BODY_UNQUALIFIED/);
  for (const value of [{kind:'ConfigMap',data:{}},{apiVersion:'apps/v1',data:{}}])
    assert.throws(()=>selectPartialMerge(value),/API_PRODUCT_MERGE_PATCH_IDENTITY_CONFLICT/);
  assert.throws(()=>selectPartialMerge({data:{}},{requestPatchType:undefined}),/API_PRODUCT_RESOURCE_DRIFT/);
});

function jsonSecret() { return {
  "operation": "source-bound-kubernetes-get-json-field-transform-apply",
  "sourceReceiver": {
    "apiVersion": "v1",
    "kind": "Secret",
    "resource": "secret",
    "requestMethod": "GET",
    "format": "json",
    "name": "litellm-secrets",
    "nameExpression": "litellm-secrets",
    "namespaceExpression": "$NAMESPACE"
  },
  "retainedRootFields": [
    "apiVersion",
    "kind",
    "metadata",
    "data",
    "immutable",
    "type"
  ],
  "excludedRootFields": [
    "stringData"
  ],
  "removedPaths": [],
  "rewrittenPaths": [
    {
      "fieldPath": "$.data.DATABASE_URL",
      "valueStatus": "source-derived-base64-of-selected-decoded-url-text"
    }
  ],
  "structuredTransforms": [
    {
      "tool": "jq",
      "argv": [
        "--arg",
        "val",
        "$(echo -n \"$new_url\" | base64 -w0)",
        ".data.DATABASE_URL = $val"
      ],
      "fieldPath": "$.data.DATABASE_URL",
      "valueSource": {
        "GETjsonpath": ".data.DATABASE_URL",
        "decode": "base64 -d",
        "textTransform": {
          "tool": "sed",
          "argv": [
            "s/${SRC_NS}/${NAMESPACE}/g"
          ],
          "patternExpression": "${SRC_NS}",
          "replacementExpression": "${NAMESPACE}",
          "scope": "global BRE per line (not literal/structural namespace guarantee)"
        },
        "encode": "base64 -w0"
      }
    }
  ],
  "unknownLiveValues": true
}; }

test('JSON Secret field transfer retains server metadata and records a symbolic DATABASE_URL rewrite', () => {
  const selected=jsonSecretFieldSelection('v1','Secret',jsonSecret());
  assert.ok(selected.metadataPaths.includes('$.metadata.uid'));
  assert.ok(selected.metadataPaths.includes('$.metadata.resourceVersion'));
  assert.ok(selected.boundaries.some(row=>row.fieldPath==='$.data'));
  assert.equal(selected.boundaries.some(row=>row.fieldPath.startsWith('$.stringData')),false);
  assert.deepEqual(selected.rewrites,jsonSecret().rewrittenPaths);
  assert.equal(Object.hasOwn(selected.rewrites[0],'value'),false);
});

test('JSON Secret field transfer rejects changed source, transforms, field filters and invented live values', () => {
  const mutations=[
    t=>{t.sourceReceiver.name='other';}, t=>{t.sourceReceiver.format='yaml';},
    t=>{t.structuredTransforms[0].valueSource.decode='base64';},
    t=>{t.structuredTransforms[0].valueSource.textTransform.argv=['s/${SRC_NS}/${NAMESPACE}/'];},
    t=>{t.structuredTransforms[0].argv[3]='.data.OTHER = $val';},
    t=>{t.rewrittenPaths[0].value='invented';}, t=>{t.removedPaths=['$.metadata.uid'];},
    t=>{t.retainedRootFields=t.retainedRootFields.filter(field=>field!=='metadata');},
    t=>{t.retainedRootFields.push('unknownRoot');},t=>{t.unknownLiveValues=false;},
  ];
  for(const mutate of mutations){const transfer=jsonSecret();mutate(transfer);
    assert.throws(()=>jsonSecretFieldSelection('v1','Secret',transfer),/API_PRODUCT_(?:JSON|INHERITED)_SECRET_/);}
});
