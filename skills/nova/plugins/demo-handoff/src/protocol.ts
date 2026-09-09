import {verifiedArtifactJsonText} from '@kubeclaw/plugin-sdk';
import { canonicalJson, sha256Text, type ArtifactRef, type PluginInvocationContext, type AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
export const NAMESPACE='kubeclaw.demo-handoff';
export type Value=Readonly<Record<string,unknown>>;
export type Reader=Pick<AdapterActivationContext,'invoke'>;
export function object(value:unknown):Value {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('DEMO_HANDOFF_OBJECT_INVALID');
  return value as Value;
}
export function text(value:unknown,maximum=2048):string {
  if(typeof value!=='string'||!value||value.length>maximum||/[\u0000-\u001f\u007f]/u.test(value))throw new Error('DEMO_HANDOFF_TEXT_INVALID');
  return value;
}
export function exact(value:Value,keys:readonly string[]):void {
  if(Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>value[key]===undefined))throw new Error('DEMO_HANDOFF_FIELDS_INVALID');
}
export function ref(value:unknown):ArtifactRef {validateContractValue('artifactRef',value);return value as ArtifactRef;}
export function select(context:PluginInvocationContext,stageId:string,namespace:string):ArtifactRef {
  const candidates=context.contract.artifacts.filter(item=>item.producer.runId===context.contract.lease.attempt.runId&&item.producer.stageId===stageId&&item.namespace===namespace);
  const latest=Math.max(...candidates.map(item=>item.producer.attemptNumber));
  const matches=candidates.filter(item=>item.producer.attemptNumber===latest);
  if(matches.length!==1)throw new Error('DEMO_HANDOFF_REFERENCE_AMBIGUOUS');return matches[0]!;
}
export async function read(context:Reader,reference:ArtifactRef,runId:string,stageId:string,namespace:string):Promise<Value> {
  if(reference.producer.runId!==runId||reference.producer.stageId!==stageId||reference.namespace!==namespace||reference.mediaType!=='application/json'
    ||reference.sizeBytes<1||reference.sizeBytes>8*1024**2)throw new Error('DEMO_HANDOFF_ARTIFACT_OWNER_INVALID');
  const response=await context.invoke('artifacts.read',{operation:'get_latest_json_bytes',resource:{type:'artifact.object',canonicalId:reference.artifactId},payload:{namespace,digest:reference.digest}});
  if(canonicalJson(response.artifact)!==canonicalJson(reference))throw new Error('DEMO_HANDOFF_ARTIFACT_CHANGED');
  const bytes=verifiedArtifactJsonText(response, reference);
  if(response.digest!==reference.digest||response.sizeBytes!==reference.sizeBytes
    ||Buffer.byteLength(bytes)!==reference.sizeBytes||sha256Text(bytes)!==reference.digest)throw new Error('DEMO_HANDOFF_ARTIFACT_CHANGED');
  return object(response.value);
}
export function target(value:unknown):string {const result=text(value,128);if(!/^[a-z0-9][a-z0-9._:-]*$/u.test(result))throw new Error('DEMO_HANDOFF_TARGET_INVALID');return result;}
export function deliveryIdentity(candidate:ArtifactRef,operatorTarget:string):string {
  return `demo:${sha256Text(canonicalJson({runId:candidate.producer.runId,candidateDigest:candidate.digest,target:operatorTarget})).slice(7)}`;
}
export async function evidence(context:Reader,manifest:ArtifactRef,authNodeId:string):Promise<Value> {
  return object(await context.invoke('test.plan.evidence',{operation:'demo',resource:{type:'test.plan.evidence',canonicalId:manifest.artifactId},payload:{namespace:manifest.namespace,manifest,authNodeId}}));
}

export function retention(value:unknown=604800):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>9223372036)throw new Error('DEMO_RETENTION_INVALID');return value;
}
