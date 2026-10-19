import http from 'node:http';
import { BusterRemotePlanRuntime } from '../../../skills/buster/engine/test-gates/remote-plan-runtime.ts';
import type { BusterRemotePlanService as ProductionService } from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { canonicalPipelineEntry, readTestPipeline, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';
import { captureSwarmSettings, type BusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { preparedPlanStateRoot, preparedPlanRuntimeRoot } from '../../fixtures/test-gate/modeled-preparation.mts';
// Preparation authority is modeled here; parser, extraction and durable service/store remain real.
import { ModeledBusterRemotePlanService as BusterRemotePlanService, ModeledPreparedPlanJobStore as FileBusterPlanJobStore } from '../../fixtures/test-gate/modeled-preparation.mts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRegistry, discoverPackages, resolveTestPlan, createRemotePlanJob } from '@kubeclaw/nova-core';
import { buildCommittedSourceSnapshot } from '../../../skills/nova/core/test-gates/source-snapshot.ts';
import { withDurableStoreLock } from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';


for (const timing of ['during', 'after', 'queued', 'admission', 'read-failure', 'healthy-terminal']) test(`durable shutdown failure ownership: ${timing}`, { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'result-reservation-'));
  const repository = path.join(root, 'repository');
  const state = path.join(root, 'state');
  try {
    fs.mkdirSync(repository);
    fs.writeFileSync(path.join(repository, 'README.md'), 'committed reservation input\n');
    execFileSync('git', ['init', '-q', repository]);
    execFileSync('git', ['-C', repository, 'add', '.']);
    execFileSync('git', ['-C', repository, '-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', 'commit', '-qm', 'source']);
    const keys = crypto.generateKeyPairSync('ed25519');
    const snapshot = await buildCommittedSourceSnapshot({ repositoryRoot: repository, repositoryId: 'repository:reservation', pipelineStageId: 'test',
      creatorAuthority: 'nova:reservation', attestationPrivateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), maximumArchiveBytes: 1024 * 1024 });
    const providers = path.resolve('skills/buster/plugins');
    const registry = buildRegistry(discoverPackages({ installationRoots: [providers], trustPolicy: {
      trustedBuiltinRoots: [providers], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'reservation-proof' } }));
    const limits = { cpuMillis: 1000, memoryBytes: 128 * 1024 * 1024, logBytes: 1024, artifactBytes: 1024, artifactFiles: 1, processes: 4 };
    const plan = resolveTestPlan({ planId: 'plan:reservation', runId: 'run:reservation', project: 'reservation', scope: { moduleId: 'module', gateId: null },
      createdAt: new Date().toISOString(), registry, suiteTemplates: [], declaration: { tests: { check: { uses: 'kubeclaw.direct-command@1', mode: 'blocking',
        config: { executable: 'node', args: ['--version'], workingDirectory: '.', resultMode: 'exit-code' } } } },
      facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy: { defaultTimeoutMs: 1000, maximumTimeoutMs: 1000,
        defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
    const options = { recordLimits: { maximumRecords: 10, maximumBytes: 1024 * 1024, maximumRecordBytes: 128 * 1024 },
      maximumArchiveBytes: 1024 * 1024, maximumResultBytes: 65536, maximumResultStoreBytes: 131072,
      trustedSourceAuthority: 'nova:reservation', sourceAttestationPublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) };
    const job = (id: string) => createRemotePlanJob({ idempotencyKey: id, pipelineStageId: 'test', plan, ...snapshot,
      grants: new Map([['check', ['command.execute']]]), maximumConcurrency: 1, submittedAt: new Date().toISOString() });
    const first = job('reservation:first');
    const calibration = new FileBusterPlanJobStore(state, options);
    await calibration.accept(first, new Date().toISOString());
    const accepted = await calibration.get(first.jobId);
    if (!accepted.payload.input) throw new Error('TEST_CALIBRATION_INPUT_REQUIRED');
    await calibration.attachSource(await calibration.modeledPreparation.extract(accepted.payload));
    await calibration.transition(first.jobId, ['accepted'], 'running', new Date().toISOString());
    const running = await calibration.get(first.jobId);
    assert.equal(running.payload.status.state, 'running');
    const quota = Buffer.byteLength(canonicalJson(running.payload)) + 2;
    assert.ok(Buffer.byteLength(canonicalJson({ ...running.payload, status: { ...running.payload.status,
      state: 'cancelled', error: 'OBSERVABILITY_STORE_PATH_NOT_DIRECTORY' } })) > quota);
    console.log(JSON.stringify({ fixture: 'terminal-persistence-cut', timing,
      acceptedBytes: Buffer.byteLength(canonicalJson(accepted.payload)), runningBytes: quota - 2, quota, slack: 2 }));
    const limited = new FileBusterPlanJobStore(path.join(root, 'limited-state'), { ...options, recordLimits: { ...options.recordLimits, maximumRecordBytes: timing === 'healthy-terminal' ? 128 * 1024 : quota } });
    const runtimeRoot = path.join(root, 'runtime-is-a-file');
    fs.writeFileSync(preparedPlanRuntimeRoot(runtimeRoot), 'original filesystem ENOTDIR; no provider can start');
    const service = new BusterRemotePlanService({
    dependencyReadiness: { maximumExecutionMs: 1000, maximumOutputBytes: 65536 },
    executionPolicy: runnerExecutionPolicy, workerLocalRuntime: { drainTimeoutMs: 300_000, cancellationTimeoutMs: 30_000, replayLimit: 65_536 }, store: limited, registry, workerRevision: 'a'.repeat(40), runtimeRoot,
      tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 * 1024, allowedCapabilities: new Set(['command.execute']), admission: { ...(captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).admission, maximumActiveJobs: 1 } });
    const queued = job('reservation:other');
    if (timing === 'queued') {
      await limited.accept(first, new Date().toISOString());
      await limited.accept(queued, new Date().toISOString());
    }
    await assert.rejects(() => service.shutdown(0x80000000), /BUSTER_REMOTE_SHUTDOWN_TIMEOUT_INVALID/u);
    await service.recover();
    assert.equal(service.bootstrapReady(), true);
    if (timing === 'read-failure') {
      assert.equal((await service.submit(first)).state, 'accepted');
      const recordFile = path.join(preparedPlanStateRoot(path.join(root, 'limited-state')), 'records', 'store.json');
      const fd = fs.openSync(recordFile, 'w');
      try { fs.writeSync(fd, '{"broken":'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      await assert.rejects(() => limited.get(first.jobId), SyntaxError);
      const deadline = Date.now() + 2000;
      while (service.bootstrapReady() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal((await service.readiness()).ready, false);
      await assert.rejects(() => service.shutdown(3000), (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.message, 'BUSTER_REMOTE_TERMINAL_STATUS_UNREADABLE');
        assert.equal(error.errors.length, 2);
        assert.ok(error.errors.every(cause => cause instanceof SyntaxError));
        return true;
      });
      assert.equal(fs.readFileSync(recordFile, 'utf8'), '{"broken":');
      assert.equal(fs.readFileSync(preparedPlanRuntimeRoot(runtimeRoot), 'utf8'), 'original filesystem ENOTDIR; no provider can start');
      return;
    }
    if (timing === 'admission') {
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>(resolve => { entered = resolve; });
      const unlock = new Promise<void>(resolve => { release = resolve; });
      const locking = withDurableStoreLock(path.join(preparedPlanStateRoot(path.join(root, 'limited-state')), 'job-admission'), async () => { entered(); await unlock; });
      await held;
      const pending = service.submit(first);
      try {
        // The actual admission lock remains held. The accepted response below
        // also proves admission crossed its stop check before shutdown began.
        await new Promise(resolve => setTimeout(resolve, 100));
        let finished = false;
        const stopped = service.shutdown(3000).then(() => { finished = true; });
        try {
          await new Promise(resolve => setTimeout(resolve, 25));
          assert.equal(finished, false, 'shutdown must await the already admitted original store write');
        } finally { release(); await locking; await stopped; }
        assert.equal((await pending).state, 'accepted');
        assert.equal((await limited.get(first.jobId)).payload.status.state, 'accepted');
        return;
      } finally { release(); await locking; await pending; }
    }
    if (timing !== 'queued') await service.submit(first);
    if (timing === 'healthy-terminal') {
      await service.shutdown(3000);
      const terminal = await limited.get(first.jobId);
      assert.equal(terminal.payload.status.state, 'cancelled');
      assert.equal(terminal.payload.status.error, 'OBSERVABILITY_STORE_PATH_NOT_DIRECTORY');
      return;
    }
    if (timing === 'after' || timing === 'queued') {
      const deadline = Date.now() + 2000;
      while (service.bootstrapReady() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(service.bootstrapReady(), false, 'fatal persistence failure must close readiness before explicit shutdown');
      assert.equal((await service.readiness()).ready, false);
      await assert.rejects(() => service.submit(first), /BUSTER_REMOTE_SHUTTING_DOWN/u);
    }
    await assert.rejects(() => service.shutdown(3000), /DURABLE_RECORD_SIZE_EXCEEDED/u);
    await assert.rejects(() => service.shutdown(3000), /DURABLE_RECORD_SIZE_EXCEEDED/u);
    const after = await limited.get(first.jobId);
    assert.equal(after.payload.status.state, 'running', 'failed persistence cannot invent a terminal status');
    assert.equal(after.payload.status.error, null);
    if (timing === 'queued') assert.equal((await limited.get(queued.jobId)).payload.status.state, 'accepted', 'queued durable job must remain available to restart recovery');
    assert.equal(fs.readFileSync(preparedPlanRuntimeRoot(runtimeRoot), 'utf8'), 'original filesystem ENOTDIR; no provider can start');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// Model only the service boundary here; listener, sockets, timer, and runtime
// shutdown are production code. Durable service recovery is exercised above.
function drainRuntime(service: Pick<ProductionService, 'recover' | 'shutdown' | 'readiness'>, timeout = 1000) {
  return new BusterRemotePlanRuntime({ service: service as ProductionService,
    host: '127.0.0.1', port: 0, token: 'shutdown-test-token-0000000000000000', maximumRequestBytes: 1024,
    maximumResponseBytes: 1024, maximumResultBytes: 1024, shutdownTimeoutMs: timeout });
}

test('runtime closes service admission before awaiting an in-flight HTTP response', async () => {
  let entered!: () => void;
  const entering = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const runtime = drainRuntime({ recover: async () => {},
    readiness: async () => { entered(); await released; return { schemaVersion: 'buster-plan-readiness.v1', ready: false, code: 'stopping' }; },
    shutdown: async () => { calls++; release(); } });
  const address = await runtime.start();
  const response = new Promise<number | undefined>((resolve, reject) => {
    const request = http.get({ host: address.address, port: address.port, path: '/readyz', agent: false }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
  });
  // Attach a rejection handler before shutdown can forcibly close the socket.
  const outcome = response.then(status => ({ status }), error => ({ error }));
  await entering;
  const first = runtime.stop();
  assert.equal(runtime.stop(), first, 'concurrent callers must share the original drain');
  await first;
  assert.deepEqual(await outcome, { status: 503 });
  assert.equal(calls, 1);
  await runtime.stop();
  assert.equal(calls, 1);
  await assert.rejects(() => runtime.start(), /BUSTER_REMOTE_RUNTIME_STOPPED/u);
});

test('runtime timeout retains failure and does not mint a second shutdown budget', async () => {
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const runtime = drainRuntime({ recover: async () => {},
    readiness: async () => ({ schemaVersion: 'buster-plan-readiness.v1', ready: true, code: 'ready' }), shutdown: async () => { calls++; await pending; } }, 20);
  await runtime.start();
  const stopped = runtime.stop();
  try {
    await assert.rejects(stopped, /BUSTER_REMOTE_SHUTDOWN_TIMEOUT/u);
    assert.equal(runtime.stop(), stopped);
    await assert.rejects(runtime.stop(), /BUSTER_REMOTE_SHUTDOWN_TIMEOUT/u);
    await assert.rejects(() => runtime.start(), /BUSTER_REMOTE_RUNTIME_STOPPED/u);
    assert.equal(calls, 1);
  } finally { release(); }
});

test('runtime preserves service failure and rejects timer overflow before recovery', async () => {
  let recoveries = 0;
  const failure = new Error('original durable cleanup failure');
  const service = { recover: async () => { recoveries++; }, readiness: async () => ({ schemaVersion: 'buster-plan-readiness.v1', ready: true, code: 'ready' }),
    shutdown: async () => { throw failure; } };
  for (const timeout of [0, -1, 1.5, NaN, Infinity, 0x80000000]) {
    assert.throws(() => drainRuntime(service, timeout), /BUSTER_REMOTE_SHUTDOWN_TIMEOUT_INVALID/u);
  }
  assert.equal(recoveries, 0);
  const runtime = drainRuntime(service);
  await runtime.start();
  await assert.rejects(runtime.stop(), error => error === failure);
  await assert.rejects(runtime.stop(), error => error === failure);
});


test('HTTP timeout preserves an already rejected durable service shutdown', async () => {
  let entered!: () => void;
  const entering = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const failure = new Error('original durable write failed');
  const runtime = drainRuntime({ recover: async () => {},
    readiness: async () => { entered(); await pending; return { schemaVersion: 'buster-plan-readiness.v1', ready: false, code: 'stopping' }; },
    shutdown: async () => { throw failure; } }, 20);
  const address = await runtime.start();
  const request = http.get({ host: address.address, port: address.port, path: '/readyz', agent: false });
  request.on('error', () => {});
  try {
    await entering;
    const stopped = runtime.stop();
    const verify = (error: unknown): boolean => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0], failure);
      assert.match(error.errors[1].message, /BUSTER_REMOTE_SHUTDOWN_TIMEOUT/u);
      return true;
    };
    await assert.rejects(stopped, verify);
    assert.equal(runtime.stop(), stopped);
    await assert.rejects(runtime.stop(), verify);
  } finally { release(); request.destroy(); }
});
