import { STATUS } from '../core/constants.ts';
import {
  buildModuleSessionRateLimitStatus,
  getRateLimitConfig,
  processSessionRateLimit,
} from '../services/rate-limit.ts';
import { buildActiveSessionAuthorityPolicy } from '../services/session-authority.ts';
import {
  buildModuleBusterWorkerControlResult,
  buildModuleForgeWorkerControlResult,
} from './module-worker-control-results.ts';
import {
  pollRedisEntry,
  pollStatus,
  statusEvidenceFields,
  terminalBusterFinalStatus,
} from './module-worker-buster-status.ts';
import { normalizeModuleWorkerInput } from './module-worker-input.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

const FORGE_SUCCESSFUL_KILL_POLICY = Object.freeze({
  graceMs: 10_000,
  statusTimeoutMs: 5_000,
  requestTimeoutMs: 5_000,
  stopRequestTimeoutMs: 5_000,
  listTimeoutMs: 5_000,
  acpxTimeoutMs: 5_000,
});

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function requireNonEmptyString(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized) throw new Error(`module worker requires ${field}`);
  return normalized;
}

function isOneOf(value: unknown, candidates: string[]) {
  return typeof value === 'string' && candidates.includes(value);
}

const BUSTER_OUTPUT_ARTIFACT_FAILURES = new Set([
  'output_file_identity_mismatch',
  'output_file_missing',
]);
const ACP_STARTUP_RATE_LIMIT_EXHAUSTED = 'ACP startup rate limit pauses exhausted';
const ACP_STARTUP_RATE_LIMITED = 'ACP startup rate limited';

function objectRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function requireObjectRecord(value: unknown, field: string): AnyRecord {
  const record = objectRecord(value);
  if (Object.keys(record).length === 0) throw new Error(`module worker requires ${field}`);
  return record;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function selectPresentValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function isJsonParseFailure(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const message = errorMessage(error).toLowerCase();
  return message.includes('json') && (
    message.includes('parse')
    || message.includes('unexpected')
    || message.includes('expected')
    || message.includes('property name')
  );
}

function resolveModuleBusterFailureClass(pollResult: AnyRecord = {}) {
  const explicit = typeof pollResult?.failure_class === 'string' ? pollResult.failure_class : null;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().toLowerCase();
  const statusExplicit = typeof pollResult?.status?.failure_class === 'string' ? pollResult.status.failure_class : null;
  if (typeof statusExplicit === 'string' && statusExplicit.trim()) return statusExplicit.trim().toLowerCase();
  const reason = typeof pollResult?.reason === 'string' ? pollResult.reason.trim().toLowerCase() : '';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'parse_corrupted') return 'parse_corrupted';
  if (reason === 'rate_limit_exhausted') return 'rate_limit_exhausted';
  if (reason === 'agent_session_lifecycle_unstable') return 'agent_session_lifecycle_unstable';
  if (reason === 'completion_archive_failed') return 'completion_archive_failed';
  if (BUSTER_OUTPUT_ARTIFACT_FAILURES.has(reason)) return reason;
  const redisReason = typeof pollResult?.status?._redis_entry?.reason === 'string'
    ? pollResult.status._redis_entry.reason.trim().toLowerCase()
    : '';
  if (BUSTER_OUTPUT_ARTIFACT_FAILURES.has(redisReason)) return redisReason;
  if (redisReason === 'completion_archive_failed') return 'completion_archive_failed';
  return null;
}

