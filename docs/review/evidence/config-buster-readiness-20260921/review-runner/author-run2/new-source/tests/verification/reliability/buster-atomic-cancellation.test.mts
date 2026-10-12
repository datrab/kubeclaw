import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { completed } from '../../fixtures/test-gate/remote-plan.mts';
import { payloadDigest } from '../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { admissionFixture } from '../../fixtures/test-gate/buster-admission.mts';
import { preparedPlanStateRoot } from '../../../skills/buster/engine/test-gates/prepared-plan-paths.ts';

type Fixture = Awaited<ReturnType<typeof admissionFixture>>;
const profile = { maximumActiveJobs: 1, maximumQueuedJobs: 2, maximumConcurrentAttempts: 3 };

function pauseNextRead(f: Fixture) {
  const original = f.store.get.bind(f.store);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let first = true;
  f.store.get = async jobId => {
    const current = await original(jobId);
    if (first) { first = false; entered.resolve(); await release.promise; }
    return current;
  };
  return { entered: entered.promise, release: release.resolve,
    restore: () => { f.store.get = original; } };
}

// Observe the cancellation's writer entry for both the corrected method and the
// private old split-path control. The real methods and their locks still run.
function observeCancellationWriter(f: Fixture) {
  const entered = Promise.withResolvers<void>();
  const request = f.store.requestCancellation.bind(f.store);
  const transition = f.store.transition.bind(f.store);
  f.store.requestCancellation = (...args) => { entered.resolve(); return request(...args); };
  f.store.transition = (...args) => {
    if (args[2] === 'cancelling') entered.resolve();
    return transition(...args);
  };
  return { entered: entered.promise, restore: () => {
    f.store.requestCancellation = request; f.store.transition = transition;
  } };
}

function recordBytes(f: Fixture) {
  return fs.readFileSync(path.join(preparedPlanStateRoot(path.join(f.root, 'state')), 'records', 'store.json'));
}

test('completion winning the real writer fence is returned without stale cancellation or abort', { timeout: 30000 }, async () => {
  const f = await admissionFixture(profile);
  let barrier: ReturnType<typeof pauseNextRead> | undefined;
  let observer: ReturnType<typeof observeCancellationWriter> | undefined;
  const originalAbort = AbortController.prototype.abort;
  let cancellationAborts = 0;
  try {
    await f.service.recover(); const job = f.job('completion-winner', 1);
    await f.service.submit(job); await f.started.get(job.jobId)!.promise;
    barrier = pauseNextRead(f);
    const completion = f.store.complete(job.jobId, completed(job, { outcome: 'passed' }).result, new Date().toISOString());
    await barrier.entered;
    observer = observeCancellationWriter(f);
    AbortController.prototype.abort = function (reason?: unknown) {
      if (reason instanceof Error && reason.message === 'BUSTER_REMOTE_CANCELLED') cancellationAborts++;
      return Reflect.apply(originalAbort, this, [reason]);
    };
    const cancellation = f.service.cancel(job.jobId);
    // Attach immediately so the deliberate old-path rejection is reported by
    // the assertion, rather than as an unrelated unhandled rejection.
    const outcome = cancellation.then(value => ({ value }), error => ({ error }));
    await observer.entered; barrier.release();
    const terminal = await completion;
    const observed = await outcome;
    assert.ok('value' in observed, 'a terminal winner must not cause cancellation to reject');
    assert.deepEqual(observed.value, terminal);
    assert.equal(cancellationAborts, 0, 'a completed winner must not abort the live executor');
    const before = recordBytes(f);
    assert.deepEqual(await f.service.cancel(job.jobId), terminal);
    assert.deepEqual(recordBytes(f), before);
    assert.ok(terminal.result);
    const bytes = await f.store.result(job.jobId, terminal.result.contentDigest, terminal.result.sizeBytes);
    assert.equal(JSON.parse(bytes.toString()).resultDigest, terminal.result.resultDigest);
  } finally {
    barrier?.release(); barrier?.restore(); observer?.restore();
    AbortController.prototype.abort = originalAbort;
    await f.close();
  }
});

