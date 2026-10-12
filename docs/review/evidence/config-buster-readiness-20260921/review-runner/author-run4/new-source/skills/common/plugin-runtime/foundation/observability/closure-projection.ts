import {canonicalJson, type ProducerClosureV1} from '@kubeclaw/pipeline-observability-contract';
import {createHash} from 'node:crypto';
import type {AttemptRetirementIntent, AttemptProjections} from './attempt-projection.ts';
import {replayAssert, replayIdentity, replayObject} from './replay-validation.ts';

export interface ClosureRetirementIntent extends AttemptRetirementIntent {
  closureDigest:string;
}
/** The result's completionIntent remains full; this never points to another closure reference. */
export interface ClosureReference {
  schemaVersion:'attempt-closure-reference.v1';
  resultKey:string;
  closureDigest:string;
  operationId:string;
  actor:string;
  intentDigest:string;
}
export type ClosureProjections=Map<string,ClosureReference>;
export const closureKey=(closure:ProducerClosureV1):string=>canonicalJson([closure.pipelineRunId,closure.closureId]);
export const closureIntentDigest=(intent:ClosureRetirementIntent):string=>`sha256:${createHash('sha256').update(canonicalJson(intent)).digest('hex')}`;
const DIGEST=/^sha256:[a-f0-9]{64}$/u;

export function resolveClosureReference(reference:ClosureReference,results:AttemptProjections):ProducerClosureV1 {
  replayObject(reference,['schemaVersion','resultKey','closureDigest','operationId','actor','intentDigest'],'closure-reference');
  replayAssert(reference.schemaVersion==='attempt-closure-reference.v1'&&typeof reference.resultKey==='string'
    &&DIGEST.test(reference.closureDigest)&&DIGEST.test(reference.intentDigest)
    &&replayIdentity(reference.operationId)&&replayIdentity(reference.actor),'closure-reference-identity');
  const result=results.get(reference.resultKey),closure=result?.completionIntent?.closure;
  replayAssert(result&&closure&&result.storedAt!==null&&closure.closureDigest===reference.closureDigest,'closure-reference-source');
  // Imported result decoding validates the full completion and its import. The
  // copied closure is then subject to the original closure/evidence replay rules.
  return structuredClone(closure);
}

export function decodeClosures(items:readonly (ProducerClosureV1|ClosureReference)[],results:AttemptProjections):{
  closures:ProducerClosureV1[];closureProjections:ClosureProjections;
} {
  const closureProjections:ClosureProjections=new Map();
  const closures=items.map(item=>{
    if(item.schemaVersion==='producer-closure.v1')return item;
    const reference=item as ClosureReference,closure=resolveClosureReference(reference,results),key=closureKey(closure);
    replayAssert(!closureProjections.has(key),'closure-reference-duplicate');
    closureProjections.set(key,reference);return closure;
  });
  replayAssert(closureProjections.size>0,'closure-projections-empty');
  return {closures,closureProjections};
}

export function encodeClosures(closures:readonly ProducerClosureV1[],references:ClosureProjections,results:AttemptProjections):(ProducerClosureV1|ClosureReference)[] {
  let found=0;
  const encoded=closures.map(closure=>{
    const reference=references.get(closureKey(closure));if(!reference)return closure;
    replayAssert(canonicalJson(resolveClosureReference(reference,results))===canonicalJson(closure),'closure-reference-mutated');
    found++;return reference;
  });
  replayAssert(found===references.size,'closure-reference-removed');return encoded;
}
