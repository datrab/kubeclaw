import { sha256Digest } from '@kubeclaw/worker-core';
import { inTransaction, type Database } from '../storage/index.ts';
import { createPreferenceGeneration } from './preference-snapshot.ts';
import { agentJob, insertAgentJob, enqueueAgentJob, type AgentJob } from './agent-jobs.ts';

export async function admitDesignAgent(db:Database,namespace:string,projectId:string,preferences:{generationId:string;result?:unknown}) {
  if(preferences.result){
    const existing=await db.query('SELECT id FROM prism.agent_job WHERE id=$1',[preferences.generationId]);
    // A pre-ledger committed round is already durable; it does not authorize a new external action.
    return existing.rows[0] ? agentReceipt(await agentJob(db,preferences.generationId)) : {status:'completed',...preferences};
  }
  return agentReceipt(await enqueueAgentJob(db,namespace,projectId,'design-set',{projectId,preferences}));
}

export function agentReceipt(job:AgentJob) {
  if(job.state==='superseded')throw new Error(`Prism agent job ${job.id} was superseded before its external action started; submit an explicit request for the current source`);
  if(job.state==='needs_nova' || (job.state==='accepted' && job.blocked_by))throw new Error(`NeedsNova: Prism agent job ${job.id} has an unresolved external outcome or blocked session (${String(job.blocked_by ?? job.id)}): ${JSON.stringify(job.outcome)}; it will not be replayed`);
  return {status:job.state,generationId:job.id,jobId:job.id,
    sessionKey:job.session_key,requestDigest:job.request_digest,
    snapshotDigest:(job.request.preferences as {snapshotDigest:string}).snapshotDigest,
    result:job.result,outcome:job.outcome};
}

export async function startAgentRevision(db:Database,namespace:string,subjectId:string,startKey:string,input:{projectId:string;documentId:string;expectedRevision:number;instruction:string;document:unknown}) {
  if(!startKey || startKey.length>240)throw new Error('agent revision idempotency key is required');
  return inTransaction(db,async connection=>{
    const project=await connection.query<{id:string}>("SELECT id FROM prism.project WHERE external_id=$1 FOR UPDATE",[input.projectId]);
    if(!project.rows[0])throw new Error('agent revision project not found');
    const requestDigest=sha256Digest({subjectId,input});
    const key=JSON.stringify([subjectId,startKey]);
    const prior=await connection.query<{job_id:string;request_digest:string}>('SELECT * FROM prism.agent_revision_start WHERE project_id=$1 AND start_key=$2',[project.rows[0].id,key]);
    if(prior.rows[0]){
      if(prior.rows[0].request_digest!==requestDigest)throw new Error('agent revision start key conflicts with recorded request');
      return agentJob(connection,prior.rows[0].job_id);
    }
    const current=await connection.query("SELECT d.id FROM prism.design_document d JOIN prism.design_revision r ON r.id=d.current_revision_id WHERE d.id=$1 AND d.project_id=$2 AND r.revision=$3 FOR SHARE OF d",[input.documentId,project.rows[0].id,input.expectedRevision]);
    if(!current.rows[0])throw new Error('agent revision source has changed');
    const preferences=await createPreferenceGeneration(connection,subjectId,input.projectId,Date.now(),{operation:'revise',documentId:input.documentId,expectedRevision:input.expectedRevision});
    const job=await insertAgentJob(connection,namespace,input.projectId,'revise',{...input,preferences});
    await connection.query('INSERT INTO prism.agent_revision_start(project_id,start_key,request_digest,job_id) VALUES($1,$2,$3,$4)',[project.rows[0].id,key,requestDigest,job.id]);
    return job;
  });
}
