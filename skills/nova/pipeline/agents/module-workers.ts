import { STATUS } from '../core/constants.ts';
import { archiveModuleCompletions, pollDualWithRateLimitRecovery, pollForgeCompletionWithRateLimitRecovery } from '../services/polling.ts';
import { loadStatus, saveStreamLog } from '../services/status-store.ts';
import { buildActiveSessionAuthorityPolicy } from '../services/session-authority.ts';
import { verifyAgentAlive } from './orchestration-healthcheck.ts';
import {
  buildModuleBusterWorkerControlResult,
  buildModuleForgeWorkerControlResult,
} from './module-worker-control-results.ts';
import { getTrackedAgent } from './lifecycle.ts';
import { spawnAgent, killAgent } from './orchestration.ts';

type AnyRecord = Record<string, any>;

function defaultAcpLabel(agentType: string, moduleId: string, opts: AnyRecord = {}) {
  const suffix = [
    normalizeString(opts.runId) ? `run-${normalizeString(opts.runId)}` : null,
    opts.attempt ? `attempt-${opts.attempt}` : null,
  ].filter(Boolean).join('-');
  return `${agentType}-${moduleId}${suffix ? `-${suffix}` : ''}`;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeAttempt(value: unknown, fallback = 1): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function objectOrNull(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? value as AnyRecord : null;
}

function pollStatus(pollResult: AnyRecord | null = null): AnyRecord | null {
  return objectOrNull(pollResult?.status);
}

function pollRedisEntry(pollResult: AnyRecord | null = null): AnyRecord | null {
  return objectOrNull(pollStatus(pollResult)?._redis_entry);
}

function statusEvidenceFields(pollResult: AnyRecord | null = null): AnyRecord {
  const status = pollStatus(pollResult);
  const redisEntry = pollRedisEntry(pollResult);
  return {
    statusDetail: typeof status?.detail === 'string' && status.detail.trim() ? status.detail.trim() : null,
    statusMessage: typeof status?.message === 'string' && status.message.trim() ? status.message.trim() : null,
    statusErrors: Array.isArray(status?.errors) ? status.errors : null,
    pollingGit: pollResult?.reason === 'git_error' ? (status?.details || status || null) : null,
    completionConflict: pollResult?.reason === 'completion_conflict' ? (status || null) : null,
    redisEntry,
    rateLimitStatus: objectOrNull(pollResult?.rate_limit_status) || (pollResult?.reason === 'rate_limit_exhausted' || pollResult?.reason === 'rate_limited' ? status : null),
    rateLimitPauses: pollResult?.rate_limit_pauses ?? status?.rate_limit_pauses ?? null,
    maxRateLimitPauses: pollResult?.max_rate_limit_pauses ?? status?.max_rate_limit_pauses ?? null,
  };
}

function normalizeModuleWorkerInput(workerType: 'module_forge' | 'module_buster', workerInput: AnyRecord = {}) {
  const ids = workerInput?.ids && typeof workerInput.ids === 'object' ? { ...workerInput.ids } : {};
  const refs = workerInput?.refs && typeof workerInput.refs === 'object' ? { ...workerInput.refs } : {};
  const executionContext = workerInput?.executionContext && typeof workerInput.executionContext === 'object'
    ? { ...workerInput.executionContext }
    : {};
  const worker = workerInput?.worker && typeof workerInput.worker === 'object'
    ? { ...workerInput.worker }
    : {};

  ids.moduleId = normalizeString(ids.moduleId);
  ids.runId = normalizeString(ids.runId);
  ids.attempt = normalizeAttempt(ids.attempt);
  ids.stageId = normalizeString(ids.stageId) || `worker:${workerType}`;
  if (workerType === 'module_buster') {
    ids.dispatchId = normalizeString(ids.dispatchId);
  }

  executionContext.moduleDir = normalizeString(executionContext.moduleDir);
  executionContext.timeoutMinutes = executionContext.timeoutMinutes ?? null;

  worker.workerType = worker.workerType || workerType;

  if (!ids.moduleId) throw new Error(`${workerType} worker input requires ids.moduleId`);
  if (!executionContext.moduleDir) throw new Error(`${workerType} worker input requires executionContext.moduleDir`);

  return {
    ...workerInput,
    ids,
    refs,
    executionContext,
    worker,
  };
}

function resolveModuleBusterFailureClass(pollResult: AnyRecord = {}) {
  const explicit = pollResult?.failure_class
    || pollResult?.status?.failure_class
    || pollResult?.status?._redis_entry?.failure_class
    || null;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().toLowerCase();
  const reason = typeof pollResult?.reason === 'string' ? pollResult.reason.trim().toLowerCase() : '';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'parse_corrupted') return 'parse_corrupted';
  if (reason === 'rate_limit_exhausted') return 'rate_limit_exhausted';
  if (reason === 'completion_archive_failed') return 'completion_archive_failed';
  if (reason === 'output_file_identity_mismatch') return 'output_file_identity_mismatch';
  const redisReason = typeof pollResult?.status?._redis_entry?.reason === 'string'
    ? pollResult.status._redis_entry.reason.trim().toLowerCase()
    : '';
  if (redisReason === 'output_file_identity_mismatch') return 'output_file_identity_mismatch';
  if (redisReason === 'completion_archive_failed') return 'completion_archive_failed';
  return null;
}

