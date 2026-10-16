import test from 'node:test';
import assert from 'node:assert/strict';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedStageConfiguration} from '../../../skills/nova/core/execution/stage-configuration.ts';
import {execute} from '../../../skills/nova/plugins/prism-design/src/stage.ts';

test('Prism selected capture preserves A independently of changed B; missing and duplicate authors reject',()=>{
 const source=structuredClone(TEST_CORE_POLICY),a=captureCoreRuntimePolicy(source);
 source.prismDesignBudgets.maximumArchitectureBytes=1;
 const b=captureCoreRuntimePolicy(source),task={agent:'prism',target:'operators',issuerId:'release',timeoutMinutes:5};
 const selected=selectedStageConfiguration('kubeclaw.design.prism',task,undefined,a.prismDesignBudgets);
 assert.equal(selected.budgets.maximumArchitectureBytes,262144);
 assert.equal(selectedStageConfiguration('kubeclaw.design.prism',task,undefined,b.prismDesignBudgets).budgets.maximumArchitectureBytes,1);
 assert(Object.isFrozen(selected.budgets));assert(!Object.hasOwn(task,'budgets'));
 assert.throws(()=>selectedStageConfiguration('kubeclaw.design.prism',{...task,budgets:a.prismDesignBudgets},undefined,a.prismDesignBudgets),/DUPLICATE_AUTHOR/);
 assert.throws(()=>selectedStageConfiguration('kubeclaw.design.prism',task),/BUDGET_REQUIRED/);
 delete source.prismDesignBudgets;assert.throws(()=>captureCoreRuntimePolicy(source),/CORE_RUNTIME_POLICY_INVALID/);
});

test('actual Prism stage applies selected architecture size before any adapter invocation',async()=>{
 const digest='sha256:'+'a'.repeat(64),budgets={...TEST_CORE_POLICY.prismDesignBudgets,maximumArchitectureBytes:1};
 let calls=0;
 const context={contract:{lease:{attempt:{runId:'prism:size'}},config:{agent:'prism',target:'operators',issuerId:'release',timeoutMinutes:5,budgets}},artifact:()=>({artifactId:'artifact:'+digest,digest,namespace:'test',mediaType:'application/json',sizeBytes:2,producer:{runId:'prism:size'}}),invoke:async()=>{calls++;throw new Error('UNEXPECTED_ADAPTER_INVOCATION');}};
 const result=await execute({runId:'ignored',projectId:'project',architectureArtifact:{artifactId:'artifact:'+digest,contentDigest:digest,revision:1},requiresDesign:true},context);
 assert.equal(result.outcome,'blocked');assert.equal(result.reason.message,'PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID');assert.equal(calls,0);
});


test('actual Prism architecture boundary uses selected A/B and retained A after owner removal',async t=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const {loadCoreRuntimePolicy}=await import('../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts');
 const {canonicalJson,sha256Text}=await import('@kubeclaw/plugin-sdk');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prism-architecture-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'core.json'),value={schema:'architecture.test.v1',projectId:'project'},bytes=canonicalJson(value),sizeBytes=Buffer.byteLength(bytes),digest=sha256Text(bytes);
 const task={agent:'prism',target:'operators',issuerId:'release',timeoutMinutes:5};
 const publish=n=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,prismDesignBudgets:{...TEST_CORE_POLICY.prismDesignBudgets,maximumArchitectureBytes:n}}}}}));
 const select=()=>selectedStageConfiguration('kubeclaw.design.prism',task,undefined,loadCoreRuntimePolicy({file,profile:'selected'}).prismDesignBudgets);
 publish(sizeBytes);const a=select();publish(sizeBytes-1);const b=select();
 const artifact={artifactId:'artifact:'+digest,digest,namespace:'test',mediaType:'application/json',sizeBytes,producer:{runId:'prism:boundary'}};
 const run=async selected=>{
  const calls=[];
  const context={contract:{lease:{attempt:{runId:'prism:boundary'}},config:selected},artifact:()=>artifact,invoke:async capability=>{calls.push(capability);if(capability==='artifacts.read')return {artifact,digest,sizeBytes,value};throw new Error('TEST_DISPATCH_BOUNDARY');}};
  const result=await execute({runId:'ignored',projectId:'project',architectureArtifact:{artifactId:artifact.artifactId,contentDigest:digest,revision:1},requiresDesign:true},context);
  assert.equal(result.outcome,'blocked');return {calls,message:result.reason.message};
 };
 const accepted={calls:['artifacts.read','runtime.dispatch'],message:'TEST_DISPATCH_BOUNDARY'};
 assert.deepEqual(await run(a),accepted);
 assert.deepEqual(await run(b),{calls:[],message:'PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID'});
 fs.unlinkSync(file);assert.deepEqual(await run(a),accepted);assert.throws(select,/ENOENT/);
 publish(sizeBytes);assert.deepEqual(await run(select()),accepted);
});
