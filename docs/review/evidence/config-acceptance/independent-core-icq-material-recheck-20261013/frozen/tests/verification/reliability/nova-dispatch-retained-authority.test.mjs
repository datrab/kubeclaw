import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { attestSourceSnapshot, attemptResultDigest, remotePlanDigest, remotePlanResultDigest, remotePlanResultReceipt } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import { createRemotePlanJob } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { FileNovaGateImportStore } from '../../../skills/nova/core/test-gates/remote-result-import.ts';
import { decideResult } from '../../../skills/nova/core/test-gates/remote-result-authority.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { plan, completed } from '../../fixtures/test-gate/remote-plan.mts';

// These are explicit contract-data corruption vectors exercising ORIGINAL stores
// and validators, not simulated provider execution or Core ownership acceptance.
const limits = { maximumRecords: 10, maximumBytes: 1024 ** 2, maximumRecordBytes: 128 * 1024 };
const digest = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const blob = (root, hash) => path.join(root, 'blobs/sha256', hash.slice(7, 9), hash.slice(9));
function fixture(t, reviewAgent = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retained-import-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bytes = Buffer.from('explicit archive contract data'), key = crypto.generateKeyPairSync('ed25519').privateKey;
  const sourceSnapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
    pipelineStageId: 'test', repositoryId: 'repository:contract', revision: `git:${'a'.repeat(40)}`, tree: `git:${'b'.repeat(40)}`,
    archiveContentDigest: digest(bytes), archiveSizeBytes: bytes.length, creatorAuthority: 'nova:contract' }, key.export({ type: 'pkcs8', format: 'pem' }));
  const job = createRemotePlanJob({ idempotencyKey: 'contract:retained', pipelineStageId: 'test', plan: plan('blocking', reviewAgent),
    repositoryArchive: bytes, sourceSnapshot, grants: new Map(), maximumConcurrency: 1, submittedAt: '2026-09-09T00:00:00.000Z' });
  const records = new FileDurableRecordStore(root, limits);
  return { root, job, records, store: new FileNovaGateImportStore(root, { recordLimits: limits, maximumEvidenceStoreBytes: 1024 ** 2 }) };
}
function artifact(index) {
  const bytes = Buffer.from(`retained artifact ${index}`);
  return { bytes, artifact: { artifactId: `artifact:${index}`, type: 'log', mediaType: 'text/plain',
    contentDigest: digest(bytes), sizeBytes: bytes.length, storageUrl: `file:///contract/${index}` } };
}
function bindResult(job, result) {
  const attempt = result.attempts[0], { resultDigest: _digest, receipt: _receipt, ...unsigned } = attempt;
  attempt.resultDigest = attemptResultDigest(unsigned);
  attempt.receipt.receiptDigest = remotePlanDigest({ authorityId: `test-runner:${job.plan.planDigest}`,
    receiptId: attempt.receipt.receiptId, resultDigest: attempt.resultDigest });
  result.resultDigest = remotePlanResultDigest(result); result.receipt = remotePlanResultReceipt(job.jobId, result.resultDigest);
}
async function record(f, result, status, evidence) {
  const decision = decideResult(f.job, result);
  await f.store.record(f.job, status, result, decision, evidence);
  return (await f.records.read('remote-gate-imports'))[0];
}

test('retained import verifies every evidence, output and report blob with actual missing/corrupt files', async t => {
  const f = fixture(t), evidence = [artifact(1), artifact(2), artifact(3)];
  const value = completed(f.job, { outcome: 'failed', artifact: evidence[0].artifact, reportFailure: true });
  value.result.attempts[0].reports[0].sourceArtifact = evidence[1].artifact;
  value.result.attempts[0].outputs = [{ name: 'output', kind: 'artifact', artifact: evidence[2].artifact }];
  bindResult(f.job, value.result);
  const retained = await record(f, value.result, value.status, evidence);
  let called = 0;
  const check = () => f.store.withRetainedImport(f.job, retained.payloadDigest, async () => { called++; });
  await check(); assert.equal(called, 1);
  for (const item of evidence) {
    const file = blob(f.root, item.artifact.contentDigest); fs.unlinkSync(file);
    await assert.rejects(check(), /DURABLE_BLOB_NOT_FOUND/); assert.equal(called, 1);
    fs.writeFileSync(file, Buffer.alloc(item.bytes.length, 1));
    await assert.rejects(check(), /DURABLE_BLOB_INTEGRITY_FAILED/); assert.equal(called, 1);
    fs.writeFileSync(file, item.bytes);
  }
  await check(); assert.equal(called, 2);
});

test('retained import rejects pending, null-result, incomplete decision and result identity despite valid record CAS', async t => {
  const f = fixture(t), value = completed(f.job, { outcome: 'failed' });
  const retained = await record(f, value.result, value.status, []);
  const variants = [
    payload => { payload.state = 'pending_evidence'; },
    payload => { payload.remoteResult = null; payload.remoteResultDigest = null; },
    payload => { payload.decision.state = 'review_required'; },
    payload => { payload.remoteResult.attempts[0].attemptNumber = 2; bindResult(f.job, payload.remoteResult);
      payload.remoteResultDigest = payload.remoteResult.resultDigest; payload.decision = decideResult(f.job, payload.remoteResult); },
  ];
  let current = retained;
  for (const change of variants) {
    const payload = structuredClone(retained.payload); change(payload);
    current = await f.records.transition('remote-gate-imports', f.job.jobId, current.payloadDigest, payload);
    await assert.rejects(f.store.withRetainedImport(f.job, current.payloadDigest, async () => assert.fail('must not authorize')));
  }
  current = await f.records.transition('remote-gate-imports', f.job.jobId, current.payloadDigest, retained.payload);
  await f.store.withRetainedImport(f.job, current.payloadDigest, async authority => assert.equal(authority.decision.state, 'failed'));
});

test('bounded original record fenced read refuses oversized snapshot before callback and releases fence', async t => {
  const f = fixture(t); await f.records.append('contract', 'one', { retained: 'x'.repeat(512) });
  const file = path.join(f.root, 'records/store.json'), size = fs.statSync(file).size;
  const bounded = new FileDurableRecordStore(f.root, { ...limits, maximumBytes: size - 1 });
  await assert.rejects(bounded.withRecords('contract', async () => assert.fail('must not allocate/authorize oversized state')));
  assert.equal((await f.records.read('contract')).length, 1);
  await f.records.append('contract', 'two', { retained: 'new original write' });
  assert.equal((await f.records.read('contract')).length, 2);
});

test('genuine original decision calculation retains review_required as incomplete authority', async t => {
  const f = fixture(t, 'reviewer'), value = completed(f.job, { outcome: 'failed' });
  const retained = await record(f, value.result, value.status, []);
  assert.equal(retained.payload.decision.state, 'review_required');
  await assert.rejects(f.store.withRetainedImport(f.job, retained.payloadDigest,
    async () => assert.fail('pending original review cannot authorize')), /NOVA_DISPATCH_RETENTION_DECISION_INCOMPLETE/);
});
