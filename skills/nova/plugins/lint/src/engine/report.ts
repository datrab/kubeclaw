import path from 'path';

import { commandExists } from './execution.ts';
import { log } from './output.ts';
import { LINT_REPORT_SCHEMA_VERSION } from './report-contract.ts';
import { policyIncludesFile } from './policy.ts';
import { normalizeFindings } from './finding-fingerprints.ts';
import { accumulateToolSummary, createToolSummary } from './tool-summary.ts';

import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.ts';
const FULL_REPORT_SCOPE = 'full';
const NO_OUTPUT_CAPTURED = 'no output captured';

function resultCount(value: any) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function resultFindings(value: any) {
  return Array.isArray(value) ? value : [];
}

function changedFiles(ctx: any) {
  return Array.isArray(ctx.changedFiles) ? ctx.changedFiles : [];
}

function reportTargetFile(ctx: any, file: any = null) {
  if (file) return file;
  return ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
}

function toolBinaryName(tool: any) {
  return selectDefinedValue(() => (tool.binary), () => (tool.id));
}

function reportProjectName(ctx: any) {
  return selectDefinedValue(() => (ctx.project), () => (path.basename(ctx.repoRoot)));
}

class LintToolExecutionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LintToolExecutionError';
    this.code = code;
  }
}

function failConfigMissing(code: string, message: string): never {
  throw new LintToolExecutionError(code, message);
}

function failParse(ctx: any, toolId: any, parsed: any, result: any, file: any = null): never {
  const targetFile = reportTargetFile(ctx, file);
  const output = selectDefinedValue(() => ([result.stdout, result.stderr].find((value: any) => typeof value === 'string' && value.trim())?.trim()), () => (''));
  const preview = output ? output.split('\n')[0].slice(0, 200) : NO_OUTPUT_CAPTURED;
  const message = `${toolId} output could not be parsed. parseError=${parsed.error}; exitCode=${result.exitCode}; preview=${preview}`;
  log('WARN', message, { file: targetFile });
  throw new LintToolExecutionError(`${toolId}-parse-failed`, message);
}

function notApplicable(reason: any) {
  return { status: 'not_applicable', reason };
}

function toolAuthorityFiles(ctx: any, tool: any) {
  const absolutePaths = [tool.config_path, ctx.policy.baseline?.path, ctx.policyPath];
  return absolutePaths
    .filter(Boolean)
    .map((file: any) => path.relative(ctx.repoRoot, path.resolve(file)).split(path.sep).join('/'))
    .filter((file: any) => !file.startsWith('../'));
}

