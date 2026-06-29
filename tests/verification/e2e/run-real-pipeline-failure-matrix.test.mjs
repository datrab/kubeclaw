import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectFailureMatrixFindings,
  runFailureMatrix,
  runScenario,
  summarizeScenario,
  writeFailureMatrixReport,
} from './run-real-pipeline-failure-matrix.mjs';

test('failure matrix continue-on-failure completes mixed pass and fail children', async () => {
  const calls = [];
  const started = [];
  const completed = [];
  const reportCalls = [];
  const capabilityProbe = {
    ok: true,
    checks: [
      {
        name: 'Discord production delivery receipt',
        code: 'discord_delivery',
        ok: true,
        duration_ms: 42,
        configured_target: 'real-channel',
        run_id: 'real-e2e-discord-capability-1',
        message_id: 'message-1',
        channel_id: 'channel-1',
      },
    ],
    failures: [],
  };
  const args = {
    mode: 'full',
    scenarios: ['approval-deny', 'buster-module-failure', 'redis-unavailable'],
    keepArtifacts: false,
    continueOnFailure: true,
    reportPath: '/tmp/real-e2e-review.md',
  };

  const matrix = await runFailureMatrix(args, {
    runScenarioImpl: async ({ mode, scenario, keepArtifacts, discordDeliveryResult }) => {
      calls.push({ mode, scenario, keepArtifacts, discordDeliveryResult });
      return {
        scenario,
        ok: scenario === 'buster-module-failure',
        exit: { code: scenario === 'buster-module-failure' ? 0 : 1, signal: null },
        result_path: `/tmp/${scenario}.json`,
        result: { ok: scenario === 'buster-module-failure', capability_probe: capabilityProbe },
        result_read_failure: null,
      };
    },
    runCapabilityProbeImpl: async () => capabilityProbe,
    writeReportImpl: (payload) => {
      reportCalls.push(payload);
      return args.reportPath;
    },
    onScenarioStarted: (event) => started.push(event),
    onScenarioCompleted: (event) => completed.push(event),
  });

  assert.deepEqual(calls.map((call) => call.scenario), args.scenarios);
  assert.deepEqual(calls[0].discordDeliveryResult, {
    ok: true,
    configured_target: 'real-channel',
    run_id: 'real-e2e-discord-capability-1',
    message_id: 'message-1',
    channel_id: 'channel-1',
  });
  assert.deepEqual(calls[1].discordDeliveryResult, {
    ok: true,
    configured_target: 'real-channel',
    run_id: 'real-e2e-discord-capability-1',
    message_id: 'message-1',
    channel_id: 'channel-1',
  });
  assert.deepEqual(calls[2].discordDeliveryResult, calls[1].discordDeliveryResult);
  assert.deepEqual(started.map((event) => event.scenario), args.scenarios);
  assert.deepEqual(completed.map((event) => event.scenario), args.scenarios);
  assert.equal(matrix.ok, false);
  assert.equal(matrix.completed_count, 3);
  assert.equal(matrix.skipped_count, 0);
  assert.deepEqual(matrix.failures.map((failure) => failure.scenario), ['approval-deny', 'redis-unavailable']);
  assert.equal(matrix.report_path, args.reportPath);
  assert.equal(reportCalls.length, 1);
  assert.deepEqual(reportCalls[0].failures.map((failure) => failure.scenario), ['approval-deny', 'redis-unavailable']);
});

test('failure matrix scenario timeout writes structured harness failure result', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-timeout-'));
  const runnerPath = path.join(root, 'never-exits.mjs');
  fs.writeFileSync(runnerPath, `
    import fs from 'node:fs';
    import path from 'node:path';
    const resultPath = process.argv[process.argv.indexOf('--result-path') + 1];
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: false,
      scenario: { id: 'approval-deny' },
      errors: []
    }, null, 2) + '\\n');
    setInterval(() => process.stdout.write('still running\\n'), 1000);
  `);

  const result = await runScenario({
    mode: 'full',
    scenario: 'approval-deny',
    keepArtifacts: false,
    scenarioTimeoutMs: 25,
    runnerPath,
  });

  assert.equal(result.ok, false);
  assert.equal(result.timed_out, true);
  assert.equal(result.result_read_failure, null);
  assert.equal(result.result.errors.at(-1).reason, 'REAL_E2E_SCENARIO_TIMEOUT');
  assert.equal(result.result.errors.at(-1).timeout_ms, 25);
  assert.equal(result.result.diagnostics.matrix_child.label, 'failure-matrix:approval-deny');
  assert.equal(fs.existsSync(result.result_path), true);
  const written = JSON.parse(fs.readFileSync(result.result_path, 'utf8'));
  assert.equal(written.errors.at(-1).reason, 'REAL_E2E_SCENARIO_TIMEOUT');
});