function forgeControlForPollResult(pollResult: AnyRecord = {}) {
  if (pollResult?.ok === true) {
    return { nextAction: 'pass', issueType: null, outcomeClass: 'passed' };
  }
  const reason = typeof pollResult?.reason === 'string' ? pollResult.reason.trim().toLowerCase() : '';
  if (reason === 'timeout') return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying' };
  if (isOneOf(reason, ['agent_ended_missing', 'agent_session_lifecycle_unstable', 'forge_completion_artifact_missing'])) {
    return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying' };
  }
  if (isOneOf(reason, [
    'session_ended_no_changes',
    'agent_ended_no_meaningful_diff',
    'session_ended_no_meaningful_diff',
    'invalid_forge_completion',
  ])) {
    return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested' };
  }
  if (reason === 'rate_limit_exhausted') return { nextAction: 'block', issueType: 'environment', outcomeClass: 'rate_limited' };
  if (isOneOf(reason, ['parse_corrupted', 'git_error'])) return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error' };
  if (reason) return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested' };
  return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error' };
}

function busterControlForPollResult(pollResult: AnyRecord = {}, failureClass: string | null = null) {
  const terminalStatus = String(
    (selectDefinedValue(() => (pollResult?.status?.status), () => (''))),
  ).trim().toUpperCase();
  if (pollResult?.ok === true && terminalStatus !== STATUS.FAIL && terminalStatus !== STATUS.BLOCKED) {
    return { nextAction: 'pass', issueType: null, outcomeClass: 'passed', failureClass: 'pass' };
  }
  if (isOneOf(failureClass, [
    'timeout',
    'parse_corrupted',
    'agent_session_lifecycle_unstable',
    'infra_crash',
    'pretest_infra',
    'pretest_config',
  ])) {
    return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying', failureClass };
  }
  if (isOneOf(failureClass, ['verdict_fail', 'pretest_code'])) {
    return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested', failureClass };
  }
  if (failureClass === 'rate_limit_exhausted') {
    return { nextAction: 'block', issueType: 'environment', outcomeClass: 'rate_limited', failureClass };
  }
  if (selectTruthyValue(() => (isOneOf(failureClass, ['spawn_failed', 'completion_archive_failed'])), () => (BUSTER_OUTPUT_ARTIFACT_FAILURES.has(textValue(failureClass))))) {
    return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error', failureClass };
  }
  return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error', failureClass: failureClass == null ? 'poll_failure_class_missing' : failureClass };
}

function retryableStartupFailure(error: AnyRecord = null) {
  const reason = typeof error?.reason === 'string' ? error.reason.trim().toLowerCase() : '';
  return [error?.observability_required === true, reason === 'missing_agent_observability_startup_evidence'].some(Boolean);
}

function normalizeHealthCheckResult(result: unknown): AnyRecord {
  if (result && typeof result === 'object') return result as AnyRecord;
  return { ok: result === true };
}

function requireWorkerDependency(deps: AnyRecord, name: string) {
  const dependency = deps?.[name];
  if (typeof dependency !== 'function') {
    throw new Error(`module worker requires deps.${name}`);
  }
  return dependency;
}

