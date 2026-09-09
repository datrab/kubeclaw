import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { buildRegistry, discoverPackages, resolveTestPlan, createProductionNovaTestGate } from '@kubeclaw/nova-core';
import { FileBusterPlanJobStore, BusterRemotePlanService } from '@kubeclaw/buster-engine';
import { createBusterRemotePlanHttpServer } from '../../../skills/buster/engine/test-gates/remote-plan-http.ts';
import { FileNovaRemotePlanStore, NovaRemotePlanDispatcher, HttpRemotePlanTransport } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { FileNovaGateImportStore } from '../../../skills/nova/core/test-gates/remote-result-import.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { dispatchProjectionDigest } from '../../../skills/nova/core/test-gates/dispatch-projection.ts';
import { remotePlanJobDigest, remotePlanJobId } from '@kubeclaw/pipeline-test-gate-contract';
import { runPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { withRunMutationLock } from '../../../skills/nova/core/execution/run-mutation.ts';
import { budgetFixture } from './repair-budget-fixture.mjs';
import { retireNovaDispatch } from '../../../scripts/retire-nova-dispatch.mjs';

const recordLimits = { maximumRecords: 100, maximumBytes: 8 * 1024 ** 2, maximumRecordBytes: 2 * 1024 ** 2 };
const dispatchOptions = { recordLimits, maximumArchiveBytes: 1024 ** 2, maximumArchiveStoreBytes: 4 * 1024 ** 2 };
const importOptions = { recordLimits, maximumEvidenceStoreBytes: 4 * 1024 ** 2 };
const token = 'original-dispatch-projection-local-http-token';
const now = '2026-09-09T00:00:00.000Z';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const recordsFile = root => path.join(root, 'records/store.json');
const blobFile = (root, digest) => path.join(root, 'blobs/sha256', digest.slice(7, 9), digest.slice(9));
const newJob = (job, key) => {
  const value = { ...job, idempotencyKey: key, jobId: remotePlanJobId(key) };
  return { ...value, requestDigest: remotePlanJobDigest(value) };
};

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-dispatch-projection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const core = budgetFixture(root), runId = 'run:dispatch-projection';
  await runPipelineV2(core.platform, core.definition, runId);
  const run = runRoot(core.platform.storageRoot, runId);
  fs.writeFileSync(path.join(core.repository, 'retained-original.bin'), crypto.randomBytes(32768));
  git(core.repository, 'add', '.');
  git(core.repository, '-c', 'user.name=Regression', '-c', 'user.email=regression@example.invalid', 'commit', '-qm', 'Retained source bytes');
  const plugins = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
    trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'projection' } }));
  let requests = 0;
  const target = http.createServer((_request, response) => { requests++; response.end('original receiver'); });
  target.listen(0, '127.0.0.1'); await once(target, 'listening');
  t.after(() => new Promise(resolve => target.close(resolve)));
  const origin = `http://127.0.0.1:${target.address().port}`;
  const limits = { cpuMillis: 30000, memoryBytes: 536870912, logBytes: 1048576, artifactBytes: 1048576, artifactFiles: 16, processes: 16 };
  const plan = resolveTestPlan({ planId: 'plan:dispatch-projection', runId, project: 'projection', scope: { moduleId: 'api', gateId: null },
    createdAt: now, registry, suiteTemplates: [], declaration: { tests: { health: { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 0,
      config: { url: origin, path: '/health', expectedStatuses: [200], expectedText: 'original receiver' } } } },
    facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy: { defaultTimeoutMs: 30000, maximumTimeoutMs: 30000,
      defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 2,
      defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
  const keys = crypto.generateKeyPairSync('ed25519');
  const buster = new FileBusterPlanJobStore(path.join(root, 'buster'), { recordLimits,
    maximumArchiveBytes: 1024 ** 2, maximumResultBytes: 1024 ** 2, maximumResultStoreBytes: 4 * 1024 ** 2,
    trustedSourceAuthority: 'nova:projection', sourceAttestationPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) });
  const service = new BusterRemotePlanService({ store: buster, registry, workerRevision: 'a'.repeat(40), runtimeRoot: path.join(root, 'buster-runtime'),
    tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 ** 2, allowedCapabilities: new Set(['network.http']),
    networkHttp: { allowedOrigins: [origin], allowedHostSuffixes: [], allowedPorts: [target.address().port], maximumResponseBytes: 1024 ** 2, maximumExecutionMs: 30000 } });
  const server = createBusterRemotePlanHttpServer({ service, token, maximumRequestBytes: 2 * 1024 ** 2, maximumResponseBytes: 1024 ** 2, maximumResultBytes: 1024 ** 2 });
  let posts = 0;
  server.on('request', request => { if (request.method === 'POST') posts++; });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await service.shutdown(5000); await new Promise(resolve => server.close(resolve)); });
  const endpoint = `http://127.0.0.1:${server.address().port}`, stateRoot = path.join(root, 'nova-gates');
  const gate = createProductionNovaTestGate({ stateRoot, endpoint, token, sourceAuthority: 'nova:projection',
    sourceAttestationPrivateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), pollMilliseconds: 10,
    maximumResponseBytes: 1024 ** 2, maximumResultBytes: 1024 ** 2, ...dispatchOptions,
    maximumEvidenceBytes: 1024 ** 2, maximumEvidenceStoreBytes: importOptions.maximumEvidenceStoreBytes });
  const response = await gate.execute({ idempotencyKey: 'projection:original', pipelineStageId: 'test', plan,
    repositoryRoot: core.repository, repositoryId: 'repository:projection', grants: new Map([['health', ['network.http']]]),
    maximumConcurrency: 1, submittedAt: now, timeoutMs: 30000 });
  assert.equal(response.remote.status.state, 'completed');
  const dispatchRoot = path.join(stateRoot, 'dispatch'), importRoot = path.join(stateRoot, 'imports');
  const recorded = json(recordsFile(dispatchRoot)).records[0], imported = json(recordsFile(importRoot)).records[0];
  assert.equal(imported.payload.state, 'complete'); assert.ok(imported.payload.remoteResult);
  assert.equal(imported.payload.remoteResult.attempts.length, 1);
  assert.notEqual(imported.payload.remoteResult.nodes[0].state, 'skipped');
  assert.deepEqual(imported.payload.decision, response.remote.decision);
  // The original engine's actual error is valid confirmed history. This is NOT
  // a claim that a blocked native provider succeeded or a fabricated green run.
  console.log(JSON.stringify({ storagePositive: 'original-complete-import', decision: response.remote.decision.state,
    originalAttempt: imported.payload.remoteResult.attempts[0].summary, nativeHttpRequests: requests, originalDispatchPosts: posts }));
  const job = recorded.payload.job, intent = { operationId: 'projection:manual', actor: 'operator:local', runId,
    runRoot: run, dispatchRoot, importRoot, jobId: job.jobId, requestDigest: job.requestDigest,
    expectedPayloadDigest: recorded.payloadDigest, importPayloadDigest: imported.payloadDigest,
    runJournalHead: JSON.parse(fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').at(-1)).hash,
    snapshotDigest: json(path.join(run, 'run-snapshot.json')).digest };
  const scope = { schemaVersion: 'nova-dispatch-retirement-scope.v1', action: 'compact-imported-dispatch-archive',
    novaStorageRoot: core.platform.storageRoot, stateRoot, dispatchOptions, importOptions, intent,
    inventoryLimits: { maximumFiles: 10000, maximumTotalBytes: 64 * 1024 ** 2, maximumSnapshotBytes: 8 * 1024 ** 2 } };
  return { root, core, run, runId, scope, job, imported, endpoint, buster, posts: () => posts, requests: () => requests };
}

