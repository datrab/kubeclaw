import {portableJson,type ArtifactRef,type PluginInvocationContext,type StageResult} from '@kubeclaw/plugin-sdk';
import {DELIVERY_MANIFEST_ENCODING,type DeliveryManifestEncoding} from '@kubeclaw/delivery-manifest-contract';
import {buildSummary,type SummaryInput} from './summary.ts';
export async function execute(input:SummaryInput,context:PluginInvocationContext):Promise<StageResult>{
  portableJson(context.contract.config);
  const keys=Object.keys(context.contract.config);
  if(keys.some(key=>!['agentRole','deliveryManifestEncoding'].includes(key)))throw new Error('DELIVERY_MANIFEST_CONFIG_INVALID');
  const deliveryManifestEncoding:DeliveryManifestEncoding|undefined=Object.hasOwn(context.contract.config,'deliveryManifestEncoding')
    ? context.contract.config.deliveryManifestEncoding as DeliveryManifestEncoding:undefined;
  if(deliveryManifestEncoding!==undefined&&deliveryManifestEncoding!==DELIVERY_MANIFEST_ENCODING)throw new Error('DELIVERY_MANIFEST_CONFIG_INVALID');
  let summary;
  try{summary=await buildSummary(input,context,deliveryManifestEncoding);}catch(error){
    return {schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'project_summary.invalid_evidence',message:error instanceof Error?error.message:String(error)},artifacts:[]};
  }
  const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`project-summary:${summary.runId}`},
    payload:{namespace:'kubeclaw.project-summary',mediaType:'application/json',value:summary,
      ...(deliveryManifestEncoding===undefined?{}:{encoding:'kubeclaw-json.utf16.v1'})}});
  return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[stored.artifact as ArtifactRef]};
}