function forgeControlForPollResult(pollResult: AnyRecord = {}) {
  if (pollResult?.ok === true) {
    return { nextAction: 'pass', issueType: null, outcomeClass: 'passed' };
  }
  const reason = typeof pollResult?.reason === 'string' ? pollResult.reason.trim().toLowerCase() : '';
  if (reason === 'timeout') return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying' };
  if (reason === 'session_ended_no_changes'
      || reason === 'agent_ended_no_meaningful_diff'
      || reason === 'session_ended_no_meaningful_diff'
      || reason === 'invalid_forge_completion') {
    return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested' };
  }
  if (reason === 'rate_limit_exhausted') return { nextAction: 'block', issueType: 'environment', outcomeClass: 'rate_limited' };
  if (reason === 'parse_corrupted' || reason === 'git_error') return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error' };
  if (reason) return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested' };
  return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error' };
}

function busterControlForPollResult(pollResult: AnyRecord = {}, failureClass: string | null = null) {
  const terminalStatus = String(
    pollResult?.status?.status
    || pollResult?.status?._redis_entry?.status
    || '',
  ).trim().toUpperCase();
  if (pollResult?.ok === true && terminalStatus !== STATUS.FAIL && terminalStatus !== STATUS.BLOCKED) {
    return { nextAction: 'pass', issueType: null, outcomeClass: 'passed', failureClass: 'pass' };
  }
  if (failureClass === 'timeout'
      || failureClass === 'parse_corrupted'
      || failureClass === 'infra_crash'
      || failureClass === 'pretest_infra'
      || failureClass === 'pretest_config') {
    return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying', failureClass };
  }
  if (failureClass === 'verdict_fail' || failureClass === 'pretest_code') {
    return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested', failureClass };
  }
  if (failureClass === 'rate_limit_exhausted') {
    return { nextAction: 'block', issueType: 'environment', outcomeClass: 'rate_limited', failureClass };
  }
  if (failureClass === 'spawn_failed'
      || failureClass === 'completion_archive_failed'
      || failureClass === 'output_file_identity_mismatch') {
    return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error', failureClass };
  }
  return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error', failureClass: failureClass || 'unclassified_poll_failure' };
}