test('original completed import projects duplicate bytes with real quotas and exact HTTP replay', { timeout: 60000 }, async t => {
  const f = await fixture(t), file = recordsFile(f.scope.intent.dispatchRoot), before = fs.readFileSync(file);
  const importBytes = fs.readFileSync(recordsFile(f.scope.intent.importRoot));
  const blob = blobFile(f.scope.intent.dispatchRoot, f.job.repositoryArchive.contentDigest), archive = fs.readFileSync(blob);
  const second = newJob(f.job, 'projection:active');
  const quota = { ...dispatchOptions, recordLimits: { ...recordLimits, maximumBytes: before.length + 8192, maximumRecords: 2 } };
  const store = new FileNovaRemotePlanStore(f.scope.intent.dispatchRoot, quota);
  await assert.rejects(store.persistBeforeDispatch(second), /DURABLE_RECORD_STORE_FULL/);
  const scope = { ...f.scope, dispatchOptions: quota };
  const receipt = await retireNovaDispatch(scope);
  assert.equal(receipt.newlyProjected, true); assert.equal(receipt.releasedBytes, before.length - fs.statSync(file).size);
  assert.ok(receipt.releasedBytes > 32768);
  assert.deepEqual(fs.readFileSync(blob), archive); assert.deepEqual(fs.readFileSync(recordsFile(f.scope.intent.importRoot)), importBytes);
  assert.equal(json(file).records.length, 1); assert.equal(json(file).records[0].payload.schemaVersion, 'nova-remote-plan-dispatch-projected.v1');
  assert.equal('data' in json(file).records[0].payload.job.repositoryArchive, false);
  assert.deepEqual(await store.load(f.job.jobId), f.job);
  assert.deepEqual(await store.persistBeforeDispatch(f.job), f.job);
  assert.equal('data' in json(file).records[0].payload.job.repositoryArchive, false);
  assert.deepEqual(await retireNovaDispatch(scope), { ...receipt, newlyProjected: false, releasedBytes: 0 });
  await store.persistBeforeDispatch(second);
  assert.equal(json(file).records.length, 2);
  await assert.rejects(store.persistBeforeDispatch(newJob(f.job, 'projection:third')), /DURABLE_RECORD_STORE_FULL/);
  const imports = new FileNovaGateImportStore(f.scope.intent.importRoot, importOptions);
  const graphBefore = await imports.readExecutionGraphs(), posts = f.posts(), requests = f.requests();
  const transport = new HttpRemotePlanTransport({ endpoint: f.endpoint, token, maximumResponseBytes: 1024 ** 2 });
  const dispatcher = new NovaRemotePlanDispatcher({ store: new FileNovaRemotePlanStore(f.scope.intent.dispatchRoot, quota), transport, pollMilliseconds: 10 });
  const terminal = await dispatcher.dispatch(f.job, { timeoutMs: 5000 });
  assert.equal(terminal.state, 'completed'); assert.equal(f.posts(), posts); assert.equal(f.requests(), requests);
  assert.deepEqual(await new FileNovaGateImportStore(f.scope.intent.importRoot, importOptions).readExecutionGraphs(), graphBefore);
  assert.deepEqual(json(recordsFile(f.scope.intent.importRoot)).records[0].payload.decision, f.imported.payload.decision);
  assert.equal((await f.buster.records()).length, 1);
});

