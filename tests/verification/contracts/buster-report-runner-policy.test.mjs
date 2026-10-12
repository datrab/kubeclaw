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
  fs.writeFileSync(adapter, `import v8 from 'node:v8'; export async function adapter(input) {
    if (new TextDecoder().decode(input.bytes) !== '<testsuite tests="1"/>') throw new Error('REPORT_FIXTURE_SOURCE_CHANGED');
    ${workload}
    const output = ${JSON.stringify(reportOutput(field))};
    output.cases[0].name = JSON.stringify({ heap: v8.getHeapStatistics().heap_size_limit, args: process.execArgv });
    return output;
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


function options(fixture, root, reports) {
  const workspaceRoot = path.join(root, 'workspace');
  const repositoryRoot = path.join(workspaceRoot, 'repository');
  return { plan: fixture.plan, registry: fixture.registry, workspaceRoot, repositoryRoot,
    artifactRoot: path.join(root, 'artifacts'), observabilityRoot: path.join(root, 'observability'),
    maximumConcurrency: 1, executionPolicy: { ...runnerExecutionPolicy, reports },
    workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 } };
}
for (const field of ['minimumHeapMiB', 'heapFraction']) test(`default Runner report child consumes ${field}`, { timeout: 60000 }, async t => {
  const fixture = setup(t, field); const observations = [];
  for (const value of field === 'minimumHeapMiB' ? [32, 64] : [0.1, 0.2]) {
    const selected = field === 'minimumHeapMiB' ? { minimumHeapMiB: value, heapFraction: 0.01 }
      : { minimumHeapMiB: 16, heapFraction: value };
    const reports = { ...runnerExecutionPolicy.reports, ...selected };
    const opts = options(fixture, path.join(fixture.directory, String(value)), reports);
    fs.mkdirSync(opts.repositoryRoot, { recursive: true });
    const result = await new TestPlanRunner(opts).run();
    assert.equal(result.attempts.length, 1);
    const attempt = result.attempts[0]; assert.equal(attempt.executionState, 'completed');
    assert.equal(attempt.reports.length, 1);
    const evidence = attempt.evidence.find(item => item.evidenceId === 'junit'); assert(evidence);
    assert.equal(attempt.reports[0].sourceArtifact.contentDigest, evidence.artifact.contentDigest);
    const observed = JSON.parse(attempt.reports[0].cases[0].name);
    const heap = Math.max(reports.minimumHeapMiB, Math.floor(reports.memoryBytes / (1024 * 1024) * reports.heapFraction));
    assert(observed.args.includes(`--max-old-space-size=${heap}`));
    assert(observed.heap > 0); observations.push(observed.heap);
  }
  assert(observations[1] > observations[0]);
  assert.equal(fixture.ownership.reports.length, 2);
  assert(fixture.ownership.reports.every(row => row.closed?.code === 0));
});
for (const field of ['runtimeMemoryReserveBytes', 'minimumOpenFiles']) test(`Runner rejects incoherent report ${field} before effects`, t => {
  const fixture = setup(t, field);
  const reports = { ...runnerExecutionPolicy.reports };
  reports[field] = field === 'minimumOpenFiles' ? reports.maximumOpenFiles + 1 : reports.memoryBytes;
  const root = path.join(fixture.directory, 'not-created');
  const expected = field === 'minimumOpenFiles' ? /SWARM_CONFIG_BUSTER_REPORT_DESCRIPTOR_RANGE_INVALID/
    : /SWARM_CONFIG_BUSTER_EXECUTION_REPORT_MEMORY_INVALID/;
  assert.throws(() => new TestPlanRunner(options(fixture, root, reports)), expected);
  assert.equal(fs.existsSync(root), false); assert.equal(fixture.ownership.reports.length, 0);
});
