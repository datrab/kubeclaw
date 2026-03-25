// ═══════════════════════════════════════════════════════════════
// Suite: e2e — Playwright E2E Test Runner
// ═══════════════════════════════════════════════════════════════
//
// Discovers and runs existing Playwright test scripts from
// a configured tests_dir. No tests_dir configured → SKIP.
// Tests are written by the Buster subagent during its session
// and persisted for re-use.
//
// Self-correcting loop:
//   1. Subagent writes tests → persisted in .swarm/modules/<module>/tests/
//   2. Next run: e2e.js discovers + runs them (deterministic)
//   3. Broken test → FAIL/ERROR → subagent sees verdict → fixes
//   4. Next run: fixed tests pass
//
// Known limitation (see BUSTER-TEST-PLATFORM-PLAN.md §7.8):
//   The subagent writes AND evaluates its own tests. If tests are
//   logically wrong (e.g. assert on wrong value, test doesn't check
//   what it should), the first run reports a false PASS. e2e.js can
//   only catch structural errors (syntax, timeouts, crashes). For
//   trustworthy contract-level E2E, a declarative E2E-Spec format
//   (like test-spec.json for api.js) is planned for Phase 5.
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, failures
//     reported as findings for awareness.
//   Thresholds configured → ENFORCED: FAIL if failure count exceeds
//     thresholds. e.g. { max_failures: 0 }
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config.e2e):
//   { tests_dir: ".swarm/06-websockets/tests" }
//   { tests_dir: "...", thresholds: { max_failures: 0 } }
//
// No tests found → SKIP (tests not yet written by subagent).
//
// Dependencies: build + health (needs a running app)
// Requires: playwright (already in Dockerfile.sandbox)

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} = require('../verdict-schema.cjs');

// ── Defaults ────────────────────────────────────────────────────

const REPO_DIR = '/home/node/.openclaw/workspace/git-repo';