test('cancellation winning the real writer fence prevents a later completion', { timeout: 30000 }, async () => {
  const f = await admissionFixture(profile);
  let barrier: ReturnType<typeof pauseNextRead> | undefined;
  try {
    await f.service.recover(); const job = f.job('cancellation-winner', 1);
    await f.service.submit(job); await f.started.get(job.jobId)!.promise;
    barrier = pauseNextRead(f);
    const cancellation = f.service.cancel(job.jobId);
    await barrier.entered;
    const completion = assert.rejects(
      f.store.complete(job.jobId, completed(job, { outcome: 'passed' }).result, new Date().toISOString()),
      /BUSTER_REMOTE_JOB_STATE_CONFLICT:(?:cancelling|cancelled)/u);
    barrier.release();
    assert.equal((await cancellation).state, 'cancelling');
    await completion; barrier.restore();
    await f.service.shutdown(5000);
    assert.equal((await f.service.status(job.jobId)).state, 'cancelled');
  } finally { barrier?.release(); barrier?.restore(); await f.close(); }
});

test('concurrent queued cancellation converges and repeated terminal cancellation leaves bytes unchanged', { timeout: 30000 }, async () => {
  const f = await admissionFixture(profile);
  try {
    await f.service.recover(); const active = f.job('active', 1), queued = f.job('queued', 1);
    await f.service.submit(active); await f.started.get(active.jobId)!.promise;
    await f.service.submit(queued);
    const cancelled = await Promise.all(Array.from({ length: 3 }, () => f.service.cancel(queued.jobId)));
    assert.ok(cancelled.every(value => value.state === 'cancelled'));
    assert.equal((await f.service.status(active.jobId)).state, 'running');
    const before = recordBytes(f);
    assert.deepEqual(await f.service.cancel(queued.jobId), cancelled[0]);
    assert.deepEqual(recordBytes(f), before);
    const failed = f.job('failed', 1);
    await f.store.accept(failed, new Date().toISOString());
    const terminal = await f.store.transition(failed.jobId, ['accepted'], 'failed', new Date().toISOString(), { error: 'original failure' });
    const failedBytes = recordBytes(f);
    assert.deepEqual(await f.service.cancel(failed.jobId), terminal);
    assert.deepEqual(recordBytes(f), failedBytes);
    await assert.rejects(f.service.cancel(`job:${'f'.repeat(64)}`), /BUSTER_REMOTE_JOB_NOT_FOUND/u);
  } finally { await f.close(); }
});


test('parallel active cancellation converges and preserves terminal bytes', { timeout: 30000 }, async () => {
  const f = await admissionFixture(profile);
  try {
    await f.service.recover(); const job = f.job('parallel-active', 1);
    await f.service.submit(job); await f.started.get(job.jobId)!.promise;
    const outcomes = await Promise.all(Array.from({ length: 3 }, () => f.service.cancel(job.jobId)));
    assert.ok(outcomes.every(value => ['cancelling', 'cancelled'].includes(value.state)));
    await f.service.shutdown(5000);
    const terminal = await f.service.status(job.jobId);
    assert.equal(terminal.state, 'cancelled');
    const before = recordBytes(f);
    assert.deepEqual(await f.service.cancel(job.jobId), terminal);
    assert.deepEqual(recordBytes(f), before);
  } finally { await f.close(); }
});

test('invalid persisted status and record shape remain rejected without writes', { timeout: 30000 }, async () => {
  const f = await admissionFixture(profile);
  const file = path.join(preparedPlanStateRoot(path.join(f.root, 'state')), 'records', 'store.json');
  let original: Buffer | undefined;
  try {
    const job = f.job('invalid-persisted', 1);
    await f.store.accept(job, new Date().toISOString());
    original = recordBytes(f);
    for (const malformed of ['status', 'record']) {
      const state = JSON.parse(original.toString());
      const record = state.records.find((value: { payload: { job: { jobId: string } } }) => value.payload.job.jobId === job.jobId);
      assert.ok(record);
      if (malformed === 'status') record.payload.status.state = 'invalid-terminal';
      else record.payload.unrecognized = true;
      // Keep the durable record digest coherent so this reaches the actual
      // prepared-record/status decoder, rather than only the checksum guard.
      record.payloadDigest = payloadDigest(record.payload);
      fs.writeFileSync(file, JSON.stringify(state));
      const before = recordBytes(f);
      await assert.rejects(f.service.cancel(job.jobId), malformed === 'status'
        ? /Invalid pipeline test-gate remotePlanStatus/u : /BUSTER_JOB_RECORD_INVALID/u);
      assert.deepEqual(recordBytes(f), before);
    }
  } finally {
    if (original) fs.writeFileSync(file, original);
    await f.close();
  }
});
