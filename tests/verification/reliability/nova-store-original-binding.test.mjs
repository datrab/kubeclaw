import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import { captureStoreRuntimeBindings, restoreStoreRuntimeBindings } from '../../../skills/nova/core/execution/store-runtime-binding.ts';
import { selectedAdapterConfigurations } from '../../../skills/nova/core/execution/engine-runtime.ts';

const stores = [
 ['kubeclaw.artifact-store:artifact-store','artifactStore','artifactRoot'],
 ['kubeclaw.state-store:state','stateStore','root'],
 ['kubeclaw.wait-store:waits','waitStore','root'],
 ['kubeclaw.telemetry-store:telemetry','telemetryStore','root'],
];
test('all four original stores are private immutable captures; incomplete, mixed, absent and foreign bindings reject',()=>{
 const raw=Object.fromEntries(stores.map(([id,,key])=>[id,{[key]:'/original/'+id}]));
 const projected=selectedAdapterConfigurations(raw,TEST_CORE_POLICY);
 const retained=captureStoreRuntimeBindings(projected,TEST_CORE_POLICY);
 assert(Object.isFrozen(retained));
 for(const [id,field,key] of stores){
  assert(Object.isFrozen(retained[id]));assert.deepEqual(retained[id],raw[id]);
  const b=structuredClone(raw);b[id][key]='/current/B';
  const restored=restoreStoreRuntimeBindings(b,retained);assert.deepEqual(restored,raw);
  restored[id][key]='/mutated';assert.deepEqual(retained[id],raw[id]);
  const absent=structuredClone(raw);delete absent[id];
  assert.throws(()=>restoreStoreRuntimeBindings(absent,retained),/REGISTRATION_MISMATCH/);
  const missing=structuredClone(retained);delete missing[id];
  assert.throws(()=>restoreStoreRuntimeBindings(raw,missing),/REGISTRATION_MISMATCH/);
  for(const value of ['',null,7,[],{}]){
   const bad=structuredClone(projected);bad[id][key]=value;
   assert.throws(()=>captureStoreRuntimeBindings(bad,TEST_CORE_POLICY),/CONFIGURATION_INVALID/);
  }
  const mixed=structuredClone(projected),leaf=Object.keys(TEST_CORE_POLICY[field])[0];mixed[id][leaf]++;
  assert.throws(()=>captureStoreRuntimeBindings(mixed,TEST_CORE_POLICY),/POLICY_MISMATCH/);
  const incomplete=structuredClone(projected);delete incomplete[id][leaf];
  assert.throws(()=>captureStoreRuntimeBindings(incomplete,TEST_CORE_POLICY),/POLICY_MISMATCH/);
  const extra=structuredClone(projected);extra[id].newAuthor=true;
  assert.throws(()=>captureStoreRuntimeBindings(extra,TEST_CORE_POLICY),/CONFIGURATION_INVALID/);
  assert.throws(()=>restoreStoreRuntimeBindings(raw,{...retained,[id]:{...retained[id],newAuthor:true}}),/CONFIGURATION_INVALID/);
 }
 assert.throws(()=>restoreStoreRuntimeBindings(raw,{...retained,'foreign:store':{root:'/foreign'}}),/CONFIGURATION_INVALID/);
 assert.deepEqual(captureStoreRuntimeBindings({},TEST_CORE_POLICY),{});
 assert.deepEqual(restoreStoreRuntimeBindings({},{}),{});
 const mutable=structuredClone(projected),copy=captureStoreRuntimeBindings(mutable,TEST_CORE_POLICY);
 mutable[stores[0][0]].artifactRoot='/changed';assert.deepEqual(copy,retained);
});
