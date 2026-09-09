import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { FileBusterPlanJobStore, BusterRemotePlanService } from '@kubeclaw/buster-engine';
import { createBusterRemotePlanHttpServer } from '../../../skills/buster/engine/test-gates/remote-plan-http.ts';
import { FileNovaRemotePlanStore, NovaRemotePlanDispatcher, HttpRemotePlanTransport } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { FileNovaGateImportStore } from '../../../skills/nova/core/test-gates/remote-result-import.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { remotePlanJobDigest, remotePlanJobId } from '@kubeclaw/pipeline-test-gate-contract';
import { runPipelineV2, reopenBlockedPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
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
  t.after(() => { if (!process.env.KEEP_PROJECTION_TMP) fs.rmSync(root, { recursive: true, force: true }); });
  if (process.env.KEEP_PROJECTION_TMP) console.log(JSON.stringify({ fixtureRoot: root }));
  const repository = path.join(root, 'repository'), runId = 'run:dispatch-projection';
  fs.mkdirSync(repository); git(repository, 'init', '-q');
  fs.writeFileSync(path.join(repository, 'retained-original.bin'), crypto.randomBytes(32768));
  git(repository, 'add', '.');
  git(repository, '-c', 'user.name=Regression', '-c', 'user.email=regression@example.invalid', 'commit', '-qm', 'Retained source bytes');
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
  const envToken = `PROJECTION_TOKEN_${crypto.randomBytes(8).toString('hex').toUpperCase()}`, envSource = `${envToken}_SOURCE`;
  process.env[envToken] = token; process.env[envSource] = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  t.after(() => { delete process.env[envToken]; delete process.env[envSource]; });
  const roots = ['common', 'nova'].map(role => path.resolve(`skills/${role}/plugins`));
  const artifactId = 'kubeclaw.artifact-store:artifact-store', remoteId = 'kubeclaw.remote-test-gate:plan';
  const runtimeId = 'kubeclaw.runtime-dispatch:runtime', networkId = 'kubeclaw.network-http:http', secretId = 'kubeclaw.secret-resolver:secrets';
  const platform = { schemaVersion: 'pipeline-platform.v2', installationRoots: roots, trustedBuiltinRoots: roots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: { 'test.plan.execute': remoteId, 'runtime.dispatch': runtimeId, 'network.http': networkId,
      'secrets.read': secretId, 'artifacts.read': artifactId, 'artifacts.write': artifactId },
    grants: { 'kubeclaw.buster-quality-gate:quality': { 'test.plan.execute': { allowedRoots: [repository] },
      'runtime.dispatch': { allowedAgents: ['unused'] }, 'artifacts.read': { allowedNamespaces: ['kubeclaw.implementation-agent'] },
      'artifacts.write': { allowedNamespaces: ['kubeclaw.buster-quality-gate'] } },
      [remoteId]: { 'secrets.read': { allowedNames: ['worker', 'source'] } },
      [runtimeId]: { 'network.http': { allowedOrigins: [endpoint] }, 'secrets.read': { allowedNames: ['worker'] } } },
    adapters: { [remoteId]: { endpoint, authentication: 'bearer', tokenSecret: 'worker', sourcePrivateKeySecret: 'source',
      sourceAuthority: 'nova:projection', stateRoot, allowedRepositoryRoots: [repository] },
      [artifactId]: { artifactRoot: path.join(root, 'artifacts') },
      [secretId]: { environment: { worker: envToken, source: envSource } },
      [runtimeId]: { targets: { unused: { endpoint: `${endpoint}/dispatch`, tokenSecret: 'worker' } } },
      [networkId]: { allowedOrigins: [endpoint], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'authorization'] } },
    activeAdapters: [remoteId, artifactId, secretId, runtimeId, networkId], observers: {},
    storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 5000, orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [{ type: 'administrator', id: 'admin:projection' }] };
  const definition = { schemaVersion: 'pipeline-definition.v2', id: 'pipeline:projection', maxConcurrency: 1,
    stages: [{ id: 'test', type: 'kubeclaw.test.quality-evaluation', dependsOn: [], config: { testAgentEnabled: false },
      execution: { maxAttempts: 1, maxRemediationCycles: 1, timeoutMs: 30000 },
      input: { gateId: 'test', task: 'Exercise original retained dispatch history', providerPlan: { repositoryRoot: repository,
        repositoryId: 'repository:projection', revision: git(repository, 'rev-parse', 'HEAD'), plan,
        grants: { health: ['network.http'] }, maximumConcurrency: 1, submittedAt: now, timeoutMs: 30000 } } }] };
  const core = { repository, platform, definition };
  let coreResult = await runPipelineV2(platform, definition, runId);
  const run = runRoot(platform.storageRoot, runId);
  if (coreResult.status === 'blocked') {
    const decision = { schemaVersion: 'administrative-reopen.v2', decisionId: 'decision:projection-cancel', idempotencyKey: 'projection:cancel',
      runId, stageId: 'test', actor: { type: 'administrator', id: 'admin:projection' },
      reason: { code: 'test.cancel_disposable_failed_run' }, continuation: 'cancel', decidedAt: new Date().toISOString() };
    coreResult = await reopenBlockedPipelineV2(platform, definition, decision, value => value.actor);
  }
  assert.ok(['cancelled', 'succeeded', 'failed'].includes(coreResult.status), coreResult.status);
  const dispatchRoot = path.join(stateRoot, 'dispatch'), importRoot = path.join(stateRoot, 'imports');
  const recorded = json(recordsFile(dispatchRoot)).records[0], imported = json(recordsFile(importRoot)).records[0];
  assert.equal(imported.payload.state, 'complete'); assert.ok(imported.payload.remoteResult);
  assert.equal(imported.payload.remoteResult.attempts.length, 1);
  assert.notEqual(imported.payload.remoteResult.nodes[0].state, 'skipped');
  // The original engine's actual error is valid confirmed history. This is NOT
  // a claim that a blocked native provider succeeded or a fabricated green run.
  console.log(JSON.stringify({ storagePositive: 'original-Core-quality-stage-complete-import', decision: imported.payload.decision.state,
    coreStatus: coreResult.status, originalAttempt: imported.payload.remoteResult.attempts[0].summary, nativeHttpRequests: requests, originalDispatchPosts: posts }));
  const job = recorded.payload.job, intent = { operationId: 'projection:manual', actor: 'operator:local', runId,
    runRoot: run, dispatchRoot, importRoot, jobId: job.jobId, requestDigest: job.requestDigest,
    expectedPayloadDigest: recorded.payloadDigest, importPayloadDigest: imported.payloadDigest,
    runJournalHead: JSON.parse(fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').at(-1)).hash,
    snapshotDigest: json(path.join(run, 'run-snapshot.json')).digest };
  const scope = { schemaVersion: 'nova-dispatch-retirement-scope.v1', action: 'compact-imported-dispatch-archive',
    novaStorageRoot: core.platform.storageRoot, orchestratorIssuerId: core.platform.orchestratorIssuerId, stateRoot, dispatchOptions, importOptions, intent,
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

test('independent canonical-invalid original selected request cannot authorize retention after honest hash-chain recomputation', { timeout: 60000 }, async t => {
  const f = await fixture(t), file = path.join(f.run, 'effects.jsonl');
  const original = fs.readFileSync(file, 'utf8');
  const entries = original.trim().split('\n').map(line => JSON.parse(line).entry);
  let changed = 0;
  for (const entry of entries) {
    if (entry.request?.idempotencyKey === f.job.idempotencyKey) {
      entry.request.requestedAt = 'not-a-date'; changed++;
    }
  }
  assert.equal(changed, 2);
  let previousHash = null;
  const records = entries.map((entry, index) => {
    const value = { sequence: index + 1, previousHash, entry };
    const hash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
    previousHash = hash;
    return { ...value, hash };
  });
  fs.writeFileSync(file, records.map(record => JSON.stringify(record)).join('\n') + '\n');
  const before = fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot));
  await assert.rejects(retireNovaDispatch(f.scope));
  assert.deepEqual(fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot)), before);
});

