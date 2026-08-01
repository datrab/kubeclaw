import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { readBusterEnvironment } from '../buster-environment.js';
// ═══════════════════════════════════════════════════════════════
// Verdict Schema — Deterministic Test Suite Results
// ═══════════════════════════════════════════════════════════════
//
// Consumed by:
//   - suite-runner.ts (aggregation)
//   - Buster task lifecycle (decision + prompt injection)
//   - Buster subagent (inline JSON in prompt)
//   - Pipeline/Forge (failure details via completion stream)
//
// All output is JSON. No Markdown formatting layer.
export const STATUS = Object.freeze({
    PASS: 'PASS',
    FAIL: 'FAIL',
    SKIP: 'SKIP',
    ERROR: 'ERROR',
});
export const SEVERITY = Object.freeze({
    CRITICAL: 'critical',
    SERIOUS: 'serious',
    MODERATE: 'moderate',
    MINOR: 'minor',
});
const RECOMMENDATION = Object.freeze({
    NO_SUBAGENT: 'NO_SUBAGENT',
    SPAWN: 'SPAWN',
});
function statusValues() {
    return Object.values(STATUS);
}
function severityValues() {
    return Object.values(SEVERITY);
}
function isStatus(status) {
    return typeof status === 'string' && statusValues().includes(status);
}
function isSeverity(severity) {
    return typeof severity === 'string' && severityValues().includes(severity);
}
function normalizeSuiteVerdictOptions(opts) {
    return {
        critical: opts.critical === true,
        duration_ms: Number.isFinite(opts.duration_ms) ? Number(opts.duration_ms) : 0,
        checks_total: Number.isFinite(opts.checks_total) ? Number(opts.checks_total) : 0,
        checks_passed: Number.isFinite(opts.checks_passed) ? Number(opts.checks_passed) : 0,
        checks_failed: Number.isFinite(opts.checks_failed) ? Number(opts.checks_failed) : 0,
        findings: Array.isArray(opts.findings) ? opts.findings : [],
        metadata: opts.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata) ? opts.metadata : {},
        reason: opts.reason,
        error: opts.error,
    };
}
// KEEP_TYPED_POLICY: minimal suite inputs receive deterministic typed defaults
// for optional verdict fields.
export function createSuiteVerdict(suite, status, opts = {}) {
    if (selectTruthyValue(() => (!suite), () => (typeof suite !== 'string'))) {
        throw new Error('createSuiteVerdict: suite name is required');
    }
    if (!isStatus(status)) {
        throw new Error(`createSuiteVerdict: invalid status "${status}" (expected: ${statusValues().join(', ')})`);
    }
    const normalized = normalizeSuiteVerdictOptions(opts);
    return {
        suite,
        status,
        critical: normalized.critical,
        duration_ms: normalized.duration_ms,
        checks_total: normalized.checks_total,
        checks_passed: normalized.checks_passed,
        checks_failed: normalized.checks_failed,
        findings: normalized.findings,
        metadata: normalized.metadata,
        ...(normalized.reason ? { reason: normalized.reason } : {}),
        ...(normalized.error ? { error: normalized.error } : {}),
    };
}
export function createFinding(severity, message, opts = {}) {
    if (!isSeverity(severity)) {
        throw new Error(`createFinding: invalid severity "${severity}" (expected: ${severityValues().join(', ')})`);
    }
    return {
        severity,
        message,
        rule: opts.rule === undefined ? null : opts.rule,
        element: opts.element === undefined ? null : opts.element,
        file: opts.file === undefined ? null : opts.file,
        line: opts.line === undefined ? null : opts.line,
    };
}
// KEEP_TYPED_POLICY: runner aggregation produces deterministic summaries from
// partial verdict data; no fail/error means PASS.
export function createRunnerVerdict(module, project, suiteResults) {
    if (!suiteResults || typeof suiteResults !== 'object' || Array.isArray(suiteResults)) {
        throw new Error('createRunnerVerdict: suiteResults is required');
    }
    const suites = suiteResults;
    const values = Object.values(suites);
    const durationMs = values.reduce((sum, verdict) => sum + verdict.duration_ms, 0);
    const hasAnyFail = values.some(verdict => verdict.status === STATUS.FAIL);
    const hasError = values.some(verdict => verdict.status === STATUS.ERROR);
    const hasTerminalFailure = terminalFailureAuthority(hasAnyFail, hasError);
    const overallStatus = hasTerminalFailure ? STATUS.FAIL : STATUS.PASS;
    const criticalFailure = hasTerminalFailure;
    const recommendation = criticalFailure
        ? RECOMMENDATION.NO_SUBAGENT
        : RECOMMENDATION.SPAWN;
    const summary = buildSummary(suites, overallStatus, criticalFailure);
    return {
        run_id: `buster-test-${module}-${Date.now()}`,
        module,
        project,
        timestamp: new Date().toISOString(),
        overall_status: overallStatus,
        critical_failure: criticalFailure,
        duration_ms: durationMs,
        suites,
        summary,
        recommendation,
    };
}
function terminalFailureAuthority(hasAnyFail, hasError) {
    if (hasAnyFail)
        return true;
    return hasError;
}
function buildSummary(suites, overallStatus, criticalFailure) {
    const entries = Object.entries(suites);
    if (overallStatus === STATUS.PASS) {
        const count = entries.filter(([, verdict]) => verdict.status === STATUS.PASS).length;
        return `All ${count} suites passed.`;
    }
    const failures = entries
        .filter(([, verdict]) => selectTruthyValue(() => (verdict.status === STATUS.FAIL), () => (verdict.status === STATUS.ERROR)))
        .map(([name, verdict]) => {
        const topFinding = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (verdict.findings?.[0]?.message), () => (verdict.error))), () => (verdict.reason))), () => ('missing_failure_detail'));
        return `${name}: ${topFinding}`;
    });
    const skipped = entries.filter(([, verdict]) => verdict.status === STATUS.SKIP).length;
    let summary = failures.join('; ');
    if (skipped > 0)
        summary += ` (${skipped} suite${skipped > 1 ? 's' : ''} skipped)`;
    if (criticalFailure)
        summary += ' [CRITICAL]';
    return summary;
}
// KEEP_TYPED_POLICY: prompt injection stays bounded while preserving full
// artifact references.
function truncateForPrompt(runnerVerdict, maxFindings = 5) {
    const truncated = JSON.parse(JSON.stringify(runnerVerdict));
    for (const [, suite] of Object.entries(truncated.suites)) {
        if (suite.findings && suite.findings.length > maxFindings) {
            const total = suite.findings.length;
            suite.findings = suite.findings.slice(0, maxFindings);
            suite.findings.push(createFinding(SEVERITY.MINOR, `${total - maxFindings} more findings in ${readBusterEnvironment('BUSTER_RESULTS_DIR') ?? '/home/builder/.openclaw/results'}/${suite.suite}-verdict.json`));
        }
    }
    return truncated;
}
