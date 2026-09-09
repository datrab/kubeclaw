import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalJson, validatePipelineObservabilityContract} from '@kubeclaw/pipeline-observability-contract';
import {validatePipelineWorkerCoreContract, type WorkerAttemptResultV1} from '@kubeclaw/pipeline-worker-core-contract';
import type {DurableAttemptStoreLimits, DurableAttemptStoreSnapshot, DurableResultMetadata} from './durable-attempts.ts';
import {assertAttemptReplay} from './attempt-replay.ts';
import {parseHashJournal, type HashJournalRecord} from './hash-journal.ts';
import {replayAssert, replayIdentity, replayObject} from './replay-validation.ts';

export interface AttemptRetirementIntent {
  pipelineRunId:string; attemptId:string; claimGeneration:number; resultDigest:string;
  recordDigest:string; operationId:string; actor:string; runRoot:string;
  runJournalHead:string; snapshotDigest:string; expectedStoreDigest:string;
  journalSequence:number; journalHash:string;
}
export interface AttemptResultReference {
  schemaVersion:'attempt-result-reference.v1';
  intent:AttemptRetirementIntent;
  journalPrefixBytes:number;
}
export type ProjectedResultMetadata=Omit<DurableResultMetadata,'result'> & {resultReference:AttemptResultReference};
export type AttemptProjections=Map<string,ProjectedResultMetadata>;
export interface PersistedAttemptV2 extends Omit<DurableAttemptStoreSnapshot,'schemaVersion'|'results'> {
  schemaVersion:'durable-attempt-store.v2';
  results:(DurableResultMetadata|ProjectedResultMetadata)[];
}
interface ImportEntry {
  schemaVersion:string;
  decisionKey:string;
  decision:{pipelineRunId:string;planId:string;nodeId:string;attemptId:string;claimGeneration:number;action:string;
    nextClaimGeneration:number|null;result:WorkerAttemptResultV1;completeness:{pipelineRunId:string;state:string;requiredClosureIds:string[];admittedClosureIds:string[];missingClosureIds:string[];missingRanges:unknown[];unresolvedItems:unknown[]}};
}
export const attemptProjectionKey=(item:{pipelineRunId:string;attemptId:string;claimGeneration:number}):string=>canonicalJson([item.pipelineRunId,item.attemptId,item.claimGeneration]);
export const attemptStoreDigest=(bytes:Uint8Array):string=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const DIGEST=/^sha256:[a-f0-9]{64}$/u;

export function assertAttemptRetirementIntent(intent:AttemptRetirementIntent,root:string):void {
  replayObject(intent,['pipelineRunId','attemptId','claimGeneration','resultDigest','recordDigest','operationId','actor','runRoot','runJournalHead','snapshotDigest','expectedStoreDigest','journalSequence','journalHash'],'attempt-retirement-intent');
  for(const field of ['pipelineRunId','attemptId','operationId','actor'] as const)replayAssert(replayIdentity(intent[field]),'attempt-retirement-identity');
  for(const field of ['resultDigest','recordDigest','runJournalHead','snapshotDigest','expectedStoreDigest','journalHash'] as const)replayAssert(DIGEST.test(intent[field]),'attempt-retirement-digest');
  replayAssert(Number.isSafeInteger(intent.claimGeneration)&&intent.claimGeneration>0&&Number.isSafeInteger(intent.journalSequence)&&intent.journalSequence>0,'attempt-retirement-sequence');
  replayAssert(typeof intent.runRoot==='string'&&path.isAbsolute(intent.runRoot)&&path.resolve(intent.runRoot)===intent.runRoot
    &&root===path.join(intent.runRoot,'observability/attempts'),'attempt-retirement-root');
}
export function attemptImportJournal(root:string):string {return path.join(path.dirname(root),'reconciliation.jsonl');}

