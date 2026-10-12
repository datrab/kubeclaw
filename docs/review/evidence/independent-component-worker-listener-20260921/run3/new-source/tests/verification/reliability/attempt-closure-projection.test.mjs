import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {workerAttemptResultDigest} from '../../../contracts/pipeline-worker-core/v1/src/index.ts';
import {withRunMutationLock} from '../../../skills/nova/core/execution/run-mutation.ts';
import {test} from 'node:test';
import {projectionFixture} from './attempt-retirement-fixture.mjs';
import {retireAttemptResult} from '../../../scripts/retire-attempt-result.mjs';
import {retireAttemptClosure,planAttemptClosure} from '../../../scripts/retire-attempt-closure.mjs';
import {attemptStoreDigest} from '../../../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
import {FileDurableAttemptStore,createProducerClosure} from '../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {canonicalJson} from '../../../contracts/pipeline-observability/v1/src/index.ts';
import {retireAdmission} from '../../../scripts/retire-admission.mjs';
import {buildClawDeckObservationView} from '../../../skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts';

export async function closureFixture(t,failures={}) {
  const f=await projectionFixture(t,failures),file=path.join(f.scope.attemptRoot,'attempt-store.json');
  f.projectionScope.attemptLimits={...f.limits,maximumClosures:1};
  if(!Object.keys(failures).length)await retireAttemptResult(f.projectionScope);
  const scope={...f.projectionScope,schemaVersion:'attempt-closure-retirement-scope.v1',action:'compact-imported-closure',
    intent:{...f.projectionScope.intent,operationId:'closure:one',closureDigest:f.closure.closureDigest,expectedStoreDigest:attemptStoreDigest(fs.readFileSync(file))}};
  return {...f,file,closureScope:scope,limits:scope.attemptLimits};
}

test('closure projection frees actual resident quota and net bytes while all original consumers retain full identities',async t=>{
  const f=await closureFixture(t),store=new FileDurableAttemptStore(f.scope.attemptRoot,f.limits);
  const prior=await store.snapshot(),before=fs.readFileSync(f.file),journal=fs.readFileSync(f.imported.journalFile);
  const next=createProducerClosure({...f.closure,closureId:'closure:waiting',pipelineRunId:'run:waiting',producer:f.other.producer,requiredEvidenceIds:[]});
  await assert.rejects(store.storeClosure(next,f.admission),/CLOSURE_STORE_FULL/);
  const view=await buildClawDeckObservationView({pipelineRunId:f.runId,requiredClosures:f.imported.desired.requiredClosures,admissionStore:f.admission,attemptStore:store});
  await retireAdmission(f.scope);
  const result=await retireAttemptClosure(f.closureScope);
  assert.equal(result.newlyRetired,true);assert.ok(result.releasedBytes>0);
  assert.equal(result.releasedBytes,before.length-fs.statSync(f.file).size);
  const raw=JSON.parse(fs.readFileSync(f.file));assert.equal(raw.schemaVersion,'durable-attempt-store.v3');
  assert.equal(raw.closures[0].schemaVersion,'attempt-closure-reference.v1');
  assert.deepEqual(raw.results[0].completionIntent,prior.results[0].completionIntent);
  assert.deepEqual(await store.snapshot(),prior);
  await store.storeClosure(next,f.admission);
  assert.equal((await store.snapshot()).closures.length,2);
  await assert.rejects(store.storeClosure(createProducerClosure({...next,closureId:'closure:full'}),f.admission),/CLOSURE_STORE_FULL/);
  await store.resumeCompletion(f.runId,f.result.attemptId,1,f.admission);
  assert.deepEqual(await store.storeClosure(f.closure,f.admission),f.closure);
  assert.deepEqual(await retireAttemptClosure(f.closureScope),{newlyRetired:false,releasedBytes:0});
  assert.equal((await f.admission.admit(canonicalJson(f.record))).acknowledgement.state,'duplicate');
  assert.equal((await f.imported.reconciler.reconcile([f.imported.desired]))[0].action,'already-imported');
  assert.deepEqual(fs.readFileSync(f.imported.journalFile),journal);
  const afterView=await buildClawDeckObservationView({pipelineRunId:f.runId,requiredClosures:f.imported.desired.requiredClosures,admissionStore:f.admission,attemptStore:store});
  assert.deepEqual({...afterView,completeness:{...afterView.completeness,evaluatedAt:view.completeness.evaluatedAt}},view);
  t.diagnostic(JSON.stringify({releasedClosures:1,releasedBytes:result.releasedBytes,logicalClosures:2,residentLimit:1}));
});

