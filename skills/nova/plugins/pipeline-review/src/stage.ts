import { canonicalJson, sha256Text, type AttemptIdentity } from '@kubeclaw/plugin-sdk';
import type { ArtifactRef,PluginInvocationContext,StageResult } from '@kubeclaw/plugin-sdk';
import {buildRequest,parseReport,validateBundle,type ReviewInput} from './protocol.ts';
export async function execute(input:ReviewInput,context:PluginInvocationContext):Promise<StageResult>{
  const agent=context.contract.config.agent;
  if(typeof agent!=='string'||!agent.trim()) throw new Error('pipeline review agent is not configured');
  const execution={...context.contract.lease.attempt};
  let report;
  try{
    const resolved=await context.invoke('report.evidence.read',{operation:'snapshot',resource:{type:'pipeline.run',canonicalId:input.source.runId},payload:{...input.source}});
    const bundle=validateBundle(resolved.bundle,input.source);
    const response=await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:agent},payload:buildRequest(agent,input,execution,bundle)});
    report=parseReport(response.result,input,execution,bundle);
  }catch(error){
    return {schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'pipeline_review.invalid_report',message:error instanceof Error?error.message:String(error)},artifacts:[]};
  }
  const artifactId=`pipeline-review:${sha256Text(canonicalJson(execution)).slice(7)}`;
  const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:artifactId},
    payload:{namespace:'kubeclaw.pipeline-review',mediaType:'application/json',value:report}});
  assertReportArtifact(stored.artifact,artifactId,report,execution);
  return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[stored.artifact as ArtifactRef]};
}

/** Verify the original store response against the bytes and active producer being committed. */
export function assertReportArtifact(value:unknown,artifactId:string,report:unknown,execution:AttemptIdentity):asserts value is ArtifactRef {
  if(!value || typeof value!=='object')throw new Error('REPORT_ARTIFACT_INVALID');
  const artifact=value as ArtifactRef;
  const bytes=canonicalJson(report);
  if(artifact.artifactId!==artifactId || artifact.namespace!=='kubeclaw.pipeline-review' || artifact.mediaType!=='application/json'
    || artifact.digest!==sha256Text(bytes) || artifact.sizeBytes!==Buffer.byteLength(bytes)
    || canonicalJson(artifact.producer)!==canonicalJson(execution))throw new Error('REPORT_ARTIFACT_BINDING_MISMATCH');
}