/** Reads an existing regular canonical file or immutable prefix, never follows a link or repairs a tail. */
export function readAttemptJournalPrefix(file:string,maximumBytes:number,prefixBytes?:number):Buffer {
  replayAssert(Number.isSafeInteger(maximumBytes)&&maximumBytes>0,'attempt-journal-read-limit');
  replayAssert(fs.realpathSync(file)===file,'attempt-journal-path');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    const stat=fs.fstatSync(fd),length=prefixBytes??stat.size;
    replayAssert(stat.isFile()&&Number.isSafeInteger(length)&&length>0&&length<=maximumBytes&&stat.size>=length,'attempt-journal-size');
    const bytes=Buffer.alloc(length);let offset=0;
    while(offset<length){const count=fs.readSync(fd,bytes,offset,length-offset,offset);replayAssert(count>0,'attempt-journal-truncated');offset+=count;}
    replayAssert(fs.realpathSync(file)===file,'attempt-journal-path');
    return bytes;
  } finally {fs.closeSync(fd);}
}
function assertReference(item:ProjectedResultMetadata,root:string,maximumBytes:number):void {
  replayObject(item,['pipelineRunId','planId','nodeId','attemptId','claimGeneration','workerId','completionIntent','storedAt','resultReference'],'attempt-projected-result');
  const reference=item.resultReference;
  replayObject(reference,['schemaVersion','intent','journalPrefixBytes'],'attempt-result-reference');
  replayAssert(reference.schemaVersion==='attempt-result-reference.v1','attempt-result-reference-version');
  assertAttemptRetirementIntent(reference.intent,root);
  replayAssert(attemptProjectionKey(item)===attemptProjectionKey(reference.intent)&&item.completionIntent?.record.recordDigest===reference.intent.recordDigest,'attempt-result-reference-owner');
  replayAssert(Number.isSafeInteger(reference.journalPrefixBytes)&&reference.journalPrefixBytes>0&&reference.journalPrefixBytes<=maximumBytes,'attempt-result-reference-budget');
}
function assertImportedCompleteness(item:ProjectedResultMetadata,d:ImportEntry['decision']):void {
  validatePipelineObservabilityContract('observabilityCompleteness',d.completeness);
  const closure=item.completionIntent?.closure,c=d.completeness;
  replayAssert(closure&&c.pipelineRunId===item.pipelineRunId&&c.state==='complete'&&!c.missingClosureIds.length&&!c.missingRanges.length&&!c.unresolvedItems.length
    &&c.requiredClosureIds.includes(closure.closureId)&&c.admittedClosureIds.includes(closure.closureId),'attempt-result-import-completeness');
}
function resolveResult(item:ProjectedResultMetadata,record:HashJournalRecord<ImportEntry>):WorkerAttemptResultV1 {
  const {intent}=item.resultReference,entry=record.entry,d=entry.decision;
  replayAssert(record.sequence===intent.journalSequence&&record.hash===intent.journalHash&&entry.schemaVersion==='nova-observability-reconciliation.v1','attempt-result-journal-binding');
  replayAssert(d?.pipelineRunId===item.pipelineRunId&&d.planId===item.planId&&d.nodeId===item.nodeId&&d.attemptId===item.attemptId&&d.claimGeneration===item.claimGeneration
    &&d.action==='imported'&&d.nextClaimGeneration===null,'attempt-result-import-owner');
  validatePipelineWorkerCoreContract('workerAttemptResult',d.result);
  replayAssert(d.result.resultDigest===intent.resultDigest&&d.result.workerId===item.workerId&&item.storedAt!==null,'attempt-result-import-digest');
  replayAssert(entry.decisionKey===[item.pipelineRunId,item.planId,item.nodeId,item.attemptId,String(item.claimGeneration),intent.resultDigest,'imported'].join('|'),'attempt-result-import-key');
  assertImportedCompleteness(item,d);
  return structuredClone(d.result);
}
function offsets(bytes:Buffer):number[] {
  const ends:number[]=[];let at=-1;
  while((at=bytes.indexOf(10,at+1))!==-1)ends.push(at+1);
  return ends;
}

