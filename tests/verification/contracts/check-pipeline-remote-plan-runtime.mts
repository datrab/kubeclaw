import { probeCapabilities } from '../e2e/capabilities.mts';
import { probeBusterReadiness } from '../e2e/buster-readiness.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import {
  createRemotePlanJob,
  FileNovaRemotePlanStore,
  HttpRemotePlanTransport,
  NovaRemotePlanDispatcher,
  FileNovaGateImportStore,
  NovaRemoteGateImporter,
  NovaRemoteTestGate,
  RemotePlanTransportError,
  type RemotePlanTransport,
} from '@kubeclaw/nova-core';
import {
  BusterRemotePlanService,
  BusterRemotePlanRuntime,
  createBusterRemotePlanHttpServer,
  FileBusterPlanJobStore,
  type TestPlanRunResult,
} from '@kubeclaw/buster-engine';
import {
  remotePlanDigest,
  attestSourceSnapshot,
  attemptResultDigest,
  nodeResultDigest,
  remotePlanJobDigest,
  resolvedTestPlanDigest,
  stableTestIdentity,
  type ArtifactRefV1, type AttemptResultV1, type NodeResultV1,
  type RemotePlanJobV1,
  type ResolvedTestPlanV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-plan-runtime-'));
const source = path.join(temporary, 'source');
const archiveFile = path.join(temporary, 'repository.tar.gz');
fs.mkdirSync(source);
fs.writeFileSync(path.join(source, 'README.md'), 'remote plan source\n');
execFileSync('/usr/bin/tar', ['-czf', archiveFile, '-C', source, '.']);
const archive = fs.readFileSync(archiveFile);
const token = 'remote-plan-test-token-0000000000000000';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const sourceAttestationPrivateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceAttestationPublicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
const sourceSnapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1' as const, sourceType: 'git-commit' as const,
  pipelineStageId: 'stage:test-gate',
  repositoryId: 'repository:remote-runtime', revision: `git:${'a'.repeat(40)}`, tree: `git:${'b'.repeat(40)}`,
  archiveContentDigest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`,
  archiveSizeBytes: archive.byteLength, creatorAuthority: 'nova:test' }, sourceAttestationPrivateKey);
const digest = `sha256:${'2'.repeat(64)}`;
const registryDigest = `sha256:${'3'.repeat(64)}`;
const provider = {
  packageId: 'provider', packageVersion: '1.0.0', contentDigest: digest,
  registrationId: 'provider.unit', contractId: 'provider.unit@1',
};
const planUnsigned = {
  schemaVersion: 'resolved-test-plan.v1' as const,
  planId: 'plan:remote-runtime', runId: 'run:remote-runtime', project: 'remote-runtime',
  scope: { moduleId: 'module-1', gateId: null }, registrySnapshotDigest: registryDigest,
  createdAt: '2026-08-10T01:00:00.000Z', suites: [],
  nodes: [{
    id: 'unit', executionId: 'execution:unit', testIdentity: stableTestIdentity({ project: 'remote-runtime',
      moduleId: 'module-1', gateId: null, suiteInstanceId: null, nodeId: 'unit', variation: {} }), suiteInstanceId: null, kind: 'test' as const,
    provider, reportAdapters: [], mode: 'blocking' as const, reviewAgent: null,
    configuration: { schemaVersion: 'provider-configuration.v1' as const,
      contractId: provider.contractId, schemaDigest: digest, values: {} },
    dependencies: [], timeoutMs: 60_000,
    limits: { cpuMillis: 1_000, memoryBytes: 1024, logBytes: 1024, artifactBytes: 1024,
      artifactFiles: 1, processes: 1 },
    retryCount: 0, concurrencyGroup: null, parentNodeId: null, variation: {},
    evidence: { onPass: [], onFail: [], onError: [] }, skipReason: null,
  }], links: [], concurrencyLimits: {},
};
const plan: ResolvedTestPlanV1 = { ...planUnsigned, planDigest: resolvedTestPlanDigest(planUnsigned) };
const registration = {
  schemaVersion: 'provider-registration.v1', registrationId: provider.registrationId,
  contractId: provider.contractId, kind: 'test',
  package: { packageId: provider.packageId, packageVersion: provider.packageVersion, contentDigest: provider.contentDigest },
  entrypoint: { module: 'provider.js', export: 'provider' }, configSchema: 'schema.json',
  inputs: [], outputs: [], capabilities: [], retrySafe: true, matrixFields: [], reportFormats: [],
  evidenceTypes: [], evidenceDefaults: { onPass: [], onFail: [], onError: [] },
};
const entry = { registration };
const registry = {
  apiVersion: 'pipeline-plugin-v2', snapshotDigest: registryDigest,
  packages: new Map(), stages: new Map(), observers: new Map(), adapters: new Map(),
  capabilityProviders: new Map(), testProviders: new Map([[provider.registrationId, entry]]),
  testProviderContracts: new Map([[provider.contractId, entry]]), reportAdapters: new Map(),
  reportAdapterFormats: new Map(),
} as unknown as RegistrySnapshot;

function nodeResult(job: RemotePlanJobV1): NodeResultV1 {
  const unsigned = {
    schemaVersion: 'node-result.v1' as const,
    planId: job.plan.planId, runId: job.plan.runId, moduleId: 'module-1', gateId: null,
    suiteInstanceId: null, nodeId: 'unit', executionId: 'execution:unit', testIdentity: `test:${'1'.repeat(64)}`, nodeKind: 'test' as const,
    mode: 'blocking' as const, state: 'skipped' as const, outcome: 'skipped' as const,
    attemptIds: [], finalAttemptId: null, unstable: false, skipReason: 'runtime proof',
  };
  const resultDigest = remotePlanDigest(unsigned);
  return { ...unsigned, resultDigest, receipt: {
    receiptId: `receipt:${job.jobId}`, receiptDigest: remotePlanDigest({ resultDigest }),
  } };
}

function authorityReceipt(job: RemotePlanJobV1, resultDigest: string, name: string) {
  const receiptId = `receipt:${name}:${job.jobId}`;
  return { receiptId, receiptDigest: remotePlanDigest({ authorityId: `test-runner:${job.plan.planDigest}`, receiptId, resultDigest }) };
}

function passedResults(job: RemotePlanJobV1, artifact: ArtifactRefV1, large = false): TestPlanRunResult {
  const definition = job.plan.nodes[0]!;
  const attemptUnsigned = { schemaVersion: 'attempt-result.v1' as const, planId: job.plan.planId,
    runId: job.plan.runId, moduleId: job.plan.scope.moduleId, gateId: job.plan.scope.gateId,
    suiteInstanceId: null, nodeId: definition.id, executionId: definition.executionId, testIdentity: definition.testIdentity, nodeKind: definition.kind,
    attemptId: `attempt:${job.jobId}:1`, attemptNumber: 1, provider: definition.provider, mode: definition.mode,
    executionState: 'completed' as const, outcome: 'passed' as const,
    startedAt: '2026-08-10T01:00:01.000Z', completedAt: '2026-08-10T01:00:02.000Z', durationMs: 1000,
    summary: 'passed', counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
    findings: large ? Array.from({ length: 100 }, (_item, index) => ({
      id: `finding:${index}`, severity: 'info' as const, message: `${index}:${'x'.repeat(4000)}`,
    })) : [], metrics: [], reports: [],
    evidence: [{ evidenceId: 'log', type: 'log', artifact }], outputs: [],
    resources: { logBytes: artifact.sizeBytes, artifactBytes: artifact.sizeBytes }, exitCode: 0, signal: null,
    providerDetails: null };
  const attemptDigest = attemptResultDigest(attemptUnsigned);
  const attempt: AttemptResultV1 = { ...attemptUnsigned, resultDigest: attemptDigest,
    receipt: authorityReceipt(job, attemptDigest, 'attempt') };
  const nodeUnsigned = { schemaVersion: 'node-result.v1' as const, planId: job.plan.planId, runId: job.plan.runId,
    moduleId: job.plan.scope.moduleId, gateId: job.plan.scope.gateId, suiteInstanceId: null,
    nodeId: definition.id, executionId: definition.executionId, testIdentity: definition.testIdentity, nodeKind: definition.kind, mode: definition.mode,
    state: 'completed' as const, outcome: 'passed' as const, attemptIds: [attempt.attemptId],
    finalAttemptId: attempt.attemptId, unstable: false, skipReason: null };
  const resultDigest = nodeResultDigest(nodeUnsigned);
  const resultNode: NodeResultV1 = { ...nodeUnsigned, resultDigest,
    receipt: authorityReceipt(job, resultDigest, 'node') };
  return { planId: job.plan.planId, runId: job.plan.runId, attempts: [attempt], nodes: [resultNode], cleanupErrors: [] };
}

const busterStore = new FileBusterPlanJobStore(path.join(temporary, 'buster-state'), {
  recordLimits: { maximumRecords: 100, maximumBytes: 16 * 1024 * 1024, maximumRecordBytes: 8 * 1024 * 1024 },
  maximumArchiveBytes: 1024 * 1024,
  maximumResultBytes: 16 * 1024 * 1024,
  // This suite isolates transport/queue behavior; result-reservation.test.mts
  // separately verifies strict capacity rejection with competing processes.
  maximumResultStoreBytes: 100 * 16 * 1024 * 1024,
  trustedSourceAuthority: 'nova:test', sourceAttestationPublicKey,
});
const executionCounts = new Map<string, number>();
const execute = async (job: RemotePlanJobV1, paths: { repositoryRoot: string; artifactRoot: string }, signal: AbortSignal): Promise<TestPlanRunResult> => {
  executionCounts.set(job.jobId, (executionCounts.get(job.jobId) ?? 0) + 1);
  assert.equal(fs.readFileSync(path.join(paths.repositoryRoot, 'README.md'), 'utf8'), 'remote plan source\n');
  if (job.idempotencyKey.includes('cancel')) {
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    throw new Error('cancelled');
  }
  if (job.idempotencyKey.includes('evidence')) {
    const content = Buffer.from('remote durable evidence');
    const file = path.join(paths.artifactRoot, 'evidence.log');
    fs.writeFileSync(file, content);
    const artifact: ArtifactRefV1 = { artifactId: 'artifact:remote-log', type: 'log', mediaType: 'text/plain',
      contentDigest: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`,
      sizeBytes: content.byteLength, storageUrl: pathToFileURL(file).href };
    return passedResults(job, artifact, job.idempotencyKey.includes('large'));
  }
  return { planId: job.plan.planId, runId: job.plan.runId, attempts: [], nodes: [nodeResult(job)], cleanupErrors: [] };
};
const service = new BusterRemotePlanService({
  store: busterStore, registry, workerRevision: 'a'.repeat(40), runtimeRoot: path.join(temporary, 'buster-runs'),
  tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 * 1024,
  allowedCapabilities: new Set(), execute,
});
function job(key: string): RemotePlanJobV1 {
  return createRemotePlanJob({ idempotencyKey: key, pipelineStageId: 'stage:test-gate', plan, sourceSnapshot, repositoryArchive: archive,
    grants: new Map([['unit', []]]), maximumConcurrency: 1, submittedAt: '2026-08-10T01:00:00.000Z' });
}
const startupInterrupted = job('dispatch:startup-recovery');
await busterStore.accept(startupInterrupted, '2026-08-10T01:00:00.000Z');
await busterStore.transition(startupInterrupted.jobId, ['accepted'], 'running', '2026-08-10T01:00:01.000Z');
const runtime = new BusterRemotePlanRuntime({
  service, host: '127.0.0.1', port: 0, token,
  maximumRequestBytes: 8 * 1024 * 1024, maximumResponseBytes: 8 * 1024 * 1024,
  maximumResultBytes: 16 * 1024 * 1024,
  shutdownTimeoutMs: 5_000,
});
const port = (await runtime.start()).port;
assert.equal((await service.status(startupInterrupted.jobId)).state, 'failed',
  'startup must finish durable recovery before the listener becomes ready');
