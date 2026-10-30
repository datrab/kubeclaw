import type { Queryable } from '../storage/index.ts';
export interface ProjectDesignStatus {
  id:string; name:string; state:string; summary:string; documentId:string|null;
}
const summaries:Record<string,string>={accepted:'Waiting for the Prism agent.',running:'Prism is creating the design.',needs_nova:'Design generation stopped. Nova must reconcile the failed attempt before retrying.',completed:'Design generation completed.',superseded:'This attempt was replaced by a newer design request.',not_started:'No design action has started yet.'};
/** Read status even when no document exists; do not create a design by opening it. */
export async function projectDesignStatus(db:Queryable,id:string):Promise<ProjectDesignStatus> {
  const rows=await db.query<{id:string;name:string;state:string|null;document_id:string|null}>(
    "SELECT p.id,p.name,j.state,(SELECT d.source_document_id FROM prism.direction d JOIN prism.design_document doc ON doc.id=d.source_document_id WHERE d.project_id=p.id AND doc.design_request_id=r.id AND doc.design_round_id IS NOT DISTINCT FROM r.current_round_id ORDER BY d.created_at,d.id LIMIT 1) AS document_id FROM prism.project p LEFT JOIN LATERAL (SELECT id,current_round_id FROM prism.design_request WHERE project_id=p.id AND status='active' ORDER BY architecture_revision DESC LIMIT 1) r ON true LEFT JOIN prism.agent_job j ON j.id=r.current_round_id WHERE p.id=$1",[id]);
  const row=rows.rows[0];if(!row)throw new Error('Prism project not found');
  const state=row.state ?? 'not_started';return {id:row.id,name:row.name,state,summary:summaries[state] ?? 'Design status is unavailable.',documentId:row.document_id};
}
