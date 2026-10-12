/** Harness diagnosis: real service/store, modeled preparation authority, actual missing executable. */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { admissionFixture } from '../../../../../tests/fixtures/test-gate/buster-admission.mts';
const fixture = await admissionFixture({ maximumActiveJobs: 1, maximumQueuedJobs: 1, maximumConcurrentAttempts: 3 });
try {
  const job = fixture.job('diagnose-missing-tar', 1);
  await fixture.service.submit(job);
  const deadline = Date.now() + 5000;
  let status = await fixture.service.status(job.jobId);
  while (status.state !== 'failed' && Date.now() < deadline) {
    await delay(20);
    status = await fixture.service.status(job.jobId);
  }
  process.stdout.write(JSON.stringify(status) + '\n');
  assert.equal(status.state, 'failed');
  assert.match(status.error ?? '', /spawn \/usr\/bin\/tar ENOENT/);
} finally { await fixture.close(); }
