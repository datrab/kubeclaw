import { log } from '../core/logger.ts';
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { requireStageHandler, resolveStageOwner } from '../core/registry-access.ts';
import { createContractInvalidError, getContractInvalidDiagnostic, isContractInvalidError } from '../services/contract-diagnostics.ts';
import {
  buildArchitectureValidatorControlResult,
  coerceArchitectureValidatorControlResult,
} from '../services/arch-validator.ts';
import {
  buildModuleValidatorControlResult,
  normalizeTypedValidatorControlResult,
  validateTypedValidatorControlResult,
} from '../services/contracts/validator-control-result.ts';
import {
  normalizeGeneratorResult,
  validateGeneratorResult,
} from '../services/contracts/generator-result.ts';
import { releaseGateFiles, syncControlFiles } from '../services/blueprint.ts';
import {
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
  buildPipelineStepResult,
  buildPipelineStepResultFromControlResult,
} from '../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';
import {
  loadAuthoritativeModuleState,
  hasAnyStartedModules,
  projectPipelineGateState,
} from './pipeline-runner-shared.ts';
import { checkDependencies as checkModuleDependencies } from '../services/dependencies.ts';
import {
  buildStagePluginInvocation,
  buildStageRefs,
} from './stage-envelope-primitives.ts';
import { countByStatus, buildGeneratorArtifactRefs } from './pipeline-runner-scheduling/snapshots.ts';
import { resolveGateTargetModule } from './gate-target-module.ts';
import {
  isScheduledValidatorComplete,
  markScheduledValidatorComplete,
} from './pipeline-runner-scheduling/validator-completions.ts';
import { getArchValidationConfig, getReviewDefaultsConfig } from '../services/runtime-defaults.ts';
import { buildDependencyGraph, collectReadyBatch } from '../scheduler.ts';
import {
  buildGeneratorRunInput, buildGeneratorPluginInvocation,
  buildValidatorRunInput, buildValidatorPluginInvocation,
  optionalText, recordOrEmpty, requiredGeneratorMode, stageTypeFromStageId,
} from './pipeline-runner-scheduling-inputs.ts';
import {
  buildFailedValidatorControlResult, normalizeScheduledValidatorResult,
  projectValidatorControlResultToStepResult, validateGeneratorExecutionResult,
  normalizeGeneratorExecutionResult, failedGeneratorResult,
} from './pipeline-runner-scheduling-results.ts';
export { projectValidatorControlResultToStepResult } from './pipeline-runner-scheduling-results.ts';
export { runScheduledValidator, runScheduledGenerator } from './pipeline-runner-scheduling-execution.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

const loggedConsumedGateKeys = new Set<string>();

function logGateConsumedOnce(config: AnyRecord, gateId: string, status: string, source: string) {
  const runId = selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => ('run_unknown'));
  const key = `${runId}:${gateId}:${status}:${source}`;
  if (loggedConsumedGateKeys.has(key)) return;
  loggedConsumedGateKeys.add(key);
  log('DEBUG', `Gate '${gateId}' already consumed via gate read model (${status}, source=${source}) — skipping`);
}
export { isScheduledValidatorComplete, markScheduledValidatorComplete };

type AnyRecord = Record<string, any>;

const EXECUTION_FAILED_VALIDATOR_POLICY = Object.freeze({ nextAction: 'block', issueType: 'environment', outcomeClass: 'execution_failed' });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeScheduleRef(progress: AnyRecord, ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref) return null;
  const normalized = ref.trim();
  if (!normalized) return null;
  if (selectTruthyValue(() => (selectTruthyValue(() => (normalized.startsWith('module:')), () => (normalized.startsWith('gate:')))), () => (normalized.startsWith('validator:')))) return normalized;
  if (progress?.modules?.[normalized]) return `module:${normalized}`;
  if (progress?.gates?.[normalized]) return `gate:${normalized}`;
  return normalized;
}

