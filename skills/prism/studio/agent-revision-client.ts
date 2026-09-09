import type {PrismDocument} from '@kubeclaw/prism-contracts-v1';
import {roundResponse,responseObject} from './round-response.ts';
export type RevisionClient={documentId:string;userId:string;csrf:string;origin:string;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>};
export type PendingRevision={operation:'generate';baseRevision:number;input:{instruction:string;mode:'refine'};idempotencyKey:string;jobId?:string};
const key=(client:RevisionClient)=>`prism-agent-revision:${JSON.stringify([client.userId,client.documentId])}`;
export function savedRevision(client:RevisionClient):PendingRevision|null {
 const raw=client.storage.getItem(key(client));if(!raw)return null;
 const value=JSON.parse(raw) as PendingRevision;
 if(value.operation!=='generate'||!Number.isSafeInteger(value.baseRevision)||!value.idempotencyKey||!value.input?.instruction)throw new Error('Stored Prism revision request is invalid and has been retained');
 return value;
}
export function pendingRevision(client:RevisionClient,document:PrismDocument,instruction:string){
 const pending=savedRevision(client)??{operation:'generate' as const,baseRevision:document.meta.revision,input:{instruction,mode:'refine' as const},idempotencyKey:crypto.randomUUID()};
 client.storage.setItem(key(client),JSON.stringify(pending));return pending;
}
export async function submitRevision(client:RevisionClient,pending:PendingRevision){
 const response=await fetch(new URL(`/v1/documents/${encodeURIComponent(client.documentId)}/engine`,client.origin),{method:'POST',headers:{'content-type':'application/json','x-prism-csrf':client.csrf},body:JSON.stringify(pending)});
 const receipt=await roundResponse<{jobId:string}>(response,`Submit Prism revision for document ${client.documentId}`,value=>responseObject(value)&&typeof value.jobId==='string','a durable jobId');
 if(pending.jobId && receipt.jobId!==pending.jobId)throw new Error('Prism revision job identity changed; original request retained');
 const accepted={...pending,jobId:receipt.jobId};client.storage.setItem(key(client),JSON.stringify(accepted));return accepted;
}
export async function waitForRevision(client:RevisionClient,pending:PendingRevision){
 if(!pending.jobId)throw new Error('Persisted Prism revision job identity is required');
 for(let attempt=0;attempt<300;attempt++){
  const response=await fetch(new URL(`/v1/agent-jobs/${encodeURIComponent(pending.jobId)}`,client.origin));
  const receipt=await roundResponse<{status:string;result:PrismDocument|null}>(response,`Reconcile Prism revision job ${pending.jobId}`,value=>responseObject(value)&&typeof value.status==='string','an agent job status');
  if(receipt.status==='completed'){
   if(!receipt.result?.meta || receipt.result.meta.revision!==pending.baseRevision+1)throw new Error('Prism revision receipt has an invalid document; request retained');
   client.storage.removeItem(key(client));return receipt.result;
  }
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 throw new Error(`Prism revision job ${pending.jobId} is still pending; the same request identity is retained for reconciliation`);
}
