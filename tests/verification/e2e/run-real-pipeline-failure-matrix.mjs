#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  failureMatrixExecutionBoundary,
  listFailureMatrixSuiteIds,
  listFailureMatrixSuiteScenarioIds,
  resolveFailureMatrixSuite,
  resolveRealE2EScenario,
} from './failure-scenarios.mjs';
import { captureChildOutput, childOutputDiagnostics } from './bounded-output-capture.mjs';
import { runCapabilityProbe } from './check-real-e2e-capabilities.mjs';
import {
  CHECKPOINT_SEED_SCENARIO,
  checkpointBundlePath,
  checkpointPlanForScenario,
  defaultCheckpointRoot,
  validateCheckpointBundle,
} from './checkpoints.mjs';
import { hasRateLimitCooldownEvidence, rateLimitCooldownDetails } from './rate-limit-output.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RUNNER_PATH = path.join(SCRIPT_DIR, 'run-real-pipeline-e2e.mjs');
const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG || '/home/node/.openclaw/openclaw.json';
const DEFAULT_SCENARIO_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_HAPPY_PATH_TIMEOUT_MS = Number(process.env.REAL_E2E_MATRIX_HAPPY_PATH_TIMEOUT_MS || 40 * 60 * 1000);
const DEFAULT_CRASH_RESUME_TIMEOUT_MS = Number(process.env.REAL_E2E_MATRIX_CRASH_RESUME_TIMEOUT_MS || 90 * 60 * 1000);
const DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS = Number(
  process.env.REAL_E2E_MATRIX_RATE_LIMIT_TIMEOUT_EXTENSION_MS || 3 * 60 * 60 * 1000,
);
const DEFAULT_MATRIX_DISCORD_TIMEOUT_MS = Number(process.env.REAL_E2E_MATRIX_DISCORD_TIMEOUT_MS || 10000);
const DEFAULT_GLOBAL_BLOCKER_THRESHOLD = 2;

function parseArgs(argv) {
  const args = {
    mode: 'full',
    suites: listFailureMatrixSuiteIds(),
    keepArtifacts: process.env.REAL_E2E_KEEP_ARTIFACTS === '1',
    continueOnFailure: false,
    reportPath: process.env.REAL_E2E_FAILURE_MATRIX_REPORT || null,
    scenarioTimeoutMs: Number(process.env.REAL_E2E_MATRIX_SCENARIO_TIMEOUT_MS || DEFAULT_SCENARIO_TIMEOUT_MS),
    happyPathTimeoutMs: DEFAULT_HAPPY_PATH_TIMEOUT_MS,
    rateLimitTimeoutExtensionMs: DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS,
    muteExpectedFailureWebhooks: process.env.REAL_E2E_MUTE_EXPECTED_FAILURE_WEBHOOKS !== '0',
    matrixDiscordNotifications: process.env.REAL_E2E_MATRIX_DISCORD_NOTIFICATIONS !== '0',
    globalBlockerThreshold: Number(process.env.REAL_E2E_MATRIX_GLOBAL_BLOCKER_THRESHOLD || DEFAULT_GLOBAL_BLOCKER_THRESHOLD),
    checkpointMode: process.env.REAL_E2E_MATRIX_CHECKPOINT_MODE || 'auto',
    checkpointRoot: process.env.REAL_E2E_MATRIX_CHECKPOINT_ROOT || defaultCheckpointRoot(REPO_ROOT),
    checkpointSeedId: process.env.REAL_E2E_MATRIX_CHECKPOINT_SEED_ID || 'canonical',
    forceRefreshCheckpoints: process.env.REAL_E2E_MATRIX_FORCE_REFRESH_CHECKPOINTS === '1',
    fromScenario: process.env.REAL_E2E_MATRIX_FROM_SCENARIO || null,
    onlyScenario: process.env.REAL_E2E_MATRIX_SCENARIO || null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      args.mode = argv[++index] || '';
    } else if (arg === '--suite') {
      args.suites = [argv[++index] || ''];
    } else if (arg === '--suites') {
      args.suites = String(argv[++index] || '')
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
    } else if (arg === '--happy-path-timeout-ms') {
      args.happyPathTimeoutMs = Number(argv[++index] || '');
    } else if (arg === '--rate-limit-timeout-extension-ms') {
      args.rateLimitTimeoutExtensionMs = Number(argv[++index] || '');
    } else if (arg === '--allow-expected-failure-webhooks') {
      args.muteExpectedFailureWebhooks = false;
    } else if (arg === '--disable-matrix-discord') {
      args.matrixDiscordNotifications = false;
    } else if (arg === '--global-blocker-threshold') {
      args.globalBlockerThreshold = Number(argv[++index] || '');
    } else if (arg === '--disable-global-blocker-skip') {
      args.globalBlockerThreshold = 0;
    } else if (arg === '--checkpoint-mode') {
      args.checkpointMode = argv[++index] || '';
    } else if (arg === '--checkpoint-root') {
      args.checkpointRoot = argv[++index] || '';
    } else if (arg === '--checkpoint-seed-id') {
      args.checkpointSeedId = argv[++index] || '';
    } else if (arg === '--force-refresh-checkpoints') {
      args.forceRefreshCheckpoints = true;
    } else if (arg === '--from-scenario') {
      args.fromScenario = argv[++index] || '';
    } else if (arg === '--scenario') {
      args.onlyScenario = argv[++index] || '';
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['fast', 'full'].includes(args.mode)) throw new Error('--mode must be fast or full');
  if (args.suites.length === 0) throw new Error('at least one suite is required');
  if (args.reportPath === '') throw new Error('--report-path requires a path');
  if (!Number.isFinite(args.scenarioTimeoutMs) || args.scenarioTimeoutMs < 0) {
    throw new Error('--scenario-timeout-ms must be a non-negative number');
  }
  if (!Number.isFinite(args.happyPathTimeoutMs) || args.happyPathTimeoutMs < 0) {
    throw new Error('--happy-path-timeout-ms must be a non-negative number');
  }
  if (!Number.isFinite(args.rateLimitTimeoutExtensionMs) || args.rateLimitTimeoutExtensionMs < 0) {
    throw new Error('--rate-limit-timeout-extension-ms must be a non-negative number');
  }
  if (!Number.isFinite(args.globalBlockerThreshold) || args.globalBlockerThreshold < 0) {
    throw new Error('--global-blocker-threshold must be a non-negative number');
  }
  if (!['full', 'seed', 'reuse', 'auto'].includes(args.checkpointMode)) {
    throw new Error('--checkpoint-mode must be full, seed, reuse, or auto');
  }
  if (args.checkpointRoot === '') throw new Error('--checkpoint-root requires a path');
  if (args.checkpointSeedId === '') throw new Error('--checkpoint-seed-id requires an id');
  if (args.fromScenario === '') throw new Error('--from-scenario requires a scenario id');
  if (args.onlyScenario === '') throw new Error('--scenario requires a scenario id');
  args.checkpointRoot = path.resolve(args.checkpointRoot);
  args.suites.forEach((suite) => resolveFailureMatrixSuite(suite));
  if (args.fromScenario) resolveRealE2EScenario(args.fromScenario);
  if (args.onlyScenario) resolveRealE2EScenario(args.onlyScenario);
  return args;
}

function usage() {
  return [
    'Usage: node tests/verification/e2e/run-real-pipeline-failure-matrix.mjs --mode fast|full [--suite <id>|--suites a,b] [--scenario <id>|--from-scenario <id>] [--keep-artifacts] [--report-path <file>] [--scenario-timeout-ms <ms>] [--happy-path-timeout-ms <ms>] [--rate-limit-timeout-extension-ms <ms>] [--global-blocker-threshold <n>]',
    '       Add --continue-on-failure to run every requested suite and report all failures at the end.',
    '       Expected-failure scenario webhooks are muted by default; pass --allow-expected-failure-webhooks to send them.',
    '       Matrix-level suite start/completion Discord notifications are enabled by default; pass --disable-matrix-discord to suppress them.',
    '       Repeated global pre-behavior blockers skip remaining suites after the threshold; pass --disable-global-blocker-skip to keep running.',
    '       Checkpoint modes: auto (default), seed, reuse, full. Use --checkpoint-root <dir>, --checkpoint-seed-id <id>, and --force-refresh-checkpoints as needed.',
    '',
    `Default suite matrix: ${listFailureMatrixSuiteIds().join(', ')}`,
    '',
  ].join('\n');
}