function toolContext(ctx: any, tool: any) {
  const projectRoot = ctx.policyProject.root === '.' ? null : ctx.policyProject.root;
  if (tool.scope === 'repository') return { ...ctx, modulePath: null, changedFiles: [], changedFilesRequested: false, tool };
  if (tool.scope === 'project') return { ...ctx, modulePath: projectRoot, changedFiles: [], changedFilesRequested: false, tool };
  const authorityFiles = toolAuthorityFiles(ctx, tool);
  const configChanged = changedFiles(ctx).some((file: any) => authorityFiles.includes(file.split(path.sep).join('/').replace(/^\.\//, '')));
  if (configChanged) return { ...ctx, modulePath: projectRoot, changedFiles: [], changedFilesRequested: false, tool };
  const normalizedProjectRoot = ctx.policyProject.root === '.' ? '' : ctx.policyProject.root.replace(/\/$/, '');
  const scopedChangedFiles = changedFiles(ctx).filter((file: any) => {
    const normalized = file.split(path.sep).join('/').replace(/^\.\//, '');
    if (normalizedProjectRoot && normalized !== normalizedProjectRoot && !normalized.startsWith(`${normalizedProjectRoot}/`)) return false;
    const projectRelative = normalizedProjectRoot ? normalized.slice(normalizedProjectRoot.length).replace(/^\//, '') : normalized;
    const scopeTool = tool.scope === 'affected-projects' ? { ...tool, targets: ['.'] } : tool;
    if (policyIncludesFile(projectRelative, scopeTool, ctx.policy.global_exclusions)) return true;
    if (tool.scope !== 'affected-projects') return false;
    const authorityFile = tool.targets.some((target: any) => target !== '.' && target.replace(/^\.\//, '') === projectRelative);
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

function blockingFindingCount(result: any, threshold: any) {
  const errors = resultCount(result.errors);
  return threshold === 'warning' ? errors + resultCount(result.warnings) : errors;
}

function missingBinaryResult(tool: any, binaryName: any) {
  if (tool.required === false) return { status: 'not_applicable', reason: `${binaryName} not found in PATH`, duration_ms: 0 };
  return { status: 'error', code: 'lint-tool-binary-missing', error: `${binaryName} not found in PATH`, duration_ms: 0 };
}

function successfulResult(ctx: any, tool: any, result: any, findings: any, durationMs: any) {
  const common = { status: 'ok', category: tool.category, scope: tool.scope, blocking_severity: tool.blocking_severity, mode: tool.mode, duration_ms: durationMs };
  if (tool.mode === 'experimental') {
    return { ...common, errors: 0, warnings: 0, blocking_findings: 0, baselined_findings: 0, experimental_findings: Math.max(findings.length, resultCount(result.errors) + resultCount(result.warnings)), findings };
  }
  const active = findings.filter((finding: any) => !finding.baseline);
  const baselinedErrors = findings.filter((finding: any) => finding.baseline && finding.severity === 'error').length;
  const baselinedWarnings = findings.filter((finding: any) => finding.baseline && finding.severity === 'warning').length;
  const errors = Math.max(0, resultCount(result.errors) - baselinedErrors);
  const warnings = Math.max(0, resultCount(result.warnings) - baselinedWarnings);
  return { ...common, errors, warnings, blocking_findings: blockingFindingCount({ errors, warnings }, tool.blocking_severity), baselined_findings: findings.length - active.length, experimental_findings: 0, findings: ctx.includeDebt === true ? findings : active };
}

function executionError(tool: any, error: any, startTime: any) {
  log('WARN', `Tool ${tool.id} failed: ${error.message}`);
  return { status: 'error', code: typeof error?.code === 'string' ? error.code : 'lint-tool-execution-failed', error: error.message, duration_ms: Date.now() - startTime };
}

/**
 * Run a single tool with full error handling.
 * Returns a standardized result object for the report.
 */
async function runTool(tool: any, ctx: any) {
  const startTime = Date.now();

  const scopedContext = toolContext(ctx, tool);
  if (tool.scope === 'changed-files' && scopedContext.changedFilesRequested && scopedContext.changedFiles.length === 0) {
    return { status: 'not_applicable', reason: 'No requested changed files match the configured tool scope.', duration_ms: Date.now() - startTime };
  }

  // Check if the tool binary exists
  const binaryName = toolBinaryName(tool);
  if (!commandExists(binaryName)) return missingBinaryResult(tool, binaryName);

  try {
    const result = await tool.run(scopedContext);
    const durationMs = Date.now() - startTime;

    if (result?.status === 'not_applicable') {
      return { ...result, duration_ms: durationMs };
    }

    const findings = normalizeFindings(scopedContext, tool.id, resultFindings(result.findings));
    return successfulResult(ctx, tool, result, findings, durationMs);
  } catch (e: any) {
    return executionError(tool, e, startTime);
  }
}

function applicableTools(ctx: any, toolRegistry: any) {
  const tiers = ['pre-check', 'full'];
  const tierIndex = tiers.indexOf(ctx.tier);
  return toolRegistry.filter((tool: any) => tiers.indexOf(tool.tier) <= tierIndex)
    .filter((tool: any) => tool.mode === 'blocking' || ctx.includeExperimental === true)
    .filter((tool: any) => tool.detect(ctx));
}

function logToolResult(tool: any, result: any) {
  if (result.status === 'ok') log('OK', `${tool.name}: ${result.errors} errors, ${result.warnings} warnings (${result.duration_ms}ms)`);
  else if (result.status === 'not_applicable') log('INFO', `${tool.name}: not applicable — ${result.reason}`);
  else log('WARN', `${tool.name}: error — ${result.error}`);
}

async function executeTools(ctx: any, applicable: any) {
  const results: any = {};
  for (const tool of applicable) {
    log('STEP', `Running: ${tool.name}`);
    results[tool.id] = await runTool(tool, ctx);
    logToolResult(tool, results[tool.id]);
  }
  return results;
}

function summarizeTools(results: any) {
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
async function runAllTools(ctx: any, toolRegistry: any) {
  const applicable = applicableTools(ctx, toolRegistry);
  log('INFO', `Running ${applicable.length} tools (tier: ${ctx.tier})`, { tools: applicable.map((tool: any) => tool.id) });
  const toolResults = await executeTools(ctx, applicable);

  return {
    schema_version: LINT_REPORT_SCHEMA_VERSION,
    policy: {
      schema_version: ctx.policy.schema_version,
      digest: ctx.policyDigest,
      project: ctx.policyProject.id,
      config_digests: ctx.policy.config_digests,
      effective_targets: Object.fromEntries(
        (ctx.policy.tools || applicable).map((tool: any) => [
          tool.id,
          Array.isArray(tool.targets) && tool.targets.length > 0 ? tool.targets : ['.'],
        ]),
      ),
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

export {
  failConfigMissing,
  failParse,
  notApplicable,
  runAllTools,
};
