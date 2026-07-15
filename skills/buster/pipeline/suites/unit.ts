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

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
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

interface ParsedTestOutput {
  framework: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface FailureDetail {
  test: string;
  message: string;
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

const DEFAULTS = {
  project_dir: REPO_DIR,
  test_cmd: 'npm test',
  timeout_ms: 60000,
  max_findings: 30,
};

const execFileAsync = promisify(execFile) as any;

const NPM_NO_TEST_STUB = 'echo "Error: no test specified" && exit 1';

let _logSink: LogSink | null = null;
function log(msg: string): void {
  console.log(`[SUITE] [UNIT] ${msg}`);
  if (_logSink) _logSink({ suite: 'unit', msg });
}

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

function optionalCount(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseInt(value, 10);
}

function requiredCount(value: string | undefined, field: string): number {
  if (value === undefined) throw new Error(`${field} count missing from test output`);
  return Number.parseInt(value, 10);
}

function normalizeUnitConfig(context: UnitContext): NormalizedUnitConfig {
  const serve = selectDefinedValue(() => (context.config?.serve), () => ({}));
  const unitConf = selectDefinedValue(() => (context.config?.unit), () => ({}));
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

function parseJest(output: string): ParsedTestOutput | null {
  const match = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/);
  if (!match) return null;
  return { framework: 'jest', failed: optionalCount(match[1]), skipped: optionalCount(match[2]), passed: optionalCount(match[3]), total: requiredCount(match[4], 'jest total') };
}

function parseVitest(output: string): ParsedTestOutput | null {
  const match = output.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+skipped\s*\|\s*)?(\d+)\s+passed\s+\((\d+)\)/);
  if (!match) return null;
  return { framework: 'vitest', failed: optionalCount(match[1]), skipped: optionalCount(match[2]), passed: requiredCount(match[3], 'vitest passed'), total: requiredCount(match[4], 'vitest total') };
}

function parseMocha(output: string): ParsedTestOutput | null {
  const passingMatch = output.match(/(\d+)\s+passing/);
  const failingMatch = output.match(/(\d+)\s+failing/);
  const pendingMatch = output.match(/(\d+)\s+pending/);
  if (!passingMatch && !failingMatch) return null;
  const passed = optionalCount(passingMatch?.[1]);
  const failed = optionalCount(failingMatch?.[1]);
  const skipped = optionalCount(pendingMatch?.[1]);
  return { framework: 'mocha', passed, failed, skipped, total: passed + failed + skipped };
}

function parseTap(output: string): ParsedTestOutput | null {
  const testsMatch = output.match(/#\s*tests\s+(\d+)/);
  const passMatch = output.match(/#\s*pass\s+(\d+)/);
  const failMatch = output.match(/#\s*fail\s+(\d+)/);
  if (!testsMatch) return null;
  return { framework: 'tap', total: requiredCount(testsMatch[1], 'tap total'), passed: optionalCount(passMatch?.[1]), failed: optionalCount(failMatch?.[1]), skipped: 0 };
}

function parsePytest(output: string): ParsedTestOutput | null {
  const match = output.match(/=+\s+(.*?)\s+in\s+[\d.]+s\s*=+/);
  if (!match?.[1]) return null;
  const summary = match[1];
  if (!/\b(passed|failed|error|skipped|warning)\b/.test(summary)) return null;
  const passed = optionalCount(summary.match(/(\d+)\s+passed/)?.[1]);
  const failed = optionalCount(summary.match(/(\d+)\s+failed/)?.[1]);
  const skipped = optionalCount(summary.match(/(\d+)\s+skipped/)?.[1]);
  const errors = optionalCount(summary.match(/(\d+)\s+error/)?.[1]);
  return { framework: 'pytest', passed, failed: failed + errors, skipped, total: passed + failed + errors + skipped };
}

function parseFixtureJson(output: string): ParsedTestOutput | null {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith('{')) continue;
    try {
      const data = JSON.parse(line);
      if (data?.ok !== true || !Array.isArray(data.checked)) continue;
      return {
        framework: 'fixture_json',
        total: data.checked.length,
        passed: data.checked.length,
        failed: 0,
        skipped: 0,
      };
    } catch (_error) {
      continue;
    }
  }
  return null;
}

function parseOutput(output: string, exitCode: number): ParsedTestOutput {
  const parsers = [parseFixtureJson, parseJest, parseVitest, parseMocha, parseTap, parsePytest];
  for (const parser of parsers) {
    const result = parser(output);
    if (result) return result;
  }
  if (exitCode === 0) return { framework: 'unparsed_test_output', total: 1, passed: 1, failed: 0, skipped: 0 };
  return { framework: 'unparsed_test_output', total: 1, passed: 0, failed: 1, skipped: 0 };
}

function extractFailures(output: string): FailureDetail[] {
  const failures: FailureDetail[] = [];

  const jestBlocks = output.split(/\n\s*●\s+/);
  for (let i = 1; i < jestBlocks.length && failures.length < 10; i++) {
    const block = jestBlocks[i];
    if (block === undefined) continue;
    const lines = block.split('\n');
    const testName = lines[0]?.trim() ? lines[0].trim() : 'test_name_missing';
    const msgLine = lines.slice(1).find((line: string) => line.trim() && !line.trim().startsWith('at '));
    failures.push({ test: testName, message: selectDefinedValue(() => (msgLine?.trim().slice(0, 300)), () => ('unit_test_failed_without_message')) });
  }

  if (failures.length === 0) {
    const mochaBlocks = output.split(/\n\s*\d+\)\s+/);
    for (let i = 1; i < mochaBlocks.length && failures.length < 10; i++) {
      const block = mochaBlocks[i];
      if (block === undefined) continue;
      const lines = block.split('\n');
      const testName = lines[0]?.trim() ? lines[0].trim() : 'test_name_missing';
      const msgLine = lines.slice(1).find((line: string) => line.trim() && !line.trim().startsWith('at '));
      failures.push({ test: testName, message: selectDefinedValue(() => (msgLine?.trim().slice(0, 300)), () => ('unit_test_failed_without_message')) });
    }
  }

  if (failures.length === 0) {
    const pytestLines = output.match(/^FAILED\s+(.+)/gm);
    if (pytestLines) {
      for (const line of pytestLines) {
        if (failures.length >= 10) break;
        const match = line.match(/^FAILED\s+(\S+?)(?:\s+-\s+(.+))?$/);
        if (match?.[1]) failures.push({ test: match[1], message: (selectDefinedValue(() => (match[2]), () => ('unit_test_failed_without_message'))).slice(0, 300) });
      }
    }
  }

  return failures;
}

