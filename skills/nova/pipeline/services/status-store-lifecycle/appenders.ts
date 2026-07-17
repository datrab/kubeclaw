import { createOpaqueId } from '../../core/runtime.ts';
import { assertCompletion } from '../../completion.ts';
import { appendJsonLine, lifecycleEventsPath, withLifecycleAppendLock } from './storage.ts';
import { buildLifecycleIdempotencyKey } from './idempotency.ts';
import { getPipelineArtifactBundle } from '../artifact-bundle.ts';
import {
  buildCooldownRefs,
  buildGateEvaluationRefs,
  buildModuleAttemptRefs,
  buildPipelineRefs,
  buildResumeSignalRefs,
  buildWaitRefs,
  getActiveProgress,
  resolveModuleAttempt,
  resolveModuleCommit,
  resolveModuleConfig,
} from './refs.ts';
import {
  createDefaultLifecycleReadModels,
  loadLifecycleReadModels,
  readLifecycleEvents,
  rebuildLifecycleReadModels,
  saveLifecycleReadModels,
} from './read-models.ts';
import { ensureLifecycleEventLegal } from './legality.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../correlation.ts';
import { normalizeFailureClass } from '../failure-semantics.ts';
import { cloneSerializable } from '../serialization.ts';
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const LIFECYCLE_READ_MODELS_VERSION = 'v1';
const PIPELINE_RUN_COMPLETED_STATUS = 'succeeded';
const PIPELINE_RUN_COMPLETED_REASON = 'PIPELINE_COMPLETE';
const PIPELINE_RUN_HALTED_REASON = 'halted';
const STALE_RECOVERY_ATTEMPT = 1;
const STALE_RECOVERY_TARGET_STATUS = 'PENDING';
const STALE_RECOVERY_REASON = 'stale recovery';
const MODULE_READY_FOR_TESTING_STATUS = 'READY_FOR_TESTING';
const MODULE_ATTEMPT_FAILED_REASON = 'Module attempt failed';
const MODULE_LIFECYCLE_PHASE_BUSTER = 'buster';
const MODULE_BLOCKED_REASON = 'blocked';
const MODULE_COMPLETION_PASS_STATUS = 'PASS';
const MODULE_COMPLETION_FAIL_STATUS = 'FAIL';
const MODULE_COMPLETION_BLOCKED_STATUS = 'BLOCKED';
const MODULE_COMPLETION_ERROR_STATUS = 'ERROR';
const GATE_COMPLETION_PASS_STATUS = 'PASS';
const GATE_COMPLETION_BLOCKED_STATUS = 'BLOCKED';
const GATE_COMPLETION_FAIL_STATUS = 'FAIL';
const GATE_COMPLETION_ERROR_STATUS = 'ERROR';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function eventOccurredAt(value) {
  return value !== undefined && value !== null && value !== '' ? value : new Date().toISOString();
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function requiredText(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) throw new Error(`${label} is required for lifecycle event append`);
  return value;
}

function pipelineProgressModules(progress) {
  return objectRecord(progress?.modules);
}

function pipelineProgressGates(progress) {
  return objectRecord(progress?.gates);
}

function proposalData(proposal) {
  return objectRecord(proposal?.data);
}

export function appendLifecycleEvent(config, proposal = {}) {
  if (!proposal?.type) throw new Error('appendLifecycleEvent requires type');
  if (!proposal?.refs?.primary_ref?.id) throw new Error('appendLifecycleEvent requires refs.primary_ref.id');
  return withLifecycleAppendLock(config, () => {
    const eventsPath = lifecycleEventsPath(config);
    const readModels = loadLifecycleReadModels(config);
    const idempotencyKey = buildLifecycleIdempotencyKey(proposal.type, proposal.refs, proposalData(proposal));
    const existing = readLifecycleEvents(config).find((entry) => entry.idempotency_key === idempotencyKey);
    if (existing) {
      return { record: existing, deduped: true, readModels };
    }

    ensureLifecycleEventLegal(config, readModels, proposal);

    const event = {
      schemaVersion: LIFECYCLE_READ_MODELS_VERSION,
      event_id: createOpaqueId('event'),
      type: proposal.type,
      occurred_at: eventOccurredAt(proposal.occurredAt),
      recorded_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      refs: cloneSerializable(proposal.refs),
      data: cloneSerializable(proposalData(proposal)),
    };

    if (!Array.isArray(config._lifecycleEventsCache)) config._lifecycleEventsCache = [];
    config._lifecycleEventsCache.push(cloneSerializable(event));
    appendJsonLine(eventsPath, event);
    const nextReadModels = saveLifecycleReadModels(config, rebuildLifecycleReadModels(config));
    return { record: event, deduped: false, readModels: nextReadModels };
  });
}

