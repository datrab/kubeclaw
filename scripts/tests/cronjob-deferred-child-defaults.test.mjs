import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import YAML from 'yaml';
import {apiProductSelection,versionedApiReceiverRegistries} from '../docs-api-product-scope.mjs';
import {receiverContracts} from '../docs-kubernetes-workload-receiver-contracts.mjs';

function selection(kind,jobSpec={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cronjob-child-boundary-'));
 try {
  const spec=kind==='Job'?jobSpec:{schedule:'0 * * * *',jobTemplate:{spec:jobSpec}};
  const bytes=YAML.stringify({apiVersion:'batch/v1',kind,metadata:{name:'fixture'},spec});
  fs.writeFileSync(path.join(root,'fixture.yaml'),bytes);
  return apiProductSelection('batch/v1',kind,[{path:'fixture.yaml',document:0,sourceDigest:createHash('sha256').update(bytes).digest('hex')}],versionedApiReceiverRegistries.get('batch/v1'),root);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
}
const fields=['parallelism','completions','backoffLimit','completionMode','suspend','manualSelector','podReplacementPolicy'];
test('selected missing JobSpec defaults preserve the CronJob to child Job boundary',()=>{
 const cron=selection('CronJob');const job=selection('Job');
 for(const field of fields){
  const deferred=cron.applicability[`$.spec.jobTemplate.spec.${field}`].find(row=>row.mechanism);
  const immediate=job.applicability[`$.spec.${field}`].find(row=>row.mechanism);
  assert.match(deferred.mechanism,/deferred child Job/);
  assert.match(immediate.mechanism,/present spec before validation/);
  assert.equal(deferred.materializedBy,undefined);
  assert(deferred.evidence.some(row=>row.url.endsWith('/pkg/apis/batch/v1/zz_generated.defaults.go#L42-L53')));
  assert(deferred.evidence.some(row=>row.url.endsWith('/pkg/controller/cronjob/cronjob_controllerv2.go#L604-L609')));
 }
 assert(!cron.applicability['$.spec.parallelism']);
});
test('explicit null and valid zero/false remain authored values, without receiver materialization',()=>{
 for(const value of [null,0]){
  const selected=selection('CronJob',{parallelism:value,backoffLimit:value,completions:value,suspend:value===null?null:false});
  for(const field of ['parallelism','backoffLimit','completions','suspend']){
   const rows=selected.applicability[`$.spec.jobTemplate.spec.${field}`];
   assert(rows.some(row=>row.reason==='authored-resource-field'));
   assert(!rows.some(row=>row.reason==='receiver-default-for-explicit-zero-value'||row.materializedBy));
  }
 }
 for(const field of fields){
  const record=receiverContracts.find(row=>row.kind==='CronJob'&&row.fieldPath===`$.spec.jobTemplate.spec.${field}`);
  assert.equal(record.cases.find(row=>row.name==='explicit-null').sourceOutcome,record.nullValue);
  assert.match(record.nullValue,/SetDefaults_Job does not run on the stored template/);
 }
});
// Optional original-source contract inspection. This is not execution of Kubernetes.
// Supply the authenticated directory with source-provenance.json and primary/ files.
// The manifest's original bytes are hash-checked; this test does not simulate decoding.
const sources=process.env.KUBECLAW_DOCS_KUBERNETES_SOURCE_DIR;
test('genuine pinned visitors and controller establish distinct default boundaries',{skip:!sources},()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(sources,'source-provenance.json'),'utf8'));
 const read=file=>{
  const row=manifest.find(row=>row.path===file&&row.revision==='66452049f3d692768c39c797b21b793dce80314e');assert(row);
  const bytes=fs.readFileSync(path.join(sources,'primary',row.local));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  return bytes.toString();
 };
 const generated=read('pkg/apis/batch/v1/zz_generated.defaults.go');
 const cron=generated.slice(generated.indexOf('func SetObjectDefaults_CronJob('),generated.indexOf('func SetObjectDefaults_CronJobList('));
 const job=generated.slice(generated.indexOf('func SetObjectDefaults_Job('));
 assert.match(cron,/SetDefaults_CronJob\(in\)/);assert.match(cron,/SetDefaults_PodSpec\(&in.Spec.JobTemplate.Spec.Template.Spec\)/);
 assert(!cron.includes('SetDefaults_Job('));assert.match(job,/SetDefaults_Job\(in\)/);
 const defaults=read('pkg/apis/batch/v1/defaults.go');
 for(const member of ['Parallelism','BackoffLimit','CompletionMode','Suspend','ManualSelector','PodReplacementPolicy'])assert(defaults.includes(`obj.Spec.${member} == nil`));
 const controller=read('pkg/controller/cronjob/utils.go');assert.match(controller,/cj.Spec.JobTemplate.Spec.DeepCopyInto\(&job.Spec\)/);
 const validation=read('pkg/apis/batch/validation/validation.go');assert.match(validation,/ValidateNonnegativeField\(int64\(\*spec.ActiveDeadlineSeconds\)/);
});
