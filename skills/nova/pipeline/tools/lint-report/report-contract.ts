import { LINT_POLICY_SCHEMA_VERSION } from './policy.ts';

const LINT_REPORT_SCHEMA_VERSION = 'pipeline_lint_report.v5';
const TOOL_STATUSES = new Set(['ok', 'error', 'not_applicable']);
const FINDING_SEVERITIES = new Set(['info', 'warning', 'error']);
type AnyRecord = Record<string, any>;

class LintReportContractError extends Error {
  code = 'LINT_REPORT_CONTRACT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'LintReportContractError';
  }
}

function fail(path: string, message: string): never {
  throw new LintReportContractError(`${path}: ${message}`);
}

function requireRecord(value: unknown, path: string): AnyRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'required object');
  return value;
}

function requireString(value: unknown, path: string): void {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'required non-empty string');
}

function requireCount(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(path, 'required non-negative safe integer');
}

function validateFinding(finding: unknown, path: string): void {
  const value = requireRecord(finding, path);
  if (value.file !== null) requireString(value.file, `${path}.file`);
  if (!FINDING_SEVERITIES.has(value.severity)) fail(`${path}.severity`, 'unknown severity');
  requireString(value.code, `${path}.code`);
  requireString(value.message, `${path}.message`);
  requireString(value.fingerprint, `${path}.fingerprint`);
  if (!/^[a-f0-9]{64}$/.test(value.fingerprint)) fail(`${path}.fingerprint`, 'required lowercase SHA-256');
  if (value.baseline !== undefined) {
    const baseline = requireRecord(value.baseline, `${path}.baseline`);
    for (const field of ['owner', 'reason', 'expires', 'tracking']) requireString(baseline[field], `${path}.baseline.${field}`);
  }
  for (const coordinate of ['line', 'column']) {
    if (value[coordinate] !== null && value[coordinate] !== undefined) {
      if (!Number.isSafeInteger(value[coordinate]) || value[coordinate] < 1) {
        fail(`${path}.${coordinate}`, 'must be null or a positive integer');
      }
    }
  }
}

function validateToolResult(result: unknown, path: string, toolPolicies: AnyRecord): void {
  const value = requireRecord(result, path);
  if (!TOOL_STATUSES.has(value.status)) fail(`${path}.status`, 'unknown status');
  requireCount(value.duration_ms, `${path}.duration_ms`);

  if (value.status === 'ok') {
    requireCount(value.errors, `${path}.errors`);
    requireCount(value.warnings, `${path}.warnings`);
    if (!Array.isArray(value.findings)) fail(`${path}.findings`, 'required array');
    requireCount(value.blocking_findings, `${path}.blocking_findings`);
    requireCount(value.baselined_findings, `${path}.baselined_findings`);
    requireString(value.category, `${path}.category`);
    requireString(value.scope, `${path}.scope`);
    if (!['warning', 'error'].includes(value.blocking_severity)) fail(`${path}.blocking_severity`, 'unknown severity');
    const expectedTool = expectedToolPolicy(path, toolPolicies);
    if (expectedTool) {
      for (const field of ['category', 'scope', 'blocking_severity']) if (value[field] !== expectedTool[field]) fail(`${path}.${field}`, 'does not match configured tool policy');
    }
    value.findings.forEach((finding, index) => validateFinding(finding, `${path}.findings[${index}]`));
    const errors = value.findings.filter(finding => !finding.baseline && finding.severity === 'error').length;
    const warnings = value.findings.filter(finding => !finding.baseline && finding.severity === 'warning').length;
    const baselined = value.findings.filter(finding => finding.baseline).length;
    if (errors > value.errors) fail(`${path}.errors`, `cannot be lower than ${errors} reported findings`);
    if (warnings > value.warnings) fail(`${path}.warnings`, `cannot be lower than ${warnings} reported findings`);
    if (value.baselined_findings !== baselined) fail(`${path}.baselined_findings`, `expected ${baselined} from findings`);
    const blocking = value.blocking_severity === 'warning' ? value.errors + value.warnings : value.errors;
    if (value.blocking_findings !== blocking) fail(`${path}.blocking_findings`, `expected ${blocking} from findings`);
    return;
  }

  if (value.status === 'error') {
    requireString(value.code, `${path}.code`);
    requireString(value.error, `${path}.error`);
    return;
  }

  requireString(value.reason, `${path}.reason`);
}

function expectedToolPolicy(path: string, policies: AnyRecord): AnyRecord | null {
  const toolId = path.split('.').at(-1);
  return toolId && policies[toolId] ? policies[toolId] : null;
}