function firstOutputLine(output: string): string | null {
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  return line ? line.slice(0, 300) : null;
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

export default async function unitSuite(context: UnitContext): Promise<SuiteVerdict> {
  _logSink = selectTruthyValue(() => (context.logSink), () => (null));
  const startTime = Date.now();
  const normalized = normalizeUnitConfig(context);
  const { testCmd, commandArgv, customCmd, projectDir, timeoutMs, thresholds, maxFindings } = normalized;
  const enforced = thresholds !== null;
  const mode = evidenceMode(enforced);

  let script = customCmd ? commandArgv.join(' ') : null;

  if (!customCmd) {
    log(`Checking for test script in ${projectDir} (mode: ${mode})`);
    const check = checkTestScript(projectDir);
    script = check.script;
    if (!check.hasTests) {
      if (check.reason === null) throw new Error('unit test discovery failed without reason');
      return missingTestsFailure(startTime, check.reason, { project_dir: projectDir, test_script: script });
    }
  } else {
    log(`Custom test_cmd set, skipping package.json check as explicit runner policy (mode: ${mode})`);
  }

  log(`Running: ${testCmd} (script: "${script}", timeout: ${timeoutMs}ms)`);

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    const result = await execFileAsync(commandArgv[0], commandArgv.slice(1), {
      encoding: 'utf8',
      timeout: timeoutMs,
      cwd: projectDir,
      env: buildSubprocessEnv({ CI: 'true', NODE_ENV: 'test' }),
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: context.suiteAbortSignal,
    });
    stdout = typeof result.stdout === 'string' ? result.stdout : '';
    stderr = typeof result.stderr === 'string' ? result.stderr : '';
  } catch (error: any) {
    exitCode = subprocessExitCode(error);
    stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    stderr = typeof error?.stderr === 'string' ? error.stderr : '';

    if (selectTruthyValue(() => (error?.killed), () => (error?.name === 'AbortError'))) {
      const duration_ms = Date.now() - startTime;
      log(`ERROR: Timeout after ${timeoutMs}ms`);
      return createSuiteVerdict('unit', STATUS.ERROR, {
        critical: false,
        duration_ms,
        error: `Test execution timed out after ${timeoutMs}ms`,
        findings: [createFinding(SEVERITY.SERIOUS, `${testCmd} timed out after ${timeoutMs}ms`, { rule: 'timeout' })],
      });
    }
  }

  const combinedOutput = `${stdout}\n${stderr}`;
  const parsed = parseOutput(combinedOutput, exitCode);
  log(`Framework: ${parsed.framework} — ${parsed.passed} passed, ${parsed.failed} failed, ${parsed.skipped} skipped (exit: ${exitCode})`);

  const findings: Finding[] = [];
  if (parsed.failed > 0) {
    const failureDetails = extractFailures(combinedOutput);
    if (failureDetails.length > 0) {
      for (const failure of failureDetails) {
        if (findings.length >= maxFindings) break;
        findings.push(createFinding(SEVERITY.SERIOUS, `${failure.test}: ${failure.message}`, { rule: 'unit-test' }));
      }
    } else {
      const outputLine = firstOutputLine(combinedOutput);
      const message = outputLine
        ? `${parsed.failed} unit test(s) failed — ${outputLine}`
        : `${parsed.failed} unit test(s) failed — check test output for details`;
      findings.push(createFinding(SEVERITY.SERIOUS, message, { rule: 'unit-test' }));
    }
  }

  const failedByExit = exitCode !== 0;
  const failedByThreshold = enforced && parsed.failed > thresholds.max_failures;
  const failedByNoChecks = parsed.total <= 0;
  const status: SuiteStatus = [failedByExit, failedByThreshold, failedByNoChecks].some(Boolean)
    ? STATUS.FAIL
    : STATUS.PASS;

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';
  log(`${icon} ${mode}: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed (${duration_ms}ms)`);

  return createSuiteVerdict('unit', status, {
    critical: status === STATUS.FAIL,
    duration_ms,
    checks_total: parsed.total,
    checks_passed: parsed.passed,
    checks_failed: parsed.failed,
    findings,
    metadata: {
      project_dir: projectDir,
      test_cmd: testCmd,
      test_script: script,
      framework: parsed.framework,
      exit_code: exitCode,
      mode,
      skipped: parsed.skipped,
      ...(enforced ? { thresholds } : {}),
    },
  });
}