export async function runModuleForgeWorker({
  config,
  progress,
  workerInput = {},
  deps = {},
}: AnyRecord = {}) {
  if (!config) throw new Error('runModuleForgeWorker requires config');

  workerInput = normalizeModuleWorkerInput('module_forge', workerInput);
  const {
    prompt,
    onDispatched = null,
    onFinalized = null,
  } = workerInput;
  const {
    model,
    thinking = null,
  } = workerInput?.worker?.backendConfig || {};
  const moduleId = workerInput.ids.moduleId;
  const moduleDir = workerInput.executionContext.moduleDir;
  const timeoutMinutes = workerInput.executionContext.timeoutMinutes;
  const attempt = workerInput.ids.attempt;
  const runId = workerInput.ids.runId || config?._runId || config?.run_id || null;
  const headBefore = workerInput.executionContext.headBefore ?? null;

  const spawn = deps.spawnAgent || spawnAgent;
  const verifyAlive = deps.verifyAgentAlive || verifyAgentAlive;
  const kill = deps.killAgent || killAgent;
  const getTracked = deps.getTrackedAgent || getTrackedAgent;
  const labelFor = deps.acpLabel || defaultAcpLabel;
  const poll = deps.pollForgeCompletionWithRateLimitRecovery || pollForgeCompletionWithRateLimitRecovery;
  const loadStatusFn = deps.loadStatus || loadStatus;
  const saveStreamLogFn = deps.saveStreamLog || saveStreamLog;
  const clearShutdownContextFn = deps.clearShutdownContext || (() => {});

  const forgeSessionLabel = labelFor('forge', moduleId, { runId, attempt });
  let pollResult = null;
  let trackedForgeAgent = null;
  let finalStatus = null;
  let forgeStreamPath = null;
  let hookError = null;
  let hookFailureReason = null;

  try {
    await spawn(config, progress, 'forge', moduleId, model, prompt, {
      thinking,
      module_id: moduleId,
      run_id: runId,
      attempt,
      trackingLabel: forgeSessionLabel,
    });
  } catch (e: any) {
    clearShutdownContextFn();
    return buildModuleForgeWorkerControlResult(config, workerInput, {
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'error',
      reason: 'spawn_failed',
      error: e.message,
      gatewayLabel: e?.gateway_label || null,
      sessionKey: e?.session_key || null,
      attempt,
    });
  }

  if (!(await verifyAlive(config, 'forge', moduleId, { trackingLabel: forgeSessionLabel }))) {
    await kill(config, 'forge', moduleId, false, { trackingLabel: forgeSessionLabel });
    clearShutdownContextFn();
    return buildModuleForgeWorkerControlResult(config, workerInput, {
      nextAction: 'retry',
      issueType: 'environment',
      outcomeClass: 'retrying',
      reason: 'healthcheck_failed',
      error: 'Forge agent failed health check — session not running after spawn',
      attempt,
    });
  }

  trackedForgeAgent = getTracked(forgeSessionLabel) || null;
  forgeStreamPath = trackedForgeAgent?.streamLogPath || null;

  const dispatch = {
    label: forgeSessionLabel,
    session_key: trackedForgeAgent?.sessionKey || null,
    stream_log_path: trackedForgeAgent?.streamLogPath || null,
    gateway_label: trackedForgeAgent?.gatewayLabel || null,
    dispatch_id: trackedForgeAgent?.telemetry_dispatch_id || trackedForgeAgent?.dispatch_id || null,
    run_id: trackedForgeAgent?.run_id || runId,
    runtime: trackedForgeAgent?.runtime || null,
    model,
    agent_id: trackedForgeAgent?.agentId || null,
    attempt,
    phase: 'forge',
  };

  try {
    if (typeof onDispatched === 'function') {
      try {
        await onDispatched(dispatch);
      } catch (e: any) {
        hookError = e;
        hookFailureReason = 'dispatch_hook_failed';
      }
    }

    if (!hookError) {
      pollResult = await poll(config, moduleDir, timeoutMinutes, {
        sessionLabel: forgeSessionLabel,
        headBefore,
        moduleId,
        runId: dispatch.run_id,
        dispatchId: dispatch.dispatch_id,
        sessionKey: dispatch.session_key,
        gatewayLabel: dispatch.gateway_label,
      });
    }
  } finally {
    try {
      forgeStreamPath = getTracked(forgeSessionLabel)?.streamLogPath || forgeStreamPath;
      try {
        await kill(config, 'forge', moduleId, pollResult?.ok || false, { trackingLabel: forgeSessionLabel });
      } catch (e: any) {
        hookError = hookError || e;
        hookFailureReason = hookFailureReason || 'cleanup_failed';
      }
      try {
        finalStatus = loadStatusFn(config, moduleDir) || null;
      } catch (e: any) {
        hookError = hookError || e;
        hookFailureReason = hookFailureReason || 'cleanup_failed';
      }
      if (typeof onFinalized === 'function') {
        try {
          await onFinalized({
            status: finalStatus,
            stream_log_path: forgeStreamPath,
            dispatch,
          });
          try {
            finalStatus = loadStatusFn(config, moduleDir) || finalStatus;
          } catch (e: any) {
            hookError = hookError || e;
            hookFailureReason = hookFailureReason || 'cleanup_failed';
          }
        } catch (e: any) {
          hookError = hookError || e;
          hookFailureReason = hookFailureReason || 'finalize_hook_failed';
        }
      }
      try {
        await saveStreamLogFn(config, moduleDir, 'forge', attempt, forgeStreamPath);
      } catch (e: any) {
        hookError = hookError || e;
        hookFailureReason = hookFailureReason || 'cleanup_failed';
      }
    } finally {
      clearShutdownContextFn();
    }
  }

  if (hookError) {
    const evidence = statusEvidenceFields(pollResult);
    return buildModuleForgeWorkerControlResult(config, workerInput, {
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'error',
      reason: hookFailureReason,
      error: hookError?.message || String(hookError),
      finalStatus,
      streamLogPath: forgeStreamPath,
      gatewayLabel: dispatch.gateway_label,
      sessionKey: dispatch.session_key,
      attempt,
      ...evidence,
    });
  }

  const forgeControl = forgeControlForPollResult(pollResult || {});
  const forgeEvidence = statusEvidenceFields(pollResult);
  const forgePollStatus = pollStatus(pollResult);
  const forgeTerminalStatus = pollResult?.ok === true
    && (forgePollStatus?.status === STATUS.READY_FOR_TESTING || forgePollStatus?.status === STATUS.BLOCKED)
    ? forgePollStatus
    : null;
  return buildModuleForgeWorkerControlResult(config, workerInput, {
    ...forgeControl,
    reason: pollResult?.reason || null,
    finalStatus: forgeTerminalStatus || finalStatus,
    streamLogPath: forgeStreamPath,
    gatewayLabel: dispatch.gateway_label,
    sessionKey: dispatch.session_key,
    attempt,
    ...forgeEvidence,
  });
}