function normalizeValidatorScheduleEntry(progress: AnyRecord, entry: AnyRecord = {}, index: any = 0): AnyRecord | null {
  const stage = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (optionalText(entry.stage)), () => (optionalText(entry.validator)))), () => (optionalText(entry.validator_stage)))), () => (optionalText(entry.id)));
  if (typeof stage !== 'string' || !stage.startsWith('validator:')) return null;
  const after = normalizeScheduleRef(progress, selectDefinedValue(() => (optionalText(entry.after)), () => (optionalText(entry.after_step))));
  const before = normalizeScheduleRef(progress, selectDefinedValue(() => (optionalText(entry.before)), () => (optionalText(entry.before_step))));
  const timing = before ? 'before' : (after ? 'after' : 'inline');
  const ref = selectDefinedValue(() => (selectDefinedValue(() => (before), () => (after))), () => (`schedule:${index}`));
  const scope = selectDefinedValue(() => (optionalText(entry.scope)), () => ('pipeline'));
  const key = selectDefinedValue(() => (optionalText(entry.key)), () => (`${timing}:${ref}:${stage}:${scope}:${index}`));
  return {
    ...entry,
    stage,
    after,
    before,
    timing,
    ref,
    scope,
    key,
    orderIndex: selectDefinedValue(() => (entry.orderIndex), () => (index)),
    mode: selectDefinedValue(() => (optionalText(entry.mode)), () => ('mandatory')),
  };
}

export function resolveConfiguredValidatorSchedule(progress: AnyRecord = {}): AnyRecord[] {
  const rawSchedule = Array.isArray(progress?.validators?.schedule) ? progress.validators.schedule : [];
  return rawSchedule
    .map((entry: any, index: number) => normalizeValidatorScheduleEntry(progress, entry, index))
    .filter(Boolean);
}

function normalizeExecutionModuleId(progress: AnyRecord, stepId: unknown): string | null {
  if (typeof stepId !== 'string' || !stepId.trim() || stepId.startsWith('gate:') || stepId.startsWith('validator:')) return null;
  const moduleId = stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
  if (!moduleId) return null;
  return progress?.modules?.[moduleId] ? moduleId : null;
}

function moduleDependencyIds(progress: AnyRecord, moduleId: string): string[] {
  const dependsOn = Array.isArray(progress?.modules?.[moduleId]?.depends_on) ? progress.modules[moduleId].depends_on : [];
  return dependsOn
    .map((dependency: string) => String(selectDefinedValue(() => (dependency), () => (''))).replace(/^module:/, ''))
    .filter((dependency: string) => dependency && progress?.modules?.[dependency]);
}

function moduleIsReadyForBatch(config: AnyRecord, progress: AnyRecord, moduleId: string, deps: AnyRecord = {}): boolean {
  const lifecycleModule = loadAuthoritativeModuleState(config, progress, moduleId);
  if (selectTruthyValue(() => (lifecycleModule?.status === STATUS.PASS), () => (lifecycleModule?.status === STATUS.BLOCKED))) return false;
  const dependencyState = checkModuleDependencies(config, progress, moduleId);
  return dependencyState?.met === true;
}

function collectReadyModuleBatch(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}, startIndex: any = 0): string[] {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const moduleOrder = executionOrder.map((stepId: unknown) => normalizeExecutionModuleId(progress, stepId)).filter(Boolean) as string[];
  const graph = buildDependencyGraph(moduleOrder.map((moduleId: any) => ({
    id: moduleId,
    dependencies: moduleDependencyIds(progress, moduleId),
  })));
  return collectReadyBatch({
    orderedIds: moduleOrder,
    startIndex,
    dependencyIds: (moduleId: any) => graph.dependencyIds(moduleId),
    isCandidateReady: (moduleId: any) => moduleIsReadyForBatch(config, progress, moduleId, deps),
  });
}

