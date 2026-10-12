import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test, { after } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { buildRegistry, discoverPackages, resolveTestPlan } from '../../../skills/nova/core/src/index.ts';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { validateBusterExecutionSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { temporary, packageRoot, limits } from '../../fixtures/test-gate/runner-contract-fixture.mts';

const retainedFixtures = new Set();
after(() => {
  assert.equal(retainedFixtures.size, 0, `unconfirmed fixture ownership: ${[...retainedFixtures].join(', ')}`);
  fs.rmSync(temporary, { recursive: true, force: true });
});

function privateFile(file, original, root) {
  const stat = fs.lstatSync(file);
  const source = fs.statSync(original);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  assert(fs.realpathSync(file).startsWith(`${fs.realpathSync(root)}${path.sep}`));
  assert.notEqual(fs.realpathSync(file), fs.realpathSync(original));
  assert(stat.dev !== source.dev || stat.ino !== source.ino);
}

function reportOutput(field) {
  const finding = id => ({ id, severity: 'info', message: 'actual report adapter finding' });
  const cases = Array.from({ length: field === 'maximumCases' ? 2 : 1 }, (_, index) => ({
    id: `case:${index}`, name: `case ${index}`, suitePath: [], className: null,
    outcome: 'passed', durationMs: 0,
    findings: field === 'maximumCaseFindings' ? [finding('case:first'), finding('case:second')] : [],
    findingsTruncated: false, omittedFindingCount: 0,
  }));
  return { counts: { total: cases.length, passed: cases.length, failed: 0, errored: 0, skipped: 0 },
    durationMs: 0, cases, casesTruncated: false, omittedCaseCount: 0,
    findings: field === 'maximumFindings' ? [finding('first'), finding('second')] : [],
    findingsTruncated: false, omittedFindingCount: 0 };
}

function ownChildren(t, directory) {
  const originalSpawn = childProcess.spawn;
  const originalKill = process.kill;
  const owned = [];
  const reports = [];
  let hook;
  let closing = false;
  let ownershipFailure;
  retainedFixtures.add(directory);
  // Registered before setup writes, discovery, or any possible process start.
  t.after(async () => {
    closing = true;
    const failures = [];
    try {
      for (const row of owned) {
        if (row.closed) continue;
        try {
          if (process.platform !== 'win32' && row.child.pid) originalKill(-row.child.pid, 'SIGKILL');
          else row.child.kill('SIGKILL');
        } catch (error) { if (error.code !== 'ESRCH') failures.push(error); }
      }
      let timer;
      try {
        await Promise.race([
          Promise.all(owned.map(row => row.closePromise)),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('REPORT_FIXTURE_CLOSE_TIMEOUT')), 2000);
          }),
        ]);
      } finally { clearTimeout(timer); }
      if (ownershipFailure) failures.push(ownershipFailure);
      if (failures.length) throw new AggregateError(failures, 'REPORT_FIXTURE_CLEANUP_FAILED');
      assert(owned.every(row => row.closed), 'actual close required for every owned child');
      fs.rmSync(directory, { recursive: true, force: true });
      retainedFixtures.delete(directory);
    } finally { hook?.mock.restore(); syncBuiltinESMExports(); }
  });
  const providerChild = path.resolve('skills/buster/engine/test-gates/provider-child.mjs');
  const reportChild = path.resolve('skills/buster/engine/test-gates/report-adapter-child.mjs');
  hook = t.mock.method(childProcess, 'spawn', function (...args) {
    const isProvider = Array.isArray(args[1]) && args[1].includes(providerChild);
    const isReport = Array.isArray(args[1]) && args[1].includes(reportChild);
    // Store flock and other genuine tool spawns retain their existing owner and
    // tool mappings. Intercept only these two actual session entrypoint paths.
    if (!isProvider && !isReport) return Reflect.apply(originalSpawn, childProcess, args);
    const options = args[2];
    const cwd = typeof options?.cwd === 'string' ? fs.realpathSync(options.cwd) : null;
    if (closing || !cwd || !cwd.startsWith(`${fs.realpathSync(directory)}${path.sep}`)
      || (process.platform !== 'win32' && options.detached !== true)) {
      ownershipFailure = new Error('REPORT_FIXTURE_UNKNOWN_SPAWN_OWNERSHIP');
      // Reject before spawning anything whose ownership cannot be established.
      throw ownershipFailure;
    }
    const child = Reflect.apply(originalSpawn, childProcess, args);
    let resolveClose;
    const row = { child, stderr: '', closed: null,
      closePromise: new Promise(resolve => { resolveClose = resolve; }) };
    owned.push(row);
    child.once('close', (code, signal) => { row.closed = { code, signal }; resolveClose(); });
    if (isReport) {
      child.stderr.on('data', chunk => { row.stderr += chunk.toString(); });
      reports.push(row);
    }
    return child;
  });
  syncBuiltinESMExports();
  return { reports };
}

