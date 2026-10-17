import {runPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compileProject, compileProjectWithCorePolicy, compileProjectWithCompilerPolicyCandidate} from '../../../skills/nova/project/compiler.ts';
import {compileProjectRecovery} from '../../../skills/nova/project/recovery.ts';
import {loadCoreRuntimePolicy, captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {graphSnapshot, writeRunSnapshots, readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {projectSourceFixture} from './project-source-fixture.mjs';
import {TEST_CORE_POLICY, TEST_CORE_POLICY_SELECTION} from '../../fixtures/core-runtime-policy.mjs';

const selected = () => {const {reviewPolicySelection,reviewPolicyCapture,...policy}=loadCoreRuntimePolicy(TEST_CORE_POLICY_SELECTION);return policy;};
test('selected compiler preserves original graphs for absent, mixed and all review modules', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'compiler-policy-'));
  const fixture=await projectSourceFixture(root,{clean:false});
  t.after(async()=>{await fixture.close();fs.rmSync(root,{recursive:true,force:true});});
  for (const reviewCount of [0,1,2]) {
    const project=structuredClone(fixture.project);
    project.modules.slice(0,reviewCount).forEach(module=>{module.review={agent:'echo'};});
    assert.deepEqual(compileProjectWithCorePolicy(project,selected()),compileProject(project));
  }
  // The denied experimental candidate is not turned into an activation path.
  const policy=structuredClone(selected().projectCompiler);
  delete policy.schemaVersion; policy.reviewRepair={mode:'disabled'};
  delete policy.repairBudget.categories.review;
  assert.equal(compileProjectWithCompilerPolicyCandidate(fixture.project,policy).activationAllowed,false);
});

