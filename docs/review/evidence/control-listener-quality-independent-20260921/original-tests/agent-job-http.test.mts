import {WorkerAttemptExecutor,workerAttemptResultDigest} from '@kubeclaw/worker-core';
import {AgentProcess} from '../server/agent-process.ts';
import type {AgentJob} from '../control/agent-jobs.ts';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
import type {PrismDocument} from '@kubeclaw/prism-contracts-v1';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {migrate,RevisionRepository} from '../storage/index.ts';
import {startDesignRound} from '../control/design-generations.ts';
import {enqueueAgentJob,agentJob} from '../control/agent-jobs.ts';
import {handleAgentJobs} from '../server/agent-job-routes.ts';

test('actual HTTP job routes authenticate before claim, persist one fence and reject stale completion',async()=>{
 const db=new PGlite({extensions:{vector}});await migrate(db);const project=await new RevisionRepository(db).createProject('http-project','HTTP');
 await db.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES($1,$2,'artifact','digest',1,'{}')",[randomUUID(),project]);
 const preferences=await startDesignRound(db,{projectId:'http-project',subjectId:null,startKey:'initial',architectureDigest:'digest',architectureRevision:1});
 const queued=await enqueueAgentJob(db,'spiffe://test/control/main/v2','http-project','design-set',{projectId:'http-project',preferences});
 const server=createServer((request,response)=>{
  void handleAgentJobs(request,response,new URL(request.url!,'http://localhost'),{db,spiffeEnabled:true,trustedAgentId:'spiffe://test/agent',readBody:async req=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString());}}).catch(error=>{response.writeHead(422,{'content-type':'application/json'});response.end(JSON.stringify({error:String(error)}));});
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const post=(path:string,input:unknown,peer='spiffe://test/agent')=>fetch(`${origin}${path}`,{method:'POST',headers:{'content-type':'application/json','x-forwarded-client-cert':`URI=${peer}`},body:JSON.stringify(input)});
 try{
  const forbidden=await post('/v1/agent/jobs/claim',{runnerId:'not-agent'},'spiffe://test/project');assert.equal(forbidden.status,422);assert.match(await forbidden.text(),/FORBIDDEN/);
  assert.equal((await agentJob(db,queued.id)).state,'accepted');
  const first=await post('/v1/agent/jobs/claim',{runnerId:'boot-one'});assert.equal(first.status,200);
  const claimed=(await first.json() as {job:AgentJob}).job;assert.equal(claimed.id,queued.id);
  const second=await post('/v1/agent/jobs/claim',{runnerId:'boot-two'});assert.equal((await second.json() as {job:unknown}).job,null);
  const stale=await post(`/v1/agent/jobs/${queued.id}/finish`,{fence:randomUUID(),outcome:{state:'completed'}});assert.equal(stale.status,422);assert.match(await stale.text(),/fence conflict/);
  assert.ok(claimed.fence);assert.ok(claimed.attempt_envelope);
  const designs=['one','two','three'].map(key=>{const document=structuredClone(fixture) as PrismDocument;document.meta.projectId='http-project';return {key,title:key,summary:key,document};});
  await new RevisionRepository(db).createDirectionSet('http-project',queued.id,designs,{jobId:queued.id,fence:claimed.fence,payload:{designs}});
  const endpoint=`/v1/agent/jobs/${queued.id}/finish`;
  const forged=await post(endpoint,{fence:claimed.fence,outcome:{state:'completed'}});assert.equal(forged.status,422);assert.match(await forged.text(),/bound V2 receipt/);
  assert.equal((await agentJob(db,queued.id)).state,'running');
  const genuine=await new WorkerAttemptExecutor({envelope:claimed.attempt_envelope,operation:new AgentProcess(process.execPath,['-e','process.exitCode=0']),retainLogs:false}).execute();
  assert.equal(genuine.state,'completed');
  const changed=structuredClone(genuine);changed.resourceAccounting.budgets.cpuTimeMs={state:'requested',limit:1};changed.resultDigest=workerAttemptResultDigest(changed);
  const corrupt=await post(endpoint,{fence:claimed.fence,outcome:changed});assert.equal(corrupt.status,422);assert.match(await corrupt.text(),/binding failed/);
  assert.equal((await agentJob(db,queued.id)).state,'running');
  const foreign=structuredClone(genuine);foreign.workerId='different-worker';foreign.resultDigest=workerAttemptResultDigest(foreign);
  const foreignReply=await post(endpoint,{fence:claimed.fence,outcome:foreign});assert.equal(foreignReply.status,422);assert.match(await foreignReply.text(),/workerId/);
  const evidence=structuredClone(genuine);evidence.resources.evidenceBytes=1;evidence.resultDigest=workerAttemptResultDigest(evidence);
  const evidenceReply=await post(endpoint,{fence:claimed.fence,outcome:evidence});assert.equal(evidenceReply.status,422);assert.match(await evidenceReply.text(),/evidence bytes/);
  const resultBytes=structuredClone(genuine);resultBytes.resources.resultBytes=0;resultBytes.resultDigest=workerAttemptResultDigest(resultBytes);
  const resultBytesReply=await post(endpoint,{fence:claimed.fence,outcome:resultBytes});assert.equal(resultBytesReply.status,422);assert.match(await resultBytesReply.text(),/actual specialist result bytes/);
  const finished=await post(endpoint,{fence:claimed.fence,outcome:genuine});assert.equal(finished.status,200);assert.equal((await finished.json() as {job:{state:string}}).job.state,'completed');
  assert.deepEqual((await agentJob(db,queued.id)).outcome,genuine);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await db.close();}
});
