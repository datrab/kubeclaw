import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runPipelineV2, resumePipelineV2, reopenBlockedPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { sourceApprovalFixture } from './approval-source-fixture.mjs';

const signal = wait => ({schemaVersion:'resume-signal.v2',signalId:`signal:${wait.waitId}`,idempotencyKey:`key:${wait.waitId}`,waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{decision:'approved',issuer:wait.authorizedIssuer,reason:'Approved these exact report and source bytes.'}});
test('fresh architecture approval ignores prior subject Blueprint lineage',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-renewal-'));let f;
  try{f=await sourceApprovalFixture(root);const runId='run:source-renewal';
    for(const stage of f.definition.stages)stage.execution={...stage.execution,maxAttempts:6,maxRemediationCycles:2};
    f.definition.stages.find(stage=>stage.id==='api').on={request_fix:'architecture'};
    f.platform.administrativeDecisionIssuers=[{type:'administrator',id:'admin:test'}];
    const first=await runPipelineV2(f.platform,f.definition,runId);assert.equal(first.status,'waiting');
    f.hooks.implementation=()=>{throw new Error('Transient implementation interruption before commit');};
    const blocked=await resumePipelineV2(f.platform,f.definition,runId,signal(first.stages.get('approval').wait));assert.equal(blocked.status,'blocked');assert.equal(blocked.stages.get('sync').status,'succeeded');
    delete f.hooks.implementation;
    const decision={schemaVersion:'administrative-reopen.v2',decisionId:'decision:renew',idempotencyKey:'key:renew',runId,stageId:'api',actor:{type:'administrator',id:'admin:test'},reason:{code:'test.source_renewal'},continuation:'remediation',remediationStageId:'architecture',decidedAt:new Date().toISOString()};
    const renewed=await reopenBlockedPipelineV2(f.platform,f.definition,decision,value=>value.actor);assert.equal(renewed.status,'waiting',JSON.stringify([...renewed.stages]));
    assert.notEqual(f.dispatches.filter(body=>body.reviewSubject)[1].reviewSubject.digest,f.dispatches[0].reviewSubject.digest);
    const result=await resumePipelineV2(f.platform,f.definition,runId,signal(renewed.stages.get('approval').wait));assert.equal(result.status,'succeeded',JSON.stringify([...result.stages]));
    assert.equal(fs.existsSync(path.join(f.repository,'api.mjs')),true);assert.equal(fs.existsSync(path.join(f.repository,'ui.mjs')),true);
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('review source rejects a Git symlink before architecture dispatch',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-symlink-'));let f;
  try{f=await sourceApprovalFixture(root);const target=path.join(root,'mutable-plan.json');fs.writeFileSync(target,'{"modules":["unreviewed"]}\n');
    f.git('checkout','-q','architecture');fs.unlinkSync(path.join(f.repository,'plan.json'));fs.symlinkSync(target,path.join(f.repository,'plan.json'));f.git('add','.');f.git('commit','-qm','Symlink review input');f.git('checkout','-q','main');
    const runId='run:symlink-source';const result=await runPipelineV2(f.platform,f.definition,runId);assert.equal(result.status,'blocked');assert.equal(f.dispatches.length,0);
    const events=new FileJournal(path.join(runRoot(f.platform.storageRoot,runId),'events.jsonl')).records();assert(events.some(({entry})=>String(entry.payload?.reason?.message).includes('REVIEW_SOURCE_NOT_REGULAR')));
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('approved architecture executable mode is preserved by original Blueprint sync',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-mode-'));let f;
  try{f=await sourceApprovalFixture(root,true);f.git('checkout','-q','architecture');fs.chmodSync(path.join(f.repository,'architecture.md'),0o755);f.git('add','.');f.git('commit','-qm','Reviewed executable mode');f.git('checkout','-q','main');
    const result=await runPipelineV2(f.platform,f.definition,'run:review-mode');assert.equal(result.status,'succeeded',JSON.stringify([...result.stages]));
    assert.equal(f.dispatches[0].reviewSubject.files.find(file=>file.path==='architecture.md').mode,'100755');assert.match(f.git('ls-tree','HEAD','architecture.md'),/^100755 /);
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

for (const change of ['none','source-commit','dirty-plan','architecture-ref']) test(`original architecture approval source binding: ${change}`, async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-source-')); let f;
  try {
    f=await sourceApprovalFixture(root); const runId=`run:approval-source:${change}`;
    const paused=await runPipelineV2(f.platform,f.definition,runId); assert.equal(paused.status,'waiting',JSON.stringify([...paused.stages]));
    assert.equal(f.dispatches.length,1); const subject=f.dispatches[0].reviewSubject;
    assert.equal(subject.sourceRevision,f.sourceRevision);assert.equal(subject.architectureRevision,f.architectureRevision);assert.match(subject.files.find(file=>file.path==='plan.json').content,/ui/);
    if(change==='source-commit'){fs.writeFileSync(path.join(f.repository,'unexpected.txt'),'Unreviewed source\n');f.git('add','.');f.git('commit','-qm','External source change');}
    if(change==='dirty-plan')fs.writeFileSync(path.join(f.repository,'plan.json'),'{"modules":["unexpected"]}\n');
    if(change==='architecture-ref'){f.git('checkout','-q','architecture');fs.writeFileSync(path.join(f.repository,'plan.json'),'{"modules":["different"]}\n');f.git('add','.');f.git('commit','-qm','Moved architecture');f.git('checkout','-q','main');}
    const result=await resumePipelineV2(f.platform,f.definition,runId,signal(paused.stages.get('approval').wait));
    assert.equal(result.status,change==='none'?'succeeded':'blocked',JSON.stringify([...result.stages]));
    assert.equal(f.dispatches.length,change==='none'?3:1,'stale approval must never reach Forge dispatch');
    const records=new FileJournal(path.join(runRoot(f.platform.storageRoot,runId),'events.jsonl')).records();
    const replay=recoverStageStates(f.definition,records,runId,'nova');for(const[id,state]of result.stages)assert.deepEqual(replay.get(id),state);
    if(change==='none'){
      assert.equal(fs.readFileSync(path.join(f.repository,'plan.json'),'utf8'),subject.files.find(file=>file.path==='plan.json').content);
      assert.equal(f.dispatches[1].headBefore,f.dispatches[1].workspaceReference.sourceRevision);
      assert.notEqual(f.dispatches[2].headBefore,f.dispatches[1].headBefore,'next module consumes authorized predecessor revision');
    } else assert(records.some(({entry})=>String(entry.payload?.reason?.message).match(/REVIEW_SUBJECT_STALE|REVIEW_SOURCE_DIRTY/)));
  } finally {if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

for(const boundary of ['sync','api'])test(`accepted source drift blocks at original ${boundary} admission`,async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-admission-'));let f;
  try{
    f=await sourceApprovalFixture(root);const runId=`run:admission:${boundary}`;const approval=f.definition.stages.find(stage=>stage.id==='approval');
    const consumer=f.definition.stages.find(stage=>stage.id===boundary);const previous=consumer.dependsOn;
    f.definition.stages.push({id:'pause',type:'kubeclaw.decision.human-approval',dependsOn:previous,config:approval.config,execution:approval.execution,input:{summary:'Pause after approval to inspect admission.'}});consumer.dependsOn=['pause'];
    f.platform.grants['kubeclaw.human-approval:approval']={'operator.request':{allowedTargets:['operators']},'signal.wait':{allowedSignalTypes:['approval.resolved'],allowedIssuerIds:['operator:test']}};
    const first=await runPipelineV2(f.platform,f.definition,runId);assert.equal(first.status,'waiting');
    const paused=await resumePipelineV2(f.platform,f.definition,runId,signal(first.stages.get('approval').wait));assert.equal(paused.status,'waiting');assert.equal(paused.stages.get('approval').status,'succeeded');
    fs.writeFileSync(path.join(f.repository,'changed-after-approval.txt'),'Unapproved source\n');f.git('add','.');f.git('commit','-qm','Changed after accepted report');
    const result=await resumePipelineV2(f.platform,f.definition,runId,signal(paused.stages.get('pause').wait));assert.equal(result.status,'blocked');assert.equal(f.dispatches.length,1,'no implementation dispatch after stale accepted authority');
    const events=new FileJournal(path.join(runRoot(f.platform.storageRoot,runId),'events.jsonl')).records();assert(events.some(({entry})=>entry.identity?.stageId===boundary&&String(entry.payload?.reason?.message).includes('REVIEW_SUBJECT_STALE')));
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('clean bound report supports skipped approval and real pinned implementation',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-clean-'));let f;
  try{f=await sourceApprovalFixture(root,true);f.definition.stages.find(stage=>stage.id==='approval').activation={sourceStage:'architecture',fact:'architecture.review',equals:'approval_required'};
    const result=await runPipelineV2(f.platform,f.definition,'run:clean');assert.equal(result.status,'succeeded');assert.equal(result.stages.get('approval').status,'skipped');assert.equal(f.messages.length,0);assert.equal(f.dispatches.length,3);
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('source-less report can be reported but cannot authorize Blueprint or Forge',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-unbound-'));let f;
  try{f=await sourceApprovalFixture(root);delete f.definition.stages.find(stage=>stage.id==='architecture').input.source;
    const first=await runPipelineV2(f.platform,f.definition,'run:unbound');assert.equal(first.status,'waiting');
    const result=await resumePipelineV2(f.platform,f.definition,'run:unbound',signal(first.stages.get('approval').wait));assert.equal(result.status,'blocked');assert.equal(f.dispatches.length,1);
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('external source commit during real implementation dispatch cannot become approved lineage',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-merge-'));let f;
  try{f=await sourceApprovalFixture(root);const runId='run:merge-drift';const first=await runPipelineV2(f.platform,f.definition,runId);assert.equal(first.status,'waiting');
    f.hooks.implementation=()=>{fs.writeFileSync(path.join(f.repository,'external.txt'),'Unapproved concurrent commit\n');f.git('add','.');f.git('commit','-qm','External write during Forge');};
    const result=await resumePipelineV2(f.platform,f.definition,runId,signal(first.stages.get('approval').wait));assert.equal(result.status,'blocked');assert.equal(result.stages.get('api').status,'blocked');assert.equal(f.dispatches.length,2);
    assert.equal(fs.existsSync(path.join(f.repository,'api.mjs')),false,'unreviewed main HEAD must prevent merge');
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('external worktree commit during Forge cannot enter approved source lineage',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'approval-worktree-'));let f;
  try{f=await sourceApprovalFixture(root);const runId='run:worktree-drift';const first=await runPipelineV2(f.platform,f.definition,runId);assert.equal(first.status,'waiting');
    f.hooks.implementation=body=>{const workspace=body.workspaceReference.workspacePath;fs.writeFileSync(path.join(workspace,'external-worktree.txt'),'Unapproved worktree commit\n');
      execFileSync('git',['-C',workspace,'add','external-worktree.txt']);execFileSync('git',['-C',workspace,'commit','-qm','External worktree source movement']);};
    const result=await resumePipelineV2(f.platform,f.definition,runId,signal(first.stages.get('approval').wait));assert.equal(result.status,'blocked');assert.equal(result.stages.get('api').status,'blocked');assert.equal(f.dispatches.length,2);
    assert.equal(fs.existsSync(path.join(f.repository,'external-worktree.txt')),false);assert.equal(fs.existsSync(path.join(f.repository,'api.mjs')),false);
    const events=new FileJournal(path.join(runRoot(f.platform.storageRoot,runId),'events.jsonl')).records();assert(events.some(({entry})=>String(entry.payload?.reason?.message).includes('GIT_WORKSPACE_SOURCE_MOVED')));
  }finally{if(f)await f.close();fs.rmSync(root,{recursive:true,force:true});}
});
