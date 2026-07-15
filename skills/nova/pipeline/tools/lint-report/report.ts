import path from 'path';

import { commandExists } from './execution.ts';
import { log } from './output.ts';

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

function makeWarningResult({ file, code, message }) {
  return {
    errors: 0,
    warnings: 1,
    findings: [{
      file,
      line: null,
      column: null,
      severity: 'warning',
      code,
      message,
    }],
  };
}

function makeConfigMissingResult(ctx, code, message) {
  return makeWarningResult({
    file: ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot,
    code,
    message,
  });
}

function makeParseFailureResult(ctx, toolId, parsed, result, file = null) {
  const targetFile = reportTargetFile(ctx, file);
  const output = selectDefinedValue(() => ([result.stdout, result.stderr].find((value) => typeof value === 'string' && value.trim())?.trim()), () => (''));
  const preview = output ? output.split('\n')[0].slice(0, 200) : NO_OUTPUT_CAPTURED;
  const message = `${toolId} output could not be parsed. parseError=${parsed.error}; exitCode=${result.exitCode}; preview=${preview}`;
  log('WARN', message, { file: targetFile });
  return makeWarningResult({
    file: targetFile,
    code: `${toolId}-parse-failed`,
    message,
  });
}

/**
 * Run a single tool with full error handling.
 * Returns a standardized result object for the report.
 */
async function runTool(tool, ctx) {
  const startTime = Date.now();

  // Check if the tool binary exists
  const binaryName = toolBinaryName(tool);
  if (!commandExists(binaryName)) {
    return {
      status: 'skipped',
      reason: `${binaryName} not found in PATH`,
      duration_ms: 0,
    };
  }

  try {
    const result = await tool.run(ctx);
    const durationMs = Date.now() - startTime;

    return {
      status: 'ok',
      errors: resultCount(result.errors),
      warnings: resultCount(result.warnings),
      findings: resultFindings(result.findings),
      duration_ms: durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    log('WARN', `Tool ${tool.id} failed: ${e.message}`);

    return {
      status: 'error',
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
    } else if (r.status === 'skipped') {
      log('INFO', `${tool.name}: skipped — ${r.reason}`);
    } else {
      log('WARN', `${tool.name}: error — ${r.error}`);
    }
  }

  // Build summary
  let totalErrors = 0;
  let totalWarnings = 0;
  let toolsOk = 0;
  let toolsSkipped = 0;
  let toolsFailed = 0;

  for (const r of Object.values(toolResults)) {
    if (r.status === 'ok') {
      toolsOk++;
      totalErrors += r.errors;
      totalWarnings += r.warnings;
    } else if (r.status === 'skipped') {
      toolsSkipped++;
    } else {
      toolsFailed++;
    }
  }

  return {
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
      tools_ok: toolsOk,
      tools_skipped: toolsSkipped,
      tools_failed: toolsFailed,
    },
  };
}

export {
  makeConfigMissingResult,
  makeParseFailureResult,
  makeWarningResult,
  runAllTools,
};
