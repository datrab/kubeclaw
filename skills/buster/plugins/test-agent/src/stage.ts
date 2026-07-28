import type{ArtifactRef,PluginInvocationContext,StageResult}from'@kubeclaw/plugin-sdk';import{buildRequest,parseVerdict,type TestInput}from'./protocol.js';
export async function execute(input:TestInput,context:PluginInvocationContext):Promise<StageResult>{
 const agent=context.contract.config.agent;if(typeof agent!=='string'||!agent.trim())throw new Error('test agent is not configured');let verdict;
 try{const response=await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:agent},payload:buildRequest(agent,input)});verdict=parseVerdict(response.result,input);}
 catch(error){return{schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'test_agent.invalid_verdict',message:error instanceof Error?error.message:String(error)},artifacts:[]};}
 const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`test-verdict:${input.taskId}:${input.attempt}`},payload:{namespace:'kubeclaw.test-agent',mediaType:'application/json',value:verdict}});
 const artifacts=[stored.artifact as ArtifactRef];return verdict.verdict==='PASS'?{schemaVersion:'stage-result.v2',outcome:'passed',artifacts}:
  {schemaVersion:'stage-result.v2',outcome:'request_fix',reason:{code:'test_agent.findings',message:verdict.summary,details:{findings:verdict.findings}},artifacts};
}
