import path from 'path';

import { commandExists } from './execution.ts';
import { log } from './output.ts';
import { LINT_REPORT_SCHEMA_VERSION } from './report-contract.ts';
import { policyIncludesFile } from './policy.ts';
import { normalizeFindings } from './finding-fingerprints.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
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
  if (file) return file;
  return ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
}

function toolBinaryName(tool) {
  return selectDefinedValue(() => (tool.binary), () => (tool.id));
}

function reportProjectName(ctx) {
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

function failParse(ctx, toolId, parsed, result, file = null): never {
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

function toolContext(ctx, tool) {
  const projectRoot = ctx.policyProject.root === '.' ? null : ctx.policyProject.root;
  if (tool.scope === 'repository') return { ...ctx, modulePath: null, changedFiles: [], changedFilesRequested: false, tool };
  if (tool.scope === 'project') return { ...ctx, modulePath: projectRoot, changedFiles: [], changedFilesRequested: false, tool };
  const configRelative = tool.config_path
    ? path.relative(ctx.repoRoot, path.resolve(tool.config_path)).split(path.sep).join('/')
    : null;
  const baselineRelative = ctx.policy.baseline?.path
    ? path.relative(ctx.repoRoot, path.resolve(ctx.policy.baseline.path)).split(path.sep).join('/')
    : null;
  const authorityFiles = [configRelative, baselineRelative].filter(file => file && !file.startsWith('../'));
  const configChanged = changedFiles(ctx).some(file => authorityFiles.includes(file.split(path.sep).join('/').replace(/^\.\//, '')));
  if (configChanged) return { ...ctx, modulePath: projectRoot, changedFiles: [], changedFilesRequested: false, tool };
  const normalizedProjectRoot = ctx.policyProject.root === '.' ? '' : ctx.policyProject.root.replace(/\/$/, '');
  const scopedChangedFiles = changedFiles(ctx).filter((file) => {
    const normalized = file.split(path.sep).join('/').replace(/^\.\//, '');
    if (normalizedProjectRoot && normalized !== normalizedProjectRoot && !normalized.startsWith(`${normalizedProjectRoot}/`)) return false;
    const projectRelative = normalizedProjectRoot ? normalized.slice(normalizedProjectRoot.length).replace(/^\//, '') : normalized;
    const scopeTool = tool.scope === 'affected-projects' ? { ...tool, targets: ['.'] } : tool;
    if (policyIncludesFile(projectRelative, scopeTool, ctx.policy.global_exclusions)) return true;
    if (tool.scope !== 'affected-projects') return false;
    const authorityFile = tool.targets.some(target => target !== '.' && target.replace(/^\.\//, '') === projectRelative);
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
  if (!commandExists(binaryName)) {
    if (tool.required !== false) {
      return {
        status: 'error',
        code: 'lint-tool-binary-missing',
        error: `${binaryName} not found in PATH`,
        duration_ms: 0,
      };
    }
    return {
      status: 'not_applicable',
      reason: `${binaryName} not found in PATH`,
      duration_ms: 0,
    };
  }

  try {
    const result = await tool.run(scopedContext);
    const durationMs = Date.now() - startTime;

    if (result?.status === 'not_applicable') {
      return { ...result, duration_ms: durationMs };
    }

    const findings = normalizeFindings(scopedContext, tool.id, resultFindings(result.findings));
    const activeFindings = findings.filter(finding => !finding.baseline);
    const baselinedErrors = findings.filter(finding => finding.baseline && finding.severity === 'error').length;
    const baselinedWarnings = findings.filter(finding => finding.baseline && finding.severity === 'warning').length;
    const errors = Math.max(0, resultCount(result.errors) - baselinedErrors);
    const warnings = Math.max(0, resultCount(result.warnings) - baselinedWarnings);
    return {
      status: 'ok',
      errors,
      warnings,
      blocking_findings: blockingFindingCount({ errors, warnings }, tool.blocking_severity),
      baselined_findings: findings.length - activeFindings.length,
      category: tool.category,
      scope: tool.scope,
      blocking_severity: tool.blocking_severity,
      findings,
      duration_ms: durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    log('WARN', `Tool ${tool.id} failed: ${e.message}`);

    return {
      status: 'error',
      code: typeof e?.code === 'string' ? e.code : 'lint-tool-execution-failed',
      error: e.message,
      duration_ms: durationMs,
    };
  }
}

/**
 * Run all applicable tools for the current context.
 * Returns the complete report object.
 */
async function runAllTools(ctx, toolRegistry) {
  const tierOrder = ['pre-check', 'full'];
  const tierIndex = tierOrder.indexOf(ctx.tier);

  const applicable = toolRegistry.filter(tool => {
    // Tier check: pre-check tools run in both tiers, full-only tools only in full
    const toolTierIndex = tierOrder.indexOf(tool.tier);
    if (toolTierIndex > tierIndex) return false;

    // Project type check
    if (!tool.detect(ctx)) return false;

    return true;
  });

  log('INFO', `Running ${applicable.length} tools (tier: ${ctx.tier})`, {
    tools: applicable.map(t => t.id),
  });

  const toolResults = {};
  for (const tool of applicable) {
    log('STEP', `Running: ${tool.name}`);
    toolResults[tool.id] = await runTool(tool, ctx);

    const r = toolResults[tool.id];
    if (r.status === 'ok') {
      log('OK', `${tool.name}: ${r.errors} errors, ${r.warnings} warnings (${r.duration_ms}ms)`);
    } else if (r.status === 'not_applicable') {
      log('INFO', `${tool.name}: not applicable — ${r.reason}`);
    } else {
      log('WARN', `${tool.name}: error — ${r.error}`);
    }
  }

  // Build summary
  let totalErrors = 0;
  let totalWarnings = 0;
  let toolsOk = 0;
  let toolsNotApplicable = 0;
  let toolsFailed = 0;
  let totalBlocking = 0;
  let totalBaselined = 0;

  for (const r of Object.values(toolResults)) {
    if (r.status === 'ok') {
      toolsOk++;
      totalErrors += r.errors;
      totalWarnings += r.warnings;
      totalBlocking += r.blocking_findings;
      totalBaselined += r.baselined_findings;
    } else if (r.status === 'not_applicable') {
      toolsNotApplicable++;
    } else {
      toolsFailed++;
    }
  }

  return {
    schema_version: LINT_REPORT_SCHEMA_VERSION,
    policy: {
      schema_version: ctx.policy.schema_version,
      digest: ctx.policyDigest,
      project: ctx.policyProject.id,
      config_digests: ctx.policy.config_digests,
      baseline_digest: ctx.policy.baseline.digest,
    },
    project: reportProjectName(ctx),
    scope: selectDefinedValue(() => (ctx.modulePath), () => (FULL_REPORT_SCOPE)),
    timestamp: new Date().toISOString(),
    tier: ctx.tier,
    changed_files: changedFiles(ctx),
    detected_types: [...ctx.projectTypes],
    diagnostics: Array.isArray(ctx.diagnostics) ? ctx.diagnostics : [],
    tools: toolResults,
    summary: {
      total_errors: totalErrors,
      total_warnings: totalWarnings,
      total_blocking: totalBlocking,
      total_baselined: totalBaselined,
      tools_ok: toolsOk,
      tools_not_applicable: toolsNotApplicable,
      tools_failed: toolsFailed,
    },
  };
}

export {
  failConfigMissing,
  failParse,
  notApplicable,
  runAllTools,
};
