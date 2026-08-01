export interface ReviewInput {
  readonly runId: string; readonly attempt: number; readonly task: string;
  readonly evidence: readonly { readonly kind: string; readonly digest: string }[];
}
export interface ReviewReport {
  readonly status: 'reviewed'; readonly runId: string; readonly attempt: number; readonly summary: string;
  readonly observations: readonly { readonly dimension: 'architecture'|'agents'|'prompts'|'tests'|'configuration'; readonly finding: string; readonly priority: 'low'|'medium'|'high' }[];
}
const dimensions = ['architecture','agents','prompts','tests','configuration'] as const;
export function buildRequest(agent: string, input: ReviewInput): Readonly<Record<string, unknown>> {
  return { protocol:'kubeclaw.pipeline-review.v2', agent, identity:{runId:input.runId,attempt:input.attempt},
    task:[input.task,'Return only the agent-owned output object described by outputContract.','Do not copy protocol, agent, identity, task, evidence, requiredDimensions, or outputContract into the output.','Runtime/core bind run and attempt identity.'].join('\n\n'),
    evidence:input.evidence, requiredDimensions:dimensions,
    outputContract:{type:'object',additionalProperties:false,required:['status','summary','observations'],properties:{status:{const:'reviewed'},summary:{type:'string'},observations:{type:'array',items:{type:'object',additionalProperties:false,required:['dimension','finding','priority'],properties:{dimension:{enum:dimensions},finding:{type:'string'},priority:{enum:['low','medium','high']}}}}}} };
}
export function parseReport(value: unknown, input: ReviewInput): ReviewReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review report must be an object');
  const report=value as Record<string,unknown>;
  if (Object.keys(report).some((key)=>!['status','summary','observations'].includes(key)) || report.status!=='reviewed') throw new Error('review report shape is invalid');
  if (typeof report.summary!=='string'||!report.summary.trim()||report.summary.length>8192) throw new Error('review summary is invalid');
  if (!Array.isArray(report.observations)||report.observations.length<dimensions.length||report.observations.length>128) throw new Error('review observations are invalid');
  const observations=report.observations.map((value)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('review observation is invalid');
    const item=value as Record<string,unknown>;
    if(Object.keys(item).some((key)=>!['dimension','finding','priority'].includes(key))||
      !dimensions.includes(item.dimension as typeof dimensions[number])||!['low','medium','high'].includes(String(item.priority))||
      typeof item.finding!=='string'||!item.finding.trim()||item.finding.length>8192) throw new Error('review observation is invalid');
    return item as unknown as ReviewReport['observations'][number];
  });
  for(const dimension of dimensions) if(!observations.some((item)=>item.dimension===dimension)) throw new Error(`review is missing ${dimension}`);
  return {status:'reviewed',runId:input.runId,attempt:input.attempt,summary:report.summary,observations};
}
