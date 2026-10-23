import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {compileProject,compileProjectWithCompilerPolicyCandidate} from '../../../skills/nova/project/compiler.ts';
import {inspectProjectMembershipCandidate} from '../../../skills/nova/project/membership-candidate.ts';
import {projectSourceFixture} from './project-source-fixture.mjs';
import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {resolvedTestPlanDigest,stableTestIdentity} from '@kubeclaw/pipeline-test-gate-contract';

const policies=JSON.parse(fs.readFileSync('docs/review/evidence/config-acceptance/c0-completion-20261013/field-activation-partition-02/residual-core-owner-fixtures.corrected.json','utf8'));
async function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-membership-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const f=await projectSourceFixture(root,{review:true,clean:false});t.after(()=>f.close());return f;
}
function reviewedProject(f) {
  const project=structuredClone(f.project);
  for(const module of project.modules)module.review={agent:'architect'};
  project.final.review={agent:'architect'};return project;
}

test('actual explicit-policy producer records exact optional membership and preserves historical compiler bytes/codecs',async t=>{
  const f=await fixture(t);
  for(const review of [false,true])for(const codec of ['legacy',PORTABLE_JSON_ENCODING]) {
    const project=review?reviewedProject(f):structuredClone(f.project);
    if(!review)delete project.architecture.review;
    const policy=structuredClone(policies.profiles['local-A'].settings.projectCompiler);
    if(!review)policy.reviewRepair={mode:'disabled'}; // Test policy vector, never installed authority.
    const original=compileProject(project,codec,codec), candidate=compileProjectWithCompilerPolicyCandidate(project,policy,codec,codec);
    assert.deepEqual(candidate.definition,original.definition);assert.equal(candidate.runId,original.runId);
    assert.equal(Object.hasOwn(original,'membershipCandidate'),false);
    const membership=candidate.membershipCandidate;
    assert.deepEqual(membership.groups.map(g=>[g.groupId,g.kind]),[['foundation','foundation'],['module:api','implementation'],['module:ui','implementation'],['integration','integration'],['delivery','delivery']]);
    const all=membership.groups.flatMap(g=>g.stages.map(s=>s.stageId));
    assert.equal(new Set(all).size,all.length);
    assert.deepEqual(all,[...candidate.definition.stages.map(s=>s.id)]);
    assert.equal(all.includes('architecture-approval'),review);assert.equal(all.includes('review-api'),review);assert.equal(all.includes('final-review'),review);
    assert.deepEqual(membership.groups.at(-1).stages.map(s=>s.stageId),['project-summary']);
    assert.equal(membership.graph.schemaVersion,'execution-graph-snapshot.v3');
    for(const key of ['registrationOwnerVerified','sourceIdentityVerified','taskAuthorizationVerified','originalRunAuthorizationVerified','callerAuthorizationVerified','originalAuthorizationVerified','activationAllowed'])assert.equal(membership[key],false);
    assert.equal(Object.isFrozen(membership.groups[1].stages[0]),true);
    assert.deepEqual(compileProject(project,codec,codec),original);
  }
});

test('candidate receiver rejects missing/duplicate/foreign/type/input/group and repair mutations, then accepts untouched producer',async t=>{
  const f=await fixture(t),project=reviewedProject(f),policy=policies.profiles['local-A'].settings.projectCompiler;
  const candidate=compileProjectWithCompilerPolicyCandidate(project,policy),original=candidate.membershipCandidate;
  const inspect=groups=>inspectProjectMembershipCandidate(candidate.definition,groups);
  for(const mutate of [
    groups=>groups[1].stages.pop(),
    groups=>groups[1].stages.push(structuredClone(groups[1].stages[0])),
    groups=>{groups[1].stages[0].stageId='foreign';},
    groups=>{groups[1].stages[0].stageType='foreign.owner';},
    groups=>{groups[1].stages[0].taskInputSha256='sha256:'+'0'.repeat(64);},
    groups=>{groups[1].groupId=groups[0].groupId;},
    groups=>{groups[1].kind='invented';},
    groups=>{groups[2].stages.push(groups[1].stages.splice(1,1)[0]);},
  ]) {
    const changed=structuredClone(original.groups);mutate(changed);assert.throws(()=>inspect(changed));
  }
  const changedGraph=structuredClone(candidate.definition);changedGraph.stages[0].input={foreign:true};
  assert.throws(()=>inspectProjectMembershipCandidate(changedGraph,original.groups),/STAGE_IDENTITY_MISMATCH/);
  const cyclic=structuredClone(candidate.definition);cyclic.stages[0].dependsOn=[cyclic.stages.at(-1).id];
  assert.throws(()=>inspectProjectMembershipCandidate(cyclic,original.groups),/GRAPH_CYCLE/);
  assert.deepEqual(inspect(original.groups),original);
});