function moduleOrderIndex(progress: AnyRecord, moduleId: string): number {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const moduleOrder = executionOrder.map((stepId: unknown) => normalizeExecutionModuleId(progress, stepId)).filter(Boolean) as string[];
  const index = moduleOrder.indexOf(moduleId);
  return index >= 0 ? index : 0;
}

function scheduleMatchesRef(schedule: AnyRecord = {}, timing: string, ref: string): boolean {
  return schedule?.timing === timing && schedule?.ref === ref;
}

function buildValidatorNextStep(schedule: AnyRecord, reason: string | null = null): AnyRecord {
  return {
    type: 'validator',
    id: schedule.stage,
    schedule: {
      ...schedule,
      scheduleReason: selectDefinedValue(() => (selectDefinedValue(() => (optionalText(reason)), () => (optionalText(schedule.scheduleReason)))), () => (optionalText(schedule.reason))),
    },
  };
}

function firstPendingScheduledValidator(config: AnyRecord, progress: AnyRecord, timing: string, ref: string): AnyRecord | null {
  const schedules = resolveConfiguredValidatorSchedule(progress);
  for (const schedule of schedules) {
    if (!scheduleMatchesRef(schedule, timing, ref)) continue;
    if (isScheduledValidatorComplete(config, String(schedule.key))) continue;
    return buildValidatorNextStep(schedule, `progress_json_${timing}_${ref}`);
  }
  return null;
}

function mandatoryReviewFullLintSchedule(config: AnyRecord, progress: AnyRecord, gateId: string, gate: AnyRecord): AnyRecord | null {
  if (gate?.['type'] !== 'review') return null;
  if (!resolveStageOwner(config, 'validator.run', 'validator:full_lint')) return null;
  const targetModule = resolveGateTargetModule(progress, gateId);
  const reviewDefaults = getReviewDefaultsConfig(config);
  return {
    stage: 'validator:full_lint',
    timing: 'before',
    before: `gate:${gateId}`,
    ref: `gate:${gateId}`,
    scope: targetModule.moduleId ? 'module' : 'pipeline',
    mode: 'mandatory',
    key: `mandatory:before:gate:${gateId}:validator:full_lint`,
    gateId,
    moduleId: targetModule.moduleId,
    scheduleReason: 'mandatory_full_lint_before_review',
    validatorConfig: {
      tier: selectDefinedValue(() => (optionalText(gate?.lint_tier)), () => (reviewDefaults.lint_tier)),
    },
  };
}

function inlineValidatorStep(config: AnyRecord, stepId: string) {
  const schedule = { stage: stepId, timing: 'inline', ref: stepId, scope: 'pipeline', mode: 'mandatory', key: `execution_order:${stepId}`, scheduleReason: 'execution_order' };
  return isScheduledValidatorComplete(config, schedule.key) ? null : buildValidatorNextStep(schedule, 'execution_order');
}

function nextGateStep(config: AnyRecord, progress: AnyRecord, gateId: string, deps: AnyRecord) {
  const gate = progress?.gates?.[gateId];
  const projection = projectPipelineGateState(config, gateId, gate, deps);
  if (projection?.scheduler_consumed === true || projection?.completed === true) {
    logGateConsumedOnce(config, gateId, projection?.status ?? 'GATE_STATUS_CONSUMED', projection?.completion_source ?? 'gate_read_model');
    return firstPendingScheduledValidator(config, progress, 'after', `gate:${gateId}`) ?? { type: 'continue' };
  }
  const before = firstPendingScheduledValidator(config, progress, 'before', `gate:${gateId}`);
  if (before) return before;
  const fullLint = mandatoryReviewFullLintSchedule(config, progress, gateId, gate);
  if (fullLint && !isScheduledValidatorComplete(config, String(fullLint.key))) return buildValidatorNextStep(fullLint, fullLint.scheduleReason);
  return { type: 'gate', id: gateId };
}

