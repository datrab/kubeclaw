import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy,loadCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {activateWithSdk} from '../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts';
const id='kubeclaw.openclaw-agent-events:source';
const selected=policy=>selectedAdapterConfigurations({[id]:{hooks:['agent_end']}},policy)[id];
const status=wait=>({confidential:true,signal:new AbortController().signal,request:{capability:'agent.events.subscribe',operation:'status',payload:{waitForDrain:wait}}});
function open(config){
 const handlers=new Map();let release;const blocked=new Promise(resolve=>{release=resolve;});
 const adapter=activateWithSdk({config,async emit(){await blocked;}},{on(hook,handler){handlers.set(hook,handler);return()=>handlers.delete(hook);}});
 return {adapter,handlers,release};
}
test('selected A/B event queue budgets reach actual hook consumer and captured A survives author deletion',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-event-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'core.json');
 const publish=limits=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,agentEventSource:limits}}}}));
 const load=()=>loadCoreRuntimePolicy({file,profile:'selected'});
 const aLimits={maxQueueEvents:1,maxQueueBytes:4096,drainTimeoutMs:10};publish(aLimits);
 const aConfig=selected(load()),a=open(aConfig);await a.adapter.ready();
 publish({...aLimits,maxQueueEvents:2});const bConfig=selected(load()),b=open(bConfig);await b.adapter.ready();fs.unlinkSync(file);
 try{
  a.handlers.get('agent_end')({runId:'a'});assert.throws(()=>a.handlers.get('agent_end')({runId:'second'}),/INGRESS_CAPACITY/);
  b.handlers.get('agent_end')({runId:'b'});b.handlers.get('agent_end')({runId:'second'});
  assert.equal((await a.adapter.invoke(status(false))).queued,1);assert.equal((await b.adapter.invoke(status(false))).queued,2);
  assert.equal(aConfig.maxQueueEvents,1);assert.equal(bConfig.maxQueueEvents,2);
  await assert.rejects(()=>a.adapter.shutdown(new AbortController().signal),/DRAIN_TIMEOUT/);
  assert.equal((await a.adapter.invoke(status(false))).queued,1);
 }finally{a.release();b.release();await a.adapter.shutdown(new AbortController().signal);await b.adapter.shutdown(new AbortController().signal);}
});
test('required central queue fields reject missing/null/wrong units, direct fallbacks and competing authors',()=>{
 for(const key of Object.keys(TEST_CORE_POLICY.agentEventSource)){
  const missing=structuredClone(TEST_CORE_POLICY);delete missing.agentEventSource[key];
  assert.throws(()=>captureCoreRuntimePolicy(missing),/INVALID/);assert.throws(()=>open({hooks:['agent_end'],...missing.agentEventSource}),/LIMIT_INVALID/);
  for(const value of [null,0,'1',1.5,Number.MAX_SAFE_INTEGER]){
   const bad=structuredClone(TEST_CORE_POLICY);bad.agentEventSource[key]=value;
   assert.throws(()=>captureCoreRuntimePolicy(bad),/INVALID/);assert.throws(()=>open({hooks:['agent_end'],...bad.agentEventSource}),/LIMIT_INVALID/);
  }
  for(const value of [null,TEST_CORE_POLICY.agentEventSource[key]])assert.throws(()=>selectedAdapterConfigurations({[id]:{hooks:['agent_end'],[key]:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 }
});