test('actual optional demo triple remains delivery; its source-bound inputs do not become reloadable policy',async t=>{
  const f=await fixture(t),project=reviewedProject(f),plan=project.final.test.providerPlan.plan,template=plan.nodes[0];
  // Contract vectors for compiler graph checks ONLY: no native fixture/provider execution or grants.
  const node=(id,packageId,kind,values={})=>({...structuredClone(template),id,testIdentity:stableTestIdentity({project:plan.project,moduleId:null,gateId:plan.scope.gateId,suiteInstanceId:null,nodeId:id,variation:{}}),executionId:`execution:${id}`,kind,mode:kind==='test'?'blocking':null,provider:{...template.provider,packageId,contractId:`${packageId}@1`},configuration:{...template.configuration,contractId:`${packageId}@1`,values},dependencies:[]});
  plan.nodes=[node('assertion','kubeclaw.demo-auth-smoke','test',{protocol:'json-session.v1'}),node('build','kubeclaw.container-build','test'),node('manifest','kubeclaw.direct-command','test'),node('deployment','kubeclaw.kubernetes-fixture','fixture'),node('exposure','kubeclaw.tailscale-exposure','fixture',{retentionMode:'await-readiness'})];
  const value=(from,output,to,input,schemaId)=>({schemaVersion:'typed-link.v1',kind:'value',from:{nodeId:from,output},to:{nodeId:to,input},schemaId});
  plan.links=[value('deployment','deployment','assertion','deployment','kubeclaw.kubernetes-deployment-fixture@1'),value('deployment','demo-credentials','assertion','credentials','kubeclaw.generated-demo-credentials@1'),value('exposure','exposure','assertion','exposure','kubeclaw.public-endpoint-fixture@1'),value('deployment','deployment','exposure','deployment','kubeclaw.kubernetes-deployment-fixture@1'),value('build','image','deployment','image','kubeclaw.container-image@1'),{schemaVersion:'typed-link.v1',kind:'artifact',from:{nodeId:'manifest',output:'artifact-1'},to:{nodeId:'deployment',input:'checked-manifest'},mediaType:'application/vnd.kubeclaw.checked-kubernetes-yaml'}];
  const {planDigest,...unsigned}=plan;plan.planDigest=resolvedTestPlanDigest(unsigned);
  project.demo={authNodeId:'assertion',protocol:'json-session.v1',operatorTarget:'operators',retentionSeconds:604800};
  const policy=policies.profiles['local-A'].settings.projectCompiler;
  const result=compileProjectWithCompilerPolicyCandidate(project,policy),delivery=result.membershipCandidate.groups.at(-1);
  assert.deepEqual(delivery.stages.map(s=>s.stageId),['project-summary','demo-candidate','demo-delivery','demo-ready']);
  assert.deepEqual(result.definition,compileProject(project).definition);
  const changed=structuredClone(project);changed.demo.retentionSeconds=1209600;
  const other=compileProjectWithCompilerPolicyCandidate(changed,policy);
  assert.notEqual(other.membershipCandidate.graph.digest,result.membershipCandidate.graph.digest);
  assert.notEqual(other.membershipCandidate.groups[0].stages[0].taskInputSha256,result.membershipCandidate.groups[0].stages[0].taskInputSha256);
  assert.notEqual(other.membershipCandidate.groups.at(-1).stages[1].taskInputSha256,delivery.stages[1].taskInputSha256);
  assert.equal(other.activationAllowed,false);
});
