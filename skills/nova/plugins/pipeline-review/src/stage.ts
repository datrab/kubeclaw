import type { ArtifactRef,PluginInvocationContext,StageResult } from '@kubeclaw/plugin-sdk';
import {buildRequest,parseReport,type ReviewInput} from './protocol.js';
export async function execute(input:ReviewInput,context:PluginInvocationContext):Promise<StageResult>{
  const agent=context.contract.config.agent;
  if(typeof agent!=='string'||!agent.trim()) throw new Error('pipeline review agent is not configured');
  let report;
  try{
    const response=await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:agent},payload:buildRequest(agent,input)});
    report=parseReport(response.result,input);
  }catch(error){
    return {schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'pipeline_review.invalid_report',message:error instanceof Error?error.message:String(error)},artifacts:[]};
  }
  const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`pipeline-review:${input.runId}:${input.attempt}`},
    payload:{namespace:'kubeclaw.pipeline-review',mediaType:'application/json',value:report}});
  return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[stored.artifact as ArtifactRef]};
}
