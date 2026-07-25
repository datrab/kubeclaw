import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: unit — Unit Test Runner
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: bounded unit defaults, explicit custom commands, unknown
// runner output mapping, generic failure findings, and no-threshold
// evidence-only PASS mode are intentional typed policies.
// DELETE_LEGACY: requested unit suites fail when package.json, test script, or
// real non-default tests are missing instead of returning SKIP.

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { REPO_DIR, resolveRepoScopedPath } from './repo-paths.ts';
import { buildSubprocessEnv, tokenizeCommandString, validateAllowedPath } from '../security.ts';
import { createSuiteLog } from './support.ts';
import { extractFailures, firstOutputLine, parseOutput } from './unit-output.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface UnitContext {
  logSink?: LogSink | null;
  suiteAbortSignal?: AbortSignal;
  suiteDeadlineMs?: number;
  config?: {
    serve?: AnyRecord;
    unit?: AnyRecord;
  };
}

interface TestScriptCheck {
  hasTests: boolean;
  script: string | null;
  reason: string | null;
}


interface NormalizedUnitConfig {
  projectDir: string;
  testCmd: string;
  commandArgv: string[];
  customCmd: boolean;
  timeoutMs: number;
  maxFindings: number;
  thresholds: AnyRecord | null;
}

interface UnitRun {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const DEFAULTS = {
  project_dir: REPO_DIR,
  test_cmd: 'npm test',
  timeout_ms: 60000,
  max_findings: 30,
};

const execFileAsync = promisify(execFile) as any;

const NPM_NO_TEST_STUB = 'echo "Error: no test specified" && exit 1';

const unitSuiteState: { logSink: LogSink | null } = { logSink: null };
const log = createSuiteLog('unit', 'UNIT', (entry) => unitSuiteState.logSink?.(entry));

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === undefined) return 'error_detail_missing';
  if (error === null) return 'error_detail_null';
  return String(error);
}

function subprocessExitCode(error: any): number {
  if (Number.isInteger(error?.status)) return error.status;
  if (Number.isInteger(error?.code)) return error.code;
  return 1;
}

function timeoutWithinSuite(timeoutMs: number, context: UnitContext): number {
  if (typeof context.suiteDeadlineMs !== 'number') return timeoutMs;
  return Math.max(1, Math.min(timeoutMs, context.suiteDeadlineMs - Date.now()));
}

function evidenceMode(enforced: boolean): 'enforced' | 'evidence-only' {
  return enforced ? 'enforced' : 'evidence-only';
}

function normalizeUnitConfig(context: UnitContext): NormalizedUnitConfig {
  const serve: AnyRecord = context.config?.serve === undefined ? {} : context.config.serve;
  const unitConf: AnyRecord = context.config?.unit === undefined ? {} : context.config.unit;
  const rawTestCmd = unitConf.test_cmd === undefined ? DEFAULTS.test_cmd : unitConf.test_cmd;
  const commandArgv = tokenizeCommandString(rawTestCmd, 'unit.test_cmd');
  const testCmd = commandArgv.join(' ');
  const projectDirInput = typeof serve.project_dir === 'string' && serve.project_dir.trim()
    ? serve.project_dir
    : DEFAULTS.project_dir;
  const timeoutInput = Number.isFinite(unitConf.timeout_ms) ? Number(unitConf.timeout_ms) : DEFAULTS.timeout_ms;
  const timeoutMs = timeoutWithinSuite(timeoutInput, context);
  const thresholds = unitConf.thresholds && typeof unitConf.thresholds === 'object'
    ? unitConf.thresholds
    : null;
  if (thresholds !== null && !Number.isFinite(thresholds.max_failures)) {
    throw new Error('unit.thresholds.max_failures must be configured when thresholds are enabled');
  }
  return {
    projectDir: validateAllowedPath(resolveRepoScopedPath(projectDirInput, { field: 'unit.project_dir' }), 'unit.project_dir'),
    testCmd,
    commandArgv,
    customCmd: unitConf.test_cmd !== undefined,
    timeoutMs,
    maxFindings: DEFAULTS.max_findings,
    thresholds,
  };
}

function checkTestScript(projectDir: string): TestScriptCheck {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { hasTests: false, script: null, reason: 'No package.json found' };

  let pkg: AnyRecord;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (error) {
    return { hasTests: false, script: null, reason: `Cannot parse package.json: ${errorMessage(error)}` };
  }

  const testScript = pkg.scripts?.test;
  if (!testScript) return { hasTests: false, script: null, reason: 'No "test" script in package.json' };
  if (String(testScript).trim() === NPM_NO_TEST_STUB) return { hasTests: false, script: testScript, reason: 'Test script is npm default stub (no tests defined)' };
  return { hasTests: true, script: String(testScript), reason: null };
}

function missingTestsFailure(startTime: number, reason: string, metadata: AnyRecord): SuiteVerdict {
  const message = reason;
  log(`No tests found — FAIL (${message})`);
  return createSuiteVerdict('unit', STATUS.FAIL, {
    critical: true,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    reason: message,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'unit-tests-required' })],
    metadata,
  });
}

