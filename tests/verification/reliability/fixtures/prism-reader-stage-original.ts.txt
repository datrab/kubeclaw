import { verifyBaselineArchive } from './archive.ts';
import { canonicalJson, sha256Text, type ArtifactRef, type PluginInvocationContext, type StageResult, type WaitRequest } from "@kubeclaw/plugin-sdk";
type Input={runId:string;projectId:string;architectureArtifact:{artifactId:string;contentDigest:string;revision:number};requiresDesign:boolean};
type Config={agent:"prism";target:string;issuerId:string;timeoutMinutes:number};
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("PRISM_DESIGN_VALUE_INVALID");return value as Record<string,unknown>;};
function config(value:unknown):Config{const item=record(value);if(item.agent!=="prism"||typeof item.target!=="string"||typeof item.issuerId!=="string"||!Number.isSafeInteger(item.timeoutMinutes)||Number(item.timeoutMinutes)<1)return (()=>{throw new Error("PRISM_DESIGN_CONFIG_INVALID");})();return item as unknown as Config;}
function approval(value:unknown,issuerId:string,architectureDigest:string):{approvalId:string;bundleDigest:string}|undefined{if(value===undefined)return undefined;const item=record(value);const issuer=record(item.issuer);if(item.decision!=="approved"||issuer.type!=="operator"||issuer.id!==issuerId||typeof item.approvalId!=="string"||!item.approvalId||item.architectureDigest!==architectureDigest||typeof item.bundleDigest!=="string"||!/^sha256:[a-f0-9]{64}$/u.test(item.bundleDigest))return (()=>{throw new Error("PRISM_DESIGN_APPROVAL_INVALID");})();return {approvalId:item.approvalId,bundleDigest:item.bundleDigest};}
export function waitFrom(value:unknown,expected:{issuerId:string;expiresAt:string;projectId:string}):WaitRequest{const item=record(value);const wait=record(item.wait);const issuer=record(wait.authorizedIssuer);const request=record(wait.request);if(typeof item.created!=="boolean"||wait.schemaVersion!=="wait-request.v2"||typeof wait.waitId!=="string"||!/^wait:[a-f0-9]{64}$/u.test(wait.waitId)||wait.kind!=="signal"||wait.signalType!=="prism.approval.resolved"||issuer.type!=="operator"||issuer.id!==expected.issuerId||wait.expiresAt!==expected.expiresAt||request.projectId!==expected.projectId)throw new Error("PRISM_DESIGN_WAIT_INVALID");return wait as unknown as WaitRequest;}
export async function execute(input:Input,context:PluginInvocationContext):Promise<StageResult>{
  if(!input.requiresDesign)return {schemaVersion:"stage-result.v2",outcome:"passed",artifacts:[]};
  input={...input,runId:context.contract.lease.attempt.runId};
  const settings=config(context.contract.config);const approved=approval(context.contract.guidance,settings.issuerId,input.architectureArtifact.contentDigest);
  try{
    const architectureRef=context.artifact(input.architectureArtifact.artifactId);
    if(!architectureRef||architectureRef.producer.runId!==input.runId||architectureRef.mediaType!=="application/json"||architectureRef.sizeBytes>256*1024||architectureRef.digest!==input.architectureArtifact.contentDigest)throw new Error("PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID");
    const architectureResponse=record(await context.invoke("artifacts.read",{operation:"get_json",resource:{type:"artifact.object",canonicalId:architectureRef.artifactId},payload:{namespace:architectureRef.namespace,digest:architectureRef.digest}}));
    if(architectureResponse.digest!==architectureRef.digest||architectureResponse.sizeBytes!==architectureRef.sizeBytes||sha256Text(canonicalJson(architectureResponse.value))!==architectureRef.digest||Buffer.byteLength(canonicalJson(architectureResponse.value))!==architectureRef.sizeBytes)throw new Error("PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID");
    const request={schema:"prism.design-request.v1",projectId:input.projectId,architecture:input.architectureArtifact,architectureContent:architectureResponse.value,...approved?{approvalId:approved.approvalId}:{}};
    const phase=approved?`approved:${approved.approvalId}:${input.architectureArtifact.contentDigest}`:"request";
    const response=await context.invoke("runtime.dispatch",withRuntimeDispatchProfile({operation:"dispatch",resource:{type:"runtime.agent",canonicalId:settings.agent},payload:{request,idempotencyKey:`${input.runId}:prism:${input.architectureArtifact.contentDigest}:${phase}`}},context.contract.runtimeDispatchProfile));const result=response.result as Record<string,unknown>;
    if(!approved){
      const waitId=`prism:${input.runId}:${input.projectId}`;const expiresAt=new Date(Date.now()+settings.timeoutMinutes*60_000).toISOString();

      const created=await context.invoke("signal.wait",{operation:"create",resource:{type:"signal.wait",canonicalId:waitId},payload:{kind:"signal",signalType:"prism.approval.resolved",authorizedIssuer:{type:"operator",id:settings.issuerId},expiresAt,request:{projectId:input.projectId}}});
      const wait=waitFrom(created,{issuerId:settings.issuerId,expiresAt,projectId:input.projectId});
      await context.invoke("operator.request",{operation:"publish",resource:{type:"operator.target",canonicalId:settings.target},payload:{type:"prism.approval.requested",projectId:input.projectId,waitId:wait.waitId,architectureDigest:input.architectureArtifact.contentDigest,signalType:"prism.approval.resolved",authorizedIssuer:{type:"operator",id:settings.issuerId},expiresAt}});
      return {schemaVersion:"stage-result.v2",outcome:"wait",reason:{code:"prism_design.approval_pending",message:"Waiting for an approved Prism Baseline Bundle."},artifacts:[],wait};
    }
    const imported=verifyBaselineArchive(result,approved.bundleDigest,input.projectId);
    const stored=await context.invoke("artifacts.write",{operation:"put_json",resource:{type:"artifact.object",canonicalId:`prism-baseline:${input.projectId}:${result.bundleDigest}`},payload:{namespace:"kubeclaw.prism",mediaType:"application/json",value:{...imported,designRequest:request,approvedArchitectureDigest:input.architectureArtifact.contentDigest}}});
    return {schemaVersion:"stage-result.v2",outcome:"passed",artifacts:[stored.artifact as ArtifactRef]};
  }catch(error){return {schemaVersion:"stage-result.v2",outcome:"blocked",reason:{code:"prism_design.dispatch_failed",message:error instanceof Error?error.message:String(error)},artifacts:[]};}
}
import { withRuntimeDispatchProfile } from '@kubeclaw/plugin-sdk';
