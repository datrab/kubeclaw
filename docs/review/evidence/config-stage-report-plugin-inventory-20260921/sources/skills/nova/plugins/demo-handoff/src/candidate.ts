import type {PluginInvocationContext,StageResult} from '@kubeclaw/plugin-sdk';
import {NAMESPACE,object,exact,text,target,select,evidence,ref,retention} from './protocol.ts';
export async function execute(value:unknown,context:PluginInvocationContext):Promise<StageResult> {
  try {
    const input=object(value);exact(input,['manifestStageId','authNodeId','protocol','operatorTarget','retentionSeconds']);
    if(input.protocol!=='json-session.v1')throw new Error('DEMO_HANDOFF_PROTOCOL_UNSUPPORTED');
    const manifest=select(context,text(input.manifestStageId),'kubeclaw.project-summary');
    const authNodeId=text(input.authNodeId),operatorTarget=target(input.operatorTarget);
    const verified=await evidence(context,manifest,authNodeId);
    const candidate={schemaVersion:'demo-candidate.v1',runId:context.contract.lease.attempt.runId,manifest,authNodeId,protocol:input.protocol,operatorTarget,retentionSeconds:retention(input.retentionSeconds),evidence:verified};
    const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`demo-candidate:${candidate.runId}`},payload:{namespace:NAMESPACE,mediaType:'application/json',value:candidate}});
    return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[ref(stored.artifact)]};
  }catch(error){return {schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'demo.candidate_invalid',message:error instanceof Error?error.message:String(error)},artifacts:[]};}
}
