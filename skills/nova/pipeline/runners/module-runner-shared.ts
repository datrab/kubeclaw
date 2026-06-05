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

type AnyRecord = Record<string, any>;

export function _telemetryCtx(config: AnyRecord, deps: AnyRecord | null = null) {
  return { ...(getActiveContext() || { config, runId: config?.run_id || config?._runId || '' }), deps };
}

export function computeElapsedSeconds(fromIso: unknown, toIso = new Date().toISOString()) {
  if (!fromIso) return 0;
  const delta = new Date(String(toIso)).getTime() - new Date(String(fromIso)).getTime();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : 0;
}

export function getAttemptStartedAt(status: AnyRecord) {
  return status?.attempt_started_at || status?.started_at || null;
}

export function getPhaseStartedAt(status: AnyRecord) {
  return status?.phase_started_at || getAttemptStartedAt(status);
}

export function formatDurationCompact(seconds: unknown) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
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
  const resolvedDispatchId = dispatchId ?? resolveStatusDispatchId(status);
  return {
    title: mod?.title || status?.title || null,
    old_status: oldStatus || status?.status || null,
    attempt: currentAttemptNumber(status),
    phase: 'buster',
    model: model || status?.active_agent?.model || null,
    dispatch_id: resolvedDispatchId,
    gateway_label: gatewayLabel ?? resolveStatusGatewayLabel(status),
    session_key: sessionKey ?? resolveStatusSessionKey(status),
    duration_seconds: computeElapsedSeconds(getPhaseStartedAt(status)),
    cost_estimate_usd: null,
    commit_hash: status?.commit_hash || status?.forge_commit_hash || status?.buster_commit_hash || status?.forge_commit || status?.buster_commit || null,
    reason: reason || null,
  };
}

export function buildTerminalModuleFailEvent(status: AnyRecord, mod: AnyRecord, phase: unknown, model: unknown, oldStatus: unknown, reason: unknown, {
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
}: AnyRecord = {}) {
  const resolvedDispatchId = dispatchId ?? resolveStatusDispatchId(status);
  return {
    title: mod?.title || status?.title || null,
    old_status: oldStatus ?? status?.status ?? null,
    attempt: currentAttemptNumber(status),
    phase: phase || status?.current_phase || null,
    model: model || status?.active_agent?.model || null,
    dispatch_id: resolvedDispatchId,
    gateway_label: gatewayLabel ?? resolveStatusGatewayLabel(status),
    session_key: sessionKey ?? resolveStatusSessionKey(status),
    duration_seconds: computeElapsedSeconds(getPhaseStartedAt(status) || getAttemptStartedAt(status)),
    cost_estimate_usd: null,
    commit_hash: status?.commit_hash || status?.forge_commit_hash || status?.buster_commit_hash || status?.forge_commit || status?.buster_commit || null,
    reason: reason || null,
  };
}

export function emitTerminalModuleFailTelemetry(config: AnyRecord, moduleId: string, status: AnyRecord, mod: AnyRecord, phase: unknown, model: unknown, oldStatus: unknown, reason: unknown, correlation: AnyRecord = {}, explicitDeps: AnyRecord | null = null) {
  onModuleFail(_telemetryCtx(config, explicitDeps), moduleId, buildTerminalModuleFailEvent(status, mod, phase, model, oldStatus, reason, correlation));
}

