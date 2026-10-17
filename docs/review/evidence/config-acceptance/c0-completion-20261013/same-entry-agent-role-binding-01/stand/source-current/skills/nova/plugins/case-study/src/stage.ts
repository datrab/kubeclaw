import { canonicalJson, sha256Text, type AttemptIdentity } from '@kubeclaw/plugin-sdk';
import type{ArtifactRef,PluginInvocationContext,StageResult}from'@kubeclaw/plugin-sdk';
import{buildRequest,parseCaseStudy,validateBundle,type CaseStudyInput}from'./protocol.ts';
export async function execute(input:CaseStudyInput,context:PluginInvocationContext):Promise<StageResult>{
  const agent=context.contract.config.agent;if(typeof agent!=='string'||!agent.trim())throw new Error('case study agent is not configured');
  const execution={...context.contract.lease.attempt};
  let study;
  try{const resolved=await context.invoke('report.evidence.read',{operation:'snapshot',resource:{type:'pipeline.run',canonicalId:input.source.runId},payload:{...input.source}});
    const bundle=validateBundle(resolved.bundle,input.source);
    const response=await context.invoke('runtime.dispatch',withRuntimeDispatchProfile({operation:'dispatch',resource:{type:'runtime.agent',canonicalId:agent},payload:buildRequest(agent,input,execution,bundle)},context.contract.runtimeDispatchProfile));
    study=parseCaseStudy(response.result,input,execution,bundle);
  }catch(error){return{schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'case_study.invalid_output',message:error instanceof Error?error.message:String(error)},artifacts:[]};}
  const artifactId=`case-study:${sha256Text(canonicalJson(execution)).slice(7)}`;
  const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:artifactId},
    payload:{namespace:'kubeclaw.case-study',mediaType:'application/json',value:study}});
  assertReportArtifact(stored.artifact,artifactId,study,execution);
  return{schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[stored.artifact as ArtifactRef]};
}

/** Verify the original store response against the bytes and active producer being committed. */
export function assertReportArtifact(value:unknown,artifactId:string,report:unknown,execution:AttemptIdentity):asserts value is ArtifactRef {
  if(!value || typeof value!=='object')throw new Error('REPORT_ARTIFACT_INVALID');
  const artifact=value as ArtifactRef;
  const bytes=canonicalJson(report);
  if(artifact.artifactId!==artifactId || artifact.namespace!=='kubeclaw.case-study' || artifact.mediaType!=='application/json'
    || artifact.digest!==sha256Text(bytes) || artifact.sizeBytes!==Buffer.byteLength(bytes)
    || canonicalJson(artifact.producer)!==canonicalJson(execution))throw new Error('REPORT_ARTIFACT_BINDING_MISMATCH');
}
import { withRuntimeDispatchProfile } from '@kubeclaw/plugin-sdk';
