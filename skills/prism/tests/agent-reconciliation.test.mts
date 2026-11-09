import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {sha256Digest} from '@kubeclaw/worker-core';
import {migrate,RevisionRepository} from '../storage/index.ts';
import {startDesignRound} from '../control/design-generations.ts';
import {enqueueAgentJob,claimAgentJob,finishAgentRun,agentJob} from '../control/agent-jobs.ts';
import {reconcileAgentJob} from '../control/agent-reconciliation.ts';
import {protectPrismReconciliationAudit} from '../server/database-roles.ts';
import {handleAgentReconciliation} from '../server/agent-reconciliation-routes.ts';

async function setup(){
 const db=new PGlite({extensions:{vector}});await migrate(db);const project=await new RevisionRepository(db).createProject('reconcile','Recovery');
 await db.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES($1,$2,'artifact','digest',1,'{}')",[randomUUID(),project]);
 const preferences=await startDesignRound(db,{projectId:'reconcile',subjectId:null,startKey:'initial',architectureDigest:'digest',architectureRevision:1});
 const queued=await enqueueAgentJob(db,'control','reconcile','design-set',{projectId:'reconcile',preferences});
 const job=await claimAgentJob(db,'old');assert.ok(job?.fence);const outcome={state:'errored',error:'Gateway auth unavailable before model execution'};
 await finishAgentRun(db,queued.id,job.fence,outcome);
 const decision={decisionId:randomUUID(),expectedFence:job.fence,expectedOutcomeDigest:sha256Digest(outcome),resolution:'retry-confirmed-no-effect' as const,reason:'Inspected exact gateway session and verified no external action or active turn.',evidence:[`artifact:sha256:${'a'.repeat(64)}`]};
 return {db,job,decision};
}
test('HTTP reconciliation accepts only Nova, verifies evidence and cannot replay a stale failure',async()=>{
 const {db,job,decision}=await setup();let evidenceAvailable=false;let reads=0;let evidenceWrites=0;
 const server=createServer((request,response)=>{void handleAgentReconciliation(request,response,new URL(request.url!,'http://localhost'),{db,spiffeEnabled:true,trustedNovaId:'spiffe://test/nova',readBody:async req=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString());},readArtifact:async()=>{reads++;if(!evidenceAvailable)throw Error('evidence missing');return new Uint8Array([1]);},writeArtifact:async bytes=>{evidenceWrites++;assert.equal(Buffer.from(bytes).toString(),'Verified gateway evidence');return {artifactId:decision.evidence[0]};}}).catch(error=>{response.writeHead(422,{'content-type':'application/json'});response.end(JSON.stringify({error:String(error)}));});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/pipeline/agent-jobs/${job.id}`;
 const post=(body:unknown,peer='spiffe://test/nova')=>fetch(base+'/reconcile',{method:'POST',headers:{'content-type':'application/json','x-forwarded-client-cert':`URI=${peer}`},body:JSON.stringify(body)});
 try{
  await db.query('GRANT UPDATE, DELETE, TRUNCATE ON prism.agent_reconciliation TO prism_runtime');
  await protectPrismReconciliationAudit(db as any);
  const rights=await db.query<{allowed:boolean}>("SELECT has_table_privilege('prism_runtime','prism.agent_reconciliation','UPDATE') AS allowed");assert.equal(rights.rows[0]!.allowed,false);
  assert.equal((await post(decision,'spiffe://test/agent')).status,422);assert.equal(reads,0);
  assert.equal((await post(decision)).status,422);assert.equal((await agentJob(db,job.id)).state,'needs_nova');
  const upload=await fetch(base+'/evidence',{method:'POST',headers:{'content-type':'application/json','x-forwarded-client-cert':'URI=spiffe://test/nova'},body:JSON.stringify({content:'Verified gateway evidence'})});
  assert.equal(upload.status,200);assert.equal(evidenceWrites,1);
  evidenceAvailable=true;assert.equal((await post(decision)).status,200);
  assert.equal((await post(decision)).status,200);assert.equal((await db.query('SELECT decision_id FROM prism.agent_reconciliation')).rows.length,1);
  const next=await claimAgentJob(db,'new');assert.ok(next?.fence);assert.notEqual(next.fence,job.fence);
  assert.equal((await post({...decision,decisionId:randomUUID()})).status,422);
  assert.equal((await agentJob(db,job.id)).state,'running');
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await db.close();}
});
test('changed source cannot be retried, including after a failed reconciliation transaction',async()=>{
 const {db,job,decision}=await setup();try{
  await db.query("UPDATE prism.design_request SET status='superseded' WHERE current_round_id=$1",[job.id]);
  await assert.rejects(reconcileAgentJob(db,job.id,'nova',decision),/SOURCE_CHANGED/);
  assert.equal((await agentJob(db,job.id)).state,'needs_nova');
  assert.equal((await db.query('SELECT decision_id FROM prism.agent_reconciliation')).rows.length,0);
 }finally{await db.close();}
});
