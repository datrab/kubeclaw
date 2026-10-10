import test from 'node:test';
import assert from 'node:assert/strict';
import {receiverContracts as metadata,implicitKubernetesObjectMetaContracts as implicit} from '../docs-kubernetes-metadata-receiver-contracts.mjs';
import {receiverContracts as envelope} from '../docs-kubernetes-envelope-receiver-contracts.mjs';
import {nodeWorkloadsReceiverContracts as body} from '../docs-kubernetes-node-workloads-receiver-contracts.mjs';
const kinds={DaemonSet:'apps/v1',CSIDriver:'storage.k8s.io/v1'};
const get=(kind,path)=>metadata.find(r=>r.kind===kind&&r.fieldPath===path);
const normalize=path=>path.replace(/\[(?:"(?:[^"\\]|\\.)*"|'[^']*'|\*)\]/g,'[<exact-key>]').replace(/\[\d+\]/g,'[]');
function join(apiVersion,kind,paths){
 const roots=[...metadata,...envelope].filter(r=>r.kind===kind&&r.authoritySelector.apiVersion===apiVersion);
 return paths.map(path=>{
  if(/^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(path)){
   const found=roots.find(r=>r.fieldPath===normalize(path));
   if(!found)throw new Error(`NODE_ROOT_RECEIVER_GAP:${kind}:${path}`);
   return found;
  }
  return body(apiVersion,kind,[path])[0];
 });
}
test('selected node kinds have all 34 typed metadata and two envelope receivers',()=>{
 const expected=metadata.filter(r=>r.kind==='Role').map(r=>r.fieldPath);
 for(const [kind,version] of Object.entries(kinds)){
  assert.deepEqual(metadata.filter(r=>r.kind===kind).map(r=>r.fieldPath),expected);
  assert.equal(envelope.filter(r=>r.kind===kind).length,2);
  for(const r of metadata.filter(r=>r.kind===kind)){
   assert.match(r.receiver,/typed built-in/);
   assert.equal(r.authoritySelector.apiVersion,version);
   for(const key of ['omitted','nullValue','emptyValue','invalidValue'])assert.ok(r[key]);
   assert.ok(r.cases.length>=4);assert.ok(r.evidence.length);assert.ok(r.qualificationLimits.length);
  }
 }
 assert.ok(implicit.every(r=>!Object.hasOwn(kinds,r.kind)));
});
test('CSI zero create generation and effective spec update tracking remain separate',()=>{
 const r=get('CSIDriver','$.metadata.generation');
 assert.match(r.omitted,/leaves zero.*does not initialize/);
 assert.match(r.nullValue,/null leaves int64 zero.*does not replace it with 1/);
 assert.match(r.emptyValue,/0 remains zero/);
 assert.match(r.invalidValue,/Negative.*Noninteger.*overflowing/);
 assert.ok(r.cases.some(c=>c.name==='Positive authored create generation'&&/does not overwrite/.test(c.sourceOutcome)));
 assert.ok(r.cases.some(c=>c.name==='Effective spec replacement'&&/restores stored generation.*increments.*effective spec difference/.test(c.sourceOutcome)));
 assert.ok(!r.cases.some(c=>/does not increment.*spec/.test(c.sourceOutcome)));
 assert.match(get('CSIDriver','$.metadata.resourceVersion').invalidValue,/requires a nonempty version/);
 assert.ok(get('CSIDriver','$.metadata.namespace').cases.some(c=>/clears the authored namespace/.test(c.sourceOutcome)));
});
test('DaemonSet tracks templates, restores ordinary status and restores only spec on status route',()=>{
 const r=get('DaemonSet','$.metadata.generation');
 assert.ok(r.crossFieldConditions.some(c=>/clears status.*generation 1.*TemplateGeneration/.test(c)));
 assert.ok(r.cases.some(c=>c.name==='Template versus root metadata update'&&/Root labels alone do not increment/.test(c.sourceOutcome)));
 assert.ok(r.crossFieldConditions.some(c=>/status preparation restores only old spec.*does not generally restore root labels/.test(c)));
 assert.match(get('DaemonSet','$.metadata.resourceVersion').invalidValue,/allows an omitted version/);
 assert.ok(get('DaemonSet','$.metadata.namespace').cases.some(c=>/nonempty mismatch returns BadRequest/.test(c.sourceOutcome)));
});
test('typed managed fields retain reset lists and lifecycle consumers remain qualified',()=>{
 for(const kind of Object.keys(kinds)){
  const r=get(kind,'$.metadata.managedFields');
  assert.ok(r.crossFieldConditions.some(c=>/Typed managedFields:\[\] survives.*reset/.test(c)));
  assert.ok(!JSON.stringify(r).includes('CRD full create/replacement coercion omits'));
  assert.ok(r.cases.some(c=>c.name==='Reset list versus null'&&/Null follows live fallback.*Typed \[\].*reset/.test(c.sourceOutcome)));
  assert.ok(get(kind,'$.metadata.ownerReferences').cases.some(c=>c.name==='Recreated owner'));
  assert.ok(get(kind,'$.metadata.finalizers').cases.some(c=>c.name==='Partial orphan operation'));
  assert.ok(get(kind,'$.metadata.name').crossFieldConditions.some(c=>/DNS-subdomain names use/.test(c)));
 }
});
test('body and root join preserves exact metadata map keys and list indices, unknown roots fail closed',()=>{
 for(const [kind,version] of Object.entries(kinds)){
  const paths=['$.apiVersion','$.kind','$.metadata','$.metadata.labels["app.kubernetes.io/name"]','$.metadata.ownerReferences[0].uid','$.metadata.managedFields[0].fieldsV1','$.spec'];
  assert.equal(join(version,kind,paths).length,paths.length);
  for(const path of ['$.metadata.futureCapability','$.futureBody','$.metadata.labels["name"].future']) assert.throws(()=>join(version,kind,[path]),/RECEIVER_GAP/);
 }
});
