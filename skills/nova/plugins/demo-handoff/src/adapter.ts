import path from 'node:path';
import {canonicalJson,sha256Text,type AdapterActivationContext,type AdapterInstance,type EffectRequest} from '@kubeclaw/plugin-sdk';
import {FileDurableRecordStore} from '@kubeclaw/plugin-foundation/observability/durable-records';
import {NAMESPACE,exact,object,text,target,ref,type Value,type Reader} from './protocol.ts';
import {bind,delivered,deliveryArtifact,requestBody,type BindingConfig,type Binding} from './binding.ts';
import {post,validateResponse,type ClientConfig} from './controller-client.ts';
interface Config extends BindingConfig,ClientConfig {readonly stateRoot:string;readonly timeoutMs:number;}
function configuration(value:Value):Config {
  exact(value,['candidateStageId','deliveryStageId','readyStageId','manifestStageId','operatorTarget','endpoint','tokenPath','caPath','stateRoot','timeoutMs']);
  const endpoint=new URL(text(value.endpoint));
  if(endpoint.protocol!=='https:'||endpoint.pathname!=='/v1/demo-ready'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password||endpoint.href!==value.endpoint)throw new Error('DEMO_READY_ENDPOINT_INVALID');
  const absolute=(item:unknown)=>{const result=text(item);if(!path.isAbsolute(result)||path.normalize(result)!==result)throw new Error('DEMO_READY_PATH_INVALID');return result;};
  const timeoutMs=Number(value.timeoutMs);if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)throw new Error('DEMO_READY_DEADLINE_INVALID');
  return {candidateStageId:text(value.candidateStageId),deliveryStageId:text(value.deliveryStageId),readyStageId:text(value.readyStageId),manifestStageId:text(value.manifestStageId),
    operatorTarget:target(value.operatorTarget),endpoint:endpoint.href,tokenPath:absolute(value.tokenPath),caPath:absolute(value.caPath),stateRoot:absolute(value.stateRoot),timeoutMs};
}
function assertRequest(request:EffectRequest,config:Config):void {
  if(request.capability!=='demo.handoff'||!['deliver','commit'].includes(request.operation)||request.resource.type!=='demo.candidate'||request.payload.namespace!==NAMESPACE)throw new Error('DEMO_HANDOFF_OPERATION_INVALID');
  exact(request.payload,request.operation==='deliver'?['namespace','candidate']:['namespace','candidate','delivery']);
  if(request.attempt.stageId!==(request.operation==='deliver'?config.deliveryStageId:config.readyStageId))throw new Error('DEMO_HANDOFF_PRODUCER_DENIED');
  if(request.resource.canonicalId!==ref(request.payload.candidate).artifactId)throw new Error('DEMO_HANDOFF_RESOURCE_INVALID');
}
async function lookup(context:Reader,bound:Binding,config:Config):Promise<Value> {
  return object(await context.invoke('operator.receipt',{operation:'lookup',resource:{type:'operator.target',canonicalId:config.operatorTarget},
    payload:{deliveryId:bound.deliveryId,stageId:config.deliveryStageId,payload:bound.payload}}));
}
async function commit(records:FileDurableRecordStore,config:Config,body:string,signal:AbortSignal,recovery:boolean):Promise<Value|undefined> {
  const request=object(JSON.parse(body)),key=text(request.requestId),stream='demo-ready/intents';
  let previous=(await records.read<Value>(stream)).find(entry=>entry.idempotencyKey===key);
  if(previous&&previous.payload.body!==body)throw new Error('DEMO_READY_INTENT_CONFLICT');
  if(!previous&&recovery)return undefined;
  let first=false;
  if(!previous){const admitted=await records.append(stream,key,{schemaVersion:'demo-ready-intent.v1',body});previous=admitted.record;first=admitted.appended;}
  signal.throwIfAborted();
  const statusBody=JSON.stringify({schemaVersion:'demo-ready-status-request.v1',leaseName:request.leaseName,leaseUID:request.leaseUID,requestId:request.requestId});
  let response:Value;
  if(first){try{response=await post(config,body,false,signal);}catch{signal.throwIfAborted();response=await post(config,statusBody,true,signal);}}
  else response=await post(config,statusBody,true,signal);
  signal.throwIfAborted();const accepted=validateResponse(response,request,body);
  await records.append('demo-ready/receipts',key,{schemaVersion:'demo-ready-commit.v1',requestDigest:sha256Text(body),response:accepted});
  signal.throwIfAborted();return {schemaVersion:'demo-ready-commit.v1',candidateDigest:request.candidateDigest,requestDigest:sha256Text(body),response:accepted};
}
export function activate(context:AdapterActivationContext):AdapterInstance {
  const config=configuration(context.config),stopping=new AbortController();
  const records=new FileDurableRecordStore(config.stateRoot,{maximumRecords:10000,maximumBytes:64*1024**2,maximumRecordBytes:65536});
  const execute=async(request:EffectRequest,signal:AbortSignal,recovery:boolean):Promise<Value|undefined>=>{
    assertRequest(request,config);signal.throwIfAborted();
    const reader:Reader={invoke:(capability,invocation)=>context.invoke(capability,invocation,{signal})};
    const bound=await bind(reader,ref(request.payload.candidate),request.attempt.runId,config);
    if(request.operation==='deliver') {
      const receipt=recovery?await lookup(reader,bound,config):object(await context.invoke('operator.request',{operation:'publish',resource:{type:'operator.target',canonicalId:config.operatorTarget},payload:bound.payload},{signal,deliveryId:bound.deliveryId}));
      // Even a returned completion is checked against the original durable request and receipt.
      const authoritative=await lookup(reader,bound,config);
      if(canonicalJson(receipt)!==canonicalJson(authoritative))throw new Error('DEMO_DELIVERY_RECEIPT_CHANGED');return deliveryArtifact(bound,authoritative);
    }
    const receipt=await delivered(reader,bound,ref(request.payload.delivery),request.attempt.runId,config);
    const body=requestBody(bound,receipt);if(Buffer.byteLength(body)>16384)throw new Error('DEMO_READY_REQUEST_TOO_LARGE');
    return commit(records,config,body,signal,recovery);
  };
  return {async ready(){stopping.signal.throwIfAborted();},async invoke(invocation){
    if(!invocation.confidential)invocation.fence.assertCurrent();
    const signal=AbortSignal.any([invocation.signal,stopping.signal,AbortSignal.timeout(config.timeoutMs)]);
    const value=await execute(invocation.request,signal,false);signal.throwIfAborted();return value!;
  },async receipt(request){
    const signal=AbortSignal.any([stopping.signal,AbortSignal.timeout(config.timeoutMs)]);
    const result=await execute(request,signal,true);signal.throwIfAborted();return result;
  },async shutdown(){stopping.abort(new Error('DEMO_HANDOFF_SHUTDOWN'));}};
}