const DEFAULTS = {
  static_port:  9999,
  server_port:  3000,
  test_patterns: ['*.spec.js', '*.spec.ts', '*.test.js', '*.test.ts', '*.test.mjs'],
  timeout_ms:   60000, // 60s for entire playwright run
  max_findings: 30,
};

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [E2E] ${msg}`);
  if (_logSink) _logSink({ suite: 'e2e', msg });
}

/**
 * Resolve tests_dir path against project_dir.
 * Handles three cases:
 *   1. Absolute path → as-is
 *   2. Relative starting with project_dir prefix → resolve against REPO_DIR (avoid doubling)
 *   3. Relative to project_dir → join
 */
function resolveTestsDir(testsDir, projectDir) {
  if (path.isAbsolute(testsDir)) return testsDir;

  // Check for path doubling: if tests_dir starts with the raw project_dir prefix,
  // it's relative to the repo root, not to project_dir. Resolve against REPO_DIR.
  const rawProjectDir = projectDir.replace(REPO_DIR + '/', '').replace(REPO_DIR, '');
  if (rawProjectDir && testsDir.startsWith(rawProjectDir)) {
    return path.join(REPO_DIR, testsDir);
  }

  return path.join(projectDir, testsDir);
}

/**
 * Discover test files matching known patterns.
 * Returns array of absolute file paths.
 */
function discoverTests(testsDir) {
  if (!fs.existsSync(testsDir)) return [];

  const files = [];

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden dirs
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (isTestFile(entry.name)) {
        files.push(full);
      }
    }
  }

  walk(testsDir);
  return files.sort();
}

/**
 * Check if filename matches a known test pattern.
 */
function isTestFile(name) {
  return /\.(spec|test)\.(js|ts|mjs)$/.test(name);
}

/**
 * Parse Playwright JSON report output.
 * Returns { total, passed, failed, skipped, errors: [...] }
 */
function parsePlaywrightOutput(stdout, stderr) {
  const result = {
    total: 0, passed: 0, failed: 0, skipped: 0,
    errors: [],
  };

  // Try to parse the summary line:
  // "  X passed", "  X failed", "  X skipped"
  const combinedOutput = `${stdout}\n${stderr}`;

  const passedMatch = combinedOutput.match(/(\d+)\s+passed/);
  const failedMatch = combinedOutput.match(/(\d+)\s+failed/);
  const skippedMatch = combinedOutput.match(/(\d+)\s+skipped/);

  if (passedMatch) result.passed = parseInt(passedMatch[1]);
  if (failedMatch) result.failed = parseInt(failedMatch[1]);
  if (skippedMatch) result.skipped = parseInt(skippedMatch[1]);
  result.total = result.passed + result.failed + result.skipped;

  // Extract failure details from stderr/stdout
  // Playwright format: "  X) test name ──────"
  //   followed by error details
  const failBlocks = combinedOutput.split(/\n\s*\d+\)\s+/);
  for (let i = 1; i < failBlocks.length; i++) {
    const block = failBlocks[i];
    const lines = block.split('\n');
    const testName = lines[0]?.trim() || 'unknown test';

    // Collect error message (first non-empty lines after test name)
    const errorLines = [];
    for (let j = 1; j < lines.length && errorLines.length < 5; j++) {
      const line = lines[j]?.trim();
      if (!line) continue;
      if (line.startsWith('──')) break; // separator
      if (line.startsWith('at ')) break; // stack trace
      errorLines.push(line);
    }

    result.errors.push({
      test: testName,
      message: errorLines.join(' ').slice(0, 300) || 'Test failed',
    });
  }

  return result;
}

// ── Suite Entry Point ───────────────────────────────────────────

module.exports = async function e2eSuite(context) {
  _logSink = context.logSink || null;
  const startTime  = Date.now();
  const serve      = context.config?.serve || {};
  const e2eConf    = context.config?.e2e   || {};
  const rawProjectDir = serve.project_dir || '';
  const projectDir = rawProjectDir
    ? (path.isAbsolute(rawProjectDir) ? rawProjectDir : path.join(REPO_DIR, rawProjectDir))
    : REPO_DIR;

  // Determine base URL for Playwright
  const type    = serve.type || 'static';
  const port    = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const baseUrl = `http://localhost:${port}`;

  // Resolve tests directory
  if (!e2eConf.tests_dir) {
    const duration_ms = Date.now() - startTime;
    log('No tests_dir configured — SKIP');
    return createSuiteVerdict('e2e', STATUS.SKIP, {
      duration_ms,
      reason: 'No tests_dir configured in test_config.e2e',
      metadata: { project_dir: projectDir },
    });
  }
  const testsDir = resolveTestsDir(e2eConf.tests_dir, projectDir);

  const thresholds = e2eConf.thresholds || null;
  const enforced   = thresholds !== null;
  const timeoutMs  = e2eConf.timeout_ms || DEFAULTS.timeout_ms;

  log(`Looking for tests in ${testsDir} (mode: ${enforced ? 'enforced' : 'informational'})`);

  // Discover test files
  const testFiles = discoverTests(testsDir);

  if (testFiles.length === 0) {
    const duration_ms = Date.now() - startTime;
    log('No test files found — SKIP (tests not yet written by subagent)');
    return createSuiteVerdict('e2e', STATUS.SKIP, {
      duration_ms,
      reason: `No test files found in ${testsDir}`,
      metadata: {
        tests_dir: testsDir,
        patterns:  DEFAULTS.test_patterns,
      },
    });
  }

  log(`Found ${testFiles.length} test file(s): ${testFiles.map(f => path.basename(f)).join(', ')}`);

  // Run Playwright tests
  //   - Set BASE_URL env var so tests can use it
  //   - Run with --reporter=line for parseable output
  //   - Timeout for entire run
  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
    CI: 'true', // Headless mode
  };

  const playwrightArgs = [
    'playwright', 'test',
    ...testFiles,
    '--reporter=line',
    `--timeout=${timeoutMs}`,
  ];

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execFileSync('npx', playwrightArgs, {
      encoding: 'utf8',
      timeout:  timeoutMs + 10000, // extra buffer for process overhead
      env,
      cwd: testsDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // Playwright exits non-zero on test failures — this is expected
    exitCode = err.status || 1;
    stdout = err.stdout || '';
    stderr = err.stderr || '';
  }

  // Parse results
  const parsed = parsePlaywrightOutput(stdout, stderr);

  // If we got zero total but had an exit code, something went wrong structurally
  if (parsed.total === 0 && exitCode !== 0) {
    const duration_ms = Date.now() - startTime;
    const errorMsg = (stderr || stdout).slice(0, 500) || `Playwright exited with code ${exitCode}`;
    log(`ERROR: Playwright failed to run — ${errorMsg.slice(0, 100)}`);

    return createSuiteVerdict('e2e', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: errorMsg,
      findings: [createFinding(SEVERITY.SERIOUS,
        `Playwright execution error: ${errorMsg.slice(0, 200)}`,
        { rule: 'playwright-error' }
      )],
      metadata: {
        tests_dir: testsDir,
        test_files: testFiles.length,
        exit_code: exitCode,
      },
    });
  }

  // Build findings from failures
  const findings = [];

  for (const err of parsed.errors) {
    if (findings.length >= DEFAULTS.max_findings) break;
    findings.push(createFinding(SEVERITY.SERIOUS, `${err.test}: ${err.message}`, {
      rule: 'e2e-test',
    }));
  }

  // If there are failed tests but no parsed error details, add a generic finding
  if (parsed.failed > 0 && findings.length === 0) {
    findings.push(createFinding(SEVERITY.SERIOUS,
      `${parsed.failed} test(s) failed — check test output for details`,
      { rule: 'e2e-test' }
    ));
  }

  // Determine status
  let status = STATUS.PASS;
  if (enforced && parsed.failed > 0) {
    const maxFailures = thresholds.max_failures ?? 0;
    if (parsed.failed > maxFailures) {
      status = STATUS.FAIL;
    }
  }

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed, ${parsed.skipped} skipped (${duration_ms}ms)`);

  return createSuiteVerdict('e2e', status, {
    critical: false,
    duration_ms,
    checks_total:  parsed.total,
    checks_passed: parsed.passed,
    checks_failed: parsed.failed,
    findings,
    metadata: {
      tests_dir:   testsDir,
      test_files:  testFiles.length,
      base_url:    baseUrl,
      mode:        enforced ? 'enforced' : 'informational',
      exit_code:   exitCode,
      skipped:     parsed.skipped,
      ...(enforced ? { thresholds } : {}),
    },
  });
};
