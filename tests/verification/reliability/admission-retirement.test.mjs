import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import {runPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {budgetFixture} from './repair-budget-fixture.mjs';
import {admissionLimits,attemptLimits,resultFor,fixture,importCompletion,projectionFixture} from './attempt-retirement-fixture.mjs';
export {projectionFixture} from './attempt-retirement-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {workerAttemptResultDigest} from '../../../contracts/pipeline-worker-core/v1/src/index.ts';
import {producerRecordDigest,canonicalJson} from '../../../contracts/pipeline-observability/v1/src/index.ts';
import {FileDurableAttemptStore} from '../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {FileObservabilityAdmissionStore,FileProducerOutbox,deliverPending} from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';
import {buildClawDeckObservationView} from '../../../skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts';
import {retireAdmission} from '../../../scripts/retire-admission.mjs';
import {NovaObservabilityReconciler} from '../../../skills/nova/core/observability/reconciler.ts';
import {retireAttemptResult} from '../../../scripts/retire-attempt-result.mjs';
import {attemptStoreDigest} from '../../../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
import {planRetirement} from '../../../scripts/observability-retirement-plan.mjs';
test('original disk quota releases one completion copy while all raw, ACK, result and evidence consumers replay exactly',async t=>{
  const f=await fixture(t),file=path.join(f.scope.admissionRoot,'admission.json');
  const prior=fs.readFileSync(file),source=fs.readFileSync(path.join(f.scope.attemptRoot,'attempt-store.json'));
  assert.equal(JSON.parse(prior).schemaVersion,'observability-admission-store.v1');
  const before=await f.admission.admittedRecords();
  const freshUnsigned={...f.other,recordId:'new',sequence:2};delete freshUnsigned.recordDigest;
  const fresh={...freshUnsigned,recordDigest:producerRecordDigest(freshUnsigned)};
  await assert.rejects(f.admission.admit(canonicalJson(fresh)),/ADMISSION_FULL/);
  const receipt=await retireAdmission(f.scope);
  assert.equal(receipt.newlyRetired,true);assert.equal(receipt.releasedBytes,prior.length-fs.statSync(file).size);assert.ok(receipt.releasedBytes>0);
  const reopened=new FileObservabilityAdmissionStore(f.scope.admissionRoot,admissionLimits);
  assert.deepEqual(await reopened.admittedRecords(),before);
  assert.deepEqual(fs.readFileSync(path.join(f.scope.attemptRoot,'attempt-store.json')),source);
  assert.equal((await reopened.admit(canonicalJson(f.record))).acknowledgement.state,'duplicate');
  const tight=new FileObservabilityAdmissionStore(f.scope.admissionRoot,{...admissionLimits,maximumRecords:100,maximumBytes:fs.statSync(file).size+1024});
  await assert.rejects(tight.admit(canonicalJson(fresh)),/ADMISSION_FULL/);
  assert.equal((await reopened.admit(canonicalJson(fresh))).acknowledgement.canonicalCursor,3);
  assert.deepEqual(await retireAdmission(f.scope),{newlyRetired:false,releasedBytes:0});
  const view=await buildClawDeckObservationView({pipelineRunId:f.runId,requiredClosures:[{closureId:f.closure.closureId,producer:f.closure.producer}],admissionStore:reopened,attemptStore:f.attempts});
  assert.equal(view.completeness.state,'complete');assert.deepEqual(view.rawRecords.map(item=>item.record),[f.record]);assert.deepEqual(view.attempts[0].result,f.result);
  await f.attempts.resumeCompletion(f.runId,f.result.attemptId,1,reopened);
  const outbox=new FileProducerOutbox(path.join(f.root,'replayed-outbox'),{maximumRecords:10,maximumBytes:50000});
  await outbox.append(f.record);assert.equal(await deliverPending(outbox,reopened),1);assert.deepEqual(await outbox.pending(),[]);
  assert.equal((await reopened.snapshot()).entries.length,2);assert.equal((await reopened.snapshot()).retiredEntries.length,1);
  const changed={...f.record,payload:{different:true}};changed.recordDigest=producerRecordDigest(changed);
  await assert.rejects(reopened.admit(canonicalJson(changed)),/IDENTITY_CONFLICT/);
});
test('missing or changed original completion cannot appear as an empty successful raw tail',async t=>{
  const f=await fixture(t);await retireAdmission(f.scope);
  const file=path.join(f.scope.attemptRoot,'attempt-store.json'),original=fs.readFileSync(file),state=JSON.parse(original);
  state.results[0].planId='foreign-plan';fs.writeFileSync(file,canonicalJson(state));
  await assert.rejects(f.admission.admittedTail(f.runId,1),/retirement-source-result/);
  await assert.rejects(f.admission.admit(canonicalJson(f.record)),/retirement-source-result/);
  fs.unlinkSync(file);await assert.rejects(f.admission.admittedRecords(),/ENOENT/);
  // A broken source fails closed before ACK; the producer must retain its original outbox.
  await assert.rejects(f.admission.admit(canonicalJson(f.record)),/ENOENT/);
  const outbox=new FileProducerOutbox(path.join(f.root,'unconfirmed-outbox'),{maximumRecords:10,maximumBytes:50000});
  await outbox.append(f.record);await assert.rejects(deliverPending(outbox,f.admission),/ENOENT/);assert.equal((await outbox.pending()).length,1);
  fs.writeFileSync(file,original);assert.equal((await f.admission.admittedTail(f.runId,1)).length,1);
});
test('run fence authority, evidence completion, operation identity and missing closure fail closed before mutation',async t=>{
  const f=await fixture(t),file=path.join(f.scope.admissionRoot,'admission.json'),original=fs.readFileSync(file);
  await assert.rejects(retireAdmission({...f.scope,expectedJournalHead:'sha256:'+'0'.repeat(64)}),/RUN_CHANGED/);
  await assert.rejects(retireAdmission({...f.scope,attemptId:'foreign'}),/COMPLETION_REQUIRED/);
  const foreign=path.join(f.root,'foreign-attempts');fs.cpSync(f.scope.attemptRoot,foreign,{recursive:true});
  await assert.rejects(retireAdmission({...f.scope,attemptRoot:foreign}),/FOREIGN_SOURCE/);
  const evidenceFile=new URL(f.evidence.artifact.storageUrl),bytes=fs.readFileSync(evidenceFile);fs.writeFileSync(evidenceFile,'corrupt');
  await assert.rejects(retireAdmission(f.scope),/EVIDENCE_CHANGED/);fs.writeFileSync(evidenceFile,bytes);
  assert.deepEqual(fs.readFileSync(file),original);
  const attemptFile=path.join(f.scope.attemptRoot,'attempt-store.json'),source=fs.readFileSync(attemptFile),state=JSON.parse(source);
  state.closures=[];fs.writeFileSync(attemptFile,canonicalJson(state));await assert.rejects(retireAdmission(f.scope),/CLOSURE_REQUIRED/);fs.writeFileSync(attemptFile,source);
  await retireAdmission(f.scope);await assert.rejects(retireAdmission({...f.scope,actor:'changed'}),/OPERATION_CONFLICT/);
});
test('actual waiting continuation remains protected and old v1 admission reopens unchanged',async t=>{
  const f=await fixture(t,{lint:[1,2,3]}),file=path.join(f.scope.admissionRoot,'admission.json'),before=fs.readFileSync(file);
  await assert.rejects(retireAdmission(f.scope),/RUN_ACTIVE_OR_WAITING/);
  assert.deepEqual((await new FileObservabilityAdmissionStore(f.scope.admissionRoot,admissionLimits).admittedRecords()).map(item=>item.record),[f.record,f.other]);
  assert.deepEqual(fs.readFileSync(file),before);
});
test('original attempt writer fence prevents cross-store retirement until holder is SIGKILLed',async t=>{
  const f=await fixture(t),file=path.join(f.scope.admissionRoot,'admission.json'),before=fs.readFileSync(file);
  const script=`import {withDurableStoreLock} from ${JSON.stringify(new URL('../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts',import.meta.url).href)};await withDurableStoreLock(${JSON.stringify(path.join(f.scope.attemptRoot,'attempt-store.json'))},async()=>{process.stdout.write('LOCKED\\n');await new Promise(()=>{});});`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const exited=once(child,'exit');assert.equal(String((await once(child.stdout,'data'))[0]),'LOCKED\n');
  let settled=false;const retirement=retireAdmission(f.scope).finally(()=>{settled=true;});
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false);assert.deepEqual(fs.readFileSync(file),before);
  child.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);assert.equal((await retirement).newlyRetired,true);
});
test('actual process SIGKILL after commit reopens with original cursor and no reinsertion',async t=>{
  const f=await fixture(t),scopeFile=path.join(f.root,'scope.json');fs.writeFileSync(scopeFile,JSON.stringify(f.scope));
  const script=`import fs from 'node:fs';import {retireAdmission} from ${JSON.stringify(new URL('../../../scripts/retire-admission.mjs',import.meta.url).href)};await retireAdmission(JSON.parse(fs.readFileSync(process.argv[1])));process.stdout.write('COMMITTED\\n');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,scopeFile],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  await new Promise((resolve,reject)=>{child.stdout.once('data',chunk=>String(chunk).includes('COMMITTED')?resolve():reject(new Error(String(chunk))));child.once('exit',code=>reject(new Error(`child ${code}: ${stderr}`)));});
  const exited=once(child,'exit');child.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);
  assert.deepEqual(await retireAdmission(f.scope),{newlyRetired:false,releasedBytes:0});
  const reopen=new FileObservabilityAdmissionStore(f.scope.admissionRoot,admissionLimits),before=fs.readFileSync(path.join(f.scope.admissionRoot,'admission.json'));
  assert.equal((await reopen.admit(canonicalJson(f.record))).acknowledgement.canonicalCursor,1);
  assert.deepEqual(fs.readFileSync(path.join(f.scope.admissionRoot,'admission.json')),before);
  assert.equal((await reopen.admittedTail(f.runId,1))[0].record.recordDigest,f.record.recordDigest);
});

test('retirement rejects actual FIFO, final symlink and oversized evidence before bounded allocation or mutation',async t=>{
  const f=await fixture(t),evidenceFile=new URL(f.evidence.artifact.storageUrl),filename=decodeURIComponent(evidenceFile.pathname),bytes=fs.readFileSync(evidenceFile);
  const file=path.join(f.scope.admissionRoot,'admission.json'),before=fs.readFileSync(file);
  const compact=()=>f.attempts.retireAdmissionCompletion(f.admission,{pipelineRunId:f.runId,attemptId:f.result.attemptId,claimGeneration:1,recordDigest:f.record.recordDigest,
    operationId:f.scope.operationId,actor:f.scope.actor,authority:{runRoot:f.run,journalHead:f.scope.expectedJournalHead,snapshotDigest:f.scope.expectedSnapshotDigest}},async()=>{});
  fs.unlinkSync(evidenceFile);execFileSync('mkfifo',[filename]);
  await assert.rejects(retireAdmission(f.scope),/NON_REGULAR_PATH/);
  await assert.rejects(compact(),/retirement-source-size/);
  fs.unlinkSync(evidenceFile);fs.writeFileSync(evidenceFile,Buffer.alloc(1024*1024));
  await assert.rejects(compact(),/retirement-source-size/);
  fs.unlinkSync(evidenceFile);const other=path.join(f.root,'same-evidence');fs.writeFileSync(other,bytes);fs.symlinkSync(other,filename);
  await assert.rejects(compact(),/retirement-source-path/);
  fs.unlinkSync(evidenceFile);fs.writeFileSync(evidenceFile,bytes);assert.deepEqual(fs.readFileSync(file),before);
  assert.equal((await retireAdmission(f.scope)).newlyRetired,true);
});

test('real confirmed import and admission retirement do not release the remaining mixed-run result quota', async t => {
  const f = await fixture(t);
  const limits = {...attemptLimits, maximumResults: 2};
  const attempts = new FileDurableAttemptStore(f.scope.attemptRoot, limits);
  const waitingRoot = path.join(f.root, 'actual-waiting-run');
  fs.mkdirSync(waitingRoot);
  const waiting = budgetFixture(waitingRoot, {lint: [1, 2, 3]});
  assert.equal((await runPipelineV2(waiting.platform, waiting.definition, 'run:waiting')).status, 'waiting');
  const waitingEventsFile = path.join(runRoot(waiting.platform.storageRoot, 'run:waiting'), 'events.jsonl');
  const waitingEvents = fs.readFileSync(waitingEventsFile);
  const active = resultFor(2);
  await attempts.storeResult('run:waiting', active, null, {planId: 'plan:waiting', nodeId: 'node:waiting'});
  const next = resultFor(3);
  await assert.rejects(attempts.storeResult('run:next', next), /OBSERVABILITY_RESULT_STORE_FULL/);
  const imported = await importCompletion(f, attempts);
  const sourceFile = path.join(f.scope.attemptRoot, 'attempt-store.json');
  const sourceBytes = fs.readFileSync(sourceFile);
  const journalBytes = fs.readFileSync(imported.journalFile);
  const scope = {...f.scope, attemptLimits: limits};
  const retired = await retireAdmission(scope);
  assert.equal(retired.newlyRetired, true);
  assert.ok(retired.releasedBytes > 0);
  assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
  assert.deepEqual((await attempts.snapshot()).results.map(item => item.pipelineRunId), [f.runId, 'run:waiting']);
  await assert.rejects(attempts.storeResult('run:next', next), /OBSERVABILITY_RESULT_STORE_FULL/);
  const reopened = new FileDurableAttemptStore(f.scope.attemptRoot, limits);
  const replayed = await reopened.storeResult(f.runId, f.result, {record: f.record, closure: f.closure}, {planId: 'plan:1', nodeId: 'node:1'});
  assert.deepEqual(replayed.result, f.result);
  const reconciler = new NovaObservabilityReconciler({journalAppendLockTimeoutMs: TEST_CORE_POLICY.journalAppendLockTimeoutMs,attemptStore: reopened, admissionStore: f.admission, journalFile: imported.journalFile});
  assert.equal((await reconciler.reconcile([imported.desired]))[0].action, 'already-imported');
  assert.deepEqual(fs.readFileSync(imported.journalFile), journalBytes);
  assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
  assert.deepEqual(fs.readFileSync(waitingEventsFile), waitingEvents);
  t.diagnostic(JSON.stringify({admissionBytesReleased: retired.releasedBytes, resultQuota: limits.maximumResults,
    retainedResults: 2, subsequentResultWrite: 'OBSERVABILITY_RESULT_STORE_FULL',
    realConsumerReplay: 'already-imported', journalUnchanged: true, overallFindingComplete: false}));
});

test('existing import journal is a full result checkpoint but not a replacement for the original completion and replay guards', async t => {
  const f = await fixture(t);
  const imported = await importCompletion(f);
  await retireAdmission(f.scope);
  const journalBytes = fs.readFileSync(imported.journalFile);
  const records = journalBytes.toString().trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records.length, 1);
  const entry = records[0].entry;
  assert.deepEqual(entry.decision.result, f.result);
  assert.equal(entry.decision.action, 'imported');
  assert.equal(entry.decision.completeness.state, 'complete');
  assert.equal(Object.hasOwn(entry.decision, 'completionIntent'), false);
  assert.equal(Object.hasOwn(entry.decision, 'record'), false);
  assert.equal(Object.hasOwn(entry.decision, 'closure'), false);

  // Deliberate corruption in this disposable test store proves why deleting a
  // result is not an implementation of retirement, even with a real import ACK.
  const sourceFile = path.join(f.scope.attemptRoot, 'attempt-store.json');
  const sourceBytes = fs.readFileSync(sourceFile);
  const state = JSON.parse(sourceBytes);
  state.results = [];
  fs.writeFileSync(sourceFile, canonicalJson(state));
  await assert.rejects(f.admission.admit(canonicalJson(f.record)), /retirement-source-result/);
  await assert.rejects(f.admission.admittedTail(f.runId, 1), /retirement-source-result/);
  const outbox = new FileProducerOutbox(path.join(f.root, 'result-retirement-negative-outbox'), {maximumRecords: 10, maximumBytes: 50000});
  await outbox.append(f.record);
  await assert.rejects(deliverPending(outbox, f.admission), /retirement-source-result/);
  assert.equal((await outbox.pending()).length, 1);
  assert.deepEqual(fs.readFileSync(imported.journalFile), journalBytes);

  fs.writeFileSync(sourceFile, sourceBytes);
  assert.equal(await deliverPending(outbox, f.admission), 1);
  assert.equal((await outbox.pending()).length, 0);
  assert.equal((await imported.reconciler.reconcile([imported.desired]))[0].action, 'already-imported');
  assert.deepEqual(fs.readFileSync(imported.journalFile), journalBytes);
  t.diagnostic(JSON.stringify({checkpoint: 'real NovaObservabilityReconciler import', resultBytesPresent: true,
    completionIntentPresent: false, sourceDeletion: 'fails closed; original delivery remains pending',
    sourceRestored: 'original duplicate ACK and already-imported result recover', overallFindingComplete: false}));
});

test('Attempt-v2 releases actual result quota while every original result, Admission, Clawdeck and import consumer reconstructs unchanged',async t=>{
  const f=await projectionFixture(t),file=path.join(f.scope.attemptRoot,'attempt-store.json');
  const waitingRoot=path.join(f.root,'actual-projection-waiting-run');fs.mkdirSync(waitingRoot);
  const waiting=budgetFixture(waitingRoot,{lint:[1,2,3]});
  assert.equal((await runPipelineV2(waiting.platform,waiting.definition,'run:waiting')).status,'waiting');
  const waitingEventsFile=path.join(runRoot(waiting.platform.storageRoot,'run:waiting'),'events.jsonl');
  const waitingEvents=fs.readFileSync(waitingEventsFile);
  const prior=await f.attempts.snapshot(),before=fs.readFileSync(file),journal=fs.readFileSync(f.imported.journalFile);
  const view=await buildClawDeckObservationView({pipelineRunId:f.runId,requiredClosures:f.imported.desired.requiredClosures,admissionStore:f.admission,attemptStore:f.attempts});
  await assert.rejects(f.attempts.storeResult('run:next',resultFor(3)),/RESULT_STORE_FULL/);
  await retireAdmission(f.scope);
  const receipt=await retireAttemptResult(f.projectionScope);
  assert.equal(receipt.newlyRetired,true);assert.ok(receipt.releasedBytes>0);assert.equal(receipt.releasedBytes,before.length-fs.statSync(file).size);
  const persisted=JSON.parse(fs.readFileSync(file));
  assert.equal(persisted.schemaVersion,'durable-attempt-store.v2');assert.equal(Object.hasOwn(persisted.results[0],'result'),false);
  assert.deepEqual(persisted.results[0].completionIntent,prior.results[0].completionIntent);
  const reopen=new FileDurableAttemptStore(f.scope.attemptRoot,f.limits);
  assert.deepEqual(await reopen.snapshot(),prior);
  assert.deepEqual(await retireAttemptResult(f.projectionScope),{newlyRetired:false,releasedBytes:0});
  assert.equal((await f.admission.admit(canonicalJson(f.record))).acknowledgement.state,'duplicate');
  const afterView=await buildClawDeckObservationView({pipelineRunId:f.runId,requiredClosures:f.imported.desired.requiredClosures,admissionStore:f.admission,attemptStore:reopen});
  assert.deepEqual({...afterView,completeness:{...afterView.completeness,evaluatedAt:view.completeness.evaluatedAt}},view);
  const replayed=new NovaObservabilityReconciler({journalAppendLockTimeoutMs: TEST_CORE_POLICY.journalAppendLockTimeoutMs,attemptStore:reopen,admissionStore:f.admission,journalFile:f.imported.journalFile});
  assert.equal((await replayed.reconcile([f.imported.desired]))[0].action,'already-imported');
  assert.deepEqual(fs.readFileSync(f.imported.journalFile),journal);
  await reopen.storeResult('run:next',resultFor(3));
  await assert.rejects(reopen.storeResult('run:full',resultFor(4)),/RESULT_STORE_FULL/);
  await reopen.storeEvidence({pipelineRunId:'run:waiting',attemptId:'attempt:2',claimGeneration:1,producer:{producerId:'pending',bootId:'boot',producerType:'buster'},evidenceId:'pending:evidence',type:'log',mediaType:'text/plain'},Buffer.from('retained active evidence'));
  await reopen.resumeCompletion(f.runId,f.result.attemptId,1,f.admission);
  assert.equal(JSON.parse(fs.readFileSync(file)).results[0].resultReference.schemaVersion,'attempt-result-reference.v1');
  assert.equal((await reopen.snapshot()).results.length,3);
  const changed={...f.result,summary:'changed'};changed.resultDigest=workerAttemptResultDigest(changed);
  await assert.rejects(reopen.storeResult(f.runId,changed,{record:f.record,closure:f.closure},{planId:'plan:1',nodeId:'node:1'}),/IDENTITY_MISMATCH|IDENTITY_CONFLICT/);
  const plan=planRetirement({schemaVersion:'observability-retirement-scope.v1',runId:f.runId,novaStorageRoot:f.scope.novaStorageRoot,artifactRoots:[],telemetryRoots:[],busterStores:[]});
  assert.equal(plan.observations[0].attempts.results.length,1);
  assert.equal(plan.observations[0].admission.retiredCompletions.length,1);
  assert.ok(!plan.blockers.some(item=>item.code==='STORE_OR_SCOPE_UNVERIFIED'));
  assert.deepEqual(fs.readFileSync(waitingEventsFile),waitingEvents);
  t.diagnostic(JSON.stringify({retiredResultSlots:1,releasedBytes:receipt.releasedBytes,residentLimit:2,logicalResults:3,originalImportReplay:'already-imported'}));
});

test('Attempt projection rejects stale CAS, run checkpoint and operation conflicts without touching the original state',async t=>{
  const f=await projectionFixture(t),file=path.join(f.scope.attemptRoot,'attempt-store.json'),before=fs.readFileSync(file);
  const change=changes=>({...f.projectionScope,intent:{...f.projectionScope.intent,...changes}});
  await assert.rejects(retireAttemptResult(change({expectedStoreDigest:'sha256:'+'0'.repeat(64)})),/STORE_CHANGED/);
  await assert.rejects(retireAttemptResult(change({runJournalHead:'sha256:'+'0'.repeat(64)})),/RUN_CHANGED/);
  await assert.rejects(retireAttemptResult(change({snapshotDigest:'sha256:'+'0'.repeat(64)})),/RUN_CHANGED/);
  await assert.rejects(retireAttemptResult(change({resultDigest:'sha256:'+'0'.repeat(64)})),/UNCONFIRMED/);
  await assert.rejects(retireAttemptResult(change({journalHash:'sha256:'+'0'.repeat(64)})),/journal-binding/);
  await assert.rejects(retireAttemptResult(change({journalSequence:100})),/checkpoint-missing/);
  assert.deepEqual(fs.readFileSync(file),before);
  await retireAttemptResult(f.projectionScope);
  const compacted=fs.readFileSync(file);
  await assert.rejects(retireAttemptResult(change({actor:'another-operator'})),/RETIREMENT_CONFLICT/);
  assert.deepEqual(fs.readFileSync(file),compacted);
});

test('Attempt projection preserves an actual waiting run and refuses missing, corrupted or nonregular import authority',async t=>{
  const waiting=await projectionFixture(t,{lint:[1,2,3]});
  const waitingFile=path.join(waiting.scope.attemptRoot,'attempt-store.json'),waitingBytes=fs.readFileSync(waitingFile);
  await assert.rejects(retireAttemptResult(waiting.projectionScope),/RUN_ACTIVE_OR_WAITING/);
  assert.deepEqual(fs.readFileSync(waitingFile),waitingBytes);
  const f=await projectionFixture(t),file=path.join(f.scope.attemptRoot,'attempt-store.json'),before=fs.readFileSync(file);
  const journal=f.imported.journalFile,original=fs.readFileSync(journal);
  fs.unlinkSync(journal);
  await assert.rejects(retireAttemptResult(f.projectionScope),/ENOENT/);
  fs.writeFileSync(journal,original.subarray(0,original.length-1));
  await assert.rejects(retireAttemptResult(f.projectionScope),/JOURNAL_RECORD_INCOMPLETE/);
  const changed=JSON.parse(original.toString().trim());changed.entry.decision.planId='foreign';
  fs.writeFileSync(journal,JSON.stringify(changed)+'\n');
  await assert.rejects(retireAttemptResult(f.projectionScope),/JOURNAL_HASH_INVALID/);
  fs.unlinkSync(journal);execFileSync('mkfifo',[journal]);
  await assert.rejects(retireAttemptResult(f.projectionScope),/SOURCE_REQUIRED/);
  fs.unlinkSync(journal);const other=path.join(f.root,'original-journal');fs.writeFileSync(other,original);fs.symlinkSync(other,journal);
  await assert.rejects(retireAttemptResult(f.projectionScope),/SOURCE_REQUIRED/);
  fs.unlinkSync(journal);fs.writeFileSync(journal,original);
  assert.deepEqual(fs.readFileSync(file),before);
  assert.equal((await retireAttemptResult(f.projectionScope)).newlyRetired,true);
  const compacted=fs.readFileSync(file);
  fs.unlinkSync(journal);
  await assert.rejects(new FileDurableAttemptStore(f.scope.attemptRoot,f.limits).snapshot(),/ENOENT/);
  fs.writeFileSync(journal,original.subarray(0,original.length-1));
  await assert.rejects(new FileDurableAttemptStore(f.scope.attemptRoot,f.limits).snapshot(),/journal-size/);
  assert.deepEqual(fs.readFileSync(file),compacted);
  fs.writeFileSync(journal,original);
  assert.deepEqual((await new FileDurableAttemptStore(f.scope.attemptRoot,f.limits).snapshot()).results[0].result,f.result);
});

async function childAtMarker(t,script,args,marker) {
  const child=spawn(process.execPath,['--input-type=module','-e',script,...args],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  await new Promise((resolve,reject)=>{
    let output='';
    child.stdout.on('data',chunk=>{output+=chunk;if(output.includes(marker))resolve();});
    child.once('exit',(code,signal)=>reject(new Error(`child ${code}/${signal}: ${stderr}`)));
  });
  return child;
}

test('Attempt original writer lock excludes retirement and a killed waiting operator leaves no partial projection',async t=>{
  const f=await projectionFixture(t),file=path.join(f.scope.attemptRoot,'attempt-store.json'),before=fs.readFileSync(file);
  const module=new URL('../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts',import.meta.url).href;
  const holder=await childAtMarker(t,`import {withDurableStoreLock} from ${JSON.stringify(module)};await withDurableStoreLock(process.argv[1],async()=>{process.stdout.write('LOCKED\\n');await new Promise(()=>{});});`,[file],'LOCKED');
  const scopeFile=path.join(f.root,'attempt-scope.json');fs.writeFileSync(scopeFile,JSON.stringify(f.projectionScope));
  const wrapper=new URL('../../../scripts/retire-attempt-result.mjs',import.meta.url).href;
  const operator=await childAtMarker(t,`import fs from 'node:fs';import {retireAttemptResult} from ${JSON.stringify(wrapper)};process.stdout.write('STARTED\\n');await retireAttemptResult(JSON.parse(fs.readFileSync(process.argv[1])));process.stdout.write('COMMITTED\\n');`,[scopeFile],'STARTED');
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(operator.exitCode,null);assert.deepEqual(fs.readFileSync(file),before);
  let exited=once(operator,'exit');operator.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);
  assert.deepEqual(fs.readFileSync(file),before);
  exited=once(holder,'exit');holder.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);
  assert.equal((await retireAttemptResult(f.projectionScope)).newlyRetired,true);
});

test('Attempt SIGKILL after durable projection reopens with exact original result and no duplicate import or quota reinsertion',async t=>{
  const f=await projectionFixture(t),file=path.join(f.scope.attemptRoot,'attempt-store.json');
  const scopeFile=path.join(f.root,'attempt-scope.json');fs.writeFileSync(scopeFile,JSON.stringify(f.projectionScope));
  const wrapper=new URL('../../../scripts/retire-attempt-result.mjs',import.meta.url).href;
  const child=await childAtMarker(t,`import fs from 'node:fs';import {retireAttemptResult} from ${JSON.stringify(wrapper)};await retireAttemptResult(JSON.parse(fs.readFileSync(process.argv[1])));process.stdout.write('COMMITTED\\n');setInterval(()=>{},1000);`,[scopeFile],'COMMITTED');
  const exited=once(child,'exit');child.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);
  const before=fs.readFileSync(file),journal=fs.readFileSync(f.imported.journalFile);
  assert.deepEqual(await retireAttemptResult(f.projectionScope),{newlyRetired:false,releasedBytes:0});
  const reopened=new FileDurableAttemptStore(f.scope.attemptRoot,f.limits);
  assert.deepEqual((await reopened.storeResult(f.runId,f.result,{record:f.record,closure:f.closure},{planId:'plan:1',nodeId:'node:1'})).result,f.result);
  assert.equal((await f.imported.reconciler.reconcile([f.imported.desired]))[0].action,'already-imported');
  assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(f.imported.journalFile),journal);
  await reopened.storeResult('run:next',resultFor(3));
  assert.equal((await reopened.snapshot()).results.length,3);
  assert.equal(JSON.parse(fs.readFileSync(file)).results.filter(result=>Object.hasOwn(result,'result')).length,2);
});
