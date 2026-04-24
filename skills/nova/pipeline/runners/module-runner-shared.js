import fs from 'fs';
import path from 'path';
import { getActiveContext } from '../core/logger.js';
import { STATUS } from '../core/constants.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { statusPath } from '../core/paths.js';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
} from '../services/correlation.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';
import { normalizeTypedWorkerControlResult } from '../services/worker-control-result.js';
import {
  runModuleForgeWorker,
  runModuleBusterWorker,
  coerceModuleForgeWorkerControlResult,
  coerceModuleBusterWorkerControlResult,
} from '../agents/orchestration.js';
import {
  onModuleFail,
  onRetryExhausted,
  onModuleBlocked,
} from '../services/telemetry.js';
import {
  buildStagePluginInvocation,
  buildStageRefs,
  collectExistingArtifactRefs,
} from './stage-envelope-primitives.js';

export function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

export function computeElapsedSeconds(fromIso, toIso = new Date().toISOString()) {
  if (!fromIso) return 0;
  const delta = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : 0;
}

export function getAttemptStartedAt(status) {
  return status?.attempt_started_at || status?.started_at || null;
}

export function getPhaseStartedAt(status) {
  return status?.phase_started_at || getAttemptStartedAt(status);
}

export function formatDurationCompact(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return secs ? `${hours}h ${minutes}m ${secs}s` : `${hours}h ${minutes}m`;
  return secs ? `${minutes}m ${secs}s` : `${minutes}m`;
}

export function buildBusterDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
  ], extra);
}

export function buildModuleDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
  ], extra);
}

