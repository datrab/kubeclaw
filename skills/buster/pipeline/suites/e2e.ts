import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: e2e — Playwright E2E Test Runner
// ═══════════════════════════════════════════════════════════════
//
// DELETE_LEGACY: requested E2E suites require typed tests_dir and at least one
// discovered test file; absence is a contract failure, not SKIP.
// KEEP_TYPED_POLICY: no-threshold failures use explicit evidence-only PASS
// mode; Playwright reporter variation is normalized into deterministic
// findings/verdicts.

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
import { REPO_DIR, resolveRepoScopedPath, stripRepoDirPrefix } from './repo-paths.ts';
import { buildSubprocessEnv } from '../security.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface E2eContext {
  logSink?: LogSink | null;
  suiteAbortSignal?: AbortSignal;
  suiteDeadlineMs?: number;
  config?: {
    serve?: AnyRecord;
    e2e?: AnyRecord;
  };
}

interface PlaywrightParseResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: Array<{ test: string; message: string }>;
}

const DEFAULTS = {
  static_port: 9999,
  server_port: 3000,
  test_patterns: ['*.spec.js', '*.spec.ts', '*.test.js', '*.test.ts', '*.test.mjs'],
  timeout_ms: 60000,
  max_findings: 30,
};

const execFileAsync = promisify(execFile) as any;

function createLog(logSink: LogSink | null | undefined): (msg: string) => void {
  return (msg: string): void => {
    console.log(`[SUITE] [E2E] ${msg}`);
    if (logSink) logSink({ suite: 'e2e', msg });
  };
}

function objectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error == null ? 'missing_error_detail' : String(error);
}

function subprocessExitCode(error: any): number {
  if (Number.isInteger(error?.status)) return error.status;
  if (Number.isInteger(error?.code)) return error.code;
  return 1;
}

function timeoutWithinSuite(timeoutMs: number, context: E2eContext): number {
  if (typeof context.suiteDeadlineMs !== 'number') return timeoutMs;
  return Math.max(1, Math.min(timeoutMs, context.suiteDeadlineMs - Date.now()));
}

function evidenceMode(enforced: boolean): 'enforced' | 'evidence-only' {
  return enforced ? 'enforced' : 'evidence-only';
}

function resolveTestsDir(testsDir: string, projectDir: string): string {
  const rawProjectDir = stripRepoDirPrefix(projectDir, REPO_DIR);
  const baseDir = rawProjectDir && (selectTruthyValue(() => (testsDir === rawProjectDir), () => (testsDir.startsWith(`${rawProjectDir}/`)))) ? REPO_DIR : projectDir;
  const resolved = resolveRepoScopedPath(testsDir, { baseDir, scopeDir: projectDir, field: 'e2e.tests_dir' });
  if (!resolved) throw new Error('e2e.tests_dir is invalid');
  return resolved;
}

function discoverTests(testsDir: string, log: (msg: string) => void): string[] {
  if (!fs.existsSync(testsDir)) return [];
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: any[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (error) {
      log(`non-blocking e2e directory scan failed: ${dir}: ${errorMessage(error)}`);
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (selectTruthyValue(() => (entry.name === 'node_modules'), () => (entry.name.startsWith('.')))) continue;
        walk(full);
      } else if (isTestFile(entry.name)) {
        files.push(full);
      }
    }
  }

  walk(testsDir);
  return files.sort();
}

function isTestFile(name: string): boolean {
  return /\.(spec|test)\.(js|ts|mjs)$/.test(name);
}

function parsePlaywrightOutput(stdout: string, stderr: string): PlaywrightParseResult {
  const result: PlaywrightParseResult = { total: 0, passed: 0, failed: 0, skipped: 0, errors: [] };
  const combinedOutput = `${stdout}\n${stderr}`;

  const passedMatch = combinedOutput.match(/(\d+)\s+passed/);
  const failedMatch = combinedOutput.match(/(\d+)\s+failed/);
  const skippedMatch = combinedOutput.match(/(\d+)\s+skipped/);

  if (passedMatch?.[1]) result.passed = Number.parseInt(passedMatch[1], 10);
  if (failedMatch?.[1]) result.failed = Number.parseInt(failedMatch[1], 10);
  if (skippedMatch?.[1]) result.skipped = Number.parseInt(skippedMatch[1], 10);
  result.total = result.passed + result.failed + result.skipped;

  const failBlocks = combinedOutput.split(/\n\s*\d+\)\s+/);
  for (let i = 1; i < failBlocks.length; i++) {
    const block = selectDefinedValue(() => (failBlocks[i]), () => (''));
    const lines = block.split('\n');
    const testName = selectDefinedValue(() => (nonEmptyString(lines[0]?.trim())), () => ('missing_test_name'));
    const errorLines: string[] = [];
    for (let j = 1; j < lines.length && errorLines.length < 5; j++) {
      const line = lines[j]?.trim();
      if (!line) continue;
      if (line.startsWith('──')) break;
      if (line.startsWith('at ')) break;
      errorLines.push(line);
    }
    const message = selectDefinedValue(() => (nonEmptyString(errorLines.join(' ').slice(0, 300))), () => ('Test failed'));
    result.errors.push({ test: testName, message });
  }

  return result;
}

function contractFailure(startTime: number, message: string, metadata: AnyRecord = {}, log: (msg: string) => void): SuiteVerdict {
  log(`${message} — FAIL`);
  return createSuiteVerdict('e2e', STATUS.FAIL, {
    critical: false,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    reason: message,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'e2e-tests-required' })],
    metadata,
  });
}

