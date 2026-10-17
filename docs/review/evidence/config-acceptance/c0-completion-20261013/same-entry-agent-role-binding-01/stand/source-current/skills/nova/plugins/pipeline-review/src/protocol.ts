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
export interface ReviewInput { readonly task: string; readonly source: ReportSource }
export interface ReviewReport {
  readonly status: 'reviewed'; readonly runId: string; readonly attempt: number; readonly summary: string;
  readonly execution: AttemptIdentity; readonly reportTarget: SourceBundle['target'];
  readonly evidenceStatus: 'verified-source-bundle'; readonly narrativeStatus: 'draft-not-entailment-verified'; readonly sourceBundle: SourceBundle;
  readonly observations: readonly { readonly dimension: 'architecture'|'agents'|'prompts'|'tests'|'configuration'; readonly finding: string; readonly priority: 'low'|'medium'|'high'; readonly evidenceIds: readonly string[] }[];
}
const dimensions = ['architecture','agents','prompts','tests','configuration'] as const;
export function buildRequest(agent: string, input: ReviewInput, execution: AttemptIdentity, bundle: SourceBundle): Readonly<Record<string, unknown>> {
  return { protocol:'kubeclaw.pipeline-review.v4', agent, identity:execution, reportTarget:bundle.target, evidenceStatus:'verified-source-bundle', narrativeStatus:'draft-not-entailment-verified',
    task:[input.task,'Return only the agent-owned output object described by outputContract.','Do not copy protocol, agent, identity, task, evidence, requiredDimensions, or outputContract into the output.','Execution identity comes from the active Core lease. SourceBundle contains verified historical structured facts and explicit omissions. Cite at least one supplied evidenceId for each observation. Narrative is a draft, not a proof of factual entailment or publication readiness.'].join('\n\n'),
    sourceBundle:bundle, requiredDimensions:dimensions,
    outputContract:{type:'object',additionalProperties:false,required:['status','summary','observations'],properties:{status:{const:'reviewed'},summary:{type:'string'},observations:{type:'array',items:{type:'object',additionalProperties:false,required:['dimension','finding','priority','evidenceIds'],properties:{dimension:{enum:dimensions},finding:{type:'string'},priority:{enum:['low','medium','high']},evidenceIds:{type:'array',minItems:1,items:{type:'string'}}}}}}} };
}
export function parseReport(value: unknown, input: ReviewInput, execution: AttemptIdentity, bundle: SourceBundle): ReviewReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review report must be an object');
  const report=value as Record<string,unknown>;
  if (Object.keys(report).some((key)=>!['status','summary','observations'].includes(key)) || report.status!=='reviewed') throw new Error('review report shape is invalid');
  if (typeof report.summary!=='string'||!report.summary.trim()||report.summary.length>8192) throw new Error('review summary is invalid');
  if (!Array.isArray(report.observations)||report.observations.length<dimensions.length||report.observations.length>128) throw new Error('review observations are invalid');
  const observations=report.observations.map((value)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('review observation is invalid');
    const item=value as Record<string,unknown>;
    if(Object.keys(item).some((key)=>!['dimension','finding','priority','evidenceIds'].includes(key))||
      !dimensions.includes(item.dimension as typeof dimensions[number])||!['low','medium','high'].includes(String(item.priority))||
      typeof item.finding!=='string'||!item.finding.trim()||item.finding.length>8192) throw new Error('review observation is invalid');
    citations(item.evidenceIds,bundle);
    return item as unknown as ReviewReport['observations'][number];
  });
  for(const dimension of dimensions) if(!observations.some((item)=>item.dimension===dimension)) throw new Error(`review is missing ${dimension}`);
  return {status:'reviewed',runId:execution.runId,attempt:execution.attemptNumber,execution:{...execution},
    reportTarget:bundle.target,evidenceStatus:'verified-source-bundle',narrativeStatus:'draft-not-entailment-verified',sourceBundle:structuredClone(bundle),summary:report.summary,observations};
}
