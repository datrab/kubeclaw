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
  PASS:  'PASS',
  FAIL:  'FAIL',
  SKIP:  'SKIP',
  ERROR: 'ERROR',
});

export type SuiteStatus = typeof STATUS[keyof typeof STATUS];

export const SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  SERIOUS:  'serious',
  MODERATE: 'moderate',
  MINOR:    'minor',
});

export type FindingSeverity = typeof SEVERITY[keyof typeof SEVERITY];

export const RECOMMENDATION = Object.freeze({
  NO_SUBAGENT: 'NO_SUBAGENT',
  SPAWN:       'SPAWN',
});

export type RunnerRecommendation = typeof RECOMMENDATION[keyof typeof RECOMMENDATION];

export interface FindingOptions {
  rule?: string | null;
  element?: string | null;
  file?: string | null;
  line?: number | null;
}

export interface Finding {
  severity: FindingSeverity;
  message: string;
  rule: string | null;
  element: string | null;
  file: string | null;
  line: number | null;
}

export interface SuiteVerdictOptions {
  critical?: boolean;
  duration_ms?: number;
  checks_total?: number;
  checks_passed?: number;
  checks_failed?: number;
  findings?: Finding[];
  metadata?: Record<string, unknown>;
  reason?: string | null;
  error?: string | null;
}

export interface SuiteVerdict {
  suite: string;
  status: SuiteStatus;
  critical: boolean;
  duration_ms: number;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  findings: Finding[];
  metadata: Record<string, unknown>;
  reason?: string;
  error?: string;
}

export interface RunnerVerdict {
  run_id: string;
  module: string;
  project: string;
  timestamp: string;
  overall_status: SuiteStatus;
  critical_failure: boolean;
  duration_ms: number;
  suites: Record<string, SuiteVerdict>;
  summary: string;
  recommendation: RunnerRecommendation;
}

function statusValues(): SuiteStatus[] {
  return Object.values(STATUS);
}

function severityValues(): FindingSeverity[] {
  return Object.values(SEVERITY);
}

function isStatus(status: unknown): status is SuiteStatus {
  return typeof status === 'string' && statusValues().includes(status as SuiteStatus);
}

function isSeverity(severity: unknown): severity is FindingSeverity {
  return typeof severity === 'string' && severityValues().includes(severity as FindingSeverity);
}

// KEEP_TYPED_POLICY: minimal suite inputs receive deterministic typed defaults
// for optional verdict fields.
export function createSuiteVerdict(suite: string, status: SuiteStatus, opts: SuiteVerdictOptions = {}): SuiteVerdict {
  if (!suite || typeof suite !== 'string') {
    throw new Error('createSuiteVerdict: suite name is required');
  }
  if (!isStatus(status)) {
    throw new Error(`createSuiteVerdict: invalid status "${status}" (expected: ${statusValues().join(', ')})`);
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

export function createFinding(severity: FindingSeverity, message: string, opts: FindingOptions = {}): Finding {
  if (!isSeverity(severity)) {
    throw new Error(`createFinding: invalid severity "${severity}" (expected: ${severityValues().join(', ')})`);
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

// KEEP_TYPED_POLICY: runner aggregation produces deterministic summaries from
// partial verdict data; no fail/error means PASS.
export function createRunnerVerdict(module: string, project: string, suiteResults: Record<string, SuiteVerdict> | null | undefined): RunnerVerdict {
  const suites = suiteResults || {};
  const values = Object.values(suites);

  const durationMs = values.reduce((sum, verdict) => sum + (verdict.duration_ms || 0), 0);
  const hasCriticalFail = values.some(verdict => verdict.critical && (verdict.status === STATUS.FAIL || verdict.status === STATUS.ERROR));
  const hasAnyFail = values.some(verdict => verdict.status === STATUS.FAIL);
  const hasError = values.some(verdict => verdict.status === STATUS.ERROR);

  const overallStatus = (hasAnyFail || hasError) ? STATUS.FAIL : STATUS.PASS;
  const criticalFailure = hasCriticalFail;
  const recommendation = hasCriticalFail
    ? RECOMMENDATION.NO_SUBAGENT
    : RECOMMENDATION.SPAWN;

  const summary = buildSummary(suites, overallStatus, criticalFailure);

  return {
    run_id:    `buster-test-${module}-${Date.now()}`,
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

function buildSummary(suites: Record<string, SuiteVerdict>, overallStatus: SuiteStatus, criticalFailure: boolean): string {
  const entries = Object.entries(suites);

  if (overallStatus === STATUS.PASS) {
    const count = entries.filter(([, verdict]) => verdict.status === STATUS.PASS).length;
    return `All ${count} suites passed.`;
  }

  const failures = entries
    .filter(([, verdict]) => verdict.status === STATUS.FAIL || verdict.status === STATUS.ERROR)
    .map(([name, verdict]) => {
      const topFinding = verdict.findings?.[0]?.message || verdict.error || verdict.reason || 'unknown';
      return `${name}: ${topFinding}`;
    });

  const skipped = entries.filter(([, verdict]) => verdict.status === STATUS.SKIP).length;

  let summary = failures.join('; ');
  if (skipped > 0) summary += ` (${skipped} suite${skipped > 1 ? 's' : ''} skipped)`;
  if (criticalFailure) summary += ' [CRITICAL]';

  return summary;
}

// KEEP_TYPED_POLICY: prompt injection stays bounded while preserving full
// artifact references.
export function truncateForPrompt(runnerVerdict: RunnerVerdict, maxFindings = 5): RunnerVerdict {
  const truncated = JSON.parse(JSON.stringify(runnerVerdict)) as RunnerVerdict;

  for (const [, suite] of Object.entries(truncated.suites)) {
    if (suite.findings && suite.findings.length > maxFindings) {
      const total = suite.findings.length;
      suite.findings = suite.findings.slice(0, maxFindings);
      suite.findings.push(createFinding(SEVERITY.MINOR,
        `${total - maxFindings} more findings in /sandbox/results/${suite.suite}-verdict.json`,
      ));
    }
  }

  return truncated;
}
