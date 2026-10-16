import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { attestSourceSnapshot } from '@kubeclaw/pipeline-test-gate-contract';
import { createRemotePlanJob } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { plan, completed } from '../../fixtures/test-gate/remote-plan.mts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { preparedPlanHeader, preparationDigest } from '../../../skills/buster/engine/test-gates/preparation-header.ts';
import { executeBusterPreparedJob } from '../../../skills/buster/engine/test-gates/remote-prepared-execution.ts';

// Source identity/signature and remote result schemas are real; preparation,
// durable transitions and worker execution are modeled, never native acceptance.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prepared-source-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const archive = Buffer.from('modeled archive bytes');
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const snapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
    pipelineStageId: 'stage:test-gate', repositoryId: 'repository:closure', revision: `git:${'a'.repeat(40)}`,
    tree: `git:${'b'.repeat(40)}`, archiveContentDigest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`,
    archiveSizeBytes: archive.length, creatorAuthority: 'nova:test' }, privateKey.export({type:'pkcs8',format:'pem'}));
  const wire = createRemotePlanJob({ idempotencyKey: 'closure:test', pipelineStageId: 'stage:test-gate',
    plan: plan('blocking', null), sourceSnapshot: snapshot, repositoryArchive: archive,
    grants: new Map(), maximumConcurrency: 1, submittedAt: '2026-08-10T03:00:00.000Z' });
  const job = preparedPlanHeader(wire);
  const input = { schemaVersion: 'buster-staged-input.v1', admissionId: 'a'.repeat(32), preparationUid: 1003,
    jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(job),
    wireDigest: `sha256:${'c'.repeat(64)}`, wireBytes: 100, attemptSpecDigest: `sha256:${'d'.repeat(64)}` };
  const source = { schemaVersion: 'buster-prepared-source.v1', admissionId: input.admissionId, preparationUid:1003,
    jobId: job.jobId, requestDigest:job.requestDigest, headerDigest:input.headerDigest,
    archiveDigest:job.repositoryArchive.contentDigest, archiveBytes: archive.length, attemptSpecDigest:input.attemptSpecDigest };
  const prepared = {job,input};
  const extracted = {job:structuredClone(job),source};
  const originalRun = completed(wire, {outcome:'passed'}).result;
  const run = {planId:job.plan.planId,runId:job.plan.runId,attempts:originalRun.attempts,nodes:originalRun.nodes,cleanupErrors:[]};
  const events = []; let result;
  const options = {runtimeRoot:path.join(root,'runtime'), workerRevision:'a'.repeat(40), allowedCapabilities:new Set(),
    executionPolicy:runnerExecutionPolicy,
    preparation:{async extract(){return extracted;}, async repository(){return root;}},
    store:{async attachSource(){events.push('attach');},async transition(...args){events.push(args);},
      async complete(id,value){result=value;},async get(){return {payload:{status:{state:'accepted'}}};}},
    async execute(){return run;}};
  return {root,prepared,extracted,run,options,events,result:()=>result};
}
const now = () => new Date('2026-08-10T03:00:04.000Z');

test('actual prepared execution retains accepted source/header across asynchronous extraction', async t => {
  const f=fixture(t), original=structuredClone(f.prepared.job);
  f.options.preparation.extract=async captured=>{
    f.prepared.job.sourceSnapshot.revision=`git:${'f'.repeat(40)}`;
    f.prepared.job.plan.runId='run:substituted';
    assert.deepEqual(captured.job,original);
    assert(Object.isFrozen(captured.job.sourceSnapshot));
    return f.extracted;
  };
  f.options.execute=async job=>{assert.deepEqual(job,original);return f.run;};
  await executeBusterPreparedJob(f.options,f.prepared,new AbortController().signal,now);
  assert.equal(f.result().runId,original.plan.runId);
});

test('extracted source identity is captured before store attachment awaits',async t=>{
  const f=fixture(t), original=structuredClone(f.extracted.source);
  f.options.store.attachSource=async captured=>{
    f.extracted.source.archiveDigest=`sha256:${'f'.repeat(64)}`;
    assert.deepEqual(captured.source,original);
  };
  f.options.preparation.repository=async source=>{assert.deepEqual(source,original);return f.root;};
  await executeBusterPreparedJob(f.options,f.prepared,new AbortController().signal,now);
  assert(f.result());
});

for(const changed of ['source','header'])test(`mismatched extracted ${changed} never reaches source attachment/execution`,async t=>{
  const f=fixture(t);
  if(changed==='source')f.extracted.source.archiveDigest=`sha256:${'f'.repeat(64)}`;
  else f.extracted.job.sourceSnapshot.revision=`git:${'f'.repeat(40)}`;
  let executed=false;f.options.execute=async()=>{executed=true;return f.run;};
  await executeBusterPreparedJob(f.options,f.prepared,new AbortController().signal,now);
  assert.equal(executed,false);assert(!f.events.includes('attach'));assert.equal(f.result(),undefined);
  assert.match(f.events.at(-1)[4].error,/BUSTER_PREPARATION_(SOURCE_INVALID|HEADER_CHANGED)/);
});

test('original producer attempt and receipt survive asynchronous terminal cleanup',async t=>{
  const f=fixture(t), original=structuredClone(f.run.attempts[0]);
  const open=fs.promises.open.bind(fs.promises);let changed=false;
  f.options.execute=async()=>{
  t.mock.method(fs.promises,'open',async(...args)=>{
    const handle=await open(...args);
    if(!changed){changed=true;f.run.attempts[0].receipt.receiptDigest=`sha256:${'f'.repeat(64)}`;f.run.attempts[0].summary='substituted';}
    return handle;
  });
  return f.run;
  };
  await executeBusterPreparedJob(f.options,f.prepared,new AbortController().signal,now);
  assert(changed);assert.deepEqual(f.result().attempts[0],original);
});
