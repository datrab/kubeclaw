import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { attestSourceSnapshot } from '@kubeclaw/pipeline-test-gate-contract';
import { createRemotePlanJob } from '@kubeclaw/nova-core';
import { plan } from '../../fixtures/test-gate/remote-plan.mts';
import { preparedPlanHeader, preparationDigest } from '../../../skills/buster/engine/test-gates/preparation-header.ts';
import { PreparedBusterPlanJobStore } from '../../../skills/buster/engine/test-gates/prepared-plan-store.ts';
import type { BusterStagedAdmission } from '../../../skills/buster/engine/test-gates/preparation-input.ts';
import type { PreparedAdmission } from '../../../skills/buster/engine/test-gates/preparation-client.ts';

// Decoder-only fixture. These bytes are not claimed to be an extracted archive.
const archive = Buffer.from('source identity decoder fixture');
const archiveDigest = `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`;
const keys = crypto.generateKeyPairSync('ed25519');
const key = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const snapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
  pipelineStageId: 'stage:test', repositoryId: 'repository:test', revision: `git:${'a'.repeat(40)}`,
  tree: `git:${'b'.repeat(40)}`, archiveContentDigest: archiveDigest,
  archiveSizeBytes: archive.length, creatorAuthority: 'nova:test' }, key);
const job = preparedPlanHeader(createRemotePlanJob({ idempotencyKey: 'identity-test', pipelineStageId: 'stage:test',
  plan: plan('blocking', null), sourceSnapshot: snapshot, repositoryArchive: archive,
  grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-09-21T00:00:00.000Z' }));
const digest = `sha256:${'f'.repeat(64)}`;
const source = { schemaVersion: 'buster-prepared-source.v1', admissionId: 'a'.repeat(32), preparationUid: 1003,
  jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(job),
  archiveDigest, archiveBytes: archive.length, attemptSpecDigest: digest };
const input = { schemaVersion: 'buster-staged-input.v1', admissionId: source.admissionId,
  preparationUid: 1003, jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(job),
  wireDigest: digest, wireBytes: 100, attemptSpecDigest: digest };


import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { readBusterOriginalExecution, captureBusterOriginalExecution } from '../../../skills/buster/engine/test-gates/original-execution.ts';
import { assertPreparedPlanJobRecord } from '../../../skills/buster/engine/test-gates/prepared-plan-store.ts';
import { executeBusterPreparedJob } from '../../../skills/buster/engine/test-gates/remote-prepared-execution.ts';
import type { BusterRemotePlanServiceOptions } from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';

// Explicit source-only fixtures: digest-shaped labels do not assert native boot authority.
const original = () => readBusterOriginalExecution({schemaVersion: 'buster-original-execution.v1',
  generationDigest: digest, selectionDigest: archiveDigest, executionPolicy: runnerExecutionPolicy,
  workerLocalRuntime: {drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536}, workerCore: null});
function storeAt(root: string) { return new PreparedBusterPlanJobStore(path.join(root, 'state'), {
  recordLimits: { maximumRecords: 10, maximumBytes: 1048576, maximumRecordBytes: 131072 },
  maximumResultBytes: 65536, maximumResultStoreBytes: 1048576, trustedSourceAuthority: 'nova:test',
  sourceAttestationPublicKey: keys.publicKey.export({type:'spki',format:'pem'}) }); }

test('v3 original A survives replay under B, source attachment and cancellation; v2 remains closed', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buster-original-store-'));
 try {
  const store=storeAt(root), a=original(), b=original();
  const staged={job,input} as BusterStagedAdmission;
  await store.accept(staged,job.submittedAt,a);
  const changed=structuredClone(b); (changed as {generationDigest:string}).generationDigest=archiveDigest;
  await store.accept(staged,job.submittedAt,changed);
  await store.attachSource({job,source} as PreparedAdmission);
  await store.requestCancellation(job.jobId,job.submittedAt);
  const retained=(await storeAt(root).get(job.jobId)).payload;
  assert.equal(retained.schemaVersion,'buster-plan-job-record.v3');
  assert.deepEqual('originalExecution' in retained && retained.originalExecution,a);
  assertPreparedPlanJobRecord(retained);
  const {originalExecution: _original,...legacy}=retained as typeof retained & {originalExecution:unknown};
  const v2={...legacy,schemaVersion:'buster-plan-job-record.v2'};
  assertPreparedPlanJobRecord(v2);
  assert.throws(()=>assertPreparedPlanJobRecord({...v2,originalExecution:a}),/JOB_RECORD_INVALID/);
  assert.throws(()=>assertPreparedPlanJobRecord({...v2,schemaVersion:'buster-plan-job-record.v3'}),/JOB_RECORD_INVALID/);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('actual prepared execution uses retained A before effects; uncaptured v2 cannot borrow current B', async () => {
 for (const capture of [true,false]) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'buster-original-execute-'));
  try {
   const store=storeAt(root), staged={job,input} as BusterStagedAdmission;
   await store.accept(staged,job.submittedAt,capture?original():undefined);
   let extracted=0, executed=0;
   const options={store,originalExecution:original(),runtimeRoot:path.join(root,'runs'),
    // Deliberately unusable current execution selection; only durable original A is valid.
    executionPolicy:null,workerLocalRuntime:null,allowedCapabilities:new Set(),
    preparation:{extract:async(value: BusterStagedAdmission)=>{extracted++;assert.deepEqual(Object.keys(value).sort(),['input','job']);return {job,source};},repository:async()=>root},
    execute:async()=>{executed++;throw new Error('ORIGINAL_A_REACHED_EXECUTOR');},
   } as unknown as BusterRemotePlanServiceOptions;
   await executeBusterPreparedJob(options,(await store.get(job.jobId)).payload as BusterStagedAdmission,new AbortController().signal,()=>new Date(job.submittedAt));
   const status=(await store.get(job.jobId)).payload.status;
   assert.equal(status.state,'failed');
   assert.equal(status.error,capture?'ORIGINAL_A_REACHED_EXECUTOR':'BUSTER_ORIGINAL_EXECUTION_UNAVAILABLE');
   assert.equal(extracted,capture?1:0);assert.equal(executed,capture?1:0);
  } finally {await fs.rm(root,{recursive:true,force:true});}
 }
});

test('boot creation rejects shape-forged receipts; selected reader rejects missing/unknown values',()=>{
 assert.throws(()=>captureBusterOriginalExecution({} as never));
 const a=original();
 for(const bad of [null,{}, {...a,extra:true},{...a,workerCore:undefined},{...a,generationDigest:'latest'},
  {...a,executionPolicy:{}},{...a,workerLocalRuntime:{}},{...a,workerLocalRuntime:{...a.workerLocalRuntime,extra:true}}]) assert.throws(()=>readBusterOriginalExecution(bad));
 assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.executionPolicy.provider));
});