assert.equal((await (await fetch(`http://127.0.0.1:${port}/healthz`)).json() as { live: boolean }).live, true);
assert.equal((await fetch(`http://127.0.0.1:${port}/bootstrapz`)).status, 200);
assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200, 'no BuildKit dependency is invented when container.build is disabled');
const unavailableStore = new FileBusterPlanJobStore(path.join(temporary, 'unavailable-buildkit-state'), {
  recordLimits: { maximumRecords: 100, maximumBytes: 16 * 1024 * 1024, maximumRecordBytes: 8 * 1024 * 1024 },
  maximumArchiveBytes: 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024, maximumResultStoreBytes: 100 * 16 * 1024 * 1024,
  trustedSourceAuthority: 'nova:test', sourceAttestationPublicKey,
});
const unavailableService = new BusterRemotePlanService({
  store: unavailableStore, registry, workerRevision: 'a'.repeat(40), runtimeRoot: path.join(temporary, 'unavailable-buildkit-runs'),
  tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 * 1024, allowedCapabilities: new Set(['container.build']),
  containerBuild: { buildctlExecutable: path.join(temporary, 'missing-native-buildctl-private-path'), buildkitHost: 'unix:///missing-buildkit.sock',
    registryBaseUrl: 'https://registry.example.test', registryReference: 'registry.example.test', repositoryPrefix: 'kubeclaw/test',
    allowedPlatforms: ['linux/amd64'], maximumLogBytes: 1024, maximumExecutionMs: 1000, maximumManifestBytes: 1024 },
});
assert.equal(unavailableService.bootstrapReady(), false);
const unavailableRuntime = new BusterRemotePlanRuntime({ service: unavailableService, host: '127.0.0.1', port: 0, token,
  maximumRequestBytes: 8 * 1024 * 1024, maximumResponseBytes: 8 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024, shutdownTimeoutMs: 5000 });
