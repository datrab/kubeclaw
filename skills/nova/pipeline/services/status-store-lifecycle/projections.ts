import { cloneSerializable } from '../serialization.ts';
import { createDefaultLifecycleReadModels, recomputeProgression } from './read-models.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function anyTrue(...values) {
  return values.some((value) => value === true);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstAttempt(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return 1;
}

function normalizedUpperText(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim().toUpperCase();
}

function normalizedSignalKind(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim().toLowerCase();
}

function deriveApprovalResolutionFromSignal(signalKind, continued = null) {
  switch (normalizedSignalKind(signalKind)) {
    case 'approve':
      return { status: 'APPROVED', scheduler_consumed: true, close_reason: 'signaled', continued: false };
    case 'reject':
      return { status: 'REJECTED', scheduler_consumed: false, close_reason: 'signaled', continued: false };
    case 'cancel':
      return { status: 'CANCELLED', scheduler_consumed: false, close_reason: 'cancelled', continued: false };
    case 'timeout_continue':
      return { status: 'TIMED_OUT', scheduler_consumed: true, close_reason: 'timed_out', continued: true };
    case 'timeout_block':
      return { status: 'TIMED_OUT', scheduler_consumed: false, close_reason: 'timed_out', continued: false };
    default:
      if (signalKind != null && String(signalKind).trim()) {
        throw new Error(`unknown approval resume signal kind: ${signalKind}`);
      }
      return {
        status: null,
        scheduler_consumed: false,
        close_reason: null,
        continued: continued == null ? null : Boolean(continued),
      };
  }
}

export function deriveApprovalResolutionFromState(state = {}) {
  const status = normalizedUpperText(state?.status);
  switch (status) {
    case 'APPROVED':
      return { signalKind: 'approve', resolutionKind: 'approved', closeReason: 'signaled' };
    case 'REJECTED':
      return { signalKind: 'reject', resolutionKind: 'rejected', closeReason: 'signaled' };
    case 'CANCELLED':
      return { signalKind: 'cancel', resolutionKind: 'cancelled', closeReason: 'cancelled' };
    case 'TIMED_OUT': {
      const timeoutSignal = state?.continued === true ? 'timeout_continue' : 'timeout_block';
      return { signalKind: timeoutSignal, resolutionKind: 'timed_out', closeReason: 'timed_out' };
    }
    default:
      return { signalKind: null, resolutionKind: null, closeReason: null };
  }
}

function normalizeLifecycleTerminalStatus(value) {
  const text = normalizedUpperText(value);
  return selectTruthyValue(() => (text), () => (null));
}

function ensureGateReadModel(next, refs = {}) {
  const gateId = refs?.gate_id;
  if (!gateId) return null;
  const existing = selectDefinedValue(() => (objectRecord(next.gates[gateId])), () => ({}));
  const nextGate = {
    ...existing,
    gate_id: gateId,
    gate_type: (selectDefinedValue(() => (refs?.gate_type), () => (null))),
    gate_ref: (selectDefinedValue(() => (refs?.gate_ref), () => (null))),
    gate_evaluation_ref: (selectDefinedValue(() => (refs?.gate_evaluation_ref), () => (null))),
    attempt: firstAttempt(refs?.attempt, existing.attempt),
  };
  next.gates[gateId] = nextGate;
  return nextGate;
}

function projectModuleValidation(existing, event) {
  const existingValidation = objectRecord(existing.validation);
  const currentAttempt = selectDefinedValue(() => (event.refs?.attempt), () => (null));
  if (event.type === 'module_attempt.started') {
    return {
      attempt: currentAttempt,
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    };
  }
  if (event.type !== 'module_attempt.testing_started') {
    return existingValidation;
  }

  const deliveryLintPassed = Boolean(event.data?.delivery_lint_passed);
  const preCheckPassed = Boolean(event.data?.pre_check_passed);
  return {
    ...(selectDefinedValue(() => (existingValidation), () => ({}))),
    attempt: currentAttempt,
    delivery_lint_passed: deliveryLintPassed,
    delivery_lint_passed_at: deliveryLintPassed ? event.occurred_at : selectDefinedValue(() => (existingValidation?.delivery_lint_passed_at), () => (null)),
    pre_check_passed: preCheckPassed,
    pre_check_passed_at: preCheckPassed ? event.occurred_at : selectDefinedValue(() => (existingValidation?.pre_check_passed_at), () => (null)),
  };
}