function setup(t, field, workload = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'report-consumer-'));
  const ownership = ownChildren(t, directory);
  const plugins = path.join(directory, 'plugins');
  const copy = path.join(plugins, 'provider');
  fs.cpSync(packageRoot, copy, { recursive: true, dereference: false });
  const adapter = path.join(copy, 'dist/report-adapter.js');
  const original = path.join(packageRoot, 'dist/report-adapter.js');
  privateFile(adapter, original, directory); // BEFORE any fixture module write
  fs.writeFileSync(adapter, `export async function adapter(input) {
    if (new TextDecoder().decode(input.bytes) !== '<testsuite tests="1"/>') throw new Error('REPORT_FIXTURE_SOURCE_CHANGED');
    ${workload}
    return ${JSON.stringify(reportOutput(field))};
  }\n`);
  const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
    trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'test:report-policy',
  }, now: () => new Date('2026-08-05T17:00:00Z') }));
  const plan = resolveTestPlan({ planId: `plan:report-${field}`, runId: 'run:report-policy', project: 'runner-project',
    scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-05T17:00:00Z',
    declaration: { tests: {}, fixtures: { isolatedProducer: { uses: 'example.report@1', retries: 0 } }, concurrencyLimits: {} },
    suiteTemplates: [], registry, facts: { changedPaths: ['src/app.ts'], moduleType: 'web', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 1000, maximumTimeoutMs: 10000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 3, maximumMatrixSize: 16, maximumNodes: 100, defaultConcurrencyLimit: 4,
      maximumConcurrencyLimits: { serial: 1 } },
  });
  return { directory, registry, plan, ownership };
}

const cases = [
  ['maximumSourceBytes', 1, 4096, 'REPORT_ADAPTER_SOURCE_LIMIT'],
  ['maximumCases', 1, 2, 'REPORT_ADAPTER_CASE_LIMIT'],
  ['maximumFindings', 1, 2, 'REPORT_ADAPTER_FINDING_LIMIT'],
  ['maximumCaseFindings', 1, 2, 'REPORT_ADAPTER_CASE_FINDING_LIMIT'],
];
for (const [field, low, high, error] of cases) {
  test(`default Runner and actual adapter consume ${field}`, { timeout: 60000 }, async t => {
    const fixture = setup(t, field);
    for (const value of [low, high]) {
      const root = path.join(fixture.directory, String(value));
      const workspaceRoot = path.join(root, 'workspace');
      const repositoryRoot = path.join(workspaceRoot, 'repository');
      fs.mkdirSync(repositoryRoot, { recursive: true });
      const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
        reports: { ...runnerExecutionPolicy.reports, maximumAggregateResultBytes: 16384,
          maximumSourceBytes: 4096, memoryBytes: 128 * 1024 * 1024, [field]: value } });
      const result = await new TestPlanRunner({ plan: fixture.plan, registry: fixture.registry,
        workspaceRoot, repositoryRoot, artifactRoot: path.join(root, 'artifacts'),
        observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1, executionPolicy,
        workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
      }).run();
      assert.equal(result.attempts.length, 1, 'no provider retries');
      const attempt = result.attempts[0];
      const source = attempt.evidence.find(item => item.evidenceId === 'junit');
      assert(source, 'actual provider evidence must exist even on report rejection');
      assert.equal(fs.readFileSync(new URL(source.artifact.storageUrl), 'utf8'), '<testsuite tests="1"/>');
      if (value === low) {
        assert.equal(attempt.executionState, 'errored');
        assert.match(attempt.summary ?? '', new RegExp(error));
      } else {
        assert.equal(attempt.executionState, 'completed');
        assert.equal(attempt.reports.length, 1);
        const report = attempt.reports[0];
        assert.equal(report.sourceArtifact.contentDigest, source.artifact.contentDigest);
        assert.deepEqual(report.counts, reportOutput(field).counts);
        assert.deepEqual(report.cases, reportOutput(field).cases);
        assert.deepEqual(report.findings, reportOutput(field).findings);
      }
    }
  });
}

