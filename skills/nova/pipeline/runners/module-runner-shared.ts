// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { getActiveContext } from '../core/logger.ts';
import {
  STATUS,
} from '../core/constants.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { ensurePipelineRunLogDir } from '../core/paths.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
} from '../services/correlation.ts';
import { normalizeTypedWorkerControlResult } from '../services/contracts/worker-control-result.ts';
import { cloneSerializable } from '../services/serialization.ts';
import {
  runModuleForgeWorker,
  runModuleBusterWorker,
  coerceModuleForgeWorkerControlResult,
  coerceModuleBusterWorkerControlResult,
} from '../agents/orchestration.ts';
import {
  onModuleFail,
  onRetryExhausted,
  onModuleBlocked,
} from '../services/telemetry.ts';
import {
  buildStagePluginInvocation,
  buildStageRefs,
  collectExistingArtifactRefs,
} from './stage-envelope-primitives.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function optionalText(value: unknown): string | null {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const text = String(value);
  return text.trim() ? text : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = optionalText(value);
    if (text !== null) return text;
  }
  return null;
}

function selectPresentValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label}: required non-empty string`);
  return text;
}

function arrayOrEmpty(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function cloneArrayOrEmpty(value: unknown): any[] {
  return cloneSerializable(arrayOrEmpty(value));
}

function cloneRecordOrEmpty(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? cloneSerializable(value)
    : {};
}

function moduleRoot(config: AnyRecord, dir: string): string {
  return path.join(requiredText(config?.paths?.modules_dir, 'config.paths.modules_dir'), requiredText(dir, 'module.dir'));
}

function repoRoot(config: AnyRecord): string {
  return requiredText(config?.repo_root, 'config.repo_root');
}

function moduleStages(mod: AnyRecord): string[] {
  return Array.isArray(mod?.stages) ? [...mod.stages] : [];
}

function failCount(status: AnyRecord): number {
  if (selectTruthyValue(() => (status?.fail_count === undefined), () => (status?.fail_count === null))) return 0;
  const value = Number(status.fail_count);
  if (selectTruthyValue(() => (!Number.isInteger(value)), () => (value < 0))) throw new Error('status.fail_count: expected non-negative integer');
  return value;
}

function requiredAttempt(value: unknown, status: AnyRecord): number {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return currentAttemptNumber(status);
  const attempt = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) throw new Error('module_worker.attempt: expected positive integer');
  return attempt;
}

function stageTypeFromStageId(stageId: unknown, prefix: string): string {
  const text = requiredText(stageId, 'stageId');
  const [actualPrefix, stageType] = text.split(':');
  if (selectTruthyValue(() => (actualPrefix !== prefix), () => (!stageType))) throw new Error(`stageId: expected '${prefix}:<type>'`);
  return stageType;
}

function initialBusterAttempt(value: unknown): number {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return 1;
  const attempt = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) throw new Error('busterAttempt: expected positive integer');
  return attempt;
}

function commitHashFromStatus(status: AnyRecord): string | null {
  return firstText(
    status?.commit_hash,
    status?.forge_commit_hash,
    status?.buster_commit_hash,
    status?.forge_commit,
    status?.buster_commit,
  );
}

function cloneOrNull(value: unknown): unknown {
  return value === undefined ? null : cloneSerializable(value);
}

export function _telemetryCtx(config: AnyRecord, deps: AnyRecord | null = null) {
  const active = getActiveContext();
  return { ...(selectDefinedValue(() => (active), () => ({ config, runId: requiredText(getRunId(config), 'run_id') }))), deps };
}

export function computeElapsedSeconds(fromIso: unknown, toIso = new Date().toISOString()) {
  if (!fromIso) return 0;
  const delta = new Date(String(toIso)).getTime() - new Date(String(fromIso)).getTime();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : 0;
}

export function getAttemptStartedAt(status: AnyRecord) {
  return selectTruthyValue(() => (selectTruthyValue(() => (status?.attempt_started_at), () => (status?.started_at))), () => (null));
}

export function getPhaseStartedAt(status: AnyRecord) {
  if (status?.phase_started_at !== undefined && status.phase_started_at !== null && status.phase_started_at !== '') return status.phase_started_at;
  return getAttemptStartedAt(status);
}

function requiredDispatchId(status: AnyRecord, dispatchId: unknown, label: string): string {
  if (dispatchId !== null && dispatchId !== undefined) return requiredText(dispatchId, label);
  return requiredText(resolveStatusDispatchId(status), 'status.dispatch_id');
}

function requiredGatewayLabel(status: AnyRecord, gatewayLabel: unknown, label: string): string {
  if (gatewayLabel !== null && gatewayLabel !== undefined) return requiredText(gatewayLabel, label);
  return requiredText(resolveStatusGatewayLabel(status), 'status.gateway_label');
}

function requiredSessionKey(status: AnyRecord, sessionKey: unknown, label: string): string {
  if (sessionKey !== null && sessionKey !== undefined) return requiredText(sessionKey, label);
  return requiredText(resolveStatusSessionKey(status), 'status.session_key');
}

function invocationAttempt(status: AnyRecord, opts: AnyRecord = {}): number {
  if (opts?.attempt !== undefined) return requiredAttempt(opts.attempt, status);
  return currentAttemptNumber(status);
}

export function formatDurationCompact(seconds: unknown) {
  const numericSeconds = Number(seconds);
  const total = Number.isFinite(numericSeconds) ? Math.max(0, Math.round(numericSeconds)) : 0;
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return secs ? `${hours}h ${minutes}m ${secs}s` : `${hours}h ${minutes}m`;
  return secs ? `${minutes}m ${secs}s` : `${minutes}m`;
}

export function buildTerminalBusterCrashFailEvent(status: AnyRecord, mod: AnyRecord, model: unknown, oldStatus: unknown, reason: unknown, {
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
}: AnyRecord = {}) {
  const resolvedDispatchId = requiredDispatchId(status, dispatchId, 'buster crash dispatchId');
  return {
    title: firstText(mod?.title, status?.title),
    old_status: selectPresentValue(oldStatus, status?.status),
    attempt: currentAttemptNumber(status),
    phase: 'buster',
    model: firstText(model, status?.active_agent?.model),
    dispatch_id: resolvedDispatchId,
    gateway_label: requiredGatewayLabel(status, gatewayLabel, 'buster crash gatewayLabel'),
    session_key: requiredSessionKey(status, sessionKey, 'buster crash sessionKey'),
    duration_seconds: computeElapsedSeconds(getPhaseStartedAt(status)),
    cost_estimate_usd: null,
    commit_hash: commitHashFromStatus(status),
    reason: selectPresentValue(reason),
  };
}

export function buildTerminalModuleFailEvent(status: AnyRecord, mod: AnyRecord, phase: unknown, model: unknown, oldStatus: unknown, reason: unknown, {
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
}: AnyRecord = {}) {
  const resolvedDispatchId = requiredDispatchId(status, dispatchId, 'module fail dispatchId');
  return {
    title: firstText(mod?.title, status?.title),
    old_status: selectDefinedValue(() => (selectDefinedValue(() => (oldStatus), () => (status?.status))), () => (null)),
    attempt: currentAttemptNumber(status),
    phase: firstText(phase, status?.current_phase),
    model: firstText(model, status?.active_agent?.model),
    dispatch_id: resolvedDispatchId,
    gateway_label: requiredGatewayLabel(status, gatewayLabel, 'module fail gatewayLabel'),
    session_key: requiredSessionKey(status, sessionKey, 'module fail sessionKey'),
    duration_seconds: computeElapsedSeconds(selectDefinedValue(() => (getPhaseStartedAt(status)), () => (getAttemptStartedAt(status)))),
    cost_estimate_usd: null,
    commit_hash: commitHashFromStatus(status),
    reason: selectPresentValue(reason),
  };
}

export function emitTerminalModuleFailTelemetry(config: AnyRecord, moduleId: string, status: AnyRecord, mod: AnyRecord, phase: unknown, model: unknown, oldStatus: unknown, reason: unknown, correlation: AnyRecord = {}, explicitDeps: AnyRecord | null = null) {
  onModuleFail(_telemetryCtx(config, explicitDeps), moduleId, buildTerminalModuleFailEvent(status, mod, phase, model, oldStatus, reason, correlation));
}

export async function emitTerminalBusterCrashTelemetry(config: AnyRecord, moduleId: string, failEvent: AnyRecord, blockedReason: unknown, retryBudget: unknown, explicitDeps: AnyRecord | null = null) {
  const ctx = _telemetryCtx(config, explicitDeps);
  await onModuleFail(ctx, moduleId, failEvent);
  await onRetryExhausted(ctx, moduleId, {
    attempt: selectDefinedValue(() => (failEvent?.attempt), () => (null)),
    phase: firstText(failEvent?.phase),
    dispatch_id: selectDefinedValue(() => (failEvent?.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (failEvent?.gateway_label), () => (null)),
    session_key: resolveResultSessionKey(failEvent),
    max_attempts: selectDefinedValue(() => (retryBudget), () => (null)),
    max_fails: selectDefinedValue(() => (retryBudget), () => (null)),
    reason: selectPresentValue(failEvent?.reason, blockedReason),
  });
  await onModuleBlocked(ctx, moduleId, {
    ...failEvent,
    old_status: STATUS.FAIL,
    reason: selectPresentValue(blockedReason, failEvent?.reason),
  });
}

export function setLogScope(moduleId: unknown, phase: unknown) {
  const ctx = getActiveContext();
  if (ctx) {
    if (moduleId !== undefined) ctx._logModule = moduleId;
    if (phase !== undefined) ctx._logPhase = phase;
  }
}

export function currentAttemptNumber(status: AnyRecord) {
  return failCount(status) + 1;
}

export function ensureValidationState(status: AnyRecord) {
  const attempt = currentAttemptNumber(status);
  if (selectTruthyValue(() => (!status.validation), () => (status.validation.attempt !== attempt))) {
    status.validation = {
      attempt,
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    };
  }
  return status.validation;
}

export function markValidationPassed(status: AnyRecord, key: string) {
  const validation = ensureValidationState(status);
  validation[key] = true;
  validation[`${key}_at`] = new Date().toISOString();
}

export function getModuleStats(config: AnyRecord) {
  return getRunStats(config);
}

export function ensureModulePluginLogDirs(config: AnyRecord) {
  ensurePipelineRunLogDir(config);
}

export function buildWorkerPluginEffects(config: AnyRecord, progress: AnyRecord, stageId: string, workerInput: AnyRecord, deps: AnyRecord) {
  const executeWorker = stageId === 'worker:module_buster'
    ? deps.runModuleBusterWorker
    : deps.runModuleForgeWorker;
  if (typeof executeWorker !== 'function') {
    throw new Error(`Module worker dispatch requires ${stageId === 'worker:module_buster' ? 'deps.runModuleBusterWorker' : 'deps.runModuleForgeWorker'}`);
  }

  return {
    workerRuntime: {
      dispatch: async () => executeWorker({ config, progress, workerInput, deps }),
    },
  };
}

function buildModuleArtifactRefs(config: AnyRecord, dir: string, mod: AnyRecord) {
  const root = moduleRoot(config, dir);
  const refs = [];
  if (Array.isArray(mod?.substeps) && mod.substeps.length > 0) {
    for (const substep of mod.substeps) {
      refs.push({
        type: 'forge_instructions',
        role: 'input',
        format: 'md',
        path: path.join(root, substep, 'FORGE.md'),
      });
    }
  } else {
    refs.push({
      type: 'forge_instructions',
      role: 'input',
      format: 'md',
      path: path.join(root, 'FORGE.md'),
    });
  }

  return collectExistingArtifactRefs(refs);
}

function buildModuleWorkerRunInputBase(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, {
  attempt,
  stageId,
  refs = {},
  ids = {},
  worker = {},
  artifacts = null,
  stateSnapshot = null,
  executionContext = {},
  deadline = null,
}: AnyRecord = {}) {
  const runId = getRunId(config);
  return {
    refs: buildStageRefs({
      runRef: { prefix: 'run', parts: [runId] },
      moduleRef: { prefix: 'module', parts: [moduleId] },
      moduleAttemptRef: { prefix: 'module_attempt', parts: [runId, moduleId, attempt] },
      ...refs,
    }),
    ids: { runId, moduleId, attempt, stageId, ...ids },
    worker,
    workspace: {
      repoRoot: repoRoot(config),
      moduleDir: moduleRoot(config, dir),
    },
    artifacts: selectDefinedValue(() => (artifacts), () => (buildModuleArtifactRefs(config, dir, mod))),
    stateSnapshot,
    executionContext,
    ...(deadline ? { deadline } : {}),
  };
}

function buildModuleWorkerDeadline(status: AnyRecord, timeoutMinutes: unknown) {
  return {
    timeoutMs: Number.isFinite(Number(timeoutMinutes)) ? Number(timeoutMinutes) * 60 * 1000 : null,
    startedAt: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.phase_started_at), () => (status?.attempt_started_at))), () => (status?.started_at))), () => (null)),
    deadlineAt: null,
  };
}

function buildModuleForgeStateSnapshot(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord) {
  return {
    pipeline: {
      project: selectTruthyValue(() => (config?.project), () => (null)),
      run_id: getRunId(config),
    },
    module: {
      module_id: moduleId,
      title: selectTruthyValue(() => (mod?.title), () => (null)),
      dir,
      stages: moduleStages(mod),
      status: selectTruthyValue(() => (status?.status), () => (null)),
      current_phase: selectTruthyValue(() => (status?.current_phase), () => (null)),
      fail_count: failCount(status),
      validation: cloneSerializable(selectTruthyValue(() => (status?.validation), () => (null))),
      active_agent: cloneSerializable(selectTruthyValue(() => (status?.active_agent), () => (null))),
      fail_summaries: cloneArrayOrEmpty(status?.fail_summaries),
    },
  };
}

export function buildModuleForgeRunInput(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord = {}) {
  const attempt = requiredAttempt(opts?.attempt, status);
  const stageId = 'worker:module_forge';
  return buildModuleWorkerRunInputBase(config, moduleId, mod, dir, status, {
    attempt,
    stageId,
    worker: {
      workerType: 'module_forge',
      config: {
        maxFails: selectDefinedValue(() => (opts?.maxFails), () => (null)),
      },
      backendConfig: {
        agentType: 'forge',
        model: optionalText(opts?.model),
        thinking: optionalText(opts?.thinking),
        thinkingSource: optionalText(opts?.thinkingSource),
        runtimeKind: 'session',
      },
    },
    stateSnapshot: buildModuleForgeStateSnapshot(config, moduleId, mod, dir, status),
    executionContext: {
      phase: 'forge',
      moduleDir: dir,
      timeoutMinutes: selectDefinedValue(() => (opts?.timeoutMinutes), () => (null)),
      headBefore: selectDefinedValue(() => (opts?.headBefore), () => (null)),
      novaPromptProvided: opts?.novaPromptProvided === true,
      recalledMemoryIds: Array.isArray(opts?.recalledMemoryIds) ? [...opts.recalledMemoryIds] : [],
    },
    deadline: buildModuleWorkerDeadline(status, opts?.timeoutMinutes),
  });
}

export function buildModuleValidatorRunInput(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  const attempt = requiredAttempt(opts?.attempt, status);
  const validatorName = stageTypeFromStageId(stageId, 'validator');
  const runId = getRunId(config);
  const validator = {
    validatorType: validatorName,
    producerType: validatorName,
    config: {
      ...(mod?.test_config && typeof mod.test_config === 'object' ? { test_config: cloneSerializable(mod.test_config) } : {}),
      ...(config?.pre_check && typeof config.pre_check === 'object' ? { pre_check: cloneSerializable(config.pre_check) } : {}),
    },
  };
  const module = {
      moduleId,
      dir,
      title: selectTruthyValue(() => (mod?.title), () => (null)),
      config: cloneRecordOrEmpty(mod),
      status: cloneRecordOrEmpty(status),
  };
  const runInput = buildModuleWorkerRunInputBase(config, moduleId, mod, dir, status, {
    attempt,
    stageId,
    refs: {
      validatorResultRef: { prefix: 'validator_result', parts: [runId, moduleId, validatorName, attempt] },
    },
    ids: {
      moduleDir: dir,
      validatorName,
      producerType: validatorName,
      scope: 'module',
    },
    stateSnapshot: {
      pipeline: {
        project: selectTruthyValue(() => (config?.project), () => (null)),
        run_id: getRunId(config),
      },
      module: {
        module_id: moduleId,
        title: selectTruthyValue(() => (mod?.title), () => (null)),
        dir,
        status: selectTruthyValue(() => (status?.status), () => (null)),
        current_phase: selectTruthyValue(() => (status?.current_phase), () => (null)),
        fail_count: failCount(status),
        validation: cloneSerializable(selectTruthyValue(() => (status?.validation), () => (null))),
        active_agent: cloneSerializable(selectTruthyValue(() => (status?.active_agent), () => (null))),
        statusRaw: cloneRecordOrEmpty(status),
      },
    },
    executionContext: {
      phase: requiredText(opts?.phase, 'validator.phase'),
      moduleDir: dir,
      attempt,
    },
  });
  return { ...runInput, validator, module };
}

export function buildModuleWorkerPluginInvocation(moduleId: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId,
    attempt: invocationAttempt(status, opts),
    dispatchId: opts?.dispatchId !== undefined ? requiredText(opts.dispatchId, 'module worker dispatchId') : optionalText(resolveStatusDispatchId(status)),
    sessionKey: resolveStatusSessionKey(status),
    gatewayLabel: resolveStatusGatewayLabel(status),
  });
}

export function buildModuleValidatorPluginInvocation(moduleId: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId,
    attempt: invocationAttempt(status, opts),
    causationRef: optionalText(opts?.causationRef),
  });
}

export function normalizeModuleForgeWorkerResult(config: AnyRecord, workerInput: AnyRecord, rawResult: unknown, opts: AnyRecord = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_forge',
    label: 'Module Forge',
    stageId: requiredText(opts?.stageId, 'module_forge.stageId'),
    moduleId: requiredText(opts?.moduleId, 'module_forge.moduleId'),
    input: workerInput,
    invocation: selectTruthyValue(() => (opts?.pluginInvocation), () => (null)),
    coerce: (result: unknown) => coerceModuleForgeWorkerControlResult(config, workerInput, result, opts),
  });
}

function buildModuleBusterArtifactRefs(config: AnyRecord, dir: string, mod: AnyRecord) {
  const root = moduleRoot(config, dir);
  const refs = [
    {
      type: 'buster_instructions',
      role: 'input',
      format: 'md',
      path: path.join(root, 'BUSTER.md'),
    },
    {
      type: 'test_spec',
      role: 'input',
      format: 'json',
      path: path.join(root, 'test-spec.json'),
    },
  ];

  if (Array.isArray(mod?.test_suites) && mod.test_suites.length > 0) {
    for (const suiteName of mod.test_suites) {
      refs.push({
        type: 'test_suite',
        role: 'input',
        format: 'ts',
        path: path.join(repoRoot(config), 'skills', 'buster', 'pipeline', 'suites', `${suiteName}.ts`),
      });
    }
  }

  return collectExistingArtifactRefs(refs);
}

function buildModuleBusterStateSnapshot(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord = {}) {
  return {
    pipeline: {
      project: selectTruthyValue(() => (config?.project), () => (null)),
      run_id: getRunId(config),
    },
    module: {
      module_id: moduleId,
      title: selectTruthyValue(() => (mod?.title), () => (null)),
      dir,
      stages: moduleStages(mod),
      status: selectTruthyValue(() => (status?.status), () => (null)),
      current_phase: selectTruthyValue(() => (status?.current_phase), () => (null)),
      fail_count: failCount(status),
      validation: cloneSerializable(selectTruthyValue(() => (status?.validation), () => (null))),
      active_agent: cloneSerializable(selectTruthyValue(() => (status?.active_agent), () => (null))),
      fail_summaries: cloneArrayOrEmpty(status?.fail_summaries),
      completion_summary: selectDefinedValue(() => (status?.completion_summary), () => (null)),
      test_suites: cloneArrayOrEmpty(mod?.test_suites),
      test_config: cloneOrNull(mod?.test_config),
    },
    dispatch: {
      run_id: optionalText(opts?.runId),
      attempt: invocationAttempt(status, opts),
      dispatch_id: optionalText(opts?.dispatchId),
      gateway_label: optionalText(opts?.gatewayLabel),
    },
  };
}

export function buildModuleBusterRunInput(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord = {}) {
  const attempt = requiredAttempt(opts?.attempt, status);
  const stageId = 'worker:module_buster';
  const dispatchId = optionalText(opts?.dispatchId);
  const runId = getRunId(config);
  return buildModuleWorkerRunInputBase(config, moduleId, mod, dir, status, {
    attempt,
    stageId,
    refs: {
      workerDispatchRef: dispatchId ? { prefix: 'worker_dispatch', parts: [runId, moduleId, attempt, dispatchId] } : null,
    },
    ids: dispatchId ? { dispatchId } : {},
    worker: {
      workerType: 'module_buster',
      config: {
        maxFails: selectDefinedValue(() => (opts?.maxFails), () => (null)),
        maxCrashRetries: selectDefinedValue(() => (opts?.maxCrashRetries), () => (null)),
        testSuites: cloneArrayOrEmpty(mod?.test_suites),
        testConfig: cloneOrNull(mod?.test_config),
      },
      backendConfig: {
        agentType: 'buster',
        model: optionalText(opts?.model),
        modelSource: optionalText(opts?.modelSource),
        thinking: optionalText(opts?.thinking),
        thinkingSource: optionalText(opts?.thinkingSource),
        thinkingSupported: selectDefinedValue(() => (opts?.thinkingSupported), () => (null)),
        reasoningLevel: opts?.thinkingSupported === false ? 'not supported' : (selectDefinedValue(() => (optionalText(opts?.thinking)), () => ('thinking_not_configured'))),
        runtimeKind: 'session',
      },
    },
    artifacts: buildModuleBusterArtifactRefs(config, dir, mod),
    stateSnapshot: buildModuleBusterStateSnapshot(config, moduleId, mod, dir, status, opts),
    executionContext: {
      phase: 'buster',
      moduleDir: dir,
      timeoutMinutes: selectDefinedValue(() => (opts?.timeoutMinutes), () => (null)),
      busterAttempt: initialBusterAttempt(opts?.busterAttempt),
      queuedSuites: cloneArrayOrEmpty(mod?.test_suites),
      completionIdentity: {
        runId: optionalText(opts?.runId),
        attempt,
        dispatchId,
        gatewayLabel: optionalText(opts?.gatewayLabel),
      },
      validation: cloneSerializable(selectTruthyValue(() => (status?.validation), () => (null))),
    },
    deadline: buildModuleWorkerDeadline(status, opts?.timeoutMinutes),
  });
}

export function normalizeModuleBusterWorkerResult(config: AnyRecord, workerInput: AnyRecord, rawResult: unknown, opts: AnyRecord = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_buster',
    label: 'Module Buster',
    stageId: requiredText(opts?.stageId, 'module_buster.stageId'),
    moduleId: requiredText(opts?.moduleId, 'module_buster.moduleId'),
    input: workerInput,
    invocation: selectTruthyValue(() => (opts?.pluginInvocation), () => (null)),
    coerce: (result: unknown) => coerceModuleBusterWorkerControlResult(config, workerInput, result, opts),
  });
}
