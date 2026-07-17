import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  captureCheckpoint,
  checkpointDefinition,
  defaultCheckpointRoot,
} from './checkpoints.mjs';
import {
  failureMatrixExecutionBoundary,
  listFailureMatrixSuiteIds,
  listFailureMatrixSuiteScenarioIds,
  resolveFailureMatrixSuite,
} from './failure-scenarios.mjs';
import {
  buildMatrixSuiteDiscordPresentation,
  createMatrixSuiteNotifier,
  formatMatrixSuiteCliLine,
  formatMatrixSummaryCliLine,
  hasMatrixDiscordReceipt,
  matrixSummaryRecord,
  runFailureMatrix,
  runScenario,
  timeoutMsForScenario,
  writeFailureMatrixReport,
} from './run-real-pipeline-failure-matrix.mjs';

function write(filePath, value = '{}\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function createCheckpointBundle({ checkpoint = 'pre-module-buster', seedId = 'seed-1' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-checkpoint-'));
  const artifactRoot = path.join(root, 'artifact');
  const projectName = 'seed-project';
  const swarmDir = path.join(artifactRoot, 'worktree', 'Projects', projectName, 'src', '.swarm');
  write(path.join(swarmDir, 'progress.json'), JSON.stringify({
    project: projectName,
    real_e2e: { scenario_id: 'success' },
  }, null, 2));
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'seed-run-1', 'lifecycle', 'canonical-events.jsonl'), [
    JSON.stringify({ type: 'pipeline_run.started', refs: { run_id: 'seed-run-1' }, data: { project: projectName } }),
    '',
  ].join('\n'));
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'seed-run-1', 'lifecycle', 'read-models.json'), JSON.stringify({
    schema_version: 'pipeline_lifecycle_read_models.v1',
    pipeline: { run_id: 'seed-run-1', status: 'running' },
    modules: {
      '01-nginx': {
        module_id: '01-nginx',
        status: checkpoint === 'during-module-buster-wait' ? 'TESTING' : 'READY_FOR_TESTING',
      },
    },
  }, null, 2));
  for (const relativePath of checkpointDefinition(checkpoint).required_swarm_paths) {
    if (relativePath === 'progress.json') continue;
    write(path.join(swarmDir, relativePath));
  }
  const checkpointRoot = defaultCheckpointRoot(root);
  const captured = captureCheckpoint({
    checkpointRoot,
    checkpoint,
    seedId,
    workspace: {
      runId: 'seed-run-1',
      projectName,
      artifactRoot,
      worktreePath: path.join(artifactRoot, 'worktree'),
      swarmDir,
    },
  });
  return { checkpointRoot, captured, seedId };
}

test('failure matrix exposes eight canonical suites covering every case once', () => {
  assert.deepEqual(listFailureMatrixSuiteIds(), [
    'full-pipeline-smoke',
    'module-failure-retry',
    'human-gates',
    'final-deployment-buster',
    'git-authority',
    'infrastructure-observability',
    'module-graph',
    'crash-resume',
  ]);
  assert.equal(listFailureMatrixSuiteScenarioIds().length, 46);
  const ownership = new Map();
  for (const suiteId of listFailureMatrixSuiteIds()) {
    for (const scenario of resolveFailureMatrixSuite(suiteId).scenarios) {
      ownership.set(scenario, (ownership.get(scenario) || 0) + 1);
    }
  }
  assert.equal([...ownership.values()].every((count) => count === 1), true);
});

test('failure matrix suite cases declare canonical execution boundaries', () => {
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'module-failure-retry',
    scenario: 'forge-retry-then-success',
  }), 'modules');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'module-failure-retry',
    scenario: 'retry-buster-pass-echo-rejects',
  }), 'module-review');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'full-pipeline-smoke',
    scenario: 'success',
  }), 'full');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'human-gates',
    scenario: 'approval-deny',
  }), 'full');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'human-gates',
    scenario: 'pipeline-review-timeout',
  }), 'full');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'crash-resume',
    scenario: 'crash-before-buster-handoff',
  }), 'modules');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'crash-resume',
    scenario: 'crash-during-git-operation',
  }), 'modules');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'crash-resume',
    scenario: 'crash-after-final-review-before-summary',
  }), 'final-review');
  assert.equal(failureMatrixExecutionBoundary({
    suite: 'crash-resume',
    scenario: 'crash-during-cleanup',
  }), 'final-review');
});