function buildPipelineStartData(config, progress, opts = {}) {
  const executionOrder = Array.isArray(progress?.execution_order) ? [...progress.execution_order] : [];
  return {
    run_mode: opts.module ? 'single_module' : 'full',
    resume: opts.resume === true,
    requested_module_id: selectTruthyValue(() => (opts.module), () => (null)),
    entrypoint: 'pipeline_runner',
    execution_order: executionOrder,
    modules: Object.entries(pipelineProgressModules(progress)).map(([moduleId, mod]) => ({
      module_id: moduleId,
      title: selectTruthyValue(() => (mod?.title), () => (null)),
      dir: selectTruthyValue(() => (mod?.dir), () => (null)),
      depends_on: Array.isArray(mod?.depends_on) ? [...mod.depends_on] : [],
      stages: Array.isArray(mod?.stages) ? [...mod.stages] : [],
    })),
    gates: Object.entries(pipelineProgressGates(progress)).map(([gateId, gate]) => ({
      gate_id: gateId,
      gate_type: selectTruthyValue(() => (gate?.type), () => (null)),
      title: selectTruthyValue(() => (gate?.title), () => (null)),
    })),
    fallback_model: selectTruthyValue(() => (config?.fallback_model), () => (null)),
    models: cloneSerializable(selectTruthyValue(() => (progress?.defaults?.models), () => (null))),
    nova_prompt_present: Boolean(opts.novaPrompt),
  };
}

export function appendPipelineLifecycleEvent(config, type, {
  progress = null,
  opts = {},
  result = null,
  stepType = null,
  stepId = null,
  haltReason = null,
} = {}) {
  const refs = buildPipelineRefs(config);
  let data;

  if (type === 'pipeline_run.started') {
    data = buildPipelineStartData(config, progress, opts);
  } else if (type === 'pipeline_run.completed') {
    const readModels = loadLifecycleReadModels(config), artifacts = getPipelineArtifactBundle(config);
    data = {
      terminal_status: selectDefinedValue(() => (result?.terminal_status), () => (PIPELINE_RUN_COMPLETED_STATUS)),
      terminal_decision: selectTruthyValue(() => (result?.terminal_decision), () => (null)),
      reason_code: selectPresentValue(result?.reason, PIPELINE_RUN_COMPLETED_REASON),
      duration_seconds: null,
      modules_passed: selectDefinedValue(() => (readModels?.progression?.modules_passed), () => (null)),
      modules_failed: selectDefinedValue(() => (readModels?.progression?.modules_failed), () => (null)),
      modules_blocked: selectDefinedValue(() => (readModels?.progression?.modules_blocked), () => (null)),
      modules_total: selectDefinedValue(() => (readModels?.progression?.modules_total), () => (null)),
      total_cost_usd: null,
      summary_json_path: artifacts.run_summary_path,
      pipeline_summary_path: artifacts.pipeline_summary_path,
      latest_json_path: artifacts.latest_json_path,
    };
  } else if (type === 'pipeline_run.halted') {
    data = {
      halt_reason: selectPresentValue(haltReason, result?.reason, PIPELINE_RUN_HALTED_REASON),
      terminal_status: selectTruthyValue(() => (result?.terminal_status), () => (null)),
      terminal_decision: selectTruthyValue(() => (result?.terminal_decision), () => (null)),
      step_type: selectTruthyValue(() => (stepType), () => (null)),
      step_id: selectTruthyValue(() => (stepId), () => (null)),
      attempt: selectDefinedValue(() => (result?.attempt), () => (null)),
      dispatch_id: selectDefinedValue(() => (result?.dispatch_id), () => (null)),
      gateway_label: selectDefinedValue(() => (result?.gateway_label), () => (null)),
      session_key: selectDefinedValue(() => (result?.session_key), () => (null)),
      last_failure: selectTruthyValue(() => (result?.reason), () => (null)),
      fail_count: selectDefinedValue(() => (result?.fail_count), () => (null)),
    };
  } else {
    throw new Error(`Unsupported pipeline lifecycle event type: ${type}`);
  }

  return appendLifecycleEvent(config, { type, refs, data });
}

