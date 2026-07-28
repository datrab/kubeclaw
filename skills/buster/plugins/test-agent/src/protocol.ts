export interface CommandSuite {
  readonly suite: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
}
export interface SuiteEvidence {
  readonly suite: string;
  readonly passed: boolean;
  readonly summary: string;
}
export interface TestInput {
  readonly runId:string;
  readonly taskId:string;
  readonly attempt:number;
  readonly task:string;
  readonly suiteEvidence:readonly SuiteEvidence[];
  readonly commandSuites?: readonly CommandSuite[];
}
export interface TestVerdict {
  readonly verdict:'PASS'|'FAIL';
  readonly runId:string;
  readonly taskId:string;
  readonly attempt:number;
  readonly summary:string;
  readonly findings:readonly string[];
  readonly session: {
    readonly sessionId:string;
    readonly startedAt:string;
    readonly completedAt:string;
    readonly transcriptDigest:string;
    readonly termination:'completed'|'blocked'|'cancelled';
  };
}
export function buildRequest(agent:string,input:TestInput):Readonly<Record<string,unknown>>{
 return{protocol:'kubeclaw.buster-test-judgment.v2',agent,identity:{runId:input.runId,taskId:input.taskId,attempt:input.attempt},task:input.task,suiteEvidence:input.suiteEvidence,
  rules:['Use only supplied suite evidence.','PASS requires all suites passing and no findings.','FAIL requires actionable findings.']};
}
export function parseVerdict(value:unknown,input:TestInput):TestVerdict{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('test verdict must be an object');const source=value as Record<string,unknown>;
 if(Object.keys(source).some((key)=>!['verdict','runId','taskId','attempt','summary','findings','session'].includes(key))||!['PASS','FAIL'].includes(String(source.verdict)))throw new Error('test verdict shape is invalid');
 if(source.runId!==input.runId||source.taskId!==input.taskId||source.attempt!==input.attempt)throw new Error('test verdict identity mismatch');
 if(typeof source.summary!=='string'||!source.summary.trim()||source.summary.length>8192)throw new Error('test verdict summary is invalid');
 if(!Array.isArray(source.findings)||source.findings.length>128||source.findings.some((item)=>typeof item!=='string'||!item.trim()||item.length>4096))throw new Error('test findings are invalid');
 if(source.verdict==='PASS'&&(source.findings.length>0||input.suiteEvidence.some((suite)=>!suite.passed)))throw new Error('PASS contradicts test evidence');
 if(source.verdict==='FAIL'&&source.findings.length===0)throw new Error('FAIL requires findings');
 if(!source.session||typeof source.session!=='object'||Array.isArray(source.session))throw new Error('test session evidence is invalid');
 const session=source.session as Record<string,unknown>;
 if(Object.keys(session).some((key)=>!['sessionId','startedAt','completedAt','transcriptDigest','termination'].includes(key)))throw new Error('test session evidence is invalid');
 if(typeof session.sessionId!=='string'||!session.sessionId||typeof session.startedAt!=='string'||typeof session.completedAt!=='string'||
   !Number.isFinite(Date.parse(session.startedAt))||!Number.isFinite(Date.parse(session.completedAt))||Date.parse(session.completedAt)<Date.parse(session.startedAt)||
   typeof session.transcriptDigest!=='string'||!/^[a-f0-9]{64}$/u.test(session.transcriptDigest)||
   !['completed','blocked','cancelled'].includes(String(session.termination)))throw new Error('test session evidence is invalid');
 if(source.verdict==='PASS'&&session.termination!=='completed')throw new Error('PASS requires completed test session');
 return{verdict:source.verdict as'PASS'|'FAIL',runId:input.runId,taskId:input.taskId,attempt:input.attempt,summary:source.summary,findings:source.findings as string[],
  session:{sessionId:session.sessionId,startedAt:session.startedAt,completedAt:session.completedAt,transcriptDigest:session.transcriptDigest,
   termination:session.termination as'completed'|'blocked'|'cancelled'}};
}