function resolveTestScript(config: NormalizedUnitConfig, startTime: number, mode: string): string | SuiteVerdict | null {
  if (config.customCmd) {
    log(`Custom test_cmd set, skipping package.json check as explicit runner policy (mode: ${mode})`);
    return config.commandArgv.join(' ');
  }
  log(`Checking for test script in ${config.projectDir} (mode: ${mode})`);
  const check = checkTestScript(config.projectDir);
  if (check.hasTests) return check.script;
  if (check.reason === null) throw new Error('unit test discovery failed without reason');
  return missingTestsFailure(startTime, check.reason, { project_dir: config.projectDir, test_script: check.script });
}

async function runUnitCommand(context: UnitContext, config: NormalizedUnitConfig): Promise<UnitRun> {
  try {
    const result = await execFileAsync(config.commandArgv[0], config.commandArgv.slice(1), {
      encoding: 'utf8', timeout: config.timeoutMs, cwd: config.projectDir,
      env: buildSubprocessEnv({ CI: 'true', NODE_ENV: 'test' }),
      stdio: ['pipe', 'pipe', 'pipe'], signal: context.suiteAbortSignal,
    });
    return {
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      exitCode: 0,
      timedOut: false,
    };
  } catch (error: any) {
    return {
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : '',
      exitCode: subprocessExitCode(error),
      timedOut: Boolean(error?.killed || error?.name === 'AbortError'),
    };
  }
}

function unitFindings(output: string, failed: number, maxFindings: number): Finding[] {
  if (failed <= 0) return [];
  const details = extractFailures(output);
  if (details.length > 0) {
    return details.slice(0, maxFindings)
      .map((failure) => createFinding(SEVERITY.SERIOUS, `${failure.test}: ${failure.message}`, { rule: 'unit-test' }));
  }
  const outputLine = firstOutputLine(output);
  const message = outputLine
    ? `${failed} unit test(s) failed — ${outputLine}`
    : `${failed} unit test(s) failed — check test output for details`;
  return [createFinding(SEVERITY.SERIOUS, message, { rule: 'unit-test' })];
}

function completedUnitVerdict(startTime: number, config: NormalizedUnitConfig, script: string | null, run: UnitRun): SuiteVerdict {
  const output = `${run.stdout}\n${run.stderr}`;
  const parsed = parseOutput(output, run.exitCode);
  const enforced = config.thresholds !== null;
  const mode = evidenceMode(enforced);
  const failedByThreshold = config.thresholds ? parsed.failed > config.thresholds.max_failures : false;
  const failed = [run.exitCode !== 0, failedByThreshold, parsed.total <= 0].some(Boolean);
  const status: SuiteStatus = failed ? STATUS.FAIL : STATUS.PASS;
  const durationMs = Date.now() - startTime;
  log(`Framework: ${parsed.framework} — ${parsed.passed} passed, ${parsed.failed} failed, ${parsed.skipped} skipped (exit: ${run.exitCode})`);
  log(`${status === STATUS.PASS ? '✅' : '⚠️'} ${mode}: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed (${durationMs}ms)`);
  return createSuiteVerdict('unit', status, {
    critical: status === STATUS.FAIL,
    duration_ms: durationMs,
    checks_total: parsed.total,
    checks_passed: parsed.passed,
    checks_failed: parsed.failed,
    findings: unitFindings(output, parsed.failed, config.maxFindings),
    metadata: {
      project_dir: config.projectDir, test_cmd: config.testCmd, test_script: script,
      framework: parsed.framework, exit_code: run.exitCode, mode, skipped: parsed.skipped,
      ...(enforced ? { thresholds: config.thresholds } : {}),
    },
  });
}

export default async function unitSuite(context: UnitContext): Promise<SuiteVerdict> {
  unitSuiteState.logSink = typeof context.logSink === 'function' ? context.logSink : null;
  const startTime = Date.now();
  const normalized = normalizeUnitConfig(context);
  const enforced = normalized.thresholds !== null;
  const mode = evidenceMode(enforced);
  const script = resolveTestScript(normalized, startTime, mode);
  if (script && typeof script !== 'string') return script;
  log(`Running: ${normalized.testCmd} (script: "${script}", timeout: ${normalized.timeoutMs}ms)`);
  const run = await runUnitCommand(context, normalized);
  if (run.timedOut) {
    log(`ERROR: Timeout after ${normalized.timeoutMs}ms`);
    return createSuiteVerdict('unit', STATUS.ERROR, {
      critical: false,
      duration_ms: Date.now() - startTime,
      error: `Test execution timed out after ${normalized.timeoutMs}ms`,
      findings: [createFinding(SEVERITY.SERIOUS, `${normalized.testCmd} timed out after ${normalized.timeoutMs}ms`, { rule: 'timeout' })],
    });
  }
  return completedUnitVerdict(startTime, normalized, script, run);
}