test('read-only plan and actual CLI apply agree; finalization, changed intent and bounded metadata remain enforced',async t=>{
  const f=await closureFixture(t),before=fs.readFileSync(f.file),plan=planAttemptClosure(f.closureScope);
  assert.deepEqual(fs.readFileSync(f.file),before);assert.equal(plan.advisory,true);assert.equal(plan.releasedClosures,1);
  const scopeFile=path.join(f.root,'closure-scope.json');fs.writeFileSync(scopeFile,JSON.stringify(f.closureScope));
  const planned=JSON.parse(execFileSync(process.execPath,['scripts/retire-attempt-closure.mjs','--plan',scopeFile],{encoding:'utf8'}));
  assert.deepEqual(planned,plan);
  const applied=JSON.parse(execFileSync(process.execPath,['scripts/retire-attempt-closure.mjs','--apply',scopeFile],{encoding:'utf8'}));
  assert.equal(applied.releasedBytes,plan.releasedBytes);assert.equal(applied.releasedClosures,1);
  const store=new FileDurableAttemptStore(f.scope.attemptRoot,f.limits),higher=structuredClone(f.result);
  higher.claimGeneration=2;higher.claimId='claim:1:2';higher.evidence=[];higher.resultDigest=workerAttemptResultDigest(higher);
  await assert.rejects(store.storeResult(f.runId,higher,null,{planId:'plan:1',nodeId:'node:1'}),/ATTEMPT_ALREADY_COMPLETED/);
  await assert.rejects(retireAttemptClosure({...f.closureScope,intent:{...f.closureScope.intent,actor:'other'}}),/RETIREMENT_CONFLICT/);
  assert.equal(planAttemptClosure(f.closureScope).releasedBytes,0);
  const saved=fs.readFileSync(f.file),maximumMetadataBytes=Math.max(saved.length,fs.statSync(f.imported.journalFile).size)+256;
  const tight=new FileDurableAttemptStore(f.scope.attemptRoot,{...f.limits,maximumMetadataBytes});
  const oversized={...higher,attemptId:'attempt:new',evidence:[],specialistResult:{...higher.specialistResult,values:{detail:'x'.repeat(maximumMetadataBytes)}}};
  oversized.resultDigest=workerAttemptResultDigest(oversized);
  await assert.rejects(tight.storeResult('run:new',oversized),/ATTEMPT_METADATA_FULL/);
  assert.deepEqual(fs.readFileSync(f.file),saved);assert.equal((await tight.snapshot()).closures.length,1);
});

test('no byte saving, stale store, source mismatch and run fence fail before mutation',async t=>{
  const f=await closureFixture(t),before=fs.readFileSync(f.file),store=new FileDurableAttemptStore(f.scope.attemptRoot,f.limits);
  for(const key of Object.keys(f.closureScope.attemptLimits)) {
    for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]) {
      const invalid={...f.closureScope,attemptLimits:{...f.closureScope.attemptLimits,[key]:value}};
      assert.throws(()=>planAttemptClosure(invalid),/SCOPE_INVALID/);await assert.rejects(retireAttemptClosure(invalid),/SCOPE_INVALID/);
    }
  }
  const largeReceipt={...f.closureScope,intent:{...f.closureScope.intent,actor:'operator:'.padEnd(512,'a')}};
  await assert.rejects(retireAttemptClosure(largeReceipt),/NOT_SMALLER/);
  assert.throws(()=>planAttemptClosure(largeReceipt),/NOT_SMALLER/);
  assert.deepEqual(fs.readFileSync(f.file),before);
  for(const change of [{expectedStoreDigest:'sha256:'.padEnd(71,'0')},{closureDigest:'sha256:'.padEnd(71,'0')},{journalSequence:2}]) {
    await assert.rejects(retireAttemptClosure({...f.closureScope,intent:{...f.closureScope.intent,...change}}));
    assert.deepEqual(fs.readFileSync(f.file),before);
  }
  await withRunMutationLock(f.run,()=>assert.rejects(retireAttemptClosure(f.closureScope),/PIPELINE_RUN_MUTATION_LOCKED/));
  await store.resumeCompletion(f.runId,f.result.attemptId,1,f.admission);
  assert.deepEqual(fs.readFileSync(f.file),before);
  assert.equal((await retireAttemptClosure(f.closureScope)).newlyRetired,true);
});

