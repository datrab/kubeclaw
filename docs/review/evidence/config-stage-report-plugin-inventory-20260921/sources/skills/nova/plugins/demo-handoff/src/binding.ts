import {canonicalJson,sha256Text,type ArtifactRef} from '@kubeclaw/plugin-sdk';
import {discordWebhookPayload} from '@kubeclaw/plugin-operator-messaging/src/discord-payload.ts';
import {NAMESPACE,object,exact,text,target,ref,read,evidence,deliveryIdentity,retention,type Reader,type Value} from './protocol.ts';
export interface BindingConfig {readonly candidateStageId:string;readonly deliveryStageId:string;readonly readyStageId:string;readonly manifestStageId:string;readonly operatorTarget:string;}
export async function bind(context:Reader,reference:ArtifactRef,runId:string,config:BindingConfig) {
  const candidate=await read(context,reference,runId,config.candidateStageId,NAMESPACE);
  exact(candidate,['schemaVersion','runId','manifest','authNodeId','protocol','operatorTarget','retentionSeconds','evidence']);
  if(candidate.schemaVersion!=='demo-candidate.v1'||candidate.runId!==runId||candidate.protocol!=='json-session.v1'||target(candidate.operatorTarget)!==config.operatorTarget)throw new Error('DEMO_CANDIDATE_BINDING_INVALID');
  retention(candidate.retentionSeconds);
  const manifest=ref(candidate.manifest);if(manifest.producer.stageId!==config.manifestStageId||manifest.producer.runId!==runId)throw new Error('DEMO_MANIFEST_OWNER_INVALID');
  const verified=await evidence(context,manifest,text(candidate.authNodeId));
  if(canonicalJson(verified)!==canonicalJson(candidate.evidence)||verified.runId!==runId)throw new Error('DEMO_CANDIDATE_SOURCE_CHANGED');
  const authentication=object(verified.authentication),credentials=object(object(verified.credentials).values);
  const url=text(authentication.url);const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.href!==url||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('DEMO_PUBLIC_HTTPS_URL_REQUIRED');
  const username=text(credentials.username,1024),password=text(credentials.password,1024);
  const payload={type:'demo.access',severity:'success',title:'Demo access for acceptance',summary:url,
    fields:[{name:'Username',value:username,inline:false},{name:'Password',value:password,inline:false}]};
  const transport=discordWebhookPayload(payload),payloadDigest=sha256Text(JSON.stringify(transport));
  return {reference,candidate,verified,authentication,payload,payloadDigest,deliveryId:deliveryIdentity(reference,config.operatorTarget)};
}
export type Binding=Awaited<ReturnType<typeof bind>>;
export function deliveryArtifact(bound:Binding,receipt:Value):Value {
  return {schemaVersion:'demo-delivery.v1',candidate:bound.reference,deliveryId:bound.deliveryId,payloadDigest:bound.payloadDigest,receipt};
}
export async function delivered(context:Reader,bound:Binding,reference:ArtifactRef,runId:string,config:BindingConfig):Promise<Value> {
  const value=await read(context,reference,runId,config.deliveryStageId,NAMESPACE);
  const receipt=object(await context.invoke('operator.receipt',{operation:'lookup',resource:{type:'operator.target',canonicalId:config.operatorTarget},
    payload:{deliveryId:bound.deliveryId,stageId:config.deliveryStageId,payload:bound.payload}}));
  if(canonicalJson(value)!==canonicalJson(deliveryArtifact(bound,receipt)))throw new Error('DEMO_DELIVERY_ARTIFACT_UNBOUND');return receipt;
}
export function requestBody(bound:Binding,receipt:Value):string {
  const auth=bound.authentication;
  if(!Number.isSafeInteger(auth.exposureGeneration)||Number(auth.exposureGeneration)<1)throw new Error('DEMO_EXPOSURE_GENERATION_INVALID');
  const sourceRevision=text(bound.verified.sourceRevision);
  if(!/^git:[a-f0-9]{40}$/u.test(sourceRevision))throw new Error('DEMO_SOURCE_REVISION_INVALID');
  const request={schemaVersion:'demo-ready-request.v1',requestId:bound.deliveryId,runId:bound.candidate.runId,sourceRevision,candidateDigest:bound.reference.digest,
    decisionDigest:bound.verified.decisionDigest,resultDigest:bound.verified.resultDigest,
    leaseName:auth.leaseName,leaseUID:auth.leaseUID,namespace:auth.namespace,immutableImage:auth.immutableImage,manifestDigest:auth.manifestDigest,
    credentialDigest:auth.credentialDigest,secretUID:auth.secretUID,exposureOwner:auth.exposureOwner,exposureGeneration:auth.exposureGeneration,
    url:auth.url,observedAt:auth.observedAt,retentionSeconds:retention(bound.candidate.retentionSeconds),receipt};
  return JSON.stringify(request);
}
