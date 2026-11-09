import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
import {migrate,RevisionRepository} from '../storage/index.ts';
import {startDesignRound} from '../control/design-generations.ts';
import {enqueueAgentJob,claimAgentJob,finishAgentRun} from '../control/agent-jobs.ts';
import {startChat,chatHistory,requestChatDesignSet} from '../control/agent-chat.ts';
import {WorkerAttemptExecutor} from '@kubeclaw/worker-core';
import {AgentProcess} from '../server/agent-process.ts';
import {chatReply} from '../server/chat-reply.mjs';
import {agentPrompt} from '../server/agent-prompt.mjs';
import type {PrismDocument} from '@kubeclaw/prism-contracts-v1';
async function setup(){
 const db=new PGlite({extensions:{vector}});await migrate(db);const repo=new RevisionRepository(db);
 const project=await repo.createProject('chat-project','Chat');
 await db.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES($1,$2,'artifact','digest',1,'{}')",[randomUUID(),project]);
 const preferences=await startDesignRound(db,{projectId:'chat-project',subjectId:null,startKey:'initial',architectureDigest:'digest',architectureRevision:1});
 const origin=await enqueueAgentJob(db,'original-namespace','chat-project','design-set',{projectId:'chat-project',preferences});
 // Simulate a retained historical session key that differs from current key derivation.
 await db.query("UPDATE prism.agent_job SET session_key='exact-original-design-session' WHERE id=$1",[origin.id]);
 const job=(await claimAgentJob(db,'design-runner'))!;
 const designs=['a','b','c'].map(key=>{const document=structuredClone(fixture) as PrismDocument;document.meta.projectId='chat-project';return {key,title:key,summary:key,document};});
 const result=await repo.createDirectionSet('chat-project',job.id,designs,{jobId:job.id,fence:job.fence!,payload:designs});
 const receipt=await new WorkerAttemptExecutor({envelope:job.attempt_envelope!,operation:new AgentProcess(process.execPath,['-e','process.exitCode=0']),retainLogs:false}).execute();
 await finishAgentRun(db,job.id,job.fence!,receipt as any);
 return {db,repo,origin,documentId:result.documentId};
}
test('chat uses exact persisted origin session, deduplicates and creates no preference rows',async()=>{
 const {db,origin,documentId}=await setup();try{
  const before=await db.query<{count:number}>('SELECT count(*)::int AS count FROM prism.preference_generation');
  const turn=await startChat(db,documentId,'user','message-1','Can we discuss the spacing?');
  assert.deepEqual(await startChat(db,documentId,'user','message-1','Can we discuss the spacing?'),turn);
  await assert.rejects(startChat(db,documentId,'user','message-1','Different'),/anderen Text/);
  const claimed=(await claimAgentJob(db,'chat-runner'))!;
  assert.equal(claimed.id,turn.jobId);assert.equal(claimed.session_key,'exact-original-design-session');
  assert.equal((await db.query<{origin_job_id:string}>('SELECT origin_job_id FROM prism.agent_chat')).rows[0]!.origin_job_id,origin.id);
  assert.deepEqual(await db.query<{count:number}>('SELECT count(*)::int AS count FROM prism.preference_generation'),before);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM prism.preference_event')).rows[0]!.count,0);
  assert.equal((await chatHistory(db,documentId,'other')).items.length,0);
  assert.equal(await claimAgentJob(db,'restart'),null,'running session turn is not replayed');
  const receipt=await new WorkerAttemptExecutor({envelope:claimed.attempt_envelope!,operation:new AgentProcess(process.execPath,['-e','process.exitCode=0']),retainLogs:false}).execute();
  await finishAgentRun(db,claimed.id,claimed.fence!,receipt as any,'Yes, let us compare two spacing options.');
  const history=await chatHistory(db,documentId,'user');assert.equal(history.items[0]!.reply,'Yes, let us compare two spacing options.');assert.equal(history.items[0]!.state,'completed');
 }finally{await db.close();}
});
test('missing origin fails closed; another document never adopts a project default session',async()=>{
 const {db,repo,documentId}=await setup();try{
  await db.query('UPDATE prism.design_document SET design_round_id=NULL WHERE id=$1',[documentId]);
  await assert.rejects(startChat(db,documentId,'user','key','Hello'),/keine Ersatz-Session/);
  assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM prism.agent_job WHERE operation='chat'")).rows[0]!.count,0);
 }finally{await db.close();}
});
test('chat reply parsing accepts real CLI envelope and rejects diagnostics; prompt separates iteration from preferences',()=>{
 assert.equal(chatReply(JSON.stringify({status:'ok',result:{payloads:[{text:'Hello'},{text:'Again'}]}})),'Hello\n\nAgain');
 assert.throws(()=>chatReply(JSON.stringify({error:'failed'})),/no bounded chat reply/);
 const prompt=agentPrompt({id:'turn-id',fence:'fence',operation:'chat',request:{projectId:'p',documentId:'d',expectedRevision:2,instruction:'Why this font?',document:{}}});
 assert.match(prompt,/NOT preference evidence/);assert.match(prompt,/target document: d/);assert.match(prompt,/For questions\/discussion, only answer/);
});

test('chat variants are fenced, idempotent, serialized in the exact origin session and do not record preference events',async()=>{
 const {db,documentId}=await setup();try{
  const turn=await startChat(db,documentId,'user','variants-1','Mach drei luftigere visuelle Entwürfe');
  const job=(await claimAgentJob(db,'chat-runner'))!;
  await assert.rejects(requestChatDesignSet(db,turn.jobId,randomUUID()),/fence conflict/);
  const child=await requestChatDesignSet(db,turn.jobId,job.fence!) as {jobId:string};
  assert.deepEqual(await requestChatDesignSet(db,turn.jobId,job.fence!),child);
  assert.equal(await claimAgentJob(db,'other-runner'),null,'child cannot overlap its chat parent');
  const queued=(await db.query<{session_key:string;request:any}>('SELECT session_key,request FROM prism.agent_job WHERE id=$1',[child.jobId])).rows[0]!;
  assert.equal(queued.session_key,'exact-original-design-session');assert.equal(queued.request.iteration.instruction,'Mach drei luftigere visuelle Entwürfe');
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM prism.preference_event')).rows[0]!.count,0);
  const receipt=await new WorkerAttemptExecutor({envelope:job.attempt_envelope!,operation:new AgentProcess(process.execPath,['-e','process.exitCode=0']),retainLogs:false}).execute();
  await finishAgentRun(db,job.id,job.fence!,receipt as any,'Drei Varianten werden erstellt.');
  const next=(await claimAgentJob(db,'design-runner'))!;assert.equal(next.id,child.jobId);assert.equal(next.session_key,job.session_key);
  const history=await chatHistory(db,documentId,'user');assert.equal(history.items[0]!.design_job_id,child.jobId);assert.equal(history.items[0]!.design_state,'running');
 }finally{await db.close();}
});