test('failure matrix runs selected suites and rolls case failures into suite failures', async () => {
  const calls = [];
  const caseEvents = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-suite-rollup-'));
  const args = {
    mode: 'full',
    suites: ['human-gates', 'infrastructure-observability'],
    keepArtifacts: false,
    continueOnFailure: true,
    reportPath: path.join(root, 'review.md'),
    checkpointMode: 'full',
  };

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => ({ ok: true, checks: [], failures: [] }),
    runScenarioImpl: async ({ scenario }) => {
      calls.push(scenario);
      const ok = scenario !== 'redis-unavailable';
      return {
        scenario,
        ok,
        exit: { code: ok ? 0 : 1, signal: null },
        result_path: path.join(root, `${scenario}.json`),
        result: {
          ok,
          assertions: ok ? {} : {
            failure_evidence: {
              failures: [{ reason: 'REAL_E2E_REDIS_FAILURE_MISSING' }],
            },
          },
        },
        result_read_failure: null,
      };
    },
    onScenarioStarted: async (event) => caseEvents.push(event),
    onScenarioCompleted: async (event) => caseEvents.push(event),
  });

  assert.deepEqual(calls, [
    ...resolveFailureMatrixSuite('human-gates').scenarios,
    ...resolveFailureMatrixSuite('infrastructure-observability').scenarios,
  ]);
  assert.equal(matrix.ok, false);
  assert.equal(matrix.completed_count, 2);
  assert.deepEqual(matrix.failures.map((failure) => failure.suite), ['infrastructure-observability']);
  assert.equal(matrix.failures[0].failed_case, 'redis-unavailable');
  assert.equal(matrix.failures[0].cases.length, 5);
  assert.equal(caseEvents.some((event) => event.phase === 'failure-suite-case-started' && event.scenario === 'redis-unavailable'), true);
  assert.equal(caseEvents.some((event) => event.phase === 'failure-suite-case-completed' && event.scenario === 'redis-unavailable' && event.status === 'failed'), true);
});

test('failure matrix records aborted case and continues through requested suite cases', async () => {
  const calls = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-suite-aborted-'));
  const args = {
    mode: 'full',
    suites: ['module-failure-retry'],
    keepArtifacts: false,
    continueOnFailure: true,
    reportPath: path.join(root, 'review.md'),
    checkpointMode: 'full',
  };

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => ({ ok: true, checks: [], failures: [] }),
    runScenarioImpl: async ({ scenario }) => {
      calls.push(scenario);
      if (scenario === 'retry-fix-malformed-output') throw new Error('synthetic case abort');
      return {
        scenario,
        ok: true,
        exit: { code: 0, signal: null },
        result_path: path.join(root, `${scenario}.json`),
        result: { ok: true },
        result_read_failure: null,
      };
    },
  });

  const suiteCases = resolveFailureMatrixSuite('module-failure-retry').scenarios;
  assert.deepEqual(calls, suiteCases);
  assert.equal(matrix.ok, false);
  assert.equal(matrix.failures[0].failed_case, 'retry-fix-malformed-output');
  const record = JSON.parse(fs.readFileSync(matrix.failures[0].result_path, 'utf8'));
  assert.equal(record.completed_case_count, suiteCases.length);
  assert.equal(record.not_run_case_count, 0);
  assert.equal(record.cases.find((entry) => entry.scenario === 'retry-fix-malformed-output').status, 'aborted');
});

