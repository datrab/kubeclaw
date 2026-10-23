import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {workerAttemptResultDigest} from '../../../contracts/pipeline-worker-core/v1/src/index.ts';
import {producerRecordDigest,canonicalJson} from '../../../contracts/pipeline-observability/v1/src/index.ts';
import {FileDurableAttemptStore,createProducerClosure,scopedEvidenceId} from '../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {FileObservabilityAdmissionStore} from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';
import {runPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {budgetFixture} from './repair-budget-fixture.mjs';
import {NovaObservabilityReconciler} from '../../../skills/nova/core/observability/reconciler.ts';
import {attemptStoreDigest} from '../../../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
export const admissionLimits={maximumIngressBytes:20000,maximumRecords:2,maximumBytes:50000,maximumQuarantineRecords:10,maximumQuarantineBytes:5000};
export const attemptLimits={maximumEvidenceObjects:10,maximumEvidenceBytes:10000,maximumEvidenceObjectBytes:1000,maximumResults:10,maximumClosures:10,maximumMetadataBytes:100000,maximumPendingEvidenceAgeMs:60000};
export function resultFor(index) {
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
export async function fixture(t,failures={},resultDetail='') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'admission-retirement-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const native=budgetFixture(root,failures),runId='run:admission-retirement';
  await runPipelineV2(native.platform,native.definition,runId);
  const run=runRoot(native.platform.storageRoot,runId),attemptRoot=path.join(run,'observability/attempts'),admissionRoot=path.join(run,'observability/admission');
  const attempts=new FileDurableAttemptStore(attemptRoot,attemptLimits),admission=new FileObservabilityAdmissionStore(admissionRoot,admissionLimits);
  const result=resultFor(1),producer={producerId:'attempt:1',bootId:'claim:1',producerType:'buster-attempt'};
  if(resultDetail)result.specialistResult.values.detail=resultDetail;
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
export async function importCompletion(f, attempts = f.attempts) {
  const journalFile = path.join(f.run, 'observability/reconciliation.jsonl');
  const desired = {
    pipelineRunId: f.runId, planId: 'plan:1', nodeId: 'node:1',
    attemptId: f.result.attemptId, claimId: f.result.claimId,
    claimGeneration: f.result.claimGeneration, workerId: f.result.workerId,
    claimExpiresAt: '2100-01-01T00:00:00Z', gateClass: 'authoritative-final',
    requiredClosures: [{closureId: f.closure.closureId, producer: f.closure.producer}],
  };
  const reconciler = new NovaObservabilityReconciler({journalAppendLockTimeoutMs: TEST_CORE_POLICY.journalAppendLockTimeoutMs,attemptStore: attempts, admissionStore: f.admission, journalFile});
  const imported = await reconciler.reconcile([desired]);
  assert.equal(imported[0].action, 'imported');
  assert.equal(imported[0].completeness.state, 'complete');
  assert.deepEqual(imported[0].result, f.result);
  return {journalFile, desired, reconciler};
}

export async function projectionFixture(t,failures={}) {
  const f=await fixture(t,failures,'original imported result detail '.repeat(600));
  const limits={...attemptLimits,maximumResults:2};
  const attempts=new FileDurableAttemptStore(f.scope.attemptRoot,limits);
  const active=resultFor(2);
  await attempts.storeResult('run:waiting',active,null,{planId:'plan:waiting',nodeId:'node:waiting'});
  const imported=await importCompletion(f,attempts);
  const journal=JSON.parse(fs.readFileSync(imported.journalFile,'utf8').trim().split('\n').at(-1));
  const scope={schemaVersion:'attempt-result-retirement-scope.v1',action:'compact-imported-result',
    novaStorageRoot:f.scope.novaStorageRoot,attemptRoot:f.scope.attemptRoot,attemptLimits:limits,inventoryLimits:f.scope.inventoryLimits,
    intent:{pipelineRunId:f.runId,attemptId:f.result.attemptId,claimGeneration:1,resultDigest:f.result.resultDigest,recordDigest:f.record.recordDigest,
      actor:'operator:local',operationId:'project:one',runRoot:f.run,runJournalHead:f.scope.expectedJournalHead,snapshotDigest:f.scope.expectedSnapshotDigest,
      expectedStoreDigest:attemptStoreDigest(fs.readFileSync(path.join(f.scope.attemptRoot,'attempt-store.json'))),journalSequence:journal.sequence,journalHash:journal.hash}};
  return {...f,attempts,limits,imported,projectionScope:scope};
}

