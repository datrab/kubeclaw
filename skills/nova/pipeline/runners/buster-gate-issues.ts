import { cloneSerializable } from '../services/contracts/gate-control-result.ts';

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

function firstPresent(...values: any[]) {
  for (const value of values) if (value !== undefined && value !== null && value !== '') return value;
  return null;
}

export function buildBusterIssueFindings(issues: any = []) {
  return arrayValue(issues).map((issue: any, index: number) => {
    const record = objectRecord(issue);
    return {
      code: `BUSTER_ISSUE_${index + 1}`,
      severity: record.severity === 'critical' ? 'critical' : 'error',
      message: firstPresent(record.title, record.description, 'Buster gate issue'),
      category: 'buster_gate',
      target: firstPresent(arrayValue(record.affected_files)[0], record.affected_module),
      retryable: false,
      environmentIssue: false,
      metadata: {
        description: record.description ?? null,
        severity: record.severity ?? null,
        reproduction: record.reproduction ?? null,
        affected_files: cloneSerializable(arrayValue(record.affected_files)),
      },
    };
  });
}

export function extractGateIssues(gateResult: any) {
  if (!gateResult) return [];
  if (Array.isArray(gateResult.issues)) return normalizeDirectIssues(gateResult.issues);
  const suiteIssues = extractSuiteIssues(gateResult.verdict?.suites);
  if (suiteIssues.length > 0) return suiteIssues;
  const reason = firstPresent(gateResult.reason, gateResult.summary, 'Gate test failed without details');
  return [{ title: 'Gate test failure', description: reason, severity: 'error', affected_files: [] }];
}

function normalizeDirectIssues(issues: any[]) {
  return issues.filter((issue) => ['critical', 'moderate', undefined, null, ''].includes(issue.severity)).map((issue) => ({
    title: issue.title ?? 'buster_issue_title_missing',
    description: issue.description ?? '',
    affected_module: issue.affected_module ?? null,
    affected_files: arrayValue(issue.affected_files),
    severity: issue.severity ?? 'error',
    reproduction: issue.reproduction ?? null,
  }));
}

function extractSuiteIssues(suites: any) {
  if (!suites || typeof suites !== 'object') return [];
  return Object.entries(suites).flatMap(([name, suite]) => busterSuiteIssues(name, suite));
}

function busterSuiteIssues(suiteName: string, rawSuite: any) {
  const suite = objectRecord(rawSuite);
  if (!['FAIL', 'ERROR'].includes(suite.status)) return [];
  if (arrayValue(suite.findings).length > 0) return arrayValue(suite.findings).slice(0, 5).map((finding) => ({
    title: `${suiteName}: ${finding.message ?? 'test failure'}`,
    description: finding.rule ? `Rule: ${finding.rule}` : '',
    severity: finding.severity ?? 'critical',
    affected_files: finding.file ? [finding.file] : [],
  }));
  return [{ title: `${suiteName}: ${firstPresent(suite.error, suite.reason, 'failed')}`, description: `Suite ${suiteName} ${suite.status} with ${suite.checks_failed ?? 0} check(s) failed`, severity: suite.critical ? 'critical' : 'moderate', affected_files: [] }];
}
