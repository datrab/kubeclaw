import {roundResponse,responseObject} from "./round-response.ts";
import type {PrismDocument} from '@kubeclaw/prism-contracts-v1';
export type StudioDirection={id:string;generation_id?:string;source_document_id?:string;title:string;summary:string;state:string;evidence?:{thesis?:string;tradeoffs?:string[];references?:Array<{id?:string;summary?:string}>}};
export type PendingRound={documentId:string;expectedRevision:number;parentRoundId?:string;idempotencyKey:string;generationId?:string};
export type RoundClient={projectId:string;userId:string;csrf:string;origin:string;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>};
const key=(client:RoundClient)=>`prism-round:${client.userId}:${client.projectId}`;
const route=(client:RoundClient,path:string)=>new URL(path,client.origin);
export function savedRound(client:RoundClient):PendingRound|null {
 const raw=client.storage.getItem(key(client));if(!raw)return null;
 const value=JSON.parse(raw) as PendingRound;
 if(!value.documentId || !Number.isSafeInteger(value.expectedRevision) || !value.idempotencyKey)throw new Error('Stored round request is invalid; it was retained for inspection');
 return value;
}
export function saveRound(client:RoundClient,pending:PendingRound){client.storage.setItem(key(client),JSON.stringify(pending));}
export function pendingRound(client:RoundClient,source:Omit<PendingRound,'idempotencyKey'|'generationId'>):PendingRound {
 const pending=savedRound(client) ?? {...source,idempotencyKey:crypto.randomUUID()};saveRound(client,pending);return pending;
}
export async function submitRound(client:RoundClient,pending:PendingRound) {
 const response=await fetch(route(client,`/v1/projects/${encodeURIComponent(client.projectId)}/directions`),{method:'POST',headers:{'content-type':'application/json','x-prism-csrf':client.csrf},body:JSON.stringify(pending)});
 const receipt=await roundResponse<{generationId:string}>(response,`Submit design round for project ${client.projectId}`,value=>responseObject(value)&&typeof value.generationId==='string'&&value.generationId.length>0,'a nonempty generationId');
 if(pending.generationId && pending.generationId!==receipt.generationId)throw new Error('Round identity changed unexpectedly');
 const accepted={...pending,generationId:receipt.generationId};saveRound(client,accepted);return accepted;
}
export async function currentDirections(client:RoundClient) {
 const response=await fetch(route(client,`/v1/projects/${encodeURIComponent(client.projectId)}/directions`));
 return (await roundResponse<{items:StudioDirection[]}>(response,`Load design directions for project ${client.projectId}`,value=>responseObject(value)&&Array.isArray(value.items)&&value.items.every(item=>responseObject(item)&&typeof item.id==='string'&&typeof item.state==='string'),'an items array of direction objects with id and state')).items;
}
export async function loadRoundDocument(client:RoundClient,directions:StudioDirection[],currentId?:string) {
 const documentId=directions.find(item=>item.source_document_id===currentId)?.source_document_id ?? directions[0]?.source_document_id;
 if(!documentId)throw new Error('Round document identity is missing');
 const response=await fetch(route(client,`/v1/documents/${encodeURIComponent(documentId)}`));
 const value=await roundResponse<{document:PrismDocument}>(response,`Load design document ${documentId}`,value=>responseObject(value)&&responseObject(value.document)&&responseObject(value.document.meta),'a document object with metadata');
 return {directions,documentId,document:value.document};
}
export function completeRound(client:RoundClient,directions:StudioDirection[]) {
 const pending=savedRound(client);
 if(!pending || !directions.length || !directions.every(item=>item.generation_id===pending.generationId))return false;
 client.storage.removeItem(key(client));return true;
}
export async function waitForRound(client:RoundClient,pending:PendingRound,attempts=30) {
 for(let attempt=0;attempt<attempts;attempt++){
  const directions=await currentDirections(client);
  if(directions.length && directions[0]?.generation_id!==pending.generationId)throw new Error('Pending round was superseded; the request key is retained');
  if(directions.length===3 && directions.every(item=>item.generation_id===pending.generationId)){
   const loaded=await loadRoundDocument(client,directions);completeRound(client,directions);return loaded;
  }
  if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,2000));
 }
 return null;
}
