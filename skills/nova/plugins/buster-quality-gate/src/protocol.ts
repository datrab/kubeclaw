export interface ProviderPlanInput{readonly revision?:string;readonly sourceStageId?:string;readonly repositoryRoot:string;readonly repositoryId:string;readonly plan:Readonly<Record<string,unknown>>;readonly grants:Readonly<Record<string,readonly string[]>>;readonly maximumConcurrency:number;readonly submittedAt:string;readonly timeoutMs:number}
export interface GateInput {
 readonly gateId: string;
 readonly task: string;
 readonly providerPlan: ProviderPlanInput;
}
export interface JudgedGateInput {
 readonly runId: string;
 readonly gateId: string;
 readonly attempt: number;
 readonly task: string;
 readonly suiteEvidence: readonly { readonly suite: string; readonly passed: boolean; readonly summary: string }[];
}
type GateOutcome='passed'|'request_fix'|'blocked';
export interface GateVerdict{readonly outcome:GateOutcome;readonly runId:string;readonly gateId:string;readonly attempt:number;readonly summary:string;readonly failureClass:'none'|'test_failure'|'contract'|'configuration'|'infrastructure'|'rate_limit'|'timeout';readonly findings:readonly string[]}
export function buildRequest(agent:string,input:JudgedGateInput):Readonly<Record<string,unknown>>{
 const failureClasses=['none','test_failure','contract','configuration','infrastructure','rate_limit','timeout'];
 return{protocol:'kubeclaw.buster-quality-gate.v2',agent,identity:{runId:input.runId,gateId:input.gateId,attempt:input.attempt},
  task:[input.task,'Return only the agent-owned output object described by outputContract.','Do not copy protocol, agent, identity, task, suiteEvidence, allowedOutcomes, failureClasses, or outputContract into the output.','Runtime/core bind run, gate, and attempt identity.'].join('\n\n'),suiteEvidence:input.suiteEvidence,
  allowedOutcomes:['passed','request_fix','blocked'],failureClasses,
  outputContract:{type:'object',additionalProperties:false,required:['outcome','summary','failureClass','findings'],properties:{outcome:{enum:['passed','request_fix','blocked']},summary:{type:'string'},failureClass:{enum:failureClasses},findings:{type:'array',items:{type:'string'}}}}};
}
function verdictSource(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('gate verdict must be an object');
 const source=value as Record<string,unknown>;
 const outcomes=['passed','request_fix','blocked'];const classes=['none','test_failure','contract','configuration','infrastructure','rate_limit','timeout'];
 if(Object.keys(source).some((key)=>!['outcome','summary','failureClass','findings'].includes(key)))throw new Error('gate verdict shape is invalid');
 if(!outcomes.includes(String(source.outcome))||!classes.includes(String(source.failureClass)))throw new Error('gate verdict shape is invalid');
 if(typeof source.summary!=='string'||!source.summary.trim()||source.summary.length>8192)throw new Error('gate summary is invalid');
 if(!Array.isArray(source.findings)||source.findings.length>128||source.findings.some((item)=>typeof item!=='string'||!item.trim()||item.length>4096))throw new Error('gate findings are invalid');
 return source;
}
function assertVerdictConsistency(source:Record<string,unknown>,input:JudgedGateInput):void{
 const findings=source.findings as unknown[];
 if(source.outcome==='passed'&&(source.failureClass!=='none'||findings.length>0||input.suiteEvidence.some((suite)=>!suite.passed)))throw new Error('passed verdict contradicts evidence');
 if(source.outcome!=='passed'&&(source.failureClass==='none'||findings.length===0))throw new Error('non-passing verdict requires a failure class and findings');
}
export function parseVerdict(value:unknown,input:JudgedGateInput):GateVerdict{
 const source=verdictSource(value);
 assertVerdictConsistency(source,input);
 return{outcome:source.outcome as GateOutcome,runId:input.runId,gateId:input.gateId,attempt:input.attempt,summary:source.summary as string,
  failureClass:source.failureClass as GateVerdict['failureClass'],findings:source.findings as string[]};
}