test('original legacy crash repair stays available; projected missing and corrupt authority cannot be repaired from replay input', { timeout: 60000 }, async t => {
  const f = await fixture(t), root = f.scope.intent.dispatchRoot, blob = blobFile(root, f.job.repositoryArchive.contentDigest);
  const store = new FileNovaRemotePlanStore(root, dispatchOptions), bytes = fs.readFileSync(blob);
  fs.unlinkSync(blob);
  await assert.rejects(retireNovaDispatch(f.scope), /DURABLE_BLOB_NOT_FOUND/);
  assert.deepEqual(await store.load(f.job.jobId), f.job);
  await retireNovaDispatch(f.scope);
  fs.unlinkSync(blob);
  await assert.rejects(store.load(f.job.jobId), /DURABLE_BLOB_NOT_FOUND/);
  await assert.rejects(store.persistBeforeDispatch(f.job), /DURABLE_BLOB_NOT_FOUND/);
  assert.equal(fs.existsSync(blob), false);
  fs.writeFileSync(blob, Buffer.alloc(bytes.length, 4));
  await assert.rejects(store.load(f.job.jobId), /DURABLE_BLOB_INTEGRITY_FAILED/);
  fs.writeFileSync(blob, bytes);
  assert.deepEqual(await store.load(f.job.jobId), f.job);
});

test('manual scope rejects stale CAS/import/run, foreign and aliased paths, and active original run owner', { timeout: 60000 }, async t => {
  const f = await fixture(t), before = fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot));
  for (const field of ['expectedPayloadDigest', 'importPayloadDigest', 'requestDigest', 'runJournalHead', 'snapshotDigest']) {
    await assert.rejects(retireNovaDispatch({ ...f.scope, intent: { ...f.scope.intent, [field]: `sha256:${'0'.repeat(64)}` } }));
  }
  await assert.rejects(retireNovaDispatch({ ...f.scope, intent: { ...f.scope.intent, importRoot: f.scope.intent.dispatchRoot } }), /INTENT_INVALID|STORE_BINDING/);
  const imports = f.scope.intent.importRoot, saved = `${imports}-saved`;
  fs.renameSync(imports, saved); fs.symlinkSync(saved, imports);
  await assert.rejects(retireNovaDispatch(f.scope), /ROOT_DIRECTORY_INVALID/);
  fs.unlinkSync(imports); fs.renameSync(saved, imports);
  await withRunMutationLock(f.run, async () => {
    await assert.rejects(retireNovaDispatch(f.scope), /PIPELINE_RUN_MUTATION_LOCKED/);
  });
  assert.deepEqual(fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot)), before);
  assert.equal((await retireNovaDispatch(f.scope)).newlyProjected, true);
});

test('independent unrelated original Core run cannot authorize a foreign dispatch by sharing its runId', { timeout: 60000 }, async t => {
  const f = await fixture(t), unrelated = path.join(f.root, 'unrelated-core');
  fs.mkdirSync(unrelated);
  const core = budgetFixture(unrelated);
  await runPipelineV2(core.platform, core.definition, f.runId);
  const otherRun = runRoot(core.platform.storageRoot, f.runId);
  assert.notEqual(otherRun, f.run);
  assert.notEqual(core.repository, f.core.repository);
  const before = fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot));
  const scope = { ...f.scope, novaStorageRoot: core.platform.storageRoot, intent: { ...f.scope.intent,
    runRoot: otherRun,
    runJournalHead: JSON.parse(fs.readFileSync(path.join(otherRun, 'events.jsonl'), 'utf8').trim().split('\n').at(-1)).hash,
    snapshotDigest: json(path.join(otherRun, 'run-snapshot.json')).digest } };
  await assert.rejects(retireNovaDispatch(scope), /NOVA_DISPATCH_RETENTION_/u);
  assert.deepEqual(fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot)), before);
});
