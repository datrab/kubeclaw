import { TEST_CORE_POLICY_SELECTION } from '../../fixtures/core-runtime-policy.mjs';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
// Preparation authority is modeled here; parser, extraction and durable service/store remain real.
import { ModeledPreparation, ModeledPreparedPlanJobStore as FileBusterPlanJobStore } from '../../fixtures/test-gate/modeled-preparation.mts';
import { FileNovaGateImportStore } from '../../../skills/nova/core/test-gates/remote-result-import.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRegistry,
  createProductionNovaTestGate,
  discoverPackages,
} from '@kubeclaw/nova-core';
import { TestPlanRunner, type TestPlanRunnerOptions } from '../../../skills/buster/engine/test-gates/runner.ts';
import { BusterRemotePlanService, type BusterRemotePlanServiceOptions } from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';
import { loadProductionBusterRemotePlanRuntime } from '@kubeclaw/buster-engine';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { canonicalSwarmEntry, readTestBundle, writeTestBundle } from '../../fixtures/config/swarm-bundle.mjs';
import {
  resolvedTestPlanDigest,
  stableTestIdentity,
  type ResolvedTestPlanV1,
  type RemotePlanResultV1,
} from '@kubeclaw/pipeline-test-gate-contract';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-local-config-'));
const installRoot = path.join(temporary, 'plugins');
const packageRoot = path.join(installRoot, 'real-provider');
const repository = path.join(temporary, 'repository');
const token = 'phase-7-real-provider-token-00000000000';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const sourceAttestationPrivateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceAttestationPublicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };

