import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadCoreRuntimePolicy,captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {observe} from '../../../skills/common/plugins/notification-observer/src/observer.ts';
const id='kubeclaw.notification-observer:notifications';
const select=policy=>selectedAdapterConfigurations({[id]:{target:'operators'}},policy)[id];
const delivery={event:{type:'run.failed',eventId:'event:cap',identity:{runId:'run:cap'},payload:{summary:'x'.repeat(1000)}}};
async function summary(config){let sent;await observe(delivery,{contract:{config},async invoke(capability,request){assert.equal(capability,'operator.request');sent=request.payload;}});return sent.summary;}
test('selected notification A/B caps reach real publish and retained A survives source deletion',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'notification-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'core.json');
 const publish=maxMessageChars=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,notificationPresentation:{...TEST_CORE_POLICY.notificationPresentation,maxMessageChars}}}}}));
 publish(256);const a=loadCoreRuntimePolicy({file,profile:'selected'});const retained=JSON.parse(JSON.stringify(a));
 publish(512);const b=loadCoreRuntimePolicy({file,profile:'selected'});fs.unlinkSync(file);
 assert.equal(await summary(select(captureCoreRuntimePolicy(retained))), 'x'.repeat(255)+'…');
 assert.equal(await summary(select(b)), 'x'.repeat(511)+'…');
 assert.equal(await summary(select(TEST_CORE_POLICY)), 'x'.repeat(1000));
});
test('notification cap rejects missing/invalid values and equal competing authors',async()=>{
 for(const value of [undefined,null,0,255,8193,256.5,'512']){
  const policy=structuredClone(TEST_CORE_POLICY);policy.notificationPresentation={...TEST_CORE_POLICY.notificationPresentation,maxMessageChars:value};
  assert.throws(()=>captureCoreRuntimePolicy(policy),/CORE_RUNTIME_POLICY_INVALID/);
  await assert.rejects(()=>summary({...select(TEST_CORE_POLICY),maxMessageChars:value}),/NOTIFICATION_MESSAGE_LIMIT_INVALID/);
 }
 const missing=structuredClone(TEST_CORE_POLICY);delete missing.notificationPresentation;assert.throws(()=>captureCoreRuntimePolicy(missing),/CORE_RUNTIME_POLICY_INVALID/);
 for(const value of [null,8192])assert.throws(()=>selectedAdapterConfigurations({[id]:{target:'operators',maxMessageChars:value}},TEST_CORE_POLICY),/NOTIFICATION_PRESENTATION_POLICY_COMPETING_AUTHOR/);
});

test('selected label A/B projection survives capture and rejects missing or competing label author',async()=>{
 const project=async policy=>{let sent;await observe({...delivery,event:{...delivery.event,type:'stage.failed',payload:{agentRole:'r'.repeat(20)},identity:{runId:'run:cap',stageId:'stage:cap'}}},{contract:{config:{...select(policy),pipelineLabel:'p'.repeat(20),modelLabel:'m'.repeat(20),stageLabels:{'stage:cap':'s'.repeat(20)}}},async invoke(capability,request){sent=request.payload;}});return sent;};
 const a=structuredClone(TEST_CORE_POLICY);a.notificationPresentation.maxLabelChars=8;const retained=captureCoreRuntimePolicy(JSON.parse(JSON.stringify(a)));a.notificationPresentation.maxLabelChars=16;
 const pa=await project(retained),pb=await project(captureCoreRuntimePolicy(a));
 assert.equal(pa.footer,'p'.repeat(7)+'… · run:cap');assert.equal(pb.footer,'p'.repeat(15)+'… · run:cap');
 assert.equal(pa.fields.at(-1).value,'m'.repeat(7)+'…');assert.equal(pb.fields.at(-1).value,'m'.repeat(15)+'…');
 assert.equal(pa.title,'R'.repeat(1)+'r'.repeat(6)+'… · '+'s'.repeat(7)+'… failed');
 for(const value of [undefined,null,0,257,1.5,'8']){const invalid=structuredClone(TEST_CORE_POLICY);invalid.notificationPresentation.maxLabelChars=value;assert.throws(()=>captureCoreRuntimePolicy(invalid),/CORE_RUNTIME_POLICY_INVALID/);await assert.rejects(()=>summary({...select(TEST_CORE_POLICY),maxLabelChars:value}),/NOTIFICATION_LABEL_LIMIT_INVALID/);}
 assert.throws(()=>selectedAdapterConfigurations({[id]:{target:'operators',maxLabelChars:256}},TEST_CORE_POLICY),/NOTIFICATION_PRESENTATION_POLICY_COMPETING_AUTHOR/);
});

 test('selected label cap also bounds generated stage labels without rewriting stage identity',async()=>{
 const stageId='long-stage-name';
 const project=async maximum=>{const policy=structuredClone(TEST_CORE_POLICY);policy.notificationPresentation.maxLabelChars=maximum;let sent;await observe({...delivery,event:{...delivery.event,type:'stage.failed',identity:{runId:'run:cap',stageId},payload:{agentRole:'aßbcdefg'}}},{contract:{config:select(captureCoreRuntimePolicy(policy))},async invoke(capability,request){sent=request.payload;}});return sent;};
 const a=await project(8),b=await project(16);
 assert.equal(a.title,'ASSBcde… · Long St… failed');assert.equal(b.title,'ASSBcdefg · Long Stage Name failed');
 assert.equal(a.footer,'KubeCla… · run:cap');assert.equal(b.footer,'KubeClaw Pipeli… · run:cap');
 for(const result of [a,b]){assert.equal(result.stageId,stageId);assert.equal(result.fields.find(field=>field.name==='Stage').value,stageId);}
 });
