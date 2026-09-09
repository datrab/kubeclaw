import type { AttemptIdentity } from '@kubeclaw/plugin-sdk';
export interface CaseStudyInput{readonly projectId:string;readonly runId:string;readonly task:string;readonly facts:readonly {readonly label:string;readonly value:string}[]}
export interface CaseStudy{readonly status:'generated';readonly projectId:string;readonly runId:string;readonly markdown:string;readonly execution:AttemptIdentity;readonly reportTarget:{readonly projectId:string;readonly runId:string};readonly evidenceStatus:'unverified-caller-input';readonly facts:CaseStudyInput['facts']}
export const requiredSections=['Context','Challenge','Approach','Implementation','Verification','Outcome'] as const;
export function buildRequest(agent:string,input:CaseStudyInput,execution:AttemptIdentity):Readonly<Record<string,unknown>>{
  return {protocol:'kubeclaw.case-study.v3',agent,identity:execution,reportTarget:{projectId:input.projectId,runId:input.runId},evidenceStatus:'unverified-caller-input',
    task:[input.task,'Return only the agent-owned output object described by outputContract.','Do not copy protocol, agent, identity, task, facts, requiredSections, groundingRules, or outputContract into the output.','Execution identity comes from the active Core lease. reportTarget identifies the requested project/run, which may be historical. Caller facts are unverified; generated Markdown is a draft, not proof of verification or publication readiness.'].join('\n\n'),
    facts:input.facts,requiredSections,groundingRules:['Use only supplied facts.','Do not invent metrics, quotes, dates, or outcomes.'],
    outputContract:{type:'object',additionalProperties:false,required:['status','markdown'],properties:{status:{const:'generated'},markdown:{type:'string'}}}};
}
export function parseCaseStudy(value:unknown,input:CaseStudyInput,execution:AttemptIdentity):CaseStudy{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('case study must be an object');
  const source=value as Record<string,unknown>;
  if(Object.keys(source).some((key)=>!['status','markdown'].includes(key))||source.status!=='generated') throw new Error('case study shape is invalid');
  if(typeof source.markdown!=='string'||source.markdown.length<1||source.markdown.length>131072||/[\0\r]/u.test(source.markdown)) throw new Error('case study Markdown is invalid');
  let previous=-1;
  for(const section of requiredSections){
    const marker=`## ${section}`; const first=source.markdown.indexOf(marker);
    if(first<0||first<=previous||source.markdown.indexOf(marker,first+1)>=0) throw new Error(`case study section ${section} is missing, duplicated, or out of order`);
    previous=first;
  }
  return {status:'generated',projectId:input.projectId,runId:execution.runId,execution:{...execution},reportTarget:{projectId:input.projectId,runId:input.runId},evidenceStatus:'unverified-caller-input',facts:structuredClone(input.facts),markdown:source.markdown};
}