test('failure matrix can resume a suite from a selected scenario', async () => {
  const calls = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-suite-from-scenario-'));
  const args = {
    mode: 'full',
    suites: ['module-failure-retry'],
    fromScenario: 'retry-buster-pass-echo-rejects',
    keepArtifacts: false,
    continueOnFailure: true,
    reportPath: path.join(root, 'review.md'),
    checkpointMode: 'full',
  };

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => ({ ok: true, checks: [], failures: [] }),
    runScenarioImpl: async ({ scenario }) => {
      calls.push(scenario);
      return {
        scenario,
        ok: true,
        exit: { code: 0, signal: null },
        result_path: path.join(root, `${scenario}.json`),
        result: { ok: true },
        result_read_failure: null,
      };
    },
  });

  const expected = resolveFailureMatrixSuite('module-failure-retry').scenarios
    .slice(resolveFailureMatrixSuite('module-failure-retry').scenarios.indexOf('retry-buster-pass-echo-rejects'));
  assert.deepEqual(calls, expected);
  assert.equal(matrix.ok, true);
  const record = JSON.parse(fs.readFileSync(matrix.results[0].result_path, 'utf8'));
  assert.equal(record.requested_case_count, expected.length);
  assert.equal(record.cases.find((entry) => entry.scenario === 'forge-retry-then-success').reason, 'not_requested');
});

test('failure matrix can run one selected scenario through its owning suite only', async () => {
  const calls = [];
  const args = {
    mode: 'full',
    suites: listFailureMatrixSuiteIds(),
    onlyScenario: 'retry-buster-pass-echo-rejects',
    keepArtifacts: false,
    continueOnFailure: false,
    checkpointMode: 'full',
  };

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => ({ ok: true, checks: [], failures: [] }),
    runScenarioImpl: async ({ suite, scenario }) => {
      calls.push({ suite, scenario });
      return {
        scenario,
        ok: true,
        exit: { code: 0, signal: null },
        result_path: `/tmp/${scenario}.json`,
        result: { ok: true },
        result_read_failure: null,
      };
    },
  });

  assert.deepEqual(calls, [{ suite: 'module-failure-retry', scenario: 'retry-buster-pass-echo-rejects' }]);
  assert.equal(matrix.ok, true);
  assert.equal(matrix.completed_count, 1);
});

test('failure matrix fail-fast stops at the first failed suite', async () => {
  const calls = [];
  const args = {
    mode: 'full',
    suites: ['infrastructure-observability', 'human-gates'],
    keepArtifacts: false,
    continueOnFailure: false,
    checkpointMode: 'full',
  };

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => ({ ok: true, checks: [], failures: [] }),
    runScenarioImpl: async ({ scenario }) => {
      calls.push(scenario);
      return {
        scenario,
        ok: false,
        exit: { code: 1, signal: null },
        result_path: `/tmp/${scenario}.json`,
        result: { ok: false, errors: [{ reason: 'expected' }] },
        result_read_failure: null,
      };
    },
  });

  assert.deepEqual(calls, ['redis-unavailable']);
  assert.equal(matrix.completed_count, 1);
  assert.equal(matrix.skipped_count, 1);
  assert.deepEqual(matrix.failures.map((failure) => failure.suite), ['infrastructure-observability']);
});

test('failure matrix seed mode runs the canonical checkpoint seed child only', async () => {
  const calls = [];
  const args = {
    mode: 'full',
    suites: ['module-failure-retry'],
    keepArtifacts: false,
    continueOnFailure: true,
    reportPath: null,
    checkpointMode: 'seed',
    checkpointRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-seed-only-checkpoints-')),
    checkpointSeedId: 'seed-only',
  };

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => ({ ok: true, checks: [], failures: [] }),
    runScenarioImpl: async ({ scenario, keepArtifacts, checkpoint }) => {
      calls.push({ scenario, keepArtifacts, checkpoint });
      return {
        scenario,
        ok: true,
        exit: { code: 0, signal: null },
        result_path: `/tmp/${scenario}.json`,
        result: { ok: true },
        result_read_failure: null,
        checkpoint,
      };
    },
  });

  assert.deepEqual(calls.map((call) => call.scenario), ['success']);
  assert.equal(calls[0].keepArtifacts, true);
  assert.equal(calls[0].checkpoint.mode, 'seed');
  assert.equal(matrix.ok, true);
  assert.equal(matrix.completed_count, 1);
  assert.equal(matrix.checkpoint_summary.checkpoint_seed_count, 1);
});