async function processStartupRateLimit({
  config,
  workerInput,
  moduleId,
  moduleDir,
  phase,
  runId = null,
  attempt = null,
  dispatchId = null,
  health = {},
}: AnyRecord = {}) {
  const status = buildModuleSessionRateLimitStatus({
    ...objectRecord(health.status),
    module_id: moduleId,
    run_id: runId,
    attempt,
    dispatch_id: (selectDefinedValue(() => (dispatchId), () => (null))),
    gateway_label: (selectDefinedValue(() => (health.gatewayLabel), () => (null))),
    session_key: (selectDefinedValue(() => (health.sessionKey), () => (null))),
    detail: (selectDefinedValue(() => (health.detail), () => (null))),
    reason: 'rate_limited',
  }, {
    moduleId,
    phase,
    identity: objectRecord(health.identity),
  });
  const maxPauses = getRateLimitConfig(config).max_pauses_per_module;
  const priorPauseCount = Number(workerInput?.executionContext?.startupRateLimitPauseCount);
  const pauseCount = (Number.isFinite(priorPauseCount) && priorPauseCount >= 0 ? priorPauseCount : 0) + 1;
  const rateLimitStep = await processSessionRateLimit(config, status, {
    pauseCount,
    maxPauses,
    normalizeStatus: (value: AnyRecord = {}) => buildModuleSessionRateLimitStatus({
      ...value,
      detail: (selectDefinedValue(() => (value.detail), () => (null))),
      reason: 'rate_limited',
    }, {
      moduleId,
      phase,
      identity: objectRecord(health.identity),
    }),
    pauseLogMessage: ({ pauseCount: count, maxPauses: max, cooldownHours, resumeAt }: AnyRecord) =>
      `[${phase}-${moduleId}] ACP startup rate limited (pause ${count}/${max}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
    resumeLogMessage: () => `[${phase}-${moduleId}] ACP startup rate limit cooldown complete — retrying spawn`,
  });

  if (rateLimitStep.exhausted) {
    return {
      reason: 'rate_limit_exhausted',
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'rate_limited',
      failureClass: 'rate_limit_exhausted',
      rateLimitStatus: requireObjectRecord(rateLimitStep.status, 'rateLimitStep.status'),
      rateLimitPauses: pauseCount,
      maxRateLimitPauses: maxPauses,
      error: selectPresentValue(health.detail, ACP_STARTUP_RATE_LIMIT_EXHAUSTED),
    };
  }

  return {
    reason: 'rate_limited',
    nextAction: 'retry',
    issueType: 'environment',
    outcomeClass: 'retrying',
    failureClass: 'rate_limited',
    rateLimitStatus: requireObjectRecord(rateLimitStep.status, 'rateLimitStep.status'),
    rateLimitPauses: pauseCount,
    maxRateLimitPauses: maxPauses,
    error: selectPresentValue(health.detail, ACP_STARTUP_RATE_LIMITED),
  };
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
    thinkingSource = null,
  } = objectRecord(workerInput?.worker?.backendConfig);
  const moduleId = workerInput.ids.moduleId;
  const moduleDir = workerInput.executionContext.moduleDir;
  const timeoutMinutes = workerInput.executionContext.timeoutMinutes;
  const attempt = workerInput.ids.attempt;
  const runId = workerInput.ids.runId;
  const headBefore = selectDefinedValue(() => (workerInput.executionContext.headBefore), () => (null));

  const spawn = requireWorkerDependency(deps, 'spawnAgent');
  const verifyHealth = requireWorkerDependency(deps, 'verifyAgentHealth');
  const kill = requireWorkerDependency(deps, 'killAgent');
  const getTracked = requireWorkerDependency(deps, 'getTrackedAgent');
  const labelFor = requireWorkerDependency(deps, 'acpLabel');
  const poll = requireWorkerDependency(deps, 'pollForgeCompletionWithRateLimitRecovery');
  const loadStatusFn = requireWorkerDependency(deps, 'loadStatus');
  const saveStreamLogFn = requireWorkerDependency(deps, 'saveStreamLog');
  const clearShutdownContextFn = requireWorkerDependency(deps, 'clearShutdownContext');

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
      thinking_source: thinkingSource,
    });
  } catch (e: any) {
    clearShutdownContextFn();
    return buildModuleForgeWorkerControlResult(config, workerInput, {
      nextAction: retryableStartupFailure(e) ? 'retry' : 'block',
      issueType: 'environment',
      outcomeClass: retryableStartupFailure(e) ? 'retrying' : 'error',
      reason: retryableStartupFailure(e) ? 'startup_evidence_missing' : 'spawn_failed',
      error: e.message,
      gatewayLabel: selectDefinedValue(() => (e?.gateway_label), () => (null)),
      sessionKey: selectDefinedValue(() => (e?.session_key), () => (null)),
      attempt,
    });
  }

  const forgeHealth = normalizeHealthCheckResult(await verifyHealth(config, 'forge', moduleId, { trackingLabel: forgeSessionLabel }));
  if (!forgeHealth.ok) {
    await kill(config, 'forge', moduleId, false, { trackingLabel: forgeSessionLabel });
    clearShutdownContextFn();
    if ([forgeHealth.rateLimited, forgeHealth.reason === 'rate_limited'].some(Boolean)) {
      const rateLimitControl = await processStartupRateLimit({
        config,
        workerInput,
        moduleId,
        moduleDir,
        phase: 'forge',
        runId,
        attempt,
        health: forgeHealth,
      });
      return buildModuleForgeWorkerControlResult(config, workerInput, {
        ...rateLimitControl,
        gatewayLabel: selectDefinedValue(() => (forgeHealth.gatewayLabel), () => (null)),
        sessionKey: selectDefinedValue(() => (forgeHealth.sessionKey), () => (null)),
        streamLogPath: selectDefinedValue(() => (forgeHealth.streamLogPath), () => (null)),
        attempt,
      });
    }
    return buildModuleForgeWorkerControlResult(config, workerInput, {
      nextAction: 'retry',
      issueType: 'environment',
      outcomeClass: 'retrying',
      reason: 'healthcheck_failed',
      error: 'Forge agent failed health check — session not running after spawn',
      attempt,
    });
  }

  trackedForgeAgent = selectDefinedValue(() => (getTracked(forgeSessionLabel)), () => (null));
  forgeStreamPath = selectDefinedValue(() => (trackedForgeAgent?.streamLogPath), () => (null));

  const dispatch = {
    label: forgeSessionLabel,
    session_key: selectDefinedValue(() => (trackedForgeAgent?.sessionKey), () => (null)),
    stream_log_path: selectDefinedValue(() => (trackedForgeAgent?.streamLogPath), () => (null)),
    gateway_label: selectDefinedValue(() => (trackedForgeAgent?.gatewayLabel), () => (null)),
    dispatch_id: (selectDefinedValue(() => (trackedForgeAgent?.telemetry_dispatch_id), () => (null))),
    run_id: runId,
    runtime: selectDefinedValue(() => (trackedForgeAgent?.runtime), () => (null)),
    model,
    agent_id: selectDefinedValue(() => (trackedForgeAgent?.agentId), () => (null)),
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
        attempt,
        dispatchId: dispatch.dispatch_id,
        sessionKey: dispatch.session_key,
        gatewayLabel: dispatch.gateway_label,
      });
    }
  } finally {
    try {
      forgeStreamPath = (selectDefinedValue(() => (getTracked(forgeSessionLabel)?.streamLogPath), () => (null)));
      try {
        await kill(config, 'forge', moduleId, pollResult?.ok === true, {
          trackingLabel: forgeSessionLabel,
          ...(pollResult?.ok ? FORGE_SUCCESSFUL_KILL_POLICY : {}),
        });
      } catch (e: any) {
        if (hookError === null) hookError = e;
        hookFailureReason = 'cleanup_failed';
      }
      try {
        finalStatus = selectDefinedValue(() => (loadStatusFn(config, moduleDir)), () => (null));
      } catch (e: any) {
        if (hookError === null) hookError = e;
        hookFailureReason = 'cleanup_failed';
      }
      if (typeof onFinalized === 'function') {
        try {
          await onFinalized({
            status: finalStatus,
            stream_log_path: forgeStreamPath,
            dispatch,
          });
          try {
            finalStatus = requireObjectRecord(loadStatusFn(config, moduleDir), 'final Forge status after finalize');
          } catch (e: any) {
            if (hookError === null) hookError = e;
            hookFailureReason = 'cleanup_failed';
          }
        } catch (e: any) {
          if (hookError === null) hookError = e;
          hookFailureReason = 'finalize_hook_failed';
        }
      }
      try {
        await saveStreamLogFn(config, moduleDir, 'forge', attempt, forgeStreamPath);
      } catch (e: any) {
        if (hookError === null) hookError = e;
        hookFailureReason = 'cleanup_failed';
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
      error: errorMessage(hookError),
      finalStatus,
      streamLogPath: forgeStreamPath,
      gatewayLabel: dispatch.gateway_label,
      sessionKey: dispatch.session_key,
      attempt,
      ...evidence,
    });
  }

  const forgeControl = forgeControlForPollResult(objectRecord(pollResult));
  const forgeEvidence = statusEvidenceFields(pollResult);
  const forgePollStatus = pollStatus(pollResult);
  const forgeTerminalStatus = pollResult?.ok === true
    && [STATUS.READY_FOR_TESTING, STATUS.BLOCKED].includes(forgePollStatus?.status)
    ? forgePollStatus
    : null;
  return buildModuleForgeWorkerControlResult(config, workerInput, {
    ...forgeControl,
    reason: selectDefinedValue(() => (pollResult?.reason), () => (null)),
    finalStatus: forgeTerminalStatus === null ? finalStatus : forgeTerminalStatus,
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
  const {
    model,
    modelSource = null,
    thinking = null,
    thinkingSource = null,
    thinkingSupported = null,
    reasoningLevel = thinkingSupported === false ? 'not supported' : (selectDefinedValue(() => (thinking), () => (null))),
    runtimeKind = null,
  } = objectRecord(workerInput?.worker?.backendConfig);
  const moduleId = workerInput.ids.moduleId;
  const moduleDir = workerInput.executionContext.moduleDir;
  const timeoutMinutes = workerInput.executionContext.timeoutMinutes;
  const runId = workerInput.ids.runId;
  const attempt = workerInput.ids.attempt;
  const dispatchId = selectDefinedValue(() => (workerInput.ids.dispatchId), () => (null));

  const archive = requireWorkerDependency(deps, 'archiveModuleCompletions');
  const spawn = requireWorkerDependency(deps, 'spawnAgent');
  const verifyHealth = requireWorkerDependency(deps, 'verifyAgentHealth');
  const kill = requireWorkerDependency(deps, 'killAgent');
  const poll = requireWorkerDependency(deps, 'pollDualWithRateLimitRecovery');
  const loadStatusFn = requireWorkerDependency(deps, 'loadStatus');
  const saveStreamLogFn = requireWorkerDependency(deps, 'saveStreamLog');
  const clearShutdownContextFn = requireWorkerDependency(deps, 'clearShutdownContext');

  let workerDispatch = null;
  let pollResult = null;
  let finalStatus = null;
  let finalStreamPath = null;
  let finalSessionKey = null;
  let hookError = null;
  let hookFailureReason = null;
  const cleanupDiagnostics = [];

  const recordCleanupDiagnostic = (phase, error) => {
    cleanupDiagnostics.push({
      phase,
      error: errorMessage(error),
    });
  };

  const hasTerminalPollAuthority = () => {
    const status = pollStatus(pollResult);
    return pollResult?.ok === true && [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(status?.status);
  };

  const hasPollAuthority = () => {
    return pollResult !== null && typeof pollResult?.reason === 'string' && pollResult.reason.trim();
  };

  const recordCleanupError = (phase, error) => {
    recordCleanupDiagnostic(phase, error);
    if (selectTruthyValue(() => (hasTerminalPollAuthority()), () => (hasPollAuthority()))) return;
    if (hookError === null) hookError = error;
    hookFailureReason = 'cleanup_failed';
  };

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
      error: errorMessage(e),
      failureClass: 'completion_archive_failed',
      dispatchId: selectDefinedValue(() => (dispatchId), () => (null)),
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
      error: requireNonEmptyString(archiveResult.error, 'archiveResult.error'),
      failureClass: 'completion_archive_failed',
      dispatchId: selectDefinedValue(() => (dispatchId), () => (null)),
      attempt,
      runId,
    });
  }

  try {
    workerDispatch = await spawn(config, progress, 'buster', moduleId, model, prompt, {
      status,
      taskType: 'module_test',
      cwd: selectDefinedValue(() => (workerInput?.workspace?.repoRoot), () => (config.repo_root)),
      run_id: runId,
      attempt,
      dispatch_id: dispatchId,
      model_source: modelSource,
      thinking,
      thinking_source: thinkingSource,
      thinking_supported: thinkingSupported,
      reasoning_level: reasoningLevel,
      runtime_kind: runtimeKind,
    });
  } catch (e: any) {
    clearShutdownContextFn();
    return buildModuleBusterWorkerControlResult(config, workerInput, {
      nextAction: retryableStartupFailure(e) ? 'retry' : 'block',
      issueType: 'environment',
      outcomeClass: retryableStartupFailure(e) ? 'retrying' : 'error',
      reason: retryableStartupFailure(e) ? 'startup_evidence_missing' : 'spawn_failed',
      failureClass: retryableStartupFailure(e) ? 'healthcheck_failed' : 'spawn_failed',
      error: errorMessage(e),
      dispatchId: selectDefinedValue(() => (dispatchId), () => (null)),
      gatewayLabel: selectDefinedValue(() => (e?.gateway_label), () => (null)),
      sessionKey: selectDefinedValue(() => (e?.session_key), () => (null)),
      attempt,
      runId,
    });
  }

  const dispatch = {
    label: (selectDefinedValue(() => (workerDispatch?.dispatch_id), () => (null))),
    session_key: selectDefinedValue(() => (workerDispatch?.session_key), () => (null)),
    stream_log_path: selectDefinedValue(() => (workerDispatch?.stream_log_path), () => (null)),
    gateway_label: selectDefinedValue(() => (workerDispatch?.gateway_label), () => (null)),
    dispatch_id: (selectDefinedValue(() => (workerDispatch?.dispatch_id), () => (null))),
    run_id: runId,
    attempt,
    runtime: (selectDefinedValue(() => (workerDispatch?.runtime), () => (null))),
    model: (selectDefinedValue(() => (workerDispatch?.model), () => (null))),
    model_source: (selectDefinedValue(() => (workerDispatch?.model_source), () => (null))),
    reasoning_level: (selectDefinedValue(() => (workerDispatch?.reasoning_level), () => (null))),
    thinking_source: (selectDefinedValue(() => (workerDispatch?.thinking_source), () => (null))),
    agent_id: null,
    phase: 'buster',
  };

  const busterHealth = normalizeHealthCheckResult(await verifyHealth(config, 'buster', moduleId));
  if (!busterHealth.ok) {
    await kill(config, 'buster', moduleId, false);
    clearShutdownContextFn();
    if ([busterHealth.rateLimited, busterHealth.reason === 'rate_limited'].some(Boolean)) {
      const rateLimitControl = await processStartupRateLimit({
        config,
        workerInput,
        moduleId,
        moduleDir,
        phase: 'buster',
        runId: dispatch.run_id,
        attempt,
        dispatchId: dispatch.dispatch_id,
        health: busterHealth,
      });
      return buildModuleBusterWorkerControlResult(config, workerInput, {
        ...rateLimitControl,
        dispatchId: dispatch.dispatch_id,
        gatewayLabel: (selectDefinedValue(() => (busterHealth.gatewayLabel), () => (null))),
        sessionKey: (selectDefinedValue(() => (busterHealth.sessionKey), () => (null))),
        streamLogPath: (selectDefinedValue(() => (busterHealth.streamLogPath), () => (null))),
        attempt,
        runId: dispatch.run_id,
      });
    }
    return buildModuleBusterWorkerControlResult(config, workerInput, {
      nextAction: 'retry',
      issueType: 'environment',
      outcomeClass: 'retrying',
      reason: 'healthcheck_failed',
      failureClass: 'healthcheck_failed',
      error: 'Buster agent failed health check — session not running after spawn',
      dispatchId: dispatch.dispatch_id,
      gatewayLabel: dispatch.gateway_label,
      sessionKey: dispatch.session_key,
      streamLogPath: dispatch.stream_log_path,
      attempt,
      runId: dispatch.run_id,
    });
  }

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
      try {
        pollResult = await poll(config, moduleDir, moduleId,
          [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED], timeoutMinutes, {
            run_id: dispatch.run_id,
            attempt,
            dispatch_id: dispatch.dispatch_id,
            session_key: dispatch.session_key,
            gateway_label: dispatch.gateway_label,
          });
      } catch (e: any) {
        const failureClass = isJsonParseFailure(e)
          ? 'parse_corrupted'
          : 'completion_event_adapter_failed';
        pollResult = {
          ok: false,
          reason: failureClass,
          status: {
            module_id: moduleId,
            status: STATUS.FAIL,
            failure_class: failureClass,
            error: errorMessage(e),
            _source: 'module_buster_poll',
          },
          failure_class: failureClass,
          error: e,
        };
      }
    }
  } finally {
    try {
      try {
        await kill(config, 'buster', moduleId, pollResult?.ok === true);
      } catch (e: any) {
        if (hookError === null) hookError = e;
        hookFailureReason = 'cleanup_failed';
      }
      try {
        finalStatus = selectDefinedValue(() => (loadStatusFn(config, moduleDir, { raw: true })), () => (null));
      } catch (e: any) {
        recordCleanupError('load_final_status', e);
      }
      const finalActive = selectDefinedValue(() => (finalStatus?.active_agent), () => (null));
      const finalActivePolicy = buildActiveSessionAuthorityPolicy({
        lifecycleActiveSession: finalActive,
        evidenceActiveSession: {
          run_id: dispatch.run_id,
          attempt: dispatch.attempt,
          dispatch_id: dispatch.dispatch_id,
          session_key: dispatch.session_key,
          gateway_label: dispatch.gateway_label,
        },
      });
      const confirmedFinalActive = finalActivePolicy.identity_confirmed === true ? finalActive : null;
      finalStreamPath = (selectDefinedValue(() => (confirmedFinalActive?.stream_log_path), () => (null)));
      finalSessionKey = selectDefinedValue(() => (dispatch.session_key), () => (null));
      if (typeof onFinalized === 'function') {
        try {
          await onFinalized({
            status: finalStatus,
            stream_log_path: finalStreamPath,
            session_key: finalSessionKey,
            dispatch,
          });
          try {
            finalStatus = requireObjectRecord(loadStatusFn(config, moduleDir, { raw: true }), 'final Buster status after finalize');
          } catch (e: any) {
            recordCleanupError('load_finalized_status', e);
          }
        } catch (e: any) {
          recordCleanupDiagnostic('finalize_hook', e);
          if (!hasTerminalPollAuthority()) {
            if (hookError === null) hookError = e;
            hookFailureReason = 'finalize_hook_failed';
          }
        }
      }
      try {
        await saveStreamLogFn(config, moduleDir, 'buster', attempt, finalStreamPath);
      } catch (e: any) {
        recordCleanupError('save_stream_log', e);
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
      error: errorMessage(hookError),
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

  const failureClass = resolveModuleBusterFailureClass(objectRecord(pollResult));
  const busterControl = busterControlForPollResult(objectRecord(pollResult), failureClass);
  const busterEvidence = statusEvidenceFields(pollResult);
  return buildModuleBusterWorkerControlResult(config, workerInput, {
    ...busterControl,
    reason: selectDefinedValue(() => (pollResult?.reason), () => (null)),
    finalStatus: terminalBusterFinalStatus({
      finalStatus,
      pollStatus: pollStatus(pollResult),
      redisEntry: pollRedisEntry(pollResult),
      failureClass,
      pollReason: pollResult?.reason,
    }),
    streamLogPath: finalStreamPath,
    dispatchId: dispatch.dispatch_id,
    gatewayLabel: dispatch.gateway_label,
    sessionKey: finalSessionKey,
    attempt,
    runId: dispatch.run_id,
    ...busterEvidence,
    statusErrors: cleanupDiagnostics,
  });
}