const unavailablePort = (await unavailableRuntime.start()).port;
try {
  assert.equal((await fetch(`http://127.0.0.1:${unavailablePort}/healthz`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${unavailablePort}/bootstrapz`)).status, 200);
  const readiness = await fetch(`http://127.0.0.1:${unavailablePort}/readyz`);
  assert.equal(readiness.status, 503);
  assert.deepEqual(await readiness.json(), { schemaVersion: 'buster-plan-readiness.v1', ready: false, code: 'BUSTER_DEPENDENCY_UNAVAILABLE' });
  const previousProviders = process.env.KUBECLAW_CAPABILITY_PROVIDERS;
  try {
    for (const [runtimePort, expectedReady] of [[port, true], [unavailablePort, false]] as const) {
      process.env.KUBECLAW_CAPABILITY_PROVIDERS = JSON.stringify({ buster: { agentRole: 'buster', capabilities: {
        'test.plan.execute': { adapter: 'buster-plan-v1', endpoint: `http://127.0.0.1:${runtimePort}` },
      } } });
      assert.equal((await probeCapabilities(['buildkit']))[0]?.ok, expectedReady);
      assert.equal((await probeBusterReadiness(`http://127.0.0.1:${runtimePort}`, 20_000)).ok, expectedReady);
    }
  } finally {
    if (previousProviders === undefined) delete process.env.KUBECLAW_CAPABILITY_PROVIDERS;
    else process.env.KUBECLAW_CAPABILITY_PROVIDERS = previousProviders;
  }
  const rejected = await fetch(`http://127.0.0.1:${unavailablePort}/v1/plan-jobs`, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(job('dispatch:missing-native-buildkit')) });
  assert.equal(rejected.status, 503); assert.deepEqual(await rejected.json(), { error: 'BUSTER_DEPENDENCY_UNAVAILABLE' });
  assert.equal((await unavailableStore.records()).length, 0, 'unavailable dependency cannot accept or start new work');
  const terminalJob = job('dispatch:terminal-replay-without-buildkit');
  await unavailableStore.accept(terminalJob, '2026-08-10T01:00:00.000Z');
  await unavailableStore.transition(terminalJob.jobId, ['accepted'], 'cancelled', '2026-08-10T01:00:01.000Z', { error: 'cancelled before execution' });
  const terminalRecords = await unavailableStore.records();
  const replay = await fetch(`http://127.0.0.1:${unavailablePort}/v1/plan-jobs`, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(terminalJob) });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as { state: string }).state, 'cancelled');
  assert.deepEqual(await unavailableStore.records(), terminalRecords, 'dependency failure preserves durable terminal replay');
  const acceptedJob = job('dispatch:accepted-replay-without-buildkit');
  await unavailableStore.accept(acceptedJob, '2026-08-10T01:00:00.000Z');
  const acceptedRecords = await unavailableStore.records();
  await assert.rejects(unavailableService.submit(acceptedJob), /BUSTER_DEPENDENCY_UNAVAILABLE/u);
  assert.deepEqual(await unavailableStore.records(), acceptedRecords, 'dependency failure cannot rewrite an existing accepted record');


  assert.equal((await fetch(`http://127.0.0.1:${unavailablePort}/healthz`)).status, 200, 'dependency failure cannot fail liveness');
  let readinessSettled = false;
  const readinessDuringShutdown = unavailableService.readiness().then(value => { readinessSettled = true; return value; });
  await unavailableService.shutdown(1000);
  assert.equal(readinessSettled, true, 'shutdown must await the actual in-flight dependency probe');
  assert.deepEqual(await readinessDuringShutdown, { schemaVersion: 'buster-plan-readiness.v1', ready: false, code: 'BUSTER_NOT_BOOTSTRAPPED' },
    'shutdown during the actual asynchronous dependency probe must report the current lifecycle state');
} finally { await unavailableRuntime.stop(); }
const transport = new HttpRemotePlanTransport({ endpoint: `http://127.0.0.1:${port}`,
  token, maximumResponseBytes: 8 * 1024 * 1024 });
