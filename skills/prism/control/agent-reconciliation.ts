import { inTransaction, type Database } from '../storage/index.ts';
import { sha256Digest } from '@kubeclaw/worker-core';
import type { AgentJob } from './agent-jobs.ts';

export interface AgentRetryDecision {
  decisionId: string;
  expectedFence: string;
  expectedOutcomeDigest: string;
  resolution: 'retry-confirmed-no-effect';
  reason: string;
  evidence: string[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const digest = /^sha256:[0-9a-f]{64}$/u;
function validEvidence(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 1 && value.length <= 16
    && value.every(item => typeof item === 'string' && /^artifact:sha256:[0-9a-f]{64}$/u.test(item));
}
function validate(input: AgentRetryDecision): void {
  const fields = ['decisionId','expectedFence','expectedOutcomeDigest','resolution','reason','evidence'];
  if (!input || Object.keys(input).some(key => !fields.includes(key))) throw new Error('PRISM_RECONCILIATION_INVALID');
  const checks = [uuid.test(input.decisionId), uuid.test(input.expectedFence), digest.test(input.expectedOutcomeDigest),
    input.resolution === 'retry-confirmed-no-effect', typeof input.reason === 'string', validEvidence(input.evidence)];
  if (checks.includes(false)) throw new Error('PRISM_RECONCILIATION_INVALID');
  if (input.reason.trim().length < 10 || input.reason.length > 2000) throw new Error('PRISM_RECONCILIATION_INVALID');
}
function assertRetryable(job: AgentJob | undefined, input: AgentRetryDecision): asserts job is AgentJob {
  if (!job || job.state !== 'needs_nova' || job.fence !== input.expectedFence || sha256Digest(job.outcome) !== input.expectedOutcomeDigest) throw new Error('PRISM_RECONCILIATION_STALE');
  if (job.result !== null || job.result_digest !== null) throw new Error('PRISM_RECONCILIATION_COMMITTED_RESULT');
}

/** Actor comes only from the authenticated host, never from decision JSON.
 * This is an explicit attestation of stopped execution and absence of effects,
 * not an expiry-triggered restart. Preserve the prior fence/envelope/outcome.
 */
export async function reconcileAgentJob(db: Database, jobId: string, actor: string, input: AgentRetryDecision) {
  validate(input);
  if (!actor || !uuid.test(jobId)) throw new Error('PRISM_RECONCILIATION_IDENTITY_INVALID');
  return inTransaction(db, async connection => {
    // Same serialization boundary as queue admission: no overlapping session owners.
    await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('prism-agent-admission',0))");
    const prior = await connection.query<{job_id:string;actor:string;decision:AgentRetryDecision}>(
      'SELECT job_id,actor,decision FROM prism.agent_reconciliation WHERE decision_id=$1',[input.decisionId]);
    if (prior.rows[0]) {
      assertReplay(prior.rows[0],jobId,actor,input);
      return {jobId,decisionId:input.decisionId,replayed:true};
    }
    const rows = await connection.query<AgentJob>('SELECT * FROM prism.agent_job WHERE id=$1 FOR UPDATE',[jobId]);
    const job = rows.rows[0];
    assertRetryable(job,input);
    const competing = await connection.query("SELECT id FROM prism.agent_job WHERE session_key=$1 AND id<>$2 AND state IN ('running','needs_nova')",[job.session_key,jobId]);
    if (competing.rows.length) throw new Error('PRISM_RECONCILIATION_SESSION_BUSY');
    const source = job.operation === 'design-set'
      ? await connection.query("SELECT r.id FROM prism.design_request r WHERE r.project_id=$1 AND r.status='active' AND r.current_round_id=$2",[job.project_id,jobId])
      : await connection.query("SELECT d.id FROM prism.design_document d JOIN prism.design_revision r ON r.id=d.current_revision_id WHERE d.id::text=$1 AND r.revision::text=$2",[job.request.documentId,String(job.request.expectedRevision)]);
    if (!source.rows.length) throw new Error('PRISM_RECONCILIATION_SOURCE_CHANGED');
    await connection.query('INSERT INTO prism.agent_reconciliation(decision_id,job_id,actor,decision,prior_attempt) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',[input.decisionId,jobId,actor,JSON.stringify(input),JSON.stringify(job)]);
    await connection.query("UPDATE prism.agent_job SET state='accepted',fence=NULL,runner_id=NULL,expires_at=NULL,attempt_envelope=NULL,outcome=NULL,attempt_number=attempt_number+1,updated_at=clock_timestamp() WHERE id=$1",[jobId]);
    return {jobId,decisionId:input.decisionId,replayed:false};
  });
}

function assertReplay(prior: {job_id:string;actor:string;decision:AgentRetryDecision}, jobId:string, actor:string, input:AgentRetryDecision): void {
  if (prior.job_id !== jobId || prior.actor !== actor || sha256Digest(prior.decision) !== sha256Digest(input)) throw new Error('PRISM_RECONCILIATION_CONFLICT');
}