test('independent selected stage, attempt, source, plan and adapter corruptions cannot authorize metadata release', { timeout: 60000 }, async t => {
  const f = await fixture(t), file = path.join(f.run, 'effects.jsonl');
  const original = fs.readFileSync(file, 'utf8'), before = fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot));
  const changes = [
    ['stage', request => { request.attempt.stageId = 'foreign-stage'; }],
    ['attempt', request => { request.attempt.attemptNumber++; }],
    ['source', request => { request.payload.revision = '0'.repeat(40); }],
    ['plan', request => { request.payload.plan.planId = 'plan:foreign'; }],
  ];
  function rewrite(entries) {
    let previousHash = null;
    const records = entries.map((entry, index) => {
      const value = { sequence: index + 1, previousHash, entry };
      const hash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
      previousHash = hash;
      return { ...value, hash };
    });
    fs.writeFileSync(file, records.map(record => JSON.stringify(record)).join('\n') + '\n');
  }
  for (const [name, change] of changes) {
    const entries = original.trim().split('\n').map(line => JSON.parse(line).entry);
    const requests = entries.filter(entry => entry.request?.idempotencyKey === f.job.idempotencyKey);
    assert.equal(requests.length, 2);
    for (const entry of requests) change(entry.request);
    rewrite(entries);
    await assert.rejects(retireNovaDispatch(f.scope), undefined, name);
    assert.deepEqual(fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot)), before, name);
  }
  const entries = original.trim().split('\n').map(line => JSON.parse(line).entry);
  const completion = entries.find(entry => entry.receipt?.idempotencyKey === f.job.idempotencyKey);
  assert.ok(completion);
  completion.receipt.adapter.registrationId = 'foreign-adapter';
  rewrite(entries);
  await assert.rejects(retireNovaDispatch(f.scope));
  assert.deepEqual(fs.readFileSync(recordsFile(f.scope.intent.dispatchRoot)), before);
  fs.writeFileSync(file, original);
  assert.equal((await retireNovaDispatch(f.scope)).newlyProjected, true);
});

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
}

