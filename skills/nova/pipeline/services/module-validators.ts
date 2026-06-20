// services/module-validators.ts — Built-in lint/precheck validator stages

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { moduleLintLogDir, gateLintLogDir, resolvePipelineRunLogDir } from '../core/paths.ts';
import { getRunId } from '../core/runtime.ts';
import { runDeliveryLintValidation, formatValidationFailures } from './validation.ts';
import { runPreCheck, generateLintReport } from './lint.ts';
import { buildModuleValidatorControlResult } from './contracts/validator-control-result.ts';
import { resolveModuleCommit } from './status-store-lifecycle/refs.ts';

const EXECUTION_FAILED_VALIDATOR_POLICY = Object.freeze({ nextAction: 'block', issueType: 'environment', outcomeClass: 'execution_failed' });

function stageProducerType(input = {}, opts = {}) {
  const producerType = opts.producerType || input?.validator?.producerType || input?.ids?.producerType || null;
  return typeof producerType === 'string' && producerType.trim() ? producerType.trim() : null;
}

function getModuleId(input = {}) {
  return input?.ids?.moduleId || input?.module?.moduleId || input?.module_id || null;
}

function getModuleDir(input = {}) {
  return input?.executionContext?.moduleDir
    || input?.module?.dir
    || input?.ids?.moduleDir
    || input?.module_dir
    || null;
}

function getModuleConfig(progress = {}, moduleId = null, input = {}) {
  return input?.module?.config
    || input?.moduleConfig
    || (moduleId ? progress?.modules?.[moduleId] : null)
    || {};
}

function getModuleStatus(input = {}) {
  return input?.stateSnapshot?.module?.statusRaw
    || input?.module?.status
    || input?.status
    || {};
}

function getGateId(input = {}) {
  return input?.ids?.gateId || input?.gate?.gateId || input?.gate_id || null;
}
function lintArtifactPart(value = null, fallback = 'validator-full_lint') {
  const raw = String(value || fallback).trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || fallback;
}
function archiveFullLintReport(config, report = null, input = {}, moduleDir = null, stageId = 'validator:full_lint') {
  if (!report) return null;
  const gateId = getGateId(input), runLogDir = resolvePipelineRunLogDir(config);
  const lintDir = moduleDir
    ? moduleLintLogDir(config, moduleDir)
    : (gateId ? gateLintLogDir(config, gateId) : (runLogDir ? path.join(runLogDir, 'lint') : null));
  if (!lintDir) return null;
  const scheduleKey = input?.executionContext?.scheduleKey || input?.refs?.validatorResultRef || stageId;
  const archivePath = path.join(lintDir, `full-lint-${lintArtifactPart(scheduleKey)}.json`);
  try {
    fs.mkdirSync(lintDir, { recursive: true });
    fs.writeFileSync(archivePath, JSON.stringify(report, null, 2));
    return archivePath;
  } catch (error) {
    log('DEBUG', `Full lint report archive failed: ${error.message}`);
    return null;
  }
}

function baseValidatorOpts(config, input = {}, stageId, extra = {}) {
  const producerType = stageProducerType(input, extra);
  return {
    producerType: producerType || 'invalid_validator_producer',
    stageId,
    moduleId: getModuleId(input),
    moduleDir: getModuleDir(input),
    runId: input?.ids?.runId || getRunId(config),
    scope: input?.ids?.moduleId ? 'module' : 'pipeline',
    validatorRef: input?.refs?.validatorResultRef || null,
    ...extra,
  };
}

function moduleValidatorControlPolicy(result = {}) {
  if (result?.passed === true) return { nextAction: 'pass', outcomeClass: 'passed' };
  if (result?.blocked === true || result?.tool_error === true) {
    return { ...EXECUTION_FAILED_VALIDATOR_POLICY };
  }
  return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'validation_failed' };
}

function missingProducerControl(config, input = {}, stageId) {
  return buildModuleValidatorControlResult(config, {
    passed: false,
    blocked: true,
    error: 'validator producerType metadata is required',
  }, baseValidatorOpts(config, input, stageId, {
    producerType: 'invalid_validator_producer',
    executionFailed: true,
    nextAction: 'block',
    issueType: 'environment',
    outcomeClass: 'invalid_validator_metadata',
  }));
}