test('failure matrix scenario timeout terminates child process group', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-process-group-'));
  const markerPath = path.join(root, 'orphan-marker.txt');
  const grandchildPath = path.join(root, 'grandchild.mjs');
  const runnerPath = path.join(root, 'runner.mjs');
  fs.writeFileSync(grandchildPath, `
    import fs from 'node:fs';
    setTimeout(() => {
      fs.writeFileSync(${JSON.stringify(markerPath)}, 'orphan still running\\n');
    }, 500);
    setInterval(() => {}, 1000);
  `);
  fs.writeFileSync(runnerPath, `
    import fs from 'node:fs';
    import path from 'node:path';
    import { spawn } from 'node:child_process';
    const resultPath = process.argv[process.argv.indexOf('--result-path') + 1];
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: false,
      scenario: { id: 'approval-deny' },
      errors: []
    }, null, 2) + '\\n');
    spawn(process.execPath, [${JSON.stringify(grandchildPath)}], { stdio: 'ignore' }).unref();
    setInterval(() => process.stdout.write('parent still running\\n'), 1000);
  `);

  const result = await runScenario({
    mode: 'full',
    scenario: 'approval-deny',
    keepArtifacts: false,
    scenarioTimeoutMs: 25,
    runnerPath,
  });
  await new Promise((resolve) => setTimeout(resolve, 900));

  assert.equal(result.timed_out, true);
  assert.equal(fs.existsSync(markerPath), false);
});

test('failure matrix mutes webhooks for expected non-Discord failures only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-webhook-mute-'));
  const runnerPath = path.join(root, 'env-recorder.mjs');
  fs.writeFileSync(runnerPath, `
    import fs from 'node:fs';
    import path from 'node:path';
    const resultPath = process.argv[process.argv.indexOf('--result-path') + 1];
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: true,
      scenario: { id: process.env.REAL_E2E_SCENARIO },
      env: { KUBECLAW_DISABLE_DISCORD_WEBHOOKS: process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS || null },
      errors: []
    }, null, 2) + '\\n');
  `);

  const approval = await runScenario({
    mode: 'full',
    scenario: 'approval-deny',
    keepArtifacts: false,
    runnerPath,
  });
  const discord = await runScenario({
    mode: 'full',
    scenario: 'discord-unavailable',
    keepArtifacts: false,
    runnerPath,
  });
  const success = await runScenario({
    mode: 'full',
    scenario: 'approval-commentary',
    keepArtifacts: false,
    runnerPath,
  });

  assert.equal(approval.result.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS, '1');
  assert.equal(discord.result.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS, null);
  assert.equal(success.result.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS, null);
});

test('failure matrix fail-fast skips remaining children without continue-on-failure', async () => {
  const calls = [];
  const args = {
    mode: 'full',
    scenarios: ['approval-deny', 'buster-module-failure', 'redis-unavailable'],
    keepArtifacts: false,
    continueOnFailure: false,
    reportPath: null,
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
        result: { ok: false },
        result_read_failure: null,
      };
    },
    writeReportImpl: () => {
      throw new Error('report should not be written without --continue-on-failure or --report-path');
    },
  });

  assert.deepEqual(calls, ['approval-deny']);
  assert.equal(matrix.ok, false);
  assert.equal(matrix.completed_count, 1);
  assert.equal(matrix.skipped_count, 2);
  assert.equal(matrix.report_path, null);
});