function applyWaitEventToReadModels(next, event) {
  const gateEntry = ensureGateReadModel(next, event.refs);
  const waitRef = event.refs?.wait_ref;
  if (!waitRef) return;

  const currentWait = selectDefinedValue(() => (objectRecord(next.waits?.by_ref?.[waitRef])), () => ({}));
  const waitEntry = {
    ...currentWait,
    wait_ref: waitRef,
    scope: event.refs?.gate_id ? 'gate' : (event.refs?.module_id ? 'module' : 'pipeline'),
    run_id: selectPresentValue(event.refs?.run_id, currentWait.run_id),
    gate_id: selectPresentValue(event.refs?.gate_id, currentWait.gate_id),
    gate_type: selectPresentValue(event.refs?.gate_type, currentWait.gate_type),
    gate_evaluation_ref: selectPresentValue(event.refs?.gate_evaluation_ref, currentWait.gate_evaluation_ref),
    module_id: selectPresentValue(event.refs?.module_id, currentWait.module_id),
    attempt: firstAttempt(event.refs?.attempt, currentWait.attempt),
    wait_kind: selectPresentValue(event.data?.wait_kind, currentWait.wait_kind),
    requested_at: selectPresentValue(event.data?.requested_at, currentWait.requested_at, event.occurred_at),
    deadline: selectPresentValue(event.data?.deadline, currentWait.deadline),
    timeout_minutes: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.timeout_minutes), () => (currentWait.timeout_minutes))), () => (null)),
    timeout_policy: selectPresentValue(event.data?.timeout_policy, currentWait.timeout_policy),
    gate_title: selectPresentValue(event.data?.gate_title, currentWait.gate_title),
    request_message_ref: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.request_message_ref), () => (currentWait.request_message_ref))), () => (null)),
    request_artifact_path: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.request_artifact_path), () => (currentWait.request_artifact_path))), () => (null)),
    state: event.type === 'wait.closed' ? 'CLOSED' : 'OPEN',
    opened_at: selectPresentValue(currentWait.opened_at, event.occurred_at),
    closed_at: event.type === 'wait.closed' ? selectPresentValue(event.data?.closed_at, event.occurred_at) : selectDefinedValue(() => (currentWait.closed_at), () => (null)),
    close_reason: event.type === 'wait.closed' ? selectDefinedValue(() => (event.data?.close_reason), () => (null)) : selectDefinedValue(() => (currentWait.close_reason), () => (null)),
    resolution_kind: event.type === 'wait.closed' ? selectDefinedValue(() => (event.data?.resolution_kind), () => (null)) : selectDefinedValue(() => (currentWait.resolution_kind), () => (null)),
    decision_by: event.type === 'wait.closed' ? selectDefinedValue(() => (event.data?.decision_by), () => (null)) : selectDefinedValue(() => (currentWait.decision_by), () => (null)),
    decision_via: event.type === 'wait.closed' ? selectDefinedValue(() => (event.data?.decision_via), () => (null)) : selectDefinedValue(() => (currentWait.decision_via), () => (null)),
    resume_signal_ref: event.type === 'wait.closed' ? selectDefinedValue(() => (event.data?.resume_signal_ref), () => (null)) : selectDefinedValue(() => (currentWait.resume_signal_ref), () => (null)),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
  next.waits.by_ref[waitRef] = waitEntry;

  if (!gateEntry) return;

  if (event.type === 'wait.opened') {
    next.gates[gateEntry.gate_id] = {
      ...gateEntry,
      projection_source: 'canonical-events',
      status: 'PENDING_APPROVAL',
      wait_status: 'OPEN',
      scheduler_consumed: false,
      wait_ref: waitRef,
      wait_kind: selectPresentValue(event.data?.wait_kind, gateEntry.wait_kind),
      gate_title: selectPresentValue(event.data?.gate_title, gateEntry.gate_title),
      requested_at: selectPresentValue(event.data?.requested_at, event.occurred_at),
      deadline: selectDefinedValue(() => (event.data?.deadline), () => (null)),
      timeout_minutes: selectDefinedValue(() => (event.data?.timeout_minutes), () => (null)),
      timeout_policy: selectTruthyValue(() => (event.data?.timeout_policy), () => (null)),
      request_message_ref: selectDefinedValue(() => (event.data?.request_message_ref), () => (null)),
      request_artifact_path: selectDefinedValue(() => (event.data?.request_artifact_path), () => (null)),
      resolved_at: null,
      decision_by: null,
      decision_via: null,
      continued: null,
      reason: null,
      close_reason: null,
      latest_event_type: event.type,
      latest_event_at: event.occurred_at,
    };
    return;
  }

  const derived = deriveApprovalResolutionFromSignal(gateEntry.last_signal_kind, gateEntry.continued);
  next.gates[gateEntry.gate_id] = {
    ...gateEntry,
    projection_source: 'canonical-events',
    status: normalizeLifecycleTerminalStatus(selectPresentValue(gateEntry.status, derived.status, waitEntry.resolution_kind)),
    wait_status: 'CLOSED',
      scheduler_consumed: anyTrue(gateEntry.scheduler_consumed, derived.scheduler_consumed),
    wait_ref: waitRef,
    resolved_at: selectPresentValue(waitEntry.closed_at, event.occurred_at),
    decision_by: selectPresentValue(waitEntry.decision_by, gateEntry.decision_by),
    decision_via: selectPresentValue(waitEntry.decision_via, gateEntry.decision_via),
    continued: waitEntry.close_reason === 'timed_out'
        ? firstDefined(gateEntry.continued, derived.continued)
      : (selectDefinedValue(() => (gateEntry.continued), () => (null))),
    reason: selectDefinedValue(() => (gateEntry.reason), () => (null)),
    close_reason: selectDefinedValue(() => (waitEntry.close_reason), () => (null)),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyResumeSignalToReadModels(next, event) {
  const signalRef = event.refs?.resume_signal_ref;
  if (!signalRef) return;

  const currentSignal = selectDefinedValue(() => (objectRecord(next.signals?.by_ref?.[signalRef])), () => ({}));
  const signalEntry = {
    ...currentSignal,
    resume_signal_ref: signalRef,
    wait_ref: selectPresentValue(event.refs?.wait_ref, currentSignal.wait_ref),
    gate_id: selectPresentValue(event.refs?.gate_id, currentSignal.gate_id),
    gate_type: selectPresentValue(event.refs?.gate_type, currentSignal.gate_type),
    gate_evaluation_ref: selectPresentValue(event.refs?.gate_evaluation_ref, currentSignal.gate_evaluation_ref),
    signal_kind: selectPresentValue(event.data?.signal_kind, event.refs?.signal_kind, currentSignal.signal_kind),
    received_via: selectPresentValue(event.data?.received_via, currentSignal.received_via),
    decision_by: selectPresentValue(event.data?.decision_by, currentSignal.decision_by),
    reason: selectPresentValue(event.data?.reason, currentSignal.reason),
    continued: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.continued), () => (currentSignal.continued))), () => (null)),
    source_message_ref: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.source_message_ref), () => (currentSignal.source_message_ref))), () => (null)),
    received_at: event.occurred_at,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
  next.signals.by_ref[signalRef] = signalEntry;

  if (signalEntry.wait_ref && next.waits?.by_ref?.[signalEntry.wait_ref]) {
    next.waits.by_ref[signalEntry.wait_ref] = {
      ...next.waits.by_ref[signalEntry.wait_ref],
      latest_signal_ref: signalRef,
      latest_signal_kind: signalEntry.signal_kind,
      latest_signal_at: event.occurred_at,
    };
  }

  const gateEntry = ensureGateReadModel(next, event.refs);
  if (!gateEntry) return;

  const derived = deriveApprovalResolutionFromSignal(signalEntry.signal_kind, signalEntry.continued);
  next.gates[gateEntry.gate_id] = {
    ...gateEntry,
    projection_source: 'canonical-events',
    wait_ref: selectPresentValue(event.refs?.wait_ref, gateEntry.wait_ref),
    status: selectPresentValue(derived.status, gateEntry.status),
      scheduler_consumed: anyTrue(gateEntry.scheduler_consumed, derived.scheduler_consumed),
    last_signal_kind: signalEntry.signal_kind,
    last_signal_ref: signalRef,
    last_signal_at: event.occurred_at,
    decision_by: selectPresentValue(signalEntry.decision_by, gateEntry.decision_by),
    decision_via: selectPresentValue(signalEntry.received_via, gateEntry.decision_via),
    continued: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (signalEntry.continued), () => (derived.continued))), () => (gateEntry.continued))), () => (null)),
    reason: selectPresentValue(signalEntry.reason, gateEntry.reason),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyCooldownEventToReadModels(next, event) {
  const isModule = Boolean(event.refs?.module_id);
  const collection = isModule ? next.cooldowns.modules : next.cooldowns.gates;
  const key = isModule ? event.refs.module_id : event.refs.gate_id;
  if (!key) return;

  const existing = selectDefinedValue(() => (objectRecord(collection[key])), () => ({}));
  if (event.type === 'rate_limit.cooldown_started') {
    collection[key] = {
      ...existing,
      scope: isModule ? 'module' : 'gate',
      target_ref: selectPresentValue(event.refs?.primary_ref?.id, existing.target_ref),
      run_id: selectPresentValue(event.refs?.run_id, existing.run_id),
      module_id: selectPresentValue(event.refs?.module_id, existing.module_id),
      gate_id: selectPresentValue(event.refs?.gate_id, existing.gate_id),
      gate_type: selectPresentValue(event.refs?.gate_type, existing.gate_type),
      attempt: selectDefinedValue(() => (selectDefinedValue(() => (event.refs?.attempt), () => (existing.attempt))), () => (null)),
      pause_count: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.pause_count), () => (existing.pause_count))), () => (null)),
      max_pauses: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.max_pauses), () => (existing.max_pauses))), () => (null)),
      cooldown_hours: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.cooldown_hours), () => (existing.cooldown_hours))), () => (null)),
      cooldown_ms: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.cooldown_ms), () => (existing.cooldown_ms))), () => (null)),
      cooldown_source: selectPresentValue(event.data?.cooldown_source, existing.cooldown_source),
      cooldown_source_detail: selectPresentValue(event.data?.cooldown_source_detail, existing.cooldown_source_detail),
      cooldown_buffer_ms: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.cooldown_buffer_ms), () => (existing.cooldown_buffer_ms))), () => (null)),
      retry_after_seconds: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.retry_after_seconds), () => (existing.retry_after_seconds))), () => (null)),
      resume_at: selectPresentValue(event.data?.resume_at, existing.resume_at),
      detail: selectPresentValue(event.data?.detail, existing.detail),
      agent_type: selectPresentValue(event.data?.agent_type, existing.agent_type),
      dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (event.data?.dispatch_id), () => (event.refs?.dispatch_id))), () => (existing.dispatch_id))), () => (null)),
      gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (event.data?.gateway_label), () => (event.refs?.gateway_label))), () => (existing.gateway_label))), () => (null)),
      session_key: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (event.data?.session_key), () => (event.refs?.session_key))), () => (existing.session_key))), () => (null)),
      commit_hash: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.commit_hash), () => (existing.commit_hash))), () => (null)),
      projection_source: 'canonical-events',
      open: true,
      opened_at: event.occurred_at,
      completed_at: null,
      latest_event_type: event.type,
      latest_event_at: event.occurred_at,
    };
    return;
  }

  collection[key] = {
    ...existing,
    scope: selectPresentValue(existing.scope, isModule ? 'module' : 'gate'),
    target_ref: selectPresentValue(existing.target_ref, event.refs?.primary_ref?.id),
    run_id: selectPresentValue(existing.run_id, event.refs?.run_id),
    module_id: selectPresentValue(existing.module_id, event.refs?.module_id),
    gate_id: selectPresentValue(existing.gate_id, event.refs?.gate_id),
    gate_type: selectPresentValue(existing.gate_type, event.refs?.gate_type),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (existing.attempt), () => (event.refs?.attempt))), () => (null)),
    pause_count: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.pause_count), () => (existing.pause_count))), () => (null)),
    max_pauses: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.max_pauses), () => (existing.max_pauses))), () => (null)),
    cooldown_hours: selectDefinedValue(() => (existing.cooldown_hours), () => (null)),
    cooldown_ms: selectDefinedValue(() => (existing.cooldown_ms), () => (null)),
    cooldown_source: selectDefinedValue(() => (existing.cooldown_source), () => (null)),
    cooldown_source_detail: selectDefinedValue(() => (existing.cooldown_source_detail), () => (null)),
    cooldown_buffer_ms: selectDefinedValue(() => (existing.cooldown_buffer_ms), () => (null)),
    retry_after_seconds: selectDefinedValue(() => (existing.retry_after_seconds), () => (null)),
    resume_at: selectDefinedValue(() => (existing.resume_at), () => (null)),
    detail: selectPresentValue(event.data?.detail, existing.detail),
    agent_type: selectDefinedValue(() => (existing.agent_type), () => (null)),
    dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (existing.dispatch_id), () => (event.refs?.dispatch_id))), () => (null)),
    gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (existing.gateway_label), () => (event.refs?.gateway_label))), () => (null)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (existing.session_key), () => (event.refs?.session_key))), () => (null)),
    commit_hash: selectDefinedValue(() => (existing.commit_hash), () => (null)),
    projection_source: 'canonical-events',
    open: false,
    completed_at: firstDefined(event.data?.resumed_at, event.occurred_at),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyGateCompletionEventToReadModels(next, event) {
  const gateEntry = ensureGateReadModel(next, event.refs);
  if (!gateEntry) return;
  const completed = ['gate_evaluation.passed', 'gate_evaluation.failed', 'gate_evaluation.blocked'].includes(event.type);
  const statusByEvent = {
    'gate_evaluation.passed': 'PASS',
    'gate_evaluation.failed': 'FAIL',
    'gate_evaluation.blocked': 'BLOCKED',
  };
  const status = selectPresentValue(event.data?.status, statusByEvent[event.type], gateEntry.status, 'PENDING');
  next.gates[gateEntry.gate_id] = {
    ...gateEntry,
    gate_type: selectPresentValue(event.data?.gate_type, event.refs?.gate_type, gateEntry.gate_type),
    gate_title: selectPresentValue(event.data?.gate_title, gateEntry.gate_title),
    title: selectPresentValue(event.data?.gate_title, gateEntry.title),
    status,
    completed,
    scheduler_consumed: completed,
    completed_at: completed ? event.occurred_at : null,
    reason: selectPresentValue(event.data?.reason, gateEntry.reason),
    completion_summary: selectPresentValue(event.data?.summary, event.data?.reason, gateEntry.completion_summary),
    completion: selectDefinedValue(() => (event.data?.completion), () => (gateEntry.completion)),
    completion_source: 'lifecycle_completion',
    projection_source: 'canonical-events',
    dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.dispatch_id), () => (event.refs?.dispatch_id))), () => (gateEntry.dispatch_id)),
    gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.gateway_label), () => (event.refs?.gateway_label))), () => (gateEntry.gateway_label)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.session_key), () => (event.refs?.session_key))), () => (gateEntry.session_key)),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

