import type{ArtifactRef,PluginInvocationContext,StageResult}from'@kubeclaw/plugin-sdk';import{buildRequest,parseVerdict,type GateInput}from'./protocol.ts';
function providerEvidence(response:Readonly<Record<string,unknown>>){
 if(response.schemaVersion!=='test-plan-receipt.v1'||response.provider!=='buster-plan-v1'||typeof response.resultDigest!=='string'||!/^[a-f0-9]{64}$/u.test(response.resultDigest))throw new Error('TEST_PLAN_RECEIPT_INVALID');
 const decision=response.decision as Readonly<Record<string,unknown>>|undefined;
 if(!decision||!Array.isArray(decision.nodes)||!['passed','failed','blocked'].includes(String(decision.state)))throw new Error('TEST_PLAN_RECEIPT_INVALID');
 const effects=new Set(['passed','failed','advisory_failure','execution_error','review_required','skipped']);
 const nodes=decision.nodes.map((value)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('TEST_PLAN_RECEIPT_INVALID');const node=value as Readonly<Record<string,unknown>>;if(typeof node.nodeId!=='string'||typeof node.effect!=='string'||!effects.has(node.effect))throw new Error('TEST_PLAN_RECEIPT_INVALID');return{suite:node.nodeId,passed:['passed','advisory_failure'].includes(node.effect),summary:`provider effect=${node.effect}`};});
 return[{suite:'provider-plan',passed:decision.state==='passed',summary:`provider decision=${String(decision.state)}`},...nodes];
}
async function executeProviderPlan(input:GateInput,context:PluginInvocationContext){if(!input.providerPlan)return{suiteEvidence:[],execution:null};const response=await context.invoke('test.plan.execute',{operation:'run',resource:{type:'test.resolved-plan',canonicalId:input.providerPlan.repositoryRoot},payload:{...input.providerPlan}});return{suiteEvidence:providerEvidence(response),execution:response};}
async function executeBusterSuites(input:GateInput,context:PluginInvocationContext){
 if(input.suitePlan.suites.length>0)throw new Error('LEGACY_TEST_SUITE_RETIRED');
 const provider=await executeProviderPlan(input,context);
 return{suiteEvidence:[...input.suiteEvidence,...provider.suiteEvidence],suiteExecution:{provider:provider.execution}};
}
export async function execute(input:GateInput,context:PluginInvocationContext):Promise<StageResult>{
 const agent=context.contract.config.agent;if(typeof agent!=='string'||!agent.trim())throw new Error('quality evaluator agent is not configured');let verdict;let executionEvidence:unknown=null;let finalSuiteEvidence=input.suiteEvidence;
 try{const executed=await executeBusterSuites(input,context);finalSuiteEvidence=executed.suiteEvidence;executionEvidence=executed.suiteExecution;const judgedInput={...input,suiteEvidence:finalSuiteEvidence};const response=await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:agent},payload:buildRequest(agent,judgedInput)});verdict=parseVerdict(response.result,judgedInput);}
 catch(error){return{schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'buster_quality.invalid_verdict',message:error instanceof Error?error.message:String(error)},artifacts:[]};}
 const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`buster-quality:${input.gateId}:${input.attempt}`},payload:{namespace:'kubeclaw.buster-quality-gate',mediaType:'application/json',value:{verdict,suiteEvidence:finalSuiteEvidence,suiteExecution:executionEvidence}}});
 const artifacts=[stored.artifact as ArtifactRef];if(verdict.outcome==='passed')return{schemaVersion:'stage-result.v2',outcome:'passed',artifacts};
 return{schemaVersion:'stage-result.v2',outcome:verdict.outcome,reason:{code:`buster_quality.${verdict.failureClass}`,message:verdict.summary,details:{findings:verdict.findings}},artifacts};
}
