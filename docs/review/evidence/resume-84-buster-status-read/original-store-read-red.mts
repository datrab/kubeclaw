import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRegistry, discoverPackages, resolveTestPlan, createRemotePlanJob } from '@kubeclaw/nova-core';
import { buildCommittedSourceSnapshot } from '../../../../skills/nova/core/test-gates/source-snapshot.ts';
import { BusterRemotePlanService, FileBusterPlanJobStore } from '../../../../skills/buster/engine/test-gates/remote-plan-service.ts';

test('RED residual: unreadable durable state must not permit successful drain', { timeout: 10000 }, async () => {
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
    const store = new FileBusterPlanJobStore(state, options);
    const runtimeRoot = path.join(root, 'runtime-is-a-file');
    fs.writeFileSync(runtimeRoot, 'original non-directory prevents every provider start');
    const service = new BusterRemotePlanService({ store, registry, workerRevision: 'a'.repeat(40), runtimeRoot,
      tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 * 1024, allowedCapabilities: new Set(['command.execute']) });
    await service.recover();
    assert.equal((await service.submit(first)).state, 'accepted');
    // Corrupt only this fixture's actual durable file while #execute is reading
    // its newly accepted job. This is a real filesystem fault, not a store hook.
    const recordFile = path.join(state, 'records', 'store.json');
    const fd = fs.openSync(recordFile, 'w');
    try { fs.writeSync(fd, '{"broken":'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    await assert.rejects(() => store.get(first.jobId), SyntaxError);
    await new Promise(resolve => setTimeout(resolve, 100));
    const readiness = await service.readiness();
    const outcome = await service.shutdown(3000).then(() => 'fulfilled', error => `rejected:${String(error)}`);
    await assert.rejects(() => store.get(first.jobId), SyntaxError);
    assert.equal(fs.readFileSync(runtimeRoot, 'utf8'), 'original non-directory prevents every provider start');
    console.log(JSON.stringify({ originalStoreRead: 'SyntaxError', readinessBeforeShutdown: readiness, shutdown: outcome,
      corruptBytesRetained: fs.readFileSync(recordFile, 'utf8'), nativeProviderExecuted: false }));
    assert.notEqual(outcome, 'fulfilled', 'unknown durable state must not be silently treated as handled');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
