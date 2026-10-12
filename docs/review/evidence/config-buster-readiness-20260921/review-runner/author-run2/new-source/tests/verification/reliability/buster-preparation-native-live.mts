import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createNativeCaseRoot as caseRoot, createNativePreparationJob, requiredNativeInput, stageNativeWire,
  withNativePreparation } from '../../fixtures/test-gate/native-preparation.mts';
import { extractBusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-extraction.ts';
import { preparationSourceDirectory } from '../../../skills/buster/engine/test-gates/preparation-source.ts';
import type { PreparationExecutionOptions } from '../../../skills/buster/engine/test-gates/preparation-execution.ts';
import { assertConcurrentGateIsolation, assertPublishedSourcePermissions } from '../../fixtures/test-gate/native-preparation-permissions.mts';

async function assertSealedQuiescent(execution: PreparationExecutionOptions, expected: number): Promise<void> {
  let count = 0;
  for await (const envelope of execution.journal.acceptedEnvelopes()) {
    const result = await execution.journal.readResult(envelope);
    assert.equal(result?.state, 'completed');
    assert.equal(result.cleanup.state, 'completed');
    assert.ok(await execution.journal.readProcess(envelope), 'actual process archive is required');
    const record = await execution.owner.record({ workerId: envelope.claim.workerId,
      attemptId: envelope.attemptId, claimId: envelope.claim.claimId, generation: envelope.claim.generation,
      profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest });
    assert.equal(record?.phase, 'disposed');
    assert.equal(record.finalObservation?.populated, false);
    count += 1;
  }
  assert.equal(count, expected);
}

test('native preparation retains exact input before durable acceptance and publishes a separately owned extraction',
  { timeout: 600_000 }, async () => {
    const root = await caseRoot('two-phase');
    const { job } = await createNativePreparationJob(root);
    await withNativePreparation(root, async (execution, store) => {
      const wire = path.join(root, 'producer-wire.json');
      const staged = await stageNativeWire(execution, wire, new AbortController().signal);
      assert.ok(staged);
      assert.equal(staged.job.jobId, job.jobId);
      assert.equal(staged.job.requestDigest, job.requestDigest);
      assert.deepEqual(staged.job.grants, job.grants);
      await assertSealedQuiescent(execution, 1);
      const retained = path.join(preparationSourceDirectory(execution.command.sourceRoot, staged.input.admissionId), 'request.json');
      assert.deepEqual(await fs.readFile(retained), await fs.readFile(wire));
      assert.equal((await store.accept(staged, new Date().toISOString())).state, 'accepted');
      const prepared = await extractBusterPreparation(execution, staged, new AbortController().signal);
      await store.attachSource(prepared);
      await assertSealedQuiescent(execution, 2);
      assert.notEqual(prepared.source.attemptSpecDigest, staged.input.attemptSpecDigest);
      const rows = await execution.ledger.reservations();
      assert.deepEqual(rows.map(row => row.phase).sort(), ['published', 'retained-input']);
      assert.ok(rows.every(row => row.slotReleased));
      assert.deepEqual(await fs.readFile(retained), await fs.readFile(wire));
      await assertPublishedSourcePermissions(root,
        path.join(preparationSourceDirectory(execution.command.sourceRoot, prepared.source.admissionId), 'repository'));
    });
  });

test('stored acceptance survives parent SIGKILL before extraction and resumes the same original wire',
  { timeout: 600_000 }, async () => {
    const root = await caseRoot('accepted-crash');
    const { job } = await createNativePreparationJob(root);
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const fixture = fileURLToPath(new URL('../../fixtures/test-gate/native-preparation-crash.mts', import.meta.url));
    const child = spawn(process.execPath, [fixture, root], { env: environment, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const exited = once(child, 'exit');
    try {
      const accepted = await Promise.race([
        once(child, 'message').then(([message]) => message as { kind: string; jobId: string; input: unknown }),
        exited.then(([code, signal]) => { throw new Error(`preparation child exited before acceptance: ${code}/${signal}`); }),
      ]);
      assert.equal(accepted.kind, 'durably-accepted');
      assert.equal(accepted.jobId, job.jobId);
      assert.ok(child.kill('SIGKILL'));
      assert.deepEqual(await exited, [null, 'SIGKILL']);
      await withNativePreparation(root, async (execution, store) => {
        const { payload: record } = await store.get(job.jobId);
        assert.ok(record && record.input);
        assert.ok(record.input.schemaVersion === 'buster-staged-input.v1');
        assert.equal(record.status.state, 'accepted');
        assert.equal(record.source, null);
        assert.deepEqual(record.input, accepted.input);
        await assertSealedQuiescent(execution, 1);
        const prepared = await extractBusterPreparation(execution, { job: record.job, input: record.input }, new AbortController().signal);
        await store.attachSource(prepared);
        await assertSealedQuiescent(execution, 2);
        assert.equal(prepared.job.requestDigest, job.requestDigest);
      });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    }
  });

test('two actual staging hosts retain distinct slot authority and release slots only after quiescence',
  { timeout: 600_000 }, async () => {
    const root = await caseRoot('concurrent-slots');
    await createNativePreparationJob(root);
    await withNativePreparation(root, async (execution) => {
      assert.equal(execution.settings.maximumActivePreparations, 2, 'this case requires the authored two-slot profile');
      const pool = JSON.parse(await fs.readFile(requiredNativeInput('KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE'), 'utf8'));
      assert.ok(pool.memoryBytes >= 2 * execution.settings.resourcePolicy.memoryBytes
        && pool.tasks >= 2 * execution.settings.resourcePolicy.tasks,
      'two simultaneous authored reservations must fit the actual preexisting pool');
      const ready = Promise.withResolvers<void>();
      const proceed = Promise.withResolvers<boolean>();
      let validations = 0;
      const admit = async () => {
        if (++validations === 2) ready.resolve();
        return proceed.promise;
      };
      const stages = [0, 1].map(() => stageNativeWire(execution,
        path.join(root, 'producer-wire.json'), new AbortController().signal, admit));
      try {
        await Promise.race([ready.promise, ...stages.map(stage => stage.then(() => {
          throw new Error('host finished before both validation barriers');
        }))]);
        await assertConcurrentGateIsolation(execution);
      } finally {
        proceed.resolve(true);
        await Promise.allSettled(stages);
      }
      const results = await Promise.all(stages);
      assert.ok(results.every(Boolean));
      await assertSealedQuiescent(execution, 2);
      assert.ok((await execution.ledger.reservations()).every(row => row.slotReleased));
    });
  });

for (const boundary of ['already-aborted', 'validated-cancellation', 'invalid-wire'] as const) {
  test(`actual ${boundary} leaves no accepted job and restart preserves failed receipts while reclaiming only its empty gate`,
    { timeout: 600_000 }, async () => {
      const root = await caseRoot(boundary);
      await createNativePreparationJob(root);
      const originalResults = new Map<string, string>();
      await withNativePreparation(root, async (execution, store) => {
        const sentinel = path.join(execution.command.sourceRoot, 'unrelated-sentinel');
        await fs.writeFile(sentinel, 'must survive');
        const wire = path.join(root, 'producer-wire.json');
        if (boundary === 'invalid-wire') await fs.writeFile(wire, '{');
        const controller = new AbortController();
        if (boundary === 'already-aborted') controller.abort(new Error('test cancellation before launch'));
        await assert.rejects(stageNativeWire(execution, wire, controller.signal, async () => {
          assert.equal(boundary, 'validated-cancellation');
          controller.abort(new Error('test cancellation at validated boundary'));
          return false;
        }));
        assert.equal((await store.records()).length, 0);
        for await (const envelope of execution.journal.acceptedEnvelopes()) {
          const result = await execution.journal.readResult(envelope);
          assert.ok(result);
          assert.notEqual(result.state, 'completed');
          originalResults.set(envelope.attemptSpecDigest, JSON.stringify(result));
        }
        assert.equal(originalResults.size, 1);
        assert.equal(await fs.readFile(sentinel, 'utf8'), 'must survive');
      });
      await withNativePreparation(root, async (execution, store) => {
        assert.equal((await store.records()).length, 0);
        const rows = await execution.ledger.reservations();
        assert.equal(rows.length, 1);
        assert.ok(rows.every(row => row.phase === 'released' && row.slotReleased));
        for await (const envelope of execution.journal.acceptedEnvelopes()) {
          const original = originalResults.get(envelope.attemptSpecDigest);
          if (original) assert.equal(JSON.stringify(await execution.journal.readResult(envelope)), original);
        }
        assert.equal(await fs.readFile(path.join(execution.command.sourceRoot, 'unrelated-sentinel'), 'utf8'), 'must survive');
      });
    });
}
