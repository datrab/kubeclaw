import { canonicalPipelineEntry, readTestPipeline, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';
import { captureSwarmSettings, type BusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { HistoricalBusterPlanJobStore } from '../../../skills/buster/engine/test-gates/historical-plan-store.ts';
import { createRemotePlanJob } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { buildCommittedSourceSnapshot } from '../../../skills/nova/core/test-gates/source-snapshot.ts';
import { validateHistoricalImportBatch } from '../../../skills/buster/engine/test-gates/preparation-historical-batch.ts';
import { digestHistoricalFile } from '../../../skills/buster/engine/test-gates/preparation-historical-ledger.ts';
import { payloadDigest } from '../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { plan, completed } from '../../fixtures/test-gate/remote-plan.mts';

const execute = promisify(execFile);
const now = '2026-09-21T00:00:00.000Z';
const child = fileURLToPath(new URL('../../fixtures/test-gate/historical-import-child.mts', import.meta.url));

test('real historical producer preserves full and compacted jobs in the fixed-UID filesystem import slice', { timeout: 30000 }, async t => {
  assert.equal(process.getuid?.(), 0, 'requires real isolated guest root; no skip or fake UID');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-historical-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.chmod(root, 0o755);
  const repository = path.join(root, 'repository');
  await fs.mkdir(repository);
  await fs.writeFile(path.join(repository, 'source.bin'), crypto.randomBytes(32768));
  const git = async (...args: string[]) => (await execute('git', ['-C', repository, ...args])).stdout.trim();
  await git('init', '-q'); await git('add', '.');
  await git('-c', 'user.name=Import Fixture', '-c', 'user.email=import@example.invalid', 'commit', '-qm', 'source');
  await git('tag', 'retained-import-source');
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const snapshot = await buildCommittedSourceSnapshot({ repositoryRoot: repository, repositoryId: 'repository:import',
    pipelineStageId: 'test', creatorAuthority: 'nova:import',
    attestationPrivateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), maximumArchiveBytes: 1048576 });
  const storeRoot = path.join(root, 'state');
  const store = new HistoricalBusterPlanJobStore(storeRoot, {
    recordLimits: { maximumRecords: 20, maximumBytes: 16777216, maximumRecordBytes: 1048576 },
    maximumArchiveBytes: 1048576, maximumResultBytes: 1048576, maximumResultStoreBytes: 16777216,
    trustedSourceAuthority: 'nova:import', sourceAttestationPublicKey: publicKey,
  });
  const makeJob = (id: string) => createRemotePlanJob({ idempotencyKey: id, plan: plan('blocking', null),
    pipelineStageId: 'test', ...snapshot, grants: new Map(), maximumConcurrency: 1, submittedAt: now });
  const full = makeJob('import:full'), compacted = makeJob('import:compacted');
  const fullStatus = await store.accept(full, now);
  await store.accept(compacted, now);
  await store.transition(compacted.jobId, ['accepted'], 'running', now);
  const completedStatus = await store.complete(compacted.jobId, completed(compacted, { outcome: 'passed' }).result, now);
  const beforeCompaction = await store.get(compacted.jobId);
  const compactedResult = await store.compactCompletedArchive({ operationId: 'manual:import', actor: 'fixture',
    jobId: compacted.jobId, expectedPayloadDigest: beforeCompaction.record.payloadDigest, maximumEvidenceBytes: 1048576,
    source: { repositoryId: 'repository:import', repositoryRoot: repository,
      retainedRef: 'refs/tags/retained-import-source', retention: 'until-project-deletion' } }, path.join(root, 'runtime'));
  const originalFile = path.join(storeRoot, 'records', 'store.json');
  const originalBytes = await fs.readFile(originalFile);
  await fs.chmod(originalFile, 0o444);
  const descriptor = await digestHistoricalFile(originalFile, 16777216);
  // Current complete central authors and the actual consumed-owner tuple. This
  // filesystem-import fixture does not authenticate a productive boot or v10.
  const capture = captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline()));
  const settings = { ...(capture.components['buster-engine']!.settings as unknown as BusterSettings).preparation,
    maximumActivePreparations: 1 };
  const importId = 'a'.repeat(32), sourceRoot = path.join(root, 'sources'), group = path.join(sourceRoot, importId);
  await fs.mkdir(sourceRoot, { mode: 0o755 }); await fs.mkdir(group, { mode: 0o1770 });
  await fs.chown(group, 0, 1003); await fs.chmod(group, 0o1770);
  const context = { importId, preparationUid: 1003, attemptSpecDigest: `sha256:${'b'.repeat(64)}`,
    descriptor, settings, trustedSourceAuthority: 'nova:import', sourceAttestationPublicKey: publicKey };
  const contextFile = path.join(root, 'context.json'); await fs.writeFile(contextFile, JSON.stringify(context), { mode: 0o444 });
  const run = await execute('/usr/bin/setpriv', ['--reuid=1003', '--regid=1003', '--clear-groups', process.execPath,
    child, contextFile, originalFile, sourceRoot], { timeout: 20000, maxBuffer: 1048576 });
  const output = JSON.parse(run.stdout);
  assert.equal(output.uid, 1003); assert.equal(output.gid, 1003);
  assert.equal(output.result.recordCount, 2); assert.equal(output.result.wireCount, 1);
  const candidate = JSON.parse(await fs.readFile(path.join(group, 'data', 'metadata-v2', 'records', 'store.json'), 'utf8'));
  validateHistoricalImportBatch(candidate, descriptor, importId);
  assert.deepEqual(candidate.records[0].payload.status, fullStatus);
  assert.deepEqual(candidate.records[1].payload.status, completedStatus);
  assert.deepEqual(candidate.records[1].payload.historical.compaction, compactedResult.receipt);
  assert.equal(candidate.records[1].payload.input, null);
  assert.equal(candidate.records[0].payloadDigest, payloadDigest(candidate.records[0].payload));
  assert.notEqual(candidate.records[0].payloadDigest, candidate.records[0].payload.input.originalPayloadDigest);
  await assert.rejects(fs.stat(path.join(group, 'data', 'inputs', '2')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(originalFile), originalBytes, 'original complete records/receipts remain byte-identical');
  const wire = await fs.readFile(path.join(group, 'data', 'inputs', '1', 'request.json'));
  assert.deepEqual(wire, Buffer.from(JSON.stringify(full)));
  assert.equal((await fs.stat(path.join(group, 'data', 'inputs', '1', 'input.json'))).mode & 0o777, 0o444);
  const charges = output.reservations;
  assert.ok(charges.at(-1).bytes >= originalBytes.length + wire.length);
  assert.equal(charges.at(-1).records, 4, 'retained V1 and candidate V2 records both count');
  const refusedId = 'c'.repeat(32), refusedGroup = path.join(sourceRoot, refusedId);
  await fs.mkdir(refusedGroup, { mode: 0o1770 }); await fs.chown(refusedGroup, 0, 1003); await fs.chmod(refusedGroup, 0o1770);
  const refusedContext = path.join(root, 'context-one-short.json');
  await fs.writeFile(refusedContext, JSON.stringify({ ...context, importId: refusedId,
    settings: { ...settings, maximumMetadataBytes: charges.at(-1).metadataBytes - 1 } }), { mode: 0o444 });
  await assert.rejects(execute('/usr/bin/setpriv', ['--reuid=1003', '--regid=1003', '--clear-groups', process.execPath,
    child, refusedContext, originalFile, sourceRoot], { timeout: 20000, maxBuffer: 1048576 }),
  error => error instanceof Error && error.message.includes('BUSTER_HISTORICAL_STORAGE_LIMIT'));
  await assert.rejects(fs.stat(path.join(refusedGroup, 'data', 'metadata-v2')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(originalFile), originalBytes);
});
