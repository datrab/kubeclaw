import path from 'path';
import { commandExists } from './execution.js';
import { log } from './output.js';
import { LINT_REPORT_SCHEMA_VERSION } from './report-contract.js';
import { policyIncludesFile } from './policy.js';
import { normalizeFindings } from './finding-fingerprints.js';
import { accumulateToolSummary, createToolSummary } from './tool-summary.js';
import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.js';
const FULL_REPORT_SCOPE = 'full';
const NO_OUTPUT_CAPTURED = 'no output captured';
function resultCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function resultFindings(value) {
    return Array.isArray(value) ? value : [];
}
function changedFiles(ctx) {
    return Array.isArray(ctx.changedFiles) ? ctx.changedFiles : [];
}
function reportTargetFile(ctx, file = null) {
    if (file)
        return file;
    return ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
}
function toolBinaryName(tool) {
    return selectDefinedValue(() => (tool.binary), () => (tool.id));
}
function reportProjectName(ctx) {
    return selectDefinedValue(() => (ctx.project), () => (path.basename(ctx.repoRoot)));
}
class LintToolExecutionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'LintToolExecutionError';
        this.code = code;
    }
}
function failConfigMissing(code, message) {
    throw new LintToolExecutionError(code, message);
}
function failParse(ctx, toolId, parsed, result, file = null) {
    const targetFile = reportTargetFile(ctx, file);
    const output = selectDefinedValue(() => ([result.stdout, result.stderr].find((value) => typeof value === 'string' && value.trim())?.trim()), () => (''));
    const preview = output ? output.split('\n')[0].slice(0, 200) : NO_OUTPUT_CAPTURED;
    const message = `${toolId} output could not be parsed. parseError=${parsed.error}; exitCode=${result.exitCode}; preview=${preview}`;
    log('WARN', message, { file: targetFile });
    throw new LintToolExecutionError(`${toolId}-parse-failed`, message);
}
function notApplicable(reason) {
    return { status: 'not_applicable', reason };
}
function toolAuthorityFiles(ctx, tool) {
    const absolutePaths = [tool.config_path, ctx.policy.baseline?.path, ctx.policyPath];
    return absolutePaths
        .filter(Boolean)
        .map((file) => path.relative(ctx.repoRoot, path.resolve(file)).split(path.sep).join('/'))
        .filter((file) => !file.startsWith('../'));
}
function toolContext(ctx, tool) {
    const projectRoot = ctx.policyProject.root === '.' ? null : ctx.policyProject.root;
    if (tool.scope === 'repository')
        return { ...ctx, modulePath: null, changedFiles: [], changedFilesRequested: false, tool };
    if (tool.scope === 'project')
        return { ...ctx, modulePath: projectRoot, changedFiles: [], changedFilesRequested: false, tool };
    const authorityFiles = toolAuthorityFiles(ctx, tool);
    const configChanged = changedFiles(ctx).some((file) => authorityFiles.includes(file.split(path.sep).join('/').replace(/^\.\//, '')));
    if (configChanged)
        return { ...ctx, modulePath: projectRoot, changedFiles: [], changedFilesRequested: false, tool };
    const normalizedProjectRoot = ctx.policyProject.root === '.' ? '' : ctx.policyProject.root.replace(/\/$/, '');
    const scopedChangedFiles = changedFiles(ctx).filter((file) => {
        const normalized = file.split(path.sep).join('/').replace(/^\.\//, '');
        if (normalizedProjectRoot && normalized !== normalizedProjectRoot && !normalized.startsWith(`${normalizedProjectRoot}/`))
            return false;
        const projectRelative = normalizedProjectRoot ? normalized.slice(normalizedProjectRoot.length).replace(/^\//, '') : normalized;
        const scopeTool = tool.scope === 'affected-projects' ? { ...tool, targets: ['.'] } : tool;
        if (policyIncludesFile(projectRelative, scopeTool, ctx.policy.global_exclusions))
            return true;
        if (tool.scope !== 'affected-projects')
            return false;
        const authorityFile = tool.targets.some((target) => target !== '.' && target.replace(/^\.\//, '') === projectRelative);
        return authorityFile && policyIncludesFile(projectRelative, { ...scopeTool, include: ['**/*'] }, ctx.policy.global_exclusions);
    });
    if (tool.scope === 'affected-projects') {
        return { ...ctx, requestedModulePath: ctx.modulePath, modulePath: projectRoot, tool, changedFiles: scopedChangedFiles };
    }
    return {
        ...ctx,
        modulePath: projectRoot,
        tool,
        changedFiles: scopedChangedFiles,
    };
}
function blockingFindingCount(result, threshold) {
    const errors = resultCount(result.errors);
    return threshold === 'warning' ? errors + resultCount(result.warnings) : errors;
}
function missingBinaryResult(tool, binaryName) {
    if (tool.required === false)
        return { status: 'not_applicable', reason: `${binaryName} not found in PATH`, duration_ms: 0 };
    return { status: 'error', code: 'lint-tool-binary-missing', error: `${binaryName} not found in PATH`, duration_ms: 0 };
}
function successfulResult(ctx, tool, result, findings, durationMs) {
    const common = { status: 'ok', category: tool.category, scope: tool.scope, blocking_severity: tool.blocking_severity, mode: tool.mode, duration_ms: durationMs };
    if (tool.mode === 'experimental') {
        return { ...common, errors: 0, warnings: 0, blocking_findings: 0, baselined_findings: 0, experimental_findings: Math.max(findings.length, resultCount(result.errors) + resultCount(result.warnings)), findings };
    }
    const active = findings.filter((finding) => !finding.baseline);
    const baselinedErrors = findings.filter((finding) => finding.baseline && finding.severity === 'error').length;
    const baselinedWarnings = findings.filter((finding) => finding.baseline && finding.severity === 'warning').length;
    const errors = Math.max(0, resultCount(result.errors) - baselinedErrors);
    const warnings = Math.max(0, resultCount(result.warnings) - baselinedWarnings);
    return { ...common, errors, warnings, blocking_findings: blockingFindingCount({ errors, warnings }, tool.blocking_severity), baselined_findings: findings.length - active.length, experimental_findings: 0, findings: ctx.includeDebt === true ? findings : active };
}
function executionError(tool, error, startTime) {
    log('WARN', `Tool ${tool.id} failed: ${error.message}`);
    return { status: 'error', code: typeof error?.code === 'string' ? error.code : 'lint-tool-execution-failed', error: error.message, duration_ms: Date.now() - startTime };
}
/**
 * Run a single tool with full error handling.
 * Returns a standardized result object for the report.
 */
async function runTool(tool, ctx) {
    const startTime = Date.now();
    const scopedContext = toolContext(ctx, tool);
    if (tool.scope === 'changed-files' && scopedContext.changedFilesRequested && scopedContext.changedFiles.length === 0) {
        return { status: 'not_applicable', reason: 'No requested changed files match the configured tool scope.', duration_ms: Date.now() - startTime };
    }
    // Check if the tool binary exists
    const binaryName = toolBinaryName(tool);
    if (!commandExists(binaryName))
        return missingBinaryResult(tool, binaryName);
    try {
        const result = await tool.run(scopedContext);
        const durationMs = Date.now() - startTime;
        if (result?.status === 'not_applicable') {
            return { ...result, duration_ms: durationMs };
        }
        const findings = normalizeFindings(scopedContext, tool.id, resultFindings(result.findings));
        return successfulResult(ctx, tool, result, findings, durationMs);
    }
    catch (e) {
        return executionError(tool, e, startTime);
    }
}
function applicableTools(ctx, toolRegistry) {
    const tiers = ['pre-check', 'full'];
    const tierIndex = tiers.indexOf(ctx.tier);
    return toolRegistry.filter((tool) => tiers.indexOf(tool.tier) <= tierIndex)
        .filter((tool) => tool.mode === 'blocking' || ctx.includeExperimental === true)
        .filter((tool) => tool.detect(ctx));
}
function logToolResult(tool, result) {
    if (result.status === 'ok')
        log('OK', `${tool.name}: ${result.errors} errors, ${result.warnings} warnings (${result.duration_ms}ms)`);
    else if (result.status === 'not_applicable')
        log('INFO', `${tool.name}: not applicable — ${result.reason}`);
    else
        log('WARN', `${tool.name}: error — ${result.error}`);
}
async function executeTools(ctx, applicable) {
    const results = {};
    for (const tool of applicable) {
        log('STEP', `Running: ${tool.name}`);
        results[tool.id] = await runTool(tool, ctx);
        logToolResult(tool, results[tool.id]);
    }
    return results;
}
function summarizeTools(results) {
    const summary = createToolSummary();
    for (const result of Object.values(results)) {
        accumulateToolSummary(summary, result);
    }
    return summary;
}
/**
 * Run all applicable tools for the current context.
 * Returns the complete report object.
 */
async function runAllTools(ctx, toolRegistry) {
    const applicable = applicableTools(ctx, toolRegistry);
    log('INFO', `Running ${applicable.length} tools (tier: ${ctx.tier})`, { tools: applicable.map((tool) => tool.id) });
    const toolResults = await executeTools(ctx, applicable);
    return {
        schema_version: LINT_REPORT_SCHEMA_VERSION,
        policy: {
            schema_version: ctx.policy.schema_version,
            digest: ctx.policyDigest,
            project: ctx.policyProject.id,
            config_digests: ctx.policy.config_digests,
            effective_targets: Object.fromEntries((ctx.policy.tools || applicable).map((tool) => [
                tool.id,
                Array.isArray(tool.targets) && tool.targets.length > 0 ? tool.targets : ['.'],
            ])),
            baseline_digest: ctx.policy.baseline.digest,
        },
        project: reportProjectName(ctx),
        scope: selectDefinedValue(() => (ctx.modulePath), () => (FULL_REPORT_SCOPE)),
        timestamp: new Date().toISOString(),
        tier: ctx.tier,
        visibility: {
            debt: ctx.includeDebt === true,
            experimental: ctx.includeExperimental === true,
        },
        changed_files: changedFiles(ctx),
        detected_types: [...ctx.projectTypes],
        diagnostics: Array.isArray(ctx.diagnostics) ? ctx.diagnostics : [],
        tools: toolResults,
        summary: {
            ...summarizeTools(toolResults),
        },
    };
}
export { failConfigMissing, failParse, notApplicable, runAllTools, };