export function appendWaitLifecycleEvent(config, type, {
  gateId,
  gateType = 'approval',
  attempt = 1,
  waitKind = 'approval',
  signalKind = null,
  data = {},
  occurredAt = null,
} = {}) {
  const refs = type === 'resume_signal.received'
    ? buildResumeSignalRefs(config, { gateId, gateType, attempt, waitKind, signalKind: selectPresentValue(signalKind, data.signal_kind) })
    : buildWaitRefs(config, { gateId, gateType, attempt, waitKind });

  return appendLifecycleEvent(config, {
    type,
    refs,
    data,
    ...(occurredAt ? { occurredAt } : {}),
  });
}

export function appendCooldownLifecycleEvent(config, type, {
  moduleId = null,
  gateId = null,
  gateType = null,
  attempt = null,
  pauseCount = null,
  maxPauses = null,
  cooldownHours = null,
  cooldownMs = null,
  cooldownSource = null,
  cooldownSourceDetail = null,
  cooldownBufferMs = null,
  retryAfterSeconds = null,
  resumeAt = null,
  resumedAt = null,
  detail = null,
  agentType = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
  commitHash = null,
  occurredAt = null,
} = {}) {
  const refs = buildCooldownRefs(config, {
    moduleId,
    gateId,
    gateType,
    attempt,
  });
  refs.dispatch_id = selectDefinedValue(() => (dispatchId), () => (null));
  refs.gateway_label = selectDefinedValue(() => (gatewayLabel), () => (null));
  refs.session_key = selectDefinedValue(() => (sessionKey), () => (null));

  const data = type === 'rate_limit.cooldown_started'
    ? {
      pause_count: selectDefinedValue(() => (pauseCount), () => (null)),
      max_pauses: selectDefinedValue(() => (maxPauses), () => (null)),
      cooldown_hours: selectDefinedValue(() => (cooldownHours), () => (null)),
      cooldown_ms: selectDefinedValue(() => (cooldownMs), () => (null)),
      cooldown_source: selectTruthyValue(() => (cooldownSource), () => (null)),
      cooldown_source_detail: selectTruthyValue(() => (cooldownSourceDetail), () => (null)),
      cooldown_buffer_ms: selectDefinedValue(() => (cooldownBufferMs), () => (null)),
      retry_after_seconds: selectDefinedValue(() => (retryAfterSeconds), () => (null)),
      resume_at: selectTruthyValue(() => (resumeAt), () => (null)),
      detail: selectTruthyValue(() => (detail), () => (null)),
      agent_type: selectTruthyValue(() => (agentType), () => (null)),
      dispatch_id: selectDefinedValue(() => (dispatchId), () => (null)),
      gateway_label: selectDefinedValue(() => (gatewayLabel), () => (null)),
      session_key: selectDefinedValue(() => (sessionKey), () => (null)),
      commit_hash: selectDefinedValue(() => (commitHash), () => (null)),
    }
    : {
      pause_count: selectDefinedValue(() => (pauseCount), () => (null)),
      max_pauses: selectDefinedValue(() => (maxPauses), () => (null)),
      resumed_at: eventOccurredAt(firstDefined(resumedAt, occurredAt)),
      detail: selectTruthyValue(() => (detail), () => (null)),
    };

  return appendLifecycleEvent(config, {
    type,
    refs,
    data,
    ...(occurredAt ? { occurredAt } : {}),
  });
}