export async function emitTerminalBusterCrashTelemetry(config: AnyRecord, moduleId: string, failEvent: AnyRecord, blockedReason: unknown, retryBudget: unknown, explicitDeps: AnyRecord | null = null) {
  const ctx = _telemetryCtx(config, explicitDeps);
  await onModuleFail(ctx, moduleId, failEvent);
  await onRetryExhausted(ctx, moduleId, {
    attempt: failEvent?.attempt ?? null,
    phase: failEvent?.phase || null,
    dispatch_id: failEvent?.dispatch_id ?? null,
    gateway_label: failEvent?.gateway_label ?? null,
    session_key: resolveResultSessionKey(failEvent),
    max_attempts: retryBudget ?? null,
    max_fails: retryBudget ?? null,
    reason: failEvent?.reason || blockedReason || null,
  });
  await onModuleBlocked(ctx, moduleId, {
    ...failEvent,
    old_status: STATUS.FAIL,
    reason: blockedReason || failEvent?.reason || null,
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
  return (status?.fail_count || 0) + 1;
}

export function ensureValidationState(status: AnyRecord) {
  const attempt = currentAttemptNumber(status);
  if (!status.validation || status.validation.attempt !== attempt) {
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
    ? (deps.runModuleBusterWorker || runModuleBusterWorker)
    : (deps.runModuleForgeWorker || runModuleForgeWorker);

  return {
    workerRuntime: {
      dispatch: async () => executeWorker({ config, progress, workerInput, deps }),
    },
  };
}

function buildModuleArtifactRefs(config: AnyRecord, dir: string, mod: AnyRecord) {
  const moduleRoot = path.join(config?.paths?.modules_dir || '', dir || '');
  const refs = [];
  if (Array.isArray(mod?.substeps) && mod.substeps.length > 0) {
    for (const substep of mod.substeps) {
      refs.push({
        type: 'forge_instructions',
        role: 'input',
        format: 'md',
        path: path.join(moduleRoot, substep, 'FORGE.md'),
      });
    }
  } else {
    refs.push({
      type: 'forge_instructions',
      role: 'input',
      format: 'md',
      path: path.join(moduleRoot, 'FORGE.md'),
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
      repoRoot: config?.repo_root || null,
      moduleDir: path.join(config?.paths?.modules_dir || '', dir || ''),
    },
    artifacts: artifacts || buildModuleArtifactRefs(config, dir, mod),
    stateSnapshot,
    executionContext,
    ...(deadline ? { deadline } : {}),
  };
}

function buildModuleWorkerDeadline(status: AnyRecord, timeoutMinutes: unknown) {
  return {
    timeoutMs: Number.isFinite(Number(timeoutMinutes)) ? Number(timeoutMinutes) * 60 * 1000 : null,
    startedAt: status?.phase_started_at || status?.attempt_started_at || status?.started_at || null,
    deadlineAt: null,
  };
}

function buildModuleForgeStateSnapshot(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord) {
  return {
    pipeline: {
      project: config?.project || null,
      run_id: getRunId(config),
    },
    module: {
      module_id: moduleId,
      title: mod?.title || null,
      dir,
      stages: Array.isArray(mod?.stages) ? [...mod.stages] : ['forge', 'buster'],
      status: status?.status || null,
      current_phase: status?.current_phase || null,
      fail_count: status?.fail_count || 0,
      validation: cloneSerializable(status?.validation || null),
      active_agent: cloneSerializable(status?.active_agent || null),
      fail_summaries: cloneSerializable(status?.fail_summaries || []),
    },
  };
}

export function buildModuleForgeRunInput(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord = {}) {
  const attempt = Number(opts?.attempt || currentAttemptNumber(status));
  const stageId = 'worker:module_forge';
  return buildModuleWorkerRunInputBase(config, moduleId, mod, dir, status, {
    attempt,
    stageId,
    worker: {
      workerType: 'module_forge',
      config: {
        maxFails: opts?.maxFails ?? null,
      },
      backendConfig: {
        agentType: 'forge',
        model: opts?.model || null,
        thinking: opts?.thinking || null,
        runtimeKind: 'session',
      },
    },
    stateSnapshot: buildModuleForgeStateSnapshot(config, moduleId, mod, dir, status),
    executionContext: {
      phase: 'forge',
      moduleDir: dir,
      timeoutMinutes: opts?.timeoutMinutes ?? null,
      headBefore: opts?.headBefore ?? null,
      novaPromptProvided: opts?.novaPromptProvided === true,
      recalledMemoryIds: Array.isArray(opts?.recalledMemoryIds) ? [...opts.recalledMemoryIds] : [],
    },
    deadline: buildModuleWorkerDeadline(status, opts?.timeoutMinutes),
  });
}

export function buildModuleValidatorRunInput(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  const attempt = Number(opts?.attempt || currentAttemptNumber(status));
  const validatorName = String(stageId || '').split(':')[1] || 'unknown';
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
    title: mod?.title || null,
    config: cloneSerializable(mod || {}),
    status: cloneSerializable(status || {}),
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
        project: config?.project || null,
        run_id: getRunId(config),
      },
      module: {
        module_id: moduleId,
        title: mod?.title || null,
        dir,
        status: status?.status || null,
        current_phase: status?.current_phase || null,
        fail_count: status?.fail_count || 0,
        validation: cloneSerializable(status?.validation || null),
        active_agent: cloneSerializable(status?.active_agent || null),
        statusRaw: cloneSerializable(status || {}),
      },
    },
    executionContext: {
      phase: opts?.phase || 'validation',
      moduleDir: dir,
      attempt,
    },
  });
  return { ...runInput, validator, module };
}

export function buildModuleWorkerPluginInvocation(moduleId: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId,
    attempt: opts?.attempt ?? currentAttemptNumber(status),
    dispatchId: opts?.dispatchId ?? resolveStatusDispatchId(status),
    sessionKey: resolveStatusSessionKey(status),
    gatewayLabel: resolveStatusGatewayLabel(status),
  });
}