function validateLintReport(report: unknown, expected: AnyRecord = {}): AnyRecord {
  const value = requireRecord(report, 'report');
  if (value.schema_version !== LINT_REPORT_SCHEMA_VERSION) {
    fail('report.schema_version', `expected ${LINT_REPORT_SCHEMA_VERSION}`);
  }
  requireString(value.project, 'report.project');
  const policy = requireRecord(value.policy, 'report.policy');
  if (policy.schema_version !== LINT_POLICY_SCHEMA_VERSION) fail('report.policy.schema_version', `expected ${LINT_POLICY_SCHEMA_VERSION}`);
  requireString(policy.digest, 'report.policy.digest');
  requireString(policy.baseline_digest, 'report.policy.baseline_digest');
  requireString(policy.project, 'report.policy.project');
  const configDigests = requireRecord(policy.config_digests, 'report.policy.config_digests');
  for (const [toolId, digest] of Object.entries(configDigests)) {
    requireString(toolId, 'report.policy.config_digests key');
    requireString(digest, `report.policy.config_digests.${toolId}`);
  }
  if (expected.tier !== undefined && value.tier !== expected.tier) fail('report.tier', `expected requested tier ${expected.tier}`);
  if (expected.policyProject !== undefined && policy.project !== expected.policyProject) fail('report.policy.project', `expected configured project ${expected.policyProject}`);
  if (expected.policyDigest !== undefined && policy.digest !== expected.policyDigest) fail('report.policy.digest', 'does not match configured policy');
  if (expected.baselineDigest !== undefined && policy.baseline_digest !== expected.baselineDigest) fail('report.policy.baseline_digest', 'does not match configured baseline');
  if (expected.configDigests !== undefined) {
    const actualKeys = Object.keys(configDigests).sort();
    const expectedKeys = Object.keys(expected.configDigests).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) fail('report.policy.config_digests', 'keys do not match configured native configs');
    for (const toolId of expectedKeys) if (configDigests[toolId] !== expected.configDigests[toolId]) fail(`report.policy.config_digests.${toolId}`, 'does not match configured native config');
  }
  requireString(value.scope, 'report.scope');
  if (expected.scope !== undefined && value.scope !== expected.scope) fail('report.scope', `expected requested scope ${expected.scope}`);
  requireString(value.timestamp, 'report.timestamp');
  requireString(value.tier, 'report.tier');
  if (!Array.isArray(value.changed_files)) fail('report.changed_files', 'required array');
  value.changed_files.forEach((file, index) => requireString(file, `report.changed_files[${index}]`));
  if (expected.changedFiles !== undefined && JSON.stringify(value.changed_files) !== JSON.stringify(expected.changedFiles)) {
    fail('report.changed_files', 'does not match requested changed-file scope');
  }
  if (!Array.isArray(value.detected_types)) fail('report.detected_types', 'required array');
  if (!Array.isArray(value.diagnostics)) fail('report.diagnostics', 'required array');

  const tools = requireRecord(value.tools, 'report.tools');
  if (expected.toolIds !== undefined) {
    const actualToolIds = Object.keys(tools).sort();
    const expectedToolIds = [...expected.toolIds].sort();
    if (JSON.stringify(actualToolIds) !== JSON.stringify(expectedToolIds)) fail('report.tools', `expected exact tool inventory: ${expectedToolIds.join(', ') || '<empty>'}`);
  }
  const summary = requireRecord(value.summary, 'report.summary');
  for (const field of ['total_errors', 'total_warnings', 'total_blocking', 'total_baselined', 'tools_ok', 'tools_not_applicable', 'tools_failed']) {
    requireCount(summary[field], `report.summary.${field}`);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let toolsOk = 0;
  let toolsNotApplicable = 0;
  let toolsFailed = 0;
  let totalBlocking = 0;
  let totalBaselined = 0;
  for (const [toolId, result] of Object.entries(tools)) {
    requireString(toolId, 'report.tools key');
    validateToolResult(result, `report.tools.${toolId}`, expected.toolPolicies || {});
    if (result.status === 'ok') {
      toolsOk++;
      totalErrors += result.errors;
      totalWarnings += result.warnings;
      totalBlocking += result.blocking_findings;
      totalBaselined += result.baselined_findings;
    } else if (result.status === 'not_applicable') {
      toolsNotApplicable++;
    } else {
      toolsFailed++;
    }
  }

  const expectedSummary = { total_errors: totalErrors, total_warnings: totalWarnings, total_blocking: totalBlocking, total_baselined: totalBaselined, tools_ok: toolsOk, tools_not_applicable: toolsNotApplicable, tools_failed: toolsFailed };
  for (const [field, count] of Object.entries(expectedSummary)) {
    if (summary[field] !== count) fail(`report.summary.${field}`, `expected ${count} from tool results`);
  }
  return value;
}

export { LINT_REPORT_SCHEMA_VERSION, LintReportContractError, validateLintReport };
