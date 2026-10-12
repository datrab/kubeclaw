import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

// Pause an actual read/CAS window. The independent flock contender proves the
// outer fence is held; no sleeps or simulated successful persistence are used.
test('source attachment and cancellation share the durable admission fence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-source-cancel-'));
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const store = new PreparedBusterPlanJobStore(path.join(root, 'state'), {
    recordLimits: { maximumRecords: 10, maximumBytes: 1048576, maximumRecordBytes: 131072 },
    maximumResultBytes: 65536, maximumResultStoreBytes: 1048576,
    trustedSourceAuthority: 'nova:test',
    sourceAttestationPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
  });
  const staged = { job, input } as BusterStagedAdmission;
  let pending: Promise<void> | undefined;
  let cancellation: ReturnType<PreparedBusterPlanJobStore['transition']> | undefined;
  try {
    await store.accept(staged, job.submittedAt);
    const originalGet = store.get.bind(store);
    let first = true;
    store.get = async id => {
      const current = await originalGet(id);
      if (first) { first = false; entered.resolve(); await release.promise; }
      return current;
    };
    pending = store.attachSource({ job, source } as PreparedAdmission);
    await entered.promise;
    const contender = spawnSync('/usr/bin/flock', ['--nonblock', '--conflict-exit-code', '73',
      path.join(root, 'state-v2', '.write-lock'), '/bin/true']);
    cancellation = store.transition(job.jobId, ['accepted', 'running'], 'cancelled', job.submittedAt, { error: 'BUSTER_REMOTE_JOB_CANCELLED' });
    try { assert.equal(contender.status, 73, 'source read/CAS must hold the same admission lock'); }
    finally { release.resolve(); }
    await pending;
    assert.equal((await cancellation).state, 'cancelled');
    const retained = await store.get(job.jobId);
    assert.equal(retained.payload.status.state, 'cancelled');
    assert.deepEqual(retained.payload.source, source);
    await assert.rejects(store.transition(job.jobId, ['accepted'], 'running', job.submittedAt), /STATE_CONFLICT:cancelled/);
  } finally {
    release.resolve();
    await pending?.catch(() => undefined);
    await cancellation?.catch(() => undefined);
    await fs.rm(root, { recursive: true, force: true });
  }
});
