import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runPipelineV2,resumePipelineV2} from '../../../skills/nova/core/src/index.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {FileJournal} from '../../../skills/nova/core/state/journal.ts';
import {projectSourceFixture} from './project-source-fixture.mjs';

async function scenario(options, check) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-source-'));let fixture;
  try{fixture=await projectSourceFixture(root,options);await check(fixture);}
  finally{await fixture?.close();fs.rmSync(root,{recursive:true,force:true});}
}

for(const review of [false,true])test(`compiled source prefix uses original Git and implementation consumers; architecture agent enabled=${review}`,async()=>{
  await scenario({review},async f=>{
    const result=await runPipelineV2(f.platform,f.definition,f.runId);
    assert.equal(result.status,'succeeded');
    assert.equal(f.messages.length,0,'clean optional review needs no approval request');
    const architects=f.dispatches.filter(item=>item.protocol==='kubeclaw.architecture-validation.v2');
    assert.equal(architects.length,review?1:0);
    if(review){
      assert.equal(architects[0].reviewSubject.inputDigest,f.compiled.definition.stages.find(stage=>stage.id==='blueprint-sync').input.sourceBinding.inputDigest);
      assert.match(JSON.stringify(architects[0].architecture),/api-exists/u,'reviewer receives actual bound requirement policy, not only its digest');
      assert.deepEqual(architects[0].reviewSubject.paths,['architecture.md','modules/api/FORGE.md','modules/ui/FORGE.md','plan.json']);
    }
    assert.equal(f.dispatches.filter(item=>item.protocol==='kubeclaw.implementation.v2').length,2);
    assert.match(fs.readFileSync(path.join(f.repository,'api.mjs'),'utf8'),/answer = 42/u);
    assert.match(fs.readFileSync(path.join(f.repository,'ui.mjs'),'utf8'),/answer = 42/u);
    assert.equal(f.git('status','--porcelain'),'');
    assert.equal(f.git('rev-list','--first-parent','--count',`${f.sourceRevision}..HEAD`),'3','one Blueprint sync plus two actual module commits');
  });
});

test('mandatory source failure prevents enabled architecture review, sync and implementation',async()=>{
  await scenario({invalid:true,review:true},async f=>{
    const result=await runPipelineV2(f.platform,f.definition,f.runId);
    assert.notEqual(result.status,'succeeded');assert.equal(f.dispatches.length,0);
    assert.equal(f.git('rev-parse','HEAD'),f.sourceRevision);
    assert.equal(fs.existsSync(path.join(f.repository,'modules/api/FORGE.md')),false);
  });
});

for(const boundary of ['missing-producer','wrong-contract'])test(`source admission rejects ${boundary} before Git sync`,async()=>{
  await scenario({},async f=>{
    const sync=f.definition.stages.find(stage=>stage.id==='blueprint-sync');
    sync.input.sourceBinding={...sync.input.sourceBinding,...(boundary==='missing-producer'?{stageId:'absent-source-stage'}:{inputDigest:`sha256:${'f'.repeat(64)}`})};
    const result=await runPipelineV2(f.platform,f.definition,f.runId);
    assert.notEqual(result.status,'succeeded');assert.equal(f.dispatches.length,0);
    assert.equal(f.git('rev-parse','HEAD'),f.sourceRevision);
  });
});

test('actual external source change after admission rejects original Git merge',async()=>{
  await scenario({},async f=>{
    f.hooks.implementation=()=>{fs.writeFileSync(path.join(f.repository,'unexpected.txt'),'external source change');f.git('add','.');f.git('commit','-qm','External source change');};
    const result=await runPipelineV2(f.platform,f.definition,f.runId);
    assert.notEqual(result.status,'succeeded');assert.equal(f.dispatches.length,1);
    assert.equal(fs.existsSync(path.join(f.repository,'api.mjs')),false);
  });
});

test('implementation independently requires the admitted producer after a genuine Blueprint sync',async()=>{
  await scenario({},async f=>{
    const implementation=f.definition.stages.find(stage=>stage.id==='implement-api');
    implementation.input.sourceBinding={...implementation.input.sourceBinding,stageId:'absent-source-stage'};
    const result=await runPipelineV2(f.platform,f.definition,f.runId);
    assert.notEqual(result.status,'succeeded');assert.equal(f.dispatches.length,0);
    assert.equal(fs.existsSync(path.join(f.repository,'modules/api/FORGE.md')),true,'original sync actually completed');
    assert.equal(fs.existsSync(path.join(f.repository,'api.mjs')),false);
  });
});

for(const mutate of [false,true])test(`compiled findings require bound operator approval before Git sync; source changes=${mutate}`,async()=>{
  await scenario({review:true,clean:false},async f=>{
    const paused=await runPipelineV2(f.platform,f.definition,f.runId);
    const waitingRecords=new FileJournal(path.join(runRoot(f.platform.storageRoot,f.runId),'events.jsonl')).records();
    assert.equal(paused.status,'waiting',JSON.stringify({stages:[...paused.stages],reasons:waitingRecords.map(({entry})=>entry.payload?.reason).filter(Boolean)}));
    assert.equal(f.messages.length,1,'original operator adapter delivered the approval request to localhost');
    assert.equal(f.dispatches.length,1,'only the bound architecture review ran');
    assert.equal(f.dispatches[0].protocol,'kubeclaw.architecture-validation.v2');
    assert.equal(f.git('rev-parse','HEAD'),f.sourceRevision,'no Blueprint sync before approval');
    assert.equal(fs.existsSync(path.join(f.repository,'modules/api/FORGE.md')),false);
    const wait=paused.stages.get('architecture-approval').wait;assert.ok(wait);
    if(mutate){
      fs.writeFileSync(path.join(f.repository,'unreviewed.txt'),'Source changed while awaiting approval');
      f.git('add','.');f.git('commit','-qm','External source movement during approval');
    }
    const signal={schemaVersion:'resume-signal.v2',signalId:`signal:${wait.waitId}`,idempotencyKey:`key:${wait.waitId}`,
      waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),
      payload:{decision:'approved',issuer:wait.authorizedIssuer,reason:'Approve the exact compiled source and report.'}};
    const result=await resumePipelineV2(f.platform,f.definition,f.runId,signal);
    assert.equal(result.status,mutate?'blocked':'succeeded',JSON.stringify([...result.stages]));
    assert.equal(f.dispatches.length,mutate?1:3,'stale approval cannot reach implementation');
    if(mutate){
      const records=new FileJournal(path.join(runRoot(f.platform.storageRoot,f.runId),'events.jsonl')).records();
      assert.ok(records.some(({entry})=>String(entry.payload?.reason?.message).includes('REVIEW_SUBJECT_STALE')),'original source recheck rejected approval');
      assert.equal(fs.existsSync(path.join(f.repository,'modules/api/FORGE.md')),false,'stale source cannot sync');
      assert.equal(fs.existsSync(path.join(f.repository,'api.mjs')),false);
    }else{
      assert.match(fs.readFileSync(path.join(f.repository,'api.mjs'),'utf8'),/answer = 42/u);
      assert.match(fs.readFileSync(path.join(f.repository,'ui.mjs'),'utf8'),/answer = 42/u);
      assert.equal(f.git('rev-list','--first-parent','--count',`${f.sourceRevision}..HEAD`),'3');
      assert.equal(f.git('status','--porcelain'),'');
    }
  });
});
