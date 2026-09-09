import path from 'node:path';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import {fileURLToPath} from 'node:url';
import { canonicalJson, validatePipelineObservabilityContract, type AdmissionAcknowledgementV1 } from '@kubeclaw/pipeline-observability-contract';
import { assertAttemptReplay } from './attempt-replay.ts';
import { replayAssert, replayIdentity, replayObject } from './replay-validation.ts';
import { scopedEvidenceId, type DurableAttemptStoreSnapshot, type DurableResultMetadata } from './durable-attempts.ts';
import {createHash} from 'node:crypto';
import type { AdmittedRecordView } from './durable-delivery.ts';

/** A reference to an immutable, already committed completion, never a new archive. */
export interface AdmissionCompletionReference {
  file: string;
  maximumBytes: number;
  pipelineRunId: string;
  planId: string;
  nodeId: string;
  attemptId: string;
  claimGeneration: number;
  resultDigest: string;
  closureDigest: string;
}
export interface AdmissionRetiredEntry {
  key: string;
  acknowledgement: AdmissionAcknowledgementV1;
  source: AdmissionCompletionReference;
  operationId: string;
  actor: string;
  authority: {runRoot:string;journalHead:string;snapshotDigest:string};
}
export function assertAdmissionRetiredEntry(entry: AdmissionRetiredEntry): void {
  replayObject(entry, ['key','acknowledgement','source','operationId','actor','authority'], 'admission-retired-entry');
  replayAssert(replayIdentity(entry.operationId) && replayIdentity(entry.actor), 'admission-retirement-author');
  validatePipelineObservabilityContract('admissionAcknowledgement',entry.acknowledgement);
  replayAssert(entry.acknowledgement.state === 'duplicate','admission-retirement-ack');
  const s=entry.source, a=entry.acknowledgement;
  replayObject(entry.authority,['runRoot','journalHead','snapshotDigest'],'admission-retirement-authority');
  replayAssert(typeof entry.authority.runRoot==='string' && path.isAbsolute(entry.authority.runRoot) && path.resolve(entry.authority.runRoot)===entry.authority.runRoot
    && /^sha256:[a-f0-9]{64}$/.test(entry.authority.journalHead) && /^sha256:[a-f0-9]{64}$/.test(entry.authority.snapshotDigest),'admission-retirement-authority-binding');
  replayObject(s,['file','maximumBytes','pipelineRunId','planId','nodeId','attemptId','claimGeneration','resultDigest','closureDigest'],'admission-retirement-source');
  replayAssert(s.file === path.join(entry.authority.runRoot,'observability/attempts/attempt-store.json'),'admission-retirement-file');
  replayAssert(Number.isSafeInteger(s.maximumBytes) && s.maximumBytes > 0 && Number.isSafeInteger(s.claimGeneration) && s.claimGeneration > 0,'admission-retirement-bounds');
  for(const field of ['pipelineRunId','planId','nodeId','attemptId'] as const)replayAssert(replayIdentity(s[field]),'admission-retirement-owner');
  replayAssert(/^sha256:[a-f0-9]{64}$/.test(s.resultDigest) && /^sha256:[a-f0-9]{64}$/.test(s.closureDigest),'admission-retirement-digest');
  replayAssert(a.pipelineRunId === s.pipelineRunId && entry.key === [a.producer.producerId,a.producer.bootId,a.producer.producerType,a.pipelineRunId,String(a.sequence)].join('|'),'admission-retirement-identity');
}

