import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/lint.ts — Static analysis (lint) report generation and pre-check runner

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { validateSafePath, relPath, modulePath, moduleLintLogDir } from '../core/paths.ts';
import { buildSubprocessEnv } from '../security.ts';
import { validateLintReport } from '../tools/lint-report/report-contract.ts';
import { detectProjectTypes } from '../tools/lint-report/discovery.ts';
import { applicablePolicyToolIds, loadLintPolicy, policyDigest, selectPolicyProject } from '../tools/lint-report/policy.ts';

const LINT_REPORT_MODULE_ID = 'report';
const LINT_REPORT_UNAVAILABLE = 'Lint report unavailable';
const LINT_TOOL_ERROR_UNKNOWN = 'Unknown tool error';
const LINT_FINDING_FILE_MISSING = '?';
const LINT_SUMMARY_COUNT_MISSING = 0;

function textValue(value) {
  return typeof value === 'string' ? value : '';
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function numericCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : LINT_SUMMARY_COUNT_MISSING;
}

function nodeExec(scriptPath, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024, env: buildSubprocessEnv() };
  const result = execFileSync('node', [scriptPath, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

function execText(command, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024, env: buildSubprocessEnv() };
  const result = execFileSync(command, args, { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

function tmpFile(prefix, moduleId = '', ext = '.tmp') {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join('/tmp', `swarm-pipeline-${prefix}-${moduleId}-${ts}-${rand}${ext}`);
}

function changedFilesFromDiffStat(forgeDiffStat = '') {
  return textValue(forgeDiffStat)
    .split('\n')
    .map(line => line.trim().split(/\s+\|/)[0]?.trim())
    .filter(f => f && !f.includes('changed') && !f.includes('insertion') && !f.includes('deletion'));
}

function changedFilesFromCommit(config, commitHash = null) {
  if (selectTruthyValue(() => (typeof commitHash !== 'string'), () => (!commitHash.trim()))) return [];
  try {
    const output = execText('git', ['-C', config.repo_root, 'show', '--pretty=format:', '--name-only', commitHash]);
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    log('WARN', `Unable to derive changed files from commit ${commitHash}: ${error.message}`);
    return [];
  }
}

function normalizeRepoRelativePath(filePath = '') {
  const normalized = textValue(filePath).replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized.replace(/^\.\//, '');
}

function scopeChangedFilesToModule(moduleDir = null, changedFiles = []) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!moduleDir), () => (!Array.isArray(changedFiles)))), () => (changedFiles.length === 0))) return changedFiles;
  const normalizedModuleDir = normalizeRepoRelativePath(moduleDir).replace(/\/+$/, '');
  if (!normalizedModuleDir) return changedFiles;
  const modulePrefix = `${normalizedModuleDir}/`;
  return changedFiles.filter((filePath) => {
    const normalizedFilePath = normalizeRepoRelativePath(filePath);
    if (normalizedFilePath === normalizedModuleDir) return true;
    return normalizedFilePath.startsWith(modulePrefix);
  });
}

function preCheckTimeoutMs(config) {
  const timeoutSeconds = Number(config?.pre_check?.timeout_seconds);
  if (selectTruthyValue(() => (!Number.isFinite(timeoutSeconds)), () => (timeoutSeconds <= 0))) {
    throw new Error('config.pre_check.timeout_seconds must be a positive number');
  }
  return timeoutSeconds * 1000;
}

function resolveLintReportPath(config) {
  return validateSafePath(
    config.pre_check.lint_report_path,
    'config.pre_check.lint_report_path'
  );
}

/**
 * Run lint-report.ts and return the parsed JSON report.
 *
 * @param {object} config - Pipeline config
 * @param {string} tier   - 'pre-check' or 'buster'
 * @param {object} opts   - { moduleDir, moduleId, forgeDiffStat, changedFiles, commitHash, timeoutMs, logPath }
 * @returns {{ report: object|null, error: string|null }}
 */