export function timeoutMsForScenario({
  scenarioConfig,
  scenarioTimeoutMs,
  happyPathTimeoutMs,
  crashResumeTimeoutMs = DEFAULT_CRASH_RESUME_TIMEOUT_MS,
}) {
  if (scenarioConfig?.crashResume === true && Number(crashResumeTimeoutMs) > 0) {
    return Number(crashResumeTimeoutMs);
  }
  if (scenarioConfig?.expectedPipelineExit === 'zero' && Number(happyPathTimeoutMs) > 0) {
    return Number(happyPathTimeoutMs);
  }
  return scenarioTimeoutMs;
}

function shouldMuteScenarioWebhooks({ scenarioConfig, muteExpectedFailureWebhooks }) {
  return Boolean(
    muteExpectedFailureWebhooks
      && scenarioConfig?.expectedPipelineExit === 'nonzero'
      && scenarioConfig?.expectedEvidence !== 'discord_unavailable',
  );
}

function normalizeFailureMatrixArgs(args) {
  return {
    suites: listFailureMatrixSuiteIds(),
    keepArtifacts: false,
    continueOnFailure: false,
    reportPath: null,
    scenarioTimeoutMs: DEFAULT_SCENARIO_TIMEOUT_MS,
    happyPathTimeoutMs: DEFAULT_HAPPY_PATH_TIMEOUT_MS,
    rateLimitTimeoutExtensionMs: DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS,
    muteExpectedFailureWebhooks: true,
    matrixDiscordNotifications: true,
    globalBlockerThreshold: DEFAULT_GLOBAL_BLOCKER_THRESHOLD,
    checkpointMode: 'auto',
    checkpointRoot: defaultCheckpointRoot(REPO_ROOT),
    checkpointSeedId: 'canonical',
    forceRefreshCheckpoints: false,
    fromScenario: null,
    onlyScenario: null,
    ...args,
  };
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

function rateLimitCooldownEvidence(output) {
  return hasRateLimitCooldownEvidence(output);
}

async function waitForChildWithTimeout(child, timeoutMs, {
  childOutput = null,
  rateLimitTimeoutExtensionMs = DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { ...(await waitForChild(child)), timed_out: false };
  }
  let timedOut = false;
  let rateLimitTimeoutExtensions = 0;
  const rateLimitExtensionKeys = new Set();
  let timeout = null;
  const startedAt = Date.now();
  let deadlineAt = startedAt + timeoutMs;
  let exit = null;
  const exitPromise = waitForChild(child);
  while (!exit) {
    const waitMs = Math.max(0, deadlineAt - Date.now());
    exit = await Promise.race([
      exitPromise,
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(null), waitMs);
      }),
    ]);
    clearTimeout(timeout);
    if (exit) {
      return {
        ...exit,
        timed_out: false,
        rate_limit_timeout_extended: rateLimitTimeoutExtensions > 0,
        rate_limit_timeout_extensions: rateLimitTimeoutExtensions,
      };
    }
    // A timeout can win the race before Node drains the child stdout/stderr
    // chunk that announced an authorized cooldown. Let pending pipe callbacks
    // run once before deciding whether this is a real scenario timeout.
    await new Promise((resolve) => setImmediate(resolve));
    const cooldown = rateLimitCooldownDetails(childOutput);
    if (Number(rateLimitTimeoutExtensionMs) > 0 && cooldown) {
      const extensionKey = cooldown.resumeAt || `evidence:${cooldown.evidenceLength}`;
      if (!rateLimitExtensionKeys.has(extensionKey)) {
        rateLimitExtensionKeys.add(extensionKey);
        rateLimitTimeoutExtensions += 1;
        const resumeAtMs = cooldown.resumeAt ? Date.parse(cooldown.resumeAt) : NaN;
        const extendedDeadline = Number.isFinite(resumeAtMs) && resumeAtMs > Date.now()
          ? resumeAtMs + Number(rateLimitTimeoutExtensionMs)
          : Date.now() + Number(rateLimitTimeoutExtensionMs);
        deadlineAt = Math.max(deadlineAt, extendedDeadline);
        continue;
      }
    } else if (Number(rateLimitTimeoutExtensionMs) > 0 && rateLimitCooldownEvidence(childOutput)) {
      const extensionKey = 'rate-limit-evidence';
      if (!rateLimitExtensionKeys.has(extensionKey)) {
        rateLimitExtensionKeys.add(extensionKey);
        rateLimitTimeoutExtensions += 1;
        deadlineAt = Math.max(deadlineAt, Date.now() + Number(rateLimitTimeoutExtensionMs));
        continue;
      }
    }
    timedOut = true;
    signalChildTree(child, 'SIGTERM');
    break;
  }
  let gracefulTimeout = null;
  const graceful = await Promise.race([
    exitPromise,
    new Promise((resolve) => {
      gracefulTimeout = setTimeout(() => resolve(null), 10000);
    }),
  ]);
  clearTimeout(gracefulTimeout);
  if (graceful) {
    return {
      ...graceful,
      timed_out: timedOut,
      rate_limit_timeout_extended: rateLimitTimeoutExtensions > 0,
      rate_limit_timeout_extensions: rateLimitTimeoutExtensions,
    };
  }
  signalChildTree(child, 'SIGKILL');
  return {
    ...(await exitPromise),
    timed_out: timedOut,
    rate_limit_timeout_extended: rateLimitTimeoutExtensions > 0,
    rate_limit_timeout_extensions: rateLimitTimeoutExtensions,
  };
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

function resultPathForSuite(suite) {
  return path.join(
    REPO_ROOT,
    '.swarm',
    'real-e2e',
    'results',
    'failure-matrix',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${suite}.json`,
  );
}

function resultPathForMatrixSummary(mode) {
  return path.join(
    REPO_ROOT,
    '.swarm',
    'real-e2e',
    'results',
    'failure-matrix',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${mode}-summary.json`,
  );
}

function childLogPathsForResult(resultPath) {
  return {
    stdout: `${resultPath}.stdout.log`,
    stderr: `${resultPath}.stderr.log`,
  };
}

function readStructuredResult(resultPath) {
  return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
}

