import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY_SELECTION} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy,loadCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {activate} from '../../../skills/common/plugins/operator-messaging/src/adapter.ts';
import {parsePayload} from '../../../skills/common/plugins/operator-messaging/src/payload.ts';
const TEST_CORE_POLICY=loadCoreRuntimePolicy(TEST_CORE_POLICY_SELECTION);
const id='kubeclaw.operator-messaging:operator';
const raw=root=>({deliveryRoot:root,targets:{operators:{endpoint:'http://127.0.0.1:9',tokenSecret:'key',payloadProfile:'standard'}}});
const selected=(root,policy)=>selectedAdapterConfigurations({[id]:raw(root)},policy)[id];
test('captured operator structure A/B reaches the real adapter before effects; exact depth/array/object boundaries and restored positives',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'operator-structure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'core.json');
 const author=n=>{const policy=structuredClone(TEST_CORE_POLICY);delete policy.reviewPolicyCapture;policy.reviewPolicySelection.file=TEST_CORE_POLICY.reviewPolicyCapture.source.file;policy.operatorMessagingPayload.payloadStructure={maximumDepth:n,maximumArrayEntries:n,maximumObjectProperties:n};fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v3',profiles:{standard:{settings:policy}}}));};
 author(2);const a=loadCoreRuntimePolicy({file,profile:'standard'}),retained=JSON.parse(JSON.stringify(a));author(4);const b=loadCoreRuntimePolicy({file,profile:'standard'});fs.unlinkSync(file);
 const pa=captureCoreRuntimePolicy(retained).operatorMessagingPayload.payloadStructure,pb=b.operatorMessagingPayload.payloadStructure;
 for(const [key,value] of [['array',{type:'event.test',artifact:[1,2,3]}],['object',{type:'event.test',artifact:{a:1,b:2,c:3}}],['depth',{type:'event.test',artifact:{a:{b:1}}}]]){
  assert.throws(()=>parsePayload(value,65536,pa),new RegExp('OPERATOR_PAYLOAD_INVALID:.*'+key));
  assert.deepEqual(parsePayload(value,65536,pb),value);
 }
 const exact={type:'event.test',artifact:[1,2]};assert.deepEqual(parsePayload(exact,65536,pa),exact);
 const instance=activate({config:selected(path.join(root,'store'),a)});
 const request={capability:'operator.request',operation:'publish',resource:{type:'operator.target',canonicalId:'operators'},payload:{type:'event.test',artifact:[1,2,3]},idempotencyKey:'oversized',effectId:'effect:structure',attempt:{runId:'run:structure',stageId:'probe',attemptId:'attempt:structure',attemptNumber:1}};
 await assert.rejects(()=>instance.invoke({request,signal:new AbortController().signal,confidential:false,fence:{assertCurrent(){}},async invoke(){assert.fail('oversized structure reached effect');}}),/OPERATOR_PAYLOAD_INVALID:.*array/);
 assert.equal(fs.existsSync(path.join(root,'store')),false);
 await instance.shutdown();
 for(const [field,max] of Object.entries({maximumDepth:20,maximumArrayEntries:1000,maximumObjectProperties:1000})){
  for(const value of [undefined,null,0,max+1,1.5]){const invalid=structuredClone(TEST_CORE_POLICY);invalid.operatorMessagingPayload.payloadStructure[field]=value;assert.throws(()=>captureCoreRuntimePolicy(invalid),/CORE_RUNTIME_POLICY_INVALID/);assert.throws(()=>activate({config:{...selected(root,TEST_CORE_POLICY),payloadStructure:invalid.operatorMessagingPayload.payloadStructure}}),/STRUCTURE_INVALID/);}
 }
 assert.throws(()=>selectedAdapterConfigurations({[id]:{...raw(root),payloadStructure:pa}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
});

test('original v1/v2 operator captures remain unchanged and use their original protocol contract; malformed v3 cannot fall back',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'operator-old-capture-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const v2=structuredClone(TEST_CORE_POLICY);v2.policyVersion='nova-core-runtime-policy.v2';delete v2.operatorMessagingPayload.payloadStructure;
 const before=JSON.stringify(v2),captured=captureCoreRuntimePolicy(v2);
 assert.equal(JSON.stringify(captured),before);
 const old=selected(path.join(root,'old'),captured);
 assert.equal(Object.hasOwn(old,'payloadStructure'),false);assert.equal(Object.hasOwn(old,'payloadPolicyVersion'),false);
 const payload={type:'event.test',artifact:{a:{b:1}}};
 const request={capability:'operator.request',operation:'publish',resource:{type:'operator.target',canonicalId:'operators'},payload,idempotencyKey:'legacy',effectId:'effect:legacy',attempt:{runId:'run:legacy',stageId:'probe',attemptId:'attempt:legacy',attemptNumber:1}};
 const instance=activate({config:old});assert.equal(await instance.receipt(request),undefined);await instance.shutdown();
 assert.equal(fs.existsSync(path.join(root,'old','records','store.json')),false);
 const current=structuredClone(TEST_CORE_POLICY);delete current.operatorMessagingPayload.payloadStructure;
 assert.throws(()=>captureCoreRuntimePolicy(current),/VERSION_MISMATCH/);
 for(const invalid of [{...old,payloadPolicyVersion:'operator-payload.v2'},{...old,payloadStructure:{maximumDepth:2,maximumArrayEntries:2,maximumObjectProperties:2}},{...old,payloadPolicyVersion:'future'}])assert.throws(()=>activate({config:invalid}),/STRUCTURE_VERSION_INVALID/);
});
