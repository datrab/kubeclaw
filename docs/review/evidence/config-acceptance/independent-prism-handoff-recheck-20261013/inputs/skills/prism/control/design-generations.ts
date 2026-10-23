import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { inTransaction, type Database, type Queryable } from '../storage/index.ts';
import { createPreferenceGeneration } from './preference-snapshot.ts';

export type DesignRoundStart = {
  projectId: string; subjectId: string | null; startKey: string;
  architectureDigest: string; architectureRevision: number;
  parentRoundId?: string; documentId?: string; expectedRevision?: number;
};
type ActiveRequest = {id: string; architecture_digest: string; architecture_revision: number | string; current_round_id: string | null; request: Record<string,unknown>};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function sourceRevision(db: Queryable, input: DesignRoundStart, active: ActiveRequest) {
  if (!active.current_round_id && !input.documentId) return null;
  if (!input.documentId || !Number.isSafeInteger(input.expectedRevision) || (input.parentRoundId ?? null) !== active.current_round_id) throw new Error('design round parent and document revision are required');
  const row = await db.query<{id: string}>("SELECT r.id FROM prism.design_document d JOIN prism.design_revision r ON r.id=d.current_revision_id WHERE d.id=$1 AND d.design_request_id=$2 AND d.design_round_id IS NOT DISTINCT FROM $3::uuid AND r.revision=$4 FOR SHARE OF d", [input.documentId,active.id,active.current_round_id,input.expectedRevision]);
  if (!row.rows[0]) throw new Error('design round parent document has changed');
  return row.rows[0].id;
}

export async function startDesignRound(db: Database, input: DesignRoundStart) {
  if (!input.startKey || input.startKey.length > 240) throw new Error('design round idempotency key is required');
  return inTransaction(db, async connection => {
    const project = await connection.query<{id: string}>("SELECT id FROM prism.project WHERE external_id=$1 FOR UPDATE",[input.projectId]);
    if (!project.rows[0]) throw new Error('design round project is not available');
    const projectId = project.rows[0].id; const startDigest = hash(input);
    const prior = await connection.query<{id: string; start_digest: string; request: Record<string,unknown>; snapshot: unknown; snapshot_digest: string;result:unknown}>("SELECT r.id,r.start_digest,r.request,g.snapshot,g.snapshot_digest,r.result FROM prism.design_round r JOIN prism.design_request d ON d.id=r.design_request_id JOIN prism.preference_generation g ON g.id=r.id WHERE r.project_id=$1 AND r.start_key=$2",[projectId,input.startKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].start_digest !== startDigest) throw new Error('design round start key conflicts with recorded request');
      return {generationId:prior.rows[0].id,snapshotDigest:prior.rows[0].snapshot_digest,snapshot:prior.rows[0].snapshot,request:prior.rows[0].request,result:prior.rows[0].result};
    }
    const rows = await connection.query<ActiveRequest>("SELECT id,architecture_digest,architecture_revision,current_round_id,request FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY architecture_revision DESC LIMIT 1",[projectId]);
    const active = rows.rows[0];
    if (!active || active.architecture_digest !== input.architectureDigest || Number(active.architecture_revision) !== input.architectureRevision) throw new Error('design round active architecture has changed');
    if ((input.parentRoundId ?? null) !== active.current_round_id) throw new Error('design round parent has changed');
    const revisionId = await sourceRevision(connection,input,active);
    const feedback = await connection.query<{content: unknown}>("SELECT e.content FROM prism.preference_event e WHERE e.project_id=$1 AND e.consent_scope='project' AND e.content->'target'->>'directionId' IN (SELECT dir.id::text FROM prism.direction dir JOIN prism.design_document d ON d.id=dir.source_document_id WHERE d.design_request_id=$2 AND d.design_round_id IS NOT DISTINCT FROM $3::uuid) ORDER BY e.occurred_at,e.wire_event_id",[projectId,active.id,active.current_round_id]);
    const snapshot = await createPreferenceGeneration(connection,input.subjectId,input.projectId,Date.now(),{operation:'design-set',designRequestId:active.id,architectureDigest:active.architecture_digest,architectureRevision:Number(active.architecture_revision),parentRoundId:active.current_round_id,sourceDocumentId:input.documentId ?? null,sourceRevisionId:revisionId,feedback:feedback.rows.map(row=>row.content)});
    await connection.query("INSERT INTO prism.design_round(id,project_id,design_request_id,architecture_digest,architecture_revision,parent_round_id,source_document_id,source_revision_id,start_key,start_digest,feedback,request) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)",[snapshot.generationId,projectId,active.id,active.architecture_digest,active.architecture_revision,active.current_round_id,input.documentId ?? null,revisionId,input.startKey,startDigest,JSON.stringify(feedback.rows.map(row=>row.content)),JSON.stringify(active.request)]);
    await connection.query("UPDATE prism.design_request SET current_round_id=$2 WHERE id=$1",[active.id,snapshot.generationId]);
    return {...snapshot,request:active.request};
  });
}