function readJsonFileIfPresent(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeStructuredResult(resultPath, result) {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}

function suiteCasesForArgs(args) {
  return args.suites.flatMap((suiteId) => suiteScenariosForArgs(args, suiteId));
}

function suiteScenariosForArgs(args, suiteId) {
  const scenarios = [...resolveFailureMatrixSuite(suiteId).scenarios];
  if (args.onlyScenario) {
    return scenarios.includes(args.onlyScenario) ? [args.onlyScenario] : [];
  }
  if (!args.fromScenario) return scenarios;
  const start = scenarios.indexOf(args.fromScenario);
  return start === -1 ? [] : scenarios.slice(start);
}

function requestedSuitesForArgs(args) {
  return args.suites.filter((suiteId) => suiteScenariosForArgs(args, suiteId).length > 0);
}

function failedMatrixChildBase({ mode, scenario, exit, diagnostics, existingResult }) {
  const now = new Date().toISOString();
  const base = existingResult && typeof existingResult === 'object' && !Array.isArray(existingResult)
    ? existingResult
    : {
        schema_version: 'real_pipeline_e2e_result.v2',
        artifact_type: 'real_pipeline_e2e_result',
        created_at: now,
        mode,
        scenario: { id: scenario },
        phases: [],
      };
  return {
    base,
    errors: Array.isArray(base.errors) ? base.errors : [],
    common: {
      ...base,
      updated_at: now,
      ok: false,
      exit_code: exit?.code ?? null,
      signal: exit?.signal ?? null,
      diagnostics: { ...(base.diagnostics || {}), matrix_child: diagnostics },
    },
  };
}

function timeoutResultRecord({ mode, scenario, resultPath, exit, timeoutMs, diagnostics, existingResult = null }) {
  const { common, errors } = failedMatrixChildBase({ mode, scenario, exit, diagnostics, existingResult });
  return {
    ...common,
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

function resultHasPipelineRunVerdict(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (result?.pipeline?.phase === 'pipeline-run') return true;
  return Array.isArray(result.phases) && result.phases.some((phase) => phase?.phase === 'pipeline-run');
}

function abortedResultRecord({ mode, scenario, resultPath, exit, diagnostics, existingResult = null }) {
  const { base, common, errors } = failedMatrixChildBase({ mode, scenario, exit, diagnostics, existingResult });
  return {
    ...common,
    pipeline: resultHasPipelineRunVerdict(base) ? base.pipeline : {
      phase: 'harness-aborted',
      ok: false,
      reason: 'REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT',
    },
    assertions: base.assertions || {
      pipeline_expectation_met: false,
      success_evidence: null,
      failure_evidence: null,
      failure_output_diagnostic: {
        diagnostic_only: true,
        matched: false,
        reason: 'REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT',
      },
    },
    errors: [
      ...errors,
      {
        reason: 'REAL_E2E_HARNESS_ABORTED_BEFORE_PIPELINE_RESULT',
        phase: 'failure-matrix-child',
        result_path: resultPath,
        exit,
      },
    ],
  };
}

function writeCapabilityFailureSuiteResult({ mode, suite, capabilityProbe }) {
  const resultPath = resultPathForSuite(suite);
  const suiteConfig = resolveFailureMatrixSuite(suite);
  const record = {
    schema_version: 'real_e2e_failure_matrix_suite_result.v2',
    ok: false,
    mode,
    suite,
    suite_description: suiteConfig.description,
    cases: suiteConfig.scenarios,
    capability_probe: capabilityProbe,
    phases: [
      { phase: 'capabilities', ok: capabilityProbe?.ok === true, completed_at: new Date().toISOString(), reused_from_matrix: true },
    ],
    errors: [],
    exit_code: 1,
  };
  writeStructuredResult(resultPath, record);
  return {
    suite,
    scenario: suite,
    ok: false,
    exit: { code: 1, signal: null },
    result_path: resultPath,
    result: record,
    result_read_failure: null,
    skipped_child_due_to_matrix_capabilities: true,
    cases: [],
  };
}

function writeGlobalBlockerSkippedSuiteResult({ mode, suite, blocker }) {
  const now = new Date().toISOString();
  const resultPath = resultPathForSuite(suite);
  const suiteConfig = resolveFailureMatrixSuite(suite);
  const record = {
    schema_version: 'real_e2e_failure_matrix_suite_result.v2',
    artifact_type: 'real_e2e_failure_matrix_suite_result',
    created_at: now,
    mode,
    ok: false,
    skipped: true,
    skip_reason: 'REAL_E2E_SKIPPED_BY_GLOBAL_BLOCKER',
    suite,
    suite_description: suiteConfig.description,
    cases: suiteConfig.scenarios,
    phases: [
      {
        phase: 'failure-matrix-global-blocker-skip',
        ok: false,
        completed_at: now,
        blocker,
      },
    ],
    errors: [
      {
        reason: 'REAL_E2E_SKIPPED_BY_GLOBAL_BLOCKER',
        phase: 'failure-matrix',
        blocker,
      },
    ],
    exit_code: null,
  };
  writeStructuredResult(resultPath, record);
  return {
    suite,
    scenario: suite,
    ok: false,
    skipped_by_global_blocker: true,
    global_blocker: blocker,
    exit: { code: null, signal: null },
    result_path: resultPath,
    result: record,
    result_read_failure: null,
    cases: [],
  };
}

function scenarioEventBase(args, scenario, index) {
  const scenarioConfig = resolveRealE2EScenario(scenario);
  return {
    mode: args.mode,
    scenario,
    scenario_index: index + 1,
    scenario_count: args.scenarios?.length || 1,
    scenario_description: scenarioConfig.description || null,
    scenario_expected_pipeline_exit: scenarioConfig.expectedPipelineExit || null,
    scenario_expected_evidence: scenarioConfig.expectedEvidence || null,
  };
}

function suiteEventBase(args, suite, index) {
  const suiteConfig = resolveFailureMatrixSuite(suite);
  return {
    mode: args.mode,
    suite,
    scenario: suite,
    suite_index: index + 1,
    suite_count: args.suites.length,
    suite_description: suiteConfig.description || null,
    suite_case_count: suiteConfig.scenarios.length,
    suite_cases: suiteConfig.scenarios,
  };
}

export async function runScenario({
  mode,
  scenario,
  suite = null,
  keepArtifacts,
  capabilityProbe = null,
  discordDeliveryResult = null,
  scenarioTimeoutMs = DEFAULT_SCENARIO_TIMEOUT_MS,
  happyPathTimeoutMs = 0,
  rateLimitTimeoutExtensionMs = DEFAULT_RATE_LIMIT_TIMEOUT_EXTENSION_MS,
  muteExpectedFailureWebhooks = true,
  runnerPath = RUNNER_PATH,
  checkpoint = null,
}) {
  const scenarioConfig = resolveRealE2EScenario(scenario);
  const effectiveTimeoutMs = timeoutMsForScenario({ scenarioConfig, scenarioTimeoutMs, happyPathTimeoutMs });
  const resultPath = resultPathForScenario(scenario);
  const childOutputLogs = childLogPathsForResult(resultPath);
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
  if (checkpoint?.restore_dir && checkpoint?.name) {
    childArgs.push('--restore-checkpoint-dir', checkpoint.restore_dir, '--restore-checkpoint-name', checkpoint.name);
  }
  if (checkpoint?.capture_root) {
    childArgs.push('--capture-checkpoint-root', checkpoint.capture_root);
    if (checkpoint.seed_id) childArgs.push('--capture-checkpoint-seed-id', checkpoint.seed_id);
  }

  const muteScenarioWebhooks = shouldMuteScenarioWebhooks({ scenarioConfig, muteExpectedFailureWebhooks });
  const executionBoundary = failureMatrixExecutionBoundary({ suite, scenario });
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
      ...(suite ? { REAL_E2E_FAILURE_MATRIX_SUITE: suite } : {}),
      ...(executionBoundary ? { REAL_E2E_EXECUTION_BOUNDARY: executionBoundary } : {}),
      ...(executionBoundary && executionBoundary !== 'full'
        ? { REAL_E2E_TERMINAL_EXTRAS: '0' }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const childOutput = captureChildOutput(child, {
    mirrorOutput: false,
    stdoutLogPath: childOutputLogs.stdout,
    stderrLogPath: childOutputLogs.stderr,
  });
  const exit = await waitForChildWithTimeout(child, effectiveTimeoutMs, {
    childOutput,
    rateLimitTimeoutExtensionMs,
  });
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
      timeoutMs: effectiveTimeoutMs,
      diagnostics: childOutputDiagnostics(`failure-matrix:${scenario}`, childOutput),
      existingResult: result,
    });
    writeStructuredResult(resultPath, result);
    resultReadFailure = null;
  } else if (!resultReadFailure && exit.code !== 0 && !resultHasPipelineRunVerdict(result)) {
    result = abortedResultRecord({
      mode,
      scenario,
      resultPath,
      exit,
      diagnostics: childOutputDiagnostics(`failure-matrix:${scenario}`, childOutput),
      existingResult: result,
    });
    writeStructuredResult(resultPath, result);
  }
  const resultOk = resultReadFailure ? false : result?.ok === true;
  return {
    scenario,
    ok: exit.code === 0 && resultOk,
    exit,
    execution_boundary: executionBoundary,
    timed_out: exit.timed_out === true,
    result_path: resultPath,
    result,
    result_read_failure: resultReadFailure,
    child_output_logs: childOutputLogs,
    checkpoint: checkpoint ? { ...checkpoint } : null,
  };
}

function suiteCaseStatus(entry = {}) {
  if (entry.status) return entry.status;
  if (entry.not_run === true) return 'not_run';
  if (entry.timed_out === true) return 'aborted';
  if (entry.result?.pipeline?.phase === 'harness-aborted') return 'aborted';
  return entry.ok === true ? 'passed' : 'failed';
}

function suiteCaseSummary(entry = {}) {
  const status = suiteCaseStatus(entry);
  return {
    scenario: entry.scenario,
    status,
    ok: entry.ok === true,
    result_path: entry.result_path || null,
    exit: entry.exit || null,
    checkpoint: entry.checkpoint || null,
    reason: status === 'passed' ? null : firstScenarioFailureReason(entry),
  };
}

function notRunSuiteCase(scenario, reason = 'not_run') {
  return {
    scenario,
    status: 'not_run',
    ok: false,
    not_run: true,
    reason,
    exit: { code: null, signal: null },
    result_path: null,
    result: {
      ok: false,
      errors: [{ reason }],
    },
    result_read_failure: null,
  };
}

function suiteResultRecord({ mode, suite, cases, requestedScenarios = null }) {
  const suiteConfig = resolveFailureMatrixSuite(suite);
  const requested = new Set(requestedScenarios || suiteConfig.scenarios);
  const byScenario = new Map(cases.map((entry) => [entry.scenario, entry]));
  const allCases = suiteConfig.scenarios.map((scenario) => {
    if (byScenario.has(scenario)) return byScenario.get(scenario);
    return requested.has(scenario)
      ? notRunSuiteCase(scenario)
      : notRunSuiteCase(scenario, 'not_requested');
  });
  const requestedCases = allCases.filter((entry) => requested.has(entry.scenario));
  const failures = requestedCases.filter((entry) => suiteCaseStatus(entry) !== 'passed');
  const completedCases = requestedCases.filter((entry) => suiteCaseStatus(entry) !== 'not_run');
  return {
    schema_version: 'real_e2e_failure_matrix_suite_result.v2',
    artifact_type: 'real_e2e_failure_matrix_suite_result',
    created_at: new Date().toISOString(),
    mode,
    suite,
    suite_description: suiteConfig.description,
    ok: failures.length === 0 && completedCases.length === requestedCases.length,
    case_count: suiteConfig.scenarios.length,
    requested_case_count: requestedCases.length,
    completed_case_count: completedCases.length,
    failed_case_count: failures.length,
    not_run_case_count: requestedCases.length - completedCases.length,
    cases: allCases.map(suiteCaseSummary),
    failures: failures.map((entry) => ({
      scenario: entry.scenario,
      status: suiteCaseStatus(entry),
      result_path: entry.result_path || null,
      exit: entry.exit || null,
      reason: firstScenarioFailureReason(entry),
    })),
  };
}

async function runSuite({
  args,
  suite,
  runScenarioImpl,
  capabilityProbe,
  discordDeliveryResult,
  onCaseStarted = null,
  onCaseCompleted = null,
}) {
  const suiteConfig = resolveFailureMatrixSuite(suite);
  const suiteScenarios = suiteScenariosForArgs(args, suite);
  const cases = [];
  let reusableDiscordDelivery = discordDeliveryResult;
  const resultPath = resultPathForSuite(suite);
  const persistSuiteProgress = () => writeStructuredResult(
    resultPath,
    suiteResultRecord({ mode: args.mode, suite, cases, requestedScenarios: suiteScenarios }),
  );

  for (const [caseIndex, scenario] of suiteScenarios.entries()) {
    await onCaseStarted?.({
      phase: 'failure-suite-case-started',
      mode: args.mode,
      suite,
      scenario,
      case_index: caseIndex + 1,
      case_count: suiteScenarios.length,
      scenario_description: resolveRealE2EScenario(scenario).description || null,
    });
    let result;
    try {
      const checkpointRun = checkpointRunOptionsForScenario(args, scenario, suite);
      result = await runScenarioImpl({
        mode: args.mode,
        suite,
        scenario,
        keepArtifacts: args.keepArtifacts,
        capabilityProbe,
        discordDeliveryResult: reusableDiscordDelivery,
        scenarioTimeoutMs: args.scenarioTimeoutMs,
        happyPathTimeoutMs: args.happyPathTimeoutMs,
        rateLimitTimeoutExtensionMs: args.rateLimitTimeoutExtensionMs,
        muteExpectedFailureWebhooks: args.muteExpectedFailureWebhooks,
        checkpoint: checkpointRun.run,
        checkpointPlan: checkpointRun.plan,
      });
      result.checkpoint ||= checkpointRun.run ? {
        mode: checkpointRun.run.mode,
        started_from_checkpoint: true,
        name: checkpointRun.run.name,
        start_from: checkpointRun.run.start_from,
        restore_dir: checkpointRun.run.restore_dir,
        seed_id: checkpointRun.run.seed_id,
        estimated_skipped_agent_phases: checkpointRun.run.estimated_skipped_agent_phases,
        estimated_skipped_agent_phase_count: checkpointRun.run.estimated_skipped_agent_phase_count,
        agent_phases_to_run: checkpointRun.run.agent_phases_to_run,
        agent_phase_count_to_run: checkpointRun.run.agent_phase_count_to_run,
      } : checkpointRun.plan;
    } catch (error) {
      result = {
        scenario,
        status: 'aborted',
        ok: false,
        exit: { code: null, signal: null },
        result_path: null,
        result: {
          ok: false,
          errors: [{
            reason: 'REAL_E2E_SUITE_CASE_ABORTED',
            error: error?.message || String(error),
          }],
        },
        result_read_failure: null,
      };
    }
    cases.push(result);
    persistSuiteProgress();
    reusableDiscordDelivery ||= reusableDiscordDeliveryResult(result.result);
    await onCaseCompleted?.({
      phase: 'failure-suite-case-completed',
      mode: args.mode,
      suite,
      scenario,
        case_index: caseIndex + 1,
      case_count: suiteScenarios.length,
      status: suiteCaseStatus(result),
      ...result,
    });
    if (!result.ok && !args.continueOnFailure) break;
  }
  const record = suiteResultRecord({ mode: args.mode, suite, cases, requestedScenarios: suiteScenarios });
  writeStructuredResult(resultPath, record);
  const firstFailure = cases.find((entry) => suiteCaseStatus(entry) !== 'passed') || null;
  return {
    suite,
    scenario: suite,
    ok: record.ok,
    exit: firstFailure?.exit || { code: 0, signal: null },
    result_path: resultPath,
    result: record,
    result_read_failure: null,
    cases,
    failed_case: firstFailure?.scenario || null,
    failed_case_result_path: firstFailure?.result_path || null,
    checkpoint: null,
    discord_delivery_result: reusableDiscordDelivery,
  };
}

function checkpointBundleForPlan(args, plan) {
  if (!plan || plan.checkpoint === 'fresh') return null;
  return checkpointBundlePath({
    checkpointRoot: args.checkpointRoot,
    checkpoint: plan.checkpoint,
    seedId: args.checkpointSeedId,
  });
}

function validCheckpointBundleForPlan(args, plan) {
  const checkpointDir = checkpointBundleForPlan(args, plan);
  if (!checkpointDir) return null;
  const validation = validateCheckpointBundle({
    checkpointDir,
    checkpoint: plan.checkpoint,
    scenarioId: plan.scenario,
  });
  return validation.ok ? { checkpointDir, validation } : null;
}

function checkpointRunOptionsForScenario(args, scenario, suite = null) {
  if (suite === 'full-pipeline-smoke') {
    const plan = checkpointPlanForScenario(scenario, { checkpoint: 'fresh' });
    return {
      mode: 'full',
      plan,
      run: null,
    };
  }
  if (args.checkpointMode === 'full' || args.checkpointMode === 'seed') {
    return {
      mode: args.checkpointMode,
      plan: checkpointPlanForScenario(scenario),
      run: null,
    };
  }
  const plan = checkpointPlanForScenario(scenario);
  const valid = validCheckpointBundleForPlan(args, plan);
  if (!valid) {
    throw new Error(`checkpoint '${plan.checkpoint}' for scenario '${scenario}' is missing or invalid at ${checkpointBundleForPlan(args, plan)}`);
  }
  return {
    mode: args.checkpointMode,
    plan,
    run: {
      mode: 'reuse',
      started_from_checkpoint: true,
      name: plan.checkpoint,
      start_from: plan.checkpoint,
      restore_dir: valid.checkpointDir,
      seed_id: args.checkpointSeedId,
      estimated_skipped_agent_phases: plan.estimated_skipped_agent_phases,
      estimated_skipped_agent_phase_count: plan.estimated_skipped_agent_phase_count,
      agent_phases_to_run: plan.agent_phases_to_run,
      agent_phase_count_to_run: plan.agent_phase_count_to_run,
    },
  };
}

async function ensureMatrixCheckpoints(args, { runScenarioImpl, capabilityProbe, discordDeliveryResult }) {
  if (!['seed', 'auto'].includes(args.checkpointMode)) return null;
  const requestedSuites = requestedSuitesForArgs(args);
  if (
    args.checkpointMode === 'auto'
    && requestedSuites.length === 1
    && requestedSuites[0] === 'full-pipeline-smoke'
  ) {
    return {
      skipped: true,
      reason: 'canonical_full_smoke_must_start_fresh',
      seed_id: args.checkpointSeedId,
    };
  }
  const requiredPlans = suiteCasesForArgs(args)
    .map((scenario) => checkpointPlanForScenario(scenario));
  const needsSeed = args.forceRefreshCheckpoints
    || requiredPlans.some((plan) => !validCheckpointBundleForPlan(args, plan));
  if (!needsSeed) return { skipped: true, reason: 'valid_checkpoints_available', seed_id: args.checkpointSeedId };
  return runScenarioImpl({
    mode: args.mode,
    scenario: CHECKPOINT_SEED_SCENARIO,
    keepArtifacts: true,
    capabilityProbe,
    discordDeliveryResult,
    scenarioTimeoutMs: args.scenarioTimeoutMs,
    happyPathTimeoutMs: args.happyPathTimeoutMs,
    rateLimitTimeoutExtensionMs: args.rateLimitTimeoutExtensionMs,
    muteExpectedFailureWebhooks: args.muteExpectedFailureWebhooks,
    checkpoint: {
      mode: 'seed',
      started_from_checkpoint: false,
      capture_root: args.checkpointRoot,
      seed_id: args.checkpointSeedId,
    },
  });
}

export async function runFailureMatrix(args, {
  runScenarioImpl = runScenario,
  runCapabilityProbeImpl = runCapabilityProbe,
  writeReportImpl = writeFailureMatrixReport,
  onScenarioStarted = null,
  onScenarioCompleted = null,
} = {}) {
  args = normalizeFailureMatrixArgs(args);
  const results = [];
  const globalBlockerCounts = new Map();
  let activeGlobalBlocker = null;
  const matrixCapabilityProbe = await runCapabilityProbeImpl({ mode: args.mode });
  let discordDeliveryResult = reusableDiscordDeliveryResult({ capability_probe: matrixCapabilityProbe });
  let checkpointSeedResult = null;

  const requestedSuites = requestedSuitesForArgs(args);
  if (requestedSuites.length === 0) {
    const selector = args.onlyScenario || args.fromScenario || '<none>';
    throw new Error(`no requested suite cases matched scenario selector: ${selector}`);
  }
  const suitesToRun = matrixCapabilityProbe.ok || args.continueOnFailure
    ? requestedSuites
    : requestedSuites.slice(0, 1);

  if (!matrixCapabilityProbe.ok) {
    for (const [index, suite] of suitesToRun.entries()) {
      await onScenarioStarted?.({ phase: 'failure-suite-started', ...suiteEventBase(args, suite, index), matrix_capabilities_ok: false });
      const result = writeCapabilityFailureSuiteResult({
        mode: args.mode,
        suite,
        capabilityProbe: matrixCapabilityProbe,
      });
      results.push(result);
      await onScenarioCompleted?.({ phase: 'failure-suite-completed', ...suiteEventBase(args, suite, index), ...result });
    }
  } else {
    checkpointSeedResult = await ensureMatrixCheckpoints(args, {
      runScenarioImpl,
      capabilityProbe: matrixCapabilityProbe,
      discordDeliveryResult,
    });
    if (checkpointSeedResult?.result) {
      discordDeliveryResult ||= reusableDiscordDeliveryResult(checkpointSeedResult.result);
    }
    if (args.checkpointMode === 'seed') {
      const failures = checkpointSeedResult && checkpointSeedResult.ok === false ? [checkpointSeedResult] : [];
      const reportPath = args.reportPath ? writeReportImpl({ args, results: checkpointSeedResult ? [checkpointSeedResult] : [], failures }) : null;
      const seedResults = checkpointSeedResult ? [checkpointSeedResult] : [];
      return {
        ok: failures.length === 0,
        results: seedResults,
        failures,
        skipped_by_global_blocker: [],
        report_path: reportPath,
        completed_count: checkpointSeedResult ? 1 : 0,
        skipped_count: 0,
        checkpoint_seed: checkpointSeedResult,
        checkpoint_summary: checkpointUsageSummary(seedResults),
      };
    }

    for (const [index, suite] of suitesToRun.entries()) {
      if (args.continueOnFailure && activeGlobalBlocker) {
        const result = writeGlobalBlockerSkippedSuiteResult({
          mode: args.mode,
          suite,
          blocker: activeGlobalBlocker,
        });
        results.push(result);
        await onScenarioStarted?.({
          phase: 'failure-suite-skipped',
          ...suiteEventBase(args, suite, index),
          reason: result.result.skip_reason,
          blocker: activeGlobalBlocker,
        });
        await onScenarioCompleted?.({ phase: 'failure-suite-skipped', ...suiteEventBase(args, suite, index), ...result });
        continue;
      }

      await onScenarioStarted?.({ phase: 'failure-suite-started', ...suiteEventBase(args, suite, index) });
      const result = await runSuite({
        args,
        suite,
        runScenarioImpl,
        capabilityProbe: matrixCapabilityProbe,
        discordDeliveryResult,
        onCaseStarted: onScenarioStarted,
        onCaseCompleted: onScenarioCompleted,
      });
      results.push(result);
      discordDeliveryResult ||= result.discord_delivery_result || reusableDiscordDeliveryResult(result.result);
      await onScenarioCompleted?.({ phase: 'failure-suite-completed', ...suiteEventBase(args, suite, index), ...result });
      if (args.continueOnFailure && args.globalBlockerThreshold > 0) {
        const blocker = classifyGlobalBlocker(result);
        if (blocker) {
          const prior = globalBlockerCounts.get(blocker.code) || { count: 0, scenarios: [] };
          const next = {
            ...blocker,
            threshold: args.globalBlockerThreshold,
            count: prior.count + 1,
            observed_scenarios: [...prior.scenarios, suite],
          };
          globalBlockerCounts.set(blocker.code, {
            count: next.count,
            scenarios: next.observed_scenarios,
          });
          if (next.count >= args.globalBlockerThreshold) {
            activeGlobalBlocker = next;
          }
        }
      }
      if (!result.ok && !args.continueOnFailure) break;
    }
  }

  const failures = results.filter((result) => !result.ok && !isGlobalBlockerSkip(result));
  const skippedByGlobalBlocker = results.filter(isGlobalBlockerSkip);
  const completedResults = results.filter((result) => !isGlobalBlockerSkip(result));
  const checkpointSummary = checkpointUsageSummary(results);
  const reportPath = (args.continueOnFailure || args.reportPath)
    ? writeReportImpl({ args, results, failures })
    : null;

  return {
    ok: failures.length === 0 && skippedByGlobalBlocker.length === 0 && completedResults.length === requestedSuites.length,
    results,
    failures,
    skipped_by_global_blocker: skippedByGlobalBlocker,
    report_path: reportPath,
    completed_count: completedResults.length,
    skipped_count: requestedSuites.length - completedResults.length,
    checkpoint_seed: checkpointSeedResult,
    checkpoint_summary: checkpointSummary,
  };
}

function checkpointUsageSummary(results) {
  const entries = results.flatMap((result) => Array.isArray(result.cases) && result.cases.length > 0 ? result.cases : [result]);
  const reused = entries.filter((result) => result.checkpoint?.mode === 'reuse');
  const seed = entries.filter((result) => result.checkpoint?.mode === 'seed');
  const fullLifecycle = entries.filter((result) => !['reuse', 'seed'].includes(result.checkpoint?.mode));
  const estimatedSkippedAgentPhaseCount = reused
    .reduce((total, result) => total + Number(result.checkpoint?.estimated_skipped_agent_phase_count || 0), 0);
  const agentPhaseCountToRun = entries
    .reduce((total, result) => total + Number(result.checkpoint?.agent_phase_count_to_run || 0), 0);
  return {
    checkpoint_reused_count: reused.length,
    checkpoint_seed_count: seed.length,
    full_lifecycle_count: fullLifecycle.length,
    estimated_skipped_agent_phase_count: estimatedSkippedAgentPhaseCount,
    agent_phase_count_to_run: agentPhaseCountToRun,
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

function architectureFindingsForStructuredResult(structured) {
  const artifactPath = structured?.artifact_paths?.architecture_validator_results
    || structured?.stable_artifacts?.architecture_validator_results
    || null;
  const result = readJsonFileIfPresent(artifactPath);
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  return findings.map((finding) => ({
    id: finding?.id || finding?.code || 'ARCHITECTURE_FINDING',
    severity: finding?.severity || 'info',
    scope: finding?.scope || null,
    explanation: finding?.explanation || finding?.message || null,
    remediation: finding?.remediation || null,
  }));
}

function pipelineExpectationIssueForStructuredResult(structured, pipeline, primaryPhase) {
  const expectedPipelineExit = pipeline?.expected_pipeline_exit
    || structured?.workspace?.real_e2e?.expected_pipeline_exit
    || structured?.real_e2e?.expected_pipeline_exit
    || structured?.scenario?.expected_pipeline_exit
    || null;
  const pipelineExit = pipeline?.pipeline_exit || {
    code: structured?.exit_code ?? null,
    signal: structured?.signal ?? null,
  };
  return {
    reason: 'REAL_E2E_PIPELINE_EXPECTATION_NOT_MET',
    expected_pipeline_exit: expectedPipelineExit,
    pipeline_exit: pipelineExit,
    pipeline_phase: pipeline?.phase || primaryPhase || null,
    pipeline_reason: pipeline?.reason || null,
    pipeline_ok: pipeline?.ok ?? null,
    result_ok: structured?.ok ?? null,
  };
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
      pipeline_expectation_issue: null,
      diagnostics: null,
      architecture_findings: [],
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
  const pipelineExpectationIssue = pipelineExpectationFailed
    ? pipelineExpectationIssueForStructuredResult(structured, pipeline, primaryPhase)
    : null;
  const architectureFindings = architectureFindingsForStructuredResult(structured);
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
    pipeline_expectation_issue: pipelineExpectationIssue,
    diagnostics: structured.diagnostics || null,
    architecture_findings: architectureFindings,
  };
}

function truncateDiscordValue(value, max = 1024) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text || 'n/a';
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function scenarioOrdinal(event = {}) {
  if (Number.isInteger(event.suite_index) && Number.isInteger(event.suite_count)) {
    return `${event.suite_index}/${event.suite_count}`;
  }
  return Number.isInteger(event.scenario_index) && Number.isInteger(event.scenario_count)
    ? `${event.scenario_index}/${event.scenario_count}`
    : String(event.scenario || 'unknown');
}

function expectedBehaviorText(event = {}) {
  if (event.scenario_expected_pipeline_exit === 'nonzero') {
    return 'Pipeline is expected to fail; scenario passes only when the typed failure evidence matches.';
  }
  if (event.scenario_expected_pipeline_exit === 'zero') {
    return 'Pipeline is expected to complete cleanly.';
  }
  return 'Scenario result is judged by the real E2E evidence contract.';
}

function firstScenarioFailureReason(event = {}) {
  if (event.reason) return String(event.reason);
  if (event.global_blocker?.reason) return String(event.global_blocker.reason);
  if (event.result_read_failure?.reason) return String(event.result_read_failure.reason);
  const failedCase = Array.isArray(event.cases) ? event.cases.find((entry) => !entry.ok) : null;
  if (failedCase) return `${failedCase.scenario}: ${firstScenarioFailureReason(failedCase)}`;
  const summary = summarizeScenario(event);
  return summary.reasons[0] || event.exit?.signal || `exit_code=${event.exit?.code ?? 'unknown'}`;
}

function compactCliToken(value) {
  const text = String(value ?? '').trim();
  if (!text) return '-';
  return text.replace(/\s+/g, '_');
}

function scenarioCliStatus(event = {}) {
  if (event.phase === 'failure-scenario-skipped' || event.phase === 'failure-suite-skipped' || event.skipped_by_global_blocker) return 'SKIP';
  return event.ok === true ? 'PASS' : 'FAIL';
}

function scenarioCliReason(event = {}) {
  if (scenarioCliStatus(event) === 'PASS') return 'ok';
  if (event.phase === 'failure-scenario-skipped' || event.phase === 'failure-suite-skipped' || event.skipped_by_global_blocker) {
    return event.reason || event.global_blocker?.code || event.global_blocker?.reason || 'skipped';
  }
  return firstScenarioFailureReason(event);
}

export function formatMatrixSuiteCliLine(event = {}) {
  return [
    scenarioCliStatus(event),
    `suite=${compactCliToken(event.suite || event.scenario || 'unknown')}`,
    `reason=${compactCliToken(scenarioCliReason(event))}`,
    `artifact=${compactCliToken(event.result_path || '-')}`,
  ].join(' ');
}

export function formatMatrixSummaryCliLine(summary = {}) {
  return [
    'SUMMARY',
    `status=${summary.ok ? 'PASS' : 'FAIL'}`,
    `suites=${Number(summary.suite_count || summary.scenario_count || 0)}`,
    `completed=${Number(summary.completed_count || 0)}`,
    `skipped=${Number(summary.skipped_count || 0)}`,
    `failed=${Number(summary.failure_count || 0)}`,
    `artifact=${compactCliToken(summary.summary_path || '-')}`,
    `report=${compactCliToken(summary.report_path || '-')}`,
  ].join(' ');
}

export function buildMatrixSuiteDiscordPresentation(event = {}) {
  const ordinal = scenarioOrdinal(event);
  const suite = event.suite || event.scenario || 'unknown';
  if (event.phase === 'failure-suite-case-started') {
    return {
      level: 'INFO',
      title: `Suite case ${event.case_index}/${event.case_count} started: ${event.scenario}`,
      description: event.scenario_description || `Running ${event.scenario} in ${suite}.`,
      fields: [
        { name: 'Suite', value: suite, inline: true },
        { name: 'Case', value: event.scenario || 'unknown', inline: true },
      ],
    };
  }
  if (event.phase === 'failure-suite-case-completed') {
    const status = event.status || scenarioCliStatus(event).toLowerCase();
    const passed = status === 'passed' || event.ok === true;
    const fields = [
      { name: 'Suite', value: suite, inline: true },
      { name: 'Case', value: event.scenario || 'unknown', inline: true },
      { name: 'Status', value: status, inline: true },
    ];
    if (event.result_path) fields.push({ name: 'Result File', value: event.result_path, inline: false });
    if (!passed) fields.push({ name: 'Reason', value: truncateDiscordValue(firstScenarioFailureReason(event)), inline: false });
    return {
      level: passed ? 'OK' : 'WARN',
      title: `Suite case ${event.case_index}/${event.case_count} ${status}: ${event.scenario}`,
      description: passed
        ? 'Case matched the expected real E2E contract.'
        : 'Case completed, but its real E2E contract did not pass.',
      fields,
    };
  }
  const fields = [
    { name: 'Suite', value: `${ordinal} ${suite}`, inline: false },
    { name: 'Cases', value: String(event.suite_case_count ?? event.cases?.length ?? 'unknown'), inline: true },
  ];
  if (event.suite_cases?.length) {
    fields.push({ name: 'Suite Cases', value: truncateDiscordValue(event.suite_cases.join(', ')), inline: false });
  }
  if (event.result_path) {
    fields.push({ name: 'Result File', value: event.result_path, inline: false });
  }

  if (event.phase === 'failure-suite-started') {
    return {
      level: 'INFO',
      title: `Suite ${ordinal} started: ${suite}`,
      description: event.suite_description || 'Failure matrix suite started.',
      fields,
    };
  }

  if (event.phase === 'failure-suite-skipped' || event.skipped_by_global_blocker) {
    fields.push({ name: 'Reason', value: truncateDiscordValue(event.reason || event.global_blocker?.reason || 'Skipped by matrix policy'), inline: false });
    return {
      level: 'WARN',
      title: `Suite ${ordinal} skipped: ${suite}`,
      description: 'Suite did not run.',
      fields,
    };
  }

  const passed = event.ok === true;
  fields.push({
    name: 'Outcome',
    value: passed ? 'Suite successful: every case matched the expected contract.' : 'Suite failed: at least one case did not match the expected contract.',
    inline: false,
  });
  if (event.failed_case) {
    fields.push({ name: 'Failed Case', value: event.failed_case, inline: true });
  }
  if (!passed) {
    fields.push({ name: 'Error', value: truncateDiscordValue(firstScenarioFailureReason(event)), inline: false });
  }
  if (event.exit) {
    fields.push({ name: 'Child Exit', value: `code=${event.exit.code ?? 'null'} signal=${event.exit.signal ?? 'null'}`, inline: true });
  }

  return {
    level: passed ? 'OK' : 'WARN',
    title: `Suite ${ordinal} ${passed ? 'successful' : 'failed'}: ${suite}`,
    description: passed
      ? 'Suite completed successfully according to the real E2E evidence contracts.'
      : 'Suite completed, but at least one real E2E evidence contract did not pass.',
    fields,
  };
}

function flattenDiagnosticText(value, output = []) {
  if (value === undefined || value === null) return output;
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) flattenDiagnosticText(entry, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value)) flattenDiagnosticText(entry, output);
  }
  return output;
}

