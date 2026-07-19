import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { resolvePerfReportPaths } from '../../../../../skills/buster/pipeline/suites/perf.ts';
import {
  applyBuildRuntimePort,
  buildDetailedSuiteSummary,
  collectReadySuites,
  resolveSuiteResultsDir,
  runSuites,
  runSuiteWithTimeout,
} from '../../../../../skills/buster/pipeline/runners/suite-runner.ts';

const execFileAsync = promisify(execFile);

test('runSuiteWithTimeout aborts suite subprocess work near the suite timeout', async () => {
  const started = Date.now();

  await assert.rejects(
    () => runSuiteWithTimeout('unit', async (context) => {
      await execFileAsync('node', ['-e', 'setTimeout(() => {}, 1000)'], {
        signal: context.suiteAbortSignal,
        timeout: context.suiteDeadlineMs - Date.now(),
      });
      throw new Error('subprocess was not aborted');
    }, {
      payload: {},
      moduleId: 'mod',
      module: 'mod',
      project: 'proj',
      config: {},
      capabilities: [],
      resultsDir: '/tmp',
      testsLogDir: null,
      screenshotsDir: '/tmp',
      logDir: null,
      pipelineLogPath: null,
      pipelineRunLogPath: null,
      logSink: null,
      attempt: undefined,
      telemetryContext: null,
    }, 75),
    /timed out after/,
  );

  assert.ok(Date.now() - started < 500);
});

test('suite verdict paths are namespaced by module and attempt', () => {
  assert.equal(
    resolveSuiteResultsDir('module/a', 1),
    path.join('/home/builder/.openclaw/results', 'module_a-attempt-1'),
  );
  assert.equal(
    resolveSuiteResultsDir('module-b', 2),
    path.join('/home/builder/.openclaw/results', 'module-b-attempt-2'),
  );
  assert.notEqual(resolveSuiteResultsDir('module/a', 1), resolveSuiteResultsDir('module-b', 2));
});

test('detailed suite summary preserves the top failure reason', () => {
  const summary = buildDetailedSuiteSummary([
    {
      suite: 'build',
      status: 'FAIL',
      findings: [{ severity: 'CRITICAL', message: 'Dockerfile base image is missing', rule: 'dockerfile-base-image' }],
    },
    { suite: 'health', status: 'SKIP', reason: 'build failed' },
    { suite: 'unit', status: 'PASS' },
  ]);

  assert.equal(summary, 'build: FAIL - Dockerfile base image is missing | health: SKIP - build failed | unit: PASS');
});

test('build runtime host port is propagated to later suites', () => {
  const config = { serve: { type: 'server', port: 8080, health_path: '/health' } };
  applyBuildRuntimePort(config, {
    suite: 'build',
    status: 'PASS',
    metadata: {
      port: 43125,
      container_port: 8080,
    },
  });

  assert.deepEqual(config.serve, {
    type: 'server',
    port: 43125,
    health_path: '/health',
  });
});

test('collectReadySuites selects independent Buster suites and waits on declared dependencies', () => {
  assert.deepEqual(
    collectReadySuites(['manifest', 'build', 'health', 'unit']),
    ['manifest', 'unit'],
  );

  assert.deepEqual(
    collectReadySuites(['manifest', 'build', 'health', 'unit'], {
      manifest: { suite: 'manifest', status: 'PASS' },
      unit: { suite: 'unit', status: 'PASS' },
    }),
    ['build'],
  );

  assert.deepEqual(
    collectReadySuites(['manifest', 'build', 'health'], {
      manifest: { suite: 'manifest', status: 'PASS' },
      build: { suite: 'build', status: 'PASS' },
    }),
    ['health'],
  );
});

test('perf report paths use per-run scratch and final artifacts', () => {
  const first = resolvePerfReportPaths({ moduleId: 'module/a', attempt: 1, resultsDir: '/tmp/buster-results' });
  const second = resolvePerfReportPaths({ moduleId: 'module-b', attempt: 1, resultsDir: '/tmp/buster-results' });

  assert.match(first.scratchPath, /^\/tmp\/buster-results\/module_a-attempt-1\/\.lighthouse-report-module_a-attempt-1-[a-zA-Z0-9._-]+\.tmp\.json$/);
  assert.match(first.finalPath, /^\/tmp\/buster-results\/module_a-attempt-1\/lighthouse-report-module_a-attempt-1-[a-zA-Z0-9._-]+\.json$/);
  assert.notEqual(first.scratchPath, first.finalPath);
  assert.notEqual(first.scratchPath, second.scratchPath);
  assert.notEqual(first.finalPath, second.finalPath);
});

