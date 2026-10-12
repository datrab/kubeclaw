import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectSourceFixture} from '../../../../../tests/verification/reliability/project-source-fixture.mjs';
import {compileProject} from '../../../project/compiler.ts';
import {resolvedTestPlanDigest,stableTestIdentity} from '@kubeclaw/pipeline-test-gate-contract';

// Compiler inputs are resolved-plan contract vectors, not executed providers.
function demoProject(original) {
 const project=structuredClone(original),plan=project.final.test.providerPlan.plan,template=plan.nodes[0];
 const node=(id,packageId,kind,values={})=>({...structuredClone(template),id,testIdentity:stableTestIdentity({project:plan.project,moduleId:null,gateId:plan.scope.gateId,suiteInstanceId:null,nodeId:id,variation:{}}),executionId:`execution:${id}`,kind,mode:kind==='test'?'blocking':null,provider:{...template.provider,packageId,contractId:`${packageId}@1`},configuration:{...template.configuration,contractId:`${packageId}@1`,values},dependencies:[]});
 plan.nodes=[node('assertion','kubeclaw.demo-auth-smoke','test',{protocol:'json-session.v1'}),node('build','kubeclaw.container-build','test'),node('manifest','kubeclaw.direct-command','test'),node('deployment','kubeclaw.kubernetes-fixture','fixture'),node('exposure','kubeclaw.tailscale-exposure','fixture',{retentionMode:'await-readiness'})];
 const value=(from,output,to,input,schemaId)=>({schemaVersion:'typed-link.v1',kind:'value',from:{nodeId:from,output},to:{nodeId:to,input},schemaId});
 plan.links=[value('deployment','deployment','assertion','deployment','kubeclaw.kubernetes-deployment-fixture@1'),value('deployment','demo-credentials','assertion','credentials','kubeclaw.generated-demo-credentials@1'),value('exposure','exposure','assertion','exposure','kubeclaw.public-endpoint-fixture@1'),value('deployment','deployment','exposure','deployment','kubeclaw.kubernetes-deployment-fixture@1'),value('build','image','deployment','image','kubeclaw.container-image@1'),{schemaVersion:'typed-link.v1',kind:'artifact',from:{nodeId:'manifest',output:'artifact-1'},to:{nodeId:'deployment',input:'checked-manifest'},mediaType:'application/vnd.kubeclaw.checked-kubernetes-yaml'}];
 project.demo={authNodeId:'assertion',protocol:'json-session.v1',operatorTarget:'operators'};digest(plan);return project;
}
function digest(plan){const {planDigest,...unsigned}=plan;plan.planDigest=resolvedTestPlanDigest(unsigned);}
function binding(compiled){return compiled.definition.stages.find(stage=>stage.id==='blueprint-sync').input.sourceBinding.inputDigest;}

test('original project compiler binds normalized demo policy to source approval and final handoff',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'demo-compiler-'));let fixture;
 try {
  fixture=await projectSourceFixture(root);
  assert.equal(fixture.compiled.definition.stages.some(stage=>stage.id==='demo-ready'),false);
  const project=demoProject(fixture.project),omitted=compileProject(project);
  assert.deepEqual(omitted.definition.stages.slice(-3).map(stage=>stage.id),['demo-candidate','demo-delivery','demo-ready']);
  assert.equal(omitted.definition.stages.at(-3).input.retentionSeconds,604800);
  assert.equal(omitted.definition.stages[0].input.contract.policy.demo.retentionSeconds,604800);
  assert.equal(binding(compileProject({...project,demo:{...project.demo,retentionSeconds:604800}})),binding(omitted));
  for(const change of [{retentionSeconds:1209600},{operatorTarget:'other-operators'}]){
   const changed=compileProject({...project,demo:{...project.demo,...change}});
   assert.notEqual(binding(changed),binding(omitted));
   assert.equal(changed.definition.stages.find(stage=>stage.id==='implement-api').input.sourceBinding.inputDigest,binding(changed));
  }
  for(const retentionSeconds of [null,0,-1,0.5,9223372037,'604800'])assert.throws(()=>compileProject({...project,demo:{...project.demo,retentionSeconds}}),/PROJECT_DEMO_RETENTION_INVALID/);
  for(const mutate of [plan=>{plan.nodes[0].mode='advisory';},plan=>{plan.links=plan.links.filter(link=>link.to.input!=='checked-manifest');},plan=>{plan.nodes.find(node=>node.id==='exposure').configuration.values.retentionMode='delete';},plan=>{plan.nodes.find(node=>node.id==='build').skipReason='excluded';}]){
   const changed=structuredClone(project);mutate(changed.final.test.providerPlan.plan);digest(changed.final.test.providerPlan.plan);
   assert.throws(()=>compileProject(changed));
  }
 }finally{await fixture?.close();fs.rmSync(root,{recursive:true,force:true});}
});