export function getLifecycleGateState(config, gateId) {
  if (!gateId) return null;
  return cloneSerializable(selectTruthyValue(() => (loadLifecycleReadModels(config)?.gates?.[gateId]), () => (null)));
}

export function getLifecycleModuleState(config, moduleId) {
  if (!moduleId) return null;
  return cloneSerializable(selectTruthyValue(() => (loadLifecycleReadModels(config)?.modules?.[moduleId]), () => (null)));
}

export function appendStaleRecoveryLifecycleEvent(config, {
  moduleId = null,
  gateId = null,
  gateType = null,
  status = null,
  dir = null,
  attempt = null,
  recoveryTargetStatus = null,
  recoveryTargetPhase = null,
  recoveryAction = null,
  reason = null,
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
  staleEvidence = null,
  occurredAt = null,
} = {}) {
  let refs;
  if (moduleId) {
    refs = buildModuleAttemptRefs(config, {
      ...objectRecord(status),
      module_id: moduleId,
      active_agent: selectDefinedValue(() => (status?.active_agent), () => ({
    session_key: selectPresentValue(sessionKey),
    dispatch_id: selectPresentValue(dispatchId),
    gateway_label: selectPresentValue(gatewayLabel),
    attempt: selectDefinedValue(() => (attempt), () => (null)),
})),
    }, requiredText(dir, 'module stale recovery dir'), {
      attempt: selectDefinedValue(() => (attempt), () => (null)),
    }, getLifecycleModuleState(config, moduleId));
  } else {
    refs = buildGateEvaluationRefs(config, {
      gateId,
      gateType: selectTruthyValue(() => (gateType), () => (null)),
      attempt: Number(selectDefinedValue(() => (attempt), () => (STALE_RECOVERY_ATTEMPT))),
    });
    refs.dispatch_id = selectDefinedValue(() => (dispatchId), () => (null));
    refs.gateway_label = selectDefinedValue(() => (gatewayLabel), () => (null));
    refs.session_key = selectDefinedValue(() => (sessionKey), () => (null));
  }

  return appendLifecycleEvent(config, {
    type: 'recovery.stale_reset',
    refs,
    data: {
      recovery_target_status: selectPresentValue(recoveryTargetStatus, STALE_RECOVERY_TARGET_STATUS),
      recovery_target_phase: selectDefinedValue(() => (recoveryTargetPhase), () => (null)),
      recovery_action: selectTruthyValue(() => (recoveryAction), () => (null)),
      reason: selectPresentValue(reason, STALE_RECOVERY_REASON),
      session_key: selectDefinedValue(() => (sessionKey), () => (null)),
      dispatch_id: selectDefinedValue(() => (dispatchId), () => (null)),
      gateway_label: selectDefinedValue(() => (gatewayLabel), () => (null)),
      stale_evidence: staleEvidence ? cloneSerializable(staleEvidence) : null,
    },
    ...(occurredAt ? { occurredAt } : {}),
  });
}

export function getLifecycleCooldown(config, { stepType = null, stepId = null } = {}) {
  const readModels = loadLifecycleReadModels(config);
  if (stepType === 'module') return cloneSerializable(selectTruthyValue(() => (readModels?.cooldowns?.modules?.[stepId]), () => (null)));
  if (stepType === 'gate') return cloneSerializable(selectTruthyValue(() => (readModels?.cooldowns?.gates?.[stepId]), () => (null)));
  return null;
}