export function generateLintReport(config, tier, opts = {}) {
  const cliTier = tier === 'buster' ? 'full' : tier;
  const lintReportPath = resolveLintReportPath(config);

  if (!fs.existsSync(lintReportPath)) {
    const error = {
      code: 'LINT_REPORT_TOOL_MISSING',
      message: `lint-report.ts not found at ${lintReportPath}`,
      lint_report_path: lintReportPath,
      tier,
    };
    log('ERROR', error.message);
    return { report: null, error: error.message, setup_failed: true, error_code: error.code, diagnostic: error };
  }

  const timeout = lintTimeoutAuthority(opts, tier, config);
  const lintPolicyPath = validateSafePath(config.pre_check.lint_policy_path, 'config.pre_check.lint_policy_path');
  let expectedPolicy;
  let expectedToolIds;
  let expectedToolPolicies;
  try {
    expectedPolicy = loadLintPolicy(lintPolicyPath);
    const expectedProject = selectPolicyProject(expectedPolicy, config.pre_check.lint_policy_project);
    const { types } = detectProjectTypes(config.repo_root, expectedProject, expectedPolicy.global_exclusions);
    expectedToolIds = applicablePolicyToolIds(expectedPolicy, types, cliTier);
    expectedToolPolicies = Object.fromEntries(expectedPolicy.tools
      .filter(tool => expectedToolIds.includes(tool.id))
      .map(tool => [tool.id, { category: tool.category, scope: tool.scope, blocking_severity: tool.blocking_severity }]));
  } catch (e) {
    const error = { code: 'LINT_POLICY_INVALID', message: `Lint policy invalid: ${e.message}`, lint_policy_path: lintPolicyPath, tier };
    log('ERROR', error.message);
    return { report: null, error: error.message, setup_failed: true, error_code: error.code, diagnostic: error };
  }
  const outputPath = tmpFile(`lint-${tier}`, selectPresentValue(opts.moduleId, LINT_REPORT_MODULE_ID), '.json');

  const args = [
    '--repo', config.repo_root,
    '--tier', cliTier,
    '--project', config.project,
    '--policy', lintPolicyPath,
    '--policy-project', config.pre_check.lint_policy_project,
    '--output', outputPath,
  ];

  // Pass execution trace log path for dual-write in lint-report.ts
  if (opts.logPath) {
    args.push('--log-path', opts.logPath);
  }

  const requestedModulePath = opts.moduleDir
    ? relPath(config, modulePath(config, opts.moduleDir))
    : 'full';
  if (opts.moduleDir) args.push('--module-path', requestedModulePath);

  const explicitChangedFiles = Array.isArray(opts.changedFiles) ? opts.changedFiles.filter(Boolean) : [];
  const changedFiles = scopeChangedFilesToModule(opts.moduleDir, explicitChangedFiles.length > 0
    ? explicitChangedFiles
    : (opts.forgeDiffStat ? changedFilesFromDiffStat(opts.forgeDiffStat) : changedFilesFromCommit(config, opts.commitHash)));
  if (changedFiles.length > 0) {
    args.push('--changed-files', changedFiles.join(','));
  }

  log('STEP', `Lint report: running lint-report.ts --tier ${cliTier}`);

  try {
    try {
      nodeExec(lintReportPath, args, { timeout });
    } catch (e) {
      if (!fs.existsSync(outputPath)) {
        log('WARN', `lint-report.ts crashed: ${e.message?.split('\n')[0]}`);
        return { report: null, error: e.message };
      }
      // Non-zero exit with output file = errors found (expected)
    }

    try {
      const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      validateLintReport(report, {
        tier: cliTier,
        policyProject: config.pre_check.lint_policy_project,
        policyDigest: policyDigest(expectedPolicy),
        baselineDigest: expectedPolicy.baseline.digest,
        configDigests: expectedPolicy.config_digests,
        toolIds: expectedToolIds,
        toolPolicies: expectedToolPolicies,
        scope: requestedModulePath,
        changedFiles,
      });
      const { total_errors, total_warnings, total_blocking, total_baselined, tools_ok, tools_failed } = report.summary;
      log('INFO', `Lint report (${tier}): ${total_errors} errors, ${total_warnings} warnings, ${total_blocking} blocking, ${total_baselined} baselined (${tools_ok} ok, ${tools_failed} failed)`);
      return { report, error: null };
    } catch (e) {
      const contractInvalid = e?.code === 'LINT_REPORT_CONTRACT_INVALID';
      const error = {
        code: contractInvalid ? 'LINT_REPORT_CONTRACT_INVALID' : 'LINT_REPORT_UNPARSEABLE',
        message: `${contractInvalid ? 'Lint report contract invalid' : 'Lint report unparseable'}: ${e.message}`,
        lint_report_path: lintReportPath,
        output_path: outputPath,
        tier,
      };
      log('ERROR', error.message);
      return { report: null, error: error.message, setup_failed: true, error_code: error.code, diagnostic: error };
    }
  } finally {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch (e) {
      log('DEBUG', `Lint report temp cleanup failed: ${e.message}`);
    }
  }
}

function lintTimeoutAuthority(opts: Record<string, any>, tier: string, config: Record<string, any>): number {
  if (opts.timeoutMs !== undefined && opts.timeoutMs !== null) return opts.timeoutMs;
  if (tier === 'pre-check') return preCheckTimeoutMs(config);
  return 120000;
}

