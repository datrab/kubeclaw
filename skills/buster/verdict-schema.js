// ═══════════════════════════════════════════════════════════════
// Verdict Schema — Deterministic Test Suite Results
// ═══════════════════════════════════════════════════════════════
//
// Consumed by:
//   - suite-runner.js (aggregation)
//   - buster-orchestrator.js (decision + prompt injection)
//   - Buster subagent (inline JSON in prompt)
//   - Pipeline/Forge (failure details via completion stream)
//
// All output is JSON. No Markdown formatting layer.

// ── Status Constants ────────────────────────────────────────────

const STATUS = Object.freeze({
  PASS:  'PASS',
  FAIL:  'FAIL',
  SKIP:  'SKIP',
  ERROR: 'ERROR',
});

const SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  SERIOUS:  'serious',
  MODERATE: 'moderate',
  MINOR:    'minor',
});

const RECOMMENDATION = Object.freeze({
  NO_SUBAGENT: 'NO_SUBAGENT', // Critical failure — direct FAIL, no LLM
  SPAWN:       'SPAWN',       // Subagent gets verdict JSON (findings or not) + running app
});

// ── Suite Verdict Factory ───────────────────────────────────────
//
// Every suite (build.js, health.js, a11y.js, ...) returns this shape.
//
// Required: suite, status
// Optional: everything else (sensible defaults)

/**
 * @param {string} suite - Suite name (e.g. 'build', 'health', 'a11y')
 * @param {string} status - STATUS.PASS | FAIL | SKIP | ERROR
 * @param {object} [opts]
 * @param {boolean}  [opts.critical=false]    - If true + FAIL → downstream suites skip, no subagent
 * @param {number}   [opts.duration_ms=0]     - Suite execution time
 * @param {number}   [opts.checks_total=0]    - Total checks run
 * @param {number}   [opts.checks_passed=0]   - Checks that passed
 * @param {number}   [opts.checks_failed=0]   - Checks that failed
 * @param {Array}    [opts.findings=[]]       - Array of Finding objects
 * @param {object}   [opts.metadata={}]       - Suite-specific metadata (tool, url, thresholds)
 * @param {string}   [opts.reason=null]       - Why skipped/errored (human-readable)
 * @param {string}   [opts.error=null]        - Error message (for ERROR status)
 * @returns {object} Suite verdict
 */
function createSuiteVerdict(suite, status, opts = {}) {
  if (!suite || typeof suite !== 'string') {
    throw new Error('createSuiteVerdict: suite name is required');
  }
  if (!Object.values(STATUS).includes(status)) {
    throw new Error(`createSuiteVerdict: invalid status "${status}" (expected: ${Object.values(STATUS).join(', ')})`);
  }

  return {
    suite,
    status,
    critical:       opts.critical       ?? false,
    duration_ms:    opts.duration_ms    ?? 0,
    checks_total:   opts.checks_total   ?? 0,
    checks_passed:  opts.checks_passed  ?? 0,
    checks_failed:  opts.checks_failed  ?? 0,
    findings:       opts.findings       ?? [],
    metadata:       opts.metadata       ?? {},
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(opts.error  ? { error: opts.error }   : {}),
  };
}

// ── Finding Factory ─────────────────────────────────────────────
//
// Individual finding within a suite verdict.

/**
 * @param {string} severity  - SEVERITY.CRITICAL | SERIOUS | MODERATE | MINOR
 * @param {string} message   - Human-readable description
 * @param {object} [opts]
 * @param {string}  [opts.rule=null]    - Rule/check identifier (e.g. 'color-contrast', 'ts2307')
 * @param {string}  [opts.element=null] - Affected element/selector
 * @param {string}  [opts.file=null]    - Source file path
 * @param {number}  [opts.line=null]    - Line number in source file
 * @returns {object} Finding
 */
