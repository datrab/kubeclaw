import type {PluginInvocationContext,StageResult} from '@kubeclaw/plugin-sdk';
import {NAMESPACE,object,exact,text,select,ref} from './protocol.ts';
export async function execute(value:unknown,context:PluginInvocationContext):Promise<StageResult> {
  try {
    const input=object(value);exact(input,['candidateStageId']);const candidate=select(context,text(input.candidateStageId),NAMESPACE);
    const result=await context.invoke('demo.handoff',{operation:'deliver',resource:{type:'demo.candidate',canonicalId:candidate.artifactId},payload:{namespace:NAMESPACE,candidate}});
    const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`demo-delivery:${context.contract.lease.attempt.runId}`},payload:{namespace:NAMESPACE,mediaType:'application/json',value:result}});
    return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[ref(stored.artifact)]};
  }catch(error){return {schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'demo.delivery_unresolved',message:error instanceof Error?error.message:String(error)},artifacts:[]};}
}
