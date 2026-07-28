import { arrayValue, objectRecord, selectPresentValue } from '../value-boundary.ts';
import { selectTruthyValue } from '../optional-absence.ts';

const LINT_TOOL_ERROR_UNKNOWN = 'Unknown tool error';
const LINT_FINDING_FILE_MISSING = '?';

export function formatLintErrors(report: any) {
  const errorLines: string[] = [];
  for (const [toolId, toolResult] of Object.entries(report.tools) as [string, any][]) {
    if (selectTruthyValue(() => toolResult.status !== 'ok', () => toolResult.errors === 0)) continue;
    errorLines.push(`### ${toolId}: ${toolResult.errors} error(s)`);
    const errors = arrayValue(toolResult.findings).filter((finding: any) => finding.severity === 'error');
    for (const finding of errors.slice(0, 20)) {
      const location = finding.line ? `:${finding.line}` : '';
      errorLines.push(
        `- \`${selectPresentValue(finding.file, LINT_FINDING_FILE_MISSING)}${location}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`,
      );
    }
    if (errors.length > 20) errorLines.push(`- ... and ${errors.length - 20} more`);
    errorLines.push('');
  }
  return errorLines.join('\n');
}

export function formatLintToolFailures(report: any) {
  const failureLines: string[] = [];
  for (const [toolId, toolResult] of Object.entries(objectRecord(report.tools)) as [string, any][]) {
    if (toolResult.status !== 'error') continue;
    failureLines.push(`### ${toolId}: tool failed`);
    failureLines.push(`- ${selectPresentValue(toolResult.error, LINT_TOOL_ERROR_UNKNOWN)}`);
    failureLines.push('');
  }
  return failureLines.join('\n');
}

export function formatLintReportForReviewer(report: any) {
  const lines = [
    '## 📊 STATIC ANALYSIS REPORT (Automated)',
    '',
    `**Tier:** ${report.tier} | **Timestamp:** ${report.timestamp}`,
    `**Summary:** ${report.summary.total_errors} errors, ${report.summary.total_warnings} warnings`,
    `**Tools:** ${report.summary.tools_ok} passed, ${report.summary.tools_not_applicable} not applicable, ${report.summary.tools_failed} failed`,
    '',
  ];
  if (report.changed_files?.length > 0) {
    lines.push(`**Scoped to changed files:** ${report.changed_files.join(', ')}`, '');
  }
  for (const [toolId, toolResult] of Object.entries(report.tools) as [string, any][]) {
    if (toolResult.status === 'skipped') continue;
    if (toolResult.status === 'error') {
      lines.push(`### ❌ ${toolId} — TOOL ERROR`, `Error: ${toolResult.error}`, '');
      continue;
    }
    if (toolResult.errors === 0 && toolResult.warnings === 0) {
      lines.push(`### ✅ ${toolId} — clean`);
      continue;
    }
    lines.push(`### ${toolResult.errors > 0 ? '🔴' : '🟡'} ${toolId} — ${toolResult.errors} errors, ${toolResult.warnings} warnings`, '');
    const findings = arrayValue(toolResult.findings);
    for (const finding of findings.slice(0, 30)) {
      const location = finding.line ? `:${finding.line}` : '';
      const icon = finding.severity === 'error' ? '🔴' : '🟡';
      lines.push(`${icon} \`${selectPresentValue(finding.file, LINT_FINDING_FILE_MISSING)}${location}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`);
    }
    if (findings.length > 30) lines.push(`... and ${findings.length - 30} more findings`);
    lines.push('');
  }
  lines.push('---', '');
  return lines.join('\n');
}
