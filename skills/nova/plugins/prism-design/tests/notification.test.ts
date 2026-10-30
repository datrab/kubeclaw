import assert from 'node:assert/strict';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {parsePayload} from '../../../../common/plugins/operator-messaging/src/payload.ts';
import {execute} from '../src/stage.ts';
const value={title:'Design'};const bytes=canonicalJson(value);const contentDigest=sha256Text(bytes);
const artifact={artifactId:`artifact:${contentDigest}`,namespace:'test.architecture',mediaType:'application/json',digest:contentDigest,sizeBytes:Buffer.byteLength(bytes),producer:{runId:'run:notification',stageId:'input',attemptId:'attempt:input',attemptNumber:1}};
let notified=false;
const context={contract:{lease:{attempt:{runId:'run:notification'}},config:{agent:'prism',target:'design',issuerId:'operator',timeoutMinutes:60}},artifact:()=>artifact,
 async invoke(capability:string,request:any){
  if(capability==='artifacts.read')return {artifact,value,digest:contentDigest,sizeBytes:artifact.sizeBytes};
  if(capability==='runtime.dispatch')return {result:{status:'waiting'}};
  if(capability==='signal.wait')return {created:true,wait:{schemaVersion:'wait-request.v2',waitId:`wait:${'a'.repeat(64)}`,kind:'signal',signalType:'prism.approval.resolved',authorizedIssuer:request.payload.authorizedIssuer,expiresAt:request.payload.expiresAt,request:request.payload.request}};
  if(capability==='operator.request'){const payload=parsePayload(request.payload,65536);assert.deepEqual(payload.artifact,{architectureDigest:contentDigest});notified=true;return {accepted:true};}
  throw Error(capability);
 }};
const result=await execute({runId:'ignored',projectId:'notifications',architectureArtifact:{artifactId:artifact.artifactId,contentDigest,revision:1},requiresDesign:true},context as any);
assert.equal(result.outcome,'wait');assert.equal(notified,true);
console.log(JSON.stringify({ok:true,regression:'prism operator notification uses the real strict payload parser'}));
