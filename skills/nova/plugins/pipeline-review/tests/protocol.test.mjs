import assert from 'node:assert/strict';
import {buildRequest,parseReport} from '../dist/protocol.js';
const input={runId:'run-1',attempt:1,task:'Review.',evidence:[{kind:'summary',digest:`sha256:${'a'.repeat(64)}`}]};
assert.equal(buildRequest('reviewer',input).protocol,'kubeclaw.pipeline-review.v2');
const observations=['architecture','agents','prompts','tests','configuration'].map((dimension)=>({dimension,finding:`${dimension} reviewed`,priority:'low'}));
const valid={status:'reviewed',summary:'Complete.',observations};
assert.deepEqual(parseReport(valid,input),{...valid,runId:'run-1',attempt:1});
for(const bad of [{...valid,identity:{runId:'run-1',attempt:1}},{...valid,extra:true},{...valid,observations:observations.slice(1)}]) assert.throws(()=>parseReport(bad,input));
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.pipeline-review',suite:'protocol'}));
