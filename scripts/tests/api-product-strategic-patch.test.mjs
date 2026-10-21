import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { apiProductSelection, versionedApiReceiverRegistries } from '../docs-api-product-scope.mjs';

// Exact authored transport body in scripts/deploy.sh, not a reconstructed live Pod.
const retiredTrustPatch = () => ({spec:{template:{spec:{containers:[{name:'kubeclaw',
  env:[{name:'NODE_EXTRA_CA_CERTS',$patch:'delete'}],
  volumeMounts:[{mountPath:'/var/run/buster-plan-trust',$patch:'delete'}]}],
  volumes:[{name:'buster-plan-trust',$patch:'delete'}]}}}});
function select(body, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'api-strategic-patch-'));
  try {
    const bytes = YAML.stringify(body);
    fs.writeFileSync(path.join(root,'patch.yaml'),bytes);
    return apiProductSelection('apps/v1','Deployment',[{path:'patch.yaml',document:0,
      sourceDigest:createHash('sha256').update(bytes).digest('hex'),requestMethod:'PATCH',requestPatchType:'strategic',
      requestReceiver:{apiVersion:'apps/v1',kind:'Deployment',name:'agent-nova',namespaceExpression:'$NAMESPACE'},
      ...overrides}],versionedApiReceiverRegistries.get('apps/v1'),root);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}

test('actual retired trust strategic PATCH selects three delete targets and ancestor container selector', () => {
  const source = fs.readFileSync(new URL('../deploy.sh',import.meta.url),'utf8');
  const constructor = source.slice(source.indexOf('reconcile_nova_retired_trust_mount() {'),
    source.indexOf('reconcile_buster_runtime_ports() {'));
  assert(constructor.includes('--type=strategic --patch'));
  const actualBody = constructor.match(/^\s*'(\{.*\})'$/mu);
  assert(actualBody,'actual strategic request must remain discoverable');
  const body = retiredTrustPatch(), before = structuredClone(body), selected = select(body);
  assert.deepEqual(JSON.parse(actualBody[1]),body);
  assert.deepEqual(body,before);
  const targets = Object.values(selected.applicability).flat().filter(row=>row.role==='delete-target');
  assert.deepEqual(targets.map(row=>row.targetPath),[
    '$.spec.template.spec.containers[].env[]',
    '$.spec.template.spec.containers[].volumeMounts[]',
    '$.spec.template.spec.volumes[]']);
  assert.deepEqual(targets.map(row=>row.selectors.map(({mergeKey,value})=>[mergeKey,value])),[
    [['name','kubeclaw'],['name','NODE_EXTRA_CA_CERTS']],
    [['name','kubeclaw'],['mountPath','/var/run/buster-plan-trust']],
    [['name','buster-plan-trust']]]);
  for(const row of targets) {
    assert.equal(row.operation,'delete');
    assert.equal(row.directive,'$patch');
    assert.equal(row.requestReceiver.name,'agent-nova');
    assert(row.selectors.every(selector=>selector.schemaAuthoritySha256 && selector.patchStrategy.includes('merge')));
  }
  assert(selected.fieldPaths.includes('$.spec.template.spec.containers[].name'));
  for(const field of ['$.spec.template.spec.containers[].env[].name',
    '$.spec.template.spec.containers[].volumeMounts[].mountPath','$.spec.template.spec.volumes[].name'])
    assert.equal(selected.applicability[field][0].role,'delete-selector');
  assert.equal(selected.fieldPaths.some(field=>field.includes('$patch')),false);
  assert.equal(Object.values(selected.applicability).flat().some(row=>/\[\d+\]/u.test(row.fieldPath)),false);
  assert.equal(selected.fieldPaths.includes('$.spec.replicas'),false);
  assert.equal(selected.fieldPaths.includes('$.spec.selector'),false);
  assert.equal(selected.fieldPaths.includes('$.spec.template.spec.containers[].image'),false);
  assert.equal(selected.fieldPaths.includes('$.spec.template.spec.containers[].volumeMounts[].name'),false);
  assert.equal(selected.fieldPaths.includes('$.spec.template.spec.containers[].env[].value'),false);
});

test('strategic PATCH requires an actual matching PATCH receiver and object partial body', () => {
  for(const override of [{requestMethod:'POST'},{requestReceiver:undefined},
    {requestReceiver:{apiVersion:'v1',kind:'Deployment',name:'agent-nova'}},
    {requestReceiver:{apiVersion:'apps/v1',kind:'StatefulSet',name:'agent-nova'}},
    {requestReceiver:{apiVersion:'apps/v1',kind:'Deployment',name:' '}}])
    assert.throws(()=>select(retiredTrustPatch(),override),/STRATEGIC_PATCH_RECEIVER_UNQUALIFIED/);
  for(const body of [null,[],42,'partial']) assert.throws(()=>select(body),/STRATEGIC_PATCH_BODY_UNQUALIFIED/);
  for(const body of [{...retiredTrustPatch(),kind:'Pod'},{...retiredTrustPatch(),apiVersion:'v1'}])
    assert.throws(()=>select(body),/STRATEGIC_PATCH_IDENTITY_CONFLICT/);
});

test('directive transport cannot be relabelled as merge or a complete resource', () => {
  assert.throws(()=>select(retiredTrustPatch(),{requestPatchType:'merge'}),/PATCH_DIRECTIVE_TRANSPORT_UNQUALIFIED/);
  assert.throws(()=>select({...retiredTrustPatch(),apiVersion:'apps/v1',kind:'Deployment'},
    {requestPatchType:undefined}),/PATCH_DIRECTIVE_TRANSPORT_UNQUALIFIED/);
  assert.throws(()=>select(retiredTrustPatch(),{requestPatchType:undefined}),/RESOURCE_DRIFT/);
});

test('unknown directives, map directives and incorrect or extra delete merge keys fail explicitly', () => {
  for(const directive of ['replace','merge','unknown',null]) {
    const body=retiredTrustPatch();body.spec.template.spec.containers[0].env[0].$patch=directive;
    assert.throws(()=>select(body),/STRATEGIC_PATCH_DIRECTIVE_UNSUPPORTED/);
  }
  const bodies = [
    {spec:{$patch:'delete'}},
    {spec:{template:{spec:{containers:[{name:'kubeclaw',volumeMounts:[{name:'wrong-key',$patch:'delete'}]}]}}}},
    {spec:{template:{spec:{containers:[{name:'kubeclaw',env:[{name:'X',value:'ignored',$patch:'delete'}]}]}}}},
    {spec:{template:{spec:{containers:[{env:[{name:'X',$patch:'delete'}]}]}}}},
    {spec:{template:{spec:{imagePullSecrets:[{name:'secret',$retainKeys:['name']}]}}}},
    {spec:{template:{spec:{containers:[{name:'kubeclaw',args:[{$patch:'delete',name:'X'}]}]}}}},
  ];
  for(const body of bodies) assert.throws(()=>select(body),/STRATEGIC_PATCH_(?:DIRECTIVE_UNSUPPORTED|DELETE_SELECTOR_INVALID|MERGE_KEY_REQUIRED)/);
});

test('submitted strategic fields remain recursively checked and avoid CREATE defaults', () => {
  const selected=select({spec:{replicas:0}});
  assert.deepEqual(selected.fieldPaths,['$','$.spec','$.spec.replicas']);
  assert(Object.values(selected.applicability).flat().every(row=>row.reason.startsWith('strategic-patch-')));
  assert.throws(()=>select({spec:{template:{spec:{containers:[{name:'kubeclaw',invented:true}]}}}}),/FIELD_OUTSIDE_AUTHORITY/);
});