test('failure matrix writes one synthetic result per scenario when matrix capabilities fail', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-capabilities-'));
  const args = {
    mode: 'full',
    scenarios: ['approval-deny', 'buster-module-failure', 'redis-unavailable'],
    keepArtifacts: false,
    continueOnFailure: true,
    reportPath: path.join(root, 'review.md'),
  };
  const capabilityProbe = {
    ok: false,
    checks: [{ code: 'tailscale_operator', ok: false }],
    failures: [{ reason: 'INFRA_MISSING_TAILSCALE_OPERATOR', code: 'tailscale_operator', deployment: 'operator' }],
  };
  const scenarioCalls = [];

  const matrix = await runFailureMatrix(args, {
    runCapabilityProbeImpl: async () => capabilityProbe,
    runScenarioImpl: async ({ scenario }) => {
      scenarioCalls.push(scenario);
      throw new Error('child scenarios must not run when matrix capabilities fail');
    },
  });

  assert.deepEqual(scenarioCalls, []);
  assert.equal(matrix.ok, false);
  assert.equal(matrix.completed_count, 3);
  assert.equal(matrix.skipped_count, 0);
  assert.deepEqual(matrix.failures.map((failure) => failure.scenario), args.scenarios);
  for (const result of matrix.results) {
    assert.equal(result.result.capability_probe, capabilityProbe);
    assert.equal(result.result.phases[0].reused_from_matrix, true);
    assert.equal(fs.existsSync(result.result_path), true);
  }
  const report = fs.readFileSync(args.reportPath, 'utf8');
  assert.match(report, /#### 3 scenarios: INFRA_MISSING_TAILSCALE_OPERATOR/);
  assert.match(report, /`approval-deny`, `buster-module-failure`, `redis-unavailable`/);
});

