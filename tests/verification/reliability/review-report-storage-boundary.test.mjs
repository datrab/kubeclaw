import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {activate} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {storeReviewReport} from '../../../skills/nova/plugins/review/src/review-report-storage.ts';
import {report} from './review-report-locale-fixture.mjs';

test('report writer binds real CAS result mode and complete owner; invalid JSON never runs getters',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-boundary-')),adapter=activate({config:{artifactRoot:root}});
 const attempt={runId:'run:report-hex',stageId:'review',attemptId:'attempt-hex',attemptNumber:1};let result,calls=0;
 const original={contract:{lease:{attempt}},invoke:async(capability,request)=>{
  result=await adapter.invoke({confidential:true,signal:new AbortController().signal,request:{...request,capability,attempt,idempotencyKey:'report:boundary:1'}});return result;
 }};
 try{
  await adapter.ready();const value=report();await storeReviewReport(value,original,PORTABLE_JSON_ENCODING);
  const saved=structuredClone(result);
  // Deliberate boundary corruption of an ACTUAL original CAS response, not an
  // alternate provider or successful native runtime substitute.
  const mutations=[
   r=>{delete r.artifact.encoding;},r=>{r.artifact.encoding='future';},r=>{r.artifact.encoding=undefined;},
   r=>{r.artifact.artifactId+='other';},r=>{r.artifact.namespace='other';},r=>{r.artifact.mediaType='text/plain';},
   r=>{r.artifact.digest=`sha256:${'b'.repeat(64)}`;},r=>{r.artifact.sizeBytes++;},
   ...['runId','stageId','attemptId'].map(key=>r=>{r.artifact.producer[key]+='other';}),
   r=>{r.artifact.producer.attemptNumber++;},
  ];
  for(const mutate of mutations){const changed=structuredClone(saved);mutate(changed);
   await assert.rejects(()=>storeReviewReport(value,{contract:original.contract,invoke:async()=>changed},PORTABLE_JSON_ENCODING));
  }
  await assert.rejects(()=>storeReviewReport(value,{contract:original.contract,invoke:async()=>saved}),/report reference that does not match/);
  for(const select of [r=>r,r=>r.artifact,r=>r.artifact.producer]){
   const changed=structuredClone(saved);Object.defineProperty(select(changed),'trap',{enumerable:true,get(){calls++;throw Error('getter');}});
   await assert.rejects(()=>storeReviewReport(value,{contract:original.contract,invoke:async()=>changed},PORTABLE_JSON_ENCODING));
  }
  const invalid={...value,get trap(){calls++;throw Error('getter');}};
  await assert.rejects(()=>storeReviewReport(invalid,{contract:original.contract,invoke:async()=>{calls++;return saved;}},PORTABLE_JSON_ENCODING));
  for(const mode of [null,false,'future',{}])await assert.rejects(()=>storeReviewReport(value,{contract:original.contract,invoke:async()=>{calls++;return saved;}},mode));
  assert.equal(calls,0);
 }finally{await adapter.shutdown();fs.rmSync(root,{recursive:true,force:true});}
});
