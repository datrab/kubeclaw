import assert from'node:assert/strict';import{buildRequest,parseVerdict}from'../dist/protocol.js';
const input={runId:'run-1',taskId:'task-1',attempt:1,task:'Assess.',suiteEvidence:[{suite:'unit',passed:true,summary:'ok'}]};
assert.equal(buildRequest('buster',input).protocol,'kubeclaw.buster-test-judgment.v2');
const valid={verdict:'PASS',runId:'run-1',taskId:'task-1',attempt:1,summary:'Good.',findings:[]};assert.deepEqual(parseVerdict(valid,input),valid);
for(const bad of[{...valid,taskId:'stale'},{...valid,findings:['bad']},{...valid,extra:true},{...valid,verdict:'FAIL'}])assert.throws(()=>parseVerdict(bad,input));
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.test-agent',suite:'protocol'}));