/** Atomic source snapshots are immutable for this result identity. No nested store lock. */
async function readRetirementBytes(file:string,maximumBytes:number):Promise<Buffer> {
  replayAssert(await fs.realpath(file)===file,'admission-retirement-source-path');
  const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let bytes:Buffer;
  try {
    const stat=await handle.stat();
    replayAssert(stat.isFile() && stat.size<=maximumBytes,'admission-retirement-source-size');
    bytes=Buffer.alloc(stat.size);let offset=0;
    while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,offset);replayAssert(read.bytesRead>0,'admission-retirement-source-truncated');offset+=read.bytesRead;}
    replayAssert((await handle.read(Buffer.alloc(1),0,1,offset)).bytesRead===0,'admission-retirement-source-grew');
  } finally {await handle.close();}
  replayAssert(await fs.realpath(file)===file,'admission-retirement-source-path');
  return bytes;
}
async function readSource(s:AdmissionCompletionReference):Promise<DurableAttemptStoreSnapshot> {
  const state=JSON.parse((await readRetirementBytes(s.file,s.maximumBytes)).toString()) as DurableAttemptStoreSnapshot;
  assertAttemptReplay(state,path.dirname(s.file),{
    maximumEvidenceObjects:Number.MAX_SAFE_INTEGER,maximumEvidenceBytes:Number.MAX_SAFE_INTEGER,
    maximumEvidenceObjectBytes:Number.MAX_SAFE_INTEGER,maximumResults:Number.MAX_SAFE_INTEGER,
    maximumClosures:Number.MAX_SAFE_INTEGER,maximumMetadataBytes:s.maximumBytes,maximumPendingEvidenceAgeMs:Number.MAX_SAFE_INTEGER,
  });
  return state;
}
export function resolveAdmissionRetiredSnapshot(entry:AdmissionRetiredEntry,state:DurableAttemptStoreSnapshot):AdmittedRecordView {
  assertAdmissionRetiredEntry(entry);
  const s=entry.source;
  const result=state.results.find(item=>item.pipelineRunId===s.pipelineRunId && item.attemptId===s.attemptId && item.claimGeneration===s.claimGeneration);
  replayAssert(result?.storedAt && result.planId===s.planId && result.nodeId===s.nodeId && result.result.resultDigest===s.resultDigest,'admission-retirement-source-result');
  const intent=result.completionIntent;
  replayAssert(intent && intent.closure.closureDigest===s.closureDigest && state.closures.some(item=>canonicalJson(item)===canonicalJson(intent.closure)),'admission-retirement-source-closure');
  const record=intent.record,a=entry.acknowledgement;
  replayAssert(record.recordDigest===a.recordDigest && record.recordId===a.recordId && canonicalJson(record.producer)===canonicalJson(a.producer)
    && record.sequence===a.sequence && record.correlation.pipelineRunId===a.pipelineRunId,'admission-retirement-source-record');
  return {record:structuredClone(record),canonicalCursor:a.canonicalCursor,admittedAt:a.admittedAt};
}

export async function resolveAdmissionRetiredEntries(entries:readonly AdmissionRetiredEntry[]):Promise<AdmittedRecordView[]> {
  const sources=new Map<string,Promise<DurableAttemptStoreSnapshot>>();
  return Promise.all(entries.map(async entry=>{
    assertAdmissionRetiredEntry(entry);
    const key=canonicalJson([entry.source.file,entry.source.maximumBytes]);
    let source=sources.get(key);
    if(!source){source=readSource(entry.source);sources.set(key,source);}
    return resolveAdmissionRetiredSnapshot(entry,await source);
  }));
}
export async function resolveAdmissionRetiredEntry(entry:AdmissionRetiredEntry):Promise<AdmittedRecordView> {
  return (await resolveAdmissionRetiredEntries([entry]))[0]!;
}

async function assertCompletionEvidence(state:DurableAttemptStoreSnapshot,result:DurableResultMetadata):Promise<void> {
      for(const evidenceId of result.completionIntent!.closure.requiredEvidenceIds) {
        const metadata=state.evidence.find(item=>item.pipelineRunId===result.pipelineRunId && item.attemptId===result.attemptId && item.claimGeneration===result.claimGeneration
          && canonicalJson(item.producer)===canonicalJson(result.completionIntent!.closure.producer) && scopedEvidenceId(item.attemptId,item.claimGeneration,item.evidenceId)===evidenceId
          && result.result.evidence.some(ref=>ref.evidenceId===item.evidenceId));
        if(!metadata)throw new Error('OBSERVABILITY_RETIREMENT_EVIDENCE_REQUIRED');
        const bytes=await readRetirementBytes(fileURLToPath(metadata.artifact.storageUrl),metadata.artifact.sizeBytes);
        if(bytes.length!==metadata.artifact.sizeBytes || `sha256:${createHash('sha256').update(bytes).digest('hex')}`!==metadata.artifact.contentDigest)throw new Error('OBSERVABILITY_RETIREMENT_EVIDENCE_CHANGED');
      }
}
export async function completionRetirementSource(state:DurableAttemptStoreSnapshot,scope:{pipelineRunId:string;attemptId:string;claimGeneration:number;recordDigest:string},file:string,maximumBytes:number):Promise<AdmissionCompletionReference> {
      const result=state.results.find(item=>item.pipelineRunId===scope.pipelineRunId && item.attemptId===scope.attemptId && item.claimGeneration===scope.claimGeneration);
      if(!result?.storedAt || !result.planId || !result.nodeId || !result.completionIntent)throw new Error('OBSERVABILITY_RETIREMENT_COMPLETION_REQUIRED');
      const {record,closure}=result.completionIntent;
      if(record.recordDigest!==scope.recordDigest || closure.recordCount!==1 || closure.firstSequence!==1 || closure.finalSequence!==1 || record.sequence!==1
        || !state.closures.some(item=>canonicalJson(item)===canonicalJson(closure)))throw new Error('OBSERVABILITY_RETIREMENT_CLOSURE_REQUIRED');

  await assertCompletionEvidence(state,result);
  return {file,maximumBytes,pipelineRunId:scope.pipelineRunId,planId:result.planId,nodeId:result.nodeId,attemptId:scope.attemptId,claimGeneration:scope.claimGeneration,resultDigest:result.result.resultDigest,closureDigest:closure.closureDigest};
}
