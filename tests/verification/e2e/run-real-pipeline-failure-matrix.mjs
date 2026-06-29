#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFullFailureMatrixScenarioIds, resolveRealE2EScenario } from './failure-scenarios.mjs';
import { captureChildOutput, childOutputDiagnostics } from './bounded-output-capture.mjs';
import { runCapabilityProbe } from './check-real-e2e-capabilities.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RUNNER_PATH = path.join(SCRIPT_DIR, 'run-real-pipeline-e2e.mjs');
const DEFAULT_SCENARIO_TIMEOUT_MS = 30 * 60 * 1000;
const DISCORD_FAILURE_SCENARIOS = new Set(['discord-unavailable', 'discord-webhook-missing']);

function parseArgs(argv) {
  const args = {
    mode: 'full',
    scenarios: listFullFailureMatrixScenarioIds(),
    keepArtifacts: process.env.REAL_E2E_KEEP_ARTIFACTS === '1',
    continueOnFailure: false,
    reportPath: process.env.REAL_E2E_FAILURE_MATRIX_REPORT || null,
    scenarioTimeoutMs: Number(process.env.REAL_E2E_MATRIX_SCENARIO_TIMEOUT_MS || DEFAULT_SCENARIO_TIMEOUT_MS),
    muteExpectedFailureWebhooks: process.env.REAL_E2E_MUTE_EXPECTED_FAILURE_WEBHOOKS !== '0',
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
    } else if (arg === '--scenario-timeout-ms') {
      args.scenarioTimeoutMs = Number(argv[++index] || '');
    } else if (arg === '--allow-expected-failure-webhooks') {
      args.muteExpectedFailureWebhooks = false;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['fast', 'full'].includes(args.mode)) throw new Error('--mode must be fast or full');
  if (args.scenarios.length === 0) throw new Error('at least one scenario is required');
  if (args.reportPath === '') throw new Error('--report-path requires a path');
  if (!Number.isFinite(args.scenarioTimeoutMs) || args.scenarioTimeoutMs < 0) {
    throw new Error('--scenario-timeout-ms must be a non-negative number');
  }
  args.scenarios.forEach((scenario) => resolveRealE2EScenario(scenario));
  return args;
}

function usage() {
  return [
    'Usage: node tests/verification/e2e/run-real-pipeline-failure-matrix.mjs --mode fast|full [--scenario <id>|--scenarios a,b] [--keep-artifacts] [--report-path <file>] [--scenario-timeout-ms <ms>]',
    '       Add --continue-on-failure to run every requested scenario and report all failures at the end.',
    '       Expected-failure scenario webhooks are muted by default except Discord scenarios; pass --allow-expected-failure-webhooks to send them.',
    '',
    `Default full matrix: ${listFullFailureMatrixScenarioIds().join(', ')}`,
    '',
  ].join('\n');
}

function shouldMuteScenarioWebhooks({ scenarioConfig, muteExpectedFailureWebhooks }) {
  return Boolean(
    muteExpectedFailureWebhooks
      && scenarioConfig?.expectedPipelineExit === 'nonzero'
      && !DISCORD_FAILURE_SCENARIOS.has(scenarioConfig.id),
  );
}

function waitForChild(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

function signalChildTree(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (groupError) {
    if (groupError?.code !== 'ESRCH') {
      try {
        child.kill(signal);
      } catch (childError) {
        if (childError?.code !== 'ESRCH') throw childError;
      }
    }
  }
}

async function waitForChildWithTimeout(child, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { ...(await waitForChild(child)), timed_out: false };
  }
  let timedOut = false;
  let timeout = null;
  const exit = await Promise.race([
    waitForChild(child),
    new Promise((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        signalChildTree(child, 'SIGTERM');
        resolve(null);
      }, timeoutMs);
    }),
  ]);
  clearTimeout(timeout);
  if (exit) return { ...exit, timed_out: false };
  let gracefulTimeout = null;
  const graceful = await Promise.race([
    waitForChild(child),
    new Promise((resolve) => {
      gracefulTimeout = setTimeout(() => resolve(null), 10000);
    }),
  ]);
  clearTimeout(gracefulTimeout);
  if (graceful) return { ...graceful, timed_out: timedOut };
  signalChildTree(child, 'SIGKILL');
  return { ...(await waitForChild(child)), timed_out: timedOut };
}

function reusableDiscordDeliveryResult(result) {
  const check = result?.capability_probe?.checks?.find((entry) => entry?.code === 'discord_delivery');
  if (!check) return null;
  return Object.fromEntries(
    Object.entries(check)
      .filter(([key, value]) => !['name', 'code', 'duration_ms'].includes(key) && value !== undefined),
  );
}

