import {WorkerAttemptExecutor} from '@kubeclaw/worker-core';
import {AgentProcess} from '../server/agent-process.ts';
import type {AgentJob} from '../control/agent-jobs.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
import type {PrismDocument} from '@kubeclaw/prism-contracts-v1';
import {migrate,RevisionRepository} from '../storage/index.ts';
import {startDesignRound} from '../control/design-generations.ts';
import {enqueueAgentJob,claimAgentJob,agentJob,finishAgentRun} from '../control/agent-jobs.ts';
import {startAgentRevision,admitDesignAgent} from '../control/agent-admission.ts';
import {agentSessionKey} from '../server/agent-session.ts';

async function realProcessReceipt(job:AgentJob){
 assert.ok(job.attempt_envelope);
 return new WorkerAttemptExecutor({envelope:job.attempt_envelope,operation:new AgentProcess(process.execPath,['-e','process.exitCode=0']),retainLogs:false}).execute();
}
async function setup(path?:string){
 const db=new PGlite({dataDir:path,extensions:{vector}});await migrate(db);const repo=new RevisionRepository(db);
 const project=await repo.createProject('project:one','One');
 await db.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES($1,$2,'artifact','digest',1,'{\"projectId\":\"project:one\"}')",[randomUUID(),project]);
 const preferences=await startDesignRound(db,{projectId:'project:one',subjectId:null,startKey:'initial',architectureDigest:'digest',architectureRevision:1});
 const admit=()=>enqueueAgentJob(db,'spiffe://test/control/main/v2','project:one','design-set',{projectId:'project:one',preferences});
 const designs=['one','two','three'].map(key=>{const document=structuredClone(fixture) as PrismDocument;document.meta.projectId='project:one';return {key,title:key,summary:key,document};});
 return {db,repo,project,preferences,admit,designs};
}
test('session identities retain full project and namespace identity without lossy legacy adoption',()=>{
 const inputs=['a:b','a/b','a-b','x'.repeat(150)+'1','x'.repeat(150)+'2','é','é'];
 assert.equal(new Set(inputs.map(id=>agentSessionKey('control-a',id))).size,inputs.length);
 assert.notEqual(agentSessionKey('control-a','a:b'),agentSessionKey('control-b','a:b'));
 assert.equal(agentSessionKey('control-a','a:b'),agentSessionKey('control-a','a:b'));
 assert.match(agentSessionKey('control-a','a:b'),/^prism-v2-[a-f0-9]{64}$/);
});
test('accepted jobs survive a real database reopen; running uncertainty is never replayed',async()=>{
 const path=await mkdtemp(join(tmpdir(),'prism-agent-ledger-'));let db:PGlite|undefined;
 try{
  const setupResult=await setup(path);db=setupResult.db;const queued=await setupResult.admit();
  assert.equal(queued.state,'accepted');assert.equal((await setupResult.admit()).id,queued.id);
  await assert.rejects(enqueueAgentJob(db,'spiffe://test/control/main/v2','project:one','design-set',{projectId:'changed',preferences:setupResult.preferences}),/conflicts/);
  await db.close();db=new PGlite({dataDir:path,extensions:{vector}});
  const claimed=await claimAgentJob(db,'boot-two');assert.equal(claimed?.id,queued.id);assert.ok(claimed?.fence);
  await db.close();db=new PGlite({dataDir:path,extensions:{vector}});
  assert.deepEqual((await agentJob(db,queued.id)).attempt_envelope,claimed.attempt_envelope,'accepted policy survives database reopen');
  assert.equal(await claimAgentJob(db,'boot-three'),null,'restart cannot replay a potentially started action');
  await db.query("UPDATE prism.agent_job SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[queued.id]);
  assert.equal(await claimAgentJob(db,'boot-three'),null);
  assert.equal((await agentJob(db,queued.id)).state,'needs_nova');
 }finally{await db?.close();await rm(path,{recursive:true,force:true});}
});
test('actual design commit and agent receipt are atomic; stale fence and changed retry cannot mutate',async()=>{
 const {db,repo,preferences,admit,designs}=await setup();try{
  const queued=await admit();const claimed=await claimAgentJob(db,'runner');assert.ok(claimed?.fence);
  const identity={jobId:queued.id,fence:claimed.fence,payload:{designs}};
  await assert.rejects(repo.createDirectionSet('project:one',queued.id,designs,{...identity,fence:randomUUID()}),/fence/);
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,0);
  const result=await repo.createDirectionSet('project:one',queued.id,designs,identity);
  assert.deepEqual((await agentJob(db,queued.id)).result,result);
  assert.deepEqual(await repo.createDirectionSet('project:one',queued.id,designs,identity),result);
  await assert.rejects(repo.createDirectionSet('project:one',queued.id,designs,{...identity,payload:{changed:true}}),/conflicts/);
  await finishAgentRun(db,queued.id,claimed.fence,await realProcessReceipt(claimed));
  assert.equal((await agentJob(db,queued.id)).state,'completed');
  assert.equal(await claimAgentJob(db,'restart'),null);
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,3);
  assert.equal((await admitDesignAgent(db,'spiffe://test/control/main/v2','project:one',{...preferences,result})).status,'completed');
  assert.equal((await enqueueAgentJob(db,'spiffe://test/control/main/v2','project:one','design-set',{projectId:'project:one',preferences:{...preferences,result} as typeof preferences})).id,queued.id);
 }finally{await db.close();}
});
test('expired agent cannot commit and missing tool result is explicitly NeedsNova',async()=>{
 const {db,repo,admit,designs}=await setup();try{
  const queued=await admit();const job=await claimAgentJob(db,'runner');assert.ok(job?.fence);
  await db.query("UPDATE prism.agent_job SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[queued.id]);
  await assert.rejects(repo.createDirectionSet('project:one',queued.id,designs,{jobId:job.id,fence:job.fence,payload:designs}),/NeedsNova/);
  const outcome=await finishAgentRun(db,job.id,job.fence,await realProcessReceipt(job));
  assert.equal(outcome.state,'needs_nova');assert.equal(outcome.result,null);
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,0);
 }finally{await db.close();}
});
test('revision retries bind actor, source and input and replay the actual committed repository receipt',async()=>{
 const {db,repo,admit,designs}=await setup();try{
  const queued=await admit();const run=await claimAgentJob(db,'initial');assert.ok(run?.fence);
  const docs=await repo.createDirectionSet('project:one',queued.id,designs,{jobId:run.id,fence:run.fence,payload:designs});
  await finishAgentRun(db,run.id,run.fence,await realProcessReceipt(run));
  const current=await repo.current(docs.documentId);
  const input={projectId:'project:one',documentId:docs.documentId,expectedRevision:1,instruction:'clearer',document:current.document};
  const job=await startAgentRevision(db,'spiffe://test/control/main/v2','user-one','revision-one',input);
  assert.equal((await startAgentRevision(db,'spiffe://test/control/main/v2','user-one','revision-one',input)).id,job.id);
  await assert.rejects(startAgentRevision(db,'spiffe://test/control/main/v2','user-one','revision-one',{...input,instruction:'different'}),/conflicts/);
  const claimed=await claimAgentJob(db,'revision');assert.equal(claimed?.id,job.id);assert.ok(claimed?.fence);
  const next=structuredClone(current.document);next.meta.revision=2;
  const identity={jobId:job.id,fence:claimed.fence,payload:{...input,document:next}};
  await repo.replace(docs.documentId,current.id,next,{generationId:job.id},'agent:prism',identity);
  assert.deepEqual(await repo.replace(docs.documentId,current.id,next,{generationId:job.id},'agent:prism',identity),next);
  assert.deepEqual((await agentJob(db,job.id)).result,next);
  assert.equal((await startAgentRevision(db,'spiffe://test/control/main/v2','user-one','revision-one',input)).id,job.id);
 }finally{await db.close();}
});
test('provably unstarted superseded work is retired without taking over the new source session',async()=>{
 const {db,project,admit}=await setup();try{
  const old=await admit();
  await db.query("UPDATE prism.design_request SET status='superseded' WHERE project_id=$1",[project]);
  await db.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES($1,$2,'artifact','next',2,'{}')",[randomUUID(),project]);
  const preferences=await startDesignRound(db,{projectId:'project:one',subjectId:null,startKey:'next',architectureDigest:'next',architectureRevision:2});
  const next=await enqueueAgentJob(db,'spiffe://test/control/main/v2','project:one','design-set',{projectId:'project:one',preferences});
  const claim=await claimAgentJob(db,'runner');assert.equal(claim?.id,next.id);
  const retired=await agentJob(db,old.id);assert.equal(retired.state,'superseded');assert.equal(retired.fence,null);
 }finally{await db.close();}
});
