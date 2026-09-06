import { resolveSourceRevision } from '@kubeclaw/plugin-sdk';
import { parseGateDecision, gateDecisionEvidence, gateDecisionStageResult } from '@kubeclaw/pipeline-test-gate-contract';
import type{ArtifactRef,PluginInvocationContext,StageResult}from'@kubeclaw/plugin-sdk';import{buildRequest,parseVerdict,type GateInput}from'./protocol.ts';
async function executeProviderPlan(input:GateInput,context:PluginInvocationContext){if(!input.providerPlan)return{suiteEvidence:[],execution:null};const response=await context.invoke('test.plan.execute',{operation:'run',resource:{type:'test.resolved-plan',canonicalId:input.providerPlan.repositoryRoot},payload:{...input.providerPlan,revision:await resolveSourceRevision(input.providerPlan,context)}});return{suiteEvidence:gateDecisionEvidence(parseGateDecision(response)),execution:response};}
async function executeBusterSuites(input:GateInput,context:PluginInvocationContext){
 if(input.suitePlan.suites.length>0)throw new Error('LEGACY_TEST_SUITE_RETIRED');
 const provider=await executeProviderPlan(input,context);
 return{suiteEvidence:[...input.suiteEvidence,...provider.suiteEvidence],suiteExecution:{provider:provider.execution}};
}
export async function execute(input:GateInput,context:PluginInvocationContext):Promise<StageResult>{
  input = { ...input, runId: context.contract.lease.attempt.runId, attempt: context.contract.lease.attempt.attemptNumber };

 const agent=context.contract.config.agent;if(typeof agent!=='string'||!agent.trim())throw new Error('quality evaluator agent is not configured');let verdict;let executionEvidence:unknown=null;let finalSuiteEvidence=input.suiteEvidence;
 try{const executed=await executeBusterSuites(input,context);finalSuiteEvidence=executed.suiteEvidence;executionEvidence=executed.suiteExecution;const native=(executed.suiteExecution as {provider?:unknown}).provider;if(native){const decision=parseGateDecision(native);if(decision.state!=='passed')return gateDecisionStageResult(decision);} const judgedInput={...input,suiteEvidence:finalSuiteEvidence};const response=await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:agent},payload:buildRequest(agent,judgedInput)});verdict=parseVerdict(response.result,judgedInput);}
 catch(error){return{schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'buster_quality.invalid_verdict',message:error instanceof Error?error.message:String(error)},artifacts:[]};}
 const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`buster-quality:${input.gateId}:${input.attempt}`},payload:{namespace:'kubeclaw.buster-quality-gate',mediaType:'application/json',value:{verdict,suiteEvidence:finalSuiteEvidence,suiteExecution:executionEvidence}}});
 const artifacts=[stored.artifact as ArtifactRef];if(verdict.outcome==='passed')return{schemaVersion:'stage-result.v2',outcome:'passed',artifacts};
 return{schemaVersion:'stage-result.v2',outcome:verdict.outcome,reason:{code:`buster_quality.${verdict.failureClass}`,message:verdict.summary,details:{findings:verdict.findings}},artifacts};
}
