import { verifyQualityProviderRuntime } from './quality-provider-runtime.mts';
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
import {
  BusterRemotePlanRuntime,
  BusterRemotePlanService,
  FileBusterPlanJobStore,
} from '@kubeclaw/buster-engine';
import {
  resolvedTestPlanDigest,
  stableTestIdentity,
  type ResolvedTestPlanV1,
} from '@kubeclaw/pipeline-test-gate-contract';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-real-provider-'));
const installRoot = path.join(temporary, 'plugins');
const packageRoot = path.join(installRoot, 'real-provider');
const repository = path.join(temporary, 'repository');
const token = 'phase-7-real-provider-token-00000000000';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const sourceAttestationPrivateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceAttestationPublicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };

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
    fs.writeFileSync(context.workspaceRoot + '/' + invocation.workspace.evidence + '/provider-proof.txt', content);
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
      verifiedAttestations: new Map(), verifierId: 'phase7-real-provider' },
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
  const plan: ResolvedTestPlanV1 = { ...planUnsigned, planDigest: resolvedTestPlanDigest(planUnsigned) };
  const busterStore = new FileBusterPlanJobStore(path.join(temporary, 'buster-state'), {
    recordLimits: records, maximumArchiveBytes: 4 * 1024 * 1024,
    maximumResultBytes: 16 * 1024 * 1024, maximumResultStoreBytes: 64 * 1024 * 1024,
    trustedSourceAuthority: 'nova:production', sourceAttestationPublicKey,
  });
  const service = new BusterRemotePlanService({
    store: busterStore, registry, workerRevision: 'a'.repeat(40), runtimeRoot: path.join(temporary, 'buster-runs'), tarExecutable: '/usr/bin/tar',
    maximumExtractedBytes: 16 * 1024 * 1024, allowedCapabilities: new Set(),
  });
  const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
    maximumRequestBytes: 8 * 1024 * 1024, maximumResponseBytes: 64 * 1024,
    maximumResultBytes: 16 * 1024 * 1024, shutdownTimeoutMs: 5_000 });
  const address = await runtime.start();
  try {
    fs.mkdirSync(path.join(temporary, 'nova-state'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'nova-state', 'execution-graph'), 'unavailable projection path');
    const gate = createProductionNovaTestGate({
      stateRoot: path.join(temporary, 'nova-state'), endpoint: `http://127.0.0.1:${address.port}`, token,
      sourceAuthority: 'nova:production', sourceAttestationPrivateKey,
      pollMilliseconds: 10, maximumResponseBytes: 64 * 1024, maximumResultBytes: 16 * 1024 * 1024,
      maximumArchiveBytes: 4 * 1024 * 1024, maximumArchiveStoreBytes: 16 * 1024 * 1024,
      maximumEvidenceBytes: 4 * 1024 * 1024, maximumEvidenceStoreBytes: 16 * 1024 * 1024,
      recordLimits: records,
    });
    const executed = await gate.execute({ idempotencyKey: 'phase7:real-provider', pipelineStageId: 'stage:test-gate', plan,
      repositoryRoot: repository, repositoryId: 'repository:phase7-real', grants: new Map([['real-provider', []]]),
      maximumConcurrency: 1, submittedAt: '2026-08-12T08:00:00.000Z', timeoutMs: 30_000 });
    const resultRef = executed.remote.status.result!;
    const storedResult = JSON.parse((await service.result(executed.remote.status.jobId, resultRef.contentDigest,
      resultRef.sizeBytes)).toString('utf8'));
    if (executed.remote.decision.state !== 'passed') {
      for (const attempt of storedResult.attempts) for (const item of attempt.evidence) {
        if (item.type === 'log') console.error((await service.evidence(executed.remote.status.jobId, item.artifact.contentDigest, item.artifact.sizeBytes)).toString('utf8'));
      }
    }
    assert.equal(executed.remote.decision.state, 'passed', JSON.stringify({ executed: executed.remote, storedResult }));
    assert.equal(executed.remote.status.state, 'completed');
    const imported = new FileNovaGateImportStore(path.join(temporary, 'nova-state', 'imports'), { recordLimits: records, maximumEvidenceStoreBytes: 16 * 1024 * 1024 });
    const [graph] = await imported.readExecutionGraphs();
    assert.equal(graph?.jobId, executed.remote.status.jobId);
    assert.equal(graph?.decisionDigest, executed.remote.decision.decisionDigest);
    assert.deepEqual(graph?.attempts, storedResult.attempts);
    assert.deepEqual(graph?.results, storedResult.nodes);
    assert.equal(executed.remote.status.result?.sizeBytes > 0, true);

    await verifyQualityProviderRuntime({ repository, stateRoot: path.join(temporary, 'quality-passed'),
      endpoint: `http://127.0.0.1:${address.port}`, token, privateKey: sourceAttestationPrivateKey.toString(), plan,
      revision: execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), expected: 'passed' });

    // Change committed source so the same real assertion fails; never supply a
    // canned failed provider response or substitute the worker/transport.
    fs.writeFileSync(path.join(repository, 'README.md'), 'deliberately broken source\n');
    execFileSync('git', ['-C', repository, 'add', 'README.md']);
    execFileSync('git', ['-C', repository, 'commit', '-qm', 'negative control']);
    const broken = await gate.execute({ idempotencyKey: 'phase7:real-provider:broken', pipelineStageId: 'stage:test-gate', plan,
      repositoryRoot: repository, repositoryId: 'repository:phase7-real', grants: new Map([['real-provider', []]]),
      maximumConcurrency: 1, submittedAt: '2026-08-12T08:01:00.000Z', timeoutMs: 30_000 });
    assert.equal(broken.remote.decision.state, 'failed');
    assert.equal(broken.remote.stageResult.outcome, 'request_fix');
    assert.notEqual(broken.remote.decision.decisionDigest, executed.remote.decision.decisionDigest);
    await assert.rejects(() => busterStore.complete(broken.remote.status.jobId, storedResult, new Date().toISOString()), /BUSTER_REMOTE_RESULT_IDENTITY_MISMATCH/);
    assert.equal((await busterStore.get(broken.remote.status.jobId)).payload.status.result?.contentDigest, broken.remote.status.result?.contentDigest);
    await verifyQualityProviderRuntime({ repository, stateRoot: path.join(temporary, 'quality-failed'),
      endpoint: `http://127.0.0.1:${address.port}`, token, privateKey: sourceAttestationPrivateKey.toString(), plan,
      revision: execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), expected: 'request_fix' });
    const graphs = await imported.readExecutionGraphs();
    assert.equal(graphs.length, 2, 'two actual jobs on one stage keep separate graph identities');
    assert.notEqual(graphs[0]?.sourceRevision, graphs[1]?.sourceRevision);
    assert.ok(graphs.some(item => item.jobId === broken.remote.status.jobId && item.results.some(node => node.outcome === 'failed')));
    const storedImports = fs.readFileSync(path.join(temporary, 'nova-state', 'imports', 'records', 'store.json'), 'utf8');
    assert.equal(storedImports.includes('"repositoryArchive"'), false, 'graph source metadata must not duplicate source archives');
  } finally { await runtime.stop(); }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '7-unmocked-remote', provider: 'isolated-process', runner: 'default' }));