export default async function e2eSuite(context: E2eContext): Promise<SuiteVerdict> {
  const log = createLog(context.logSink);
  const startTime = Date.now();
  const serve = selectDefinedValue(() => (objectRecord(context.config?.serve)), () => ({}));
  const e2eConf = selectDefinedValue(() => (objectRecord(context.config?.e2e)), () => ({}));
  const rawProjectDir = selectDefinedValue(() => (nonEmptyString(serve.project_dir)), () => (''));
  const projectDir = rawProjectDir ? resolveRepoScopedPath(rawProjectDir, { field: 'serve.project_dir' }) : REPO_DIR;
  if (!projectDir) return contractFailure(startTime, 'serve.project_dir is invalid for e2e suite', {}, log);

  const type = selectDefinedValue(() => (nonEmptyString(serve.type)), () => ('static'));
  const port = selectDefinedValue(() => (serve.port), () => ((type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port)));
  const baseUrl = `http://localhost:${port}`;

  if (!e2eConf.tests_dir) return contractFailure(startTime, 'e2e.tests_dir is required when the E2E suite is requested', { project_dir: projectDir }, log);

  let testsDir: string;
  try {
    testsDir = resolveTestsDir(String(e2eConf.tests_dir), projectDir);
  } catch (error) {
    return contractFailure(startTime, errorMessage(error), { project_dir: projectDir, tests_dir: e2eConf.tests_dir }, log);
  }

  const thresholds = selectTruthyValue(() => (e2eConf.thresholds), () => (null));
  const enforced = thresholds !== null;
  const mode = evidenceMode(enforced);
  const timeoutMs = timeoutWithinSuite(e2eTimeoutMsAuthority(e2eConf), context);

  log(`Looking for tests in ${testsDir} (mode: ${mode})`);
  const testFiles = discoverTests(testsDir, log);

  if (testFiles.length === 0) {
    return contractFailure(startTime, `No test files found in ${testsDir}`, { tests_dir: testsDir, patterns: DEFAULTS.test_patterns }, log);
  }

  log(`Found ${testFiles.length} test file(s): ${testFiles.map((file) => path.basename(file)).join(', ')}`);

  const env = buildSubprocessEnv({ BASE_URL: baseUrl, PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright', CI: 'true' });
  const playwrightArgs = ['test', ...testFiles, '--reporter=line', `--timeout=${timeoutMs}`];

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    const result = await execFileAsync('playwright', playwrightArgs, {
      encoding: 'utf8',
      timeout: timeoutWithinSuite(timeoutMs + 10000, context),
      env,
      cwd: testsDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: context.suiteAbortSignal,
    });
    stdout = selectDefinedValue(() => (result.stdout), () => (''));
    stderr = selectDefinedValue(() => (result.stderr), () => (''));
  } catch (error: any) {
    exitCode = subprocessExitCode(error);
    stdout = selectDefinedValue(() => (error?.stdout), () => (''));
    stderr = selectDefinedValue(() => (error?.stderr), () => (''));
  }

  const parsed = parsePlaywrightOutput(stdout, stderr);
  if (parsed.total === 0 && exitCode !== 0) {
    const duration_ms = Date.now() - startTime;
    const errorOutput = selectDefinedValue(() => (nonEmptyString(stderr)), () => (nonEmptyString(stdout)));
    const errorMsg = errorOutput ? errorOutput.slice(0, 500) : `Playwright exited with code ${exitCode}`;
    log(`ERROR: Playwright failed to run — ${errorMsg.slice(0, 100)}`);

    return createSuiteVerdict('e2e', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: errorMsg,
      findings: [createFinding(SEVERITY.SERIOUS, `Playwright execution error: ${errorMsg.slice(0, 200)}`, { rule: 'playwright-error' })],
      metadata: { tests_dir: testsDir, test_files: testFiles.length, exit_code: exitCode },
    });
  }

  const findings: Finding[] = [];
  for (const err of parsed.errors) {
    if (findings.length >= DEFAULTS.max_findings) break;
    findings.push(createFinding(SEVERITY.SERIOUS, `${err.test}: ${err.message}`, { rule: 'e2e-test' }));
  }

  if (parsed.failed > 0 && findings.length === 0) {
    findings.push(createFinding(SEVERITY.SERIOUS, `${parsed.failed} test(s) failed — check test output for details`, { rule: 'e2e-test' }));
  }

  let status: SuiteStatus = STATUS.PASS;
  const maxFailures = selectDefinedValue(() => (thresholds?.max_failures), () => (0));
  if (enforced && parsed.failed > maxFailures) status = STATUS.FAIL;

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';
  log(`${icon} ${mode}: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed, ${parsed.skipped} skipped (${duration_ms}ms)`);

  return createSuiteVerdict('e2e', status, {
    critical: false,
    duration_ms,
    checks_total: parsed.total,
    checks_passed: parsed.passed,
    checks_failed: parsed.failed,
    findings,
    metadata: {
      tests_dir: testsDir,
      test_files: testFiles.length,
      base_url: baseUrl,
      mode,
      exit_code: exitCode,
      skipped: parsed.skipped,
      ...(enforced ? { thresholds } : {}),
    },
  });
}

function e2eTimeoutMsAuthority(e2eConf: AnyRecord): number {
  if (e2eConf.timeout_ms !== undefined && e2eConf.timeout_ms !== null) return e2eConf.timeout_ms;
  return DEFAULTS.timeout_ms;
}