export async function runModuleBusterWorker({
  config,
  progress,
  workerInput = {},
  deps = {},
}: AnyRecord = {}) {
  if (!config) throw new Error('runModuleBusterWorker requires config');

  workerInput = normalizeModuleWorkerInput('module_buster', workerInput);
  const {
    prompt,
    status = null,
    onDispatched = null,
    onFinalized = null,
  } = workerInput;
  const { model } = workerInput?.worker?.backendConfig || {};
  const moduleId = workerInput.ids.moduleId;
  const moduleDir = workerInput.executionContext.moduleDir;
  const timeoutMinutes = workerInput.executionContext.timeoutMinutes;
  const runId = workerInput.ids.runId || null;
  const attempt = workerInput.ids.attempt;
  const dispatchId = workerInput.ids.dispatchId || null;

  const archive = deps.archiveModuleCompletions || archiveModuleCompletions;
  const spawn = deps.spawnAgent || spawnAgent;
  const kill = deps.killAgent || killAgent;
  const poll = deps.pollDualWithRateLimitRecovery || pollDualWithRateLimitRecovery;
  const loadStatusFn = deps.loadStatus || loadStatus;
  const saveStreamLogFn = deps.saveStreamLog || saveStreamLog;
  const clearShutdownContextFn = deps.clearShutdownContext || (() => {});

  let workerDispatch = null;
  let pollResult = null;
  let finalStatus = null;
  let finalStreamPath = null;
  let finalSessionKey = null;
  let hookError = null;
  let hookFailureReason = null;

  let archiveResult = null;
  try {
    archiveResult = await archive(config, moduleId, {
      run_id: runId,
      attempt,
      dispatch_id: dispatchId,
    }, {
      targetKind: 'module',
      module_id: moduleId,
      agent_type: 'buster',
    });
  } catch (e: any) {
    clearShutdownContextFn();
    return buildModuleBusterWorkerControlResult(config, workerInput, {
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'error',
      reason: 'completion_archive_failed',
      error: e?.message || String(e),
      failureClass: 'completion_archive_failed',
      dispatchId: dispatchId || null,
      attempt,
      runId,
    });
  }
  if (archiveResult?.failed) {
    clearShutdownContextFn();
    return buildModuleBusterWorkerControlResult(config, workerInput, {
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'error',
      reason: 'completion_archive_failed',
      error: archiveResult.error || 'Redis completion archive failed before Buster dispatch',
      failureClass: 'completion_archive_failed',
      dispatchId: dispatchId || null,
      attempt,
      runId,
    });
  }

  try {
    workerDispatch = await spawn(config, progress, 'buster', moduleId, model, prompt, {
      status,
      taskType: 'module_test',
      run_id: runId,
      attempt,
      dispatch_id: dispatchId,
    });
  } catch (e: any) {
    clearShutdownContextFn();
    return buildModuleBusterWorkerControlResult(config, workerInput, {
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'error',
      reason: 'spawn_failed',
      failureClass: 'spawn_failed',
      error: e.message,
      dispatchId: dispatchId || null,
      gatewayLabel: e?.gateway_label || null,
      sessionKey: e?.session_key || null,
      attempt,
      runId,
    });
  }

  const dispatch = {
    label: workerDispatch?.dispatch_id || dispatchId || null,
    session_key: workerDispatch?.session_key || null,
    stream_log_path: workerDispatch?.stream_log_path || null,
    gateway_label: workerDispatch?.gateway_label || null,
    dispatch_id: workerDispatch?.dispatch_id || dispatchId || null,
    run_id: workerDispatch?.run_id || runId || null,
    attempt,
    runtime: null,
    model,
    agent_id: null,
    phase: 'buster',
  };

  try {
    if (typeof onDispatched === 'function') {
      try {
        await onDispatched(dispatch);
      } catch (e: any) {
        hookError = e;
        hookFailureReason = 'dispatch_hook_failed';
      }
    }

    if (!hookError) {
      pollResult = await poll(config, moduleDir, moduleId,
        [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED], timeoutMinutes, {
          run_id: dispatch.run_id,
          attempt,
          dispatch_id: dispatch.dispatch_id,
          session_key: dispatch.session_key,
          gateway_label: dispatch.gateway_label,
        });
    }
  } finally {
    try {
      try {
        await kill(config, 'buster', moduleId, pollResult?.ok || false);
      } catch (e: any) {
        hookError = hookError || e;
        hookFailureReason = hookFailureReason || 'cleanup_failed';
      }
      try {
        finalStatus = loadStatusFn(config, moduleDir, { raw: true }) || null;
      } catch (e: any) {
        hookError = hookError || e;
        hookFailureReason = hookFailureReason || 'cleanup_failed';
      }
      const finalActive = finalStatus?.active_agent || null;
      const finalActivePolicy = buildActiveSessionAuthorityPolicy({
        lifecycleActiveSession: finalActive,
        evidenceActiveSession: {
          run_id: dispatch.run_id || null,
          attempt: dispatch.attempt ?? null,
          dispatch_id: dispatch.dispatch_id || null,
          session_key: dispatch.session_key || null,
          gateway_label: dispatch.gateway_label || null,
        },
      });
      const confirmedFinalActive = finalActivePolicy.identity_confirmed === true ? finalActive : null;
      finalStreamPath = confirmedFinalActive?.stream_log_path || dispatch.stream_log_path || null;
      finalSessionKey = confirmedFinalActive?.session_key
        ?? pollRedisEntry(pollResult)?.session_key
        ?? pollStatus(pollResult)?.session_key
        ?? dispatch.session_key
        ?? null;
      if (typeof onFinalized === 'function') {
        try {
          await onFinalized({
            status: finalStatus,
            stream_log_path: finalStreamPath,
            session_key: finalSessionKey,
            dispatch,
          });
          try {
            finalStatus = loadStatusFn(config, moduleDir, { raw: true }) || finalStatus;
          } catch (e: any) {
            hookError = hookError || e;
            hookFailureReason = hookFailureReason || 'cleanup_failed';
          }
        } catch (e: any) {
          hookError = hookError || e;
          hookFailureReason = hookFailureReason || 'finalize_hook_failed';
        }
      }
      try {
        await saveStreamLogFn(config, moduleDir, 'buster', attempt, finalStreamPath);
      } catch (e: any) {
        hookError = hookError || e;
        hookFailureReason = hookFailureReason || 'cleanup_failed';
      }
    } finally {
      clearShutdownContextFn();
    }
  }

  if (hookError) {
    const evidence = statusEvidenceFields(pollResult);
    return buildModuleBusterWorkerControlResult(config, workerInput, {
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'error',
      reason: hookFailureReason,
      failureClass: hookFailureReason,
      error: hookError?.message || String(hookError),
      finalStatus,
      streamLogPath: finalStreamPath,
      dispatchId: dispatch.dispatch_id,
      gatewayLabel: dispatch.gateway_label,
      sessionKey: finalSessionKey,
      attempt,
      runId: dispatch.run_id,
      ...evidence,
    });
  }

  const failureClass = resolveModuleBusterFailureClass(pollResult || {});
  const busterControl = busterControlForPollResult(pollResult || {}, failureClass);
  const busterEvidence = statusEvidenceFields(pollResult);
  return buildModuleBusterWorkerControlResult(config, workerInput, {
    ...busterControl,
    reason: pollResult?.reason || null,
    finalStatus,
    streamLogPath: finalStreamPath,
    dispatchId: dispatch.dispatch_id,
    gatewayLabel: dispatch.gateway_label,
    sessionKey: finalSessionKey,
    attempt,
    runId: dispatch.run_id,
    ...busterEvidence,
  });
}
