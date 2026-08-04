export interface ArchitectureOutput {
  readonly verdict: 'passed' | 'blocked';
  readonly summary: string;
  readonly findings: readonly ArchitectureFinding[];
  readonly checkedFiles: readonly string[];
}

interface ArchitectureFinding {
  readonly id: string;
  readonly severity: 'blocking' | 'error' | 'warn' | 'info';
  readonly scope: 'domain_model' | 'integration_boundary';
  readonly paths: readonly string[];
  readonly explanation: string;
  readonly remediation: string;
}

function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) throw new Error(`${label} entries must be non-empty strings`);
    return entry.trim();
  });
}

function nonEmpty(value: unknown, label: string, max = 8192): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\0\r]/u.test(value)) {
    throw new Error(`${label} must be a non-empty safe string`);
  }
  return value.trim();
}

function findings(value: unknown): readonly ArchitectureFinding[] {
  if (!Array.isArray(value)) throw new Error('findings must be an array');
  if (value.length > 128) throw new Error('findings exceeds the maximum item count');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`findings[${index}] must be an object`);
    }
    const finding = entry as Record<string, unknown>;
    const allowed = new Set(['id', 'severity', 'scope', 'paths', 'explanation', 'remediation']);
    for (const key of Object.keys(finding)) {
      if (!allowed.has(key)) throw new Error(`findings[${index}] contains unknown field: ${key}`);
    }
    if (!['blocking', 'error', 'warn', 'info'].includes(String(finding.severity))) {
      throw new Error(`findings[${index}] severity is invalid`);
    }
    if (!['domain_model', 'integration_boundary'].includes(String(finding.scope))) {
      throw new Error(`findings[${index}] scope is invalid`);
    }
    return {
      id: nonEmpty(finding.id, `findings[${index}].id`, 256),
      severity: finding.severity as ArchitectureFinding['severity'],
      scope: finding.scope as ArchitectureFinding['scope'],
      paths: strings(finding.paths, `findings[${index}].paths`),
      explanation: nonEmpty(finding.explanation, `findings[${index}].explanation`),
      remediation: nonEmpty(finding.remediation, `findings[${index}].remediation`),
    };
  });
}

export function parseArchitectureOutput(response: Readonly<Record<string, unknown>>): ArchitectureOutput {
  const raw = response.result;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('architecture response result must be an object');
  const value = raw as Record<string, unknown>;
  const allowed = new Set(['verdict', 'summary', 'findings', 'checkedFiles']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`architecture response contains unknown field: ${key}`);
  if (!['passed', 'blocked'].includes(String(value.verdict))) throw new Error('architecture verdict is invalid');
  if (typeof value.summary !== 'string' || !value.summary.trim()) throw new Error('architecture summary is required');
  const output: ArchitectureOutput = {
    verdict: value.verdict as ArchitectureOutput['verdict'],
    summary: value.summary.trim(),
    findings: findings(value.findings),
    checkedFiles: strings(value.checkedFiles, 'checkedFiles'),
  };
  if (output.verdict === 'passed' && output.checkedFiles.length === 0) throw new Error('passed verdict requires checked files');
  if (output.verdict === 'passed' && output.findings.some((finding) => finding.severity === 'blocking')) {
    throw new Error('passed verdict contradicts blocking findings');
  }
  if (output.verdict === 'blocked' && !output.findings.some((finding) => finding.severity === 'blocking')) {
    throw new Error('blocked verdict requires a blocking finding');
  }
  return output;
}