function buildModuleLifecycleData(config, dir, status, mutation = {}) {
  const progress = getActiveProgress(config);
  const moduleConfig = resolveModuleConfig(progress, status?.module_id, dir);
  const phase = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (mutation.phase), () => (mutation.previousPhase))), () => (status?.current_phase))), () => (status?.blockedPhase))), () => (null));
  const attempt = resolveModuleAttempt(status, mutation);
  const shared = {
    title: selectTruthyValue(() => (selectTruthyValue(() => (status?.title), () => (moduleConfig?.title))), () => (null)),
    module_dir: selectTruthyValue(() => (selectTruthyValue(() => (dir), () => (moduleConfig?.dir))), () => (null)),
  };
  const completion = objectRecord(mutation.completion);
  const completionData = completion
    ? { completion: cloneSerializable(completion) }
    : {};

  switch (mutation.eventType) {
    case 'module_attempt.started':
      return {
        ...shared,
        ...completionData,
        stages: Array.isArray(moduleConfig?.stages) ? [...moduleConfig.stages] : [],
        resume_from_status: mutation.oldStatus,
        blueprint_action: 'skipped',
        fail_count_before: Math.max(0, attempt - 1),
      validation_attempt: firstDefined(status?.validation?.attempt, attempt),
      };
    case 'module_attempt.ready_for_testing':
      return {
        ...completionData,
        from_phase: firstDefined(mutation.previousPhase, mutation.oldStatus === 'IN_PROGRESS' ? 'forge' : 'pipeline_forced'),
        forced_by_pipeline: mutation.previousPhase !== 'forge',
        commit_hash: resolveModuleCommit(status),
        delivery_lint_required: !(status?.validation?.delivery_lint_passed),
        pre_check_required: !(status?.validation?.pre_check_passed),
        reason: selectTruthyValue(() => (mutation.note), () => (null)),
      };
    case 'module_attempt.testing_started':
      return {
        ...completionData,
        from_status: selectPresentValue(mutation.oldStatus, MODULE_READY_FOR_TESTING_STATUS),
        git_sync_completed: true,
        delivery_lint_passed: Boolean(status?.validation?.delivery_lint_passed),
        pre_check_passed: Boolean(status?.validation?.pre_check_passed),
        commit_hash: resolveModuleCommit(status),
      };
    case 'module_attempt.failed': {
      const reason = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.completion_summary), () => (mutation.completionSummary))), () => (mutation.note))), () => (status?.fail_summaries?.at?.(-1)?.summary))), () => (null));
      return {
        ...completionData,
        phase: selectTruthyValue(() => (phase), () => ('missing_phase')),
        failure_class: normalizeFailureClass(phase, reason),
        reason: selectPresentValue(reason, MODULE_ATTEMPT_FAILED_REASON),
        old_status: selectTruthyValue(() => (mutation.oldStatus), () => (null)),
        summary: selectTruthyValue(() => (selectTruthyValue(() => (mutation.note), () => (reason))), () => (null)),
        dispatch_id: resolveStatusDispatchId(status),
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: resolveStatusSessionKey(status),
        commit_hash: resolveModuleCommit(status),
        validator_name: null,
        suite_names: [],
      };
    }
    case 'module_attempt.passed':
      return {
        ...completionData,
        phase: selectPresentValue(phase, mutation.previousPhase, MODULE_LIFECYCLE_PHASE_BUSTER),
        old_status: selectTruthyValue(() => (mutation.oldStatus), () => (null)),
        duration_seconds: null,
        cost_estimate_usd: null,
        commit_hash: resolveModuleCommit(status),
        summary: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.completion_summary), () => (mutation.completionSummary))), () => (mutation.note))), () => (null)),
      };
    case 'module_attempt.blocked':
      return {
        ...completionData,
        blocked_phase: selectTruthyValue(() => (selectTruthyValue(() => (status?.blockedPhase), () => (phase))), () => (null)),
        reason: selectPresentValue(status?.blockedReason, mutation.blockedReason, mutation.note, MODULE_BLOCKED_REASON),
        old_status: selectTruthyValue(() => (mutation.oldStatus), () => (null)),
        blocked_fail_count: selectDefinedValue(() => (status?.blockedFailCount), () => (null)),
        dispatch_id: resolveStatusDispatchId(status),
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: resolveStatusSessionKey(status),
      };
    default:
      throw new Error(`Unsupported module lifecycle event type: ${mutation.eventType}`);
  }
}

