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
  return error instanceof Error ? error.message : String(error || 'unknown error');
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
  return { framework: 'jest', failed: Number.parseInt(match[1] || '0', 10), skipped: Number.parseInt(match[2] || '0', 10), passed: Number.parseInt(match[3] || '0', 10), total: Number.parseInt(match[4] || '0', 10) };
}

function parseVitest(output: string): ParsedTestOutput | null {
  const match = output.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+skipped\s*\|\s*)?(\d+)\s+passed\s+\((\d+)\)/);
  if (!match) return null;
  return { framework: 'vitest', failed: Number.parseInt(match[1] || '0', 10), skipped: Number.parseInt(match[2] || '0', 10), passed: Number.parseInt(match[3] || '0', 10), total: Number.parseInt(match[4] || '0', 10) };
}

function parseMocha(output: string): ParsedTestOutput | null {
  const passingMatch = output.match(/(\d+)\s+passing/);
  const failingMatch = output.match(/(\d+)\s+failing/);
  const pendingMatch = output.match(/(\d+)\s+pending/);
  if (!passingMatch && !failingMatch) return null;
  const passed = Number.parseInt(passingMatch?.[1] || '0', 10);
  const failed = Number.parseInt(failingMatch?.[1] || '0', 10);
  const skipped = Number.parseInt(pendingMatch?.[1] || '0', 10);
  return { framework: 'mocha', passed, failed, skipped, total: passed + failed + skipped };
}

function parseTap(output: string): ParsedTestOutput | null {
  const testsMatch = output.match(/#\s*tests\s+(\d+)/);
  const passMatch = output.match(/#\s*pass\s+(\d+)/);
  const failMatch = output.match(/#\s*fail\s+(\d+)/);
  if (!testsMatch) return null;
  return { framework: 'tap', total: Number.parseInt(testsMatch[1] || '0', 10), passed: Number.parseInt(passMatch?.[1] || '0', 10), failed: Number.parseInt(failMatch?.[1] || '0', 10), skipped: 0 };
}

function parsePytest(output: string): ParsedTestOutput | null {
  const match = output.match(/=+\s+(.*?)\s+in\s+[\d.]+s\s*=+/);
  if (!match?.[1]) return null;
  const summary = match[1];
  if (!/\b(passed|failed|error|skipped|warning)\b/.test(summary)) return null;
  const passed = Number.parseInt(summary.match(/(\d+)\s+passed/)?.[1] || '0', 10);
  const failed = Number.parseInt(summary.match(/(\d+)\s+failed/)?.[1] || '0', 10);
  const skipped = Number.parseInt(summary.match(/(\d+)\s+skipped/)?.[1] || '0', 10);
  const errors = Number.parseInt(summary.match(/(\d+)\s+error/)?.[1] || '0', 10);
  return { framework: 'pytest', passed, failed: failed + errors, skipped, total: passed + failed + errors + skipped };
}

function parseOutput(output: string, exitCode: number): ParsedTestOutput {
  const parsers = [parseJest, parseVitest, parseMocha, parseTap, parsePytest];
  for (const parser of parsers) {
    const result = parser(output);
    if (result) return result;
  }
  if (exitCode === 0) return { framework: 'unknown', total: 1, passed: 1, failed: 0, skipped: 0 };
  return { framework: 'unknown', total: 1, passed: 0, failed: 1, skipped: 0 };
}

function extractFailures(output: string): FailureDetail[] {
  const failures: FailureDetail[] = [];

  const jestBlocks = output.split(/\n\s*●\s+/);
  for (let i = 1; i < jestBlocks.length && failures.length < 10; i++) {
    const lines = (jestBlocks[i] || '').split('\n');
    const testName = lines[0]?.trim() || 'unknown';
    const msgLine = lines.slice(1).find((line: string) => line.trim() && !line.trim().startsWith('at '));
    failures.push({ test: testName, message: msgLine?.trim().slice(0, 300) || 'Test failed' });
  }

  if (failures.length === 0) {
    const mochaBlocks = output.split(/\n\s*\d+\)\s+/);
    for (let i = 1; i < mochaBlocks.length && failures.length < 10; i++) {
      const lines = (mochaBlocks[i] || '').split('\n');
      const testName = lines[0]?.trim() || 'unknown';
      const msgLine = lines.slice(1).find((line: string) => line.trim() && !line.trim().startsWith('at '));
      failures.push({ test: testName, message: msgLine?.trim().slice(0, 300) || 'Test failed' });
    }
  }

  if (failures.length === 0) {
    const pytestLines = output.match(/^FAILED\s+(.+)/gm);
    if (pytestLines) {
      for (const line of pytestLines) {
        if (failures.length >= 10) break;
        const match = line.match(/^FAILED\s+(\S+?)(?:\s+-\s+(.+))?$/);
        if (match?.[1]) failures.push({ test: match[1], message: (match[2] || 'Test failed').slice(0, 300) });
      }
    }
  }

  return failures;
}

function missingTestsFailure(startTime: number, reason: string | null, metadata: AnyRecord): SuiteVerdict {
  const message = reason || 'No unit tests found';
  log(`No tests found — FAIL (${message})`);
  return createSuiteVerdict('unit', STATUS.FAIL, {
    critical: false,
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
  _logSink = context.logSink || null;
  const startTime = Date.now();
  const serve = context.config?.serve || {};
  const unitConf = context.config?.unit || {};
  const testCmd = unitConf.test_cmd || DEFAULTS.test_cmd;
  const commandArgv = tokenizeCommandString(testCmd, 'unit.test_cmd');
  const customCmd = Boolean(unitConf.test_cmd && unitConf.test_cmd !== DEFAULTS.test_cmd);
  const projectDir = validateAllowedPath(resolveRepoScopedPath(serve.project_dir || DEFAULTS.project_dir, { field: 'unit.project_dir' }), 'unit.project_dir');
  const timeoutMs = timeoutWithinSuite(unitConf.timeout_ms || DEFAULTS.timeout_ms, context);
  const thresholds = unitConf.thresholds || null;
  const enforced = thresholds !== null;
  const mode = evidenceMode(enforced);

  let script = customCmd ? String(testCmd) : null;

  if (!customCmd) {
    log(`Checking for test script in ${projectDir} (mode: ${mode})`);
    const check = checkTestScript(projectDir);
    script = check.script;
    if (!check.hasTests) return missingTestsFailure(startTime, check.reason, { project_dir: projectDir, test_script: script });
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
    stdout = result.stdout || '';
    stderr = result.stderr || '';
  } catch (error: any) {
    exitCode = subprocessExitCode(error);
    stdout = error?.stdout || '';
    stderr = error?.stderr || '';

    if (error?.killed || error?.name === 'AbortError') {
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
        if (findings.length >= DEFAULTS.max_findings) break;
        findings.push(createFinding(SEVERITY.SERIOUS, `${failure.test}: ${failure.message}`, { rule: 'unit-test' }));
      }
    } else {
      findings.push(createFinding(SEVERITY.SERIOUS, `${parsed.failed} unit test(s) failed — check test output for details`, { rule: 'unit-test' }));
    }
  }

  let status: SuiteStatus = STATUS.PASS;
  if (enforced && parsed.failed > (thresholds.max_failures ?? 0)) status = STATUS.FAIL;

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';
  log(`${icon} ${mode}: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed (${duration_ms}ms)`);

  return createSuiteVerdict('unit', status, {
    critical: false,
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