function terminalOrResumedModuleStep(config: AnyRecord, progress: AnyRecord, moduleId: string, state: AnyRecord) {
  if (state?.status === STATUS.PASS) return firstPendingScheduledValidator(config, progress, 'after', `module:${moduleId}`) ?? { type: 'continue' };
  if (state?.status === STATUS.BLOCKED) return { type: 'blocked', id: moduleId };
  if (state?.status === STATUS.FAIL) log('INFO', `Module ${moduleId} is FAIL (${Number(state.fail_count ?? 0)} attempts) — will retry`);
  else if (state?.status && state.status !== STATUS.PENDING) log('INFO', `Module ${moduleId} resuming from ${state.status}`);
  return null;
}

function readyModuleStep(config: AnyRecord, progress: AnyRecord, moduleId: string, deps: AnyRecord) {
  const readyBatch = collectReadyModuleBatch(config, progress, deps, moduleOrderIndex(progress, moduleId));
  if (readyBatch.length <= 1 || readyBatch[0] !== moduleId) return { type: 'module', id: moduleId };
  log('INFO', `Running ready module batch: ${readyBatch.join(', ')}`);
  return { type: 'module_batch', ids: readyBatch };
}

function nextModuleStep(config: AnyRecord, progress: AnyRecord, stepId: string, deps: AnyRecord) {
  const moduleId = stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
  if (!moduleId) throw new Error(`Invalid execution_order step '${stepId}': module id is required`);
  if (!progress.modules?.[moduleId]) throw new Error(`Invalid execution_order step '${String(stepId)}': no typed module/gate/validator target exists`);
  const state = loadAuthoritativeModuleState(config, progress, moduleId);
  return terminalOrResumedModuleStep(config, progress, moduleId, state) ?? readyModuleStep(config, progress, moduleId, deps);
}

export function findNextStep(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}): AnyRecord {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  for (const stepId of executionOrder) {
    if (typeof stepId === 'string' && stepId.startsWith('validator:')) {
      const validator = inlineValidatorStep(config, stepId);
      if (validator) return validator;
      continue;
    }
    if (typeof stepId === 'string' && stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gateStep = nextGateStep(config, progress, gateId, deps);
      if (gateStep.type !== 'continue') return gateStep;
      continue;
    }
    if (typeof stepId !== 'string' || !stepId.trim()) {
      throw new Error(`Invalid execution_order step '${String(stepId)}': expected module id, module:<id>, gate:<id>, or validator:<id>`);
    }
    const moduleStep = nextModuleStep(config, progress, stepId, deps);
    if (moduleStep.type !== 'continue') return moduleStep;
  }
  return { type: 'done' };
}

function appendStartupDegradedEvidence(config: AnyRecord, evidence: unknown): void {
  const entries = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  if (entries.length === 0) return;
  if (!Array.isArray(config._startupDegradedEvidence)) config._startupDegradedEvidence = [];
  config._startupDegradedEvidence.push(...entries);
}

export async function preparePipeline(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}) {
  try {
    const result = await releaseGateFiles(config, progress);
    appendStartupDegradedEvidence(config, result?.degraded);
  }
  catch (e: any) {
    const evidence = { code: 'blueprint_gate_release_failed', surface: 'release_gate_files', message: errorMessage(e) };
    appendStartupDegradedEvidence(config, evidence);
    log('WARN', `Gate files release failed (non-critical): ${errorMessage(e)}`);
  }

  try {
    const result = await syncControlFiles(config, progress);
    appendStartupDegradedEvidence(config, result?.degraded);
  }
  catch (e: any) {
    const evidence = { code: 'blueprint_control_sync_failed', surface: 'sync_control_files', message: errorMessage(e) };
    appendStartupDegradedEvidence(config, evidence);
    log('WARN', `Control file sync failed (non-critical): ${errorMessage(e)}`);
  }
}