function classifyGlobalBlocker(result) {
  if (!result || result.ok || isGlobalBlockerSkip(result)) return null;
  if (Array.isArray(result.cases)) {
    for (const failedCase of result.cases.filter((entry) => !entry.ok)) {
      const blocker = classifyGlobalBlocker(failedCase);
      if (blocker) return blocker;
    }
  }
  const summary = summarizeScenario(result);
  const text = [
    result.scenario,
    summary.phase,
    ...summary.reasons,
    ...flattenDiagnosticText(summary.failure_evidence_failures),
    ...flattenDiagnosticText(summary.harness_failures),
    ...flattenDiagnosticText(summary.diagnostics),
  ].join('\n');

  if (
    text.includes('Architecture validator agent execution failed')
    && text.includes('spawnSession requires explicit opts.spawnPolicy')
  ) {
    return {
      code: 'architecture_validator_spawn_policy_missing',
      component: 'architecture_validator',
      phase: summary.phase || 'arch_validation',
      reason: 'Architecture validator spawned-session path is missing explicit session lifecycle policy.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    text.includes('Architecture validator agent execution failed')
    && text.includes('ACP monitor requires integer gateway.invoke.session_status.max_retries from swarm.config.json')
  ) {
    return {
      code: 'architecture_validator_acp_monitor_retry_policy_mismatch',
      component: 'architecture_validator',
      phase: summary.phase || 'arch_validation',
      reason: 'Architecture validator ACP monitor used stale per-session_status retry config instead of canonical gateway.invoke.retry policy.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    text.includes('Module Forge worker execution failed: module worker requires deps.pollForgeCompletionWithRateLimitRecovery')
    || text.includes('resolveStatusDispatchId is not defined')
  ) {
    return {
      code: 'module_forge_worker_runtime_wiring_missing',
      component: 'module_forge_worker',
      phase: summary.phase || 'forge',
      reason: 'Module Forge worker runtime dependencies are not wired through the canonical module runner dependency authority.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    text.includes('KUBECLAW_LOCAL_REGISTRY is required deployment infrastructure env')
    || text.includes('Error: pinging container registry localhost')
    || text.includes('https://localhost/v2/')
  ) {
    return {
      code: 'k8s_image_authority_unavailable',
      component: 'buster_k8s_image_promotion',
      phase: summary.phase || 'final_buster',
      reason: 'Buster k8s image promotion cannot reach the deployment-owned local registry or source image authority.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    (text.includes('ARCH_VALIDATION_ERROR') || text.includes('VALIDATOR_INTERNAL_ERROR') || text.includes('Architecture validator encountered an internal error'))
    && text.includes('invalid scope')
  ) {
    return {
      code: 'architecture_validator_schema_contract_invalid',
      component: 'architecture_validator',
      phase: summary.phase || 'arch_validation',
      reason: 'Architecture validator produced findings outside the typed schema contract.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    text.includes('Forge spawn failed for review fix')
    && (
      text.includes('Gateway session spawn contract invalid')
      || text.includes('Gateway sessions_spawn failed: 400 Bad Request')
      || text.includes('400 Bad Request')
    )
  ) {
    return {
      code: 'review_fix_spawn_contract_invalid',
      component: 'review_fix_spawn',
      phase: summary.phase || 'module_review',
      reason: 'Review fix Forge spawn request violates the Gateway spawn contract.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    text.includes('k8s-capability-preflight failed')
    && text.includes('returned HTML instead of Kubernetes API data')
  ) {
    return {
      code: 'k8s_infra_unavailable',
      component: 'buster_k8s_suite',
      phase: summary.phase || 'final_buster',
      reason: 'Buster Kubernetes suite cannot reach the Kubernetes API contract.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    text.includes("Agent health check: session in terminal state 'error'")
    || text.includes('session ended without canonical agent.ended evidence')
  ) {
    return {
      code: 'agent_session_lifecycle_unstable',
      component: 'agent_session_lifecycle',
      phase: summary.phase || 'pipeline',
      reason: 'Spawned agent sessions are not reaching the canonical lifecycle contract.',
      first_result_path: result.result_path || null,
    };
  }

  if (
    text.includes('Approval signal adapter failed')
    && (text.includes('watcher_limit_reached') || text.includes('EMFILE') || text.includes('ENOSPC'))
  ) {
    return {
      code: 'approval_signal_watcher_limit_reached',
      component: 'approval_signal_adapter',
      phase: summary.phase || 'approval_wait',
      reason: 'Approval signal watcher resources are exhausted; approval scenarios cannot produce trustworthy wait results.',
      first_result_path: result.result_path || null,
    };
  }

  return null;
}

function isGlobalBlockerSkip(result) {
  return result?.skipped_by_global_blocker === true
    || result?.result?.skip_reason === 'REAL_E2E_SKIPPED_BY_GLOBAL_BLOCKER';
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
    diagnostic_project_src: summary.artifact_paths?.diagnostic_source_paths?.project_src || null,
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

  const failureEntries = failures.flatMap((failure) => {
    const failedCases = Array.isArray(failure.cases) ? failure.cases.filter((entry) => !entry.ok) : [];
    return failedCases.length > 0 ? failedCases : [failure];
  });

  for (const failure of failureEntries) {
    const summary = summarizeScenario(failure);
    for (const issue of summary.capability_failures) {
      grouped.infra_blockers.push(baseFinding(failure, summary, 'infra_blocker', compactFailureDetail(issue)));
    }
    if (summary.pipeline_expectation_failed) {
      grouped.contract_failures.push(baseFinding(
        failure,
        summary,
        'contract_failure',
        summary.pipeline_expectation_issue || { reason: 'REAL_E2E_PIPELINE_EXPECTATION_NOT_MET' },
      ));
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
        phase: summary.phase || null,
        result_ok: failure.result?.ok ?? null,
        pipeline_ok: failure.result?.pipeline?.ok ?? null,
        pipeline_expectation_met: failure.result?.assertions?.pipeline_expectation_met ?? failure.result?.pipeline?.pipeline_expectation_met ?? null,
        result_errors: Array.isArray(failure.result?.errors) ? failure.result.errors : [],
        diagnostic_keys: summary.diagnostics && typeof summary.diagnostics === 'object' ? Object.keys(summary.diagnostics) : [],
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
        architecture_findings: summary.architecture_findings,
      };
    })
    .filter((entry) => entry.failure_output_diagnostic || entry.diagnostics || entry.architecture_findings?.length > 0);

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
    if (entry.architecture_findings?.length > 0) {
      lines.push('Architecture advisories:', markdownJson(entry.architecture_findings), '');
    }
  }
}

function defaultReportPath(mode) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(REPO_ROOT, '.swarm', 'real-e2e', 'failure-matrix-reports', `${stamp}-${mode}.md`);
}

export function writeFailureMatrixReport({ args, results, failures }) {
  const reportPath = path.resolve(args.reportPath || defaultReportPath(args.mode));
  const requestedSuiteCount = args.checkpointMode === 'seed' ? 1 : args.suites.length;
  const resultSuites = new Set(results.map((result) => result.suite || result.scenario));
  const skippedByGlobalBlocker = results.filter(isGlobalBlockerSkip);
  const skipped = args.suites.filter((suite) => !resultSuites.has(suite));
  const skippedCount = skipped.length + skippedByGlobalBlocker.length;
  const completedCount = results.length - skippedByGlobalBlocker.length;
  const passed = results.filter((result) => result.ok);
  const findings = collectFailureMatrixFindings(failures);
  const lines = [
    '# Real Pipeline E2E Failure Matrix Review',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${args.mode}`,
    `Continue on failure: ${args.continueOnFailure ? 'yes' : 'no'}`,
    `Requested suites: ${requestedSuiteCount}`,
    `Registry suites: ${listFailureMatrixSuiteIds().length}`,
    `Registry cases: ${listFailureMatrixSuiteScenarioIds().length}`,
    `Completed suites: ${completedCount}`,
    `Passed suites: ${passed.length}`,
    `Failed suites: ${failures.length}`,
    `Skipped suites: ${skippedCount}`,
    `Checkpoint mode: ${args.checkpointMode || 'full'}`,
    '',
  ];

  const resultEntries = results.flatMap((result) => Array.isArray(result.cases) && result.cases.length > 0 ? result.cases : [result]);
  const checkpointed = resultEntries.filter((result) => result.checkpoint?.mode === 'reuse');
  const summary = checkpointUsageSummary(results);
  lines.push('## Checkpoint Usage', '');
  lines.push(`- Reused checkpoints: ${summary.checkpoint_reused_count}`);
  lines.push(`- Seed children: ${summary.checkpoint_seed_count}`);
  lines.push(`- Full lifecycle children: ${summary.full_lifecycle_count}`);
  lines.push(`- Estimated skipped agent phases: ${summary.estimated_skipped_agent_phase_count}`);
  lines.push(`- Agent phases still scheduled: ${summary.agent_phase_count_to_run}`);
  if (checkpointed.length > 0) {
    for (const result of checkpointed) {
      lines.push(`- ${result.suite || result.scenario}: ${result.checkpoint.name} from \`${result.checkpoint.restore_dir}\` (${result.checkpoint.estimated_skipped_agent_phase_count || 0} phase(s) skipped)`);
    }
  }
  lines.push('');

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
    lines.push('## Passed Suites', '');
    for (const result of passed) lines.push(`- ${result.suite || result.scenario}`);
    lines.push('');
  }
  if (skippedByGlobalBlocker.length > 0) {
    lines.push('## Skipped By Global Blocker', '');
    for (const result of skippedByGlobalBlocker) {
      lines.push(`- ${result.suite || result.scenario}: ${result.global_blocker?.code || 'global_blocker'} - ${result.global_blocker?.reason || 'skipped after repeated global blocker'}`);
    }
    lines.push('', 'Global blocker details:', markdownJson(skippedByGlobalBlocker[0].global_blocker || {}), '');
  }
  if (skipped.length > 0) {
    lines.push('## Skipped Suites', '');
    for (const suite of skipped) lines.push(`- ${suite}`);
    lines.push('');
  }

  if (results.length > 0) {
    lines.push('## Canonical Result Files', '');
    lines.push('Use the JSON files below as the machine-readable source of truth for this review.', '');
    for (const result of results) {
      const status = isGlobalBlockerSkip(result) ? 'skipped_by_global_blocker' : (result.ok ? 'passed' : 'failed');
      lines.push(`- ${result.suite || result.scenario}: ${status} - \`${result.result_path || 'missing'}\``);
      if (Array.isArray(result.cases) && result.cases.length > 0) {
        for (const caseResult of result.cases) {
          const status = caseResult.status || (caseResult.ok ? 'passed' : 'failed');
          lines.push(`  - ${caseResult.scenario}: ${status} - \`${caseResult.result_path || 'missing'}\``);
        }
      }
      if (result.child_output_logs?.stdout || result.child_output_logs?.stderr) {
        lines.push(`  - Child logs: stdout=\`${result.child_output_logs.stdout || 'missing'}\`, stderr=\`${result.child_output_logs.stderr || 'missing'}\``);
      }
    }
    lines.push('');
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  return reportPath;
}

function readOpenClawConfig() {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
}

function resolveMatrixDiscordWebhook(openclawConfig) {
  return process.env.REAL_E2E_MATRIX_DISCORD_WEBHOOK
    || process.env.REAL_E2E_DISCORD_WEBHOOK
    || process.env.DISCORD_WEBHOOK
    || openclawConfig?.verification?.real_e2e?.matrix_discord_webhook_url
    || openclawConfig?.verification?.real_e2e?.discord_webhook_url
    || openclawConfig?.discord_webhook_url
    || null;
}

function withDiscordWebhookWait(url) {
  if (!url || typeof url !== 'string') return url || '';
  const parsed = new URL(url);
  parsed.searchParams.set('wait', 'true');
  return parsed.toString();
}

function envFlag(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function readJsonlObjects(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function matrixDiscordReceiptPaths(config) {
  return [
    path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'discord-deliveries.jsonl'),
    path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'discord-deliveries.jsonl'),
  ];
}

function collectMatrixDiscordReceipts(config) {
  return matrixDiscordReceiptPaths(config).flatMap((filePath) => readJsonlObjects(filePath));
}

export function hasMatrixDiscordReceipt(receipts, runId, event) {
  const correlationId = event.phase?.startsWith?.('failure-suite-case-')
    ? `${event.suite || 'unknown'}:${event.scenario || 'unknown'}`
    : (event.suite || event.scenario);
  return receipts.some((receipt) => receipt?.run_id === runId
    && receipt.ok === true
    && receipt.message_id
    && receipt.channel_id
    && receipt.webhook_message_returned === true
    && receipt.correlation?.gate_id === correlationId
    && receipt.correlation?.gate_type === 'real-e2e-suite');
}

export async function createMatrixSuiteNotifier(args) {
  if (args.matrixDiscordNotifications === false) {
    return { mode: 'muted', reason: 'disabled_by_cli', notify: async () => ({ status: 'muted', reason: 'disabled_by_cli' }) };
  }
  if (envFlag(process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS)) {
    return { mode: 'muted', reason: 'disabled_by_environment', notify: async () => ({ status: 'muted', reason: 'disabled_by_environment' }) };
  }
  const openclawConfig = readOpenClawConfig();
  const webhook = resolveMatrixDiscordWebhook(openclawConfig);
  if (!webhook) {
    return { mode: 'muted', reason: 'webhook_missing', notify: async () => ({ status: 'muted', reason: 'webhook_missing' }) };
  }

  const runId = `real-e2e-matrix-${Date.now()}-${process.pid}`;
  const config = {
    project: 'real-e2e-failure-matrix',
    repo_root: REPO_ROOT,
    paths: {
      swarm_dir: path.join(REPO_ROOT, '.swarm', 'real-e2e', 'matrix-notifications'),
    },
    _runId: runId,
    run_id: runId,
    discord_webhook_url: withDiscordWebhookWait(webhook),
    discord: {
      webhook_timeout_ms: DEFAULT_MATRIX_DISCORD_TIMEOUT_MS,
    },
    discord_alerts: {
      info: true,
      warn: true,
      critical: true,
      ok: true,
    },
  };

  return {
    mode: 'live',
    reason: null,
    runId,
    notify: async (event) => {
      const before = collectMatrixDiscordReceipts(config).length;
      const presentation = buildMatrixSuiteDiscordPresentation(event);
      const correlation = {
        run_id: runId,
        gate_id: event.phase?.startsWith?.('failure-suite-case-')
          ? `${event.suite || 'unknown'}:${event.scenario || 'unknown'}`
          : (event.suite || event.scenario || null),
        gate_type: 'real-e2e-suite',
      };
      const colors = { INFO: 5_763_719, OK: 5_766_719, WARN: 16_696_832, CRITICAL: 15_558_174 };
      const response = await fetch(config.discord_webhook_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'KubeClaw E2E',
          embeds: [{
            title: presentation.title,
            description: presentation.description,
            color: colors[presentation.level] ?? colors.INFO,
            fields: presentation.fields,
            footer: { text: `${config.project} · ${runId}` },
          }],
        }),
        signal: AbortSignal.timeout(config.discord.webhook_timeout_ms),
      });
      const delivered = response.ok ? await response.json() : null;
      if (!delivered?.id || !delivered?.channel_id) {
        throw new Error(`Matrix Discord delivery failed with status ${response.status}`);
      }
      const receiptPath = matrixDiscordReceiptPaths(config)[0];
      fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
      fs.appendFileSync(receiptPath, `${JSON.stringify({
        schema_version: 'discord_delivery_receipt.v2',
        run_id: runId,
        ok: true,
        message_id: delivered.id,
        channel_id: delivered.channel_id,
        webhook_message_returned: true,
        correlation,
        delivered_at: new Date().toISOString(),
      })}\n`);
      const receipts = collectMatrixDiscordReceipts(config).slice(before);
      if (!hasMatrixDiscordReceipt(receipts, runId, event)) {
        throw new Error(`Matrix Discord delivery receipt missing for suite '${event.suite || event.scenario || 'unknown'}'`);
      }
      return {
        status: 'delivered',
        run_id: runId,
        receipt_count: receipts.length,
      };
    },
  };
}