// Actual workloads, not argument assertions. Low profiles must reach the adapter
// marker before the expected boundary; startup/prerequisite failures cannot pass.
const started = `const fs = await import('node:fs'); fs.writeSync(2, 'REPORT_WORKLOAD_STARTED\\n');`;
const physicalProfiles = [
  { field: 'maximumTimeoutMs', low: 1000, high: 4000, timeout: 4000,
    workload: `${started} await new Promise(resolve => setTimeout(resolve, 1500));`,
    error: /REPORT_ADAPTER_TIMEOUT/ },
  { field: 'memoryBytes', low: 128 * 1024 * 1024, high: 512 * 1024 * 1024, timeout: 4000,
    workload: `${started} const retained = []; for (let i = 0; i < 20; i++) retained.push(new Array(1048576).fill(i));
      if (retained.reduce((count, item) => count + item.length, 0) !== 20971520) throw new Error('ALLOCATION_INCOMPLETE');`,
    error: /REPORT_ADAPTER_PROTOCOL_INVALID/, stderr: /heap out of memory|Allocation failed/i },
  { field: 'minimumCpuTimeMs', low: 1000, high: 3000, timeout: 1900,
    workload: `${started} const start = process.cpuUsage(); let elapsed; do {
      for (let i = 0; i < 10000; i++) Math.sqrt(i);
      const used = process.cpuUsage(start); elapsed = used.user + used.system;
    } while (elapsed < 1200000);`,
    error: /REPORT_ADAPTER_PROTOCOL_INVALID/, signal: 'SIGKILL' },
  { field: 'maximumOpenFiles', low: 32, high: 128, timeout: 4000,
    workload: `${started} const opened = []; try { for (let i = 0; i < 64; i++) opened.push(fs.openSync(new URL(import.meta.url), 'r')); }
      finally { for (const descriptor of opened) fs.closeSync(descriptor); }`,
    error: /REPORT_ADAPTER_FAILED:.*EMFILE/ },
];
for (const profile of physicalProfiles) {
  test(`default Runner actual report process consumes ${profile.field}`, { timeout: 60000 }, async t => {
    const fixture = setup(t, profile.field, profile.workload);
    const children = fixture.ownership.reports;
    for (const value of [profile.low, profile.high]) {
      const root = path.join(fixture.directory, String(value));
      const workspaceRoot = path.join(root, 'workspace');
      const repositoryRoot = path.join(workspaceRoot, 'repository');
      fs.mkdirSync(repositoryRoot, { recursive: true });
      const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
        provider: { ...runnerExecutionPolicy.provider, cleanupTimeoutMs: 6000 },
        reports: { ...runnerExecutionPolicy.reports, maximumAggregateResultBytes: 16384,
          maximumSourceBytes: 4096, memoryBytes: 256 * 1024 * 1024,
          maximumTimeoutMs: profile.timeout, minimumCpuTimeMs: 1000, maximumOpenFiles: 128,
          [profile.field]: value } });
      const before = children.length;
      const result = await new TestPlanRunner({ plan: fixture.plan, registry: fixture.registry,
        workspaceRoot, repositoryRoot, artifactRoot: path.join(root, 'artifacts'),
        observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1, executionPolicy,
        workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
      }).run();
      assert.equal(result.attempts.length, 1);
      assert.equal(children.length, before + 1, 'one actual report adapter process');
      const child = children[before];
      assert(child.closed, 'report process must actually close before Runner returns');
      assert.match(child.stderr, /REPORT_WORKLOAD_STARTED/, 'no startup error substitutes for the workload boundary');
      const attempt = result.attempts[0];
      assert(attempt.evidence.some(item => item.evidenceId === 'junit'));
      if (value === profile.low) {
        assert.equal(attempt.executionState, 'errored');
        assert.match(attempt.summary ?? '', profile.error);
        if (profile.stderr) assert.match(child.stderr, profile.stderr);
        if (profile.signal) assert.equal(child.closed.signal, profile.signal);
      } else {
        assert.equal(child.closed.code, 0);
        assert.equal(attempt.executionState, 'completed');
        assert.equal(attempt.reports.length, 1);
        assert.deepEqual(attempt.reports[0].cases, reportOutput(profile.field).cases);
      }
    }
  });
}