export function appendModuleLifecycleEvent(config, dir, status, mutation = {}) {
  if (!mutation?.eventType) return null;
  const currentModuleState = selectTruthyValue(() => (loadLifecycleReadModels(config)?.modules?.[selectTruthyValue(() => (status?.module_id), () => (dir))]), () => (null));
  const refs = buildModuleAttemptRefs(config, status, dir, mutation, currentModuleState);
  const data = buildModuleLifecycleData(config, dir, status, mutation);
  return appendLifecycleEvent(config, {
    type: mutation.eventType,
    refs,
    data,
    occurredAt: eventOccurredAt(mutation.now),
  });
}

function moduleStatusForCompletion(completion) {
  if (completion.status === MODULE_COMPLETION_BLOCKED_STATUS) return 'BLOCKED';
  if (completion.status === MODULE_COMPLETION_FAIL_STATUS) return 'FAIL';
  if (completion.status === MODULE_COMPLETION_ERROR_STATUS) return 'FAIL';
  if (completion.status === MODULE_COMPLETION_PASS_STATUS) {
    return completion.metadata?.terminal_module === true
      ? 'PASS'
      : (completion.phase === 'forge' ? 'READY_FOR_TESTING' : 'PASS');
  }
  throw new Error(`Unsupported module completion status: ${completion.status}`);
}

function moduleCompletionEventType(moduleStatus) {
  switch (moduleStatus) {
    case 'READY_FOR_TESTING':
      return 'module_attempt.ready_for_testing';
    case 'PASS':
      return 'module_attempt.passed';
    case 'FAIL':
      return 'module_attempt.failed';
    case 'BLOCKED':
      return 'module_attempt.blocked';
    default:
      throw new Error(`Unsupported module completion lifecycle status: ${moduleStatus}`);
  }
}

function appendCompletionHistory(status, nextStatus, completion, now) {
  if (!Array.isArray(status.history)) status.history = [];
  status.history.push({
    timestamp: now,
    from: selectTruthyValue(() => (status.status), () => (null)),
    to: nextStatus,
    agent: 'completion',
    note: selectPresentValue(completion.summary, completion.reason_code, `${completion.phase} ${completion.status}`),
  });
}

export function applyModuleCompletion(config, dir, status, completionInput = {}) {
  const completion = assertCompletion({
    ...completionInput,
    target_kind: selectPresentValue(completionInput.target_kind, 'module'),
    target_id: selectPresentValue(completionInput.target_id, status?.module_id),
  });
  if (completion.target_kind !== 'module') throw new Error('applyModuleCompletion requires module completion');
  if (!status || typeof status !== 'object') throw new Error('applyModuleCompletion requires mutable module status');
  if (status.module_id && status.module_id !== completion.target_id) {
    throw new Error(`applyModuleCompletion module mismatch: ${completion.target_id} != ${status.module_id}`);
  }

  const now = selectPresentValue(completion.occurred_at, new Date().toISOString());
  const oldStatus = selectTruthyValue(() => (status.status), () => (null));
  const previousPhase = selectTruthyValue(() => (status.current_phase), () => (completion.phase));
  const nextStatus = moduleStatusForCompletion(completion);

  status.module_id = completion.target_id;
  status.status = nextStatus;
  status.current_phase = null;
  status.phase_started_at = null;
  status.active_agent = null;
  status.completion_summary = selectDefinedValue(() => (completion.summary), () => (status.completion_summary));
  if (nextStatus === 'PASS') status.completed_at = now;
  else status.completed_at = null;
  if (nextStatus === 'BLOCKED') {
    status.blockedAt = now;
    status.blockedReason = selectPresentValue(completion.summary, completion.reason_code, MODULE_BLOCKED_REASON);
    status.blockedPhase = completion.phase;
    status.blockedFailCount = selectDefinedValue(() => (completion.metadata?.fail_count), () => (completion.attempt));
  }
  appendCompletionHistory(status, nextStatus, completion, now);

  const lifecycleMutation = {
    eventType: moduleCompletionEventType(nextStatus),
    oldStatus,
    newStatus: nextStatus,
    previousPhase,
    phase: completion.phase,
    now,
    note: selectPresentValue(completion.summary, completion.reason_code, `${completion.phase} ${completion.status}`),
    completionSummary: selectDefinedValue(() => (completion.summary), () => (null)),
    completedAt: nextStatus === 'PASS' ? now : null,
    clearActiveAgent: true,
    attempt: completion.attempt,
    completion,
  };
  appendModuleLifecycleEvent(config, dir, status, lifecycleMutation);
  return { status, lifecycleMutation };
}

