import {randomUUID} from 'node:crypto';
import {sha256Digest} from '@kubeclaw/worker-core';
import {inTransaction, type Database} from '../storage/index.ts';
import {agentJob,lockAgentResult,recordAgentResult,insertAgentJob} from './agent-jobs.ts';
import {startDesignRoundInTransaction} from './design-generations.ts';

/** Persist the origin identity, never synthesize or accept a caller-chosen session. */
export async function startChat(db:Database,documentId:string,subjectId:string,key:string,message:string) {
  if(typeof key!=='string'||!key.trim()||key.length>200||typeof message!=='string'||!message.trim()||message.length>12000)throw new Error('Eine Nachricht und ein gültiger Nachrichtenschlüssel sind erforderlich.');
  return inTransaction(db,async connection=>{
    await connection.query('SELECT id FROM prism.design_document WHERE id=$1 FOR UPDATE',[documentId]);
    const prior=await connection.query<{job_id:string;message:string}>('SELECT job_id,message FROM prism.agent_chat WHERE document_id=$1 AND subject_id=$2 AND message_key=$3',[documentId,subjectId,key]);
    if(prior.rows[0]){
      if(prior.rows[0].message!==message)throw new Error('Nachrichtenschlüssel wurde bereits für einen anderen Text verwendet.');
      return {jobId:prior.rows[0].job_id};
    }
    const origin=await connection.query<{id:string;project_id:string;session_key:string;session_namespace:string;external_id:string;content:Record<string,unknown>;revision:number}>(
      "SELECT j.id,j.project_id,j.session_key,j.session_namespace,p.external_id,r.content,r.revision FROM prism.design_document d JOIN prism.design_revision r ON r.id=d.current_revision_id JOIN prism.project p ON p.id=d.project_id JOIN prism.agent_job j ON j.id=d.design_round_id AND j.project_id=d.project_id AND j.operation='design-set' AND j.state='completed' WHERE d.id=$1",[documentId]);
    const source=origin.rows[0];
    if(!source?.session_key)throw new Error('Die ursprüngliche Design-Session ist nicht verfügbar. Es wird keine Ersatz-Session gestartet.');
    const id=randomUUID();
    const request={projectId:source.external_id,documentId,expectedRevision:source.revision,document:source.content,instruction:message};
    await connection.query("INSERT INTO prism.agent_job(id,project_id,operation,session_namespace,session_key,request_digest,request) VALUES($1,$2,'chat',$3,$4,$5,$6::jsonb)",[id,source.project_id,source.session_namespace,source.session_key,sha256Digest(request),JSON.stringify(request)]);
    await connection.query('INSERT INTO prism.agent_chat(job_id,document_id,origin_job_id,subject_id,message_key,message) VALUES($1,$2,$3,$4,$5,$6)',[id,documentId,source.id,subjectId,key,message]);
    return {jobId:id};
  });
}
export async function chatHistory(db:Database,documentId:string,subjectId:string) {
  const result=await db.query<{job_id:string;message:string;reply:string|null;state:string;created_at:string;design_job_id:string|null;design_state:string|null}>("SELECT c.job_id,c.message,c.reply,j.state,c.created_at::text,child.id AS design_job_id,child.state AS design_state FROM prism.agent_chat c JOIN prism.agent_job j ON j.id=c.job_id LEFT JOIN prism.agent_job child ON child.id::text=j.result->>'generationId' AND child.operation='design-set' WHERE c.document_id=$1 AND c.subject_id=$2 ORDER BY c.created_at,c.job_id",[documentId,subjectId]);
  for(const turn of result.rows){if(turn.state==='running')turn.state=(await agentJob(db,turn.job_id)).state;if(turn.design_state==='running'&&turn.design_job_id)turn.design_state=(await agentJob(db,turn.design_job_id)).state;}
  return {items:result.rows};
}

/** The agent may request real variants only for its live, fenced chat target. */
export async function requestChatDesignSet(db:Database,jobId:string,fence:string) {
 return inTransaction(db,async connection=>{
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('prism-agent-admission',0))");
  const identity={jobId,fence,payload:{operation:'chat-design-set',jobId,fence}};
  const replay=await lockAgentResult(connection,identity,jobId);if(replay)return replay;
  const job=await agentJob(connection,jobId);
  if(job.operation!=='chat')throw new Error('Only a chat job may request variants');
  const source=await connection.query<{external_id:string;architecture_digest:string;architecture_revision:number;current_round_id:string}>("SELECT p.external_id,r.architecture_digest,r.architecture_revision,r.current_round_id FROM prism.design_document d JOIN prism.project p ON p.id=d.project_id JOIN prism.design_request r ON r.id=d.design_request_id AND r.status='active' WHERE d.id::text=$1 AND p.id=$2",[job.request.documentId,job.project_id]);
  const current=source.rows[0];if(!current)throw new Error('Current chat source is unavailable');
  const subject=await connection.query<{subject_id:string}>('SELECT subject_id FROM prism.agent_chat WHERE job_id=$1',[jobId]);
  if(!subject.rows[0])throw new Error('Chat actor is unavailable');
  const preferences=await startDesignRoundInTransaction(connection,{projectId:current.external_id,subjectId:subject.rows[0].subject_id,startKey:`chat:${jobId}`,architectureDigest:current.architecture_digest,architectureRevision:Number(current.architecture_revision),parentRoundId:current.current_round_id,documentId:String(job.request.documentId),expectedRevision:Number(job.request.expectedRevision),iterationInstruction:String(job.request.instruction)});
  const child=await insertAgentJob(connection,job.session_namespace as string,current.external_id,'design-set',{projectId:current.external_id,preferences,iteration:{instruction:job.request.instruction,document:job.request.document}});
  // Keep the exact originating session, including historical keys; never derive a replacement.
  await connection.query('UPDATE prism.agent_job SET session_key=$2 WHERE id=$1',[child.id,job.session_key]);
  const result={status:'queued',generationId:child.id,jobId:child.id};
  await recordAgentResult(connection,identity,result);return result;
 });
}