/**
 * Format lint report errors into a human-readable summary for anti-pattern blocks.
 * Groups by tool, shows only errors, caps at 20 per tool.
 * @private
 */
function formatLintErrors(report) {
  const errorLines = [];
  for (const [toolId, toolResult] of Object.entries(report.tools)) {
    if (selectTruthyValue(() => (toolResult.status !== 'ok'), () => (toolResult.errors === 0))) continue;
    errorLines.push(`### ${toolId}: ${toolResult.errors} error(s)`);
    const errors = arrayValue(toolResult.findings).filter(f => f.severity === 'error');
    for (const finding of errors.slice(0, 20)) {
      const loc = finding.line ? `:${finding.line}` : '';
      errorLines.push(`- \`${selectPresentValue(finding.file, LINT_FINDING_FILE_MISSING)}${loc}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`);
    }
    if (errors.length > 20) {
      errorLines.push(`- ... and ${errors.length - 20} more`);
    }
    errorLines.push('');
  }
  return errorLines.join('\n');
}

function formatLintToolFailures(report) {
  const failureLines = [];
  for (const [toolId, toolResult] of Object.entries(recordValue(report.tools))) {
    if (toolResult.status !== 'error') continue;
    failureLines.push(`### ${toolId}: tool failed`);
    failureLines.push(`- ${selectPresentValue(toolResult.error, LINT_TOOL_ERROR_UNKNOWN)}`);
    failureLines.push('');
  }
  return failureLines.join('\n');
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
    `**Tools:** ${report.summary.tools_ok} passed, ${report.summary.tools_not_applicable} not applicable, ${report.summary.tools_failed} failed`,
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

    const findings = arrayValue(toolResult.findings);
    for (const finding of findings.slice(0, 30)) {
      const loc = finding.line ? `:${finding.line}` : '';
      const icon = finding.severity === 'error' ? '🔴' : '🟡';
      lines.push(`${icon} \`${selectPresentValue(finding.file, LINT_FINDING_FILE_MISSING)}${loc}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`);
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
  if (config.pre_check.enabled === false) {
    log('INFO', 'Pre-check disabled via config');
    return { passed: true, report: null, error: null };
  }

  const timeout = preCheckTimeoutMs(config);
  const failCount = Number(status?.fail_count);
  const attempt = (Number.isFinite(failCount) ? Math.trunc(failCount) : 0) + 1;
  const lintDir = moduleLintLogDir(config, moduleDir);
  const tracePath = lintDir ? path.join(lintDir, `precheck-trace-attempt-${attempt}.jsonl`) : null;
  const { report, error } = generateLintReport(config, 'pre-check', {
    moduleDir,
    moduleId,
    forgeDiffStat: status.forge_diff_stat,
    timeoutMs: timeout,
    logPath: tracePath,
  });

  // Save lint report to centralized log directory
  if (report && lintDir) {
    try {
      fs.writeFileSync(path.join(lintDir, `precheck-attempt-${attempt}.json`), JSON.stringify(report, null, 2));
    } catch (_error) { /* non-critical */ }
  }

  if (!report) {
    const errorMessage = selectPresentValue(error, LINT_REPORT_UNAVAILABLE);
    log('ERROR', `Pre-check failed closed: ${errorMessage}`);
    return {
      passed: false,
      report: null,
      error: `PRE-CHECK SETUP FAILED: ${errorMessage}`,
      setup_failed: true,
      error_code: 'LINT_PRECHECK_EVIDENCE_REQUIRED',
    };
  }

  const totalErrors = numericCount(report.summary?.total_blocking);
  const toolsFailed = numericCount(report.summary?.tools_failed);

  if (totalErrors === 0 && toolsFailed === 0) {
    log('OK', 'Pre-check passed — no errors found');
    return { passed: true, report, error: null };
  }

  const failureSections = [
    `PRE-CHECK FAILED: ${totalErrors} static analysis error(s), ${toolsFailed} tool failure(s) in Forge output.`,
  ];
  const toolFailureSummary = formatLintToolFailures(report);
  if (toolFailureSummary) failureSections.push(toolFailureSummary);
  const lintErrorSummary = formatLintErrors(report);
  if (lintErrorSummary) failureSections.push(lintErrorSummary);
  const errorSummary = failureSections.join('\n\n');

  log('WARN', `Pre-check failed: ${totalErrors} errors, ${toolsFailed} tool failures — routing to handleFail`);
  return { passed: false, report, error: errorSummary };
}
