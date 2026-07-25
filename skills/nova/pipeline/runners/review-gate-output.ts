import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/review-gate-output.ts — pure review gate output parsing and diagnostics helpers
// Keep this module side-effect free: runner files own filesystem, telemetry, lifecycle, and Discord effects.

/**
 * Extract actionable issues from a review result for Forge to fix.
 */
const REVIEW_ISSUE_MESSAGE_MISSING = 'Review issue';

function issueList(value: any) {
  return Array.isArray(value) ? value : [];
}

export function extractReviewIssues(mergedResult: any) {
  if (!mergedResult) return [];
  const issues: any[] = [];

  for (const key of ['critical_issues', 'critical_blockers']) {
    if (Array.isArray(mergedResult[key])) {
      for (const item of mergedResult[key]) {
        issues.push({
          module: selectTruthyValue(() => (selectTruthyValue(() => (item.module), () => (item.component))), () => (null)),
          location: selectTruthyValue(() => (item.location), () => (null)),
          description: selectTruthyValue(() => (selectTruthyValue(() => (item.description), () => (item.title))), () => ('review_issue_description_missing')),
          recommended_fix: selectTruthyValue(() => (selectTruthyValue(() => (item.recommended_fix), () => (item.fix))), () => (null)),
        });
      }
    }
  }

  return issues;
}

export function summarizeReviewFailReason(issues: any, mergedResult: any) {
  const descriptions = issueList(issues)
    .map((issue: any) => issue?.description)
    .filter(Boolean);

  if (descriptions.length > 0) {
    return descriptions.slice(0, 2).join('; ');
  }

  const blockers = Array.isArray(mergedResult?.critical_blockers) ? mergedResult.critical_blockers.length : 0;
  const critical = Array.isArray(mergedResult?.critical_issues) ? mergedResult.critical_issues.length : 0;
  if (blockers > 0) return `${blockers} blocking issue(s) found during review`;
  if (critical > 0) return `${critical} critical issue(s) found during review`;
  return 'Review returned FAIL';
}

export function buildReviewGateFindings(issues: any = []) {
  return issueList(issues).map((issue: any = {}, index: any) => ({
    code: `REVIEW_ISSUE_${index + 1}`,
    severity: 'error',
    message: selectDefinedValue(() => (selectDefinedValue(() => (issue.description), () => (issue.title))), () => (REVIEW_ISSUE_MESSAGE_MISSING)),
    category: 'review',
    target: selectTruthyValue(() => (selectTruthyValue(() => (issue.location), () => (issue.module))), () => (null)),
    retryable: false,
    environmentIssue: false,
    metadata: {
      recommended_fix: selectTruthyValue(() => (issue.recommended_fix), () => (null)),
    },
  }));
}

function validatePassIssueList(reviewResult: any, key: any) {
  if (!Object.prototype.hasOwnProperty.call(reviewResult, key)) return null;
  if (!Array.isArray(reviewResult[key])) {
    return `Review output status PASS requires ${key} to be an empty array when present`;
  }
  if (reviewResult[key].length > 0) {
    return `Review output status PASS contradicts ${key}: ${reviewResult[key].length} critical issue(s) declared`;
  }
  return null;
}

function validatePassEvidenceArray(reviewResult: any, key: any, { requireNonEmpty = false, requireEmpty = false }: any = {}) {
  if (!Array.isArray(reviewResult[key])) {
    return `Review output status PASS requires ${key} to be an array`;
  }
  if (requireNonEmpty && reviewResult[key].length === 0) {
    return `Review output status PASS requires ${key} to list at least one evidence item`;
  }
  if (requireEmpty && reviewResult[key].length > 0) {
    return `Review output status PASS contradicts ${key}: ${reviewResult[key].length} unresolved item(s) declared`;
  }
  return null;
}

function validatePassEvidenceContract(reviewResult: any) {
  for (const [key, policy] of [
    ['checked_contracts', { requireNonEmpty: true }],
    ['opened_artifacts', { requireNonEmpty: true }],
    ['failed_commands', { requireEmpty: true }],
    ['unverified_requirements', { requireEmpty: true }],
  ]) {
    const contractError = validatePassEvidenceArray(reviewResult, key, policy);
    if (contractError) return contractError;
  }
  return null;
}

function invalidPassResult(reviewResult: any, status: string, error: string) {
  return {
    ok: false,
    decision: 'invalid_contract',
    error,
    invalid_contract: true,
    mergedResult: reviewResult,
    normalizedStatus: status,
    displayStatus: reviewResult.status,
  };
}

function parsePassReviewResult(reviewResult: any, status: string) {
  for (const key of ['critical_issues', 'critical_blockers']) {
    const contractError = validatePassIssueList(reviewResult, key);
    if (contractError) return invalidPassResult(reviewResult, status, contractError);
  }
  const evidenceContractError = validatePassEvidenceContract(reviewResult);
  if (evidenceContractError) return invalidPassResult(reviewResult, status, evidenceContractError);
  return {
    ok: true,
    decision: 'pass',
    mergedResult: reviewResult,
    normalizedStatus: status,
    displayStatus: reviewResult.status,
  };
}

/**
 * Parse a raw Echo review output file into the same gate decision facts the runner used inline.
 * The runner still owns logging and filesystem paths; this helper only normalizes content.
 */
export function parseReviewOutputContent(content: any) {
  let reviewResult;
  try {
    reviewResult = JSON.parse(content);
  } catch (e: any) {
    return {
      ok: false,
      decision: 'invalid_contract',
      error: `Review output must be valid JSON: ${e.message}`,
      invalid_contract: true,
    };
  }

  if (selectTruthyValue(() => (selectTruthyValue(() => (!reviewResult), () => (typeof reviewResult !== 'object'))), () => (Array.isArray(reviewResult)))) {
    return {
      ok: false,
      decision: 'invalid_contract',
      error: 'Review output must be a JSON object',
      invalid_contract: true,
      mergedResult: reviewResult,
    };
  }

  const status = String(selectDefinedValue(() => (reviewResult.status), () => (''))).trim().toUpperCase();
  if (status === 'PASS') return parsePassReviewResult(reviewResult, status);
  if (status === 'FAIL') {
    return {
      ok: false,
      decision: 'fail',
      mergedResult: reviewResult,
      normalizedStatus: status,
      displayStatus: reviewResult.status,
    };
  }

  return {
    ok: false,
    decision: 'invalid_contract',
    error: status
      ? `Review output status must be PASS or FAIL, got '${reviewResult.status}'`
      : 'Review output missing required status',
    invalid_contract: true,
    mergedResult: reviewResult,
  };
}
