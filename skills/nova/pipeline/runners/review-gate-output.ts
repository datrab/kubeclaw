// runners/review-gate-output.ts — pure review gate output parsing and diagnostics helpers
// Keep this module side-effect free: runner files own filesystem, telemetry, lifecycle, and Discord effects.

/**
 * Extract actionable issues from a review result for Forge to fix.
 */
export function extractReviewIssues(mergedResult) {
  if (!mergedResult) return [];
  const issues = [];

  for (const key of ['critical_issues', 'critical_blockers']) {
    if (Array.isArray(mergedResult[key])) {
      for (const item of mergedResult[key]) {
        issues.push({
          module: item.module || item.component || null,
          location: item.location || null,
          description: item.description || item.title || 'Unknown issue',
          recommended_fix: item.recommended_fix || item.fix || null,
        });
      }
    }
  }

  return issues;
}

export function summarizeReviewNoGoReason(issues, mergedResult) {
  const descriptions = (issues || [])
    .map((issue) => issue?.description)
    .filter(Boolean);

  if (descriptions.length > 0) {
    return descriptions.slice(0, 2).join('; ');
  }

  const blockers = Array.isArray(mergedResult?.critical_blockers) ? mergedResult.critical_blockers.length : 0;
  const critical = Array.isArray(mergedResult?.critical_issues) ? mergedResult.critical_issues.length : 0;
  if (blockers > 0) return `${blockers} blocking issue(s) found during review`;
  if (critical > 0) return `${critical} critical issue(s) found during review`;
  return 'Review returned NO-GO';
}

export function buildReviewGateFindings(issues = []) {
  return (issues || []).map((issue = {}, index) => ({
    code: `REVIEW_ISSUE_${index + 1}`,
    severity: 'error',
    message: issue.description || issue.title || 'Review issue',
    category: 'review',
    target: issue.location || issue.module || null,
    retryable: false,
    environmentIssue: false,
    metadata: {
      recommended_fix: issue.recommended_fix || null,
    },
  }));
}

function validateGoIssueList(reviewResult, key) {
  if (!Object.prototype.hasOwnProperty.call(reviewResult, key)) return null;
  if (!Array.isArray(reviewResult[key])) {
    return `Review output status GO requires ${key} to be an empty array when present`;
  }
  if (reviewResult[key].length > 0) {
    return `Review output status GO contradicts ${key}: ${reviewResult[key].length} critical issue(s) declared`;
  }
  return null;
}

/**
 * Parse a raw Echo review output file into the same gate decision facts the runner used inline.
 * The runner still owns logging and filesystem paths; this helper only normalizes content.
 */
export function parseReviewOutputContent(content) {
  let reviewResult;
  try {
    reviewResult = JSON.parse(content);
  } catch (e) {
    return {
      ok: false,
      decision: 'invalid_contract',
      error: `Review output must be valid JSON: ${e.message}`,
      invalid_contract: true,
    };
  }

  if (!reviewResult || typeof reviewResult !== 'object' || Array.isArray(reviewResult)) {
    return {
      ok: false,
      decision: 'invalid_contract',
      error: 'Review output must be a JSON object',
      invalid_contract: true,
      mergedResult: reviewResult,
    };
  }

  const status = String(reviewResult.status || '').trim().toUpperCase();
  if (status === 'GO') {
    for (const key of ['critical_issues', 'critical_blockers']) {
      const contractError = validateGoIssueList(reviewResult, key);
      if (contractError) {
        return {
          ok: false,
          decision: 'invalid_contract',
          error: contractError,
          invalid_contract: true,
          mergedResult: reviewResult,
          normalizedStatus: status,
          displayStatus: reviewResult.status,
        };
      }
    }
    return {
      ok: true,
      decision: 'go',
      mergedResult: reviewResult,
      normalizedStatus: status,
      displayStatus: reviewResult.status,
    };
  }
  if (status === 'NO-GO') {
    return {
      ok: false,
      decision: 'nogo',
      mergedResult: reviewResult,
      normalizedStatus: status,
      displayStatus: reviewResult.status,
    };
  }

  return {
    ok: false,
    decision: 'invalid_contract',
    error: status
      ? `Review output status must be GO or NO-GO, got '${reviewResult.status}'`
      : 'Review output missing required status',
    invalid_contract: true,
    mergedResult: reviewResult,
  };
}