function gateStatusForCompletion(completion) {
  if (completion.status === GATE_COMPLETION_PASS_STATUS) return 'PASS';
  if (completion.status === GATE_COMPLETION_BLOCKED_STATUS) return 'BLOCKED';
  if (completion.status === GATE_COMPLETION_FAIL_STATUS) return 'FAIL';
  if (completion.status === GATE_COMPLETION_ERROR_STATUS) return 'FAIL';
  throw new Error(`Unsupported gate completion status: ${completion.status}`);
}

function gateCompletionEventType(gateStatus) {
  switch (gateStatus) {
    case 'PASS':
      return 'gate_evaluation.passed';
    case 'FAIL':
      return 'gate_evaluation.failed';
    case 'BLOCKED':
      return 'gate_evaluation.blocked';
    default:
      throw new Error(`Unsupported gate completion lifecycle status: ${gateStatus}`);
  }
}

export function applyGateCompletion(config, gateId, gate = {}, completionInput = {}) {
  const completion = assertCompletion({
    ...completionInput,
    target_kind: selectPresentValue(completionInput.target_kind, 'gate'),
    target_id: selectPresentValue(completionInput.target_id, gateId),
  });
  if (completion.target_kind !== 'gate') throw new Error('applyGateCompletion requires gate completion');
  if (gateId && gateId !== completion.target_id) {
    throw new Error(`applyGateCompletion gate mismatch: ${completion.target_id} != ${gateId}`);
  }

  const now = selectPresentValue(completion.occurred_at, new Date().toISOString());
  const gateStatus = gateStatusForCompletion(completion);
  const refs = buildGateEvaluationRefs(config, {
    gateId: completion.target_id,
    gateType: selectTruthyValue(() => (gate?.type), () => (completion.metadata?.gate_type)),
    attempt: completion.attempt,
  });
  refs.dispatch_id = selectDefinedValue(() => (completion.observed?.dispatch_id), () => (completion.metadata?.dispatch_id));
  refs.gateway_label = selectDefinedValue(() => (completion.observed?.gateway_label), () => (completion.metadata?.gateway_label));
  refs.session_key = selectDefinedValue(() => (completion.observed?.session_key), () => (completion.metadata?.session_key));

  return appendLifecycleEvent(config, {
    type: gateCompletionEventType(gateStatus),
    refs,
    data: {
      completion: cloneSerializable(completion),
      status: gateStatus,
      summary: selectPresentValue(completion.summary, completion.reason_code, `${completion.phase} ${completion.status}`),
      reason: selectPresentValue(completion.summary, completion.reason_code, null),
      gate_title: selectTruthyValue(() => (gate?.title), () => (null)),
      gate_type: selectTruthyValue(() => (gate?.type), () => (completion.metadata?.gate_type)),
      phase: completion.phase,
      issue_type: selectDefinedValue(() => (completion.metadata?.issue_type), () => (null)),
      outcome_class: selectDefinedValue(() => (completion.metadata?.outcome_class), () => (null)),
      findings: Array.isArray(completion.metadata?.findings) ? cloneSerializable(completion.metadata.findings) : [],
      dispatch_id: selectDefinedValue(() => (refs.dispatch_id), () => (null)),
      gateway_label: selectDefinedValue(() => (refs.gateway_label), () => (null)),
      session_key: selectDefinedValue(() => (refs.session_key), () => (null)),
    },
    occurredAt: now,
  });
}


export function resetLifecycleStore(config) {
  return saveLifecycleReadModels(config, createDefaultLifecycleReadModels(config));
}
