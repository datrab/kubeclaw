export interface GateInput{readonly runId:string;readonly gateId:string;readonly attempt:number;readonly task:string;readonly suiteEvidence:readonly{readonly suite:string;readonly passed:boolean;readonly summary:string}[]}
export type GateOutcome='passed'|'request_fix'|'blocked';
export interface GateVerdict{readonly outcome:GateOutcome;readonly runId:string;readonly gateId:string;readonly attempt:number;readonly summary:string;readonly failureClass:'none'|'test_failure'|'contract'|'configuration'|'infrastructure'|'rate_limit'|'timeout';readonly findings:readonly string[]}
export function buildRequest(agent:string,input:GateInput):Readonly<Record<string,unknown>>{
 return{protocol:'kubeclaw.buster-quality-gate.v2',agent,identity:{runId:input.runId,gateId:input.gateId,attempt:input.attempt},task:input.task,suiteEvidence:input.suiteEvidence,
  allowedOutcomes:['passed','request_fix','blocked'],failureClasses:['none','test_failure','contract','configuration','infrastructure','rate_limit','timeout']};
}
export function parseVerdict(value:unknown,input:GateInput):GateVerdict{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('gate verdict must be an object');const source=value as Record<string,unknown>;
 const outcomes=['passed','request_fix','blocked'];const classes=['none','test_failure','contract','configuration','infrastructure','rate_limit','timeout'];
 if(Object.keys(source).some((key)=>!['outcome','runId','gateId','attempt','summary','failureClass','findings'].includes(key))||!outcomes.includes(String(source.outcome))||!classes.includes(String(source.failureClass)))throw new Error('gate verdict shape is invalid');
 if(source.runId!==input.runId||source.gateId!==input.gateId||source.attempt!==input.attempt)throw new Error('gate verdict identity mismatch');
 if(typeof source.summary!=='string'||!source.summary.trim()||source.summary.length>8192)throw new Error('gate summary is invalid');
 if(!Array.isArray(source.findings)||source.findings.length>128||source.findings.some((item)=>typeof item!=='string'||!item.trim()||item.length>4096))throw new Error('gate findings are invalid');
 if(source.outcome==='passed'&&(source.failureClass!=='none'||source.findings.length>0||input.suiteEvidence.some((suite)=>!suite.passed)))throw new Error('passed verdict contradicts evidence');
 if(source.outcome!=='passed'&&(source.failureClass==='none'||source.findings.length===0))throw new Error('non-passing verdict requires a failure class and findings');
 return{outcome:source.outcome as GateOutcome,runId:input.runId,gateId:input.gateId,attempt:input.attempt,summary:source.summary,
  failureClass:source.failureClass as GateVerdict['failureClass'],findings:source.findings as string[]};
}
