import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {FileJournal} from '../../../skills/nova/core/state/journal.ts';
import {projectionFixture} from './admission-retirement.test.mjs';
import {retireAttemptResult} from '../../../scripts/retire-attempt-result.mjs';
import {FileDurableAttemptStore} from '../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {hashJournalRecord} from '../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
import {workerAttemptResultDigest} from '../../../contracts/pipeline-worker-core/v1/src/index.ts';
import {canonicalJson} from '../../../contracts/pipeline-observability/v1/src/index.ts';
import {retireAdmission} from '../../../scripts/retire-admission.mjs';
import {FileProducerOutbox,deliverPending} from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';

test('independent review: projected replay survives a real later journal append but missing or corrupt referenced history cannot produce an ACK',async t=>{
  const f=await projectionFixture(t);
  await retireAdmission(f.scope);await retireAttemptResult(f.projectionScope);
  const decision=await f.imported.reconciler.reconcile([{...f.imported.desired,attemptId:'attempt:not-started',claimId:'claim:not-started'}]);
  assert.equal(decision[0].action,'reconnect');
  const journal=fs.readFileSync(f.imported.journalFile);
  assert.equal(journal.toString().trim().split('\n').length,2);
  assert.deepEqual((await f.attempts.snapshot()).results[0].result,f.result);
  const outbox=new FileProducerOutbox(path.join(f.root,'independent-old-delivery'),{maximumRecords:10,maximumBytes:50000});
  await outbox.append(f.record);
  fs.unlinkSync(f.imported.journalFile);
  await assert.rejects(f.attempts.snapshot(),/ENOENT/);
  await assert.rejects(deliverPending(outbox,f.admission),/ENOENT/);
  assert.equal((await outbox.pending()).length,1);
  const corrupted=journal.toString().replace('original imported result detail','modified imported result detail');
  fs.writeFileSync(f.imported.journalFile,corrupted);
  await assert.rejects(f.attempts.snapshot(),/JOURNAL_HASH_INVALID/);
  await assert.rejects(f.admission.admit(canonicalJson(f.record)),/JOURNAL_HASH_INVALID/);
  assert.equal((await outbox.pending()).length,1);
  fs.writeFileSync(f.imported.journalFile,journal);
  assert.equal(await deliverPending(outbox,f.admission),1);
  assert.equal((await outbox.pending()).length,0);
  assert.equal((await f.admission.admit(canonicalJson(f.record))).acknowledgement.state,'duplicate');
  assert.deepEqual(fs.readFileSync(f.imported.journalFile),journal);
});

test('independent review: structurally valid rehashed foreign or unimported checkpoints cannot authorize projection',async t=>{
  const f=await projectionFixture(t),file=path.join(f.scope.attemptRoot,'attempt-store.json');
  const original=fs.readFileSync(file),journal=fs.readFileSync(f.imported.journalFile);
  const changes=[
    d=>{d.pipelineRunId='run:foreign';},d=>{d.planId='plan:foreign';},
    d=>{d.nodeId='node:foreign';},d=>{d.attemptId='attempt:foreign';},
    d=>{d.claimGeneration=2;},d=>{d.action='blocked-incomplete';},
    d=>{d.nextClaimGeneration=2;},d=>{d.completeness.requiredClosureIds=[];},
    d=>{d.completeness.admittedClosureIds=[];},
  ];
  for(const change of changes) {
    const record=JSON.parse(journal.toString().trim());change(record.entry.decision);
    record.hash=hashJournalRecord(record.sequence,record.previousHash,record.entry);
    fs.writeFileSync(f.imported.journalFile,`${JSON.stringify(record)}\n`);
    const scope=structuredClone(f.projectionScope);scope.intent.journalHash=record.hash;
    await assert.rejects(retireAttemptResult(scope),/attempt-result-import|OBSERVABILITY_CONTRACT/);
    assert.deepEqual(fs.readFileSync(file),original);
  }
  fs.writeFileSync(f.imported.journalFile,journal);
  assert.equal((await retireAttemptResult(f.projectionScope)).newlyRetired,true);
});

test('independent review: reclaimed unreferenced evidence preserves the projected result and metadata quota still applies',async t=>{
  const f=await projectionFixture(t),file=path.join(f.scope.attemptRoot,'attempt-store.json');
  await retireAttemptResult(f.projectionScope);
  const original=JSON.parse(fs.readFileSync(file)),reference=original.results[0].resultReference;
  const attempts=new FileDurableAttemptStore(f.scope.attemptRoot,{...f.limits,maximumPendingEvidenceAgeMs:1});
  await attempts.storeEvidence({pipelineRunId:'run:waiting',attemptId:'attempt:orphan',claimGeneration:1,
    producer:{producerId:'orphan',bootId:'boot:orphan',producerType:'buster'},evidenceId:'orphan',type:'log',mediaType:'text/plain'},Buffer.from('temporary unreferenced bytes'));
  await delay(20);
  const state=await attempts.snapshot();
  assert.equal(state.evidence.some(item=>item.evidenceId==='orphan'),false);
  assert.deepEqual(state.results[0].result,f.result);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).results[0].resultReference,reference);
  const before=fs.readFileSync(file),maximumMetadataBytes=Math.max(before.length,fs.statSync(f.imported.journalFile).size)+512;
  const tight=new FileDurableAttemptStore(f.scope.attemptRoot,{...f.limits,maximumMetadataBytes});
  const result=structuredClone(f.result);
  result.attemptId='attempt:new';result.claimId='claim:new';result.evidence=[];
  result.specialistResult.values.detail='x'.repeat(maximumMetadataBytes);
  result.resultDigest=workerAttemptResultDigest(result);
  await assert.rejects(tight.storeResult('run:new',result),/ATTEMPT_METADATA_FULL/);
  assert.deepEqual(fs.readFileSync(file),before);
  assert.deepEqual((await tight.snapshot()).results[0].result,f.result);
});

test('independent review: original run fence rejects a concurrent retirement and permits unchanged replay after owner release',async t=>{
  const f=await projectionFixture(t);
  const results=await Promise.allSettled([retireAttemptResult(f.projectionScope),retireAttemptResult(f.projectionScope)]);
  const fulfilled=results.filter(item=>item.status==='fulfilled'),rejected=results.filter(item=>item.status==='rejected');
  assert.equal(fulfilled.length,1);assert.equal(fulfilled[0].value.newlyRetired,true);
  assert.equal(rejected.length,1);assert.match(rejected[0].reason.message,/^PIPELINE_RUN_MUTATION_LOCKED:/);
  assert.deepEqual(await retireAttemptResult(f.projectionScope),{newlyRetired:false,releasedBytes:0});
  assert.deepEqual((await f.attempts.snapshot()).results[0].result,f.result);
});

test('independent review: original synchronous journal reader does not time out while actual retirement awaits evidence IO',async t=>{
  const f=await projectionFixture(t),journal=new FileJournal(f.imported.journalFile,250),before=fs.readFileSync(f.imported.journalFile);
  const errors=[];let reads=0;
  const timer=setInterval(()=>{try{journal.refresh();reads++;}catch(error){errors.push(error);}},1);
  try {assert.equal((await retireAttemptResult(f.projectionScope)).newlyRetired,true);}
  finally {clearInterval(timer);}
  assert.ok(reads>0);assert.deepEqual(errors,[]);
  assert.deepEqual(fs.readFileSync(f.imported.journalFile),before);
  assert.deepEqual((await f.attempts.snapshot()).results[0].result,f.result);
});
