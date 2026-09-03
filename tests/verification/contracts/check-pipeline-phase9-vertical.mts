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
  resolveTestPlan,
  runLegacyAuthoritativeShadowComparison,
} from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'phase9-vertical-'));
const repository = path.join(temporary, 'repository');
const pluginRoot = path.resolve('skills/buster/plugins');
const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/unit.v1.json', 'utf8'));
const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const privateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });

try {
  fs.mkdirSync(path.join(repository, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(repository, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'reports', '.keep'), 'Phase 9 report directory.\n');
  fs.writeFileSync(path.join(repository, 'tests', 'unit.test.mjs'), `
import assert from 'node:assert/strict';
import test from 'node:test';
test('real pass', () => assert.equal(2 + 2, 4));
test.skip('real skip', () => {});
`);
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'phase9@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Phase 9 Proof']);
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'real node unit fixture']);

  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'phase9:vertical' } }));
  const declaration: any = { suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: { node: {
    uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0, concurrencyGroup: 'unit', config: {
      executable: 'node', workingDirectory: '.', resultMode: 'junit-required',
      args: ['--test', '--test-reporter=junit', '--test-reporter-destination=reports/unit.xml', 'tests/unit.test.mjs'],
      reports: [{ id: 'node-unit', format: 'junit', path: 'reports/unit.xml', mediaType: 'application/junit+xml' }],
    } } } } }, concurrencyLimits: { unit: 1 } };
  const policy = { defaultTimeoutMs: 10_000, maximumTimeoutMs: 30_000,
    defaultLimits: { cpuMillis: 10_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
      artifactBytes: 8 * 1024 * 1024, artifactFiles: 32, processes: 16 },
    maximumLimits: { cpuMillis: 30_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 8 * 1024 * 1024,
      artifactBytes: 64 * 1024 * 1024, artifactFiles: 128, processes: 32 },
    maximumRetryCount: 1, maximumMatrixSize: 16, maximumNodes: 64, defaultConcurrencyLimit: 1,
    maximumConcurrencyLimits: { unit: 2 } };
  const plan = resolveTestPlan({ planId: 'plan:phase9:vertical', runId: 'run:phase9:vertical', project: 'phase9',
    scope: { moduleId: 'module', gateId: null }, createdAt: '2026-08-12T20:30:00.000Z', declaration,
    suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy });

  const store = new FileBusterPlanJobStore(path.join(temporary, 'buster-state'), { recordLimits: records,
    maximumArchiveBytes: 8 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024,
    maximumResultStoreBytes: 64 * 1024 * 1024, trustedSourceAuthority: 'nova:production',
    sourceAttestationPublicKey: publicKey });
  const service = new BusterRemotePlanService({ store, registry, workerRevision: 'a'.repeat(40), runtimeRoot: path.join(temporary, 'buster-runs'),
    tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 32 * 1024 * 1024,
    allowedCapabilities: new Set(['command.execute']), directCommand: { executableCatalog: new Map([['node', process.execPath]]),
      executableSearchPath: [path.dirname(process.execPath)], runtimeReadRoots: [path.dirname(process.execPath),
        '/lib/x86_64-linux-gnu', '/lib64', '/etc/ssl'], maximumOutputBytes: 8 * 1024 * 1024,
      maximumExecutionMs: 30_000, maximumProcesses: 32, maximumMemoryBytes: 1024 * 1024 * 1024,
      maximumCpuMillis: 30_000, terminationGraceMs: 100, allowSampledProcessLimit: true } });
  const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0,
    token: 'phase-9-vertical-token-0000000000000', maximumRequestBytes: 16 * 1024 * 1024,
    maximumResponseBytes: 64 * 1024, maximumResultBytes: 16 * 1024 * 1024, shutdownTimeoutMs: 5_000 });
  const address = await runtime.start();
  try {
    const gate = createProductionNovaTestGate({ stateRoot: path.join(temporary, 'nova-state'),
      endpoint: `http://127.0.0.1:${address.port}`, token: 'phase-9-vertical-token-0000000000000',
      sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey, pollMilliseconds: 10,
      maximumResponseBytes: 64 * 1024, maximumResultBytes: 16 * 1024 * 1024,
      maximumArchiveBytes: 8 * 1024 * 1024, maximumArchiveStoreBytes: 32 * 1024 * 1024,
      maximumEvidenceBytes: 16 * 1024 * 1024, maximumEvidenceStoreBytes: 64 * 1024 * 1024,
      recordLimits: records, legacyLedger: {} });
    const comparison = await runLegacyAuthoritativeShadowComparison({
      shadowTimeoutMs: 60_000,
      runLegacy: async () => ({ state: 'passed', source: 'legacy-unit', authoritative: true }),
      runShadow: async (signal) => gate.execute({ idempotencyKey: 'phase9:vertical', pipelineStageId: 'stage:unit-shadow', plan,
        repositoryRoot: repository, repositoryId: 'repository:phase9', maximumConcurrency: 1,
        grants: new Map([['unit/node', ['command.execute']]]), submittedAt: '2026-08-12T20:30:00.000Z',
        timeoutMs: 60_000, signal, legacySuites: [] }),
    });
    assert.equal(comparison.authority, 'legacy');
    assert.equal(comparison.gateResult, comparison.legacy);
    assert.equal(comparison.shadow.status, 'deferred');
    const shadow = await comparison.collectShadow();
    if (shadow.status !== 'completed') throw new Error('PHASE9_SHADOW_UNEXPECTED_FAILURE');
    const reference = shadow.result.remote.status.result!;
    const result: any = JSON.parse((await service.result(shadow.result.remote.status.jobId,
      reference.contentDigest, reference.sizeBytes)).toString('utf8'));
    assert.equal(shadow.result.remote.decision.state, 'passed', JSON.stringify(result));
    assert.deepEqual(result.attempts[0].reports[0].counts,
      { total: 2, passed: 1, failed: 0, errored: 0, skipped: 1 });
    assert.equal(result.attempts[0].reports[0].cases[0].name, 'real pass');
    assert.equal(result.attempts[0].reports[0].cases[1].outcome, 'skipped');
  } finally { await runtime.stop(); }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ ok: true, phase: 9, vertical: 'real', tool: 'node:test',
  report: 'node-junit', authority: 'legacy', replacement: 'shadow-only' }));
