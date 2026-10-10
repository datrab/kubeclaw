import test from 'node:test';
import assert from 'node:assert/strict';
import {receiverContracts} from '../docs-kubernetes-workload-receiver-contracts.mjs';
const get=(kind,path)=>{const r=receiverContracts.find(r=>r.kind===kind&&r.fieldPath===path);assert(r,`${kind} ${path} missing`);return r;};
test('finite batch restart defaults fail and StatefulSet requires Always',()=>{
 assert.match(get('Job','$.spec.template.spec.restartPolicy').omitted,/Always.*rejects/);
 assert.match(get('CronJob','$.spec.jobTemplate.spec.template.spec.restartPolicy').invalidValue,/Never/);
 assert.match(get('StatefulSet','$.spec.template.spec.restartPolicy').invalidValue,/other than Always/);
});
test('CronJob nested defaulting and selector prohibition differ from Job',()=>{
 assert.match(get('CronJob','$.spec.jobTemplate.spec.backoffLimit').omitted,/without running SetDefaults_Job/);
 assert.match(get('CronJob','$.spec.jobTemplate').invalidValue,/selector.*manualSelector/);
 assert.match(get('Job','$.spec.selector').omitted,/prepare-for-create/);
});
test('workload update consequences preserve immutable identity and existing children',()=>{
 assert.match(get('Job','$.spec.template.spec.containers[].image').changeImpact,/immutable.*suspended/);
 assert.match(get('CronJob','$.spec.jobTemplate.spec.template.spec.containers[].image').changeImpact,/Existing Jobs.*keep/);
 assert.match(get('StatefulSet','$.spec.serviceName').changeImpact,/forbidden/);
 assert.match(get('StatefulSet','$.spec.volumeClaimTemplates[].spec.storageClassName').changeImpact,/cannot be updated/);
 assert.match(get('StatefulSet','$.spec.persistentVolumeClaimRetentionPolicy').omitted,/Retain/);
});
test('PDB nil versus empty selector and health boundary are explicit',()=>{
 const r=get('PodDisruptionBudget','$.spec.selector');assert.match(r.omitted,/no Pods/);assert.match(r.emptyValue,/all Pods/);
 assert.match(r.changeImpact,/does not make an application ready/);
 assert.match(get('PodDisruptionBudget','$.spec.unhealthyPodEvictionPolicy').omitted,/IfHealthyBudget/);
});
test('common Pod children use actual strategy without Deployment rollout claims',()=>{
 for(const kind of ['Job','CronJob','StatefulSet']){
  const p=kind==='CronJob'?'$.spec.jobTemplate.spec.template':'$.spec.template';
  for(const suffix of ['containers[].image','containers[].resources.requests[<exact-key>]','volumes[].configMap.defaultMode','dnsPolicy']){
   const r=get(kind,p+'.spec.'+suffix);assert(!/Deployment|ReplicaSet/.test(JSON.stringify(r)));
   assert(r.evidence.some(e=>e.url.includes(`/registry/${kind==='StatefulSet'?'apps/statefulset':kind==='Job'?'batch/job':'batch/cronjob'}/strategy.go`)));
  }
 }
});
test('selected parent/default families and unique identities stay present',()=>{
 const ids=new Set();for(const r of receiverContracts){const id=r.kind+':'+r.fieldPath;assert(!ids.has(id));ids.add(id);assert(r.cases.length>=5);assert(r.evidence.every(e=>/blob\/[a-f0-9]{40}\/.+#L\d+/.test(e.url)));}
 for(const [kind,path] of [['CronJob','$.spec.schedule'],['StatefulSet','$.spec.ordinals.start'],['StatefulSet','$.spec.updateStrategy.rollingUpdate.partition'],['Job','$.spec.activeDeadlineSeconds'],['PodDisruptionBudget','$.spec.minAvailable']])get(kind,path);
 assert(!ids.has('Job:$.spec.strategy.maxSurge'));
});
