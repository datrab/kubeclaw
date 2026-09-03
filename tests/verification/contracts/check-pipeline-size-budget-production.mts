import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, createProductionNovaTestGate, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'size-budget-production-'));
const repository = path.join(root, 'repository');
const busterState = path.join(root, 'buster-state');
const busterRuns = path.join(root, 'buster-runs');
const token = 'size-budget-production-token-000000000000';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const privateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };
const limits = { cpuMillis: 30_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
  artifactBytes: 16 * 1024 * 1024, artifactFiles: 16, processes: 16 };

try {
  fs.mkdirSync(path.join(repository, 'dist', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(repository, '.swarm', 'baselines'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'dist', 'index.html'), 'production size budget\n');
  fs.writeFileSync(path.join(repository, 'dist', 'assets', 'app.js'), 'const production = true;\n');
  fs.writeFileSync(path.join(repository, '.swarm', '.keep'), 'size-budget workspace\n');
  execFileSync('git', ['init', '-q'], { cwd: repository });
  execFileSync('git', ['config', 'user.email', 'size-budget@example.invalid'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Size Budget Proof'], { cwd: repository });
  execFileSync('git', ['add', '.'], { cwd: repository });
  execFileSync('git', ['commit', '-qm', 'initial build output'], { cwd: repository });

  const pluginRoot = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'size-budget-production',
  } }));
  const template = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/size-budget.v1.json', 'utf8'));
  const policy = { defaultTimeoutMs: 30_000, maximumTimeoutMs: 60_000, defaultLimits: limits,
    maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8,
    defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { 'size-budget': 4 } };
  const resolve = (example: string, suffix: string) => resolveTestPlan({ planId: `plan:size-budget:${suffix}`,
    runId: `run:size-budget:${suffix}`, project: 'size-budget-production', scope: { moduleId: 'app', gateId: null },
    createdAt: '2026-08-22T12:00:00.000Z', declaration: JSON.parse(fs.readFileSync(example, 'utf8')),
    suiteTemplates: [template], registry, facts: { changedPaths: ['dist/index.html'], moduleType: 'frontend',
      pipelineStage: 'test' }, policy });
  const makeService = () => new BusterRemotePlanService({
    store: new FileBusterPlanJobStore(busterState, { recordLimits: records, maximumArchiveBytes: 16 * 1024 * 1024,
      maximumResultBytes: 16 * 1024 * 1024, maximumResultStoreBytes: 64 * 1024 * 1024,
      trustedSourceAuthority: 'nova:production', sourceAttestationPublicKey: publicKey }),
    registry, workerRevision: 'a'.repeat(40), runtimeRoot: busterRuns, tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 64 * 1024 * 1024,
    allowedCapabilities: new Set(['command.execute']), directCommand: {
      executableCatalog: new Map([['tar', '/usr/bin/tar'], ['cp', '/usr/bin/cp']]),
      executableSearchPath: ['/usr/bin'], runtimeReadRoots: ['/usr/bin', '/usr/lib/x86_64-linux-gnu', '/usr/lib64', '/lib'],
      maximumOutputBytes: 1024 * 1024, maximumExecutionMs: 60_000, maximumProcesses: 16,
      maximumMemoryBytes: 512 * 1024 * 1024, maximumCpuMillis: 30_000, terminationGraceMs: 100,
      allowSampledProcessLimit: true,
    },
  });
  const start = async (service: BusterRemotePlanService) => {
    const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
      maximumRequestBytes: 32 * 1024 * 1024, maximumResponseBytes: 1024 * 1024,
      maximumResultBytes: 16 * 1024 * 1024, shutdownTimeoutMs: 10_000 });
    const address = await runtime.start();
    return { runtime, endpoint: `http://127.0.0.1:${address.port}` };
  };
  const nova = (endpoint: string, state: string) => createProductionNovaTestGate({ stateRoot: path.join(root, state),
    endpoint, token, sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey,
    pollMilliseconds: 10, maximumResponseBytes: 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024,
    maximumArchiveBytes: 16 * 1024 * 1024, maximumArchiveStoreBytes: 64 * 1024 * 1024,
    maximumEvidenceBytes: 16 * 1024 * 1024, maximumEvidenceStoreBytes: 64 * 1024 * 1024,
    recordLimits: records, legacyLedger: {},
  });
  const grants = (plan: ReturnType<typeof resolve>) => new Map(plan.nodes.map((node) => [node.id,
    node.provider.contractId === 'kubeclaw.direct-command@1' ? ['command.execute'] : []]));

  const firstPlan = resolve('contracts/pipeline-test-gate/v1/examples/size-budget-tar.json', 'first');
  let service = makeService();
  let running = await start(service);
  const first = await nova(running.endpoint, 'nova-first').execute({ idempotencyKey: 'size-budget:first',
    pipelineStageId: 'stage:size-budget', plan: firstPlan, repositoryRoot: repository,
    repositoryId: 'repository:size-budget', grants: grants(firstPlan), maximumConcurrency: 1,
    submittedAt: '2026-08-22T12:00:00.000Z', timeoutMs: 120_000, legacySuites: [] });
  const firstStatus = first.remote.status;
  const firstResultRef = firstStatus.result!;
  const firstResult = JSON.parse((await service.result(firstStatus.jobId, firstResultRef.contentDigest,
    firstResultRef.sizeBytes)).toString('utf8'));
  assert.equal(first.remote.decision.state, 'passed', JSON.stringify({ remote: first.remote, firstResult }));
  const budgetAttempt = firstResult.attempts.find((attempt: any) => attempt.nodeId.endsWith('/web-assets'));
  const baselineRef = budgetAttempt?.outputs.find((output: any) => output.name === 'baseline')?.artifact;
  assert.equal(baselineRef?.mediaType, 'application/vnd.kubeclaw.size-budget-baseline+json');
  const baselineBytes = await service.evidence(firstStatus.jobId, baselineRef.contentDigest, baselineRef.sizeBytes);
  assert.equal(`sha256:${crypto.createHash('sha256').update(baselineBytes).digest('hex')}`, baselineRef.contentDigest);

  await running.runtime.stop();
  service = makeService();
  running = await start(service);
  assert.equal((await service.status(firstStatus.jobId)).state, 'completed');
  assert.deepEqual(await service.evidence(firstStatus.jobId, baselineRef.contentDigest, baselineRef.sizeBytes), baselineBytes);

  fs.writeFileSync(path.join(repository, '.swarm', 'baselines', 'size-budget-baseline.json'), baselineBytes);
  execFileSync('git', ['add', '.swarm/baselines/size-budget-baseline.json'], { cwd: repository });
  execFileSync('git', ['commit', '-qm', 'approve size budget baseline'], { cwd: repository });
  const growthPlan = resolve('contracts/pipeline-test-gate/v1/examples/size-budget-growth.json', 'growth');
  const growth = await nova(running.endpoint, 'nova-growth').execute({ idempotencyKey: 'size-budget:growth',
    pipelineStageId: 'stage:size-budget-growth', plan: growthPlan, repositoryRoot: repository,
    repositoryId: 'repository:size-budget', grants: grants(growthPlan), maximumConcurrency: 2,
    submittedAt: '2026-08-22T12:01:00.000Z', timeoutMs: 120_000, legacySuites: [] });
  const growthRef = growth.remote.status.result!;
  const growthResult = JSON.parse((await service.result(growth.remote.status.jobId, growthRef.contentDigest,
    growthRef.sizeBytes)).toString('utf8'));
  assert.equal(growth.remote.decision.state, 'passed', JSON.stringify({ remote: growth.remote, growthResult }));
  const growthAttempt = growthResult.attempts.find((attempt: any) => attempt.nodeId.endsWith('/growth'));
  assert.deepEqual(growthAttempt.providerDetails.values.growth, { bytes: 0, percent: 0 });
  await running.runtime.stop();

  console.log(JSON.stringify({ ok: true, phase: 'size-budget-production', boundary: 'nova-to-buster-remote',
    realComponents: ['git-snapshot', 'http-runtime', 'remote-job-store', 'command-sandbox',
      'tar', 'typed-artifact-link', 'provider-process', 'buster-evidence-store', 'nova-result-import', 'restart-recovery'],
    decisions: ['passed', 'passed'], baselinePromoted: true, mocks: 0, wrappers: 0 }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