test('perf report paths use a unique scratch path for each invocation', () => {
  const context = { moduleId: 'module/a', attempt: 1, testsLogDir: '/tmp/shared-tests', resultsDir: '/tmp/buster-results' };
  const first = resolvePerfReportPaths(context);
  const second = resolvePerfReportPaths(context);

  assert.notEqual(first.finalPath, second.finalPath);
  assert.notEqual(first.scratchPath, second.scratchPath);
});

test('perf report paths stay distinct even when modules share testsLogDir', () => {
  const sharedTestsDir = '/tmp/shared-tests';
  const first = resolvePerfReportPaths({ moduleId: 'module/a', attempt: 1, testsLogDir: sharedTestsDir, resultsDir: '/tmp/buster-results' });
  const second = resolvePerfReportPaths({ moduleId: 'module-b', attempt: 1, testsLogDir: sharedTestsDir, resultsDir: '/tmp/buster-results' });

  assert.match(first.finalPath, /^\/tmp\/shared-tests\/lighthouse-report-module_a-attempt-1-[a-zA-Z0-9._-]+\.json$/);
  assert.match(second.finalPath, /^\/tmp\/shared-tests\/lighthouse-report-module-b-attempt-1-[a-zA-Z0-9._-]+\.json$/);
  assert.notEqual(first.scratchPath, second.scratchPath);
  assert.notEqual(first.finalPath, second.finalPath);
});

test('runSuiteWithTimeout ignores late log mutations after timeout', async () => {
  const entries = [];

  await assert.rejects(
    () => runSuiteWithTimeout('unit', async (context) => {
      setTimeout(() => context.logSink?.({ suite: 'unit', msg: 'late-write' }), 80);
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { suite: 'unit', status: 'PASS' };
    }, {
      payload: {},
      moduleId: 'mod',
      module: 'mod',
      project: 'proj',
      config: {},
      capabilities: [],
      resultsDir: '/tmp',
      testsLogDir: null,
      screenshotsDir: '/tmp',
      logDir: null,
      pipelineLogPath: null,
      pipelineRunLogPath: null,
      logSink: (entry) => entries.push(entry),
      attempt: undefined,
      telemetryContext: null,
    }, 25),
    /timed out after/,
  );

  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(entries, []);
});

test('runSuites writes JSONL suite logs when logDir is fresh', async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-runner-logs-'));
  const testsDir = path.join(logDir, 'tests');
  fs.rmSync(testsDir, { recursive: true, force: true });

  await runSuites(['unit'], {
    repoRoot: process.cwd(),
    moduleId: 'mod',
    logDir,
    payload: {
      project: 'proj',
      test_config: {
        suite_timeout_ms: 5000,
        unit: { test_cmd: 'true' },
      },
    },
  });

  const logPath = path.join(testsDir, 'suites.jsonl');
  assert.ok(fs.existsSync(logPath));
  const entries = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(entries.some((entry) => entry.suite === 'unit'));
});

test('runSuites treats enforced unit failures as critical', async () => {
  const result = await runSuites(['unit'], {
    repoRoot: process.cwd(),
    moduleId: 'mod',
    payload: {
      project: 'proj',
      test_config: {
        suite_timeout_ms: 5000,
        unit: {
          test_cmd: ['node', '-e', 'process.exit(1)'],
          thresholds: { max_failures: 0 },
        },
      },
    },
  });

  assert.equal(result.criticalFailed, true);
  assert.equal(result.results[0].status, 'FAIL');
  assert.equal(result.results[0].critical, true);
});

test('runSuites treats every suite error as terminal critical failure', async () => {
  const result = await runSuites(['unit'], {
    repoRoot: process.cwd(),
    moduleId: 'mod',
    payload: {
      project: 'proj',
      test_config: {
        suite_timeout_ms: 5000,
        unit: {
          test_cmd: 'node -e "console.error(\\"expected\\"); process.exit(1)"',
        },
      },
    },
  });

  assert.equal(result.criticalFailed, true);
  assert.equal(result.results[0].status, 'ERROR');
  assert.equal(result.results[0].critical, true);
});

test('runSuites treats rejected unit command configuration as critical', async () => {
  const result = await runSuites(['unit'], {
    repoRoot: process.cwd(),
    moduleId: 'mod',
    payload: {
      project: 'proj',
      test_config: {
        suite_timeout_ms: 5000,
        unit: {
          test_cmd: 'node -e "console.error(\\"expected\\"); process.exit(1)"',
          thresholds: { max_failures: 0 },
        },
      },
    },
  });

  assert.equal(result.criticalFailed, true);
  assert.equal(result.results[0].status, 'ERROR');
  assert.equal(result.results[0].critical, true);
  assert.match(result.results[0].error, /shell metacharacters are not allowed/);
});
