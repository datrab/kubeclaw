export function createToolSummary() {
    return {
        total_errors: 0,
        total_warnings: 0,
        total_blocking: 0,
        total_baselined: 0,
        total_experimental: 0,
        tools_ok: 0,
        tools_not_applicable: 0,
        tools_failed: 0,
    };
}
export function accumulateToolSummary(summary, result) {
    if (result.status === 'not_applicable')
        summary.tools_not_applicable++;
    else if (result.status !== 'ok')
        summary.tools_failed++;
    else {
        summary.tools_ok++;
        summary.total_errors += result.errors;
        summary.total_warnings += result.warnings;
        summary.total_blocking += result.blocking_findings;
        summary.total_baselined += result.baselined_findings;
        summary.total_experimental += result.experimental_findings;
    }
    return summary;
}
