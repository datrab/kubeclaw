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
import { currentAttemptNumber } from './module-runner-runtime.ts';
export {
  _telemetryCtx, computeElapsedSeconds, getAttemptStartedAt, getPhaseStartedAt,
  formatDurationCompact, buildTerminalBusterCrashFailEvent, emitTerminalModuleFailTelemetry,
  emitTerminalBusterCrashTelemetry, setLogScope, currentAttemptNumber,
  ensureValidationState, markValidationPassed, getModuleStats,
} from './module-runner-runtime.ts';
type AnyRecord = Record<string, any>;

export function optionalText(value: unknown): string | null {
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

export function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label}: required non-empty string`);
  return text;
}

function arrayOrEmpty(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function cloneArrayOrEmpty(value: unknown): any[] {
  return cloneSerializable(arrayOrEmpty(value));
}

function cloneRecordOrEmpty(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? cloneSerializable(value)
    : {};
}

export function moduleRoot(config: AnyRecord, dir: string): string {
  return path.join(requiredText(config?.paths?.modules_dir, 'config.paths.modules_dir'), requiredText(dir, 'module.dir'));
}

export function repoRoot(config: AnyRecord): string {
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

export function requiredAttempt(value: unknown, status: AnyRecord): number {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return currentAttemptNumber(status);
  const attempt = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) throw new Error('module_worker.attempt: expected positive integer');
  return attempt;
}

function stageTypeFromStageId(stageId: unknown, prefix: string): string {
  const text = requiredText(stageId, 'stageId');
  const [actualPrefix, stageType] = text.split(':');
  if (actualPrefix !== prefix || !stageType) throw new Error(`stageId: expected '${prefix}:<type>'`);
  return stageType;
}

export function initialBusterAttempt(value: unknown): number {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return 1;
  const attempt = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) throw new Error('busterAttempt: expected positive integer');
  return attempt;
}

export function cloneOrNull(value: unknown): unknown {
  return value === undefined ? null : cloneSerializable(value);
}

export function invocationAttempt(status: AnyRecord, opts: AnyRecord = {}): number {
  if (opts?.attempt !== undefined) return requiredAttempt(opts.attempt, status);
  return currentAttemptNumber(status);
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
  const refs: any[] = [];
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

export function buildModuleWorkerRunInputBase(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, {
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

export function buildModuleWorkerDeadline(status: AnyRecord, timeoutMinutes: unknown) {
  return {
    timeoutMs: Number.isFinite(Number(timeoutMinutes)) ? Number(timeoutMinutes) * 60 * 1000 : null,
    startedAt: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.phase_started_at), () => (status?.attempt_started_at))), () => (status?.started_at))), () => (null)),
    deadlineAt: null,
  };
}

export function buildModuleStateSnapshotBase(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord) {
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

function buildModuleForgeStateSnapshot(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord) {
  return buildModuleStateSnapshotBase(config, moduleId, mod, dir, status);
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
