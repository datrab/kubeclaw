import test from 'node:test';
import assert from 'node:assert/strict';
import {receiverContracts,namespaceIsolationReceiverContracts as select} from '../docs-kubernetes-namespace-isolation-receiver-contracts.mjs';
const get=(kind,path)=>receiverContracts.find(r=>r.kind===kind&&r.fieldPath===path);
test('recursive receiving keys and list members join exact selected boundaries',()=>{
 const records=select('v1','ResourceQuota',['$.spec','$.spec.hard','$.spec.hard["requests.cpu"]','$.spec.hard["pods"]']);
 assert.equal(records.length,4);assert.equal(records[2].authoritySelector.fieldPath,'$.spec.hard["requests.cpu"]');
 assert.match(records[3].invalidValue,/integer/);
 const role=select('rbac.authorization.k8s.io/v1','Role',['$.rules[0]','$.rules[0].apiGroups[0]','$.rules[0].resourceNames[0]']);
 assert.equal(role.length,3);assert.match(role[1].emptyValue,/core group/);
});
test('new nested receiving drift fails instead of borrowing generic facts',()=>{
 for(const path of ['$.spec.hardUnexpected','$.spec.limits[].future','$.rules[].future','$.roleRef.future']){
  const kind=path.includes('limits')?'LimitRange':path.includes('rules')?'Role':path.includes('roleRef')?'RoleBinding':'ResourceQuota';
  assert.throws(()=>select(kind.startsWith('Role')?'rbac.authorization.k8s.io/v1':'v1',kind,[path]),/NAMESPACE_ISOLATION_RECEIVER_GAP/);
 }
 assert.deepEqual(select('other/v1','Role',['$.rules']),[]);
});
test('actual omitted defaults retain present zero keys and ordering',()=>{
 const def=get('LimitRange','$.spec.limits[].defaultRequest[<exact-key>]');
 assert.match(def.omitted,/first from default, then from min/);assert.match(def.nullValue,/present.*do not replace/);
 assert.ok(def.crossFieldConditions.some(c=>c.includes('defaultRequest <= default')));
 const quota=get('ResourceQuota','$.spec.hard[<exact-key>]');assert.match(quota.nullValue,/zero ceiling/);
 assert.match(get('RoleBinding','$.roleRef.apiGroup').omitted,/defaults/);
 assert.match(get('RoleBinding','$.subjects[].apiGroup').omitted,/stays empty/);
});
test('cross constraints and consumer consequences retain proof limits',()=>{
 assert.match(get('RoleBinding','$.roleRef.kind').changeImpact,/immutable/);
 assert.match(get('RoleBinding','$.subjects[].namespace').invalidValue,/does not validate/);
 assert.match(get('Role','$.rules[].resourceNames').omitted,/all names/);
 assert.match(get('Role','$.rules[]').emptyValue,/rejected/);
 assert.ok(get('LimitRange','$.spec.limits[].max').crossFieldConditions.some(c=>c.includes('does not independently reject every negative')));
 assert.match(get('ResourceQuota','$').changeImpact,/does not evict/);
 assert.ok(receiverContracts.every(r=>r.qualificationLimits.some(l=>l.includes('not live API'))));
});
test('shared identity and metadata remain explicit delegated boundaries',()=>{
 assert.deepEqual(select('v1','LimitRange',['$.metadata','$.metadata.labels["owner"]','$.apiVersion','$.kind']),[]);
 assert.ok(receiverContracts.every(r=>r.evidence.every(e=>e.url.includes('66452049f3d692768c39c797b21b793dce80314e'))));
 assert.equal(new Set(receiverContracts.map(r=>`${r.kind}:${r.fieldPath}`)).size,receiverContracts.length);
});
