import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {receiverContracts, nodeWorkloadsReceiverContracts as select, delegatedRootContracts} from '../docs-kubernetes-node-workloads-receiver-contracts.mjs';
const get=(kind,path)=>receiverContracts.find(r=>r.kind===kind && r.fieldPath===path);
const archives=[
 ['7ca21bd6ef911cdb3a13102e8a13eb8ba0ca8ede7cab08655b537c2da7f4b89f','csi-driver-smb/templates/csi-smb-driver.yaml'],
 ['8e133a142915f4938328e2524f6262607e41f61e06f15cb06dc3d94f018be341','spire/charts/spiffe-csi-driver/templates/spiffe-csi-driver.yaml']
];
test('authenticated CSI chart selected spec keys resolve, additions and renames fail closed',()=>{
 for(const [digest,path] of archives){
  const chart=execFileSync('tar',['-xOf',new URL(`../vendor/external-helm-charts/${digest}.tgz`,import.meta.url).pathname,path],{encoding:'utf8'});
  const spec=chart.slice(chart.indexOf('\nspec:')).split('\napiVersion:')[0];
  const fields=[...new Set([...spec.matchAll(/^  ([a-zA-Z][a-zA-Z0-9]*):/gm)].map(m=>`$.spec.${m[1]}`))];
  assert.deepEqual(fields, path.startsWith('csi-driver-smb') ? ['$.spec.attachRequired','$.spec.podInfoOnMount','$.spec.volumeLifecycleModes'] : ['$.spec.attachRequired','$.spec.podInfoOnMount','$.spec.fsGroupPolicy','$.spec.volumeLifecycleModes']);
  assert.equal(select('storage.k8s.io/v1','CSIDriver',fields).length,fields.length);
  for(const changed of ['$.spec.futureCapability','$.spec.attachMandatory']) assert.throws(()=>select('storage.k8s.io/v1','CSIDriver',[...fields,changed]),/NODE_WORKLOADS_RECEIVER_GAP/);
  assert.match(spec,/attachRequired: false/);assert.match(spec,/podInfoOnMount: true/);
 }
});
test('resource-specific rollout and identity remain distinct from Deployment',()=>{
 const max=get('DaemonSet','$.spec.updateStrategy.rollingUpdate.maxUnavailable');
 assert.match(max.omitted,/1/);assert.match(max.invalidValue,/both nonzero/);
 assert.match(get('DaemonSet','$.spec.selector').invalidValue,/changed selector/);
 assert.match(get('DaemonSet','$.spec.updateStrategy.type').emptyValue,/OnDelete/);
 assert.match(get('DaemonSet','$.spec').crossFieldConditions.join(' '),/no replicas|no replicas field/);
 for(const removed of ['$.spec.replicas','$.spec.paused','$.spec.progressDeadlineSeconds']) assert.throws(()=>select('apps/v1','DaemonSet',[removed]),/NODE_WORKLOADS_RECEIVER_GAP/);
});
test('template receiving contracts bind actual DaemonSet preparation and new Pod defaults',()=>{
 const requests=get('DaemonSet','$.spec.template.spec.containers[].resources.requests[<exact-key>]');
 assert.ok(requests);assert.match(requests.qualificationLimits.join(' '),/Pod-create-only/);
 const tolerations=get('DaemonSet','$.spec.template.spec.tolerations');
 assert.ok(tolerations.evidence.some(e=>e.url.includes('/pkg/controller/daemon/util/daemonset_util.go')));
 assert.match(tolerations.changeImpact,/do not edit existing Pod/);
 for(const r of receiverContracts.filter(r=>r.kind==='DaemonSet' && r.fieldPath.startsWith('$.spec.template'))){
  assert.ok(!r.evidence.some(e=>/\/pkg\/(registry\/apps\/deployment|controller\/deployment)\//.test(e.url)),r.fieldPath);
 }
 const exact=select('apps/v1','DaemonSet',['$.spec.template.spec.containers[0].resources.requests["cpu"]'])[0];
 assert.equal(exact.fieldPath,'$.spec.template.spec.containers[0].resources.requests["cpu"]');
 assert.equal(exact.authoritySelector.fieldPath,exact.fieldPath);
 assert.throws(()=>select('apps/v1','DaemonSet',['$.spec.template.spec.containers[].future']),/NODE_WORKLOADS_RECEIVER_GAP/);
});
test('CSI empty lists differ from empty items; tokens and consumers retain operational limits',()=>{
 assert.match(get('CSIDriver','$.spec.volumeLifecycleModes').emptyValue,/defaults to \[Persistent\]/);
 assert.match(get('CSIDriver','$.spec.volumeLifecycleModes[]').nullValue,/rejected/);
 assert.match(get('CSIDriver','$.spec.tokenRequests[].expirationSeconds').invalidValue,/600.*2\^32/);
 assert.match(get('CSIDriver','$.spec.tokenRequests[].audience').invalidValue,/Duplicate/);
 assert.match(get('CSIDriver','$.spec.fsGroupPolicy').crossFieldConditions.join(' '),/readOnly=true/);
 assert.match(get('CSIDriver','$').qualificationLimits.join(' '),/does not install a node plugin/);
 assert.ok(get('CSIDriver','$').evidence.some(e=>e.url.includes('/spiffe/spiffe-csi/blob/e3a9167497349be5dae0e696a9dd16afae32e330/pkg/driver/driver.go')));
});
test('root metadata/envelope delegation and unknown API versions are explicit',()=>{
 assert.deepEqual(select('apps/v1','DaemonSet',['$.apiVersion','$.kind','$.metadata.name']),[]);
 assert.match(delegatedRootContracts.ObjectMeta,/metadata-receiver/);
 assert.deepEqual(select('apps/v2','DaemonSet',['$.spec']),[]);
 const keys=receiverContracts.map(r=>`${r.kind}:${r.fieldPath}`);assert.equal(new Set(keys).size,keys.length);
});

test('actual selected external node contexts include the three relevant omitted defaults and reject receiver drift',async()=>{
 const {discoverExternalChartApiOutputs}=await import('../docs-api-output-discovery.mjs');
 const {apiProductSelection}=await import('../docs-api-product-scope.mjs');
 const root=new URL('../../',import.meta.url).pathname;
 const outputs=discoverExternalChartApiOutputs(root).filter(o=>['DaemonSet','CSIDriver'].includes(o.context.kind));
 assert.ok(outputs.some(o=>o.context.kind==='DaemonSet'));
 assert.ok(outputs.some(o=>o.context.kind==='CSIDriver'));
 for(const {context,value} of outputs){
  const selection=apiProductSelection(context.apiVersion,context.kind,[context],receiverContracts,root);
  const resolved=select(context.apiVersion,context.kind,selection.fieldPaths);
  const required=context.kind==='DaemonSet'?['$.spec.template.spec.schedulerName']:['$.spec.seLinuxMount'];
  if(context.kind==='DaemonSet' && value.spec.template.spec.volumes?.some(v=>v.secret)) required.push('$.spec.template.spec.volumes[].secret.defaultMode');
  for(const path of required){
   assert.ok(resolved.some(r=>r.fieldPath===path),`${context.path} ${context.profile}#${context.document}: ${path}`);
   assert.ok(selection.applicability[path]?.length,`source applicability missing: ${path}`);
   // Source-selected omissions must remain visible if their receiving record
   // is removed; coverage must fail rather than hide the selected default.
   const without=receiverContracts.filter(r=>!(r.kind===context.kind && r.fieldPath===path));
   const mutated=apiProductSelection(context.apiVersion,context.kind,[context],without,root);
   assert.ok(mutated.fieldPaths.includes(path),`removed receiver hid selected default: ${path}`);
   assert.throws(()=>assert.ok(without.some(r=>r.kind===context.kind && r.fieldPath===path),`NODE_WORKLOADS_RECEIVER_GAP: ${path}`),/NODE_WORKLOADS_RECEIVER_GAP/);
   assert.throws(()=>select(context.apiVersion,context.kind,[path+'Renamed']),/NODE_WORKLOADS_RECEIVER_GAP/);
  }
  assert.throws(()=>select(context.apiVersion,context.kind,[...selection.fieldPaths,'$.spec.futureSelectedCapability']),/NODE_WORKLOADS_RECEIVER_GAP/);
 }
});

test('selected defaults retain parent, zero, gate, update and consumer distinctions',()=>{
 const scheduler=get('DaemonSet','$.spec.template.spec.schedulerName');
 const secret=get('DaemonSet','$.spec.template.spec.volumes[].secret.defaultMode');
 const csi=get('CSIDriver','$.spec.seLinuxMount');
 for(const record of [scheduler,secret,csi]){
  for(const name of ['omitted-at-create','fresh-null','empty','invalid','update','consumer']) assert.ok(record.cases.some(c=>c.name===name && c.sourceOutcome),`${record.fieldPath}: ${name}`);
  assert.ok(record.evidence.some(e=>e.url.includes('66452049f3d692768c39c797b21b793dce80314e')));
  assert.ok(!JSON.stringify(record).match(/Deployment|ReplicaSet|registry-local|LiteLLM|registry-mirror/));
 }
 assert.match(scheduler.omitted,/default-scheduler/);
 assert.match(scheduler.crossFieldConditions.join(' '),/required node affinity/);
 assert.match(secret.omitted,/present SecretVolumeSource/);
 assert.match(secret.nullValue,/no Secret source or defaultMode is fabricated/);
 assert.match(secret.emptyValue,/zero is retained/);
 assert.match(secret.invalidValue,/decimal 511/);
 assert.match(secret.crossFieldConditions.join(' '),/Per-item mode overrides/);
 assert.match(csi.omitted,/enabled.*false.*disabled.*nil/);
 assert.match(csi.changeImpact,/old value nil.*drops.*old nonnil/);
 assert.match(csi.crossFieldConditions.join(' '),/ReadWriteOncePod as its sole access mode/);
 assert.match(csi.crossFieldConditions.join(' '),/Recursive.*opts out/);
 assert.match(csi.crossFieldConditions.join(' '),/separate from fsGroup.*readOnly/);
});