test('failure matrix reuse mode starts suite cases from valid checkpoints', async () => {
  const { checkpointRoot, seedId, captured } = createCheckpointBundle({ checkpoint: 'pre-forge' });
  const calls = [];
  const args = {
    mode: 'full',
    suites: ['full-pipeline-smoke'],
    keepArtifacts: false,
    continueOnFailure: false,
    reportPath: null,
    checkpointMode: 'reuse',
    checkpointRoot,
    checkpointSeedId: seedId,
  };

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => ({ ok: true, checks: [], failures: [] }),
    runScenarioImpl: async ({ scenario, checkpoint }) => {
      calls.push({ scenario, checkpoint });
      return {
        scenario,
        ok: true,
        exit: { code: 0, signal: null },
        result_path: `/tmp/${scenario}.json`,
        result: { ok: true },
        result_read_failure: null,
        checkpoint,
      };
    },
  });

  assert.deepEqual(calls.map((call) => call.scenario), ['success']);
  assert.equal(calls[0].checkpoint.mode, 'reuse');
  assert.equal(calls[0].checkpoint.name, 'pre-forge');
  assert.equal(calls[0].checkpoint.restore_dir, captured.checkpoint_dir);
  assert.equal(matrix.checkpoint_summary.checkpoint_reused_count, 1);
});

test('failure matrix suite Discord presentation and receipt use suite identity', () => {
  const start = buildMatrixSuiteDiscordPresentation({
    phase: 'failure-suite-started',
    suite: 'human-gates',
    suite_index: 2,
    suite_count: 8,
    suite_case_count: 6,
    suite_cases: resolveFailureMatrixSuite('human-gates').scenarios,
  });
  assert.equal(start.level, 'INFO');
  assert.match(start.title, /Suite 2\/8 started: human-gates/);

  const failed = buildMatrixSuiteDiscordPresentation({
    phase: 'failure-suite-completed',
    suite: 'human-gates',
    suite_index: 2,
    suite_count: 8,
    suite_case_count: 6,
    ok: false,
    failed_case: 'approval-deny',
    cases: [{ scenario: 'approval-deny', ok: false, result: { ok: false, errors: [{ reason: 'expected' }] } }],
  });
  assert.equal(failed.level, 'WARN');
  assert.match(failed.title, /Suite 2\/8 failed: human-gates/);
  assert.equal(failed.fields.find((field) => field.name === 'Failed Case').value, 'approval-deny');

  const receipts = [{
    run_id: 'matrix-run-1',
    ok: true,
    message_id: 'message-1',
    channel_id: 'channel-1',
    webhook_message_returned: true,
    correlation: {
      gate_id: 'human-gates',
      gate_type: 'real-e2e-suite',
    },
  }];
  assert.equal(hasMatrixDiscordReceipt(receipts, 'matrix-run-1', { suite: 'human-gates' }), true);
  assert.equal(hasMatrixDiscordReceipt(receipts, 'matrix-run-1', { suite: 'git-authority' }), false);

  const caseStart = buildMatrixSuiteDiscordPresentation({
    phase: 'failure-suite-case-started',
    suite: 'module-failure-retry',
    scenario: 'retry-budget-exhausted',
    case_index: 2,
    case_count: 11,
  });
  assert.equal(caseStart.level, 'INFO');
  assert.match(caseStart.title, /Suite case 2\/11 started: retry-budget-exhausted/);

  const caseReceipts = [{
    run_id: 'matrix-run-1',
    ok: true,
    message_id: 'message-2',
    channel_id: 'channel-1',
    webhook_message_returned: true,
    correlation: {
      gate_id: 'module-failure-retry:retry-budget-exhausted',
      gate_type: 'real-e2e-suite',
    },
  }];
  assert.equal(hasMatrixDiscordReceipt(caseReceipts, 'matrix-run-1', {
    phase: 'failure-suite-case-completed',
    suite: 'module-failure-retry',
    scenario: 'retry-budget-exhausted',
  }), true);
});

