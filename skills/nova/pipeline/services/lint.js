// services/lint.js — Static analysis (lint) report generation and pre-check runner
// Extracted from pipeline-original.js (module 03)

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { validateSafePath, relPath, modulePath, moduleLintLogDir } from '../core/paths.js';

function nodeExec(scriptPath, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 };
  const result = execFileSync('node', [scriptPath, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

function tmpFile(prefix, moduleId = '', ext = '.tmp') {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join('/tmp', `swarm-pipeline-${prefix}-${moduleId}-${ts}-${rand}${ext}`);
}

/**
 * Run lint-report.js and return the parsed JSON report.
 *
 * @param {object} config - Pipeline config
 * @param {string} tier   - 'pre-check' or 'buster'
 * @param {object} opts   - { moduleDir, moduleId, forgeDiffStat, timeoutMs, logPath }
 * @returns {{ report: object|null, error: string|null }}
 */
export function generateLintReport(config, tier, opts = {}) {
  const lintReportPath = validateSafePath(
    config.pre_check?.lint_report_path || '/app/skills/lint-report.js',
    'config.pre_check.lint_report_path'
  );

  if (!fs.existsSync(lintReportPath)) {
    log('WARN', `lint-report.js not found at ${lintReportPath}`);
    return { report: null, error: `lint-report.js not found at ${lintReportPath}` };
  }

  const defaultTimeout = tier === 'pre-check' ? 30000 : 120000;
  const timeout = opts.timeoutMs || defaultTimeout;
  const outputPath = tmpFile(`lint-${tier}`, opts.moduleId || 'report', '.json');

  const args = [
    '--repo', config.repo_root,
    '--tier', tier,
    '--project', config.project,
    '--output', outputPath,
  ];

  // Pass semgrep config path if configured (platform-level, not repo-level)
  if (config.pre_check?.semgrep_config_path) {
    args.push('--semgrep-config', config.pre_check.semgrep_config_path);
  }

  // Pass execution trace log path for dual-write in lint-report.js
  if (opts.logPath) {
    args.push('--log-path', opts.logPath);
  }

  if (opts.moduleDir) {
    const modRelPath = relPath(config, modulePath(config, opts.moduleDir));
    args.push('--module-path', modRelPath);
  }

  if (opts.forgeDiffStat) {
    const changedFiles = opts.forgeDiffStat
      .split('\n')
      .map(line => line.trim().split(/\s+\|/)[0]?.trim())
      .filter(f => f && !f.includes('changed') && !f.includes('insertion') && !f.includes('deletion'));

    if (changedFiles.length > 0) {
      args.push('--changed-files', changedFiles.join(','));
    }
  }

  log('STEP', `Lint report: running lint-report.js --tier ${tier}`);

  try {
    nodeExec(lintReportPath, args, { timeout, env: process.env });
  } catch (e) {
    if (!fs.existsSync(outputPath)) {
      log('WARN', `lint-report.js crashed: ${e.message?.split('\n')[0]}`);
      return { report: null, error: e.message };
    }
    // Non-zero exit with output file = errors found (expected)
  }

  try {
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const { total_errors, total_warnings, tools_ok, tools_failed } = report.summary;
    log('INFO', `Lint report (${tier}): ${total_errors} errors, ${total_warnings} warnings (${tools_ok} ok, ${tools_failed} failed)`);
    return { report, error: null };
  } catch (e) {
    log('WARN', `Lint report unparseable: ${e.message}`);
    return { report: null, error: e.message };
  }
}

/**
 * Format lint report errors into a human-readable summary for anti-pattern blocks.
 * Groups by tool, shows only errors, caps at 20 per tool.
 * @private
 */
function formatLintErrors(report) {
  const errorLines = [];
  for (const [toolId, toolResult] of Object.entries(report.tools)) {
    if (toolResult.status !== 'ok' || toolResult.errors === 0) continue;
    errorLines.push(`### ${toolId}: ${toolResult.errors} error(s)`);
    const errors = (toolResult.findings || []).filter(f => f.severity === 'error');
    for (const finding of errors.slice(0, 20)) {
      const loc = finding.line ? `:${finding.line}` : '';
      errorLines.push(`- \`${finding.file || '?'}${loc}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`);
    }
    if (errors.length > 20) {
      errorLines.push(`- ... and ${errors.length - 20} more`);
    }
    errorLines.push('');
  }
  return errorLines.join('\n');
}

/**
 * Format lint report as a structured block for injection into a reviewer prompt.
 * Includes both errors and warnings, grouped by tool.
 */
export function formatLintReportForReviewer(report) {
  const lines = [
    '## 📊 STATIC ANALYSIS REPORT (Automated)',
    '',
    `**Tier:** ${report.tier} | **Timestamp:** ${report.timestamp}`,
    `**Summary:** ${report.summary.total_errors} errors, ${report.summary.total_warnings} warnings`,
    `**Tools:** ${report.summary.tools_ok} passed, ${report.summary.tools_skipped} skipped, ${report.summary.tools_failed} failed`,
    '',
  ];

  if (report.changed_files?.length > 0) {
    lines.push(`**Scoped to changed files:** ${report.changed_files.join(', ')}`, '');
  }

  for (const [toolId, toolResult] of Object.entries(report.tools)) {
    if (toolResult.status === 'skipped') continue;

    if (toolResult.status === 'error') {
      lines.push(`### ❌ ${toolId} — TOOL ERROR`, `Error: ${toolResult.error}`, '');
      continue;
    }

    if (toolResult.errors === 0 && toolResult.warnings === 0) {
      lines.push(`### ✅ ${toolId} — clean`);
      continue;
    }

    lines.push(`### ${toolResult.errors > 0 ? '🔴' : '🟡'} ${toolId} — ${toolResult.errors} errors, ${toolResult.warnings} warnings`);
    lines.push('');

    const findings = toolResult.findings || [];
    for (const finding of findings.slice(0, 30)) {
      const loc = finding.line ? `:${finding.line}` : '';
      const icon = finding.severity === 'error' ? '🔴' : '🟡';
      lines.push(`${icon} \`${finding.file || '?'}${loc}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`);
    }
    if (findings.length > 30) {
      lines.push(`... and ${findings.length - 30} more findings`);
    }
    lines.push('');
  }

  lines.push('---', '');
  return lines.join('\n');
}

// ─── Pre-Check (Forge Output Validation) ────────────────────────────────────
//
// Runs fast Tier 1 analysis on Forge output BEFORE handing off to Buster.
// On failure: routes to handleFail with pre_check phase — Forge gets the
// exact errors as anti-patterns and can retry immediately.

/**
 * Run pre-check static analysis on Forge output.
 *
 * @param {object} config     - Pipeline config
 * @param {string} moduleDir  - Module directory name
 * @param {object} status     - Module status object (for forge_diff_stat)
 * @param {string} moduleId   - Module identifier
 * @returns {{ passed: boolean, report: object|null, error: string|null }}
 */
export async function runPreCheck(config, moduleDir, status, moduleId) {
  if (config.pre_check?.enabled === false) {
    log('INFO', 'Pre-check disabled via config');
    return { passed: true, report: null, error: null };
  }

  const timeout = (config.pre_check?.timeout_seconds || 30) * 1000;
  const attempt = status.fail_count + 1;
  const tracePath = config._logDir ? path.join(moduleLintLogDir(config, moduleDir), `precheck-trace-attempt-${attempt}.jsonl`) : null;
  const { report, error } = generateLintReport(config, 'pre-check', {
    moduleDir,
    moduleId,
    forgeDiffStat: status.forge_diff_stat,
    timeoutMs: timeout,
    logPath: tracePath,
  });

  // Save lint report to centralized log directory
  if (report && config._logDir) {
    try {
      const lintDir = moduleLintLogDir(config, moduleDir);
      fs.writeFileSync(path.join(lintDir, `precheck-attempt-${attempt}.json`), JSON.stringify(report, null, 2));
    } catch { /* non-critical */ }
  }

  if (!report) {
    log('WARN', `Pre-check skipped: ${error}`);
    return { passed: true, report: null, error };
  }

  if (report.summary.total_errors === 0) {
    log('OK', 'Pre-check passed — no errors found');
    return { passed: true, report, error: null };
  }

  const errorSummary = `PRE-CHECK FAILED: ${report.summary.total_errors} static analysis error(s) in Forge output.\n\n` +
    formatLintErrors(report);

  log('WARN', `Pre-check failed: ${report.summary.total_errors} errors — routing to handleFail`);
  return { passed: false, report, error: errorSummary };
}
