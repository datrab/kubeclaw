import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireResource} from '../../../skills/nova/core/effects/resource-acquisition.ts';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
const resource={type:'test',canonicalId:'one'}, signal=()=>new AbortController().signal;
test('selected A/B actual contention deadlines, polling, TTL cap and restored acquisition',async()=>{
 async function contend(policy,ttl=1000){let calls=0;const started=performance.now();await assert.rejects(acquireResource({acquire(){calls++;throw Error('RESOURCE_LOCKED:one');}},resource,'owner',ttl,signal(),policy),/WAIT_TIMEOUT/);return {calls,elapsed:performance.now()-started};}
 const a=await contend({timeoutMs:10,pollIntervalMs:2}),b=await contend({timeoutMs:70,pollIntervalMs:2});
 assert(b.elapsed>a.elapsed);assert(b.calls>a.calls);
 const slow=await contend({timeoutMs:70,pollIntervalMs:35});assert(slow.calls<b.calls);
 const capped=await contend({timeoutMs:1000,pollIntervalMs:2},10);assert(capped.elapsed<500);
 const lock={lockId:'restored'};let attempts=0;
 assert.equal(await acquireResource({acquire(){if(++attempts<3)throw Error('RESOURCE_LOCK_PROVISIONING:one');return lock;}},resource,'owner',1000,signal(),{timeoutMs:100,pollIntervalMs:1}),lock);assert.equal(attempts,3);
});
test('missing/invalid/duplicate policy rejects; cancellation and unrelated failures retain original semantics',async()=>{
 for(const key of ['timeoutMs','pollIntervalMs']){
  for(const value of [undefined,null,0,-1,'10',1.5,2147483648]){
   const policy={timeoutMs:30,pollIntervalMs:2,[key]:value};const core={...TEST_CORE_POLICY,resourceAcquisition:policy};assert.throws(()=>captureCoreRuntimePolicy(core),/INVALID/);
   await assert.rejects(acquireResource({},resource,'owner',1000,signal(),policy),/POLICY_INVALID/);
  }
 }
 for(const policy of [undefined,{timeoutMs:30,pollIntervalMs:2,extra:1}])await assert.rejects(acquireResource({},resource,'owner',1000,signal(),policy),/POLICY_INVALID/);
 const controller=new AbortController();controller.abort('stop');await assert.rejects(acquireResource({},resource,'owner',1000,controller.signal,TEST_CORE_POLICY.resourceAcquisition),/WAIT_CANCELLED/);
 const failure=Error('UNRELATED');await assert.rejects(acquireResource({acquire(){throw failure;}},resource,'owner',1000,signal(),TEST_CORE_POLICY.resourceAcquisition),error=>error===failure);
 const pendingController=new AbortController();const pending=acquireResource({acquire(){throw Error('RESOURCE_LOCKED:one');}},resource,'owner',1000,pendingController.signal,TEST_CORE_POLICY.resourceAcquisition);pendingController.abort();await assert.rejects(pending,/WAIT_CANCELLED/);
});