test('failure matrix CLI and summary records are suite based', () => {
  assert.equal(formatMatrixSuiteCliLine({
    suite: 'human-gates',
    ok: true,
    result_path: '/tmp/human-gates.json',
  }), 'PASS suite=human-gates reason=ok artifact=/tmp/human-gates.json');

  assert.equal(formatMatrixSuiteCliLine({
    phase: 'failure-suite-skipped',
    suite: 'git-authority',
    reason: 'REAL_E2E_SKIPPED_BY_GLOBAL_BLOCKER',
    result_path: '/tmp/git-authority.json',
  }), 'SKIP suite=git-authority reason=REAL_E2E_SKIPPED_BY_GLOBAL_BLOCKER artifact=/tmp/git-authority.json');

  assert.equal(formatMatrixSummaryCliLine({
    ok: false,
    suite_count: 8,
    completed_count: 2,
    skipped_count: 1,
    failure_count: 1,
    summary_path: '/tmp/matrix-summary.json',
    report_path: '/tmp/review.md',
  }), 'SUMMARY status=FAIL suites=8 completed=2 skipped=1 failed=1 artifact=/tmp/matrix-summary.json report=/tmp/review.md');

  const record = matrixSummaryRecord({
    args: {
      mode: 'full',
      suites: ['human-gates', 'git-authority'],
      continueOnFailure: true,
      scenarioTimeoutMs: 1,
      happyPathTimeoutMs: 2,
      rateLimitTimeoutExtensionMs: 3,
      globalBlockerThreshold: 4,
    },
    matrix: {
      ok: false,
      completed_count: 1,
      skipped_count: 1,
      failures: [{ suite: 'human-gates', scenario: 'human-gates', result: { ok: false } }],
      skipped_by_global_blocker: [],
      report_path: '/tmp/report.md',
      results: [],
    },
    matrixSuiteNotifier: {
      mode: 'muted',
      reason: 'test',
      runId: null,
    },
    summaryPath: '/tmp/summary.json',
  });
  assert.equal(record.suite_count, 2);
  assert.equal(record.status, 'FAIL');
});

test('failure matrix Discord notifier reports explicit muted mode when disabled', async () => {
  const notifier = await createMatrixSuiteNotifier({
    matrixDiscordNotifications: false,
  });

  assert.equal(notifier.mode, 'muted');
  assert.equal(notifier.reason, 'disabled_by_cli');
  assert.deepEqual(await notifier.notify({ suite: 'human-gates' }), {
    status: 'muted',
    reason: 'disabled_by_cli',
  });
});

test('failure matrix applies longer timeout only to expected happy-path scenarios', () => {
  assert.equal(
    timeoutMsForScenario({
      scenarioConfig: { expectedPipelineExit: 'zero' },
      scenarioTimeoutMs: 120000,
      happyPathTimeoutMs: 900000,
    }),
    900000,
  );
  assert.equal(
    timeoutMsForScenario({
      scenarioConfig: { expectedPipelineExit: 'nonzero' },
      scenarioTimeoutMs: 120000,
      happyPathTimeoutMs: 900000,
    }),
    120000,
  );
  assert.equal(
    timeoutMsForScenario({
      scenarioConfig: { expectedPipelineExit: 'zero', crashResume: true },
      scenarioTimeoutMs: 120000,
      happyPathTimeoutMs: 900000,
      crashResumeTimeoutMs: 5400000,
    }),
    5400000,
  );
});

test('failure matrix report includes suite and case result files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-suite-report-'));
  const reportPath = path.join(root, 'review.md');
  writeFailureMatrixReport({
    args: {
      mode: 'full',
      continueOnFailure: true,
      suites: ['human-gates'],
      checkpointMode: 'reuse',
      reportPath,
    },
    results: [{
      suite: 'human-gates',
      scenario: 'human-gates',
      ok: true,
      exit: { code: 0, signal: null },
      result_path: path.join(root, 'human-gates.json'),
      result: { ok: true },
      cases: [{
        scenario: 'approval-deny',
        ok: true,
        result_path: path.join(root, 'approval-deny.json'),
        result: { ok: true },
        checkpoint: {
          mode: 'reuse',
          name: 'post-module-review',
          restore_dir: path.join(root, 'checkpoint'),
          estimated_skipped_agent_phase_count: 4,
          agent_phase_count_to_run: 6,
        },
      }],
    }],
    failures: [],
  });

  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /Requested suites: 1/);
  assert.match(report, /Registry suites: 8/);
  assert.match(report, /Registry cases: 46/);
  assert.match(report, /human-gates: passed/);
  assert.match(report, /approval-deny: passed/);
  assert.match(report, /Reused checkpoints: 1/);
});