assert.doesNotThrow(() => new HttpRemotePlanTransport({ endpoint: 'http://buster.example.test', token,
  maximumResponseBytes: 1024 }));

function novaStore(name: string) {
  return new FileNovaRemotePlanStore(path.join(temporary, name), {
    recordLimits: { maximumRecords: 100, maximumBytes: 16 * 1024 * 1024, maximumRecordBytes: 8 * 1024 * 1024 },
    maximumArchiveBytes: 1024 * 1024, maximumArchiveStoreBytes: 16 * 1024 * 1024,
  });
}
try {
  const concurrentBase = job('dispatch:concurrent-conflict');
  const concurrentChanged = { ...concurrentBase, maximumConcurrency: 2 };
  const concurrentChangedJob = { ...concurrentChanged, requestDigest: remotePlanJobDigest(concurrentChanged) };
  const concurrentStore = new FileBusterPlanJobStore(path.join(temporary, 'buster-concurrent-state'), {
    recordLimits: { maximumRecords: 10, maximumBytes: 4 * 1024 * 1024, maximumRecordBytes: 2 * 1024 * 1024 },
    maximumArchiveBytes: 1024 * 1024, maximumResultBytes: 4 * 1024 * 1024,
    maximumResultStoreBytes: 8 * 1024 * 1024,
    trustedSourceAuthority: 'nova:test', sourceAttestationPublicKey,
  });
  const concurrent = await Promise.allSettled([
    concurrentStore.accept(concurrentBase, '2026-08-10T01:00:00.000Z'),
    concurrentStore.accept(concurrentChangedJob, '2026-08-10T01:00:00.000Z'),
  ]);
  assert.equal(concurrent.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((item) => item.status === 'rejected'
    && String(item.reason).includes('BUSTER_REMOTE_JOB_CONFLICT')).length, 1,
  'concurrent different requests for one idempotency key must not return the winner status');
  const identicalStore = new FileBusterPlanJobStore(path.join(temporary, 'buster-identical-state'), {
    recordLimits: { maximumRecords: 10, maximumBytes: 4 * 1024 * 1024, maximumRecordBytes: 2 * 1024 * 1024 },
    maximumArchiveBytes: 1024 * 1024, maximumResultBytes: 4 * 1024 * 1024,
    maximumResultStoreBytes: 8 * 1024 * 1024,
    trustedSourceAuthority: 'nova:test', sourceAttestationPublicKey,
  });
  const identical = await Promise.all([
    identicalStore.accept(concurrentBase, '2026-08-10T01:00:00.000Z'),
    identicalStore.accept(concurrentBase, '2026-08-10T01:00:01.000Z'),
  ]);
  assert.deepEqual(identical[0], identical[1],
    'concurrent identical submissions must return the atomic winner even when local timestamps differ');
  const concurrentServiceJob = job('dispatch:concurrent-identical-service');
  const concurrentServiceStatuses = await Promise.all([
    service.submit(concurrentServiceJob), service.submit(concurrentServiceJob),
  ]);
  assert.equal(concurrentServiceStatuses.every((item) => item.jobId === concurrentServiceJob.jobId), true);
  for (let index = 0; index < 100 && (await service.status(concurrentServiceJob.jobId)).state !== 'completed'; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await service.status(concurrentServiceJob.jobId)).state, 'completed');
  assert.equal(executionCounts.get(concurrentServiceJob.jobId), 1,
    'concurrent identical service submissions must start one execution');

  const normalJob = job('dispatch:normal');
  const normal = await new NovaRemotePlanDispatcher({ store: novaStore('nova-normal'), transport,
    pollMilliseconds: 10 }).dispatch(normalJob, { timeoutMs: 5_000 });
  assert.equal(normal.state, 'completed');
  assert.match(normal.result?.contentDigest ?? '', /^sha256:[a-f0-9]{64}$/u);
  assert.equal('attempts' in normal.result!, false, 'status must contain only the bounded result reference');
  const downloadedResult = await transport.result(normalJob.jobId, normal.result!.contentDigest,
    normal.result!.sizeBytes);
  assert.equal(downloadedResult.planDigest, plan.planDigest);
  assert.equal(downloadedResult.resultDigest, normal.result!.resultDigest);
  assert.deepEqual(await service.status(normalJob.jobId), normal, 'terminal state must remain durable');

  const novaSpiffeId = 'spiffe://kubeclaw.internal/ns/kubeclaw/sa/agent-nova';
  const spiffeServer = createBusterRemotePlanHttpServer({
    service,
    trustedPeerSpiffeIds: [novaSpiffeId],
    maximumRequestBytes: 8 * 1024 * 1024,
    maximumResponseBytes: 8 * 1024 * 1024,
    maximumResultBytes: 16 * 1024 * 1024,
  });
  await new Promise<void>((resolve) => spiffeServer.listen(0, '127.0.0.1', resolve));
  try {
    const spiffePort = (spiffeServer.address() as AddressInfo).port;
    const statusUrl = `http://127.0.0.1:${spiffePort}/v1/plan-jobs/${encodeURIComponent(normalJob.jobId)}`;
    assert.equal((await fetch(statusUrl)).status, 401, 'missing verified peer identity must fail closed');
    assert.equal((await fetch(statusUrl, { headers: {
      'x-forwarded-client-cert': 'URI=spiffe://kubeclaw.internal/ns/kubeclaw/sa/prism-control',
    } })).status, 401, 'an authenticated but unauthorized workload must be rejected');
    assert.equal((await fetch(statusUrl, { headers: {
      'x-forwarded-client-cert': `By=spiffe://kubeclaw.internal/proxy;URI=${novaSpiffeId}`,
    } })).status, 200, 'the configured Nova SPIFFE identity must be accepted');
  } finally {
    spiffeServer.closeAllConnections();
    await new Promise<void>((resolve) => spiffeServer.close(() => resolve()));
  }

  const parallel = await Promise.all(['one', 'two'].map((name) => new NovaRemotePlanDispatcher({
    store: novaStore(`nova-parallel-${name}`), transport, pollMilliseconds: 10,
  }).dispatch(job(`dispatch:parallel:${name}`), { timeoutMs: 5_000 })));
  assert.equal(parallel.every((item) => item.state === 'completed'), true,
    'two plan jobs must keep isolated job state when they execute concurrently');

  const evidenceJob = job('dispatch:evidence');
  const evidenceDispatcher = new NovaRemotePlanDispatcher({ store: novaStore('nova-evidence-dispatch'), transport,
    pollMilliseconds: 10 });
  const evidenceImporter = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(
    path.join(temporary, 'nova-evidence-import'), { recordLimits: { maximumRecords: 100,
      maximumBytes: 16 * 1024 * 1024, maximumRecordBytes: 8 * 1024 * 1024 },
      maximumEvidenceStoreBytes: 16 * 1024 * 1024 }), evidence: transport, results: transport,
    maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024 });
  const connected = await new NovaRemoteTestGate({ dispatcher: evidenceDispatcher, importer: evidenceImporter }).execute(evidenceJob, { timeoutMs: 5_000 });
  assert.equal(connected.stageResult.outcome, 'passed', 'real HTTP evidence must be stored before gate success');

  const smallStatusTransport = new HttpRemotePlanTransport({ endpoint: `http://127.0.0.1:${port}`,
    token, maximumResponseBytes: 64 * 1024, maximumResultBytes: 1024 * 1024 });
  const largeJob = job('dispatch:evidence:large');
  const largeStatus = await new NovaRemotePlanDispatcher({ store: novaStore('nova-large-status'),
    transport: smallStatusTransport, pollMilliseconds: 10 }).dispatch(largeJob, { timeoutMs: 5_000 });
  assert.equal(largeStatus.state, 'completed');
  assert.equal(largeStatus.result!.sizeBytes > 64 * 1024, true, 'valid terminal result must exceed status limit');
  const largeResult = await smallStatusTransport.result(largeJob.jobId, largeStatus.result!.contentDigest,
    largeStatus.result!.sizeBytes);
  assert.equal(largeResult.attempts[0]?.findings.length, 100);

  class LostSubmitTransport implements RemotePlanTransport {
    lost = false;
    async submit(value: RemotePlanJobV1, signal?: AbortSignal) {
      const status = await transport.submit(value, signal);
      if (!this.lost) { this.lost = true; throw new RemotePlanTransportError('simulated lost response', true); }
      return status;
    }
    status(id: string, signal?: AbortSignal) { return transport.status(id, signal); }
    cancel(id: string, signal?: AbortSignal) { return transport.cancel(id, signal); }
  }
  const lostJob = job('dispatch:lost-response');
  const recovered = await new NovaRemotePlanDispatcher({ store: novaStore('nova-lost'),
    transport: new LostSubmitTransport(), pollMilliseconds: 10 }).dispatch(lostJob, { timeoutMs: 5_000 });
  assert.equal(recovered.state, 'completed', 'lost submit response must reconnect to the same job');

  const cancelJob = job('dispatch:cancel');
  const cancellation = new AbortController();
  const cancelled = new NovaRemotePlanDispatcher({ store: novaStore('nova-cancel'), transport,
    pollMilliseconds: 10 }).dispatch(cancelJob, { timeoutMs: 5_000, signal: cancellation.signal });
  for (let index = 0; index < 100; index += 1) {
    const current = await service.status(cancelJob.jobId).catch(() => null);
    if (current?.state === 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  cancellation.abort();
  await assert.rejects(() => cancelled, /NOVA_REMOTE_PLAN_CANCELLED/u);
  for (let index = 0; index < 100 && (await service.status(cancelJob.jobId)).state !== 'cancelled'; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await service.status(cancelJob.jobId)).state, 'cancelled');

  const interruptedJob = job('dispatch:interrupted');
  await busterStore.accept(interruptedJob, '2026-08-10T01:00:00.000Z');
  await busterStore.transition(interruptedJob.jobId, ['accepted'], 'running', '2026-08-10T01:00:01.000Z');
  const restarted = new BusterRemotePlanService({
    store: busterStore, registry, workerRevision: 'a'.repeat(40), runtimeRoot: path.join(temporary, 'buster-runs'),
    tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 * 1024,
    allowedCapabilities: new Set(), execute,
  });
  await restarted.recover();
  assert.equal((await restarted.status(interruptedJob.jobId)).state, 'failed');

  const changedRegistryJob = job('dispatch:registry-changed');
  await busterStore.accept(changedRegistryJob, '2026-08-10T01:00:00.000Z');
  const mismatched = new BusterRemotePlanService({
    store: busterStore,
    registry: { ...registry, snapshotDigest: `sha256:${'4'.repeat(64)}` },
    workerRevision: 'a'.repeat(40),
    runtimeRoot: path.join(temporary, 'buster-runs'), tarExecutable: '/usr/bin/tar',
    maximumExtractedBytes: 1024 * 1024, allowedCapabilities: new Set(), execute,
  });
  await mismatched.recover();
  assert.equal((await mismatched.status(changedRegistryJob.jobId)).state, 'failed',
    'accepted jobs must be authorized again after restart');

  const badTransport = new HttpRemotePlanTransport({ endpoint: `http://127.0.0.1:${port}`,
    token: 'wrong-token-000000000000000000000', maximumResponseBytes: 1024 });
  await assert.rejects(() => badTransport.status(normalJob.jobId), /HTTP_401/u);

  const changed = { ...normalJob, maximumConcurrency: 2 };
  const changedJob = { ...changed, requestDigest: remotePlanJobDigest(changed) };
  await assert.rejects(() => transport.submit(changedJob), /HTTP_409/u);

  // Resolve from the repository root so the historical generated HTTP fault probe can reuse this fixture.
  const { checkRemoteFaults } = await import(pathToFileURL(path.resolve('tests/verification/reliability/nova-remote-faults.mts')).href);
  await checkRemoteFaults({ port, token, temporary, service, job, novaStore });

  const hangingServer = http.createServer(() => undefined);
  await new Promise<void>((resolve) => hangingServer.listen(0, '127.0.0.1', resolve));
  try {
    const hangingPort = (hangingServer.address() as AddressInfo).port;
    const hangingTransport = new HttpRemotePlanTransport({ endpoint: `http://127.0.0.1:${hangingPort}`,
      token, maximumResponseBytes: 1024 });
    await assert.rejects(() => new NovaRemotePlanDispatcher({ store: novaStore('nova-timeout'),
      transport: hangingTransport, pollMilliseconds: 10 }).dispatch(job('dispatch:timeout'), {
        timeoutMs: 50,
      }), /NOVA_REMOTE_PLAN_TIMEOUT/u);
  } finally {
    hangingServer.closeAllConnections();
    await new Promise<void>((resolve) => hangingServer.close(() => resolve()));
  }
} finally {
  await runtime.stop();
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '7-C', transport: 'authenticated-http' }));
