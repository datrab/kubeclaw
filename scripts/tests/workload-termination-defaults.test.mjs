import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {receiverContracts,workloadReceiverContracts as select} from '../docs-kubernetes-workload-receiver-contracts.mjs';
import {receiverContracts as nodeRecords,nodeWorkloadsReceiverContracts as nodeSelect} from '../docs-kubernetes-node-workloads-receiver-contracts.mjs';
import {discoverProductApiContexts,apiProductSelection,productApiReceiverRecords} from '../docs-api-product-scope.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const additions=receiverContracts.slice(757);
test('preserve all 757 prior workload records byte for byte',()=>{
 assert.equal(createHash('sha256').update(JSON.stringify(receiverContracts.slice(0,757))).digest('hex'),'fbef43ab8b582df17d68212d65c3fc5e26b1e414247367c3847f36b462c6f725');
 assert.equal(additions.length,11);
});
test('actual producer selection joins every selected workload default under its receiving kind',()=>{
 const contexts=discoverProductApiContexts(root);
 for(const [version,kind] of [['apps/v1','DaemonSet'],['apps/v1','StatefulSet'],['batch/v1','CronJob'],['batch/v1','Job'],['v1','Pod']]){
  const actual=contexts.filter(c=>c.kind===kind&&c.apiVersion===version);assert.ok(actual.length,kind);
  const selection=apiProductSelection(version,kind,actual,productApiReceiverRecords(version,kind),root);
  const paths=selection.fieldPaths.filter(p=>/terminationMessage|imagePullPolicy|\.ports\[\]\.protocol$/.test(p));
  assert.ok(paths.length,kind);assert.equal((kind==='DaemonSet'?nodeSelect:select)(version,kind,paths).length,paths.length);
  for(const record of (kind==='DaemonSet'?nodeRecords.slice(275):additions).filter(r=>r.kind===kind))assert.ok(selection.fieldPaths.includes(record.fieldPath),record.fieldPath);
 }
});
test('termination omission null empty and invalid cases retain bounded runtime consumption',()=>{
 for(const r of additions.filter(r=>/terminationMessage/.test(r.fieldPath))){
  assert.match(r.omitted,/present Container.*empty string defaults/);assert.match(r.nullValue,/ordinary string empty.*defaulting/);
  assert.match(r.emptyValue,/empty string defaults.*nonempty string is retained/);
  if(r.fieldPath.endsWith('Policy'))assert.match(r.invalidValue,/Only File and FallbackToLogsOnError/);
  else assert.match(r.invalidValue,/does not validate.*write this path/);
  const consumer=r.cases.find(c=>c.name==='termination-message-file-log-and-total-limits');assert.ok(consumer);
  assert.match(consumer.sourceOutcome,/4096.*missing.*other.*error.*nonzero exit.*ContainerCannotRun.*80.*2048.*12288/s);
  assert.ok(!/Deployment/.test(JSON.stringify(r)));assert.match(r.changeImpact,/uncertain/);
  assert.ok(r.evidence.some(e=>e.url.includes('/pkg/kubelet/kuberuntime/kuberuntime_container.go')));
 }
});
test('kind and member routes use qualified generated defaults and exact indexes',()=>{
 for(const r of additions){
  const version=r.kind==='StatefulSet'?'apps/v1':r.kind==='Pod'?'v1':'batch/v1';
  const exact=r.fieldPath.replaceAll('[]','[2]');const [bound]=select(version,r.kind,[exact]);
  assert.deepEqual(bound.authoritySelector,{apiVersion:version,kind:r.kind,fieldPath:exact});
  assert.ok(r.evidence.some(e=>e.url.includes('/zz_generated.defaults.go')));
  if(r.kind==='CronJob'){
   assert.ok(r.evidence.some(e=>e.url.endsWith('/pkg/apis/batch/v1/zz_generated.defaults.go#L216-L223')));
   assert.ok(!r.evidence.some(e=>e.url.includes('/pkg/apis/apps/')));
   assert.match(r.changeImpact,/subsequently.*Existing Jobs/);
  }
 }
});
test('unknown defaults and unused member alternatives remain fail closed',()=>{
 for(const r of additions){const version=r.kind==='StatefulSet'?'apps/v1':r.kind==='Pod'?'v1':'batch/v1';
  assert.throws(()=>select(version,r.kind,[r.fieldPath+'Unreviewed']),/EXPANDED_WORKLOAD_RECEIVER_GAP/);
 }
 assert.throws(()=>select('apps/v1','StatefulSet',['$.spec.template.spec.ephemeralContainers[].terminationMessagePolicy']),/EXPANDED_WORKLOAD_RECEIVER_GAP/);
});

test('retain 275 node contracts and add only actual selected regular/init path defaults',()=>{
 assert.equal(createHash('sha256').update(JSON.stringify(nodeRecords.slice(0,275))).digest('hex'),'4ec3140f165359f156fc56a06c64a8fc5a4a2c94b8ec84e72a7fdd6e27f4e06e');
 assert.equal(nodeRecords.length,277);
 for(const r of nodeRecords.slice(275)){
  assert.match(r.omitted,/present Container.*defaults to \/dev\/termination-log/);
  assert.match(r.nullValue,/ordinary string empty/);assert.match(r.changeImpact,/OnDelete/);
  assert.ok(r.cases.some(c=>c.name==='termination-message-file-log-and-total-limits'));
  assert.ok(!r.evidence.some(e=>/registry\/apps\/deployment|controller\/deployment/.test(e.url)));
  assert.throws(()=>nodeSelect('apps/v1','DaemonSet',[r.fieldPath+'Renamed']),/NODE_WORKLOADS_RECEIVER_GAP/);
 }
});
