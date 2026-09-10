import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {buildReviewReport} from '../../../skills/nova/plugins/review/src/review-report-builder.ts';
import {isReviewReport} from '../../../skills/nova/plugins/review/src/review-report-contract.ts';
import {storeReviewReport} from '../../../skills/nova/plugins/review/src/review-report-storage.ts';
import {snapshotReviewBundle} from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import {resolveReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {makeReviewGovernor} from '../../../skills/nova/plugins/review/tests/fixtures/review-governor.mjs';
import {activate} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {EffectCoordinator} from '../../../skills/nova/core/effects/coordinator.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';

// Actual original builder, strict report admission, storage producer, Core and
// ArtifactStore. Findings/governor are typed admission fixtures, not independently
// confirmed real project defects; no whole Review stage/provider claim.
const self=fileURLToPath(import.meta.url), digest=`sha256:${'a'.repeat(64)}`;
function report() {
  const policy=resolveReviewPolicy({builtIn:getReviewPolicyProfile('gate')});
  const changedPaths=[{path:'src/a.ts',status:'modified'}];
  const snapshot=snapshotReviewBundle({schemaVersion:'review-bundle.v1',task:{id:'TASK-1',statement:'Review.'},
    revisions:{base:'1'.repeat(40),head:'2'.repeat(40),changedManifestDigest:sha256Text(canonicalJson(changedPaths))},
    scope:{allowedPrefixes:['src'],changedPaths},requirements:[{id:'REQ-1',statement:'Works.'}],
    evidence:[{kind:'test',digest:sha256Text('{}'),content:'{}'}],
    context:[{path:'src/a.ts',content:'x\n',digest:sha256Text('x\n'),reasons:[{kind:'changed'}]}],
    selection:{version:'focused-context.v1',candidateManifestDigest:digest,expansionRound:0},policyDigest:policy.digest});
  const selected=new Map();
  for(let i=0;selected.size<2&&i<100000;i++){
    const fingerprint=sha256Text(`accepted finding fixture ${i}`);
    const id=sha256Text(canonicalJson({version:'review-report-item.v1',origin:'verified_finding',sourceId:fingerprint}));
    const prefix=id.slice(7,9);
    if(['aa','af'].includes(prefix)&&!selected.has(prefix))selected.set(prefix,fingerprint);
  }
  assert.equal(selected.size,2);
  const findings=[...selected.values()].map(fingerprint=>Object.freeze({fingerprint,category:'correctness',priority:'P0',
    message:'Admitted fixture.',recommendedFix:'Inspect the fixture.',changeRelation:'introduced',scopeRelation:'inside',
    evidenceStrength:'direct',repairable:true,verified:true}));
  const value=buildReviewReport({attemptId:'attempt-hex',snapshot,policy,parsed:{ok:false,error:'not needed'},
    result:{schemaVersion:'stage-result.v2',outcome:'request_fix',reason:{code:'fixture',message:'Typed report fixture.'},artifacts:[]},
    findings,governor:makeReviewGovernor(snapshot.bundle.revisions.changedManifestDigest,'within_scope',policy.digest)});
  assert.equal(isReviewReport(value),true);
  const schema=JSON.parse(fs.readFileSync(new URL('../../../skills/nova/plugins/review/schemas/review-report.v2.schema.json',import.meta.url),'utf8'));
  const validate=new Ajv2020({strict:true}).compile(schema);
  assert.equal(validate(value),true,JSON.stringify(validate.errors));
  assert.deepEqual(Object.keys(value.items).map(x=>x.slice(7,9)).sort(),['aa','af']);
  return value;
}
if(process.argv[2]==='--child'){
  const root=process.argv[3],value=report(),file=path.join(root,'effects.jsonl');
  const adapter=activate({config:{artifactRoot:path.join(root,'artifacts')}});
  const coordinator=new EffectCoordinator(new FileEffectJournal(file),undefined,undefined,new FileResourceLockManager(path.join(root,'locks')));
  const attempt={runId:'run:report-hex',stageId:'review',attemptId:'attempt-hex',attemptNumber:1};
  const owner={pluginId:'kubeclaw.artifact-store',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',contentDigest:digest};
  const context={contract:{lease:{attempt}},invoke:async(capability,request)=>{
    const receipt=await coordinator.invoke(adapter,owner,{...request,attempt,capability,idempotencyKey:'report:hex:1'},new AbortController().signal);
    assert.equal(receipt.status,'completed');return receipt.result;
  }};
  try {
    let artifact,error;
    try{artifact=await storeReviewReport(value,context);}catch(e){error=e.message;}
    process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,builder:true,strictSchema:true,
      itemIds:Object.keys(value.items),valueDigest:sha256Text(canonicalJson(value)),artifactDigest:artifact?.digest??null,error:error??null})+'\n');
  } finally {await adapter.shutdown();}
} else {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-report-hex-'));
  try {
    let original;
    for(const locale of ['en_US.UTF-8','en_US.UTF-8','da_DK.UTF-8']){
      const raw=execFileSync(process.execPath,[self,'--child',root],{encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale}});
      process.stdout.write(raw);const result=JSON.parse(raw),bytes=fs.readFileSync(path.join(root,'effects.jsonl'));
      if(original)assert.deepEqual(bytes,original,'Completed replay retains every original journal byte');else original=bytes;
      if(locale.startsWith('en_'))assert.equal(result.error,null);
      else assert.equal(result.error,'artifact adapter returned a report reference that does not match the stored report');
    }
    process.stdout.write(JSON.stringify({counterexampleConfirmed:true,originalCompletedJournalUnchanged:true,fullReviewAcceptance:false})+'\n');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