export function applyLifecycleEventToReadModels(readModels, event) {
  const clonedReadModels = cloneSerializable(readModels);
  const next = selectDefinedValue(() => (objectRecord(clonedReadModels)), () => (createDefaultLifecycleReadModels({ _runId: selectDefinedValue(() => (event?.refs?.run_id), () => (null)) })));
  next.last_event_id = event.event_id;
  next.last_event_type = event.type;
  next.event_count = numberValue(next.event_count, 0) + 1;

  if (event.type === 'pipeline_run.started') {
    next.pipeline = {
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'RUNNING',
      run_mode: event.data.run_mode,
      resume: event.data.resume,
      requested_module_id: event.data.requested_module_id,
      entrypoint: event.data.entrypoint,
      started_at: event.occurred_at,
      completed_at: null,
      terminal_status: null,
      terminal_decision: null,
      reason_code: null,
      halt_reason: null,
      latest_event_type: event.type,
    };
  } else if (event.type === 'pipeline_run.completed') {
    next.pipeline = {
      ...(selectDefinedValue(() => (objectRecord(next.pipeline)), () => ({}))),
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'COMPLETED',
      completed_at: event.occurred_at,
      terminal_status: event.data.terminal_status,
      terminal_decision: event.data.terminal_decision,
      reason_code: event.data.reason_code,
      latest_event_type: event.type,
    };
  } else if (event.type === 'pipeline_run.halted') {
    next.pipeline = {
      ...(selectDefinedValue(() => (objectRecord(next.pipeline)), () => ({}))),
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'HALTED',
      completed_at: event.occurred_at,
      terminal_status: event.data.terminal_status,
      terminal_decision: event.data.terminal_decision,
      reason_code: event.data.halt_reason,
      halt_reason: event.data.halt_reason,
      step_type: event.data.step_type,
      step_id: event.data.step_id,
      latest_event_type: event.type,
    };
  }

  if (selectTruthyValue(() => (event.type === 'wait.opened'), () => (event.type === 'wait.closed'))) {
    applyWaitEventToReadModels(next, event);
  }

  if (event.type === 'resume_signal.received') {
    applyResumeSignalToReadModels(next, event);
  }

  if (selectTruthyValue(() => (event.type === 'rate_limit.cooldown_started'), () => (event.type === 'rate_limit.cooldown_completed'))) {
    applyCooldownEventToReadModels(next, event);
  }

  if (selectTruthyValue(() => (selectTruthyValue(() => (event.type === 'gate_evaluation.passed'), () => (event.type === 'gate_evaluation.failed'))), () => (event.type === 'gate_evaluation.blocked'))) {
    applyGateCompletionEventToReadModels(next, event);
  }

  if (event.type === 'recovery.stale_reset') {
    if (event.refs?.module_id) {
      const moduleId = event.refs.module_id;
      const existing = selectDefinedValue(() => (objectRecord(next.modules[moduleId])), () => ({ module_id: moduleId }));
      next.modules[moduleId] = {
        ...existing,
        module_id: moduleId,
        module_attempt_ref: selectPresentValue(event.refs?.module_attempt_ref, existing.module_attempt_ref),
        current_attempt: selectDefinedValue(() => (selectDefinedValue(() => (event.refs?.attempt), () => (existing.current_attempt))), () => (null)),
        status: selectPresentValue(event.data?.recovery_target_status, existing.status, 'PENDING'),
        current_phase: null,
        dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (event.refs?.dispatch_id), () => (existing.dispatch_id))), () => (null)),
        gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (event.refs?.gateway_label), () => (existing.gateway_label))), () => (null)),
        session_key: selectDefinedValue(() => (selectDefinedValue(() => (event.refs?.session_key), () => (existing.session_key))), () => (null)),
        latest_event_type: event.type,
        latest_event_at: event.occurred_at,
        last_recovery_action: selectTruthyValue(() => (event.data?.recovery_action), () => (null)),
        last_recovery_reason: selectTruthyValue(() => (event.data?.reason), () => (null)),
        projection_source: 'canonical-events',
      };
      delete next.active_sessions.modules[moduleId];
    }

    if (event.refs?.gate_id) {
      const gateEntry = firstDefined(ensureGateReadModel(next, event.refs), { gate_id: event.refs.gate_id });
      next.gates[event.refs.gate_id] = {
        ...gateEntry,
        status: selectPresentValue(event.data?.recovery_target_status, gateEntry.status, 'PENDING'),
        scheduler_consumed: false,
        latest_event_type: event.type,
        latest_event_at: event.occurred_at,
        last_recovery_action: selectTruthyValue(() => (event.data?.recovery_action), () => (null)),
        last_recovery_reason: selectTruthyValue(() => (event.data?.reason), () => (null)),
        projection_source: 'canonical-events',
      };
      delete next.active_sessions.gates[event.refs.gate_id];
    }
  }

  if (event.type === 'recovery.stale_blocked') {
    if (event.data?.module_id && event.data?.session_key) {
      const moduleId = event.data.module_id;
      next.active_sessions.modules[moduleId] = {
        module_id: moduleId,
        run_id: selectDefinedValue(() => (event.refs?.run_id), () => (null)),
        attempt: selectDefinedValue(() => (event.data?.attempt), () => (null)),
        dispatch_id: selectTruthyValue(() => (event.data?.dispatch_id), () => (null)),
        session_key: selectTruthyValue(() => (event.data?.session_key), () => (null)),
        gateway_label: selectTruthyValue(() => (event.data?.gateway_label), () => (null)),
        label: selectTruthyValue(() => (event.data?.diagnostic_label), () => (null)),
        phase: selectTruthyValue(() => (event.data?.previous_phase), () => (null)),
        projection_source: 'canonical-events',
      };
    }
    if (event.data?.gate_id && event.data?.session_key) {
      const gateId = event.data.gate_id;
      next.active_sessions.gates[gateId] = {
        gate_id: gateId,
        gate_type: selectDefinedValue(() => (event.data?.gate_type), () => (null)),
        run_id: selectDefinedValue(() => (event.refs?.run_id), () => (null)),
        attempt: selectDefinedValue(() => (event.data?.attempt), () => (null)),
        dispatch_id: selectTruthyValue(() => (event.data?.dispatch_id), () => (null)),
        session_key: selectTruthyValue(() => (event.data?.session_key), () => (null)),
        gateway_label: selectTruthyValue(() => (event.data?.gateway_label), () => (null)),
        label: selectTruthyValue(() => (event.data?.diagnostic_label), () => (null)),
        phase: selectTruthyValue(() => (event.data?.previous_phase), () => (null)),
        projection_source: 'canonical-events',
      };
    }
  }

  if (event.refs?.module_id) {
    const moduleId = event.refs.module_id;
    const existing = selectDefinedValue(() => (objectRecord(next.modules[moduleId])), () => ({ module_id: moduleId }));
    const opensAttempt = (
      selectTruthyValue(() => (existing.current_attempt == null), () => ((event.refs.attempt != null && Number(event.refs.attempt) !== Number(existing.current_attempt))))
    );
    const statusByEvent = {
      'module_attempt.started': 'IN_PROGRESS',
      'module_attempt.ready_for_testing': 'READY_FOR_TESTING',
      'module_attempt.testing_started': 'TESTING',
      'module_attempt.failed': 'FAIL',
      'module_attempt.passed': 'PASS',
      'module_attempt.blocked': 'BLOCKED',
    };
    const currentPhaseByEvent = {
      'module_attempt.started': 'forge',
      'module_attempt.ready_for_testing': null,
      'module_attempt.testing_started': 'buster',
      'module_attempt.failed': null,
      'module_attempt.passed': null,
      'module_attempt.blocked': null,
    };
    const projectedStatus = selectPresentValue(statusByEvent[event.type], existing.status);
    const historyEntry = projectedStatus ? {
      timestamp: event.occurred_at,
      from: selectPresentValue(existing.status, 'PENDING'),
      to: projectedStatus,
      agent: selectPresentValue(event.refs?.agent, 'pipeline'),
      note: selectPresentValue(event.data?.summary, event.data?.reason, event.type),
    } : null;
    const failureSummaryEntry = ['module_attempt.failed', 'module_attempt.blocked'].includes(event.type) ? {
      at: event.occurred_at,
      phase: selectTruthyValue(() => (selectTruthyValue(() => (event.data?.phase), () => (event.data?.blocked_phase))), () => (null)),
      summary: selectPresentValue(event.data?.summary, event.data?.reason, 'Module attempt failed'),
      attempt: selectDefinedValue(() => (selectDefinedValue(() => (event.refs?.attempt), () => (existing.current_attempt))), () => (null)),
      failure_class: selectDefinedValue(() => (event.data?.failure_class), () => (null)),
    } : null;

    next.modules[moduleId] = {
      ...existing,
      module_id: moduleId,
      title: selectPresentValue(event.data.title, existing.title),
      module_dir: selectPresentValue(event.data.module_dir, existing.module_dir),
      current_attempt: selectDefinedValue(() => (selectDefinedValue(() => (event.refs.attempt), () => (existing.current_attempt))), () => (null)),
      module_attempt_ref: selectPresentValue(event.refs.module_attempt_ref, existing.module_attempt_ref),
      status: projectedStatus,
      history: historyEntry ? [...arrayValue(existing.history), historyEntry] : arrayValue(existing.history),
      current_phase: currentPhaseByEvent[event.type] !== undefined ? currentPhaseByEvent[event.type] : existing.current_phase,
      attempt_started_at: opensAttempt ? event.occurred_at : selectDefinedValue(() => (existing.attempt_started_at), () => (null)),
      phase_started_at: (selectTruthyValue(() => (event.type === 'module_attempt.started'), () => (event.type === 'module_attempt.testing_started'))) ? event.occurred_at : (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (event.type === 'module_attempt.ready_for_testing'), () => (event.type === 'module_attempt.failed'))), () => (event.type === 'module_attempt.passed'))), () => (event.type === 'module_attempt.blocked'))) ? null : selectDefinedValue(() => (existing.phase_started_at), () => (null)),
      completed_at: (event.type === 'module_attempt.passed') ? event.occurred_at : (selectTruthyValue(() => (event.type === 'module_attempt.failed'), () => (event.type === 'module_attempt.blocked'))) ? null : selectDefinedValue(() => (existing.completed_at), () => (null)),
      completion_summary: ['module_attempt.passed', 'module_attempt.failed'].includes(event.type)
        ? selectPresentValue(event.data.summary, event.data.reason)
        : (['module_attempt.started', 'module_attempt.ready_for_testing', 'module_attempt.testing_started'].includes(event.type))
          ? null
          : selectDefinedValue(() => (existing.completion_summary), () => (null)),
      fail_count: ['module_attempt.failed', 'module_attempt.blocked'].includes(event.type)
        ? Math.max(numberValue(existing.fail_count, 0), numberValue(selectDefinedValue(() => (event.refs.attempt), () => (event.data.blocked_fail_count)), 0))
        : numberValue(existing.fail_count, 0),
      fail_summaries: failureSummaryEntry
        ? [...arrayValue(existing.fail_summaries), failureSummaryEntry]
        : arrayValue(existing.fail_summaries),
      last_failure: event.type === 'module_attempt.failed' ? selectPresentValue(event.data.summary, event.data.reason) : selectDefinedValue(() => (existing.last_failure), () => (null)),
      blocked_at: event.type === 'module_attempt.blocked' ? event.occurred_at : selectDefinedValue(() => (existing.blocked_at), () => (null)),
      blocked_reason: event.type === 'module_attempt.blocked' ? event.data.reason : selectDefinedValue(() => (existing.blocked_reason), () => (null)),
      blocked_phase: event.type === 'module_attempt.blocked' ? selectDefinedValue(() => (event.data.blocked_phase), () => (null)) : selectDefinedValue(() => (existing.blocked_phase), () => (null)),
      blocked_fail_count: event.type === 'module_attempt.blocked' ? selectDefinedValue(() => (event.data.blocked_fail_count), () => (null)) : selectDefinedValue(() => (existing.blocked_fail_count), () => (null)),
      dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (event.refs.dispatch_id), () => (existing.dispatch_id))), () => (null)),
      gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (event.refs.gateway_label), () => (existing.gateway_label))), () => (null)),
      session_key: selectDefinedValue(() => (selectDefinedValue(() => (event.refs.session_key), () => (existing.session_key))), () => (null)),
      model: selectDefinedValue(() => (selectDefinedValue(() => (event.refs.model), () => (existing.model))), () => (null)),
      commit_hash: selectDefinedValue(() => (selectDefinedValue(() => (event.data?.commit_hash), () => (existing.commit_hash))), () => (null)),
      validation: projectModuleValidation(existing, event),
      projection_source: 'canonical-events',
      latest_event_type: event.type,
      latest_event_at: event.occurred_at,
    };
  }

  recomputeProgression(next);
  return next;
}