function publicMatrixResultEntry({ result, ...entry }) {
  return {
    ...entry,
    result_ok: result?.ok ?? null,
    result_path: entry.result_path,
  };
}

export function matrixSummaryRecord({ args, matrix, matrixSuiteNotifier, summaryPath }) {
  return {
    schema_version: 'real_e2e_failure_matrix_summary.v2',
    ok: matrix.ok,
    status: matrix.ok ? 'PASS' : 'FAIL',
    mode: args.mode,
    suite_count: args.suites.length,
    scenario_count: args.suites.length,
    case_count: listFailureMatrixSuiteScenarioIds().length,
    completed_count: matrix.completed_count,
    completed: matrix.completed_count,
    skipped_count: matrix.skipped_count,
    skipped: matrix.skipped_count,
    failure_count: matrix.failures.length,
    failed: matrix.failures.length,
    skipped_by_global_blocker_count: matrix.skipped_by_global_blocker.length,
    continue_on_failure: args.continueOnFailure,
    scenario_timeout_ms: args.scenarioTimeoutMs,
    happy_path_timeout_ms: args.happyPathTimeoutMs,
    rate_limit_timeout_extension_ms: args.rateLimitTimeoutExtensionMs,
    global_blocker_threshold: args.globalBlockerThreshold,
    matrix_discord_delivery: {
      mode: matrixSuiteNotifier.mode,
      reason: matrixSuiteNotifier.reason,
      run_id: matrixSuiteNotifier.runId || null,
    },
    report_path: matrix.report_path,
    summary_path: summaryPath,
    results: matrix.results.map(publicMatrixResultEntry),
    failures: matrix.failures.map(publicMatrixResultEntry),
  };
}

function writeMatrixSummaryRecord(record) {
  fs.mkdirSync(path.dirname(record.summary_path), { recursive: true });
  fs.writeFileSync(record.summary_path, `${JSON.stringify(record, null, 2)}\n`);
  return record.summary_path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }

  const matrixSuiteNotifier = await createMatrixSuiteNotifier(args);
  const matrix = await runFailureMatrix(args, {
    onScenarioStarted: async (event) => {
      await matrixSuiteNotifier.notify(event);
    },
    onScenarioCompleted: async (event) => {
      await matrixSuiteNotifier.notify(event);
      process.stdout.write(`${formatMatrixSuiteCliLine(event)}\n`);
    },
  });
  const summaryPath = resultPathForMatrixSummary(args.mode);
  const summary = matrixSummaryRecord({ args, matrix, matrixSuiteNotifier, summaryPath });
  writeMatrixSummaryRecord(summary);
  process.stdout.write(`${formatMatrixSummaryCliLine(summary)}\n`);

  return matrix.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(await main());
  } catch (error) {
    process.stderr.write(`ERROR reason=${compactCliToken(error?.message || String(error))} artifact=-\n`);
    process.exit(1);
  }
}
