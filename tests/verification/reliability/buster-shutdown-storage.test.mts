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
import { BusterRemotePlanService, FileBusterPlanJobStore } from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';

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
    await new FileBusterPlanJobStore(state, options).accept(first, new Date().toISOString());
    const accepted = await new FileBusterPlanJobStore(state, options).get(first.jobId);
    const quota = Buffer.byteLength(JSON.stringify(accepted.payload)) + 2;
    const limited = new FileBusterPlanJobStore(path.join(root, 'limited-state'), { ...options, recordLimits: { ...options.recordLimits, maximumRecordBytes: timing === 'healthy-terminal' ? 128 * 1024 : quota } });
    const runtimeRoot = path.join(root, 'runtime-is-a-file');
    fs.writeFileSync(runtimeRoot, 'original filesystem ENOTDIR; no provider can start');
    const service = new BusterRemotePlanService({ store: limited, registry, workerRevision: 'a'.repeat(40), runtimeRoot,
      tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 * 1024, allowedCapabilities: new Set(['command.execute']), maximumActiveJobs: 1 });
    const queued = job('reservation:other');
    if (timing === 'queued') {
      await limited.accept(first, new Date().toISOString());
      await limited.accept(queued, new Date().toISOString());
    }
    await service.recover();
    assert.equal(service.bootstrapReady(), true);
    if (timing === 'read-failure') {
      assert.equal((await service.submit(first)).state, 'accepted');
      const recordFile = path.join(root, 'limited-state', 'records', 'store.json');
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
      assert.equal(fs.readFileSync(runtimeRoot, 'utf8'), 'original filesystem ENOTDIR; no provider can start');
      return;
    }
    if (timing === 'admission') {
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>(resolve => { entered = resolve; });
      const unlock = new Promise<void>(resolve => { release = resolve; });
      const locking = withDurableStoreLock(path.join(root, 'limited-state', 'job-admission'), async () => { entered(); await unlock; });
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
    assert.equal(fs.readFileSync(runtimeRoot, 'utf8'), 'original filesystem ENOTDIR; no provider can start');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
