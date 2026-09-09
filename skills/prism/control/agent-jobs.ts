import { checkWorkerResourceResultBinding,type WorkerAttemptEnvelopeV2,type WorkerAttemptResultV2 } from '@kubeclaw/pipeline-worker-core-contract';
import { agentAttempt } from '../server/agent-attempt.ts';
import { randomUUID } from 'node:crypto';
import { sha256Digest } from '@kubeclaw/worker-core';
import { inTransaction, type Database, type Queryable } from '../storage/index.ts';
import { agentSessionKey } from '../server/agent-session.ts';

export type AgentJob = Record<string,unknown> & {
  id:string; project_id:string; operation:'design-set'|'revise'; session_key:string;
  request_digest:string; request:Record<string,unknown>; state:'accepted'|'running'|'completed'|'needs_nova'|'superseded';
  attempt_envelope:WorkerAttemptEnvelopeV2|null; fence:string|null; result:unknown; result_digest:string|null;
};
export type AgentCompletion = {jobId:string; fence:string; payload:unknown};

/** Called only by authenticated Control admission paths, never from project-authored bridge input. */
export async function enqueueAgentJob(db: Database, namespace:string, projectId:string, operation:AgentJob['operation'], input:Record<string,unknown> & {preferences:{generationId:string}}) {
  return inTransaction(db,connection=>insertAgentJob(connection,namespace,projectId,operation,input));
}

export async function insertAgentJob(connection:Queryable,namespace:string,projectId:string,operation:AgentJob['operation'],input:Record<string,unknown> & {preferences:{generationId:string}}) {
    const generation=await connection.query<{project_id:string}>("SELECT g.project_id FROM prism.preference_generation g JOIN prism.project p ON p.id=g.project_id WHERE g.id=$1 AND p.external_id=$2 FOR SHARE OF g",[input.preferences.generationId,projectId]);
    if(!generation.rows[0])throw new Error('agent job generation does not belong to project');
    input={...input,preferences:Object.fromEntries(Object.entries(input.preferences).filter(([key])=>key!=='result')) as {generationId:string}};
    const requestDigest=sha256Digest({operation,input});
    await connection.query("INSERT INTO prism.agent_job(id,project_id,operation,session_namespace,session_key,request_digest,request) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(id) DO NOTHING",[input.preferences.generationId,generation.rows[0].project_id,operation,namespace,agentSessionKey(namespace,projectId),requestDigest,JSON.stringify(input)]);
    const job=await agentJob(connection,input.preferences.generationId);
    if(job.request_digest!==requestDigest)throw new Error('agent job generation conflicts with recorded request');
    return job;
}

export async function agentJob(db:Queryable,id:string):Promise<AgentJob> {
  await db.query("UPDATE prism.agent_job SET state='needs_nova',outcome=jsonb_build_object('reason','external agent outcome unresolved after claim expiry'),updated_at=clock_timestamp() WHERE state='running' AND expires_at<=clock_timestamp() AND session_key=(SELECT session_key FROM prism.agent_job WHERE id=$1)",[id]);
  const row=await db.query<AgentJob>("SELECT j.*,(SELECT blocked.id FROM prism.agent_job blocked WHERE blocked.session_key=j.session_key AND blocked.state='needs_nova' ORDER BY blocked.created_at,blocked.id LIMIT 1) AS blocked_by FROM prism.agent_job j WHERE j.id=$1",[id]);
  if(!row.rows[0])throw new Error('persisted Prism agent job not found');
  return row.rows[0];
}

