import {
  buildTypedWorkerControlResult,
  cloneSerializable,
  coerceTypedWorkerControlResult,
  isTypedWorkerControlResult,
} from '../services/contracts/worker-control-result.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

const WORKER_NEXT_ACTIONS = new Set(['pass', 'retry', 'request_fix', 'block']);
const WORKER_TYPES = Object.freeze({
  module_forge: 'module_forge',
  module_buster: 'module_buster',
});
const WORKER_STAGE_IDS = Object.freeze({
  module_forge: 'worker:module_forge',
  module_buster: 'worker:module_buster',
});
const MODULE_ID_MISSING = 'missing_module_id';

function objectRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function selectPresentValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

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
  return selectTruthyValue(() => (normalized), () => (null));
}

function normalizeOutcomeClass(value: unknown): string {
  const outcomeClass = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (outcomeClass) return outcomeClass;
  throw new Error('typed worker control result requires explicit canonical outcomeClass');
}

function requireWorkerRunId(workerInput: AnyRecord = {}, producerType: string): string {
  const runId = typeof workerInput?.ids?.runId === 'string' ? workerInput.ids.runId.trim() : '';
  if (runId) return runId;
  throw new Error(`${producerType} worker control result requires ids.runId`);
}

function buildModuleForgeWorkerSummary(workerInput: AnyRecord = {}, input: AnyRecord = {}) {
  const moduleId = selectPresentValue(workerInput?.ids?.moduleId, MODULE_ID_MISSING);
  if (input.nextAction === 'pass') {
    return `Module Forge worker '${moduleId}' reached READY_FOR_TESTING`;
  }
  return selectPresentValue(input.error, input.reason, `Module Forge worker '${moduleId}' failed`);
}