test('A/B selection reaches real graph; retained original survives invalid current owner and rejects partial/unknown captures', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'compiler-recovery-'));
  const fixture=await projectSourceFixture(root,{clean:false});
  t.after(async()=>{await fixture.close();fs.rmSync(root,{recursive:true,force:true});});
  fixture.project.modules[0].review={agent:'echo'};
  const policy=structuredClone(selected());
  Object.assign(policy.projectCompiler.repairBudget.categories,{lint:3,review:4,test:5});
  policy.projectCompiler.execution={maxTechnicalRetries:2,timeoutMs:7777};
  policy.projectCompiler.executionGroups={source:{timeoutMs:1234},cumulative:{timeoutMs:5678},demo:{timeoutMs:9012}};
  const file=path.join(root,'core.json');
  fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v3',profiles:{selected:{settings:policy}}}));
  const received=loadCoreRuntimePolicy({file,profile:'selected'});
  const compiled=compileProjectWithCorePolicy(fixture.project,received);
  const byId=new Map(compiled.definition.stages.map(stage=>[stage.id,stage]));
  assert.equal(byId.get('source-preflight').execution.timeoutMs,1234);
  assert.equal(byId.get('final-test').execution.timeoutMs,5678);
  assert.equal(byId.get('implement-api').execution.maxAttempts,16);
  assert.equal(byId.get('implement-ui').execution.maxAttempts,12);
  assert.deepEqual(byId.get('implement-api').execution.repairBudget.categories,{lint:3,review:4,test:5});
  assert.deepEqual(byId.get('implement-ui').execution.repairBudget.categories,{lint:3,test:5});
  for (const stage of compiled.definition.stages.filter(stage=>stage.id.startsWith('lint-'))) {
    assert.equal(stage.execution.timeoutMs,7777);
    assert.equal(Object.hasOwn(stage.execution,'repairBudget'),false);
  }
  assert.notDeepEqual(compiled,compileProject(fixture.project));
  fs.writeFileSync(file,'invalid current B');
  for (const [name,original,expected] of [
    ['original',received,null],
    ['missing-policy',(()=>{const p=structuredClone(received);delete p.projectCompiler;return p;})(),/CORE_RUNTIME_POLICY_INVALID/],
    ['missing-version',(()=>{const p=structuredClone(received);delete p.policyVersion;return p;})(),/CORE_RUNTIME_POLICY_INVALID/],
    ['future',(()=>{const p=structuredClone(received);p.projectCompiler.schemaVersion='future';return p;})(),/CORE_RUNTIME_POLICY_INVALID/],
  ]) {
    const storage=path.join(root,name),directory=runRoot(storage,compiled.runId);fs.mkdirSync(directory,{recursive:true});
    writeRunSnapshots(directory,graphSnapshot(compiled.definition),{projectCompilerVersion: 'project-compiler-runtime.v1', configuration:{corePolicy:original}});
    const before=fs.readFileSync(path.join(directory,'run-snapshot.json'));
    if(expected)assert.throws(()=>compileProjectRecovery(fixture.project,storage),expected);
    else assert.deepEqual(compileProjectRecovery(fixture.project,storage),compiled);
    assert.deepEqual(fs.readFileSync(path.join(directory,'run-snapshot.json')),before);
  }
  const v2 = structuredClone(received); v2.policyVersion='nova-core-runtime-policy.v2'; delete v2.operatorMessagingPayload.payloadStructure;
  assert.deepEqual(captureCoreRuntimePolicy(v2),v2);
  const v2Compiled=compileProjectWithCorePolicy(fixture.project,v2);
  const v2Storage=path.join(root,'original-v2'),v2Root=runRoot(v2Storage,v2Compiled.runId);fs.mkdirSync(v2Root,{recursive:true});
  writeRunSnapshots(v2Root,graphSnapshot(v2Compiled.definition),{projectCompilerVersion:'project-compiler-runtime.v1',configuration:{corePolicy:v2}});
  assert.deepEqual(compileProjectRecovery(fixture.project,v2Storage),v2Compiled);
  const brokenV3=structuredClone(received);delete brokenV3.operatorMessagingPayload.payloadStructure;
  assert.throws(()=>captureCoreRuntimePolicy(brokenV3),/VERSION_MISMATCH/);
  const legacy = compileProject(fixture.project);
  const legacyStorage = path.join(root,'legacy-v2'), legacyRoot = runRoot(legacyStorage, legacy.runId);
  fs.mkdirSync(legacyRoot,{recursive:true});
  writeRunSnapshots(legacyRoot,graphSnapshot(legacy.definition),{configuration:{corePolicy:received}});
  assert.deepEqual(compileProjectRecovery(fixture.project,legacyStorage),legacy);
  const unknownStorage=path.join(root,'unknown-compiler'), unknownRoot=runRoot(unknownStorage,compiled.runId);
  fs.mkdirSync(unknownRoot,{recursive:true});
  writeRunSnapshots(unknownRoot,graphSnapshot(compiled.definition),{projectCompilerVersion:'future',configuration:{corePolicy:received}});
  assert.throws(()=>compileProjectRecovery(fixture.project,unknownStorage),/PROJECT_RECOVERY_COMPILER_VERSION_INVALID/);
  assert.throws(()=>compileProjectWithCorePolicy(fixture.project,TEST_CORE_POLICY),/PROJECT_COMPILER_SELECTION_REQUIRED/);
  assert.throws(()=>captureCoreRuntimePolicy({...policy,projectCompiler:{}}),/CORE_RUNTIME_POLICY_INVALID/);
  fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:received}}}));
  assert.throws(()=>loadCoreRuntimePolicy({file,profile:'selected'}),/VERSION_MISMATCH/);
});

test('real runner captures the explicit compiler discriminator and the exact frozen selected policy without live owner I/O', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'compiler-run-'));
  const fixture=await projectSourceFixture(root,{clean:false});
  t.after(async()=>{await fixture.close();fs.rmSync(root,{recursive:true,force:true});});
  const policy=structuredClone(selected()); policy.projectCompiler.execution.timeoutMs=123456;
  const compiled=compileProjectWithCorePolicy(fixture.project,policy);
  const prefix=new Map(fixture.definition.stages.map(stage=>[stage.id,stage]));
  const definition={...compiled.definition,stages:compiled.definition.stages.filter(stage=>prefix.has(stage.id))
    .map(stage=>({...stage,dependsOn:prefix.get(stage.id).dependsOn}))};
  const platform={...fixture.platform,corePolicySelection:{file:path.join(root,'absent-owner.json'),profile:'absent'}};
  const result=await runPipelineV2(platform,definition,compiled.runId,undefined,policy);
  assert.equal(result.status,'succeeded');
  const snapshot=readRunSnapshot(runRoot(platform.storageRoot,compiled.runId));
  assert.equal(snapshot.registry.projectCompilerVersion,'project-compiler-runtime.v1');
  assert.deepEqual(snapshot.registry.configuration.corePolicy,policy);
});
