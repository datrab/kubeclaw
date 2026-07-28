import { LINT_POLICY_SCHEMA_VERSION } from './policy.js';
import { accumulateToolSummary, createToolSummary } from './tool-summary.js';
const LINT_REPORT_SCHEMA_VERSION = 'pipeline_lint_report.v6';
const TOOL_STATUSES = new Set(['ok', 'error', 'not_applicable']);
const FINDING_SEVERITIES = new Set(['info', 'warning', 'error']);
class LintReportContractError extends Error {
    code = 'LINT_REPORT_CONTRACT_INVALID';
    constructor(message) {
        super(message);
        this.name = 'LintReportContractError';
    }
}
function fail(path, message) {
    throw new LintReportContractError(`${path}: ${message}`);
}
function requireRecord(value, path) {
    if (!value || typeof value !== 'object')
        fail(path, 'required object');
    if (Array.isArray(value))
        fail(path, 'required object');
    return value;
}
function requireString(value, path) {
    if (typeof value !== 'string' || !value.trim())
        fail(path, 'required non-empty string');
}
function requireCount(value, path) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        fail(path, 'required non-negative safe integer');
}
function validateFinding(finding, path) {
    const value = requireRecord(finding, path);
    if (value.file !== null)
        requireString(value.file, `${path}.file`);
    if (!FINDING_SEVERITIES.has(value.severity))
        fail(`${path}.severity`, 'unknown severity');
    requireString(value.code, `${path}.code`);
    requireString(value.message, `${path}.message`);
    requireString(value.fingerprint, `${path}.fingerprint`);
    if (!/^[a-f0-9]{64}$/.test(value.fingerprint))
        fail(`${path}.fingerprint`, 'required lowercase SHA-256');
    if (value.baseline !== undefined) {
        const baseline = requireRecord(value.baseline, `${path}.baseline`);
        for (const field of ['owner', 'reason', 'created', 'expires', 'tracking', 'approved_by', 'approved_on'])
            requireString(baseline[field], `${path}.baseline.${field}`);
    }
    for (const coordinate of ['line', 'column']) {
        if (value[coordinate] !== null && value[coordinate] !== undefined) {
            if (!Number.isSafeInteger(value[coordinate]) || value[coordinate] < 1) {
                fail(`${path}.${coordinate}`, 'must be null or a positive integer');
            }
        }
    }
}
function validateToolPolicy(value, path, expected) {
    requireString(value.category, `${path}.category`);
    requireString(value.scope, `${path}.scope`);
    if (!['warning', 'error'].includes(value.blocking_severity))
        fail(`${path}.blocking_severity`, 'unknown severity');
    if (!['blocking', 'experimental'].includes(value.mode))
        fail(`${path}.mode`, 'unknown mode');
    if (!expected)
        return;
    for (const field of ['category', 'scope', 'blocking_severity', 'mode'])
        if (value[field] !== expected[field])
            fail(`${path}.${field}`, 'does not match configured tool policy');
}
function validateExperimentalResult(value, path, visibility) {
    if (!visibility.experimental)
        fail(`${path}.mode`, 'experimental tool cannot appear in normal output');
    const forbiddenTotal = value.errors + value.warnings + value.blocking_findings + value.baselined_findings;
    if (forbiddenTotal !== 0)
        fail(path, 'experimental findings cannot affect blocking or debt counts');
    if (value.experimental_findings < value.findings.length)
        fail(`${path}.experimental_findings`, 'cannot be lower than disclosed findings');
    if (value.findings.some((finding) => finding.baseline))
        fail(`${path}.findings`, 'experimental findings cannot carry suppressions');
}
function validateBlockingResult(value, path, visibility) {
    const errors = value.findings.filter((finding) => !finding.baseline && finding.severity === 'error').length;
    const warnings = value.findings.filter((finding) => !finding.baseline && finding.severity === 'warning').length;
    const baselined = value.findings.filter((finding) => finding.baseline).length;
    if (errors > value.errors)
        fail(`${path}.errors`, `cannot be lower than ${errors} reported findings`);
    if (warnings > value.warnings)
        fail(`${path}.warnings`, `cannot be lower than ${warnings} reported findings`);
    if (baselined > value.baselined_findings)
        fail(`${path}.baselined_findings`, `cannot be lower than ${baselined} disclosed debt findings`);
    validateDebtVisibility(value, path, visibility, baselined);
    if (value.experimental_findings !== 0)
        fail(`${path}.experimental_findings`, 'blocking tool cannot report experimental findings');
    const blocking = value.blocking_severity === 'warning' ? value.errors + value.warnings : value.errors;
    if (value.blocking_findings !== blocking)
        fail(`${path}.blocking_findings`, `expected ${blocking} from findings`);
}
function validateDebtVisibility(value, path, visibility, disclosed) {
    if (visibility.debt && value.baselined_findings !== disclosed)
        fail(`${path}.baselined_findings`, `expected all ${value.baselined_findings} debt findings when debt visibility is enabled`);
    if (!visibility.debt && disclosed !== 0)
        fail(`${path}.findings`, 'normal output must not contain debt findings');
}
function validateOkToolResult(value, path, toolPolicies, visibility) {
    for (const field of ['errors', 'warnings', 'blocking_findings', 'baselined_findings', 'experimental_findings'])
        requireCount(value[field], `${path}.${field}`);
    if (!Array.isArray(value.findings))
        fail(`${path}.findings`, 'required array');
    validateToolPolicy(value, path, expectedToolPolicy(path, toolPolicies));
    value.findings.forEach((finding, index) => validateFinding(finding, `${path}.findings[${index}]`));
    if (value.mode === 'experimental')
        validateExperimentalResult(value, path, visibility);
    else
        validateBlockingResult(value, path, visibility);
}
function validateToolResult(result, path, toolPolicies, visibility) {
    const value = requireRecord(result, path);
    if (!TOOL_STATUSES.has(value.status))
        fail(`${path}.status`, 'unknown status');
    requireCount(value.duration_ms, `${path}.duration_ms`);
    if (value.status === 'ok')
        validateOkToolResult(value, path, toolPolicies, visibility);
    else if (value.status === 'error') {
        requireString(value.code, `${path}.code`);
        requireString(value.error, `${path}.error`);
    }
    else
        requireString(value.reason, `${path}.reason`);
}
function expectedToolPolicy(path, policies) {
    const toolId = path.split('.').at(-1);
    return toolId && policies[toolId] ? policies[toolId] : null;
}
function validatePolicyEvidence(value, expected) {
    const policy = requireRecord(value.policy, 'report.policy');
    if (policy.schema_version !== LINT_POLICY_SCHEMA_VERSION)
        fail('report.policy.schema_version', `expected ${LINT_POLICY_SCHEMA_VERSION}`);
    for (const field of ['digest', 'baseline_digest', 'project'])
        requireString(policy[field], `report.policy.${field}`);
    const configDigests = requireRecord(policy.config_digests, 'report.policy.config_digests');
    for (const [toolId, digest] of Object.entries(configDigests)) {
        requireString(toolId, 'report.policy.config_digests key');
        requireString(digest, `report.policy.config_digests.${toolId}`);
    }
    const effectiveTargets = requireRecord(policy.effective_targets, 'report.policy.effective_targets');
    for (const [toolId, targets] of Object.entries(effectiveTargets)) {
        requireString(toolId, 'report.policy.effective_targets key');
        if (!Array.isArray(targets) || targets.length === 0)
            fail(`report.policy.effective_targets.${toolId}`, 'required non-empty array');
        targets.forEach((target, index) => requireString(target, `report.policy.effective_targets.${toolId}[${index}]`));
    }
    validateExpectedPolicy(policy, configDigests, expected);
    return policy;
}
function validateExpectedPolicy(policy, configDigests, expected) {
    if (expected.policyProject !== undefined && policy.project !== expected.policyProject)
        fail('report.policy.project', `expected configured project ${expected.policyProject}`);
    if (expected.policyDigest !== undefined && policy.digest !== expected.policyDigest)
        fail('report.policy.digest', 'does not match configured policy');
    if (expected.baselineDigest !== undefined && policy.baseline_digest !== expected.baselineDigest)
        fail('report.policy.baseline_digest', 'does not match configured baseline');
    if (expected.configDigests !== undefined)
        validateConfigDigests(configDigests, expected.configDigests);
}
function validateConfigDigests(actual, expected) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys))
        fail('report.policy.config_digests', 'keys do not match configured native configs');
    for (const toolId of expectedKeys)
        if (actual[toolId] !== expected[toolId])
            fail(`report.policy.config_digests.${toolId}`, 'does not match configured native config');
}
function validateReportScope(value, expected) {
    for (const field of ['project', 'scope', 'timestamp', 'tier'])
        requireString(value[field], `report.${field}`);
    validateExpectedScope(value, expected);
    const visibility = requireRecord(value.visibility, 'report.visibility');
    for (const field of ['debt', 'experimental'])
        if (typeof visibility[field] !== 'boolean')
            fail(`report.visibility.${field}`, 'required boolean');
    if (expected.visibility !== undefined && JSON.stringify(visibility) !== JSON.stringify(expected.visibility))
        fail('report.visibility', 'does not match requested visibility');
    validateReportLists(value, expected);
    return visibility;
}
function validateExpectedScope(value, expected) {
    if (expected.tier !== undefined && value.tier !== expected.tier)
        fail('report.tier', `expected requested tier ${expected.tier}`);
    if (expected.scope !== undefined && value.scope !== expected.scope)
        fail('report.scope', `expected requested scope ${expected.scope}`);
}
function validateReportLists(value, expected) {
    if (!Array.isArray(value.changed_files))
        fail('report.changed_files', 'required array');
    value.changed_files.forEach((file, index) => requireString(file, `report.changed_files[${index}]`));
    if (expected.changedFiles !== undefined && JSON.stringify(value.changed_files) !== JSON.stringify(expected.changedFiles))
        fail('report.changed_files', 'does not match requested changed-file scope');
    if (!Array.isArray(value.detected_types))
        fail('report.detected_types', 'required array');
    if (!Array.isArray(value.diagnostics))
        fail('report.diagnostics', 'required array');
}
function validateToolInventory(tools, expectedIds) {
    if (expectedIds === undefined)
        return;
    const actual = Object.keys(tools).sort();
    const expected = [...expectedIds].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        fail('report.tools', `expected exact tool inventory: ${expected.join(', ') || '<empty>'}`);
}
function reportSummary(tools, expected, visibility) {
    const summary = createToolSummary();
    for (const [toolId, result] of Object.entries(tools)) {
        requireString(toolId, 'report.tools key');
        validateToolResult(result, `report.tools.${toolId}`, expected.toolPolicies || {}, visibility);
        accumulateToolSummary(summary, result);
    }
    return summary;
}
function validateSummary(value, expected) {
    const summary = requireRecord(value, 'report.summary');
    for (const [field, count] of Object.entries(expected)) {
        requireCount(summary[field], `report.summary.${field}`);
        if (summary[field] !== count)
            fail(`report.summary.${field}`, `expected ${count} from tool results`);
    }
}
function validateLintReport(report, expected = {}) {
    const value = requireRecord(report, 'report');
    if (value.schema_version !== LINT_REPORT_SCHEMA_VERSION)
        fail('report.schema_version', `expected ${LINT_REPORT_SCHEMA_VERSION}`);
    validatePolicyEvidence(value, expected);
    const visibility = validateReportScope(value, expected);
    const tools = requireRecord(value.tools, 'report.tools');
    validateToolInventory(tools, expected.toolIds);
    validateSummary(value.summary, reportSummary(tools, expected, visibility));
    return value;
}
export { LINT_REPORT_SCHEMA_VERSION, validateLintReport };
