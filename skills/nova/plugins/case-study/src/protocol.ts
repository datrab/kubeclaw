import { canonicalJson, sha256Text, type ArtifactRef, type AttemptIdentity } from '@kubeclaw/plugin-sdk';
export interface ReportSource {
  readonly runId: string; readonly journalHead: string; readonly snapshotDigest: string;
  readonly sourceStageId: string; readonly sourceRevision: string; readonly artifacts: readonly ArtifactRef[];
}
export interface SourceBundle {
  readonly schemaVersion: 'report-source-bundle.v1'; readonly digest: string;
  readonly target: Omit<ReportSource, 'artifacts'>; readonly pipelineId: string;
  readonly evidence: readonly { readonly evidenceId: string; readonly artifact: ArtifactRef }[];
  readonly facts: readonly Readonly<Record<string, unknown>>[];
  readonly [key: string]: unknown;
}
export function validateBundle(value: unknown, source: ReportSource): SourceBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('REPORT_BUNDLE_INVALID');
  const bundle = value as SourceBundle; const { digest, ...unsigned } = bundle;
  const { artifacts, ...target } = source;
  if (bundle.schemaVersion !== 'report-source-bundle.v1' || digest !== sha256Text(canonicalJson(unsigned))
    || canonicalJson(bundle.target) !== canonicalJson(target) || !Array.isArray(bundle.evidence)
    || canonicalJson(bundle.evidence.map(item => item.artifact)) !== canonicalJson(artifacts)) throw new Error('REPORT_BUNDLE_BINDING_INVALID');
  return bundle;
}
function citations(value: unknown, bundle: SourceBundle): readonly string[] {
  if (!Array.isArray(value) || !value.length || value.length > 128 || new Set(value).size !== value.length
    || value.some(id => typeof id !== 'string' || !bundle.evidence.some(item => item.evidenceId === id))) throw new Error('REPORT_CITATIONS_INVALID');
  return value as string[];
}
export interface CaseStudyInput { readonly task:string; readonly source:ReportSource }
export interface CaseStudy { readonly status:'generated'; readonly projectId:string; readonly runId:string; readonly markdown:string;
  readonly execution:AttemptIdentity; readonly reportTarget:SourceBundle['target']; readonly evidenceStatus:'verified-source-bundle';
  readonly narrativeStatus:'draft-not-entailment-verified'; readonly sourceBundle:SourceBundle; readonly evidenceIds:readonly string[] }
export const requiredSections=['Context','Challenge','Approach','Implementation','Verification','Outcome'] as const;
export function buildRequest(agent:string,input:CaseStudyInput,execution:AttemptIdentity,bundle:SourceBundle):Readonly<Record<string,unknown>>{
  return {protocol:'kubeclaw.case-study.v4',agent,identity:execution,reportTarget:bundle.target,evidenceStatus:'verified-source-bundle',narrativeStatus:'draft-not-entailment-verified',
    task:[input.task,'Return only the agent-owned output object described by outputContract.','Do not copy protocol, agent, identity, task, facts, requiredSections, groundingRules, or outputContract into the output.','Execution identity comes from the active Core lease. reportTarget identifies the requested project/run, which may be historical. SourceBundle contains verified structured source facts and explicit omissions. Cite supplied evidence IDs. Generated Markdown remains a draft, not proof of entailment or publication readiness.'].join('\n\n'),
    sourceBundle:bundle,requiredSections,groundingRules:['Use only supplied source facts; include evidenceIds for sources cited in Markdown.','Do not invent metrics, quotes, dates, or outcomes. Each returned evidenceId must appear in Markdown as [evidence:ID].'],
    outputContract:{type:'object',additionalProperties:false,required:['status','markdown','evidenceIds'],properties:{status:{const:'generated'},markdown:{type:'string'},evidenceIds:{type:'array',minItems:1,items:{type:'string'}}}}};
}
export function parseCaseStudy(value:unknown,input:CaseStudyInput,execution:AttemptIdentity,bundle:SourceBundle):CaseStudy{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('case study must be an object');
  const source=value as Record<string,unknown>;
  if(Object.keys(source).some((key)=>!['status','markdown','evidenceIds'].includes(key))||source.status!=='generated') throw new Error('case study shape is invalid');
  if(typeof source.markdown!=='string'||source.markdown.length<1||source.markdown.length>131072||/[\0\r]/u.test(source.markdown)) throw new Error('case study Markdown is invalid');
  let previous=-1;
  for(const section of requiredSections){
    const marker=`## ${section}`; const first=source.markdown.indexOf(marker);
    if(first<0||first<=previous||source.markdown.indexOf(marker,first+1)>=0) throw new Error(`case study section ${section} is missing, duplicated, or out of order`);
    previous=first;
  }
  const evidenceIds=citations(source.evidenceIds,bundle);
  if(evidenceIds.some(id=>!String(source.markdown).includes(`[evidence:${id}]`)))throw new Error('REPORT_MARKDOWN_CITATION_MISSING');
  return {status:'generated',projectId:bundle.pipelineId,runId:execution.runId,execution:{...execution},reportTarget:bundle.target,evidenceStatus:'verified-source-bundle',narrativeStatus:'draft-not-entailment-verified',sourceBundle:structuredClone(bundle),evidenceIds,markdown:source.markdown};
}
