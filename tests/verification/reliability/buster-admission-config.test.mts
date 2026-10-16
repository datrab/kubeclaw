import { writeTestPipeline, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureSwarmSettings, rejectLegacyAuthors, type BusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { admissionFixture, authoredBusterProfile } from '../../fixtures/test-gate/buster-admission.mts';

const loadSelected = (file: string, documents: ReturnType<typeof authoredBusterProfile>['document']) =>
  captureSwarmSettings(file, busterRuntimeSelection(documents)).components['buster-engine']!.settings as unknown as BusterSettings;

const names = ['maximumActiveJobs', 'maximumQueuedJobs', 'maximumConcurrentAttempts'] as const;
test('canonical startup rejects missing/unknown/malformed admission and every retired ENV author', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-policy-'));
  try {
    const { file, document, settings } = authoredBusterProfile(root);
    assert.deepEqual(settings.admission, { maximumActiveJobs: 2, maximumQueuedJobs: 8, maximumConcurrentAttempts: 64 });
    for (const name of names) {
      for (const invalid of [0, -1, 1.5, '2', [2], null, Number.MAX_SAFE_INTEGER + 1]) {
        const changed = structuredClone(document); changed['buster-engine'].profiles.runtime.settings.admission[name] = invalid;
        writeTestPipeline(file, changed);
        assert.throws(() => loadSelected(file, document), /SWARM_CONFIG_INVALID/);
      }
      const changed = structuredClone(document); delete changed['buster-engine'].profiles.runtime.settings.admission[name];
      writeTestPipeline(file, changed);
      assert.throws(() => loadSelected(file, document), /SWARM_CONFIG_INVALID/);
    }
    for (const value of [undefined, { ...document['buster-engine'].profiles.runtime.settings.admission, typo: 1 }]) {
      const changed = structuredClone(document); changed['buster-engine'].profiles.runtime.settings.admission = value;
      writeTestPipeline(file, changed);
      assert.throws(() => loadSelected(file, document), /SWARM_CONFIG_INVALID/);
    }
    writeTestPipeline(file, document);
    for (const name of ['BUSTER_V2_MAX_ACTIVE_JOBS', 'BUSTER_V2_MAX_QUEUED_JOBS', 'BUSTER_V2_MAX_CONCURRENT_ATTEMPTS']) {
      for (const value of ['', '2', '8', '16', '64']) {
        assert.throws(() => rejectLegacyAuthors({ SWARM_CONFIG: file, [name]: value }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
      }
    }
    assert.ok(Object.isFrozen(settings)); assert.ok(Object.isFrozen(settings.admission));
    document['buster-engine'].profiles.runtime.settings.admission.maximumActiveJobs = 7;
    writeTestPipeline(file, document);
    assert.equal(settings.admission.maximumActiveJobs, 2);
    assert.equal(loadSelected(file, document).admission.maximumActiveJobs, 7);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const profile of [
  { maximumActiveJobs: 1, maximumQueuedJobs: 1, maximumConcurrentAttempts: 3 },
  { maximumActiveJobs: 3, maximumQueuedJobs: 2, maximumConcurrentAttempts: 3 },
]) {
  test(`actual queue/drain/replay consumes authored profile ${JSON.stringify(profile)}`, { timeout: 30000 }, async () => {
    const f = await admissionFixture(profile);
    try {
      await f.service.recover();
      const weight = profile.maximumActiveJobs === 1 ? 1 : 2;
      const first = f.job('first', weight), second = f.job('second', weight);
      await f.service.submit(first); await f.started.get(first.jobId)!.promise;
      f.profile.document['buster-engine'].profiles.runtime.settings.admission = { maximumActiveJobs: 10, maximumQueuedJobs: 10, maximumConcurrentAttempts: 64 };
      writeTestPipeline(f.profile.file, f.profile.document);
      assert.equal(loadSelected(f.profile.file, f.profile.document).admission.maximumActiveJobs, 10);
      await f.service.submit(second);
      assert.equal((await f.service.status(second.jobId)).state, 'accepted');
      const waiting = [second];
      if (profile.maximumQueuedJobs === 2) {
        const third = f.job('third', 1); await f.service.submit(third); waiting.push(third);
        assert.equal((await f.service.status(third.jobId)).state, 'accepted');
      }
      await assert.rejects(f.service.submit(f.job('over-queue', 1)), /BUSTER_REMOTE_ADMISSION_FULL/);
      assert.equal((await f.service.submit(second)).jobId, second.jobId, 'known replay bypasses full queue');
      await assert.rejects(f.service.submit(f.job('over-weight', 4)), /BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT/);
      assert.equal((await f.store.records()).length, waiting.length + 1, 'rejections create no accepted record');
      await f.service.cancel(first.jobId); await f.started.get(second.jobId)!.promise;
      assert.equal((await f.service.status(second.jobId)).state, 'running');
      if (profile.maximumActiveJobs === 3) {
        await f.started.get(waiting[1]!.jobId)!.promise;
        assert.equal((await f.service.status(waiting[1]!.jobId)).state, 'running');
      }
    } finally { await f.close(); }
  });
}

test('startup recovery durably rejects accepted jobs exceeding the newly authored concurrency limit', { timeout: 30000 }, async () => {
  const f = await admissionFixture({ maximumActiveJobs: 2, maximumQueuedJobs: 2, maximumConcurrentAttempts: 1 });
  try {
    const job = f.job('restart-over-capacity', 2);
    await f.store.accept(job, new Date().toISOString());
    await f.service.recover();
    const status = await f.service.status(job.jobId);
    assert.equal(status.state, 'failed'); assert.equal(status.error, 'BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT');
    await f.service.recover(); assert.deepEqual(await f.service.status(job.jobId), status);
    assert.equal((await f.store.get(job.jobId)).payload.source, null);
  } finally { await f.close(); }
});
