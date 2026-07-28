export interface TestInput{readonly runId:string;readonly taskId:string;readonly attempt:number;readonly task:string;readonly suiteEvidence:readonly{readonly suite:string;readonly passed:boolean;readonly summary:string}[]}
export interface TestVerdict{readonly verdict:'PASS'|'FAIL';readonly runId:string;readonly taskId:string;readonly attempt:number;readonly summary:string;readonly findings:readonly string[]}
export function buildRequest(agent:string,input:TestInput):Readonly<Record<string,unknown>>{
 return{protocol:'kubeclaw.buster-test-judgment.v2',agent,identity:{runId:input.runId,taskId:input.taskId,attempt:input.attempt},task:input.task,suiteEvidence:input.suiteEvidence,
  rules:['Use only supplied suite evidence.','PASS requires all suites passing and no findings.','FAIL requires actionable findings.']};
}
export function parseVerdict(value:unknown,input:TestInput):TestVerdict{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('test verdict must be an object');const source=value as Record<string,unknown>;
 if(Object.keys(source).some((key)=>!['verdict','runId','taskId','attempt','summary','findings'].includes(key))||!['PASS','FAIL'].includes(String(source.verdict)))throw new Error('test verdict shape is invalid');
 if(source.runId!==input.runId||source.taskId!==input.taskId||source.attempt!==input.attempt)throw new Error('test verdict identity mismatch');
 if(typeof source.summary!=='string'||!source.summary.trim()||source.summary.length>8192)throw new Error('test verdict summary is invalid');
 if(!Array.isArray(source.findings)||source.findings.length>128||source.findings.some((item)=>typeof item!=='string'||!item.trim()||item.length>4096))throw new Error('test findings are invalid');
 if(source.verdict==='PASS'&&(source.findings.length>0||input.suiteEvidence.some((suite)=>!suite.passed)))throw new Error('PASS contradicts test evidence');
 if(source.verdict==='FAIL'&&source.findings.length===0)throw new Error('FAIL requires findings');
 return{verdict:source.verdict as'PASS'|'FAIL',runId:input.runId,taskId:input.taskId,attempt:input.attempt,summary:source.summary,findings:source.findings as string[]};
}
