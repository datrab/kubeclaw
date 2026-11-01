import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { buildRegistry, discoverPackages, resolveTestPlan, createRemotePlanJob } from '@kubeclaw/nova-core';
import { buildCommittedSourceSnapshot } from '../../../skills/nova/core/test-gates/source-snapshot.ts';
import { FileBusterPlanJobStore } from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';

test('result admission reserves capacity across competing processes and reconstruction', { timeout: 30000 }, async () => {
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
    const compete = (id: string) => new Promise<number>((resolve, reject) => {
      const input = path.join(root, `${id}.json`);
      fs.writeFileSync(input, JSON.stringify({ state, options, job: job(`reservation:${id}`) }));
      const code = `import fs from 'node:fs';
        import { FileBusterPlanJobStore } from ${JSON.stringify(new URL('../../../skills/buster/engine/test-gates/remote-plan-service.ts', import.meta.url).href)};
        const input = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        try { await new FileBusterPlanJobStore(input.state, input.options).accept(input.job, new Date().toISOString()); }
        catch (error) { if (error.message !== 'BUSTER_REMOTE_RESULT_CAPACITY_EXCEEDED') throw error; process.exitCode = 23; }`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, input], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', reject); child.on('exit', (code, signal) => {
        if (signal || (code !== 0 && code !== 23)) reject(new Error(`${signal}:${code}:${stderr}`)); else resolve(code!);
      });
    });
    assert.deepEqual((await Promise.all([compete('second'), compete('third')])).sort((a, b) => a - b), [0, 23]);
    const reconstructed = new FileBusterPlanJobStore(state, options);
    assert.equal((await reconstructed.records()).length, 2);
    assert.equal((await reconstructed.accept(first, new Date().toISOString())).jobId, first.jobId, 'accepted identity remains readable at capacity');
    await assert.rejects(() => reconstructed.accept(job('reservation:fourth'), new Date().toISOString()), /RESULT_CAPACITY_EXCEEDED/);
    // A slow local holder must not make another request in this same store
    // fail at flock's five-second cross-process contention deadline.
    let entered!: () => void, release!: () => void;
    const holding = new Promise<void>(resolve => { entered = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    class SlowStore extends FileBusterPlanJobStore {
      first = true;
      override async records() {
        if (this.first) { this.first = false; entered(); await released; }
        return super.records();
      }
    }
    const slow = new SlowStore(state, options);
    const firstRead = slow.accept(first, new Date().toISOString());
    await holding;
    const secondRead = slow.accept(first, new Date().toISOString());
    // Observe rejections immediately so the old implementation fails the
    // assertion, rather than leaking an unhandled rejection while we wait.
    const outcomes = Promise.allSettled([firstRead, secondRead]);
    try { await new Promise(resolve => setTimeout(resolve, 5800)); }
    finally { release(); }
    for (const outcome of await outcomes) {
      assert.equal(outcome.status, 'fulfilled', outcome.status === 'rejected' ? String(outcome.reason) : undefined);
      if (outcome.status === 'fulfilled') assert.equal(outcome.value.jobId, first.jobId);
    }
    await assert.rejects(() => slow.accept(job('reservation:fifth'), new Date().toISOString()), /RESULT_CAPACITY_EXCEEDED/);
    assert.equal((await slow.accept(first, new Date().toISOString())).jobId, first.jobId, 'rejection does not poison the local queue');

  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