function extractJsonStringField(raw, fieldName) {
  if (!raw || !fieldName) return null;
  try {
    const match = raw.match(new RegExp(`"${fieldName}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 's'));
    return match ? JSON.parse(`"${match[1]}"`) : null;
  } catch {
    return null;
  }
}

export function readCorruptStatusIdentity(config, dir) {
  try {
    const raw = fs.readFileSync(statusPath(config, dir), 'utf8');
    return {
      session_key: extractJsonStringField(raw, 'session_key'),
      gateway_label: extractJsonStringField(raw, 'gateway_label') || extractJsonStringField(raw, 'label'),
    };
  } catch {
    return {
      session_key: null,
      gateway_label: null,
    };
  }
}

export function buildTerminalBusterCrashFailEvent(status, mod, model, oldStatus, reason, {
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
} = {}) {
  const resolvedDispatchId = resolveStatusDispatchId(status, dispatchId);
  return {
    title: mod?.title || status?.title || null,
    old_status: oldStatus || status?.status || null,
    attempt: currentAttemptNumber(status),
    phase: 'buster',
    model: model || status?.active_agent?.model || null,
    dispatch_id: resolvedDispatchId,
    gateway_label: resolveStatusGatewayLabel(status, gatewayLabel ?? resolvedDispatchId),
    session_key: resolveStatusSessionKey(status, sessionKey),
    duration_seconds: computeElapsedSeconds(getPhaseStartedAt(status)),
    cost_estimate_usd: null,
    commit_hash: status?.commit_hash || status?.forge_commit_hash || status?.buster_commit_hash || status?.forge_commit || status?.buster_commit || null,
    reason: reason || null,
  };
}

export function buildTerminalModuleFailEvent(status, mod, phase, model, oldStatus, reason, {
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
} = {}) {
  const resolvedDispatchId = resolveStatusDispatchId(status, dispatchId);
  return {
    title: mod?.title || status?.title || null,
    old_status: oldStatus ?? status?.status ?? null,
    attempt: currentAttemptNumber(status),
    phase: phase || status?.current_phase || null,
    model: model || status?.active_agent?.model || null,
    dispatch_id: resolvedDispatchId,
    gateway_label: resolveStatusGatewayLabel(status, gatewayLabel ?? resolvedDispatchId),
    session_key: resolveStatusSessionKey(status, sessionKey),
    duration_seconds: computeElapsedSeconds(getPhaseStartedAt(status) || getAttemptStartedAt(status)),
    cost_estimate_usd: null,
    commit_hash: status?.commit_hash || status?.forge_commit_hash || status?.buster_commit_hash || status?.forge_commit || status?.buster_commit || null,
    reason: reason || null,
  };
}

export function emitTerminalModuleFailTelemetry(config, moduleId, status, mod, phase, model, oldStatus, reason, correlation = {}) {
  onModuleFail(_telemetryCtx(config), moduleId, buildTerminalModuleFailEvent(status, mod, phase, model, oldStatus, reason, correlation));
}

export async function emitTerminalBusterCrashTelemetry(config, moduleId, failEvent, blockedReason, retryBudget) {
  const ctx = _telemetryCtx(config);
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

export function setLogScope(moduleId, phase) {
  const ctx = getActiveContext();
  if (ctx) {
    if (moduleId !== undefined) ctx._logModule = moduleId;
    if (phase !== undefined) ctx._logPhase = phase;
  }
}

export function currentAttemptNumber(status) {
  return (status?.fail_count || 0) + 1;
}

export function ensureValidationState(status) {
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

export function markValidationPassed(status, key) {
  const validation = ensureValidationState(status);
  validation[key] = true;
  validation[`${key}_at`] = new Date().toISOString();
}

export function getModuleStats(config) {
  return getRunStats(config);
}

export function ensureModulePluginLogDirs(config) {
  if (!config?._logDir && config?.paths?.modules_dir) {
    config._logDir = path.join(path.dirname(config.paths.modules_dir), 'logs');
  }
  if (config?._logDir && !config?._runLogDir) {
    config._runLogDir = path.join(config._logDir, 'pipeline', 'runs', getRunId(config) || config?._runId || config?.run_id || 'unknown');
    fs.mkdirSync(config._runLogDir, { recursive: true });
  }
}

export function buildWorkerPluginEffects(config, progress, stageId, workerInput, deps) {
  const executeWorker = stageId === 'worker:module_buster'
    ? (deps.runModuleBusterWorker || runModuleBusterWorker)
    : (deps.runModuleForgeWorker || runModuleForgeWorker);

  return {
    workerBackend: {
      dispatch: async () => executeWorker({ config, progress, workerInput, deps }),
    },
  };
}

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function buildModuleArtifactRefs(config, dir, mod) {
  const moduleRoot = path.join(config?.paths?.modules_dir || '', dir || '');
  const refs = [{
    type: 'module_status',
    role: 'state',
    format: 'json',
    path: statusPath(config, dir),
  }];
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

function buildModuleForgeStateSnapshot(config, moduleId, mod, dir, status) {
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

export function buildModuleForgeRunInput(config, moduleId, mod, dir, status, opts = {}) {
  const runId = getRunId(config);
  const attempt = Number(opts?.attempt || currentAttemptNumber(status));
  const stageId = 'worker:module_forge';
  return {
    refs: buildStageRefs({
      runRef: { prefix: 'run', parts: [runId] },
      moduleRef: { prefix: 'module', parts: [moduleId] },
      moduleAttemptRef: { prefix: 'module_attempt', parts: [runId, moduleId, attempt] },
    }),
    ids: {
      runId,
      moduleId,
      attempt,
      stageId,
    },
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
    workspace: {
      repoRoot: config?.repo_root || null,
      moduleDir: path.join(config?.paths?.modules_dir || '', dir || ''),
    },
    artifacts: buildModuleArtifactRefs(config, dir, mod),
    stateSnapshot: buildModuleForgeStateSnapshot(config, moduleId, mod, dir, status),
    executionContext: {
      phase: 'forge',
      moduleDir: dir,
      timeoutMinutes: opts?.timeoutMinutes ?? null,
      headBefore: opts?.headBefore ?? null,
      novaPromptProvided: opts?.novaPromptProvided === true,
      recalledMemoryIds: Array.isArray(opts?.recalledMemoryIds) ? [...opts.recalledMemoryIds] : [],
    },
    deadline: {
      timeoutMs: Number.isFinite(Number(opts?.timeoutMinutes)) ? Number(opts.timeoutMinutes) * 60 * 1000 : null,
      startedAt: status?.phase_started_at || status?.attempt_started_at || status?.started_at || null,
      deadlineAt: null,
    },
  };
}

export function buildModuleWorkerPluginInvocation(moduleId, status, stageId, opts = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId,
    attempt: opts?.attempt ?? currentAttemptNumber(status),
    dispatchId: opts?.dispatchId ?? resolveStatusDispatchId(status),
    sessionKey: resolveStatusSessionKey(status),
    gatewayLabel: resolveStatusGatewayLabel(status),
  });
}

export function normalizeModuleForgeWorkerResult(config, workerInput, rawResult, opts = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_forge',
    label: 'Module Forge',
    stageId: opts?.stageId || 'worker:module_forge',
    coerce: (result) => coerceModuleForgeWorkerControlResult(config, workerInput, result, opts),
  });
}

function buildModuleBusterArtifactRefs(config, dir, mod) {
  const moduleRoot = path.join(config?.paths?.modules_dir || '', dir || '');
  const refs = [
    {
      type: 'module_status',
      role: 'state',
      format: 'json',
      path: statusPath(config, dir),
    },
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
        format: 'js',
        path: path.join(config?.repo_root || '', 'skills', 'buster', 'suites', `${suiteName}.js`),
      });
    }
  }

  return collectExistingArtifactRefs(refs);
}

function buildModuleBusterStateSnapshot(config, moduleId, mod, dir, status, opts = {}) {
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

export function buildModuleBusterRunInput(config, moduleId, mod, dir, status, opts = {}) {
  const runId = getRunId(config);
  const attempt = Number(opts?.attempt || currentAttemptNumber(status));
  const stageId = 'worker:module_buster';
  const dispatchId = opts?.dispatchId || null;
  return {
    refs: buildStageRefs({
      runRef: { prefix: 'run', parts: [runId] },
      moduleRef: { prefix: 'module', parts: [moduleId] },
      moduleAttemptRef: { prefix: 'module_attempt', parts: [runId, moduleId, attempt] },
      workerDispatchRef: dispatchId ? { prefix: 'worker_dispatch', parts: [runId, moduleId, attempt, dispatchId] } : null,
    }),
    ids: {
      runId,
      moduleId,
      attempt,
      stageId,
      ...(dispatchId ? { dispatchId } : {}),
    },
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
    workspace: {
      repoRoot: config?.repo_root || null,
      moduleDir: path.join(config?.paths?.modules_dir || '', dir || ''),
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
    deadline: {
      timeoutMs: Number.isFinite(Number(opts?.timeoutMinutes)) ? Number(opts.timeoutMinutes) * 60 * 1000 : null,
      startedAt: status?.phase_started_at || status?.attempt_started_at || status?.started_at || null,
      deadlineAt: null,
    },
  };
}

export function normalizeModuleBusterWorkerResult(config, workerInput, rawResult, opts = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_buster',
    label: 'Module Buster',
    stageId: opts?.stageId || 'worker:module_buster',
    coerce: (result) => coerceModuleBusterWorkerControlResult(config, workerInput, result, opts),
  });
}