function resultPathForScenario(scenario) {
  return path.join(
    REPO_ROOT,
    '.swarm',
    'real-e2e',
    'results',
    'failure-matrix',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${scenario}.json`,
  );
}

function readStructuredResult(resultPath) {
  return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
}

function writeStructuredResult(resultPath, result) {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}

function timeoutResultRecord({ mode, scenario, resultPath, exit, timeoutMs, diagnostics, existingResult = null }) {
  const now = new Date().toISOString();
  const base = existingResult && typeof existingResult === 'object' && !Array.isArray(existingResult)
    ? existingResult
    : {
        schema_version: 'real_pipeline_e2e_result.v1',
        artifact_type: 'real_pipeline_e2e_result',
        created_at: now,
        mode,
        scenario: { id: scenario },
        phases: [],
      };
  const errors = Array.isArray(base.errors) ? base.errors : [];
  return {
    ...base,
    updated_at: now,
    ok: false,
    exit_code: exit?.code ?? null,
    signal: exit?.signal ?? null,
    diagnostics: {
      ...(base.diagnostics || {}),
      matrix_child: diagnostics,
    },
    errors: [
      ...errors,
      {
        reason: 'REAL_E2E_SCENARIO_TIMEOUT',
        phase: 'failure-matrix-child',
        timeout_ms: timeoutMs,
        exit,
      },
    ],
  };
}

function writeCapabilityFailureScenarioResult({ mode, scenario, capabilityProbe }) {
  const resultPath = resultPathForScenario(scenario);
  const record = {
    schema_version: 'real_pipeline_e2e_result.v1',
    ok: false,
    mode,
    scenario,
    capability_probe: capabilityProbe,
    phases: [
      { phase: 'capabilities', ok: capabilityProbe?.ok === true, completed_at: new Date().toISOString(), reused_from_matrix: true },
    ],
    errors: [],
    exit_code: 1,
  };
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);
  return {
    scenario,
    ok: false,
    exit: { code: 1, signal: null },
    result_path: resultPath,
    result: record,
    result_read_failure: null,
    skipped_child_due_to_matrix_capabilities: true,
  };
}

export async function runScenario({
  mode,
  scenario,
  keepArtifacts,
  capabilityProbe = null,
  discordDeliveryResult = null,
  scenarioTimeoutMs = DEFAULT_SCENARIO_TIMEOUT_MS,
  muteExpectedFailureWebhooks = true,
  runnerPath = RUNNER_PATH,
}) {
  const scenarioConfig = resolveRealE2EScenario(scenario);
  const resultPath = resultPathForScenario(scenario);
  const childArgs = [
    runnerPath,
    '--mode',
    mode,
    '--scenario',
    scenario,
    '--result-path',
    resultPath,
  ];
  if (keepArtifacts) childArgs.push('--keep-artifacts');

  const muteScenarioWebhooks = shouldMuteScenarioWebhooks({ scenarioConfig, muteExpectedFailureWebhooks });
  const child = spawn(process.execPath, childArgs, {
    cwd: REPO_ROOT,
    detached: true,
    env: {
      ...process.env,
      REAL_E2E_SCENARIO: scenario,
      ...(capabilityProbe
        ? { REAL_E2E_CAPABILITY_PROBE_RESULT_JSON: JSON.stringify(capabilityProbe) }
        : {}),
      ...(discordDeliveryResult
        ? { REAL_E2E_DISCORD_DELIVERY_RESULT_JSON: JSON.stringify(discordDeliveryResult) }
        : {}),
      ...(muteScenarioWebhooks
        ? { KUBECLAW_DISABLE_DISCORD_WEBHOOKS: '1' }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const childOutput = captureChildOutput(child, { prefixOutput: false });
  const exit = await waitForChildWithTimeout(child, scenarioTimeoutMs);
  let result = null;
  let resultReadFailure = null;
  try {
    result = readStructuredResult(resultPath);
  } catch (error) {
    resultReadFailure = {
      reason: 'REAL_E2E_RESULT_FILE_READ_FAILED',
      path: resultPath,
      error: error?.message || String(error),
    };
  }
  if (exit.timed_out === true) {
    result = timeoutResultRecord({
      mode,
      scenario,
      resultPath,
      exit,
      timeoutMs: scenarioTimeoutMs,
      diagnostics: childOutputDiagnostics(`failure-matrix:${scenario}`, childOutput),
      existingResult: result,
    });
    writeStructuredResult(resultPath, result);
    resultReadFailure = null;
  }
  const resultOk = resultReadFailure ? false : result?.ok === true;
  return {
    scenario,
    ok: exit.code === 0 && resultOk,
    exit,
    timed_out: exit.timed_out === true,
    result_path: resultPath,
    result,
    result_read_failure: resultReadFailure,
  };
}

export async function runFailureMatrix(args, {
  runScenarioImpl = runScenario,
  runCapabilityProbeImpl = runCapabilityProbe,
  writeReportImpl = writeFailureMatrixReport,
  onScenarioStarted = null,
  onScenarioCompleted = null,
} = {}) {
  const results = [];
  const matrixCapabilityProbe = await runCapabilityProbeImpl({ mode: args.mode });
  let discordDeliveryResult = reusableDiscordDeliveryResult({ capability_probe: matrixCapabilityProbe });

  const scenariosToRun = matrixCapabilityProbe.ok || args.continueOnFailure
    ? args.scenarios
    : args.scenarios.slice(0, 1);

  if (!matrixCapabilityProbe.ok) {
    for (const scenario of scenariosToRun) {
      onScenarioStarted?.({ phase: 'failure-scenario-started', mode: args.mode, scenario, matrix_capabilities_ok: false });
      const result = writeCapabilityFailureScenarioResult({
        mode: args.mode,
        scenario,
        capabilityProbe: matrixCapabilityProbe,
      });
      results.push(result);
      onScenarioCompleted?.({ phase: 'failure-scenario-completed', ...result });
    }
  } else {
    for (const scenario of scenariosToRun) {
      onScenarioStarted?.({ phase: 'failure-scenario-started', mode: args.mode, scenario });
      const result = await runScenarioImpl({
        mode: args.mode,
        scenario,
        keepArtifacts: args.keepArtifacts,
        capabilityProbe: matrixCapabilityProbe,
        discordDeliveryResult,
        scenarioTimeoutMs: args.scenarioTimeoutMs,
        muteExpectedFailureWebhooks: args.muteExpectedFailureWebhooks,
      });
      results.push(result);
      discordDeliveryResult ||= reusableDiscordDeliveryResult(result.result);
      onScenarioCompleted?.({ phase: 'failure-scenario-completed', ...result });
      if (!result.ok && !args.continueOnFailure) break;
    }
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

function stableJson(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function collapseEquivalentFindings(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = [
      finding.category,
      finding.phase || '',
      findingTitle(finding),
      stableJson(finding.issue),
    ].join('\u0000');
    const group = groups.get(key) || {
      ...finding,
      scenarios: [],
      result_paths: [],
      exits: [],
    };
    group.scenarios.push(finding.scenario);
    if (finding.result_path) group.result_paths.push(finding.result_path);
    if (finding.exit) group.exits.push(finding.exit);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function renderLimitedInlineCodeList(values, limit = 12) {
  const unique = [...new Set(values.filter(Boolean))];
  const visible = unique.slice(0, limit).map((value) => `\`${value}\``);
  if (unique.length > limit) visible.push(`and ${unique.length - limit} more`);
  return visible.join(', ') || '`none`';
}

