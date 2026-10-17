import test from 'node:test';
import assert from 'node:assert/strict';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
const id='kubeclaw.demo-handoff:handoff';
test('demo handoff receives owned central store budgets and rejects even equal duplicate authors',()=>{
 const raw=structuredClone(TEST_CORE_POLICY);raw.demoHandoffStore={maximumRecords:7,maximumBytes:200000,maximumRecordBytes:2000};
 const original=captureCoreRuntimePolicy(raw);raw.demoHandoffStore.maximumRecords=99;
 const projected=selectedAdapterConfigurations({[id]:{stateRoot:'/tmp/demo'}},original);
 assert.deepEqual(projected[id]!.recordLimits,{maximumRecords:7,maximumBytes:200000,maximumRecordBytes:2000});
 assert(Object.isFrozen(projected[id]!.recordLimits));
 assert.throws(()=>selectedAdapterConfigurations({[id]:{recordLimits:original.demoHandoffStore}},original),/DEMO_HANDOFF_STORE_POLICY_COMPETING_AUTHOR/);
 const current=captureCoreRuntimePolicy({...TEST_CORE_POLICY,demoHandoffStore:{maximumRecords:9,maximumBytes:300000,maximumRecordBytes:3000}});
 assert.equal((selectedAdapterConfigurations({[id]:{}},current)[id]!.recordLimits as any).maximumRecords,9);
 assert.equal((selectedAdapterConfigurations({[id]:{}},original)[id]!.recordLimits as any).maximumRecords,7);
});
