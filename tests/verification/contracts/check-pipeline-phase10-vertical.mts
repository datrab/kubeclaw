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
  loadPipelineTestScope,
  resolveTestPlan,
} from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'phase10-vertical-'));
const repository = path.join(temporary, 'repository');
const pluginRoot = path.resolve('skills/buster/plugins');
const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/unit.v1.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8')).suites;
const token = 'phase-10-unit-cutover-token-000000000000';
const records = { maximumRecords: 200, maximumBytes: 128 * 1024 * 1024, maximumRecordBytes: 32 * 1024 * 1024 };
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const privateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });

try {
  fs.mkdirSync(path.join(repository, '.swarm'), { recursive: true });
  fs.mkdirSync(path.join(repository, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repository, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'reports', '.keep'), 'report directory\n');
  fs.writeFileSync(path.join(repository, 'scripts', 'unit.mjs'), `
import fs from 'node:fs';
fs.mkdirSync('reports', { recursive: true });
const mode = process.argv[2];
const failed = mode === 'fail';
fs.writeFileSync('reports/' + mode + '.xml', '<testsuite name="' + mode + '"><testcase name="real-' + mode + '">' + (failed ? '<failure message="expected"/>' : '') + '</testcase></testsuite>');
`);
  const pipeline = {
    project: 'phase10',
    modules: {
      module: {
        suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: {
          blocking: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0,
            concurrencyGroup: 'unit', config: { executable: 'node', args: ['scripts/unit.mjs', 'pass'],
              workingDirectory: '.', resultMode: 'junit-required', reports: [{ id: 'blocking', format: 'junit',
                path: 'reports/pass.xml', mediaType: 'application/junit+xml' }] } },
          advisory: { uses: 'kubeclaw.direct-command@1', mode: 'advisory', retries: 0,
            concurrencyGroup: 'unit', config: { executable: 'node', args: ['scripts/unit.mjs', 'fail'],
              workingDirectory: '.', resultMode: 'junit-required', reports: [{ id: 'advisory', format: 'junit',
                path: 'reports/fail.xml', mediaType: 'application/junit+xml' }] } },
        } } },
        concurrencyLimits: { unit: 2 },
      },
    },
    gates: {},
  };
  fs.writeFileSync(path.join(repository, '.swarm', 'pipeline.json'), `${JSON.stringify(pipeline, null, 2)}\n`);
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'phase10@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Phase 10 Proof']);
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'sole unit authority fixture']);

  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'phase10:vertical' } }));
  const loaded = loadPipelineTestScope(path.join(repository, '.swarm', 'pipeline.json'),
    { moduleId: 'module', gateId: null });
  const policy = { defaultTimeoutMs: 10_000, maximumTimeoutMs: 30_000,
    defaultLimits: { cpuMillis: 10_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
      artifactBytes: 8 * 1024 * 1024, artifactFiles: 32, processes: 16 },
    maximumLimits: { cpuMillis: 30_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 8 * 1024 * 1024,
      artifactBytes: 64 * 1024 * 1024, artifactFiles: 128, processes: 32 },
    maximumRetryCount: 1, maximumMatrixSize: 16, maximumNodes: 64, defaultConcurrencyLimit: 2,
    maximumConcurrencyLimits: { unit: 4 } };
  const plan = resolveTestPlan({ planId: 'plan:phase10', runId: 'run:phase10', project: loaded.project,
    scope: { moduleId: 'module', gateId: null }, createdAt: '2026-08-13T21:00:00.000Z',
    declaration: loaded.declaration, suiteTemplates: [suite], registry,
    facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy });

  const store = new FileBusterPlanJobStore(path.join(temporary, 'buster-state'), { recordLimits: records,
    maximumArchiveBytes: 8 * 1024 * 1024, maximumResultBytes: 32 * 1024 * 1024,
    maximumResultStoreBytes: 128 * 1024 * 1024, trustedSourceAuthority: 'nova:production',
    sourceAttestationPublicKey: publicKey });
  const service = new BusterRemotePlanService({ store, registry, runtimeRoot: path.join(temporary, 'buster-runs'),
    tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 32 * 1024 * 1024,
    allowedCapabilities: new Set(['command.execute']), directCommand: { executableCatalog: new Map([['node', process.execPath]]),
      executableSearchPath: [path.dirname(process.execPath)], runtimeReadRoots: [path.dirname(process.execPath),
        '/lib/x86_64-linux-gnu', '/lib64', '/etc/ssl'], maximumOutputBytes: 8 * 1024 * 1024,
      maximumExecutionMs: 30_000, maximumProcesses: 32, maximumMemoryBytes: 1024 * 1024 * 1024,
      maximumCpuMillis: 30_000, terminationGraceMs: 100, allowSampledProcessLimit: true } });
  const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
    maximumRequestBytes: 16 * 1024 * 1024, maximumResponseBytes: 64 * 1024,
    maximumResultBytes: 32 * 1024 * 1024, shutdownTimeoutMs: 5_000 });
  const address = await runtime.start();
  try {
    const gate = createProductionNovaTestGate({ stateRoot: path.join(temporary, 'nova-state'),
      endpoint: `http://127.0.0.1:${address.port}`, token, sourceAuthority: 'nova:production',
      sourceAttestationPrivateKey: privateKey, pollMilliseconds: 10, maximumResponseBytes: 64 * 1024,
      maximumResultBytes: 32 * 1024 * 1024, maximumArchiveBytes: 8 * 1024 * 1024,
      maximumArchiveStoreBytes: 32 * 1024 * 1024, maximumEvidenceBytes: 16 * 1024 * 1024,
      maximumEvidenceStoreBytes: 64 * 1024 * 1024, recordLimits: records, legacyLedger: ledger });
    const executed = await gate.execute({ idempotencyKey: 'phase10:sole-unit', pipelineStageId: 'stage:unit', plan,
      repositoryRoot: repository, repositoryId: 'repository:phase10', maximumConcurrency: 2,
      grants: new Map(plan.nodes.map((node) => [node.id, ['command.execute']])),
      submittedAt: '2026-08-13T21:00:00.000Z', timeoutMs: 60_000, legacySuites: [] });
    const reference = executed.remote.status.result!;
    const result: any = JSON.parse((await service.result(executed.remote.status.jobId,
      reference.contentDigest, reference.sizeBytes)).toString('utf8'));
    assert.equal(executed.legacy, null, 'no legacy unit result may exist after cutover');
    assert.equal(executed.remote.decision.state, 'passed', JSON.stringify({ remote: executed.remote, attempts: result.attempts }));
    assert.equal(executed.remote.decision.nodes.find((node) => node.nodeId === 'unit/blocking')?.effect, 'passed');
    assert.equal(executed.remote.decision.nodes.find((node) => node.nodeId === 'unit/advisory')?.effect, 'advisory_failure');
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts.find((attempt: any) => attempt.nodeId === 'unit/blocking').outcome, 'passed');
    assert.equal(result.attempts.find((attempt: any) => attempt.nodeId === 'unit/advisory').outcome, 'failed');
  } finally { await runtime.stop(); }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ ok: true, phase: 10, suite: 'unit', authority: 'replacement-only',
  configuration: '.swarm/pipeline.json', boundary: 'real-contained' }));