/** All references share the canonical run journal: one bounded read and one chain validation. */
export function decodeAttemptState(raw:DurableAttemptStoreSnapshot|PersistedAttemptV2,root:string,limits:DurableAttemptStoreLimits,
  readPrefix:(file:string,maximumBytes:number,prefixBytes:number)=>Buffer=readAttemptJournalPrefix,
):{state:DurableAttemptStoreSnapshot;projections:AttemptProjections} {
  if(raw.schemaVersion==='durable-attempt-store.v1') {assertAttemptReplay(raw,root,limits);return {state:raw,projections:new Map()};}
  replayObject(raw,['schemaVersion','evidence','results','closures'],'attempt-v2-envelope');
  replayAssert(raw.schemaVersion==='durable-attempt-store.v2'&&Array.isArray(raw.results),'attempt-v2-version');
  const projected=raw.results.filter((item):item is ProjectedResultMetadata=>Object.hasOwn(item,'resultReference'));
  replayAssert(projected.length>0,'attempt-v2-empty-projections');
  for(const item of projected)assertReference(item,root,limits.maximumMetadataBytes);
  const maximumPrefix=projected.reduce((maximum,item)=>Math.max(maximum,item.resultReference.journalPrefixBytes),0);
  const journal=attemptImportJournal(root),bytes=readPrefix(journal,limits.maximumMetadataBytes,maximumPrefix);
  replayAssert(bytes.length===maximumPrefix,'attempt-journal-prefix-length');
  const records=parseHashJournal<ImportEntry>(bytes,journal),ends=offsets(bytes),projections:AttemptProjections=new Map();
  const results=raw.results.map(item=>{
    if(!('resultReference' in item))return item;
    const ref=item.resultReference,record=records[ref.intent.journalSequence-1];
    replayAssert(record&&ends[ref.intent.journalSequence-1]===ref.journalPrefixBytes,'attempt-journal-prefix-binding');
    const key=attemptProjectionKey(item);replayAssert(!projections.has(key),'attempt-result-projection-duplicate');projections.set(key,item);
    const {resultReference:_,...metadata}=item;
    return {...metadata,result:resolveResult(item,record)};
  });
  const state:DurableAttemptStoreSnapshot={...raw,schemaVersion:'durable-attempt-store.v1',results};
  assertAttemptReplay(state,root,limits,projections.size);
  return {state,projections};
}

export function encodeAttemptState(state:DurableAttemptStoreSnapshot,projections:AttemptProjections):DurableAttemptStoreSnapshot|PersistedAttemptV2 {
  if(!projections.size)return state;
  let found=0;
  const results=state.results.map(item=>{
    const projected=projections.get(attemptProjectionKey(item));if(!projected)return item;
    const {result,...metadata}=item,{resultReference,...retained}=projected;
    replayAssert(result.resultDigest===resultReference.intent.resultDigest&&canonicalJson(metadata)===canonicalJson(retained),'attempt-projection-mutated');
    found++;return projected;
  });
  replayAssert(found===projections.size,'attempt-projection-removed');
  return {...state,schemaVersion:'durable-attempt-store.v2',results};
}

export function createAttemptProjection(item:DurableResultMetadata,intent:AttemptRetirementIntent,root:string,maximumBytes:number):ProjectedResultMetadata {
  assertAttemptRetirementIntent(intent,root);
  const journal=attemptImportJournal(root),bytes=readAttemptJournalPrefix(journal,maximumBytes);
  const records=parseHashJournal<ImportEntry>(bytes,journal),end=offsets(bytes)[intent.journalSequence-1];
  replayAssert(end!==undefined,'attempt-import-checkpoint-missing');
  const {result,...metadata}=item;
  const projected:ProjectedResultMetadata={...metadata,resultReference:{schemaVersion:'attempt-result-reference.v1',intent:structuredClone(intent),journalPrefixBytes:end}};
  assertReference(projected,root,maximumBytes);
  replayAssert(canonicalJson(resolveResult(projected,records[intent.journalSequence-1]!))===canonicalJson(result),'attempt-import-result-changed');
  return projected;
}
