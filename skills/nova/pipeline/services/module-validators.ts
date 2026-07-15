import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
const INVALID_VALIDATOR_PRODUCER = 'invalid_validator_producer';
const DELIVERY_LINT_STAGE_ID = 'validator:delivery_lint';
const PRE_CHECK_STAGE_ID = 'validator:pre_check';
const FULL_LINT_STAGE_ID = 'validator:full_lint';
const FULL_LINT_TIER = 'full';
const FULL_LINT_TARGET_ID = 'full_lint';
const PRE_CHECK_FAILED_SUMMARY = 'Pre-check failed';
const FULL_LINT_FAILED_SUMMARY = 'Full lint failed';
const FULL_LINT_REPORT_UNAVAILABLE = 'Full lint report unavailable';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function requireNonEmptyString(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) throw new Error(`${label}: required non-empty string`);
  return value.trim();
}

function numericCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stageProducerType(input = {}, opts = {}) {
  const producerType = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (opts.producerType), () => (input?.validator?.producerType))), () => (input?.ids?.producerType))), () => (null));
  return typeof producerType === 'string' && producerType.trim() ? producerType.trim() : null;
}

function getModuleId(input = {}) {
  return selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (input?.ids?.moduleId), () => (input?.module?.moduleId))), () => (input?.module_id))), () => (null));
}

function getModuleDir(input = {}) {
  if (input?.executionContext?.moduleDir !== undefined) return input.executionContext.moduleDir;
  if (input?.module?.dir !== undefined) return input.module.dir;
  if (input?.ids?.moduleDir !== undefined) return input.ids.moduleDir;
  return selectDefinedValue(() => (input?.module_dir), () => (null));
}

function getModuleConfig(progress = {}, moduleId = null, input = {}) {
  let config = null;
  if (input?.module?.config !== undefined) config = input.module.config;
  else if (input?.moduleConfig !== undefined) config = input.moduleConfig;
  else if (moduleId) config = selectDefinedValue(() => (progress?.modules?.[moduleId]), () => (null));
  return objectRecord(config);
}

function getModuleStatus(input = {}) {
  let status = null;
  if (input?.stateSnapshot?.module?.statusRaw !== undefined) status = input.stateSnapshot.module.statusRaw;
  else if (input?.module?.status !== undefined) status = input.module.status;
  else status = selectDefinedValue(() => (input?.status), () => (null));
  return objectRecord(status);
}

function getGateId(input = {}) {
  return selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (input?.ids?.gateId), () => (input?.gate?.gateId))), () => (input?.gate_id))), () => (null));
}
function lintArtifactPart(value = null) {
  const raw = requireNonEmptyString(value, 'lint artifact identity');
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  if (!safe) throw new Error('lint artifact identity: no safe artifact token characters');
  return safe;
}
function lintScheduleKey(input = {}, stageId) {
  if (input?.executionContext?.scheduleKey !== undefined) return requireNonEmptyString(input.executionContext.scheduleKey, 'validator scheduleKey');
  if (input?.refs?.validatorResultRef !== undefined) return requireNonEmptyString(input.refs.validatorResultRef, 'validatorResultRef');
  return requireNonEmptyString(stageId, 'validator stageId');
}
function archiveFullLintReport(config, report = null, input = {}, moduleDir = null, stageId = 'validator:full_lint') {
  if (!report) return null;
  const gateId = getGateId(input), runLogDir = resolvePipelineRunLogDir(config);
  const lintDir = moduleDir
    ? moduleLintLogDir(config, moduleDir)
    : (gateId ? gateLintLogDir(config, gateId) : (runLogDir ? path.join(runLogDir, 'lint') : null));
  if (!lintDir) return null;
  const scheduleKey = lintScheduleKey(input, stageId);
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
    producerType: selectPresentValue(producerType, INVALID_VALIDATOR_PRODUCER),
    stageId,
    moduleId: getModuleId(input),
    moduleDir: getModuleDir(input),
    runId: requireNonEmptyString(getRunId(config), 'pipeline run id'),
    scope: input?.ids?.moduleId ? 'module' : 'pipeline',
    validatorRef: selectTruthyValue(() => (input?.refs?.validatorResultRef), () => (null)),
    ...extra,
  };
}

