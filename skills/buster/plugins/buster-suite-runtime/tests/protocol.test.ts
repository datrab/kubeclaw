import assert from 'node:assert/strict';
import {
  JOB_SCHEMA,
  materializeRepositoryValues,
  parseJob,
  relocateRepositoryValues,
  sha256,
} from '../src/protocol.ts';

const archive = Buffer.from('archive');
const job = {
  schemaVersion: JOB_SCHEMA,
  jobId: `job:${'a'.repeat(32)}`,
  idempotencyKey: 'effect:test',
  archive: {
    encoding: 'base64',
    sha256: sha256(archive),
    bytes: archive.byteLength,
    data: archive.toString('base64'),
  },
  suites: ['unit'],
  testConfig: { suite_timeout_ms: 1000, project: '/source/project' },
  task: { root: '/source', nested: ['/source/file.txt'] },
  capabilities: [],
  timeoutMs: 1000,
};

assert.equal(parseJob(job, 1024).jobId, `job:${'a'.repeat(32)}`);
assert.throws(
  () => parseJob({ ...job, extra: true }, 1024),
  /BUSTER_JOB_UNKNOWN_FIELD:extra/u,
);
assert.throws(
  () => parseJob({
    ...job,
    archive: { ...job.archive, sha256: '0'.repeat(64) },
  }, 1024),
  /BUSTER_JOB_ARCHIVE_DIGEST_MISMATCH/u,
);
assert.throws(
  () => parseJob({ ...job, capabilities: ['image_build'] }, 1024),
  /BUSTER_JOB_CAPABILITIES_INVALID/u,
);
const relocated = relocateRepositoryValues(job.task, '/source');
assert.deepEqual(relocated, { root: 'repo://', nested: ['repo://file.txt'] });
assert.deepEqual(
  materializeRepositoryValues(relocated, '/worker/repository'),
  { root: '/worker/repository', nested: ['/worker/repository/file.txt'] },
);
assert.throws(
  () => materializeRepositoryValues('repo://../secret', '/worker/repository'),
  /BUSTER_JOB_REPOSITORY_PATH_INVALID/u,
);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.buster-suite-runtime', suite: 'protocol' }));
