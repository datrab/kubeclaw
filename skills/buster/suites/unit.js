// ═══════════════════════════════════════════════════════════════
// Suite: unit — Unit Test Runner
// ═══════════════════════════════════════════════════════════════
//
// Runs `npm test` (or custom `test_cmd`) in the project directory
// and parses the output.
// Supports: Jest, Vitest, Mocha, Node TAP, pytest.
//
// Precondition: package.json must have a "test" script defined.
// If missing or if the script is the npm default stub
// ("echo \"Error: no test specified\" && exit 1") → SKIP.
//
// Exception: When `test_cmd` is explicitly set (e.g. for pytest),
// the package.json check is skipped — the operator knows what
// they're doing.
//
// Who writes the tests? → see BUSTER-TEST-PLATFORM-PLAN.md §7.1
// Recommended: Forge writes unit tests as part of the module.
// Buster only verifies they pass. This suite is the runner, not
// the author.
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, failures
//     reported as findings for awareness.
//   Thresholds configured → ENFORCED: FAIL if failure count exceeds
//     thresholds. e.g. { max_failures: 0 }
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config.unit):
//   { test_cmd: "npm test", timeout_ms: 60000 }
//   { thresholds: { max_failures: 0 } }
//
// Dependencies: build (needs compiled code, not necessarily a running app)
// Does NOT depend on health — unit tests run against code, not server.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../verdict-schema.js';
import { REPO_DIR, resolveRepoPath } from './repo-paths.js';
import { tokenizeCommandString, validateAllowedPath } from '../../common/pipeline/security.js';

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  project_dir: REPO_DIR,
  test_cmd:    'npm test',
  timeout_ms:  60000, // 60s
  max_findings: 30,
};