function moduleValidatorControlPolicy(result = {}) {
  if (result?.passed === true) return { nextAction: 'pass', outcomeClass: 'passed' };
  if (selectTruthyValue(() => (result?.blocked === true), () => (result?.tool_error === true))) {
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
    producerType: INVALID_VALIDATOR_PRODUCER,
    executionFailed: true,
    nextAction: 'block',
    issueType: 'environment',
    outcomeClass: 'invalid_validator_metadata',
  }));
}

export function runDeliveryLintValidatorStage(config, progress = {}, input = {}, opts = {}) {
  const stageId = selectPresentValue(opts.stageId, input?.ids?.stageId, DELIVERY_LINT_STAGE_ID);
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
  const stageId = selectPresentValue(opts.stageId, input?.ids?.stageId, PRE_CHECK_STAGE_ID);
  const moduleId = getModuleId(input);
  const moduleDir = getModuleDir(input);
  const status = getModuleStatus(input);
  const producerType = stageProducerType(input, opts);

  if (!producerType) return missingProducerControl(config, input, stageId);

  if (selectTruthyValue(() => (!moduleDir), () => (!moduleId))) {
    return buildModuleValidatorControlResult(config, {
      passed: false,
      blocked: true,
      error: 'pre_check requires moduleId and moduleDir',
    }, baseValidatorOpts(config, input, stageId, { producerType, executionFailed: true, ...EXECUTION_FAILED_VALIDATOR_POLICY }));
  }

  const result = await runPreCheck(config, moduleDir, status, moduleId);
  return buildModuleValidatorControlResult(config, {
    ...result,
    summary: result.passed ? 'Pre-check passed' : selectPresentValue(result.error, PRE_CHECK_FAILED_SUMMARY),
  }, baseValidatorOpts(config, input, stageId, { producerType, ...moduleValidatorControlPolicy(result) }));
}

function classifyFullLintResult(report = null, error = null) {
  if (!report) {
    return {
      passed: false,
      blocked: true,
      error: selectPresentValue(error, FULL_LINT_REPORT_UNAVAILABLE),
      tool_error: true,
      report: null,
    };
  }

  const totalErrors = numericCount(report?.summary?.total_errors);
  const toolsFailed = numericCount(report?.summary?.tools_failed);
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
  const stageId = selectPresentValue(opts.stageId, input?.ids?.stageId, FULL_LINT_STAGE_ID);
  const moduleId = getModuleId(input);
  const moduleDir = getModuleDir(input);
  const moduleStatus = getModuleStatus(input);
  const producerType = stageProducerType(input, opts);
  if (!producerType) return missingProducerControl(config, input, stageId);
  const lintTier = selectPresentValue(input?.validator?.config?.tier, opts.lintTier, FULL_LINT_TIER);
  const logPath = selectTruthyValue(() => (selectTruthyValue(() => (input?.validator?.config?.logPath), () => (opts.logPath))), () => (null));
  log('STEP', `Full lint validator: running tier ${lintTier}`);
  const { report, error } = generateLintReport(config, lintTier, {
    moduleDir,
    moduleId: selectPresentValue(moduleId, getGateId(input), FULL_LINT_TARGET_ID),
    forgeDiffStat: selectTruthyValue(() => (moduleStatus?.forge_diff_stat), () => (null)),
    commitHash: resolveModuleCommit(moduleStatus),
    logPath,
  });
  const archivePath = archiveFullLintReport(config, report, input, moduleDir, stageId);
  const result = classifyFullLintResult(report, error);
  return buildModuleValidatorControlResult(config, {
    ...result,
    summary: result.passed
      ? 'Full lint passed'
      : selectPresentValue(result.error, FULL_LINT_FAILED_SUMMARY),
  }, baseValidatorOpts(config, input, stageId, {
    producerType,
    ...moduleValidatorControlPolicy(result),
    scope: moduleId ? 'module' : 'pipeline',
    reportArtifact: archivePath,
  }));
}