test('runScenario stamps typed harness-aborted result when child exits before pipeline verdict', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-run-aborted-'));
  const runnerPath = path.join(root, 'partial-runner.mjs');
  fs.writeFileSync(runnerPath, `
    import fs from 'node:fs';
    import path from 'node:path';
    const resultPath = process.argv[process.argv.indexOf('--result-path') + 1];
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: false,
      scenario: { id: 'retry-fix-malformed-output' },
      phases: [{ phase: 'workspace-created', ok: true }]
    }, null, 2));
    process.stdout.write('full stdout line from child\\n');
    process.stderr.write('full stderr line from child\\n');
    process.exit(1);
  `);

  const result = await runScenario({
    mode: 'full',
    scenario: 'retry-fix-malformed-output',
    keepArtifacts: false,
    scenarioTimeoutMs: 30000,
    runnerPath,
  });

  assert.equal(result.ok, false);
  assert.equal(result.result.pipeline.phase, 'harness-aborted');
  assert.equal(result.result.pipeline.reason, 'REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT');
  assert.equal(result.result.assertions.failure_output_diagnostic.reason, 'REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT');
  assert.equal(fs.readFileSync(result.child_output_logs.stdout, 'utf8'), 'full stdout line from child\n');
  assert.equal(fs.readFileSync(result.child_output_logs.stderr, 'utf8'), 'full stderr line from child\n');
});

test('runScenario passes suite boundary and disables terminal extras outside full runs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-boundary-env-'));
  const runnerPath = path.join(root, 'env-runner.mjs');
  fs.writeFileSync(runnerPath, `
    import fs from 'node:fs';
    import path from 'node:path';
    const resultPath = process.argv[process.argv.indexOf('--result-path') + 1];
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: true,
      scenario: { id: 'retry-buster-pass-echo-rejects' },
      pipeline: { phase: 'pipeline-run' },
      env: {
        REAL_E2E_EXECUTION_BOUNDARY: process.env.REAL_E2E_EXECUTION_BOUNDARY,
        REAL_E2E_TERMINAL_EXTRAS: process.env.REAL_E2E_TERMINAL_EXTRAS
      }
    }, null, 2));
    process.exit(0);
  `);

  const result = await runScenario({
    mode: 'full',
    suite: 'module-failure-retry',
    scenario: 'retry-buster-pass-echo-rejects',
    keepArtifacts: false,
    scenarioTimeoutMs: 30000,
    runnerPath,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution_boundary, 'module-review');
  assert.equal(result.result.env.REAL_E2E_EXECUTION_BOUNDARY, 'module-review');
  assert.equal(result.result.env.REAL_E2E_TERMINAL_EXTRAS, '0');
});

test('runScenario does not mute Discord webhooks for the Discord-unavailable scenario', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-matrix-discord-unavailable-env-'));
  const runnerPath = path.join(root, 'env-runner.mjs');
  fs.writeFileSync(runnerPath, `
    import fs from 'node:fs';
    import path from 'node:path';
    const resultPath = process.argv[process.argv.indexOf('--result-path') + 1];
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: true,
      scenario: { id: 'discord-unavailable' },
      pipeline: { phase: 'pipeline-run' },
      env: {
        REAL_E2E_EXECUTION_BOUNDARY: process.env.REAL_E2E_EXECUTION_BOUNDARY,
        REAL_E2E_TERMINAL_EXTRAS: process.env.REAL_E2E_TERMINAL_EXTRAS,
        KUBECLAW_DISABLE_DISCORD_WEBHOOKS: process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS || null
      }
    }, null, 2));
    process.exit(0);
  `);

  const result = await runScenario({
    mode: 'full',
    suite: 'infrastructure-observability',
    scenario: 'discord-unavailable',
    keepArtifacts: false,
    scenarioTimeoutMs: 30000,
    runnerPath,
  });

  assert.equal(result.ok, true);
  assert.equal(result.execution_boundary, 'final-buster');
  assert.equal(result.result.env.REAL_E2E_EXECUTION_BOUNDARY, 'final-buster');
  assert.equal(result.result.env.REAL_E2E_TERMINAL_EXTRAS, '0');
  assert.equal(result.result.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS, null);
});