export function buildModuleForgeWorkerControlResult(config: AnyRecord, workerInput: AnyRecord = {}, input: AnyRecord = {}, opts: AnyRecord = {}) {
  const nextAction = normalizeNextAction(input.nextAction);
  const issueType = normalizeIssueType(input.issueType, nextAction);
  const outcomeClass = normalizeOutcomeClass(input.outcomeClass);
  const ids = objectRecord(workerInput?.ids);
  const refs = objectRecord(workerInput?.refs);
  const finalStatus = selectDefinedValue(() => (input.finalStatus), () => (null));
  const runId = requireWorkerRunId(workerInput, 'module_forge');
  const metadata = {
    module_id: selectTruthyValue(() => (ids.moduleId), () => (null)),
    run_id: runId,
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (ids.attempt), () => (input?.attempt))), () => (null)),
    stage_id: selectPresentValue(ids.stageId, opts?.stageId, WORKER_STAGE_IDS.module_forge),
    worker_type: selectPresentValue(workerInput?.worker?.workerType, WORKER_TYPES.module_forge),
    module_dir: selectTruthyValue(() => (workerInput?.executionContext?.moduleDir), () => (null)),
    reason: selectTruthyValue(() => (input?.reason), () => (null)),
    error: selectTruthyValue(() => (input?.error), () => (null)),
    gateway_label: selectTruthyValue(() => (input?.gatewayLabel), () => (null)),
    session_key: selectTruthyValue(() => (input?.sessionKey), () => (null)),
    stream_log_path: selectTruthyValue(() => (input?.streamLogPath), () => (null)),
    module_attempt_ref: selectTruthyValue(() => (refs.moduleAttemptRef), () => (null)),
    final_status: cloneSerializable(finalStatus),
    status_detail: selectTruthyValue(() => (input?.statusDetail), () => (null)),
    status_message: selectTruthyValue(() => (input?.statusMessage), () => (null)),
    status_errors: Array.isArray(input?.statusErrors) ? cloneSerializable(input.statusErrors) : null,
    polling_git: cloneSerializable(selectTruthyValue(() => (input?.pollingGit), () => (null))),
    rate_limit_status: cloneSerializable(selectTruthyValue(() => (input?.rateLimitStatus), () => (null))),
    rate_limit_pauses: selectDefinedValue(() => (input?.rateLimitPauses), () => (null)),
    max_rate_limit_pauses: selectDefinedValue(() => (input?.maxRateLimitPauses), () => (null)),
  };

  return buildTypedWorkerControlResult({
    producerType: 'module_forge',
    nextAction,
    issueType,
    outcomeClass,
    summary: forgeWorkerSummaryAuthority(workerInput, input, nextAction),
    metadata,
    backendKind: 'session',
    dispatchRef: selectTruthyValue(() => (refs.moduleAttemptRef), () => (null)),
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
  const moduleId = selectPresentValue(workerInput?.ids?.moduleId, MODULE_ID_MISSING);
  const finalStatus = selectDefinedValue(() => (input?.finalStatus?.status), () => (null));
  if (input.nextAction === 'pass') {
    return `Module Buster worker '${moduleId}' reached ${selectPresentValue(finalStatus, 'PASS')}`;
  }
  return selectPresentValue(input.error, input.reason, `Module Buster worker '${moduleId}' failed`);
}

export function buildModuleBusterWorkerControlResult(config: AnyRecord, workerInput: AnyRecord = {}, input: AnyRecord = {}, opts: AnyRecord = {}) {
  const nextAction = normalizeNextAction(input.nextAction);
  const issueType = normalizeIssueType(input.issueType, nextAction);
  const outcomeClass = normalizeOutcomeClass(input.outcomeClass);
  const failureClass = nextAction === 'pass' ? 'pass' : normalizeFailureClass(input.failureClass);
  if (nextAction !== 'pass' && !failureClass) {
    throw new Error('module_buster worker failure result requires explicit typed failureClass');
  }
  const refs = objectRecord(workerInput?.refs);
  const finalStatus = selectDefinedValue(() => (input.finalStatus), () => (null));
  const redisEntry = selectTruthyValue(() => (input.redisEntry), () => (null));
  const runId = requireWorkerRunId(workerInput, 'module_buster');
  const metadata = buildModuleBusterMetadata(workerInput, input, opts, {
    failureClass,
    finalStatus,
    redisEntry,
    runId,
  });

  return buildTypedWorkerControlResult({
    producerType: 'module_buster',
    nextAction,
    issueType,
    outcomeClass,
    summary: busterWorkerSummaryAuthority(workerInput, input, nextAction),
    metadata,
    backendKind: 'redis_dispatch',
    dispatchRef: selectTruthyValue(() => (selectTruthyValue(() => (refs.workerDispatchRef), () => (metadata.dispatch_id))), () => (null)),
    typedMetadata: {
      outcomeClass,
      attempt: metadata.attempt,
      dispatch_id: metadata.dispatch_id,
      redis_source: selectTruthyValue(() => (redisEntry?.source), () => (null)),
    },
  });
}

function buildModuleBusterMetadata(
  workerInput: AnyRecord,
  input: AnyRecord,
  opts: AnyRecord,
  values: {
    failureClass: string | null;
    finalStatus: unknown;
    redisEntry: AnyRecord | null;
    runId: string;
  },
) {
  const ids = objectRecord(workerInput?.ids);
  const refs = objectRecord(workerInput?.refs);
  return {
    module_id: selectTruthyValue(() => (ids.moduleId), () => (null)),
    run_id: values.runId,
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (ids.attempt), () => (input?.attempt))), () => (null)),
    stage_id: selectPresentValue(ids.stageId, opts?.stageId, WORKER_STAGE_IDS.module_buster),
    worker_type: selectPresentValue(workerInput?.worker?.workerType, WORKER_TYPES.module_buster),
    module_dir: selectTruthyValue(() => (workerInput?.executionContext?.moduleDir), () => (null)),
    reason: selectTruthyValue(() => (input?.reason), () => (null)),
    error: selectTruthyValue(() => (input?.error), () => (null)),
    failure_class: values.failureClass,
    dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (input?.dispatchId), () => (ids.dispatchId))), () => (refs.workerDispatchRef))), () => (null)),
    gateway_label: selectTruthyValue(() => (input?.gatewayLabel), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (input?.sessionKey), () => (values.redisEntry?.session_key))), () => (null)),
    model: selectTruthyValue(() => (workerInput?.worker?.backendConfig?.model), () => (null)),
    model_source: selectTruthyValue(() => (workerInput?.worker?.backendConfig?.modelSource), () => (null)),
    reasoning_level: selectTruthyValue(() => (workerInput?.worker?.backendConfig?.reasoningLevel), () => (null)),
    thinking_source: selectTruthyValue(() => (workerInput?.worker?.backendConfig?.thinkingSource), () => (null)),
    runtime: selectTruthyValue(() => (workerInput?.worker?.backendConfig?.runtimeKind), () => (null)),
    stream_log_path: selectTruthyValue(() => (input?.streamLogPath), () => (null)),
    module_attempt_ref: selectTruthyValue(() => (refs.moduleAttemptRef), () => (null)),
    worker_dispatch_ref: selectTruthyValue(() => (refs.workerDispatchRef), () => (null)),
    redis_entry: cloneSerializable(values.redisEntry),
    final_status: cloneSerializable(values.finalStatus),
    status_detail: selectTruthyValue(() => (input?.statusDetail), () => (null)),
    status_message: selectTruthyValue(() => (input?.statusMessage), () => (null)),
    status_errors: Array.isArray(input?.statusErrors) ? cloneSerializable(input.statusErrors) : null,
    completion_conflict: cloneSerializable(selectTruthyValue(() => (input?.completionConflict), () => (null))),
    polling_git: cloneSerializable(selectTruthyValue(() => (input?.pollingGit), () => (null))),
    rate_limit_status: cloneSerializable(selectTruthyValue(() => (input?.rateLimitStatus), () => (null))),
    rate_limit_pauses: selectDefinedValue(() => (input?.rateLimitPauses), () => (null)),
    max_rate_limit_pauses: selectDefinedValue(() => (input?.maxRateLimitPauses), () => (null)),
  };
}

function forgeWorkerSummaryAuthority(workerInput: AnyRecord, input: AnyRecord, nextAction: string) {
  if (input.summary) return input.summary;
  return buildModuleForgeWorkerSummary(workerInput, { ...input, nextAction });
}

function busterWorkerSummaryAuthority(workerInput: AnyRecord, input: AnyRecord, nextAction: string) {
  if (input.summary) return input.summary;
  return buildModuleBusterWorkerSummary(workerInput, { ...input, nextAction });
}

export function isModuleBusterWorkerControlResult(result: unknown) {
  return isTypedWorkerControlResult(result, 'module_buster');
}

export function coerceModuleBusterWorkerControlResult(config: AnyRecord, workerInput: AnyRecord = {}, result: unknown, opts: AnyRecord = {}) {
  return coerceTypedWorkerControlResult(result, { producerType: 'module_buster' });
}