// npm default stub when no test script is defined
const NPM_NO_TEST_STUB = 'echo "Error: no test specified" && exit 1';

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [UNIT] ${msg}`);
  if (_logSink) _logSink({ suite: 'unit', msg });
}

/**
 * Check if package.json has a meaningful test script.
 * Returns { hasTests: boolean, script: string|null }
 */
function checkTestScript(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return { hasTests: false, script: null, reason: 'No package.json found' };
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    return { hasTests: false, script: null, reason: `Cannot parse package.json: ${err.message}` };
  }

  const testScript = pkg.scripts?.test;

  if (!testScript) {
    return { hasTests: false, script: null, reason: 'No "test" script in package.json' };
  }

  if (testScript.trim() === NPM_NO_TEST_STUB) {
    return { hasTests: false, script: testScript, reason: 'Test script is npm default stub (no tests defined)' };
  }

  return { hasTests: true, script: testScript, reason: null };
}

// ── Output Parsers ──────────────────────────────────────────────
//
// Each parser tries to extract { total, passed, failed, skipped }
// from test runner output. Returns null if format not recognized.

function parseJest(output) {
  // Jest summary: "Tests:       3 failed, 12 passed, 15 total"
  const match = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/);
  if (!match) return null;

  return {
    framework: 'jest',
    failed:  parseInt(match[1] || '0'),
    skipped: parseInt(match[2] || '0'),
    passed:  parseInt(match[3] || '0'),
    total:   parseInt(match[4] || '0'),
  };
}

function parseVitest(output) {
  // Vitest summary: "Tests  3 failed | 2 skipped | 12 passed (17)"
  //            or:  "Tests  12 passed (12)"
  const match = output.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+skipped\s*\|\s*)?(\d+)\s+passed\s+\((\d+)\)/);
  if (!match) return null;

  return {
    framework: 'vitest',
    failed:  parseInt(match[1] || '0'),
    skipped: parseInt(match[2] || '0'),
    passed:  parseInt(match[3] || '0'),
    total:   parseInt(match[4] || '0'),
  };
}

function parseMocha(output) {
  // Mocha summary: "  12 passing (1s)" and optionally "  3 failing"
  const passingMatch = output.match(/(\d+)\s+passing/);
  const failingMatch = output.match(/(\d+)\s+failing/);
  const pendingMatch = output.match(/(\d+)\s+pending/);

  if (!passingMatch && !failingMatch) return null;

  const passed  = parseInt(passingMatch?.[1] || '0');
  const failed  = parseInt(failingMatch?.[1] || '0');
  const skipped = parseInt(pendingMatch?.[1] || '0');

  return {
    framework: 'mocha',
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
  };
}

function parseTap(output) {
  // TAP summary: "# tests 15" "# pass  12" "# fail  3"
  const testsMatch = output.match(/#\s*tests\s+(\d+)/);
  const passMatch  = output.match(/#\s*pass\s+(\d+)/);
  const failMatch  = output.match(/#\s*fail\s+(\d+)/);

  if (!testsMatch) return null;

  return {
    framework: 'tap',
    total:   parseInt(testsMatch[1] || '0'),
    passed:  parseInt(passMatch?.[1] || '0'),
    failed:  parseInt(failMatch?.[1] || '0'),
    skipped: 0,
  };
}

function parsePytest(output) {
  // pytest summary line variants:
  //   "= 12 passed in 1.23s ="
  //   "= 3 failed, 12 passed in 2.45s ="
  //   "= 3 failed, 2 skipped, 12 passed in 3.67s ="
  //   "= 2 error in 0.89s ="  (collection errors)
  const match = output.match(/=+\s+(.*?)\s+in\s+[\d.]+s\s*=+/);
  if (!match) return null;

  const summary = match[1];
  // Only match if it contains pytest-style keywords
  if (!/\b(passed|failed|error|skipped|warning)\b/.test(summary)) return null;

  const passed  = parseInt(summary.match(/(\d+)\s+passed/)?.[1]  || '0');
  const failed  = parseInt(summary.match(/(\d+)\s+failed/)?.[1]  || '0');
  const skipped = parseInt(summary.match(/(\d+)\s+skipped/)?.[1] || '0');
  const errors  = parseInt(summary.match(/(\d+)\s+error/)?.[1]   || '0');

  return {
    framework: 'pytest',
    passed,
    failed:  failed + errors,
    skipped,
    total:   passed + failed + errors + skipped,
  };
}

/**
 * Try all parsers, return first match or a generic result.
 */
function parseOutput(output, exitCode) {
  const parsers = [parseJest, parseVitest, parseMocha, parseTap, parsePytest];

  for (const parser of parsers) {
    const result = parser(output);
    if (result) return result;
  }

  // Fallback: no recognized format — derive from exit code
  if (exitCode === 0) {
    return { framework: 'unknown', total: 1, passed: 1, failed: 0, skipped: 0 };
  }
  return { framework: 'unknown', total: 1, passed: 0, failed: 1, skipped: 0 };
}

/**
 * Extract failure messages from test output.
 * Returns array of { test, message } objects.
 */
function extractFailures(output) {
  const failures = [];

  // Jest/Vitest: "● test name" or "FAIL src/..."
  const jestBlocks = output.split(/\n\s*●\s+/);
  for (let i = 1; i < jestBlocks.length && failures.length < 10; i++) {
    const lines = jestBlocks[i].split('\n');
    const testName = lines[0]?.trim() || 'unknown';
    // Grab first non-empty line after test name as message
    const msgLine = lines.slice(1).find(l => l.trim() && !l.trim().startsWith('at '));
    failures.push({
      test: testName,
      message: msgLine?.trim().slice(0, 300) || 'Test failed',
    });
  }

  // Mocha: numbered failures "  1) test name"
  if (failures.length === 0) {
    const mochaBlocks = output.split(/\n\s*\d+\)\s+/);
    for (let i = 1; i < mochaBlocks.length && failures.length < 10; i++) {
      const lines = mochaBlocks[i].split('\n');
      const testName = lines[0]?.trim() || 'unknown';
      const msgLine = lines.slice(1).find(l => l.trim() && !l.trim().startsWith('at '));
      failures.push({
        test: testName,
        message: msgLine?.trim().slice(0, 300) || 'Test failed',
      });
    }
  }

  // pytest: "FAILED tests/test_foo.py::test_bar - AssertionError: ..."
  if (failures.length === 0) {
    const pytestLines = output.match(/^FAILED\s+(.+)/gm);
    if (pytestLines) {
      for (const line of pytestLines) {
        if (failures.length >= 10) break;
        // "FAILED tests/test_foo.py::test_bar - message"
        const m = line.match(/^FAILED\s+(\S+?)(?:\s+-\s+(.+))?$/);
        if (m) {
          failures.push({
            test: m[1],
            message: (m[2] || 'Test failed').slice(0, 300),
          });
        }
      }
    }
  }

  return failures;
}

// ── Suite Entry Point ───────────────────────────────────────────

export default async function unitSuite(context) {
  _logSink = context.logSink || null;
  const startTime  = Date.now();
  const serve      = context.config?.serve || {};
  const unitConf   = context.config?.unit  || {};
  const projectDir = validateAllowedPath(resolveRepoPath(serve.project_dir || DEFAULTS.project_dir), 'unit.project_dir');

  const testCmd    = unitConf.test_cmd   || DEFAULTS.test_cmd;
  const commandArgv = tokenizeCommandString(testCmd, 'unit.test_cmd');
  const customCmd  = !!unitConf.test_cmd && unitConf.test_cmd !== DEFAULTS.test_cmd;
  const timeoutMs  = unitConf.timeout_ms || DEFAULTS.timeout_ms;
  const thresholds = unitConf.thresholds || null;
  const enforced   = thresholds !== null;

  // 1. Check if tests exist (skip when test_cmd is explicitly set — operator knows what they're doing)
  let script = customCmd ? testCmd : null;

  if (!customCmd) {
    log(`Checking for test script in ${projectDir} (mode: ${enforced ? 'enforced' : 'informational'})`);
    const check = checkTestScript(projectDir);
    script = check.script;

    if (!check.hasTests) {
      const duration_ms = Date.now() - startTime;
      log(`No tests found — SKIP (${check.reason})`);
      return createSuiteVerdict('unit', STATUS.SKIP, {
        duration_ms,
        reason: check.reason,
        metadata: {
          project_dir: projectDir,
          test_script: script,
        },
      });
    }
  } else {
    log(`Custom test_cmd set, skipping package.json check (mode: ${enforced ? 'enforced' : 'informational'})`);
  }

  log(`Running: ${testCmd} (script: "${script}", timeout: ${timeoutMs}ms)`);

  // 2. Execute test command
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execFileSync(commandArgv[0], commandArgv.slice(1), {
      encoding: 'utf8',
      timeout:  timeoutMs,
      cwd:      projectDir,
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
      stdio:    ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    exitCode = err.status || 1;
    stdout = err.stdout || '';
    stderr = err.stderr || '';

    // Distinguish between test failures (expected) and execution errors
    if (err.killed) {
      const duration_ms = Date.now() - startTime;
      log(`ERROR: Timeout after ${timeoutMs}ms`);
      return createSuiteVerdict('unit', STATUS.ERROR, {
        critical: false,
        duration_ms,
        error: `Test execution timed out after ${timeoutMs}ms`,
        findings: [createFinding(SEVERITY.SERIOUS,
          `${testCmd} timed out after ${timeoutMs}ms`,
          { rule: 'timeout' }
        )],
      });
    }
  }

  const combinedOutput = `${stdout}\n${stderr}`;

  // 3. Parse output
  const parsed = parseOutput(combinedOutput, exitCode);
  log(`Framework: ${parsed.framework} — ${parsed.passed} passed, ${parsed.failed} failed, ${parsed.skipped} skipped (exit: ${exitCode})`);

  // 4. Build findings from failures
  const findings = [];

  if (parsed.failed > 0) {
    const failureDetails = extractFailures(combinedOutput);

    if (failureDetails.length > 0) {
      for (const f of failureDetails) {
        if (findings.length >= DEFAULTS.max_findings) break;
        findings.push(createFinding(SEVERITY.SERIOUS, `${f.test}: ${f.message}`, {
          rule: 'unit-test',
        }));
      }
    } else {
      // No parsed details — generic finding
      findings.push(createFinding(SEVERITY.SERIOUS,
        `${parsed.failed} unit test(s) failed — check test output for details`,
        { rule: 'unit-test' }
      ));
    }
  }

  // 5. Determine status
  let status = STATUS.PASS;
  if (enforced && parsed.failed > 0) {
    const maxFailures = thresholds.max_failures ?? 0;
    if (parsed.failed > maxFailures) {
      status = STATUS.FAIL;
    }
  }

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed (${duration_ms}ms)`);

  return createSuiteVerdict('unit', status, {
    critical: false,
    duration_ms,
    checks_total:  parsed.total,
    checks_passed: parsed.passed,
    checks_failed: parsed.failed,
    findings,
    metadata: {
      project_dir:  projectDir,
      test_cmd:     testCmd,
      test_script:  script,
      framework:    parsed.framework,
      exit_code:    exitCode,
      mode:         enforced ? 'enforced' : 'informational',
      skipped:      parsed.skipped,
      ...(enforced ? { thresholds } : {}),
    },
  });
}
