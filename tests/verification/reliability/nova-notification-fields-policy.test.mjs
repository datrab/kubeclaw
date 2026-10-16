import {OPERATOR_PAYLOAD_PROTOCOL_LIMITS} from '../../../skills/common/plugins/operator-messaging/src/payload-structure.ts';
import {parsePayload} from '../../../skills/common/plugins/operator-messaging/src/payload.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import { captureCoreRuntimePolicy, loadCoreRuntimePolicy } from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import { selectedObserverConfigurations } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { observe, deliverPreview } from '../../../skills/common/plugins/notification-observer/src/observer.ts';
const id='kubeclaw.notification-observer:notifications';
const previewId='kubeclaw.notification-observer:preview-delivery';
const fields=['maxTitleChars','maxReasonCodeChars','maxArtifactIdChars','maxArtifactDigestChars','maxArtifactMediaTypeChars','maxArtifactLogicalNameChars'];
const event={type:'stage.failed',eventId:'event:fields',identity:{runId:'run:fields',stageId:'stage:long-name',artifactId:'artifact:original'},payload:{reason:{code:'r'.repeat(900)},artifact:{artifactId:'a'.repeat(900),digest:'d'.repeat(900),mediaType:'m'.repeat(900),logicalName:'n'.repeat(900),token:'secret-never-forward'}}};
const select=policy=>selectedObserverConfigurations({[id]:{target:'operators'}},policy)[id];
async function publish(policy){const config=select(policy),sent=[];const context={contract:{config},async invoke(capability,request){assert.equal(capability,'operator.request');sent.push(request.payload);}};await observe({event},context);const previewConfig=selectedObserverConfigurations({[previewId]:{target:'operators'}},policy)[previewId];await deliverPreview({event},{...context,contract:{config:previewConfig}});return sent;}
test('physical selected A/B and retained A reach real lifecycle and preview publication without current owner',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'notification-fields-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'core.json');
 const author=maximum=>{const policy=structuredClone(TEST_CORE_POLICY);for(const field of fields)policy.notificationPresentation[field]=maximum;fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:policy}}}));};
 author(8);const a=loadCoreRuntimePolicy({file,profile:'selected'}),retained=JSON.parse(JSON.stringify(a));author(16);const b=loadCoreRuntimePolicy({file,profile:'selected'});fs.unlinkSync(file);
 for(const [policy,maximum] of [[captureCoreRuntimePolicy(retained),8],[b,16]]){
  const [life,preview]=await publish(policy);assert.equal(life.title.length,maximum);assert.equal(life.reasonCode,'r'.repeat(maximum-1)+'…');
  for(const [key,char] of [['artifactId','a'],['digest','d'],['mediaType','m'],['logicalName','n']])assert.equal(preview.artifact[key],char.repeat(maximum-1)+'…');
  assert.equal(life.stageId,event.identity.stageId);assert.equal(preview.artifactId,event.identity.artifactId);assert.doesNotMatch(JSON.stringify(preview),/secret-never-forward|token/);
 }
 const [life,preview]=await publish(TEST_CORE_POLICY);assert.equal(life.reasonCode.length,256);assert.equal(preview.artifact.artifactId.length,512);assert.equal(preview.artifact.digest.length,256);
});
test('every display limit is required, positive and non-competing before either publish effect',async()=>{
 for(const field of fields){
  assert.throws(()=>selectedObserverConfigurations({[id]:{target:'operators',[field]:TEST_CORE_POLICY.notificationPresentation[field]}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
  for(const value of [undefined,null,0,-1,1.5,'8',Number.MAX_SAFE_INTEGER+1]){
   const policy=structuredClone(TEST_CORE_POLICY);policy.notificationPresentation[field]=value;assert.throws(()=>captureCoreRuntimePolicy(policy),/INVALID/);
   const context={contract:{config:{...select(TEST_CORE_POLICY),[field]:value}},async invoke(){assert.fail('invalid policy published');}};
   await assert.rejects(()=>observe({event},context),/NOTIFICATION_FIELD_LIMIT_INVALID/);await assert.rejects(()=>deliverPreview({event},context),/NOTIFICATION_FIELD_LIMIT_INVALID/);
  }
 }
 const policy=structuredClone(TEST_CORE_POLICY);policy.notificationPresentation.extra=1;assert.throws(()=>captureCoreRuntimePolicy(policy),/INVALID/);
});

test('accepted title/reason display limits compose with the actual operator receiver at its supported boundary', async()=>{
 const policy=structuredClone(TEST_CORE_POLICY);
 policy.notificationPresentation.maxTitleChars=512;
 policy.notificationPresentation.maxReasonCodeChars=256;
 let sent;
 await observe({event:{...event, payload:{...event.payload,agentRole:'r'.repeat(256)}}},{contract:{config:{...select(captureCoreRuntimePolicy(policy)),stageLabels:{[event.identity.stageId]:'s'.repeat(256)}}},async invoke(_capability,request){sent=request.payload;}});
 assert.equal(sent.title.length,512);assert.equal(sent.reasonCode.length,256);
 assert.deepEqual(parsePayload(sent,65536,OPERATOR_PAYLOAD_PROTOCOL_LIMITS),sent);
 for(const [field,invalid] of [['maxTitleChars',513],['maxReasonCodeChars',257]]){
  const bad=structuredClone(policy);bad.notificationPresentation[field]=invalid;
  assert.throws(()=>captureCoreRuntimePolicy(bad),/CORE_RUNTIME_POLICY_INVALID/);
  const context={contract:{config:{...select(policy),[field]:invalid}},async invoke(){assert.fail('unsupported display limit published');}};
  await assert.rejects(()=>observe({event},context),/NOTIFICATION_FIELD_LIMIT_INVALID/);
  await assert.rejects(()=>deliverPreview({event},context),/NOTIFICATION_FIELD_LIMIT_INVALID/);
 }
});