test('actual operator run/import/dispatch fence order rejects a competing dispatch writer without losing its job', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  const moduleURL = new URL('../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    const { FileDurableRecordStore } = await import(process.argv[1]);
    const store = new FileDurableRecordStore(process.argv[2], JSON.parse(process.argv[3]));
    await store.withRecords('remote-gate-imports', async records => {
      process.send({ held: records.length });
      await new Promise(resolve => process.once('message', resolve));
    });
    process.disconnect();
  `, moduleURL, f.scope.intent.importRoot, JSON.stringify(recordLimits)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  t.after(() => stop(child));
  const [held] = await once(child, 'message'); assert.equal(held.held, 1);
  let finished = false;
  const operation = retireNovaDispatch(f.scope).finally(() => { finished = true; });
  const rejected = assert.rejects(operation, /NOVA_DISPATCH_RETENTION_BLOCKED:SNAPSHOT_CHANGED/);
  await delay(200); assert.equal(finished, false);
  await assert.rejects(withRunMutationLock(f.run, async () => undefined), /PIPELINE_RUN_MUTATION_LOCKED/);
  const concurrent = newJob(f.job, 'projection:concurrent-writer');
  await new FileNovaRemotePlanStore(f.scope.intent.dispatchRoot, dispatchOptions).persistBeforeDispatch(concurrent);
  const exited = once(child, 'exit'); child.send({ release: true });
  assert.equal((await exited)[0], 0); await rejected;
  const store = new FileNovaRemotePlanStore(f.scope.intent.dispatchRoot, dispatchOptions);
  assert.deepEqual(await store.load(concurrent.jobId), concurrent);
  assert.deepEqual(await store.load(f.job.jobId), f.job);
  assert.equal(json(recordsFile(f.scope.intent.dispatchRoot)).records[0].payload.schemaVersion, 'nova-remote-plan-dispatch.v1');
  assert.equal((await retireNovaDispatch(f.scope)).newlyProjected, true);
  assert.deepEqual(await store.load(concurrent.jobId), concurrent);
});

test('actual SIGKILL at original dispatch atomic-write boundary preserves exact replay and permits original recovery', { timeout: 60000 }, async t => {
  const f = await fixture(t), directory = path.dirname(recordsFile(f.scope.intent.dispatchRoot));
  const imports = fs.readFileSync(recordsFile(f.scope.intent.importRoot));
  const blob = blobFile(f.scope.intent.dispatchRoot, f.job.repositoryArchive.contentDigest), bytes = fs.readFileSync(blob);
  const scopeFile = path.join(f.root, 'manual-scope.json'); fs.writeFileSync(scopeFile, JSON.stringify(f.scope));
  let observedTemporary = null, child;
  const watcher = fs.watch(directory, (_event, name) => {
    if (child && name?.startsWith(`store.json.${child.pid}.`) && name.endsWith('.tmp')) {
      observedTemporary = name; child.kill('SIGKILL');
    }
  });
  t.after(() => watcher.close());
  child = spawn(process.execPath, ['scripts/retire-nova-dispatch.mjs', '--apply', scopeFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stop(child));
  let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes; });
  const [code, signal] = await once(child, 'exit'); watcher.close();
  assert.equal(code, null, stderr); assert.equal(signal, 'SIGKILL'); assert.ok(observedTemporary);
  // Original atomic state may be old or committed; neither authorizes rebuilding a missing source.
  const store = new FileNovaRemotePlanStore(f.scope.intent.dispatchRoot, dispatchOptions);
  assert.deepEqual(await store.load(f.job.jobId), f.job);
  assert.deepEqual(fs.readFileSync(blob), bytes); assert.deepEqual(fs.readFileSync(recordsFile(f.scope.intent.importRoot)), imports);
  const receipt = await retireNovaDispatch(f.scope);
  assert.ok(receipt.newlyProjected === true || receipt.newlyProjected === false);
  assert.deepEqual(await store.persistBeforeDispatch(f.job), f.job);
  assert.equal(json(recordsFile(f.scope.intent.dispatchRoot)).records[0].payload.schemaVersion, 'nova-remote-plan-dispatch-projected.v1');
  assert.equal(json(recordsFile(f.scope.intent.dispatchRoot)).records.length, 1);
});