/** Only accepted work can cross the external-action boundary. Running work is never requeued. */
export async function claimAgentJob(db:Database,runnerId:string) {
  if(!runnerId || runnerId.length>160)throw new Error('agent runner identity is required');
  return inTransaction(db,async connection=>{
    await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('prism-agent-admission',0))");
    await connection.query("UPDATE prism.agent_job SET state='needs_nova',outcome=jsonb_build_object('reason','external agent outcome unresolved after claim expiry'),updated_at=clock_timestamp() WHERE state='running' AND expires_at<=clock_timestamp()");
    await connection.query("UPDATE prism.agent_job j SET state='superseded',outcome=jsonb_build_object('reason','source changed before external action started'),updated_at=clock_timestamp() WHERE j.state='accepted' AND ((j.operation='design-set' AND NOT EXISTS (SELECT 1 FROM prism.design_round round JOIN prism.design_request request ON request.id=round.design_request_id WHERE round.id=j.id AND request.status='active' AND request.current_round_id=round.id)) OR (j.operation='revise' AND NOT EXISTS (SELECT 1 FROM prism.design_document document JOIN prism.design_revision revision ON revision.id=document.current_revision_id WHERE document.id::text=j.request->>'documentId' AND revision.revision::text=j.request->>'expectedRevision'))) ");
    const rows=await connection.query<AgentJob>("SELECT j.* FROM prism.agent_job j WHERE j.state='accepted' AND NOT EXISTS (SELECT 1 FROM prism.agent_job active WHERE active.session_key=j.session_key AND active.state IN ('running','needs_nova')) ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j");
    if(!rows.rows[0])return null;
    const source=rows.rows[0];const fence=randomUUID();
    const deadline=await connection.query<{expires_at:Date|string}>("SELECT clock_timestamp()+interval '16 minutes' AS expires_at");
    const expiresAt=deadline.rows[0]!.expires_at;
    const envelope=await agentAttempt({...source,fence,expires_at:expiresAt},runnerId);
    const claimed=await connection.query<AgentJob>("UPDATE prism.agent_job SET state='running',fence=$2,runner_id=$3,expires_at=$4,attempt_envelope=$5::jsonb,updated_at=clock_timestamp() WHERE id=$1 AND state='accepted' RETURNING *",[source.id,fence,runnerId,expiresAt,JSON.stringify(envelope)]);
    return claimed.rows[0]!;
  });
}

export async function finishAgentRun(db:Database,id:string,fence:string,outcome:Record<string,unknown>) {
  return inTransaction(db,async connection=>{
    const rows=await connection.query<AgentJob>('SELECT * FROM prism.agent_job WHERE id=$1 FOR UPDATE',[id]);
    const job=rows.rows[0];
    if(!job || job.fence!==fence)throw new Error('agent job fence conflict');
    validateAgentOutcome(job,outcome);
    if(job.state==='completed' || job.state==='needs_nova')return job;
    const completed=outcome.schemaVersion==='worker-attempt-result.v2' && outcome.state==='completed' && job.result!==null;
    await connection.query("UPDATE prism.agent_job SET state=$2,outcome=$3::jsonb,updated_at=clock_timestamp() WHERE id=$1",[id,completed?'completed':'needs_nova',JSON.stringify(outcome)]);
    return agentJob(connection,id);
  });
}

/** Peer authentication never replaces binding the received receipt to Control's accepted policy. */
function validateAgentOutcome(job:AgentJob,outcome:Record<string,unknown>) {
  if(!job.attempt_envelope)throw new Error('agent accepted attempt envelope is missing');
  const accepted=job.attempt_envelope;
  if(accepted.attemptId!==job.fence || accepted.claim.claimId!==job.fence || accepted.executionId!==job.id)throw new Error('agent persisted attempt identity conflict');
  if(outcome.schemaVersion==='worker-attempt-result.v2'){
    const checked=checkWorkerResourceResultBinding(accepted,outcome as unknown as WorkerAttemptResultV2);
    if(!checked.ok)throw new Error(`agent outcome binding failed: ${checked.errors.join('; ')}`);
    return;
  }
  if(outcome.state==='errored' && typeof outcome.error==='string' && outcome.error.length>0
    && Object.keys(outcome).every(key=>key==='state' || key==='error'))return;
  throw new Error('agent outcome requires a bound V2 receipt; startup diagnostics may only report errored');
}

/** Hold this row lock through the actual document transaction, including its durable result receipt. */
export async function lockAgentResult(db:Queryable,identity:AgentCompletion,generationId:string) {
  if(identity.jobId!==generationId || !identity.fence)throw new Error('agent result job identity is required');
  const rows=await db.query<AgentJob & {live:boolean}>('SELECT *,expires_at>clock_timestamp() AS live FROM prism.agent_job WHERE id=$1 FOR UPDATE',[identity.jobId]);
  const job=rows.rows[0];
  if(!job || job.fence!==identity.fence)throw new Error('agent result fence conflict');
  if(job.result_digest){
    if(job.result_digest!==sha256Digest(identity.payload))throw new Error('agent result conflicts with committed payload');
    return job.result;
  }
  if(job.state!=='running'||!job.live)throw new Error('agent action is unresolved; NeedsNova reconciliation is required');
  return null;
}

export async function recordAgentResult(db:Queryable,identity:AgentCompletion,result:unknown) {
  await db.query('UPDATE prism.agent_job SET result_digest=$2,result=$3::jsonb,updated_at=clock_timestamp() WHERE id=$1',[identity.jobId,sha256Digest(identity.payload),JSON.stringify(result)]);
}
