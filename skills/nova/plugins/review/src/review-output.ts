import type { StageResult } from '@kubeclaw/plugin-sdk';

const ROOT_FIELDS = new Set([
  'status',
  'critical_issues',
  'deferred_issues',
  'checked_contracts',
  'opened_artifacts',
  'failed_commands',
  'unverified_requirements',
  'summary',
]);

const ISSUE_FIELDS = new Set([
  'source',
  'description',
  'affected_files',
  'recommended_fix',
]);

export interface ReviewIssue {
  readonly source: string;
  readonly description: string;
  readonly affected_files: readonly string[];
  readonly recommended_fix: string;
}

export interface ReviewOutput {
  readonly status: 'PASS' | 'FAIL';
  readonly critical_issues: readonly ReviewIssue[];
  readonly deferred_issues: readonly ReviewIssue[];
  readonly checked_contracts: readonly string[];
  readonly opened_artifacts: readonly string[];
  readonly failed_commands: readonly string[];
  readonly unverified_requirements: readonly string[];
  readonly summary: string;
}

export type ParsedReviewOutput =
  | { readonly ok: true; readonly value: ReviewOutput }
  | { readonly ok: false; readonly error: string };

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function closedFields(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unknown field(s): ${unknown.sort().join(', ')}`);
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => nonEmptyString(entry, `${label}[${index}]`));
}

function issueArray(value: unknown, label: string): readonly ReviewIssue[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => {
    const issue = record(entry, `${label}[${index}]`);
    closedFields(issue, ISSUE_FIELDS, `${label}[${index}]`);
    return {
      source: nonEmptyString(issue.source, `${label}[${index}].source`),
      description: nonEmptyString(issue.description, `${label}[${index}].description`),
      affected_files: stringArray(issue.affected_files, `${label}[${index}].affected_files`),
      recommended_fix: nonEmptyString(issue.recommended_fix, `${label}[${index}].recommended_fix`),
    };
  });
}

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`review output must be valid JSON: ${detail}`);
  }
}

function parse(value: unknown): ReviewOutput {
  const output = record(decode(value), 'review output');
  closedFields(output, ROOT_FIELDS, 'review output');
  if (output.status !== 'PASS' && output.status !== 'FAIL') {
    throw new Error('review output status must be PASS or FAIL');
  }
  const parsed: ReviewOutput = {
    status: output.status,
    critical_issues: issueArray(output.critical_issues, 'critical_issues'),
    deferred_issues: issueArray(output.deferred_issues, 'deferred_issues'),
    checked_contracts: stringArray(output.checked_contracts, 'checked_contracts'),
    opened_artifacts: stringArray(output.opened_artifacts, 'opened_artifacts'),
    failed_commands: stringArray(output.failed_commands, 'failed_commands'),
    unverified_requirements: stringArray(
      output.unverified_requirements,
      'unverified_requirements',
    ),
    summary: nonEmptyString(output.summary, 'summary'),
  };

  if (parsed.status === 'PASS') {
    if (parsed.critical_issues.length > 0) {
      throw new Error('PASS contradicts critical_issues');
    }
    if (parsed.checked_contracts.length === 0) {
      throw new Error('PASS requires at least one checked contract');
    }
    if (parsed.opened_artifacts.length === 0) {
      throw new Error('PASS requires at least one opened artifact');
    }
    if (parsed.failed_commands.length > 0) {
      throw new Error('PASS contradicts failed_commands');
    }
    if (parsed.unverified_requirements.length > 0) {
      throw new Error('PASS contradicts unverified_requirements');
    }
  } else if (
    parsed.critical_issues.length === 0
    && parsed.failed_commands.length === 0
    && parsed.unverified_requirements.length === 0
  ) {
    throw new Error('FAIL requires a critical issue, failed command, or unverified requirement');
  }

  return parsed;
}

export function parseReviewOutput(value: unknown): ParsedReviewOutput {
  try {
    return { ok: true, value: parse(value) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function parseReviewDispatchResponse(
  response: Readonly<Record<string, unknown>>,
): ParsedReviewOutput {
  if (!Object.prototype.hasOwnProperty.call(response, 'result')) {
    return { ok: false, error: 'runtime dispatch response is missing result' };
  }
  return parseReviewOutput(response.result);
}

export function reviewOutputToStageResult(parsed: ParsedReviewOutput): StageResult {
  if (!parsed.ok) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'blocked',
      reason: {
        code: 'kubeclaw.review.invalid_output',
        message: parsed.error,
      },
      artifacts: [],
    };
  }

  if (parsed.value.status === 'PASS') {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'passed',
      artifacts: [],
    };
  }

  const findings = parsed.value.critical_issues.map((issue, index) => ({
    code: `REVIEW_ISSUE_${index + 1}`,
    severity: 'error',
    message: issue.description,
    category: 'review',
    target: issue.affected_files[0] ?? issue.source,
    retryable: false,
    environmentIssue: false,
    metadata: { recommendedFix: issue.recommended_fix, source: issue.source },
  }));

  return {
    schemaVersion: 'stage-result.v2',
    outcome: 'request_fix',
    reason: {
      code: 'kubeclaw.review.failed',
      message: parsed.value.summary,
      details: {
        findings,
        failedCommands: parsed.value.failed_commands,
        unverifiedRequirements: parsed.value.unverified_requirements,
        deferredIssues: parsed.value.deferred_issues,
      },
    },
    artifacts: [],
  };
}