test('waiting run and absent result projection are not eligible; malformed references cannot yield successful reads or ACKs',async t=>{
  const waiting=await closureFixture(t,{lint:[1,2,3]}),waitingBytes=fs.readFileSync(waiting.file);
  await assert.rejects(retireAttemptClosure(waiting.closureScope));assert.deepEqual(fs.readFileSync(waiting.file),waitingBytes);
  const f=await closureFixture(t),store=new FileDurableAttemptStore(f.scope.attemptRoot,f.limits);
  await retireAdmission(f.scope);await retireAttemptClosure(f.closureScope);
  const original=fs.readFileSync(f.file);
  const mutations=[
    raw=>{raw.closures[0].schemaVersion='attempt-closure-reference.v99';},
    raw=>{raw.closures[0].resultKey=canonicalJson(['run:foreign',f.result.attemptId,1]);},
    raw=>{raw.closures[0].closureDigest='sha256:'.padEnd(71,'0');},
    raw=>{raw.closures.push({...raw.closures[0]});},
    raw=>{raw.closures.push(f.closure);},
    raw=>{raw.results[0].completionIntent.closure=raw.closures[0];},
    raw=>{raw.results[0].result=f.result;delete raw.results[0].resultReference;},
  ];
  for(const mutate of mutations) {
    const raw=JSON.parse(original);mutate(raw);fs.writeFileSync(f.file,canonicalJson(raw));
    const corrupt=fs.readFileSync(f.file);
    await assert.rejects(store.snapshot());await assert.rejects(f.admission.admit(canonicalJson(f.record)));
    assert.deepEqual(fs.readFileSync(f.file),corrupt);
  }
  fs.writeFileSync(f.file,original);assert.deepEqual((await store.snapshot()).closures,[f.closure]);
});

async function childAtMarker(t,code,args,marker) {
  const child=spawn(process.execPath,['--input-type=module','-e',code,...args],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`marker timeout: ${stderr}`));},15000);
    let output='';child.stdout.on('data',chunk=>{output+=chunk;if(output.includes(marker)){clearTimeout(timer);resolve();}});
    child.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error(`child ${code}/${signal}: ${stderr}`));});
  });
  return child;
}

test('actual Attempt writer fence prevents closure retirement; killing waiting operator leaves original state',async t=>{
  const f=await closureFixture(t),before=fs.readFileSync(f.file);
  const mutex=new URL('../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts',import.meta.url).href;
  const holder=await childAtMarker(t,`import {withDurableStoreLock} from ${JSON.stringify(mutex)};await withDurableStoreLock(process.argv[1],async()=>{process.stdout.write('LOCKED\\n');await new Promise(()=>{});});`,[f.file],'LOCKED');
  const module=new URL('../../../scripts/retire-attempt-closure.mjs',import.meta.url).href;
  const operator=await childAtMarker(t,`import {retireAttemptClosure} from ${JSON.stringify(module)};process.stdout.write('STARTED\\n');await retireAttemptClosure(JSON.parse(process.argv[1]));process.stdout.write('COMMITTED\\n');`,[JSON.stringify(f.closureScope)],'STARTED');
  await new Promise(resolve=>setTimeout(resolve,200));assert.equal(operator.exitCode,null);assert.deepEqual(fs.readFileSync(f.file),before);
  let exited=once(operator,'exit');operator.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);
  exited=once(holder,'exit');holder.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);
  assert.deepEqual(fs.readFileSync(f.file),before);assert.equal((await retireAttemptClosure(f.closureScope)).newlyRetired,true);
});

test('actual SIGKILL at rename boundaries and after commit reopens complete state without double release',async t=>{
  for(const boundary of ['before-rename','after-rename','after-return']) {
    const f=await closureFixture(t),before=fs.readFileSync(f.file);
    const module=new URL('../../../scripts/retire-attempt-closure.mjs',import.meta.url).href;
    const script=`import fs from 'node:fs';import {retireAttemptClosure} from ${JSON.stringify(module)};
      const scope=JSON.parse(process.argv[1]),boundary=process.argv[2],file=process.argv[3],rename=fs.renameSync;
      fs.renameSync=function(source,target){if(target===file&&boundary==='before-rename')process.kill(process.pid,'SIGKILL');rename(source,target);if(target===file&&boundary==='after-rename')process.kill(process.pid,'SIGKILL');};
      await retireAttemptClosure(scope);process.kill(process.pid,'SIGKILL');`;
    const child=spawn(process.execPath,['--input-type=module','-e',script,JSON.stringify(f.closureScope),boundary,f.file],{stdio:['ignore','ignore','pipe']});
    let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
    assert.deepEqual(await once(child,'exit'),[null,'SIGKILL'],stderr);
    if(boundary==='before-rename')assert.deepEqual(fs.readFileSync(f.file),before);
    const store=new FileDurableAttemptStore(f.scope.attemptRoot,f.limits);assert.deepEqual((await store.snapshot()).closures,[f.closure]);
    const result=await retireAttemptClosure(f.closureScope);assert.equal(result.newlyRetired,boundary==='before-rename');
    assert.deepEqual(await retireAttemptClosure(f.closureScope),{newlyRetired:false,releasedBytes:0});
    assert.equal((await f.imported.reconciler.reconcile([f.imported.desired]))[0].action,'already-imported');
  }
});
