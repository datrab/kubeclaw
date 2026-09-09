import type { ProviderResultV1, ReportAdapterResultV1 } from '@kubeclaw/pipeline-test-gate-contract';

/** Finalize actual adapted JUnit reports without inventing a failed test for missing execution. */
export function finalizeDirectCommandReports(
  providerValue: ProviderResultV1,
  reports: readonly ReportAdapterResultV1[],
  requireExecutedCase: boolean,
): ProviderResultV1 {
  const reportCounts = reports.reduce((counts, report) => ({
    total: counts.total + report.counts.total,
    passed: counts.passed + report.counts.passed,
    failed: counts.failed + report.counts.failed,
    skipped: counts.skipped + report.counts.skipped,
    errored: counts.errored + report.counts.errored,
  }), { total: 0, passed: 0, failed: 0, skipped: 0, errored: 0 });
  if (reportCounts.total === 0) throw new Error('TEST_REPORT_ZERO_CASES');
  const reportFailed = reportCounts.failed + reportCounts.errored;
  const missingExecution = requireExecutedCase && reportCounts.passed + reportFailed === 0;
  const commandFailed = providerValue.outcome === 'failed';
  const commandFailureChecks = commandFailed && reportFailed === 0 ? 1 : 0;
  const finalizedProvider: ProviderResultV1 = {
    ...providerValue,
    outcome: missingExecution || commandFailed || reportFailed > 0 ? 'failed' : 'passed',
    counts: {
      total: reportCounts.total + commandFailureChecks,
      passed: reportCounts.passed,
      failed: reportFailed + commandFailureChecks,
      skipped: reportCounts.skipped,
    },
    findings: [...providerValue.findings, ...reports.flatMap((report) => report.findings)],
    summary: missingExecution
      ? `TEST_REPORT_NO_EXECUTED_CASES: ${reportCounts.skipped} JUnit case(s) skipped; at least one executed case is required.`
      : providerValue.outcome === 'failed'
        ? providerValue.summary
        : reportFailed > 0
          ? `${reportFailed} JUnit case(s) failed or errored.`
          : `${reportCounts.passed} JUnit case(s) passed; ${reportCounts.skipped} skipped.`,
  };
  return finalizedProvider;
}