test('failure matrix report groups multiple scenario failures from structured results', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-report-'));
  const reportPath = path.join(root, 'review.md');
  const contractCleanupFailure = {
    scenario: 'buster-module-failure',
    ok: false,
    exit: { code: 1, signal: null },
    result_path: path.join(root, 'buster-module-failure.json'),
    result: {
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: false,
      pipeline: {
        phase: 'pipeline-run',
      },
      assertions: {
        failure_output_diagnostic: {
          diagnostic_only: true,
          matched: false,
          reason: 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_MODULE_FAILURE',
        },
        failure_evidence: {
          failures: [
            { code: 'buster_module_failure', reason: 'REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL' },
          ],
        },
      },
      workspace: {
        artifact_root: '/tmp/real-e2e-artifacts',
      },
      artifact_paths: {
        project_src: '/tmp/real-e2e-project/src',
      },
      diagnostics: {
        pipeline: {
          stdout: {
            tail: 'bounded structured stdout',
            bytes: 25,
            truncated: false,
            tail_limit_bytes: 65536,
            fatal_line_limit: 20,
            fatal_lines: [],
          },
          stderr: {
            tail: 'bounded structured stderr',
            bytes: 25,
            truncated: false,
            tail_limit_bytes: 65536,
            fatal_line_limit: 20,
            fatal_lines: ['Error: structured fatal line'],
          },
        },
      },
      cleanup: {
        cleanup: {
          steps: [
            { step: 'kubernetes_namespace_delete', ok: false, detail: 'namespace still terminating' },
          ],
        },
      },
    },
    ignored_child_output: 'ignored child stdout\n',
  };
  const infraFailure = {
    scenario: 'redis-unavailable',
    ok: false,
    exit: { code: 1, signal: null },
    result_path: path.join(root, 'redis-unavailable.json'),
    result: {
      schema_version: 'real_pipeline_e2e_result.v1',
      ok: false,
      capability_probe: {
        ok: false,
        failures: [
          { reason: 'INFRA_REDIS_UNAVAILABLE', name: 'redis', detail: 'connection refused' },
        ],
      },
      phases: [
        { phase: 'capabilities', ok: false },
      ],
    },
    ignored_child_output: 'ignored infra child stdout\n',
  };
  const harnessFailure = {
    scenario: 'pipeline-summary-failure',
    ok: false,
    exit: { code: 1, signal: null },
    result_path: path.join(root, 'pipeline-summary-failure.json'),
    result: null,
    result_read_failure: {
      reason: 'REAL_E2E_RESULT_FILE_READ_FAILED',
      path: path.join(root, 'pipeline-summary-failure.json'),
      error: 'ENOENT',
    },
    ignored_child_output: 'child stdout must not render\nchild stderr must not render\n',
  };
  const passedResult = {
    scenario: 'approval-deny',
    ok: true,
    exit: { code: 0, signal: null },
    result_path: path.join(root, 'approval-deny.json'),
    result: { ok: true },
    ignored_child_output: '',
  };

  const summary = summarizeScenario(contractCleanupFailure);
  assert.deepEqual(summary.reasons, [
    'REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL',
    'kubernetes_namespace_delete: namespace still terminating',
  ]);
  const findings = collectFailureMatrixFindings([contractCleanupFailure, infraFailure, harnessFailure]);
  assert.equal(findings.infra_blockers.length, 1);
  assert.equal(findings.contract_failures.length, 1);
  assert.equal(findings.cleanup_failures.length, 1);
  assert.equal(findings.harness_failures.length, 1);

  const writtenPath = writeFailureMatrixReport({
    args: {
      mode: 'full',
      scenarios: ['approval-deny', 'buster-module-failure', 'redis-unavailable', 'pipeline-summary-failure', 'discord-unavailable'],
      continueOnFailure: true,
      reportPath,
    },
    results: [passedResult, contractCleanupFailure, infraFailure, harnessFailure],
    failures: [contractCleanupFailure, infraFailure, harnessFailure],
  });

  assert.equal(writtenPath, reportPath);
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /# Real Pipeline E2E Failure Matrix Review/);
  assert.match(report, /### Infra Blockers/);
  assert.match(report, /#### redis-unavailable: INFRA_REDIS_UNAVAILABLE/);
  assert.match(report, /### Contract Failures/);
  assert.match(report, /#### buster-module-failure: REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL/);
  assert.match(report, /### Cleanup Failures/);
  assert.match(report, /#### buster-module-failure: kubernetes_namespace_delete/);
  assert.match(report, /### Harness Failures/);
  assert.match(report, /#### pipeline-summary-failure: REAL_E2E_RESULT_FILE_READ_FAILED/);
  assert.match(report, /Failure output diagnostic/);
  assert.match(report, /REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_MODULE_FAILURE/);
  assert.match(report, /Bounded diagnostics from result JSON/);
  assert.match(report, /bounded structured stdout/);
  assert.doesNotMatch(report, /ignored child stdout/);
  assert.doesNotMatch(report, /child stdout must not render/);
  assert.match(report, /## Passed Scenarios/);
  assert.match(report, /- approval-deny/);
  assert.match(report, /## Skipped Scenarios/);
  assert.match(report, /- discord-unavailable/);
});

test('failure matrix report treats missing structured result as harness failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-matrix-missing-result-'));
  const reportPath = path.join(root, 'review.md');
  const failedResult = {
    scenario: 'redis-unavailable',
    ok: false,
    exit: { code: 1, signal: null },
    result_path: path.join(root, 'missing.json'),
    result: null,
    result_read_failure: {
      reason: 'REAL_E2E_RESULT_FILE_READ_FAILED',
      path: path.join(root, 'missing.json'),
      error: 'ENOENT',
    },
    ignored_child_output: 'child stdout diagnostic\nchild stderr diagnostic\n',
  };

  const summary = summarizeScenario(failedResult);
  assert.deepEqual(summary.reasons, ['REAL_E2E_RESULT_FILE_READ_FAILED']);

  writeFailureMatrixReport({
    args: {
      mode: 'full',
      scenarios: ['redis-unavailable'],
      continueOnFailure: true,
      reportPath,
    },
    results: [failedResult],
    failures: [failedResult],
  });

  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /### Harness Failures/);
  assert.match(report, /REAL_E2E_RESULT_FILE_READ_FAILED/);
  assert.doesNotMatch(report, /Child stdout tail while result file was unavailable/);
  assert.doesNotMatch(report, /child stdout diagnostic/);
  assert.doesNotMatch(report, /child stderr diagnostic/);
});
