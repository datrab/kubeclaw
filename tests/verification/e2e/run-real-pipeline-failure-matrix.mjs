#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFullFailureMatrixScenarioIds, resolveRealE2EScenario } from './failure-scenarios.mjs';
import { captureChildOutput } from './bounded-output-capture.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RUNNER_PATH = path.join(SCRIPT_DIR, 'run-real-pipeline-e2e.mjs');

function parseArgs(argv) {
  const args = {
    mode: 'full',
    scenarios: listFullFailureMatrixScenarioIds(),
    keepArtifacts: process.env.REAL_E2E_KEEP_ARTIFACTS === '1',
    continueOnFailure: false,
    reportPath: process.env.REAL_E2E_FAILURE_MATRIX_REPORT || null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      args.mode = argv[++index] || '';
    } else if (arg === '--scenario') {
      args.scenarios = [argv[++index] || ''];
    } else if (arg === '--scenarios') {
      args.scenarios = String(argv[++index] || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (arg === '--keep-artifacts') {
      args.keepArtifacts = true;
    } else if (arg === '--continue-on-failure') {
      args.continueOnFailure = true;
    } else if (arg === '--report-path') {
      args.reportPath = argv[++index] || '';
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['fast', 'full'].includes(args.mode)) throw new Error('--mode must be fast or full');
  if (args.scenarios.length === 0) throw new Error('at least one scenario is required');
  if (args.reportPath === '') throw new Error('--report-path requires a path');
  args.scenarios.forEach((scenario) => resolveRealE2EScenario(scenario));
  return args;
}

function usage() {
  return [
    'Usage: node tests/verification/e2e/run-real-pipeline-failure-matrix.mjs --mode fast|full [--scenario <id>|--scenarios a,b] [--keep-artifacts] [--report-path <file>]',
    '       Add --continue-on-failure to run every requested scenario and report all failures at the end.',
    '',
    `Default full matrix: ${listFullFailureMatrixScenarioIds().join(', ')}`,
    '',
  ].join('\n');
}

function waitForChild(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

function reusableDiscordDeliveryResult(result) {
  const check = result?.capability_probe?.checks?.find((entry) => entry?.code === 'discord_delivery');
  if (!check) return null;
  return Object.fromEntries(
    Object.entries(check)
      .filter(([key, value]) => !['name', 'code', 'duration_ms'].includes(key) && value !== undefined),
  );
}

export async function runScenario({ mode, scenario, keepArtifacts, discordDeliveryResult = null }) {
  const resultPath = path.join(
    REPO_ROOT,
    '.swarm',
    'real-e2e',
    'results',
    'failure-matrix',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${scenario}.json`,
  );
  const childArgs = [
    RUNNER_PATH,
    '--mode',
    mode,
    '--scenario',
    scenario,
    '--result-path',
    resultPath,
  ];
  if (keepArtifacts) childArgs.push('--keep-artifacts');

  const child = spawn(process.execPath, childArgs, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      REAL_E2E_SCENARIO: scenario,
      ...(discordDeliveryResult
        ? { REAL_E2E_DISCORD_DELIVERY_RESULT_JSON: JSON.stringify(discordDeliveryResult) }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  captureChildOutput(child, { prefixOutput: false });
  const exit = await waitForChild(child);
  let result = null;
  let resultReadFailure = null;
  try {
    result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } catch (error) {
    resultReadFailure = {
      reason: 'REAL_E2E_RESULT_FILE_READ_FAILED',
      path: resultPath,
      error: error?.message || String(error),
    };
  }
  const resultOk = resultReadFailure ? false : result?.ok === true;
  return {
    scenario,
    ok: exit.code === 0 && resultOk,
    exit,
    result_path: resultPath,
    result,
    result_read_failure: resultReadFailure,
  };
}

export async function runFailureMatrix(args, {
  runScenarioImpl = runScenario,
  writeReportImpl = writeFailureMatrixReport,
  onScenarioStarted = null,
  onScenarioCompleted = null,
} = {}) {
  const results = [];
  let discordDeliveryResult = null;
  for (const scenario of args.scenarios) {
    onScenarioStarted?.({ phase: 'failure-scenario-started', mode: args.mode, scenario });
    const result = await runScenarioImpl({
      mode: args.mode,
      scenario,
      keepArtifacts: args.keepArtifacts,
      discordDeliveryResult,
    });
    results.push(result);
    discordDeliveryResult ||= reusableDiscordDeliveryResult(result.result);
    onScenarioCompleted?.({ phase: 'failure-scenario-completed', ...result });
    if (!result.ok && !args.continueOnFailure) break;
  }

  const failures = results.filter((result) => !result.ok);
  const reportPath = (args.continueOnFailure || args.reportPath)
    ? writeReportImpl({ args, results, failures })
    : null;

  return {
    ok: failures.length === 0 && results.length === args.scenarios.length,
    results,
    failures,
    report_path: reportPath,
    completed_count: results.length,
    skipped_count: args.scenarios.length - results.length,
  };
}

function reasonDetail(value) {
  if (value === undefined || value === null || value === '') return 'failed';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function summarizeScenario(result) {
  const structured = result.result || null;
  if (!structured) {
    return {
      phase: null,
      workspace: null,
      artifact_paths: null,
      reasons: [result.result_read_failure?.reason || 'REAL_E2E_RESULT_FILE_MISSING'],
      failure_output_diagnostic: null,
      failure_evidence_failures: [],
      cleanup_failures: [],
      capability_failures: [],
      harness_failures: result.result_read_failure ? [result.result_read_failure] : [],
      pipeline_expectation_failed: false,
      diagnostics: null,
    };
  }
  const pipeline = structured.pipeline || null;
  const capabilities = structured.capability_probe || null;
  const cleanup = structured.cleanup || null;
  const workspace = structured.workspace || null;
  const primaryPhase = pipeline?.phase || structured.phases?.at?.(-1)?.phase || null;
  const failureEvidenceFailures = structured.assertions?.failure_evidence?.failures || [];
  const cleanupVerificationFailures = cleanup?.cleanup_verification?.failed_surfaces?.map((surface) => ({
    step: `cleanup:${surface.surface}`,
    ok: false,
    detail: surface.detail || 'cleanup surface failed verification',
  })) || [];
  const cleanupFailures = cleanupVerificationFailures.length > 0
    ? cleanupVerificationFailures
    : (cleanup?.cleanup?.steps?.filter((step) => step?.ok === false) || []);
  const capabilityFailures = capabilities?.failures || [];
  const harnessFailures = Array.isArray(structured.errors) ? structured.errors : [];
  const pipelineExpectationFailed = structured.assertions?.pipeline_expectation_met === false
    || pipeline?.pipeline_expectation_met === false;
  const reasons = [
    result.result_read_failure?.reason,
    structured.errors?.map?.((entry) => entry?.reason || entry?.error).filter(Boolean),
    pipelineExpectationFailed ? 'REAL_E2E_PIPELINE_EXPECTATION_NOT_MET' : null,
    ...failureEvidenceFailures.map((failure) => failure?.reason || failure?.code),
    ...cleanupFailures.map((step) => `${step.step}: ${reasonDetail(step.detail)}`),
    ...capabilityFailures.map((failure) => failure?.reason || failure?.name || failure?.code),
  ].flat().filter(Boolean);
  return {
    phase: primaryPhase,
    workspace,
    artifact_paths: structured.artifact_paths || null,
    reasons,
    failure_output_diagnostic: structured.assertions?.failure_output_diagnostic || null,
    failure_evidence_failures: failureEvidenceFailures,
    cleanup_failures: cleanupFailures,
    capability_failures: capabilityFailures,
    harness_failures: harnessFailures,
    pipeline_expectation_failed: pipelineExpectationFailed,
    diagnostics: structured.diagnostics || null,
  };
}

function compactFailureDetail(value) {
  if (!value || typeof value !== 'object') return { reason: String(value || 'unknown') };
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, typeof entryValue === 'string' ? entryValue.replace(/\n/g, ' ') : entryValue]),
  );
}

function baseFinding(failure, summary, category, issue) {
  return {
    category,
    scenario: failure.scenario,
    exit: failure.exit || null,
    result_path: failure.result_path || null,
    phase: summary.phase || null,
    artifact_root: summary.workspace?.artifact_root || summary.artifact_paths?.artifact_root || null,
    project_src: summary.artifact_paths?.project_src || null,
    issue,
  };
}

export function collectFailureMatrixFindings(failures) {
  const grouped = {
    infra_blockers: [],
    contract_failures: [],
    cleanup_failures: [],
    harness_failures: [],
  };

  for (const failure of failures) {
    const summary = summarizeScenario(failure);
    for (const issue of summary.capability_failures) {
      grouped.infra_blockers.push(baseFinding(failure, summary, 'infra_blocker', compactFailureDetail(issue)));
    }
    if (summary.pipeline_expectation_failed) {
      grouped.contract_failures.push(baseFinding(failure, summary, 'contract_failure', {
        reason: 'REAL_E2E_PIPELINE_EXPECTATION_NOT_MET',
      }));
    }
    for (const issue of summary.failure_evidence_failures) {
      grouped.contract_failures.push(baseFinding(failure, summary, 'contract_failure', compactFailureDetail(issue)));
    }
    for (const issue of summary.cleanup_failures) {
      grouped.cleanup_failures.push(baseFinding(failure, summary, 'cleanup_failure', compactFailureDetail(issue)));
    }
    for (const issue of summary.harness_failures) {
      grouped.harness_failures.push(baseFinding(failure, summary, 'harness_failure', compactFailureDetail(issue)));
    }
    if (
      !failure.ok
      && grouped.infra_blockers.every((entry) => entry.scenario !== failure.scenario)
      && grouped.contract_failures.every((entry) => entry.scenario !== failure.scenario)
      && grouped.cleanup_failures.every((entry) => entry.scenario !== failure.scenario)
      && grouped.harness_failures.every((entry) => entry.scenario !== failure.scenario)
    ) {
      grouped.harness_failures.push(baseFinding(failure, summary, 'harness_failure', {
        reason: 'REAL_E2E_FAILURE_UNCLASSIFIED',
      }));
    }
  }

  return grouped;
}

function findingTitle(finding) {
  return finding.issue?.reason
    || finding.issue?.code
    || finding.issue?.name
    || finding.issue?.step
    || 'unknown';
}

function renderFindingGroup(lines, title, findings) {
  lines.push(`### ${title}`, '');
  if (findings.length === 0) {
    lines.push('No findings in this group.', '');
    return;
  }
  for (const finding of findings) {
    lines.push(`#### ${finding.scenario}: ${findingTitle(finding)}`, '');
    lines.push(`- Exit: code=${finding.exit?.code ?? 'null'}, signal=${finding.exit?.signal ?? 'null'}`);
    lines.push(`- Result file: \`${finding.result_path || 'missing'}\``);
    lines.push(`- Phase: ${finding.phase || 'unknown'}`);
    if (finding.artifact_root) lines.push(`- Artifact root: \`${finding.artifact_root}\``);
    if (finding.project_src) lines.push(`- Project source: \`${finding.project_src}\``);
    lines.push('', 'Issue:', markdownJson(finding.issue), '');
  }
}

function markdownJson(value) {
  return ['```json', JSON.stringify(value, null, 2), '```'].join('\n');
}

function renderStructuredDiagnostics(lines, failures) {
  const entries = failures
    .map((failure) => {
      const summary = summarizeScenario(failure);
      return {
        scenario: failure.scenario,
        failure_output_diagnostic: summary.failure_output_diagnostic,
        diagnostics: summary.diagnostics,
      };
    })
    .filter((entry) => entry.failure_output_diagnostic || entry.diagnostics);

  if (entries.length === 0) return;

  lines.push('## Structured Diagnostics', '');
  for (const entry of entries) {
    lines.push(`### ${entry.scenario}`, '');
    if (entry.failure_output_diagnostic) {
      lines.push('Failure output diagnostic:', markdownJson(entry.failure_output_diagnostic), '');
    }
    if (entry.diagnostics) {
      lines.push('Bounded diagnostics from result JSON:', markdownJson(entry.diagnostics), '');
    }
  }
}

function defaultReportPath(mode) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(REPO_ROOT, '.swarm', 'real-e2e', 'failure-matrix-reports', `${stamp}-${mode}.md`);
}

export function writeFailureMatrixReport({ args, results, failures }) {
  const reportPath = path.resolve(args.reportPath || defaultReportPath(args.mode));
  const skipped = args.scenarios.slice(results.length);
  const passed = results.filter((result) => result.ok);
  const findings = collectFailureMatrixFindings(failures);
  const lines = [
    '# Real Pipeline E2E Failure Matrix Review',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${args.mode}`,
    `Continue on failure: ${args.continueOnFailure ? 'yes' : 'no'}`,
    `Requested scenarios: ${args.scenarios.length}`,
    `Completed scenarios: ${results.length}`,
    `Passed scenarios: ${passed.length}`,
    `Failed scenarios: ${failures.length}`,
    `Skipped scenarios: ${skipped.length}`,
    '',
  ];

  if (failures.length === 0) {
    lines.push('## Findings', '', 'No scenario failures were encountered.', '');
  } else {
    lines.push('## Findings', '');
    renderFindingGroup(lines, 'Infra Blockers', findings.infra_blockers);
    renderFindingGroup(lines, 'Contract Failures', findings.contract_failures);
    renderFindingGroup(lines, 'Cleanup Failures', findings.cleanup_failures);
    renderFindingGroup(lines, 'Harness Failures', findings.harness_failures);
  }

  renderStructuredDiagnostics(lines, failures);

  if (passed.length > 0) {
    lines.push('## Passed Scenarios', '');
    for (const result of passed) lines.push(`- ${result.scenario}`);
    lines.push('');
  }
  if (skipped.length > 0) {
    lines.push('## Skipped Scenarios', '');
    for (const scenario of skipped) lines.push(`- ${scenario}`);
    lines.push('');
  }

  if (results.length > 0) {
    lines.push('## Canonical Result Files', '');
    lines.push('Use the JSON files below as the machine-readable source of truth for this review.', '');
    for (const result of results) {
      lines.push(`- ${result.scenario}: ${result.ok ? 'passed' : 'failed'} - \`${result.result_path || 'missing'}\``);
    }
    lines.push('');
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }

  const matrix = await runFailureMatrix(args, {
    onScenarioStarted: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
    onScenarioCompleted: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
  });
  const { results, failures } = matrix;
  const publicResults = results.map(({ result, ...entry }) => ({
    ...entry,
    result_ok: result?.ok ?? null,
    result_path: entry.result_path,
  }));
  const publicFailures = failures.map(({ result, ...entry }) => ({
    ...entry,
    result_ok: result?.ok ?? null,
    result_path: entry.result_path,
  }));
  process.stdout.write(`${JSON.stringify({
    ok: matrix.ok,
    mode: args.mode,
    scenario_count: args.scenarios.length,
    completed_count: matrix.completed_count,
    skipped_count: matrix.skipped_count,
    continue_on_failure: args.continueOnFailure,
    report_path: matrix.report_path,
    results: publicResults,
    failures: publicFailures,
  }, null, 2)}\n`);

  return matrix.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
