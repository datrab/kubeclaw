import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CURRENT_RUNTIME_DISPATCH_PROFILE as profile, parseRuntimeDispatchProfile, withRuntimeDispatchProfile,
  extractRuntimeDispatchProfile, portableJson, sha256Text} from '@kubeclaw/plugin-sdk';
import {validateContractValue} from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import {assertRunSnapshot, graphSnapshot, readRunSnapshot, writeRunSnapshots} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {prepareOpenClawTask} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw.ts';
import {ReviewDispatchBudget} from '../../../skills/nova/plugins/review/src/review-prompt-budget.ts';

test('finite canonical profile: SDK and original Foundation validator agree without executing getters',()=>{
  for(const valid of [profile,{encoding:'json-utf16-v1',schemaVersion:'runtime-dispatch-profile.v1'}]){
    assert.deepEqual(parseRuntimeDispatchProfile(valid),profile);validateContractValue('runtimeDispatchProfile',valid);
  }
  let getters=0;
  const exotic=Object.assign(new(class Profile{})(),profile);
  const getter={...profile};Object.defineProperty(getter,'encoding',{enumerable:true,get(){getters++;return profile.encoding;}});
  for(const invalid of [undefined,null,[],Array(2),NaN,exotic,getter,{...profile,extra:true},{...profile,encoding:'future'},
    {...profile,schemaVersion:'runtime-dispatch-profile.v2'},{...profile,encoding:undefined}]){
    assert.throws(()=>parseRuntimeDispatchProfile(invalid));
    assert.throws(()=>validateContractValue('runtimeDispatchProfile',invalid));
  }
  assert.equal(getters,0);
});

test('new original snapshot writes bind required profile; rehashed malformed/future/downgraded contracts reject',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dispatch-profile-snapshot-'));
  try{
    const definition=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-source-snapshots/ascii/definition.json',import.meta.url),'utf8'));
    writeRunSnapshots(root,graphSnapshot(definition),{policy:{ä:1,z:2}});
    const snapshot=readRunSnapshot(root);assert.equal(snapshot.schemaVersion,'run-snapshot.v3');
    assert.deepEqual(snapshot.runtimeDispatchProfile,profile);
    assert.throws(()=>writeRunSnapshots(root,graphSnapshot(definition),{}),/RUN_ALREADY_EXISTS/);
    const {runtimeDispatchProfile:removed,...without}=snapshot;
    for(const changed of [without,{...snapshot,runtimeDispatchProfile:{...profile,encoding:'future'}},
      {...snapshot,schemaVersion:'run-snapshot.v99'},{...snapshot,schemaVersion:'run-snapshot.v2'}]){
      const {digest,...unsigned}=changed;
      assert.throws(()=>assertRunSnapshot({...unsigned,digest:sha256Text(portableJson(unsigned))}));
    }
    assert.throws(()=>assertRunSnapshot({...snapshot,runtimeDispatchProfile:{...profile,encoding:'tampered'}}));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('profile is bound after budget reservation and excluded from actual model task without changing accounting',()=>{
  const payload={protocol:'audit.v1',task:'Inspect the map.',architecture:{ä:1,z:2},outputContract:{type:'object'}};
  const limits={tokenizerEncoding:'o200k_base',maxPromptBytesPerJob:100000,maxInputTokensPerJob:30000,maxOutputTokensPerJob:1000,
    maxContextTokensPerJob:31000,maxTotalInputTokens:30000,maxInitialInputTokens:30000,maxContextExpansionInputTokens:30000,
    maxVerificationInputTokens:30000,maxEstimatedCostUsd:100,inputUsdPerMillionTokens:1,outputUsdPerMillionTokens:1};
  const reserved=new ReviewDispatchBudget(limits).reserve(payload);
  const current=withRuntimeDispatchProfile(reserved,profile),legacy=withRuntimeDispatchProfile(reserved,undefined);
  assert.equal(legacy,reserved);assert.deepEqual(current.runtimePromptBudget,reserved.runtimePromptBudget);
  assert.deepEqual(extractRuntimeDispatchProfile(current).payload,reserved);
  const target={tokenizerEncoding:'o200k_base',maxPromptBytes:100000,maxInputTokens:30000,maxOutputTokens:1000,maxContextTokens:31000};
  const oldTask=prepareOpenClawTask(legacy,'/tmp/profile-result.json',target);
  const newTask=prepareOpenClawTask(current,'/tmp/profile-result.json',target);
  assert.equal(newTask,oldTask);assert.doesNotMatch(newTask,/runtimeDispatchProfile|runtimePromptBudget/);
  assert.throws(()=>extractRuntimeDispatchProfile({...payload,runtimeDispatchProfile:undefined}));
  assert.throws(()=>withRuntimeDispatchProfile(current,profile),/ALREADY_BOUND/);
});