function renderFindingGroup(lines, title, findings) {
  lines.push(`### ${title}`, '');
  if (findings.length === 0) {
    lines.push('No findings in this group.', '');
    return;
  }
  for (const finding of collapseEquivalentFindings(findings)) {
    const scenarioLabel = finding.scenarios.length === 1
      ? finding.scenarios[0]
      : `${finding.scenarios.length} scenarios`;
    lines.push(`#### ${scenarioLabel}: ${findingTitle(finding)}`, '');
    if (finding.scenarios.length > 1) {
      lines.push(`- Affected scenarios (${finding.scenarios.length}): ${renderLimitedInlineCodeList(finding.scenarios)}`);
      lines.push(`- Result files (${finding.result_paths.length}): ${renderLimitedInlineCodeList(finding.result_paths, 5)}`);
    } else {
      lines.push(`- Exit: code=${finding.exit?.code ?? 'null'}, signal=${finding.exit?.signal ?? 'null'}`);
      lines.push(`- Result file: \`${finding.result_path || 'missing'}\``);
    }
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
    scenario_timeout_ms: args.scenarioTimeoutMs,
    report_path: matrix.report_path,
    results: publicResults,
    failures: publicFailures,
  }, null, 2)}\n`);

  return matrix.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(await main());
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2)}\n`);
    process.exit(1);
  }
}
