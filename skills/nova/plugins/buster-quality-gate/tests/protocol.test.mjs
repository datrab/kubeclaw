import assert from'node:assert/strict';import{buildRequest,parseVerdict}from'../dist/protocol.js';
const input={runId:'run-1',gateId:'quality',attempt:1,task:'Evaluate.',suiteEvidence:[{suite:'unit',passed:true,summary:'ok'}]};
assert.equal(buildRequest('gate',input).protocol,'kubeclaw.buster-quality-gate.v2');
const valid={outcome:'passed',runId:'run-1',gateId:'quality',attempt:1,summary:'Passed.',failureClass:'none',findings:[]};assert.deepEqual(parseVerdict(valid,input),valid);
for(const bad of[{...valid,gateId:'stale'},{...valid,failureClass:'test_failure'},{...valid,findings:['bad']},{...valid,outcome:'request_fix'}])assert.throws(()=>parseVerdict(bad,input));
const failed={...valid,outcome:'request_fix',failureClass:'test_failure',findings:['Fix failing unit suite']};assert.deepEqual(parseVerdict(failed,input),failed);
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.buster-quality-gate',suite:'protocol'}));
