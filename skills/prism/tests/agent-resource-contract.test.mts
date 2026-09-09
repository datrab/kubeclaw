import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkerAttemptExecutor,workerAttemptSpecDigest,workerProfileDigest,sha256Digest} from '@kubeclaw/worker-core';
import {checkPipelineWorkerCoreContract,checkWorkerResourceContractV2,checkWorkerResourceResultBinding,initialWorkerResourceAccounting,type WorkerAttemptEnvelopeV1} from '@kubeclaw/pipeline-worker-core-contract';
import {agentAttempt} from '../server/agent-attempt.ts';
import {assessWorkerResources} from '../../worker/core/worker/resource-accounting.ts';
import {AgentProcess} from '../server/agent-process.ts';
async function envelope(){
 const value=await agentAttempt({id:randomUUID(),fence:randomUUID(),expires_at:new Date(Date.now()+60000),request_digest:sha256Digest({}),request:{}},'resource-test');
 value.limits={...value.limits,timeoutMs:5000,cleanupTimeoutMs:1000};value.attemptSpecDigest=workerAttemptSpecDigest(value);return value;
}
test('real CPU-consuming child has explicit V2 unavailable observations and no parent resource claims',async()=>{
 const attempt=await envelope();
 const result=await new WorkerAttemptExecutor({envelope:attempt,operation:new AgentProcess(process.execPath,['-e',"const start=process.cpuUsage();while(process.cpuUsage(start).user<250000){}"]),retainLogs:false}).execute();
 assert.equal(result.state,'completed',JSON.stringify(result));assert.equal(result.schemaVersion,'worker-attempt-result.v2');
 for(const metric of ['cpuTimeMs','maximumMemoryBytes','maximumProcesses'] as const){assert.equal(result.resources[metric],undefined);assert.equal(result.resourceAccounting.observations[metric].status,'unavailable');assert.equal(result.resourceAccounting.budgets[metric].state,'unrequested');}
 assert.equal(checkWorkerResourceResultBinding(attempt,result).ok,true);
 assert.equal(checkPipelineWorkerCoreContract('workerAttemptResult',result).ok,false);
 const changed=structuredClone(result);changed.resourceAccounting.budgets.cpuTimeMs={state:'requested',limit:1};
 assert.equal(checkWorkerResourceResultBinding(attempt,changed).ok,false);
});
test('requested unsupported child budget fails before actual process launch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'resource-preflight-'));try{
 const marker=join(root,'launched');const attempt=await envelope();attempt.resourceBudgets.cpuTimeMs={state:'requested',limit:200};attempt.attemptSpecDigest=workerAttemptSpecDigest(attempt);
 const result=await new WorkerAttemptExecutor({envelope:attempt,operation:new AgentProcess(process.execPath,['-e',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`]),retainLogs:false}).execute();
 assert.equal(result.state,'errored');assert.equal(result.error?.code,'WORKER_RESOURCE_MEASUREMENT_UNAVAILABLE');await assert.rejects(access(marker));
 assert.equal(checkWorkerResourceResultBinding(attempt,result).ok,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('V2 requires explicit policy and correct units; V1 refuses the opt-in envelope',async()=>{
 const attempt=await envelope();assert.equal(checkWorkerResourceContractV2('workerAttemptEnvelope',attempt).ok,true);
 assert.equal(checkPipelineWorkerCoreContract('workerAttemptEnvelope',attempt).ok,false);
 const missing=structuredClone(attempt) as any;delete missing.resourceBudgets.maximumProcesses;assert.equal(checkWorkerResourceContractV2('workerAttemptEnvelope',missing).ok,false);
 const units=structuredClone(attempt) as any;units.profile.resourceCapabilities.maximumProcesses.unit='threads';assert.equal(checkWorkerResourceContractV2('workerAttemptEnvelope',units).ok,false);
});
test('requested runtime measurement unavailable fails even when profile advertised measurement',async()=>{
 const attempt=await envelope();attempt.profile.resourceCapabilities.cpuTimeMs={scope:'local-cli-process-tree',unit:'milliseconds',measurement:'sampled',sampleIntervalMs:10};
 attempt.profile.profileDigest=workerProfileDigest(attempt.profile);attempt.resourceBudgets.cpuTimeMs={state:'requested',limit:1000};attempt.attemptSpecDigest=workerAttemptSpecDigest(attempt);
 const result=await new WorkerAttemptExecutor({envelope:attempt,operation:new AgentProcess(process.execPath,['-e','process.stdout.write("ran")']),retainLogs:false}).execute();
 assert.equal(result.error?.code,'WORKER_RESOURCE_MEASUREMENT_UNAVAILABLE');assert.equal(result.resources.cpuTimeMs,undefined);assert.equal(checkWorkerResourceResultBinding(attempt,result).ok,true);
});
test('original generic assessor rejects requested real observed overrun and V1 missing metrics',async()=>{
 const attempt=await envelope();attempt.profile.resourceCapabilities.cpuTimeMs={scope:'test-runner-process',unit:'milliseconds',measurement:'measured'};
 attempt.resourceBudgets.cpuTimeMs={state:'requested',limit:1};
 const accounting=initialWorkerResourceAccounting(attempt);const start=process.cpuUsage();while(process.cpuUsage(start).user<5000){}
 const observed=Math.ceil(process.cpuUsage(start).user/1000);
 const checked=assessWorkerResources(attempt,{...accounting.observations,cpuTimeMs:{status:'observed',value:observed}},accounting);
 assert.equal(checked.error?.code,'WORKER_RESOURCE_LIMIT');assert.equal(checked.resources.cpuTimeMs,observed);
 const v1={...attempt,schemaVersion:'worker-attempt-envelope.v1',limits:{...attempt.limits,cpuMillis:1000,memoryBytes:1024,processes:1}} as unknown as WorkerAttemptEnvelopeV1;
 assert.equal(assessWorkerResources(v1,accounting.observations).error?.code,'WORKER_RESOURCE_MEASUREMENT_INVALID');
});
