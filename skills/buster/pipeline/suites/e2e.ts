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
import { REPO_DIR, resolveRepoScopedPath, stripRepoDirPrefix } from './repo-paths.ts';
import { buildSubprocessEnv } from '../security.ts';
import {
  createSuiteLog,
  suiteErrorMessage as errorMessage,
  suiteNonEmptyString as nonEmptyString,
  suiteObject as objectRecord,
  suiteObjectOrEmpty as objectRecordOrEmpty,
} from './support.ts';

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

interface E2eSettings {
  projectDir: string;
  testsDir: string;
  testFiles: string[];
  baseUrl: string;
  thresholds: AnyRecord | null;
  timeoutMs: number;
}

interface PlaywrightRun {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULTS = {
  static_port: 9999,
  server_port: 3000,
  test_patterns: ['*.spec.js', '*.spec.ts', '*.test.js', '*.test.ts', '*.test.mjs'],
  timeout_ms: 60000,
  max_findings: 30,
};

const execFileAsync = promisify(execFile) as any;

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
    const maybeBlock = failBlocks[i];
    const block: string = maybeBlock === undefined ? '' : maybeBlock;
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
    result.errors.push({ test: String(testName), message: String(message) });
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

function resolveE2eSettings(context: E2eContext, log: (message: string) => void): E2eSettings {
  const serve = objectRecordOrEmpty(context.config?.serve);
  const config = objectRecordOrEmpty(context.config?.e2e);
  const rawProjectDir = nonEmptyString(serve.project_dir) ?? '';
  const projectDir = rawProjectDir ? resolveRepoScopedPath(rawProjectDir, { field: 'serve.project_dir' }) : REPO_DIR;
  if (!projectDir) throw new Error('serve.project_dir is invalid for e2e suite');
  if (!config.tests_dir) throw new Error('e2e.tests_dir is required when the E2E suite is requested');
  const testsDir = resolveTestsDir(String(config.tests_dir), projectDir);
  const testFiles = discoverTests(testsDir, log);
  if (testFiles.length === 0) throw new Error(`No test files found in ${testsDir}`);
  const type = nonEmptyString(serve.type) ?? 'static';
  const port = serve.port ?? (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  return {
    projectDir,
    testsDir,
    testFiles,
    baseUrl: `http://localhost:${port}`,
    thresholds: objectRecord(config.thresholds),
    timeoutMs: timeoutWithinSuite(e2eTimeoutMsAuthority(config), context),
  };
}

async function runPlaywright(context: E2eContext, settings: E2eSettings): Promise<PlaywrightRun> {
  const env = buildSubprocessEnv({ BASE_URL: settings.baseUrl, PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright', CI: 'true' });
  const args = ['test', ...settings.testFiles, '--reporter=line', `--timeout=${settings.timeoutMs}`];
  try {
    const result = await execFileAsync('playwright', args, {
      encoding: 'utf8',
      timeout: timeoutWithinSuite(settings.timeoutMs + 10000, context),
      env,
      cwd: settings.testsDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: context.suiteAbortSignal,
    });
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: 0 };
  } catch (error: any) {
    return { stdout: error?.stdout ?? '', stderr: error?.stderr ?? '', exitCode: subprocessExitCode(error) };
  }
}

function playwrightExecutionError(startTime: number, settings: E2eSettings, run: PlaywrightRun, log: (message: string) => void): SuiteVerdict {
  const output = nonEmptyString(run.stderr) ?? nonEmptyString(run.stdout);
  const message = output ? output.slice(0, 500) : `Playwright exited with code ${run.exitCode}`;
  log(`ERROR: Playwright failed to run — ${message.slice(0, 100)}`);
  return createSuiteVerdict('e2e', STATUS.ERROR, {
    critical: false,
    duration_ms: Date.now() - startTime,
    error: message,
    findings: [createFinding(SEVERITY.SERIOUS, `Playwright execution error: ${message.slice(0, 200)}`, { rule: 'playwright-error' })],
    metadata: { tests_dir: settings.testsDir, test_files: settings.testFiles.length, exit_code: run.exitCode },
  });
}

function playwrightFindings(parsed: PlaywrightParseResult): Finding[] {
  const findings = parsed.errors.slice(0, DEFAULTS.max_findings)
    .map((error) => createFinding(SEVERITY.SERIOUS, `${error.test}: ${error.message}`, { rule: 'e2e-test' }));
  if (parsed.failed > 0 && findings.length === 0) {
    findings.push(createFinding(SEVERITY.SERIOUS, `${parsed.failed} test(s) failed — check test output for details`, { rule: 'e2e-test' }));
  }
  return findings;
}

function completedE2eVerdict(startTime: number, settings: E2eSettings, run: PlaywrightRun, parsed: PlaywrightParseResult, log: (message: string) => void): SuiteVerdict {
  const enforced = settings.thresholds !== null;
  const mode = evidenceMode(enforced);
  const maxFailures = settings.thresholds?.max_failures ?? 0;
  const status: SuiteStatus = enforced && parsed.failed > maxFailures ? STATUS.FAIL : STATUS.PASS;
  const durationMs = Date.now() - startTime;
  log(`${status === STATUS.PASS ? '✅' : '⚠️'} ${mode}: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed, ${parsed.skipped} skipped (${durationMs}ms)`);
  return createSuiteVerdict('e2e', status, {
    critical: false,
    duration_ms: durationMs,
    checks_total: parsed.total,
    checks_passed: parsed.passed,
    checks_failed: parsed.failed,
    findings: playwrightFindings(parsed),
    metadata: {
      tests_dir: settings.testsDir,
      test_files: settings.testFiles.length,
      base_url: settings.baseUrl,
      mode,
      exit_code: run.exitCode,
      skipped: parsed.skipped,
      ...(enforced ? { thresholds: settings.thresholds } : {}),
    },
  });
}

export default async function e2eSuite(context: E2eContext): Promise<SuiteVerdict> {
  const log = createSuiteLog('e2e', 'E2E', context.logSink);
  const startTime = Date.now();
  let settings: E2eSettings;
  try {
    settings = resolveE2eSettings(context, log);
  } catch (error) {
    return contractFailure(startTime, errorMessage(error), {}, log);
  }
  const mode = evidenceMode(settings.thresholds !== null);
  log(`Looking for tests in ${settings.testsDir} (mode: ${mode})`);
  log(`Found ${settings.testFiles.length} test file(s): ${settings.testFiles.map((file) => path.basename(file)).join(', ')}`);
  const run = await runPlaywright(context, settings);
  const parsed = parsePlaywrightOutput(run.stdout, run.stderr);
  if (parsed.total === 0 && run.exitCode !== 0) return playwrightExecutionError(startTime, settings, run, log);
  return completedE2eVerdict(startTime, settings, run, parsed, log);
}

function e2eTimeoutMsAuthority(e2eConf: AnyRecord): number {
  if (e2eConf.timeout_ms !== undefined && e2eConf.timeout_ms !== null) return e2eConf.timeout_ms;
  return DEFAULTS.timeout_ms;
}