export function buildModuleValidatorPluginInvocation(moduleId: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId,
    attempt: opts?.attempt ?? currentAttemptNumber(status),
    causationRef: opts?.causationRef || null,
  });
}

export function normalizeModuleForgeWorkerResult(config: AnyRecord, workerInput: AnyRecord, rawResult: unknown, opts: AnyRecord = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_forge',
    label: 'Module Forge',
    stageId: opts?.stageId || 'worker:module_forge',
    moduleId: opts?.moduleId || 'builtin.worker.module_forge',
    input: workerInput,
    invocation: opts?.pluginInvocation || null,
    coerce: (result: unknown) => coerceModuleForgeWorkerControlResult(config, workerInput, result, opts),
  });
}

function buildModuleBusterArtifactRefs(config: AnyRecord, dir: string, mod: AnyRecord) {
  const moduleRoot = path.join(config?.paths?.modules_dir || '', dir || '');
  const refs = [
    {
      type: 'buster_instructions',
      role: 'input',
      format: 'md',
      path: path.join(moduleRoot, 'BUSTER.md'),
    },
    {
      type: 'test_spec',
      role: 'input',
      format: 'json',
      path: path.join(moduleRoot, 'test-spec.json'),
    },
  ];

  if (Array.isArray(mod?.test_suites) && mod.test_suites.length > 0) {
    for (const suiteName of mod.test_suites) {
      refs.push({
        type: 'test_suite',
        role: 'input',
        format: 'ts',
        path: path.join(config?.repo_root || '', 'skills', 'buster', 'pipeline', 'suites', `${suiteName}.ts`),
      });
    }
  }

  return collectExistingArtifactRefs(refs);
}

function buildModuleBusterStateSnapshot(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord = {}) {
  return {
    pipeline: {
      project: config?.project || null,
      run_id: getRunId(config),
    },
    module: {
      module_id: moduleId,
      title: mod?.title || null,
      dir,
      stages: Array.isArray(mod?.stages) ? [...mod.stages] : ['forge', 'buster'],
      status: status?.status || null,
      current_phase: status?.current_phase || null,
      fail_count: status?.fail_count || 0,
      validation: cloneSerializable(status?.validation || null),
      active_agent: cloneSerializable(status?.active_agent || null),
      fail_summaries: cloneSerializable(status?.fail_summaries || []),
      completion_summary: status?.completion_summary || null,
      test_suites: cloneSerializable(mod?.test_suites || []),
      test_config: cloneSerializable(mod?.test_config || null),
    },
    dispatch: {
      run_id: opts?.runId || null,
      attempt: opts?.attempt ?? currentAttemptNumber(status),
      dispatch_id: opts?.dispatchId || null,
      gateway_label: opts?.gatewayLabel || null,
    },
  };
}

export function buildModuleBusterRunInput(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord = {}) {
  const attempt = Number(opts?.attempt || currentAttemptNumber(status));
  const stageId = 'worker:module_buster';
  const dispatchId = opts?.dispatchId || null;
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
        maxFails: opts?.maxFails ?? null,
        maxCrashRetries: opts?.maxCrashRetries ?? null,
        testSuites: cloneSerializable(mod?.test_suites || []),
        testConfig: cloneSerializable(mod?.test_config || null),
      },
      backendConfig: {
        agentType: 'buster',
        model: opts?.model || null,
        runtimeKind: 'redis_dispatch',
      },
    },
    artifacts: buildModuleBusterArtifactRefs(config, dir, mod),
    stateSnapshot: buildModuleBusterStateSnapshot(config, moduleId, mod, dir, status, opts),
    executionContext: {
      phase: 'buster',
      moduleDir: dir,
      timeoutMinutes: opts?.timeoutMinutes ?? null,
      busterAttempt: opts?.busterAttempt ?? 1,
      queuedSuites: cloneSerializable(mod?.test_suites || []),
      completionIdentity: {
        runId: opts?.runId || null,
        attempt,
        dispatchId,
        gatewayLabel: opts?.gatewayLabel || null,
      },
      validation: cloneSerializable(status?.validation || null),
    },
    deadline: buildModuleWorkerDeadline(status, opts?.timeoutMinutes),
  });
}

export function normalizeModuleBusterWorkerResult(config: AnyRecord, workerInput: AnyRecord, rawResult: unknown, opts: AnyRecord = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_buster',
    label: 'Module Buster',
    stageId: opts?.stageId || 'worker:module_buster',
    moduleId: opts?.moduleId || 'builtin.worker.module_buster',
    input: workerInput,
    invocation: opts?.pluginInvocation || null,
    coerce: (result: unknown) => coerceModuleBusterWorkerControlResult(config, workerInput, result, opts),
  });
}
