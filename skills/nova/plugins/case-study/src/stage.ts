import type{ArtifactRef,PluginInvocationContext,StageResult}from'@kubeclaw/plugin-sdk';
import{buildRequest,parseCaseStudy,type CaseStudyInput}from'./protocol.js';
export async function execute(input:CaseStudyInput,context:PluginInvocationContext):Promise<StageResult>{
  const agent=context.contract.config.agent;if(typeof agent!=='string'||!agent.trim())throw new Error('case study agent is not configured');
  let study;
  try{const response=await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:agent},payload:buildRequest(agent,input)});
    study=parseCaseStudy(response.result,input);
  }catch(error){return{schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'case_study.invalid_output',message:error instanceof Error?error.message:String(error)},artifacts:[]};}
  const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`case-study:${input.runId}`},
    payload:{namespace:'kubeclaw.case-study',mediaType:'application/json',value:study}});
  return{schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[stored.artifact as ArtifactRef]};
}
