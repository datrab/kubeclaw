import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
import type {PrismDocument} from '@kubeclaw/prism-contracts-v1';
import {migrate,RevisionRepository} from '../storage/index.ts';
import {startAgentRevision,agentReceipt} from '../control/agent-admission.ts';
import {agentJob,claimAgentJob,finishAgentRun} from '../control/agent-jobs.ts';
import {pendingRevision,submitRevision,savedRevision,waitForRevision,type RevisionClient} from '../studio/agent-revision-client.ts';

test('actual HTTP dropped admission response retains the same client key; SQL replay and NeedsNova remain explicit',async()=>{
 const db=new PGlite({extensions:{vector}});await migrate(db);const repo=new RevisionRepository(db);const project=await repo.createProject('client-project','Client');
 const document=structuredClone(fixture) as PrismDocument;document.meta.projectId='client-project';const documentId=await repo.createDocument(project,'document',document,'user-one');
 let drop=true;
 const server=createServer((req,res)=>{void(async()=>{
  try{
   if(req.method==='POST'){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString());
    const job=await startAgentRevision(db,'spiffe://test/control/main/v2','user-one',input.idempotencyKey,{projectId:'client-project',documentId,expectedRevision:input.baseRevision,instruction:input.input.instruction,document});
    if(drop){drop=false;res.destroy();return;}
    res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify(agentReceipt(job)));return;
   }
   const id=req.url!.split('/').at(-1)!;const receipt=agentReceipt(await agentJob(db,id));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(receipt));
  }catch(error){res.writeHead(422,{'content-type':'application/json'});res.end(JSON.stringify({error:String(error)}));}
 })();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const root=await mkdtemp(join(tmpdir(),'prism-revision-client-'));
 let data=new Map<string,string>();const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
 const client:RevisionClient={documentId,userId:'user-one',csrf:'csrf',origin:`http://127.0.0.1:${(server.address() as {port:number}).port}`,storage};
 try{
  const pending=pendingRevision(client,document,'original instruction');
  await assert.rejects(submitRevision(client,pending),/fetch failed/);
  await writeFile(join(root,'session.json'),JSON.stringify([...data]));data=new Map(JSON.parse(await readFile(join(root,'session.json'),'utf8')));
  const restored=savedRevision(client)!;assert.equal(restored.idempotencyKey,pending.idempotencyKey);
  assert.equal(pendingRevision(client,document,'different retry text').input.instruction,'original instruction');
  const accepted=await submitRevision(client,restored);assert.ok(accepted.jobId);assert.equal((await db.query('SELECT id FROM prism.agent_job')).rows.length,1);
  const claimed=await claimAgentJob(db,'runner');assert.ok(claimed?.fence);
  await finishAgentRun(db,claimed.id,claimed.fence,{state:'errored',error:'gateway transport interrupted'});
  await assert.rejects(waitForRevision(client,accepted),/HTTP 422.*NeedsNova.*gateway transport interrupted/s);
  assert.equal(savedRevision(client)?.jobId,accepted.jobId,'uncertain action remains available for reconciliation');
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await db.close();await rm(root,{recursive:true,force:true});}
});
