import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dump,load} from 'js-yaml';
import {renderPostgresqlRecovery} from '../render-postgresql-recovery.mjs';
import {receiverContracts,workloadReceiverContracts as select} from '../docs-kubernetes-workload-receiver-contracts.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const prefix='$.spec.jobTemplate.spec.template.spec.containers[].resources.claims';
const rows=receiverContracts.filter(r=>r.kind==='CronJob'&&r.fieldPath.startsWith(prefix));
test('public recovery resources forwarding preserves omission, null, list and item values in actual CronJob output',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cronjob-claims-'));
 try {
  const base=load(fs.readFileSync(path.join(root,'my-values/infra/postgresql-recovery.yaml'),'utf8'));
  for(const [present,claims] of [[false,undefined],[true,null],[true,[]],[true,[null]],[true,[{}]],[true,[{name:'device',request:'gpu'}]]]) {
   const policy=structuredClone(base);delete policy.resources.claims;if(present)policy.resources.claims=claims;
   const file=path.join(dir,'policy.yaml');fs.writeFileSync(file,dump(policy));
   const cron=renderPostgresqlRecovery('kubeclaw',file,path.join(root,'my-values/infra/postgresql-values.yaml'),path.join(root,'my-values/infra/litellm-deployment.yaml')).find(o=>o.kind==='CronJob');
   assert.ok(cron);const spec=cron.spec.jobTemplate.spec.template.spec;const resources=spec.containers[0].resources;
   assert.equal(Object.hasOwn(resources,'claims'),present);if(present)assert.deepEqual(resources.claims,claims);
   assert.equal(Object.hasOwn(spec,'resourceClaims'),false,'renderer has no declaration for a forwarded reference');
   assert.equal(cron.spec.jobTemplate.spec.template.spec.restartPolicy,'Never');
  }
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('selected exact claim fields resolve while unknown descendants, renamed fields and removed rows fail closed',()=>{
 assert.deepEqual(rows.map(r=>r.fieldPath),['','[]','[].name','[].request'].map(s=>prefix+s));
 for(const suffix of ['', '[0]', '[0].name','[0].request']) {
  const exact=prefix.replace('containers[]','containers[0]')+suffix;
  const [record]=select('batch/v1','CronJob',[exact]);assert.equal(record.fieldPath,exact);assert.equal(record.authoritySelector.fieldPath,exact);
 }
 for(const suffix of ['[0].futureOption','[0].requestName'])assert.throws(()=>select('batch/v1','CronJob',[prefix+suffix]),/EXPANDED_WORKLOAD_RECEIVER_GAP/);
 const index=receiverContracts.indexOf(rows[3]);const [removed]=receiverContracts.splice(index,1);
 try {assert.throws(()=>select('batch/v1','CronJob',[prefix+'[].request']),/EXPANDED_WORKLOAD_RECEIVER_GAP/);}finally {receiverContracts.splice(index,0,removed);}
});
test('CronJob claim semantics distinguish nil lists from zero items and retain actual route, gates and recovery limits',()=>{
 assert.match(rows[0].nullValue,/slice to nil/);assert.match(rows[0].emptyValue,/no container claim/);
 assert.match(rows[1].nullValue,/zero ResourceClaim.*rejected/);assert.match(rows[2].omitted,/empty.*required/);
 assert.match(rows[3].nullValue,/all results.*does not remove/);
 for(const row of rows) {
  assert.match(row.invalidValue,/no Pod claim declarations.*rejected/);
  assert.match(row.changeImpact,/Existing Jobs.*keep/);
  assert.match(row.crossFieldConditions.join(' '),/not an RBAC grant/);
  assert.match(row.crossFieldConditions.join(' '),/subrequest.*slash fails/);
  for(const file of ['pkg/registry/batch/cronjob/strategy.go','pkg/apis/batch/v1/zz_generated.defaults.go','pkg/controller/cronjob/utils.go','pkg/controller/job/job_controller.go','pkg/controller/controller_utils.go','pkg/api/pod/util.go','pkg/features/kube_features.go'])assert.ok(row.evidence.some(e=>e.url.includes(file)),file);
  assert.ok(!/Deployment|ReplicaSet|Argo|Prism|kubectl|fieldmanager/.test(JSON.stringify(row)));
 }
});
