import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/lint.ts — Static analysis (lint) report generation and pre-check runner

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { validateSafePath, moduleLintLogDir } from '../core/paths.ts';
import { buildSubprocessEnv } from '../security.ts';
import { validateLintReport } from '../tools/lint-report/report-contract.ts';
import { detectProjectTypes } from '../tools/lint-report/discovery.ts';
import { applicablePolicyToolIds, loadLintPolicy, policyDigest, selectPolicyProject } from '../tools/lint-report/policy.ts';
import { selectPresentValue, textValue } from '../value-boundary.ts';
import {
  formatLintErrors,
  formatLintReportForReviewer,
  formatLintToolFailures,
} from './lint-format.ts';
import { buildLintInvocation } from './lint-scope.ts';

const LINT_REPORT_MODULE_ID = 'report';
const LINT_REPORT_UNAVAILABLE = 'Lint report unavailable';
const LINT_SUMMARY_COUNT_MISSING = 0;

export { formatLintReportForReviewer } from './lint-format.ts';

function numericCount(value: any) {
  const count = Number(value);
  return Number.isFinite(count) ? count : LINT_SUMMARY_COUNT_MISSING;
}

function nodeExec(scriptPath: any, args: any, opts: any = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024, env: buildSubprocessEnv() };
  const result = execFileSync('node', [scriptPath, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

function tmpFile(prefix: any, moduleId: any = '', ext: any = '.tmp') {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join('/tmp', `swarm-pipeline-${prefix}-${moduleId}-${ts}-${rand}${ext}`);
}

function preCheckTimeoutMs(config: any) {
  const timeoutSeconds = Number(config?.pre_check?.timeout_seconds);
  if (selectTruthyValue(() => (!Number.isFinite(timeoutSeconds)), () => (timeoutSeconds <= 0))) {
    throw new Error('config.pre_check.timeout_seconds must be a positive number');
  }
  return timeoutSeconds * 1000;
}

function resolveLintReportPath(config: any) {
  return validateSafePath(
    config.pre_check.lint_report_path,
    'config.pre_check.lint_report_path'
  );
}

function loadLintExpectations(config: any, cliTier: string, lintPolicyPath: string) {
  const policy = loadLintPolicy(lintPolicyPath);
  const project = selectPolicyProject(policy, config.pre_check.lint_policy_project);
  const { types } = detectProjectTypes(config.repo_root, project, policy.global_exclusions);
  const toolIds = applicablePolicyToolIds(policy, new Set<string>(types as Iterable<string>), cliTier);
  const toolPolicies = Object.fromEntries(policy.tools
    .filter((tool: any) => toolIds.includes(tool.id))
    .map((tool: any) => [tool.id, {
      category: tool.category,
      scope: tool.scope,
      blocking_severity: tool.blocking_severity,
      mode: tool.mode,
    }]));
  return { policy, toolIds, toolPolicies };
}

function executeLintReporter(lintReportPath: string, outputPath: string, args: string[], timeout: number) {
  try {
    nodeExec(lintReportPath, args, { timeout });
    return null;
  } catch (error: any) {
    if (fs.existsSync(outputPath)) return null;
    log('WARN', `lint-report.ts crashed: ${error.message?.split('\n')[0]}`);
    return { report: null, error: error.message };
  }
}

function validatedLintReport(context: any) {
  try {
    const report = JSON.parse(fs.readFileSync(context.outputPath, 'utf8'));
    validateLintReport(report, {
      tier: context.cliTier,
      policyProject: context.config.pre_check.lint_policy_project,
      policyDigest: policyDigest(context.expectations.policy),
      baselineDigest: context.expectations.policy.baseline.digest,
      configDigests: context.expectations.policy.config_digests,
      toolIds: context.expectations.toolIds,
      toolPolicies: context.expectations.toolPolicies,
      scope: context.invocation.scope,
      changedFiles: context.invocation.changedFiles,
      visibility: { debt: false, experimental: false },
    });
    const summary = report.summary;
    log('INFO', `Lint report (${context.tier}): ${summary.total_errors} errors, ${summary.total_warnings} warnings, ${summary.total_blocking} blocking, ${summary.total_baselined} baselined, ${summary.total_experimental} experimental (${summary.tools_ok} ok, ${summary.tools_failed} failed)`);
    return { report, error: null };
  } catch (error: any) {
    const contractInvalid = error?.code === 'LINT_REPORT_CONTRACT_INVALID';
    const diagnostic = {
      code: contractInvalid ? 'LINT_REPORT_CONTRACT_INVALID' : 'LINT_REPORT_UNPARSEABLE',
      message: `${contractInvalid ? 'Lint report contract invalid' : 'Lint report unparseable'}: ${error.message}`,
      lint_report_path: context.lintReportPath,
      output_path: context.outputPath,
      tier: context.tier,
    };
    log('ERROR', diagnostic.message);
    return {
      report: null,
      error: diagnostic.message,
      setup_failed: true,
      error_code: diagnostic.code,
      diagnostic,
    };
  }
}

function lintToolMissing(lintReportPath: string, tier: string) {
  const diagnostic = {
    code: 'LINT_REPORT_TOOL_MISSING',
    message: `lint-report.ts not found at ${lintReportPath}`,
    lint_report_path: lintReportPath,
    tier,
  };
  log('ERROR', diagnostic.message);
  return {
    report: null,
    error: diagnostic.message,
    setup_failed: true,
    error_code: diagnostic.code,
    diagnostic,
  };
}

function lintExpectationsOrFailure(
  config: any,
  cliTier: string,
  lintPolicyPath: string,
  tier: string,
) {
  try {
    return { expectations: loadLintExpectations(config, cliTier, lintPolicyPath) };
  } catch (error: any) {
    const diagnostic = {
      code: 'LINT_POLICY_INVALID',
      message: `Lint policy invalid: ${error.message}`,
      lint_policy_path: lintPolicyPath,
      tier,
    };
    log('ERROR', diagnostic.message);
    return {
      failure: {
        report: null,
        error: diagnostic.message,
        setup_failed: true,
        error_code: diagnostic.code,
        diagnostic,
      },
    };
  }
}

function runValidatedLintReport(context: any) {
  const executionFailure = executeLintReporter(
    context.lintReportPath,
    context.outputPath,
    context.invocation.args,
    lintTimeoutAuthority(context.opts, context.tier, context.config),
  );
  return executionFailure ?? validatedLintReport(context);
}

/**
 * Run lint-report.ts and return the parsed JSON report.
 *
 * @param {object} config - Pipeline config
 * @param {string} tier   - 'pre-check' or 'buster'
 * @param {object} opts   - { moduleDir, moduleId, forgeDiffStat, changedFiles, commitHash, timeoutMs, logPath }
 * @returns {{ report: object|null, error: string|null }}
 */
export function generateLintReport(config: any, tier: any, opts: any = {}) {
  const cliTier = tier === 'buster' ? 'full' : tier;
  const lintReportPath = resolveLintReportPath(config);

  if (!fs.existsSync(lintReportPath)) return lintToolMissing(lintReportPath, tier);

  const lintPolicyPath = validateSafePath(config.pre_check.lint_policy_path, 'config.pre_check.lint_policy_path');
  const expected = lintExpectationsOrFailure(config, cliTier, lintPolicyPath, tier);
  if (expected.failure) return expected.failure;
  const outputPath = tmpFile(`lint-${tier}`, selectPresentValue(opts.moduleId, LINT_REPORT_MODULE_ID), '.json');
  const invocation = buildLintInvocation(config, cliTier, lintPolicyPath, outputPath, opts);
  log('STEP', `Lint report: running lint-report.ts --tier ${cliTier}`);

  try {
    return runValidatedLintReport({
      config, tier, cliTier, lintReportPath, outputPath,
      expectations: expected.expectations,
      invocation, opts,
    });
  } finally {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch (e: any) {
      log('DEBUG', `Lint report temp cleanup failed: ${e.message}`);
    }
  }
}

function lintTimeoutAuthority(opts: Record<string, any>, tier: string, config: Record<string, any>): number {
  if (opts.timeoutMs !== undefined && opts.timeoutMs !== null) return opts.timeoutMs;
  if (tier === 'pre-check') return preCheckTimeoutMs(config);
  return 120000;
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
export async function runPreCheck(config: any, moduleDir: any, status: any, moduleId: any) {
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
    } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */ /* non-critical */ }
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