function createFinding(severity, message, opts = {}) {
  if (!Object.values(SEVERITY).includes(severity)) {
    throw new Error(`createFinding: invalid severity "${severity}" (expected: ${Object.values(SEVERITY).join(', ')})`);
  }

  return {
    severity,
    message,
    rule:    opts.rule    ?? null,
    element: opts.element ?? null,
    file:    opts.file    ?? null,
    line:    opts.line    ?? null,
  };
}

// ── Runner Verdict Factory ──────────────────────────────────────
//
// suite-runner.js calls this after all suites have executed.
// Aggregates individual suite verdicts into a single decision.

/**
 * @param {string} module    - Module ID (e.g. '06')
 * @param {string} project   - Project name (e.g. 'kubecommand')
 * @param {object} suiteResults - Map of suite name → suite verdict
 * @returns {object} Runner verdict with recommendation
 */
function createRunnerVerdict(module, project, suiteResults) {
  const suites = suiteResults || {};
  const values = Object.values(suites);

  // Aggregate duration
  const duration_ms = values.reduce((sum, v) => sum + (v.duration_ms || 0), 0);

  // Determine overall status + critical failure
  const hasCriticalFail = values.some(v => v.critical && (v.status === STATUS.FAIL || v.status === STATUS.ERROR));
  const hasAnyFail      = values.some(v => v.status === STATUS.FAIL);
  const hasError        = values.some(v => v.status === STATUS.ERROR);

  const overall_status  = (hasAnyFail || hasError) ? STATUS.FAIL : STATUS.PASS;
  const critical_failure = hasCriticalFail;

  // Recommendation logic
  const recommendation = hasCriticalFail
    ? RECOMMENDATION.NO_SUBAGENT
    : RECOMMENDATION.SPAWN;

  // Build summary string
  const summary = buildSummary(suites, overall_status, critical_failure);

  return {
    run_id:    `buster-test-${module}-${Date.now()}`,
    module,
    project,
    timestamp: new Date().toISOString(),
    overall_status,
    critical_failure,
    duration_ms,
    suites,
    summary,
    recommendation,
  };
}

// ── Summary Builder ─────────────────────────────────────────────

function buildSummary(suites, overallStatus, criticalFailure) {
  const entries = Object.entries(suites);

  if (overallStatus === STATUS.PASS) {
    const count = entries.filter(([, v]) => v.status === STATUS.PASS).length;
    return `All ${count} suites passed.`;
  }

  // Collect failures
  const failures = entries
    .filter(([, v]) => v.status === STATUS.FAIL || v.status === STATUS.ERROR)
    .map(([name, v]) => {
      const topFinding = v.findings?.[0]?.message || v.error || v.reason || 'unknown';
      return `${name}: ${topFinding}`;
    });

  const skipped = entries.filter(([, v]) => v.status === STATUS.SKIP).length;

  let summary = failures.join('; ');
  if (skipped > 0) summary += ` (${skipped} suite${skipped > 1 ? 's' : ''} skipped)`;
  if (criticalFailure) summary += ' [CRITICAL]';

  return summary;
}

// ── Truncation Helper ───────────────────────────────────────────
//
// For prompt injection: keep top-N findings inline, reference file for rest.
// Returns a new verdict object with truncated findings.

/**
 * @param {object} runnerVerdict - Full runner verdict
 * @param {number} [maxFindings=5] - Max findings per suite to keep inline
 * @returns {object} Truncated copy (original unchanged)
 */
function truncateForPrompt(runnerVerdict, maxFindings = 5) {
  const truncated = JSON.parse(JSON.stringify(runnerVerdict));

  for (const [, suite] of Object.entries(truncated.suites)) {
    if (suite.findings && suite.findings.length > maxFindings) {
      const total = suite.findings.length;
      suite.findings = suite.findings.slice(0, maxFindings);
      suite.findings.push(createFinding(SEVERITY.MINOR,
        `${total - maxFindings} more findings in /sandbox/results/${suite.suite}-verdict.json`
      ));
    }
  }

  return truncated;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  STATUS,
  SEVERITY,
  RECOMMENDATION,
  createSuiteVerdict,
  createFinding,
  createRunnerVerdict,
  truncateForPrompt,
};
