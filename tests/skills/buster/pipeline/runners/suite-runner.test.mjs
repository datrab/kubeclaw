import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { resolvePerfReportPaths } from '../../../../../skills/buster/pipeline/suites/perf.ts';
import { resolveSandboxResultsDir, runSuites, runSuiteWithTimeout } from '../../../../../skills/buster/pipeline/runners/suite-runner.ts';

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

test('sandbox verdict paths are namespaced by module and attempt', () => {
  assert.equal(
    resolveSandboxResultsDir('module/a', 1),
    path.join('/sandbox/results', 'module_a-attempt-1'),
  );
  assert.equal(
    resolveSandboxResultsDir('module-b', 2),
    path.join('/sandbox/results', 'module-b-attempt-2'),
  );
  assert.notEqual(resolveSandboxResultsDir('module/a', 1), resolveSandboxResultsDir('module-b', 2));
});

test('perf report paths use per-run scratch and final artifacts', () => {
  const first = resolvePerfReportPaths({ moduleId: 'module/a', attempt: 1, resultsDir: '/sandbox/results' });
  const second = resolvePerfReportPaths({ moduleId: 'module-b', attempt: 1, resultsDir: '/sandbox/results' });

  assert.match(first.scratchPath, /^\/sandbox\/results\/module_a-attempt-1\/\.lighthouse-report-module_a-attempt-1-[a-zA-Z0-9._-]+\.tmp\.json$/);
  assert.match(first.finalPath, /^\/sandbox\/results\/module_a-attempt-1\/lighthouse-report-module_a-attempt-1-[a-zA-Z0-9._-]+\.json$/);
  assert.notEqual(first.scratchPath, first.finalPath);
  assert.notEqual(first.scratchPath, second.scratchPath);
  assert.notEqual(first.finalPath, second.finalPath);
});

test('perf report paths use a unique scratch path for each invocation', () => {
  const context = { moduleId: 'module/a', attempt: 1, testsLogDir: '/tmp/shared-tests', resultsDir: '/sandbox/results' };
  const first = resolvePerfReportPaths(context);
  const second = resolvePerfReportPaths(context);

  assert.notEqual(first.finalPath, second.finalPath);
  assert.notEqual(first.scratchPath, second.scratchPath);
});

test('perf report paths stay distinct even when modules share testsLogDir', () => {
  const sharedTestsDir = '/tmp/shared-tests';
  const first = resolvePerfReportPaths({ moduleId: 'module/a', attempt: 1, testsLogDir: sharedTestsDir, resultsDir: '/sandbox/results' });
  const second = resolvePerfReportPaths({ moduleId: 'module-b', attempt: 1, testsLogDir: sharedTestsDir, resultsDir: '/sandbox/results' });

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