async function verifyProviderEvidence(result: RemotePlanResultV1, endpoint: string, jobId: string, replayLimit: number): Promise<void> {
const executedNodes = new Set<string>();
for (const attempt of result.attempts) for (const evidence of attempt.evidence) {
  if (evidence.evidenceId !== 'provider-proof') continue;
  const response = await fetch(`${endpoint}/v1/plan-jobs/${encodeURIComponent(jobId)}/evidence/${encodeURIComponent(evidence.artifact.contentDigest)}`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-digest'), evidence.artifact.contentDigest);
  const proof = Buffer.from(await response.arrayBuffer());
  assert.equal(proof.byteLength, evidence.artifact.sizeBytes);
  assert.equal(`sha256:${crypto.createHash('sha256').update(proof).digest('hex')}`, evidence.artifact.contentDigest);
  assert.equal(proof.toString('utf8'), `${attempt.nodeId}:phase-7 real remote provider\n`);
  executedNodes.add(attempt.nodeId);
}
assert.deepEqual([...executedNodes].sort(), replayLimit === 1 ? ['first'] : ['first', 'second']);

}

try {
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), '{"type":"module"}\n');
  fs.mkdirSync(repository, { recursive: true });
  fs.writeFileSync(path.join(repository, 'README.md'), 'phase-7 real remote provider\n');
  fs.mkdirSync(path.join(repository, 'module'));
  fs.writeFileSync(path.join(repository, 'module', 'FORGE.md'), '```kubeclaw-deliverables\n' + JSON.stringify({schemaVersion:'forge-deliverables.v1',moduleId:'module',substep:null,deliverables:['README.md']}) + '\n```\n');
  fs.writeFileSync(path.join(packageRoot, 'schemas', 'config.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
  }));
  fs.writeFileSync(path.join(packageRoot, 'dist', 'provider.js'), `
export function provider() {
  return { async execute(invocation, context) {
    const fs = await import('node:fs');
    const content = fs.readFileSync(context.workspaceRoot + '/' + invocation.workspace.repository + '/README.md', 'utf8');
    const assert = await import('node:assert/strict');
    let failure = null;
    try { assert.default.equal(content, 'phase-7 real remote provider\\n'); }
    catch (error) { failure = String(error); }
    if (fs.existsSync(context.workspaceRoot + '/' + invocation.workspace.repository + '/UNTRACKED.md')) throw new Error('REMOTE_UNCOMMITTED_CONTENT_INCLUDED');
    fs.writeFileSync(context.workspaceRoot + '/' + invocation.workspace.evidence + '/provider-proof.txt', invocation.nodeId + ':' + content);
    return { schemaVersion: 'provider-result.v1', outcome: failure ? 'failed' : 'passed', summary: failure ?? 'real isolated provider passed',
      counts: { total: 1, passed: failure ? 0 : 1, failed: failure ? 1 : 0, skipped: 0 }, findings: [], metrics: [],
      evidenceFiles: [{ evidenceId: 'provider-proof', type: 'log', file: 'provider-proof.txt', mediaType: 'text/plain' }],
      reports: [], outputs: [], exitCode: failure ? 1 : 0, signal: null, providerDetails: null };
  }, async cleanup() {} };
}
`);
  fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({
    id: 'phase7.real-provider', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0',
    stages: [], observers: [], adapters: [], testProviders: [{
      id: 'real', contractId: 'phase7.real-provider@1', kind: 'test', module: 'dist/provider.js', export: 'provider',
      configSchema: 'schemas/config.json', inputs: [], outputs: [], requiredCapabilities: [], retrySafe: true,
      matrixFields: [], reportFormats: [], evidenceTypes: ['log'],
      evidenceDefaults: { onPass: ['log'], onFail: ['log'], onError: ['log'] },
    }],
  }));
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'phase7@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Phase 7 Proof']);
  execFileSync('git', ['-C', repository, 'add', 'README.md', 'module/FORGE.md']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'committed source']);
  fs.writeFileSync(path.join(repository, 'UNTRACKED.md'), 'must not cross the remote boundary\n');

  const registry = buildRegistry(discoverPackages({
    installationRoots: [installRoot],
    trustPolicy: { trustedBuiltinRoots: [installRoot], allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(), verifierId: 'kubeclaw-platform-v2' },
  }));
  const entry = registry.testProviderContracts.get('phase7.real-provider@1');
  assert.ok(entry);
  const planUnsigned = {
    schemaVersion: 'resolved-test-plan.v1' as const, planId: 'plan:phase7-real', runId: 'run:phase7-real',
    project: 'phase7-real', scope: { moduleId: 'module', gateId: null },
    registrySnapshotDigest: registry.snapshotDigest, createdAt: '2026-08-12T08:00:00.000Z', suites: [],
    nodes: [{
      id: 'real-provider', executionId: 'execution:real-provider', testIdentity: stableTestIdentity({ project: 'phase7-real',
        moduleId: 'module', gateId: null, suiteInstanceId: null, nodeId: 'real-provider', variation: {} }), suiteInstanceId: null, kind: 'test' as const,
      provider: { packageId: entry.registration.package.packageId,
        packageVersion: entry.registration.package.packageVersion,
        contentDigest: entry.registration.package.contentDigest,
        registrationId: entry.registration.registrationId, contractId: entry.registration.contractId },
      reportAdapters: [], mode: 'blocking' as const, reviewAgent: null,
      configuration: { schemaVersion: 'provider-configuration.v1' as const,
        contractId: entry.registration.contractId, schemaDigest: entry.configSchemaDigest, values: {} },
      dependencies: [], timeoutMs: 20_000,
      limits: { cpuMillis: 10_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
        artifactBytes: 4 * 1024 * 1024, artifactFiles: 16, processes: 16 },
      retryCount: 0, concurrencyGroup: null, parentNodeId: null, variation: {},
      evidence: { onPass: ['log'], onFail: ['log'], onError: ['log'] }, skipReason: null,
    }], links: [], concurrencyLimits: {},
  };

  // Two genuinely distinct attempts, serialized inside one default job runtime.
  // Provider loading/execution is real; only native preparation ownership is modeled.
  for (const replayLimit of [1, 2]) {
    const profileRoot = path.join(temporary, `replay-${replayLimit}`);
    const entryFile = path.join(profileRoot, 'bundle', 'swarm.config.json');
    const documents = readTestBundle(canonicalSwarmEntry);
    documents['worker-core'].settings.localRuntime.replayLimit = replayLimit;
    writeTestBundle(entryFile, documents);
    const snapshot = loadSwarmSettings({ SWARM_CONFIG: entryFile });
    assert.equal(snapshot.workerCore.localRuntime.replayLimit, replayLimit);
    const platformConfig = path.join(profileRoot, 'platform.json');
    fs.writeFileSync(platformConfig, JSON.stringify({corePolicySelection: TEST_CORE_POLICY_SELECTION,
      schemaVersion: 'pipeline-platform.v2', effectLockTtlMs: 300_000,
      installationRoots: [installRoot], trustedBuiltinRoots: [installRoot],
      externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
      providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {},
      storageRoot: path.join(profileRoot, 'platform'), shutdownTimeoutMs: 5_000,
      orchestratorIssuerId: 'worker-local-config', administrativeDecisionIssuers: [],
    }));
    const stateRoot = path.join(profileRoot, 'buster-state');
    const options = { recordLimits: records, maximumArchiveBytes: 4 * 1024 * 1024,
      maximumResultBytes: 16 * 1024 * 1024, maximumResultStoreBytes: 64 * 1024 * 1024,
      trustedSourceAuthority: 'nova:production', sourceAttestationPublicKey };
    const store = new FileBusterPlanJobStore(stateRoot, options);
    const preparation = new ModeledPreparation(stateRoot, options);
    preparation.configure({ tarExecutable: process.env.KUBECLAW_TEST_TAR ?? '/usr/bin/tar', maximumExtractedBytes: 16 * 1024 * 1024 });

    const validationRoot = path.join(profileRoot, 'constructor-boundary');
    const validationPlan: ResolvedTestPlanV1 = { ...planUnsigned, planDigest: resolvedTestPlanDigest(planUnsigned) };
    const runnerOptions = { plan: validationPlan, registry,
      workspaceRoot: path.join(validationRoot, 'workspace'),
      repositoryRoot: path.join(validationRoot, 'workspace', 'repository'),
      sourceRepositoryRoot: repository,
      artifactRoot: path.join(validationRoot, 'artifacts'),
      observabilityRoot: path.join(validationRoot, 'observability'), maximumConcurrency: 1,
      executionPolicy: runnerExecutionPolicy, workerLocalRuntime: snapshot.workerCore.localRuntime };
    const serviceOptions = { dependencyReadiness: { maximumExecutionMs: 1000, maximumOutputBytes: 65536 }, store, preparation, registry, workerRevision: 'a'.repeat(40),
      runtimeRoot: path.join(validationRoot, 'service'), admission: snapshot.buster.admission,
      allowedCapabilities: new Set<string>(), executionPolicy: runnerExecutionPolicy, workerLocalRuntime: snapshot.workerCore.localRuntime };
    fs.mkdirSync(runnerOptions.repositoryRoot, { recursive: true });
    for (const [policy, code] of [
      [undefined, /WORKER_LOCAL_POLICY_REQUIRED/], [null, /WORKER_LOCAL_POLICY_REQUIRED/],
      [{ ...snapshot.workerCore.localRuntime, replayLimit: 0 }, /WORKER_LOCAL_REPLAY_LIMIT_INVALID/],
    ] as const) {
      const invalidRunner: Record<string, unknown> = { ...runnerOptions, executionPolicy: runnerExecutionPolicy, workerLocalRuntime: policy };
      const invalidService: Record<string, unknown> = { ...serviceOptions, executionPolicy: runnerExecutionPolicy, workerLocalRuntime: policy };
      if (policy === undefined) { delete invalidRunner.workerLocalRuntime; delete invalidService.workerLocalRuntime; }
      assert.equal(fs.existsSync(runnerOptions.observabilityRoot), false);
      assert.equal(fs.existsSync(runnerOptions.artifactRoot), false);
      assert.equal(fs.existsSync(`${stateRoot}-v2`), false);
      assert.throws(() => new TestPlanRunner(invalidRunner as unknown as TestPlanRunnerOptions), code);
      assert.throws(() => new BusterRemotePlanService(invalidService as unknown as BusterRemotePlanServiceOptions), code);
      assert.equal(fs.existsSync(runnerOptions.observabilityRoot), false, 'invalid policy must precede runner store creation');
      assert.equal(fs.existsSync(runnerOptions.artifactRoot), false);
      assert.equal(fs.existsSync(`${stateRoot}-v2`), false, 'invalid service policy must not create its store');
    }
    // Same real plan/registry/path contract succeeds when the required policy is present.
    assert.doesNotThrow(() => new TestPlanRunner(runnerOptions));
    assert.equal(fs.existsSync(runnerOptions.observabilityRoot), true);
    assert.doesNotThrow(() => new BusterRemotePlanService(serviceOptions));

    const runtimeFile = path.join(profileRoot, 'runtime.json');
    fs.writeFileSync(runtimeFile, JSON.stringify({
      schemaVersion: 'buster-remote-plan-runtime.v1',
    platformConfig,
      host: '127.0.0.1', port: 0, tokenEnvironmentVariable: 'LC_TOKEN',
      sourceAttestationPublicKeyEnvironmentVariable: 'LC_PUBLIC_KEY',
      trustedSourceAuthority: 'nova:production', stateRoot,
      runtimeRoot: path.join(profileRoot, 'runs'), tarExecutable: process.env.KUBECLAW_TEST_TAR ?? '/usr/bin/tar',
      maximumResultStoreBytes: options.maximumResultStoreBytes,
      maximumResponseBytes: 2 * 1024 * 1024, maximumResultBytes: options.maximumResultBytes,
      shutdownTimeoutMs: 5_000, recordLimits: records, allowedCapabilities: [],
    }));
    const runtime = loadProductionBusterRemotePlanRuntime(runtimeFile, preparation,
      snapshot.buster, snapshot.workerCore.localRuntime,
      { LC_TOKEN: token, LC_PUBLIC_KEY: sourceAttestationPublicKey.toString(), KUBECLAW_BUILD_REVISION: 'a'.repeat(40) });
    const address = await runtime.start();
    try {
      const novaState = path.join(profileRoot, 'nova-state');
      const gate = createProductionNovaTestGate({ stateRoot: novaState,
        endpoint: `http://127.0.0.1:${address.port}`, token,
        sourceAuthority: 'nova:production', sourceAttestationPrivateKey,
        pollMilliseconds: 10, maximumResponseBytes: 64 * 1024,
        maximumResultBytes: 16 * 1024 * 1024, maximumArchiveBytes: 4 * 1024 * 1024,
        maximumArchiveStoreBytes: 16 * 1024 * 1024, maximumEvidenceBytes: 4 * 1024 * 1024,
        maximumEvidenceStoreBytes: 16 * 1024 * 1024, recordLimits: records });
      const jobIds = new Set<string>();
      for (const jobNumber of [1, 2]) {
        const unsigned = { ...planUnsigned, planId: `plan:local:${replayLimit}:${jobNumber}`,
          runId: `run:local:${replayLimit}:${jobNumber}`,
          nodes: ['first', 'second'].map(id => ({ ...planUnsigned.nodes[0]!, id,
            executionId: `execution:${replayLimit}:${jobNumber}:${id}`,
            testIdentity: stableTestIdentity({ project: 'phase7-real', moduleId: 'module',
              gateId: null, suiteInstanceId: null, nodeId: id, variation: {} }) })) };
        const plan: ResolvedTestPlanV1 = { ...unsigned, planDigest: resolvedTestPlanDigest(unsigned) };
        const executed = await gate.execute({ idempotencyKey: `lc:${replayLimit}:${jobNumber}`,
          pipelineStageId: 'stage:test-gate', plan, repositoryRoot: repository,
          repositoryId: 'repository:phase7-real', grants: new Map([['first', []], ['second', []]]),
          maximumConcurrency: 1, submittedAt: new Date().toISOString(), timeoutMs: 30_000 });
        const status = executed.remote.status;
        assert.equal(status.state, 'completed', JSON.stringify(executed));
        assert.ok(status.result);
        assert.equal(jobIds.has(status.jobId), false);
        jobIds.add(status.jobId);
        const bytes = await store.result(status.jobId, status.result.contentDigest, status.result.sizeBytes);
        assert.equal(`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, status.result.contentDigest);
        const result = JSON.parse(bytes.toString('utf8'));
        assert.equal(result.planDigest, plan.planDigest);
        assert.equal(result.attempts.length, 2);
        assert.equal(new Set(result.attempts.map((attempt: { attemptId: string }) => attempt.attemptId)).size, 2);
        const providerEvidence = result.attempts.flatMap((attempt: { evidence: Array<{ evidenceId: string }> }) =>
          attempt.evidence.filter(item => item.evidenceId === 'provider-proof'));
        assert.equal(providerEvidence.length, replayLimit, `Rejected second attempt must not run provider or write provider evidence: ${JSON.stringify(result)}`);
        await verifyProviderEvidence(result, `http://127.0.0.1:${address.port}`, status.jobId, replayLimit);
        if (replayLimit === 1) {
          assert.notEqual(executed.remote.decision.state, 'passed');
          assert.match(JSON.stringify(result), /WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED/);
        } else {
          assert.equal(executed.remote.decision.state, 'passed', JSON.stringify(result));
          assert.doesNotMatch(JSON.stringify(result), /WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED/);
        }
        const imported = new FileNovaGateImportStore(path.join(novaState, 'imports'),
          { recordLimits: records, maximumEvidenceStoreBytes: 16 * 1024 * 1024 });
        const graph = (await imported.readExecutionGraphs()).find(value => value.jobId === status.jobId);
        assert.ok(graph);
        assert.deepEqual(graph.attempts, result.attempts);
        assert.equal(graph.decisionDigest, executed.remote.decision.decisionDigest);
      }
      assert.equal(jobIds.size, 2, 'Replay capacity is per prepared-job runtime, not process global');
    } finally { await runtime.stop(); }
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, profiles: [1, 2], jobsPerProfile: 2,
  runtime: 'production-factory/default-runner/default-core', nativePreparation: 'modeled' }));