export function runDeliveryLintValidatorStage(config, progress = {}, input = {}, opts = {}) {
  const stageId = opts.stageId || input?.ids?.stageId || 'validator:delivery_lint';
  const moduleId = getModuleId(input);
  const moduleDir = getModuleDir(input);
  const mod = getModuleConfig(progress, moduleId, input);
  const producerType = stageProducerType(input, opts);

  if (!producerType) return missingProducerControl(config, input, stageId);

  if (!moduleDir) {
    return buildModuleValidatorControlResult(config, {
      passed: false,
      blocked: true,
      error: 'delivery_lint requires moduleDir',
    }, baseValidatorOpts(config, input, stageId, { producerType, executionFailed: true, ...EXECUTION_FAILED_VALIDATOR_POLICY }));
  }

  const result = runDeliveryLintValidation(mod, moduleDir, config);
  return buildModuleValidatorControlResult(config, {
    ...result,
    summary: result.passed
      ? 'Delivery lint passed'
      : formatValidationFailures(result.failures),
  }, baseValidatorOpts(config, input, stageId, { producerType, ...moduleValidatorControlPolicy(result) }));
}

export async function runPreCheckValidatorStage(config, progress = {}, input = {}, opts = {}) {
  const stageId = opts.stageId || input?.ids?.stageId || 'validator:pre_check';
  const moduleId = getModuleId(input);
  const moduleDir = getModuleDir(input);
  const status = getModuleStatus(input);
  const producerType = stageProducerType(input, opts);

  if (!producerType) return missingProducerControl(config, input, stageId);

  if (!moduleDir || !moduleId) {
    return buildModuleValidatorControlResult(config, {
      passed: false,
      blocked: true,
      error: 'pre_check requires moduleId and moduleDir',
    }, baseValidatorOpts(config, input, stageId, { producerType, executionFailed: true, ...EXECUTION_FAILED_VALIDATOR_POLICY }));
  }

  const result = await runPreCheck(config, moduleDir, status, moduleId);
  return buildModuleValidatorControlResult(config, {
    ...result,
    summary: result.passed ? 'Pre-check passed' : result.error || 'Pre-check failed',
  }, baseValidatorOpts(config, input, stageId, { producerType, ...moduleValidatorControlPolicy(result) }));
}

function classifyFullLintResult(report = null, error = null) {
  if (!report) {
    return {
      passed: false,
      blocked: true,
      error: error || 'Full lint report unavailable',
      tool_error: true,
      report: null,
    };
  }

  const totalErrors = Number(report?.summary?.total_errors || 0);
  const toolsFailed = Number(report?.summary?.tools_failed || 0);
  if (toolsFailed > 0) {
    return {
      passed: false,
      blocked: true,
      error: `Full lint tooling failed in ${toolsFailed} tool(s)`,
      tool_error: true,
      report,
    };
  }
  return {
    passed: totalErrors === 0,
    error: totalErrors === 0 ? null : `FULL LINT FAILED: ${totalErrors} static analysis error(s).`,
    report,
  };
}

export function runFullLintValidatorStage(config, progress = {}, input = {}, opts = {}) {
  const stageId = opts.stageId || input?.ids?.stageId || 'validator:full_lint';
  const moduleId = getModuleId(input);
  const moduleDir = getModuleDir(input);
  const moduleStatus = getModuleStatus(input);
  const producerType = stageProducerType(input, opts);
  if (!producerType) return missingProducerControl(config, input, stageId);
  const lintTier = input?.validator?.config?.tier || opts.lintTier || 'full';
  const logPath = input?.validator?.config?.logPath || opts.logPath || null;
  log('STEP', `Full lint validator: running tier ${lintTier}`);
  const { report, error } = generateLintReport(config, lintTier, {
    moduleDir,
    moduleId: moduleId || getGateId(input) || 'full_lint',
    forgeDiffStat: moduleStatus?.forge_diff_stat || null,
    commitHash: resolveModuleCommit(moduleStatus),
    logPath,
  });
  const archivePath = archiveFullLintReport(config, report, input, moduleDir, stageId);
  const result = classifyFullLintResult(report, error);
  return buildModuleValidatorControlResult(config, {
    ...result,
    summary: result.passed
      ? 'Full lint passed'
      : result.error || 'Full lint failed',
  }, baseValidatorOpts(config, input, stageId, {
    producerType,
    ...moduleValidatorControlPolicy(result),
    scope: moduleId ? 'module' : 'pipeline',
    reportArtifact: archivePath,
  }));
}
