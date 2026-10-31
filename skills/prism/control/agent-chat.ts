import {randomUUID} from 'node:crypto';
import {sha256Digest} from '@kubeclaw/worker-core';
import {inTransaction, type Database} from '../storage/index.ts';
import {agentJob} from './agent-jobs.ts';

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
  const result=await db.query<{job_id:string;message:string;reply:string|null;state:string;created_at:string}>("SELECT c.job_id,c.message,c.reply,j.state,c.created_at::text FROM prism.agent_chat c JOIN prism.agent_job j ON j.id=c.job_id WHERE c.document_id=$1 AND c.subject_id=$2 ORDER BY c.created_at,c.job_id",[documentId,subjectId]);
  for(const turn of result.rows)if(turn.state==='running')turn.state=(await agentJob(db,turn.job_id)).state;
  return {items:result.rows};
}