export async function boundDesignRound(connection: Queryable, projectId: string, generationId: string, resultDigest: string) {
  const row = await connection.query<{id:string; design_request_id:string; result_digest:string|null; result:unknown; current_round_id:string|null; status:string; architecture_digest:string; active_digest:string; architecture_revision:number; active_revision:number;source_document_id:string|null;source_revision_id:string|null}>("SELECT r.*,d.current_round_id,d.status,d.architecture_digest AS active_digest,d.architecture_revision AS active_revision FROM prism.design_round r JOIN prism.design_request d ON d.id=r.design_request_id WHERE r.id=$1 AND r.project_id=$2",[generationId,projectId]);
  const round = row.rows[0];
  if (!round) throw new Error('design generation does not belong to project');
  if (round.result_digest) {
    if (round.result_digest !== resultDigest) throw new Error('design generation result conflicts with committed content');
    return {requestId:round.design_request_id,replay:round.result};
  }
  if (round.status !== 'active' || round.current_round_id !== generationId || round.architecture_digest !== round.active_digest || Number(round.architecture_revision) !== Number(round.active_revision)) throw new Error('stale design generation');
  if (round.source_document_id) {
    const source = await connection.query("SELECT id FROM prism.design_document WHERE id=$1 AND current_revision_id=$2 FOR SHARE",[round.source_document_id,round.source_revision_id]);
    if (!source.rows.length) throw new Error('design generation parent document changed before result');
  }
  return {requestId:round.design_request_id,replay:null};
}


export function assertSameArchitectureRequest(previous: Record<string, unknown>, current: Record<string, unknown>) {
  const source = (request: Record<string, unknown>) => Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'approvalId'));
  if (!isDeepStrictEqual(source(previous),source(current))) throw new Error('architecture request content conflicts with recorded revision');
}


export async function approvedRoundBaseline(db: Queryable, projectId: string, approvalId: string) {
  return db.query<{bundle_digest:string;bundle_artifact_id:string}>("SELECT b.bundle_digest,b.bundle_artifact_id FROM prism.baseline b JOIN prism.approval a ON a.id=b.approval_id JOIN prism.design_revision rev ON rev.id=a.design_revision_id JOIN prism.design_document d ON d.id=rev.document_id JOIN prism.design_request r ON r.id=d.design_request_id AND r.project_id=b.project_id AND r.status='active' AND d.design_round_id IS NOT DISTINCT FROM r.current_round_id WHERE b.project_id=$1 AND b.approval_id=$2 AND a.architecture_digest=r.architecture_digest",[projectId,approvalId]);
}


export function assertArchitectureTransition(previous: {architecture_revision:number|string;architecture_digest:string;request:Record<string,unknown>}, current: Record<string,unknown> & {architecture:{revision:number;contentDigest:string};approvalId?:string}) {
  const revision=Number(previous.architecture_revision);
  if(!Number.isSafeInteger(revision) || revision<1)throw new Error('stored architecture revision is invalid');
  if(current.architecture.revision<revision)throw new Error('stale architecture revision');
  if(current.architecture.revision===revision){
    if(current.architecture.contentDigest!==previous.architecture_digest)throw new Error('architecture revision digest conflict');
    assertSameArchitectureRequest(previous.request,current);
  }
  if(current.approvalId && current.architecture.contentDigest!==previous.architecture_digest)throw new Error('approval cannot activate a different architecture');
}
