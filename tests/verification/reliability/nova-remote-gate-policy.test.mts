import test from 'node:test';
import assert from 'node:assert/strict';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {gateLimits} from '../../../skills/nova/plugins/remote-test-gate/src/gate-limits.ts';
import {activate} from '../../../skills/nova/plugins/remote-test-gate/src/evidence-adapter.ts';
test('remote plan and evidence receive same retained limits, new selection changes independently and duplicate authors reject',()=>{
 const raw=structuredClone(TEST_CORE_POLICY);raw.remoteTestGate.recordLimits.maximumRecords=7;
 const a=captureCoreRuntimePolicy(raw);raw.remoteTestGate.recordLimits.maximumRecords=9;
 const b=captureCoreRuntimePolicy(raw);
 for(const id of ['kubeclaw.remote-test-gate:plan','kubeclaw.remote-test-gate:evidence']) {
  const selected=selectedAdapterConfigurations({[id]:{}},a)[id]!;
  assert.equal(gateLimits(selected.gateLimits).recordLimits.maximumRecords,7);
  assert.equal(gateLimits(selectedAdapterConfigurations({[id]:{}},b)[id]!.gateLimits).recordLimits.maximumRecords,9);
  assert.throws(()=>selectedAdapterConfigurations({[id]:selected},a),/REMOTE_TEST_GATE_POLICY_COMPETING_AUTHOR/);
 }
 assert.throws(()=>gateLimits(undefined),/LIMITS_REQUIRED/);
 assert.throws(()=>gateLimits({...a.remoteTestGate,maximumEvidenceBytes:0}),/LIMITS_INVALID/);
 assert.throws(()=>activate({config:{stateRoot:'/tmp',manifestStageId:'summary',gateStageId:'gate'}} as any),/LIMITS_REQUIRED/);
 assert(Object.isFrozen(gateLimits(a.remoteTestGate).recordLimits));
});
