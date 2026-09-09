import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {workerAttemptResultDigest} from '../../../contracts/pipeline-worker-core/v1/src/index.ts';
import {producerRecordDigest,canonicalJson} from '../../../contracts/pipeline-observability/v1/src/index.ts';
import {FileDurableAttemptStore,createProducerClosure,scopedEvidenceId} from '../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {FileObservabilityAdmissionStore,FileProducerOutbox,deliverPending} from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';
import {buildClawDeckObservationView} from '../../../skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts';
import {retireAdmission} from '../../../scripts/retire-admission.mjs';
import {runPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {budgetFixture} from './repair-budget-fixture.mjs';
const admissionLimits={maximumIngressBytes:20000,maximumRecords:2,maximumBytes:50000,maximumQuarantineRecords:10,maximumQuarantineBytes:5000};
const attemptLimits={maximumEvidenceObjects:10,maximumEvidenceBytes:10000,maximumEvidenceObjectBytes:1000,maximumResults:10,maximumClosures:10,maximumMetadataBytes:100000,maximumPendingEvidenceAgeMs:60000};
function resultFor(index) {
  const value = {
    schemaVersion: "worker-attempt-result.v1",
    protocolVersion: "worker-protocol.v1",
    attemptId: `attempt:${index}`,
    claimId: `claim:${index}:1`,
    claimGeneration: 1,
    workerId: `worker:${index % 4}`,
    state: "completed",
    startedAt: "2026-08-09T13:59:00Z",
    completedAt: "2026-08-09T13:59:30Z",
    durationMs: 30000,
    summary: `Attempt ${index} passed.`,
    specialistResult: {
      schemaId: "test-result.v1",
      schemaDigest: "sha256:".padEnd(71, "0"),
      values: { outcome: "passed" },
    },
    error: null,
    evidence: [],
    resources: { logBytes: 0, resultBytes: 100, evidenceBytes: 0 },
    cleanup: { state: "not_required", summary: null },
    exitCode: 0,
    signal: null,
    resultDigest: "sha256:".padEnd(71, "0"),
    receipt: {
      receiptId: `receipt:${index}`,
      receiptDigest: "sha256:".padEnd(71, "0"),
    },
  };
  value.resultDigest = workerAttemptResultDigest(value);
  return value;
}
async function fixture(t,failures={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'admission-retirement-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const native=budgetFixture(root,failures),runId='run:admission-retirement';
  await runPipelineV2(native.platform,native.definition,runId);
  const run=runRoot(native.platform.storageRoot,runId),attemptRoot=path.join(run,'observability/attempts'),admissionRoot=path.join(run,'observability/admission');
  const attempts=new FileDurableAttemptStore(attemptRoot,attemptLimits),admission=new FileObservabilityAdmissionStore(admissionRoot,admissionLimits);
  const result=resultFor(1),producer={producerId:'attempt:1',bootId:'claim:1',producerType:'buster-attempt'};
  const evidence=await attempts.storeEvidence({pipelineRunId:runId,attemptId:result.attemptId,claimGeneration:1,producer,evidenceId:'evidence:1',type:'log',mediaType:'text/plain'},Buffer.from('original evidence bytes'));
  result.evidence=[evidence];result.resultDigest=workerAttemptResultDigest(result);
  const unsigned={schemaVersion:'producer-record.v1',recordId:'record:1',producer,sequence:1,recordType:'attempt.completed',occurredAt:'2026-08-09T13:59:30Z',
    correlation:{pipelineRunId:runId,moduleId:null,gateId:'final',attemptId:result.attemptId,claimId:result.claimId,claimGeneration:1,traceId:null,parentEventId:null},
    payload:{workerId:result.workerId,resultDigest:result.resultDigest,state:'completed',diagnostic:'original admitted diagnostic '.repeat(120)}};
  const record={...unsigned,recordDigest:producerRecordDigest(unsigned)};
  const closure=createProducerClosure({schemaVersion:'producer-closure.v1',closureId:'closure:1',producer,pipelineRunId:runId,firstSequence:1,finalSequence:1,recordCount:1,
    requiredEvidenceIds:[scopedEvidenceId(result.attemptId,1,evidence.evidenceId)],closedAt:'2026-08-09T13:59:31Z'});
  await attempts.storeResult(runId,result,{record,closure},{planId:'plan:1',nodeId:'node:1'});
  await attempts.resumeCompletion(runId,result.attemptId,1,admission);
  const otherUnsigned={...unsigned,recordId:'record:other',producer:{...producer,producerId:'active'},correlation:{...unsigned.correlation,pipelineRunId:'run:waiting'}};
  const other={...otherUnsigned,recordDigest:producerRecordDigest(otherUnsigned)};
  await admission.admit(canonicalJson(other));
  const scope={schemaVersion:'admission-retirement-scope.v1',action:'compact-admission-completion',actor:'operator:local',operationId:'compact:one',runId,novaStorageRoot:native.platform.storageRoot,
    attemptRoot,admissionRoot,admissionLimits,attemptLimits,attemptId:result.attemptId,claimGeneration:1,recordDigest:record.recordDigest,
    expectedJournalHead:JSON.parse(fs.readFileSync(path.join(run,'events.jsonl'),'utf8').trim().split('\n').at(-1)).hash,
    expectedSnapshotDigest:JSON.parse(fs.readFileSync(path.join(run,'run-snapshot.json'),'utf8')).digest,
    inventoryLimits:{maximumFiles:10000,maximumTotalBytes:256*1024**2,maximumSnapshotBytes:32*1024**2}};
  return {root,run,runId,attempts,admission,record,other,result,closure,evidence,scope};
}
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
