import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, createProductionNovaTestGate, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-vertical-'));
const repository = path.join(temporary, 'repository');
const pluginRoot = path.resolve('skills/buster/plugins');
const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/unit.v1.json', 'utf8'));
const token = 'phase-8-vertical-token-0000000000000';
const records = { maximumRecords: 200, maximumBytes: 128 * 1024 * 1024, maximumRecordBytes: 32 * 1024 * 1024 };

try {
  fs.mkdirSync(path.join(repository, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'scripts', 'unit.mjs'), `
import fs from 'node:fs';
if (process.env.CI !== 'true') throw new Error('CI_ENVIRONMENT_MISSING');
if (!process.env.PATH || !process.env.HOME?.endsWith('.kubeclaw-home') || !process.env.TMPDIR?.endsWith('.kubeclaw-tmp')) throw new Error('SANITIZED_ENVIRONMENT_MISSING');
if (process.env.BUSTER_REMOTE_TOKEN !== undefined) throw new Error('AMBIENT_ENVIRONMENT_LEAK');
fs.mkdirSync('reports', { recursive: true }); fs.mkdirSync('coverage', { recursive: true });
process.stdout.write('stdout-one\\n'); process.stderr.write('stderr-two\\n');
const mode=process.argv[2]||'pass';
if(mode!=='missing') fs.writeFileSync('reports/unit.xml', mode==='malformed' ? '<testsuite>' : mode==='zero'
  ? '<testsuite name="unit"></testsuite>' : mode==='report-fail'
  ? '<testsuite name="unit"><testcase name="fails"><failure message="expected failure"/></testcase></testsuite>'
  : '<testsuites><testsuite name="unit"><testcase classname="example" name="passes" time="0.001"/></testsuite></testsuites>');
fs.writeFileSync('coverage/lcov.info', 'TN:\\nSF:src/example.mjs\\nDA:1,1\\nDA:2,0\\nend_of_record\\n');
if(mode==='exit-fail') process.exitCode=7;
`);
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'phase8@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Phase 8 Proof']);
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'unit fixture']);

  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot],
    trustPolicy: { trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
      verifierId: 'phase8-vertical' } }));
  const declaration: any = { suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: {
    command: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', concurrencyGroup: 'unit', retries: 0,
      config: { executable: 'node', args: ['scripts/unit.mjs', 'pass'], workingDirectory: '.', resultMode: 'junit-required',
        reports: [{ id: 'unit-report', format: 'junit', path: 'reports/unit.xml', mediaType: 'application/junit+xml' }],
        coverage: [{ id: 'unit-coverage', format: 'lcov', path: 'coverage/lcov.info', mediaType: 'text/lcov' }] } },
    'command-two': { uses: 'kubeclaw.direct-command@1', mode: 'blocking', concurrencyGroup: 'unit', retries: 0,
      config: { executable: 'node', args: ['scripts/unit.mjs', 'pass'], workingDirectory: '.', resultMode: 'junit-required',
        reports: [{ id: 'unit-report-two', format: 'junit', path: 'reports/unit.xml', mediaType: 'application/junit+xml' }] } },
    smoke: { uses: 'kubeclaw.direct-command@1', mode: 'advisory', concurrencyGroup: 'unit', retries: 0,
      config: { executable: 'node', args: ['-e', 'if(process.env.CI!=="true")process.exit(8)'], resultMode: 'exit-code' } },
    coverage: { uses: 'kubeclaw.coverage-budget@1', mode: 'advisory', retries: 0,
      config: { minimumLinePercent: 80, combine: true },
      inputs: { 'coverage-1': { from: 'command', output: 'coverage-1', mediaType: 'text/lcov' } } },
  } } }, concurrencyLimits: { unit: 2 } };
  const policy = { defaultTimeoutMs: 10_000, maximumTimeoutMs: 30_000,
    defaultLimits: { cpuMillis: 10_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
      artifactBytes: 8 * 1024 * 1024, artifactFiles: 32, processes: 8 },
    maximumLimits: { cpuMillis: 30_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 8 * 1024 * 1024,
      artifactBytes: 64 * 1024 * 1024, artifactFiles: 128, processes: 32 },
    maximumRetryCount: 1, maximumMatrixSize: 16, maximumNodes: 64, defaultConcurrencyLimit: 2,
    maximumConcurrencyLimits: { unit: 4 } };
  const plan = resolveTestPlan({ planId: 'plan:phase8', runId: 'run:phase8', project: 'phase8',
    scope: { moduleId: 'module', gateId: null }, createdAt: '2026-08-12T16:00:00.000Z', declaration,
    suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy });
  assert.throws(() => resolveTestPlan({ planId: 'plan:coverage-no-minimum', runId: 'run:coverage-no-minimum',
    project: 'phase8', scope: { moduleId: 'module', gateId: null }, createdAt: '2026-08-12T16:00:00.000Z',
    declaration: { suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: { coverage: {
      uses: 'kubeclaw.coverage-budget@1', mode: 'blocking', config: { combine: true }, inputs: {} } } } } },
    suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy }),
  /TEST_PLAN_COVERAGE_MINIMUM_REQUIRED/u);
  const secondPlan = resolveTestPlan({ planId: 'plan:phase8-other', runId: 'run:phase8-other', project: 'phase8',
    scope: { moduleId: 'module', gateId: null }, createdAt: '2026-08-12T16:00:01.000Z', declaration,
    suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy });
  assert.deepEqual(plan.nodes.map((node) => node.testIdentity), secondPlan.nodes.map((node) => node.testIdentity));

  const store = new FileBusterPlanJobStore(path.join(temporary, 'buster-state'), { recordLimits: records,
    maximumArchiveBytes: 8 * 1024 * 1024, maximumResultBytes: 32 * 1024 * 1024,
    maximumResultStoreBytes: 128 * 1024 * 1024 });
  const service = new BusterRemotePlanService({ store, registry, runtimeRoot: path.join(temporary, 'buster-runs'),
    tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 32 * 1024 * 1024,
    allowedCapabilities: new Set(['command.execute']), directCommand: { executableCatalog: new Map([['node', process.execPath]]),
      executableSearchPath: [path.dirname(process.execPath)],
      runtimeReadRoots: [path.dirname(process.execPath), '/lib/x86_64-linux-gnu', '/lib64', '/etc/ssl'],
      maximumOutputBytes: 8 * 1024 * 1024, maximumExecutionMs: 30_000, maximumProcesses: 32,
      maximumMemoryBytes: 1024 * 1024 * 1024, maximumCpuMillis: 30_000, terminationGraceMs: 100,
      allowSampledProcessLimit: true } });
  const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
    maximumRequestBytes: 16 * 1024 * 1024, maximumResponseBytes: 64 * 1024,
    maximumResultBytes: 32 * 1024 * 1024, shutdownTimeoutMs: 5_000 });
  const address = await runtime.start();
  try {
    const gate = createProductionNovaTestGate({ stateRoot: path.join(temporary, 'nova-state'),
      endpoint: `http://127.0.0.1:${address.port}`, token, sourceAuthority: 'nova:production',
      pollMilliseconds: 10, maximumResponseBytes: 64 * 1024,
      maximumResultBytes: 32 * 1024 * 1024, maximumArchiveBytes: 8 * 1024 * 1024,
      maximumArchiveStoreBytes: 32 * 1024 * 1024, maximumEvidenceBytes: 16 * 1024 * 1024,
      maximumEvidenceStoreBytes: 64 * 1024 * 1024, recordLimits: records, legacyLedger: {} });
    const executed = await gate.execute({ idempotencyKey: 'phase8:vertical', pipelineStageId: 'stage:unit', plan,
      repositoryRoot: repository, repositoryId: 'repository:phase8', maximumConcurrency: 2,
      grants: new Map(plan.nodes.filter((node) => node.provider.contractId === 'kubeclaw.direct-command@1')
        .map((node) => [node.id, ['command.execute']])), submittedAt: '2026-08-12T16:00:00.000Z',
      timeoutMs: 60_000, legacySuites: [] });
    assert.equal(executed.remote.status.state, 'completed', JSON.stringify(executed.remote));
    const result = JSON.parse((await service.result(executed.remote.status.jobId,
      executed.remote.status.result!.contentDigest, executed.remote.status.result!.sizeBytes)).toString('utf8'));
    assert.equal(executed.remote.decision.state, 'passed', JSON.stringify({ remote: executed.remote, result }));
    const commandAttempt = result.attempts.find((attempt: any) => attempt.nodeId === 'unit/command');
    const coverageAttempt = result.attempts.find((attempt: any) => attempt.nodeId === 'unit/coverage');
    assert.deepEqual(commandAttempt.reports[0].counts, { total: 1, passed: 1, failed: 0, errored: 0, skipped: 0 });
    assert.equal(commandAttempt.outcome, 'passed');
    assert.equal(result.attempts.find((attempt: any) => attempt.nodeId === 'unit/command-two').outcome, 'passed');
    const smokeAttempt = result.attempts.find((attempt: any) => attempt.nodeId === 'unit/smoke');
    assert.equal(smokeAttempt.outcome, 'passed');
    assert.deepEqual(smokeAttempt.counts, { total: 1, passed: 1, failed: 0, skipped: 0 });
    assert.deepEqual(smokeAttempt.reports, []);
    assert.equal(coverageAttempt.outcome, 'failed');
    assert.equal(executed.remote.decision.nodes.find((node) => node.nodeId === 'unit/coverage')?.effect, 'advisory_failure');

    const conflict = async (mode: string, expected: string, expectedFailed?: number) => {
      const conflictDeclaration: any = { tests: { command: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0,
        config: { executable: 'node', args: ['scripts/unit.mjs', mode], resultMode: 'junit-required', reports: [{
          id: 'unit-report', format: 'junit', path: 'reports/unit.xml', mediaType: 'application/junit+xml' }] } } } };
      const conflictPlan = resolveTestPlan({ planId: `plan:phase8:${mode}`, runId: `run:phase8:${mode}`, project: 'phase8',
        scope: { moduleId: 'module', gateId: null }, createdAt: '2026-08-12T16:01:00.000Z', declaration: conflictDeclaration,
        suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy });
      const outcome = await gate.execute({ idempotencyKey: `phase8:${mode}`, pipelineStageId: `stage:${mode}`, plan: conflictPlan,
        repositoryRoot: repository, repositoryId: 'repository:phase8', maximumConcurrency: 1,
        grants: new Map([['command', ['command.execute']]]), submittedAt: '2026-08-12T16:01:00.000Z',
        timeoutMs: 60_000, legacySuites: [] });
      assert.equal(outcome.remote.decision.state, expected, JSON.stringify(outcome.remote));
      if (expectedFailed !== undefined) {
        const reference = outcome.remote.status.result!;
        const conflictResult: any = JSON.parse((await service.result(outcome.remote.status.jobId,
          reference.contentDigest, reference.sizeBytes)).toString('utf8'));
        assert.equal(conflictResult.attempts[0].counts.failed, expectedFailed);
      }
    };
    await conflict('report-fail', 'failed', 1);
    await conflict('exit-fail', 'failed', 1);
    await conflict('zero', 'execution_error');
    await conflict('missing', 'execution_error');
    await conflict('malformed', 'execution_error');
  } finally { await runtime.stop(); }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ ok: true, phase: 8, remote: true, provider: 'direct-command', report: 'junit', coverage: 'lcov' }));
