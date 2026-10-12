import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { attestSourceSnapshot } from '@kubeclaw/pipeline-test-gate-contract';
import { createRemotePlanJob } from '@kubeclaw/nova-core';
import { plan } from '../../fixtures/test-gate/remote-plan.mts';
import { busterPreparationSettingsFromConfig } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { preparedPlanHeader, preparationDigest } from '../../../skills/buster/engine/test-gates/preparation-header.ts';
import { PreparationSourceLedger } from '../../../skills/buster/engine/test-gates/preparation-ledger.ts';
import { extractBusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-extraction.ts';
import type { PreparationExecutionOptions } from '../../../skills/buster/engine/test-gates/preparation-execution.ts';
import type { StagedAdmission } from '../../../skills/buster/engine/test-gates/preparation-input.ts';

const authored = JSON.parse(await fs.readFile(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url), 'utf8'));
const settings = busterPreparationSettingsFromConfig(authored);
const digest = `sha256:${'f'.repeat(64)}`;
const keys = crypto.generateKeyPairSync('ed25519');
// Contract-valid identity only. Native execution is deliberately unreachable in
// this coordination test; the separate maintained guest cases prove that path.
function staged(value: number): StagedAdmission {
  const archive = Buffer.from('coordination identity fixture');
  const snapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
    pipelineStageId: 'stage:coordination', repositoryId: 'repository:coordination', revision: `git:${'a'.repeat(40)}`,
    tree: `git:${'b'.repeat(40)}`, archiveContentDigest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`,
    archiveSizeBytes: archive.length, creatorAuthority: 'nova:coordination' }, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const job = preparedPlanHeader(createRemotePlanJob({ idempotencyKey: `coordination:${value}`, pipelineStageId: 'stage:coordination',
    plan: plan('blocking', null), sourceSnapshot: snapshot, repositoryArchive: archive,
    grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-09-21T00:00:00.000Z' }));
  return { job, input: { schemaVersion: 'buster-staged-input.v1', admissionId: value.toString(16).padStart(32, '0'),
    preparationUid: 1003, jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(job),
    wireDigest: digest, wireBytes: 100, attemptSpecDigest: digest } };
}

function execution(root: string): PreparationExecutionOptions {
  return { settings, ledger: new PreparationSourceLedger(root, settings), engineContentDigest: digest,
    get owner(): never { throw new Error('NATIVE_OWNER_MUST_NOT_BE_REACHED'); },
    get journal(): never { throw new Error('NATIVE_JOURNAL_MUST_NOT_BE_REACHED'); },
    command: { sourceRoot: root, launcher: '/unreachable', cgroupRoot: '/unreachable', tarExecutable: '/unreachable',
      trustedSourceAuthority: 'nova:coordination', sourceAttestationPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } };
}

test('actual extraction rejects a same-input alias before reservation and captures caller input', { timeout: 10_000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-extract-coordinate-'));
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const stop = new Error('intentional reservation boundary');
  let first: Promise<unknown> | undefined;
  try {
    const alias = `${root}-alias`;
    await fs.symlink(root, alias);
    const primary = execution(root);
    const other = execution(alias);
    const input = staged(1);
    const original = structuredClone(input);
    primary.ledger.reserveExtraction = async (_id, captured) => {
      assert.deepEqual(captured, original);
      entered.resolve();
      await release.promise;
      throw stop;
    };
    other.ledger.reserveExtraction = async () => { throw new Error('DUPLICATE_REACHED_RESERVATION'); };
    first = extractBusterPreparation(primary, input, new AbortController().signal);
    void first.catch(() => undefined);
    Object.assign(input.input, { wireDigest: `sha256:${'e'.repeat(64)}` });
    await entered.promise;
    await assert.rejects(extractBusterPreparation(other, original, new AbortController().signal),
      /BUSTER_PREPARATION_EXTRACTION_BUSY/u);
    release.resolve();
    await assert.rejects(first, error => error === stop);
    await fs.unlink(alias);
  } finally {
    release.resolve();
    await first?.catch(() => undefined);
    await fs.unlink(`${root}-alias`).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('different inputs reach the actual reservation boundary in parallel within authored capacity', { timeout: 10_000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-extract-parallel-'));
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const stop = new Error('intentional parallel boundary');
  const pending: Promise<unknown>[] = [];
  try {
    const options = execution(root);
    assert.equal(settings.maximumActivePreparations, 2);
    let calls = 0;
    options.ledger.reserveExtraction = async () => {
      if (++calls === 2) entered.resolve();
      await release.promise;
      throw stop;
    };
    for (const input of [staged(1), staged(2)]) {
      const run = extractBusterPreparation(options, input, new AbortController().signal);
      void run.catch(() => undefined);
      pending.push(run);
    }
    await entered.promise;
    await assert.rejects(extractBusterPreparation(options, staged(3), new AbortController().signal), /SLOT_CAPACITY/u);
    assert.equal(calls, 2);
    release.resolve();
    for (const run of pending) await assert.rejects(run, error => error === stop);
  } finally {
    release.resolve();
    await Promise.allSettled(pending);
    await fs.rm(root, { recursive: true, force: true });
  }
});

for (const boundary of ['thrown', 'aborted'] as const) {
  test(`actual extraction releases coordination after ${boundary} reservation work`, { timeout: 10_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-extract-release-'));
    try {
      const options = execution(root);
      const input = staged(1);
      const controller = new AbortController();
      const stop = new Error('original failure reason');
      let calls = 0;
      options.ledger.reserveExtraction = async () => {
        calls += 1;
        if (boundary === 'aborted') { controller.abort(stop); controller.signal.throwIfAborted(); }
        throw stop;
      };
      await assert.rejects(extractBusterPreparation(options, input, controller.signal), error => error === stop);
      await assert.rejects(extractBusterPreparation(options, input, new AbortController().signal), error => error === stop);
      assert.equal(calls, 2, 'second invocation is admitted after the first failure');
      const aborted = AbortSignal.abort(stop);
      await assert.rejects(extractBusterPreparation(options, input, aborted), error => error === stop);
      assert.equal(calls, 2, 'already aborted work never reaches reservation');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
}
