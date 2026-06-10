import {
  buildTypedWorkerControlResult,
  cloneSerializable,
  coerceTypedWorkerControlResult,
  isTypedWorkerControlResult,
} from '../services/contracts/worker-control-result.ts';

type AnyRecord = Record<string, any>;

const WORKER_NEXT_ACTIONS = new Set(['pass', 'retry', 'request_fix', 'block']);

function normalizeNextAction(value: unknown): string {
  const action = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (WORKER_NEXT_ACTIONS.has(action)) return action;
  throw new Error(`typed worker control result requires explicit nextAction: ${Array.from(WORKER_NEXT_ACTIONS).join(', ')}`);
}

function normalizeIssueType(value: unknown, nextAction: string): string | null {
  if (nextAction === 'pass') return null;
  const issueType = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (issueType) return issueType;
  throw new Error('typed worker control result requires explicit issueType for non-pass nextAction');
}

function normalizeFailureClass(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeOutcomeClass(value: unknown): string {
  const outcomeClass = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (outcomeClass) return outcomeClass;
  throw new Error('typed worker control result requires explicit canonical outcomeClass');
}

function buildModuleForgeWorkerSummary(workerInput: AnyRecord = {}, input: AnyRecord = {}) {
  const moduleId = workerInput?.ids?.moduleId || 'unknown';
  if (input.nextAction === 'pass') {
    return `Module Forge worker '${moduleId}' reached READY_FOR_TESTING`;
  }
  return input.error || input.reason || `Module Forge worker '${moduleId}' failed`;
}

export function buildModuleForgeWorkerControlResult(config: AnyRecord, workerInput: AnyRecord = {}, input: AnyRecord = {}, opts: AnyRecord = {}) {
  const nextAction = normalizeNextAction(input.nextAction);
  const issueType = normalizeIssueType(input.issueType, nextAction);
  const outcomeClass = normalizeOutcomeClass(input.outcomeClass);
  const ids = workerInput?.ids || {};
  const refs = workerInput?.refs || {};
  const finalStatus = input.finalStatus ?? null;
  const metadata = {
    module_id: ids.moduleId || null,
    run_id: ids.runId || config?._runId || config?.run_id || null,
    attempt: ids.attempt ?? input?.attempt ?? null,
    stage_id: ids.stageId || opts?.stageId || 'worker:module_forge',
    worker_type: workerInput?.worker?.workerType || 'module_forge',
    module_dir: workerInput?.executionContext?.moduleDir || null,
    reason: input?.reason || null,
    error: input?.error || null,
    gateway_label: input?.gatewayLabel || null,
    session_key: input?.sessionKey || null,
    stream_log_path: input?.streamLogPath || null,
    module_attempt_ref: refs.moduleAttemptRef || null,
    final_status: cloneSerializable(finalStatus),
    status_detail: input?.statusDetail || null,
    status_message: input?.statusMessage || null,
    status_errors: Array.isArray(input?.statusErrors) ? cloneSerializable(input.statusErrors) : null,
    polling_git: cloneSerializable(input?.pollingGit || null),
    rate_limit_status: cloneSerializable(input?.rateLimitStatus || null),
    rate_limit_pauses: input?.rateLimitPauses ?? null,
    max_rate_limit_pauses: input?.maxRateLimitPauses ?? input?.rateLimitStatus?.max_rate_limit_pauses ?? null,
  };

  return buildTypedWorkerControlResult({
    producerType: 'module_forge',
    nextAction,
    issueType,
    outcomeClass,
    summary: input.summary || buildModuleForgeWorkerSummary(workerInput, { ...input, nextAction }),
    metadata,
    backendKind: 'session',
    dispatchRef: refs.moduleAttemptRef || null,
    typedMetadata: {
      outcomeClass,
      attempt: metadata.attempt,
    },
  });
}

export function isModuleForgeWorkerControlResult(result: unknown) {
  return isTypedWorkerControlResult(result, 'module_forge');
}

export function coerceModuleForgeWorkerControlResult(config: AnyRecord, workerInput: AnyRecord = {}, result: unknown, opts: AnyRecord = {}) {
  return coerceTypedWorkerControlResult(result, { producerType: 'module_forge' });
}

function buildModuleBusterWorkerSummary(workerInput: AnyRecord = {}, input: AnyRecord = {}) {
  const moduleId = workerInput?.ids?.moduleId || 'unknown';
  const finalStatus = input?.finalStatus?.status || null;
  if (input.nextAction === 'pass') {
    return `Module Buster worker '${moduleId}' reached ${finalStatus || 'PASS'}`;
  }
  return input.error
    || input.reason
    || `Module Buster worker '${moduleId}' failed`;
}

export function buildModuleBusterWorkerControlResult(config: AnyRecord, workerInput: AnyRecord = {}, input: AnyRecord = {}, opts: AnyRecord = {}) {
  const nextAction = normalizeNextAction(input.nextAction);
  const issueType = normalizeIssueType(input.issueType, nextAction);
  const outcomeClass = normalizeOutcomeClass(input.outcomeClass);
  const failureClass = nextAction === 'pass' ? 'pass' : normalizeFailureClass(input.failureClass);
  if (nextAction !== 'pass' && !failureClass) {
    throw new Error('module_buster worker failure result requires explicit typed failureClass');
  }
  const ids = workerInput?.ids || {};
  const refs = workerInput?.refs || {};
  const finalStatus = input.finalStatus ?? null;
  const redisEntry = input.redisEntry || null;
  const metadata = {
    module_id: ids.moduleId || null,
    run_id: ids.runId || input?.runId || config?._runId || config?.run_id || null,
    attempt: ids.attempt ?? input?.attempt ?? null,
    stage_id: ids.stageId || opts?.stageId || 'worker:module_buster',
    worker_type: workerInput?.worker?.workerType || 'module_buster',
    module_dir: workerInput?.executionContext?.moduleDir || null,
    reason: input?.reason || null,
    error: input?.error || null,
    failure_class: failureClass,
    dispatch_id: input?.dispatchId || ids.dispatchId || refs.workerDispatchRef || null,
    gateway_label: input?.gatewayLabel || null,
    session_key: input?.sessionKey || redisEntry?.session_key || null,
    stream_log_path: input?.streamLogPath || null,
    module_attempt_ref: refs.moduleAttemptRef || null,
    worker_dispatch_ref: refs.workerDispatchRef || null,
    redis_entry: cloneSerializable(redisEntry),
    final_status: cloneSerializable(finalStatus),
    status_detail: input?.statusDetail || null,
    status_message: input?.statusMessage || null,
    status_errors: Array.isArray(input?.statusErrors) ? cloneSerializable(input.statusErrors) : null,
    completion_conflict: cloneSerializable(input?.completionConflict || null),
    polling_git: cloneSerializable(input?.pollingGit || null),
    rate_limit_status: cloneSerializable(input?.rateLimitStatus || null),
    rate_limit_pauses: input?.rateLimitPauses ?? null,
    max_rate_limit_pauses: input?.maxRateLimitPauses ?? input?.rateLimitStatus?.max_rate_limit_pauses ?? null,
  };

  return buildTypedWorkerControlResult({
    producerType: 'module_buster',
    nextAction,
    issueType,
    outcomeClass,
    summary: input.summary || buildModuleBusterWorkerSummary(workerInput, { ...input, nextAction }),
    metadata,
    backendKind: 'redis_dispatch',
    dispatchRef: refs.workerDispatchRef || metadata.dispatch_id || null,
    typedMetadata: {
      outcomeClass,
      attempt: metadata.attempt,
      dispatch_id: metadata.dispatch_id,
      redis_source: redisEntry?.source || null,
    },
  });
}

export function isModuleBusterWorkerControlResult(result: unknown) {
  return isTypedWorkerControlResult(result, 'module_buster');
}

export function coerceModuleBusterWorkerControlResult(config: AnyRecord, workerInput: AnyRecord = {}, result: unknown, opts: AnyRecord = {}) {
  return coerceTypedWorkerControlResult(result, { producerType: 'module_buster' });
}
