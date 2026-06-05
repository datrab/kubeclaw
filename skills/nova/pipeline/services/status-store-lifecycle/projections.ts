import { cloneSerializable } from '../serialization.ts';
import { createDefaultLifecycleReadModels, recomputeProgression } from './read-models.ts';

function deriveApprovalResolutionFromSignal(signalKind, continued = null) {
  switch (String(signalKind || '').trim().toLowerCase()) {
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
  const status = String(state?.status || '').trim().toUpperCase();
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
  const text = String(value || '').trim().toUpperCase();
  return text || null;
}

function ensureGateReadModel(next, refs = {}) {
  const gateId = refs?.gate_id;
  if (!gateId) return null;
  const existing = next.gates[gateId] || { gate_id: gateId };
  const nextGate = {
    ...existing,
    gate_id: gateId,
    gate_type: refs?.gate_type || existing.gate_type || null,
    gate_ref: refs?.gate_ref || existing.gate_ref || null,
    gate_evaluation_ref: refs?.gate_evaluation_ref || existing.gate_evaluation_ref || null,
    attempt: refs?.attempt ?? existing.attempt ?? 1,
  };
  next.gates[gateId] = nextGate;
  return nextGate;
}

function projectModuleValidation(existing, event) {
  const currentAttempt = event.refs?.attempt ?? existing.current_attempt ?? existing.validation?.attempt ?? null;
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
    return existing.validation || null;
  }

  const deliveryLintPassed = Boolean(event.data?.delivery_lint_passed);
  const preCheckPassed = Boolean(event.data?.pre_check_passed);
  return {
    ...(existing.validation || {}),
    attempt: currentAttempt,
    delivery_lint_passed: deliveryLintPassed,
    delivery_lint_passed_at: deliveryLintPassed ? event.occurred_at : existing.validation?.delivery_lint_passed_at || null,
    pre_check_passed: preCheckPassed,
    pre_check_passed_at: preCheckPassed ? event.occurred_at : existing.validation?.pre_check_passed_at || null,
  };
}

function applyWaitEventToReadModels(next, event) {
  const gateEntry = ensureGateReadModel(next, event.refs);
  const waitRef = event.refs?.wait_ref;
  if (!waitRef) return;

  const currentWait = next.waits?.by_ref?.[waitRef] || {};
  const waitEntry = {
    ...currentWait,
    wait_ref: waitRef,
    scope: event.refs?.gate_id ? 'gate' : (event.refs?.module_id ? 'module' : 'pipeline'),
    run_id: event.refs?.run_id || currentWait.run_id || null,
    gate_id: event.refs?.gate_id || currentWait.gate_id || null,
    gate_type: event.refs?.gate_type || currentWait.gate_type || null,
    gate_evaluation_ref: event.refs?.gate_evaluation_ref || currentWait.gate_evaluation_ref || null,
    module_id: event.refs?.module_id || currentWait.module_id || null,
    attempt: event.refs?.attempt ?? currentWait.attempt ?? 1,
    wait_kind: event.data?.wait_kind || currentWait.wait_kind || null,
    requested_at: event.data?.requested_at || currentWait.requested_at || event.occurred_at,
    deadline: event.data?.deadline || currentWait.deadline || null,
    timeout_minutes: event.data?.timeout_minutes ?? currentWait.timeout_minutes ?? null,
    timeout_policy: event.data?.timeout_policy || currentWait.timeout_policy || null,
    gate_title: event.data?.gate_title || currentWait.gate_title || null,
    request_message_ref: event.data?.request_message_ref ?? currentWait.request_message_ref ?? null,
    request_artifact_path: event.data?.request_artifact_path ?? currentWait.request_artifact_path ?? null,
    state: event.type === 'wait.closed' ? 'CLOSED' : 'OPEN',
    opened_at: currentWait.opened_at || event.occurred_at,
    closed_at: event.type === 'wait.closed' ? event.data?.closed_at || event.occurred_at : currentWait.closed_at || null,
    close_reason: event.type === 'wait.closed' ? event.data?.close_reason || null : currentWait.close_reason || null,
    resolution_kind: event.type === 'wait.closed' ? event.data?.resolution_kind || null : currentWait.resolution_kind || null,
    decision_by: event.type === 'wait.closed' ? event.data?.decision_by || null : currentWait.decision_by || null,
    decision_via: event.type === 'wait.closed' ? event.data?.decision_via || null : currentWait.decision_via || null,
    resume_signal_ref: event.type === 'wait.closed' ? event.data?.resume_signal_ref || null : currentWait.resume_signal_ref || null,
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
      wait_kind: event.data?.wait_kind || gateEntry.wait_kind || null,
      gate_title: event.data?.gate_title || gateEntry.gate_title || null,
      requested_at: event.data?.requested_at || event.occurred_at,
      deadline: event.data?.deadline || null,
      timeout_minutes: event.data?.timeout_minutes ?? null,
      timeout_policy: event.data?.timeout_policy || null,
      request_message_ref: event.data?.request_message_ref ?? null,
      request_artifact_path: event.data?.request_artifact_path ?? null,
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
    status: normalizeLifecycleTerminalStatus(gateEntry.status || derived.status || waitEntry.resolution_kind),
    wait_status: 'CLOSED',
    scheduler_consumed: gateEntry.scheduler_consumed === true || derived.scheduler_consumed === true,
    wait_ref: waitRef,
    resolved_at: waitEntry.closed_at || event.occurred_at,
    decision_by: waitEntry.decision_by || gateEntry.decision_by || null,
    decision_via: waitEntry.decision_via || gateEntry.decision_via || null,
    continued: waitEntry.close_reason === 'timed_out'
      ? (gateEntry.continued ?? derived.continued)
      : (gateEntry.continued ?? null),
    reason: gateEntry.reason || null,
    close_reason: waitEntry.close_reason || null,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyResumeSignalToReadModels(next, event) {
  const signalRef = event.refs?.resume_signal_ref;
  if (!signalRef) return;

  const currentSignal = next.signals?.by_ref?.[signalRef] || {};
  const signalEntry = {
    ...currentSignal,
    resume_signal_ref: signalRef,
    wait_ref: event.refs?.wait_ref || currentSignal.wait_ref || null,
    gate_id: event.refs?.gate_id || currentSignal.gate_id || null,
    gate_type: event.refs?.gate_type || currentSignal.gate_type || null,
    gate_evaluation_ref: event.refs?.gate_evaluation_ref || currentSignal.gate_evaluation_ref || null,
    signal_kind: event.data?.signal_kind || event.refs?.signal_kind || currentSignal.signal_kind || null,
    received_via: event.data?.received_via || currentSignal.received_via || null,
    decision_by: event.data?.decision_by || currentSignal.decision_by || null,
    reason: event.data?.reason || currentSignal.reason || null,
    continued: event.data?.continued ?? currentSignal.continued ?? null,
    source_message_ref: event.data?.source_message_ref ?? currentSignal.source_message_ref ?? null,
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
    wait_ref: event.refs?.wait_ref || gateEntry.wait_ref || null,
    status: derived.status || gateEntry.status || null,
    scheduler_consumed: gateEntry.scheduler_consumed === true || derived.scheduler_consumed === true,
    last_signal_kind: signalEntry.signal_kind,
    last_signal_ref: signalRef,
    last_signal_at: event.occurred_at,
    decision_by: signalEntry.decision_by || gateEntry.decision_by || null,
    decision_via: signalEntry.received_via || gateEntry.decision_via || null,
    continued: signalEntry.continued ?? derived.continued ?? gateEntry.continued ?? null,
    reason: signalEntry.reason || gateEntry.reason || null,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyCooldownEventToReadModels(next, event) {
  const isModule = Boolean(event.refs?.module_id);
  const collection = isModule ? next.cooldowns.modules : next.cooldowns.gates;
  const key = isModule ? event.refs.module_id : event.refs.gate_id;
  if (!key) return;

  const existing = collection[key] || {};
  if (event.type === 'rate_limit.cooldown_started') {
    collection[key] = {
      ...existing,
      scope: isModule ? 'module' : 'gate',
      target_ref: event.refs?.primary_ref?.id || existing.target_ref || null,
      run_id: event.refs?.run_id || existing.run_id || null,
      module_id: event.refs?.module_id || existing.module_id || null,
      gate_id: event.refs?.gate_id || existing.gate_id || null,
      gate_type: event.refs?.gate_type || existing.gate_type || null,
      attempt: event.refs?.attempt ?? existing.attempt ?? null,
      pause_count: event.data?.pause_count ?? existing.pause_count ?? null,
      max_pauses: event.data?.max_pauses ?? existing.max_pauses ?? null,
      cooldown_hours: event.data?.cooldown_hours ?? existing.cooldown_hours ?? null,
      resume_at: event.data?.resume_at || existing.resume_at || null,
      detail: event.data?.detail || existing.detail || null,
      agent_type: event.data?.agent_type || existing.agent_type || null,
      dispatch_id: event.data?.dispatch_id ?? event.refs?.dispatch_id ?? existing.dispatch_id ?? null,
      gateway_label: event.data?.gateway_label ?? event.refs?.gateway_label ?? existing.gateway_label ?? null,
      session_key: event.data?.session_key ?? event.refs?.session_key ?? existing.session_key ?? null,
      commit_hash: event.data?.commit_hash ?? existing.commit_hash ?? null,
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
    scope: existing.scope || (isModule ? 'module' : 'gate'),
    target_ref: existing.target_ref || event.refs?.primary_ref?.id || null,
    run_id: existing.run_id || event.refs?.run_id || null,
    module_id: existing.module_id || event.refs?.module_id || null,
    gate_id: existing.gate_id || event.refs?.gate_id || null,
    gate_type: existing.gate_type || event.refs?.gate_type || null,
    attempt: existing.attempt ?? event.refs?.attempt ?? null,
    pause_count: event.data?.pause_count ?? existing.pause_count ?? null,
    max_pauses: event.data?.max_pauses ?? existing.max_pauses ?? null,
    cooldown_hours: existing.cooldown_hours ?? null,
    resume_at: existing.resume_at || null,
    detail: event.data?.detail || existing.detail || null,
    agent_type: existing.agent_type || null,
    dispatch_id: existing.dispatch_id ?? event.refs?.dispatch_id ?? null,
    gateway_label: existing.gateway_label ?? event.refs?.gateway_label ?? null,
    session_key: existing.session_key ?? event.refs?.session_key ?? null,
    commit_hash: existing.commit_hash ?? null,
    projection_source: 'canonical-events',
    open: false,
    completed_at: event.data?.resumed_at || event.occurred_at,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

export function applyLifecycleEventToReadModels(readModels, event) {
  const next = cloneSerializable(readModels) || createDefaultLifecycleReadModels({ _runId: event?.refs?.run_id || null });
  next.last_event_id = event.event_id;
  next.last_event_type = event.type;
  next.event_count = Number(next.event_count || 0) + 1;

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
      exit_code: null,
      exit_reason: null,
      halt_reason: null,
      latest_event_type: event.type,
    };
  } else if (event.type === 'pipeline_run.completed') {
    next.pipeline = {
      ...(next.pipeline || {}),
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'COMPLETED',
      completed_at: event.occurred_at,
      exit_code: event.data.exit_code,
      exit_reason: event.data.exit_reason,
      latest_event_type: event.type,
    };
  } else if (event.type === 'pipeline_run.halted') {
    next.pipeline = {
      ...(next.pipeline || {}),
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'HALTED',
      completed_at: event.occurred_at,
      exit_code: event.data.exit_code,
      exit_reason: event.data.halt_reason,
      halt_reason: event.data.halt_reason,
      step_type: event.data.step_type,
      step_id: event.data.step_id,
      latest_event_type: event.type,
    };
  }

  if (event.type === 'wait.opened' || event.type === 'wait.closed') {
    applyWaitEventToReadModels(next, event);
  }

  if (event.type === 'resume_signal.received') {
    applyResumeSignalToReadModels(next, event);
  }

  if (event.type === 'rate_limit.cooldown_started' || event.type === 'rate_limit.cooldown_completed') {
    applyCooldownEventToReadModels(next, event);
  }

  if (event.type === 'recovery.stale_reset') {
    if (event.refs?.module_id) {
      const moduleId = event.refs.module_id;
      const existing = next.modules[moduleId] || { module_id: moduleId };
      next.modules[moduleId] = {
        ...existing,
        module_id: moduleId,
        module_attempt_ref: event.refs?.module_attempt_ref || existing.module_attempt_ref || null,
        current_attempt: event.refs?.attempt ?? existing.current_attempt ?? null,
        status: event.data?.recovery_target_status || existing.status || 'PENDING',
        current_phase: null,
        dispatch_id: event.refs?.dispatch_id ?? existing.dispatch_id ?? null,
        gateway_label: event.refs?.gateway_label ?? existing.gateway_label ?? null,
        session_key: event.refs?.session_key ?? existing.session_key ?? null,
        latest_event_type: event.type,
        latest_event_at: event.occurred_at,
        last_recovery_action: event.data?.recovery_action || null,
        last_recovery_reason: event.data?.reason || null,
        projection_source: 'canonical-events',
      };
      delete next.active_sessions.modules[moduleId];
    }

    if (event.refs?.gate_id) {
      const gateEntry = ensureGateReadModel(next, event.refs) || { gate_id: event.refs.gate_id };
      next.gates[event.refs.gate_id] = {
        ...gateEntry,
        status: event.data?.recovery_target_status || gateEntry.status || 'PENDING',
        scheduler_consumed: false,
        latest_event_type: event.type,
        latest_event_at: event.occurred_at,
        last_recovery_action: event.data?.recovery_action || null,
        last_recovery_reason: event.data?.reason || null,
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
        run_id: event.refs?.run_id || null,
        attempt: event.data?.attempt ?? null,
        dispatch_id: event.data?.dispatch_id || null,
        session_key: event.data?.session_key || null,
        gateway_label: event.data?.gateway_label || null,
        label: event.data?.diagnostic_label || null,
        phase: event.data?.previous_phase || null,
        projection_source: 'canonical-events',
      };
    }
    if (event.data?.gate_id && event.data?.session_key) {
      const gateId = event.data.gate_id;
      next.active_sessions.gates[gateId] = {
        gate_id: gateId,
        gate_type: event.data?.gate_type || null,
        run_id: event.refs?.run_id || null,
        attempt: event.data?.attempt ?? null,
        dispatch_id: event.data?.dispatch_id || null,
        session_key: event.data?.session_key || null,
        gateway_label: event.data?.gateway_label || null,
        label: event.data?.diagnostic_label || null,
        phase: event.data?.previous_phase || null,
        projection_source: 'canonical-events',
      };
    }
  }

  if (event.refs?.module_id) {
    const moduleId = event.refs.module_id;
    const existing = next.modules[moduleId] || { module_id: moduleId };
    const opensAttempt = (
      existing.current_attempt == null
      || (event.refs.attempt != null && Number(event.refs.attempt) !== Number(existing.current_attempt))
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
    const projectedStatus = statusByEvent[event.type] || existing.status || null;
    const historyEntry = projectedStatus ? {
      timestamp: event.occurred_at,
      from: existing.status || 'PENDING',
      to: projectedStatus,
      agent: event.refs?.agent || 'pipeline',
      note: event.data?.summary || event.data?.reason || event.type,
    } : null;
    const failureSummaryEntry = event.type === 'module_attempt.failed' ? {
      at: event.occurred_at,
      phase: event.data?.phase || null,
      summary: event.data?.summary || event.data?.reason || 'Module attempt failed',
      attempt: event.refs?.attempt ?? existing.current_attempt ?? null,
    } : null;

    next.modules[moduleId] = {
      ...existing,
      module_id: moduleId,
      title: event.data.title || existing.title || null,
      module_dir: event.data.module_dir || existing.module_dir || null,
      current_attempt: event.refs.attempt ?? existing.current_attempt ?? null,
      module_attempt_ref: event.refs.module_attempt_ref || existing.module_attempt_ref || null,
      status: projectedStatus,
      history: historyEntry ? [...(existing.history || []), historyEntry] : existing.history || [],
      current_phase: currentPhaseByEvent[event.type] !== undefined ? currentPhaseByEvent[event.type] : existing.current_phase,
      attempt_started_at: opensAttempt ? event.occurred_at : existing.attempt_started_at || null,
      phase_started_at: (event.type === 'module_attempt.started' || event.type === 'module_attempt.testing_started') ? event.occurred_at : (event.type === 'module_attempt.ready_for_testing' || event.type === 'module_attempt.failed' || event.type === 'module_attempt.passed' || event.type === 'module_attempt.blocked') ? null : existing.phase_started_at || null,
      completed_at: (event.type === 'module_attempt.passed') ? event.occurred_at : (event.type === 'module_attempt.failed' || event.type === 'module_attempt.blocked') ? null : existing.completed_at || null,
      completion_summary: (event.type === 'module_attempt.passed' || event.type === 'module_attempt.failed')
        ? (event.data.summary || event.data.reason || null)
        : (event.type === 'module_attempt.started' || event.type === 'module_attempt.ready_for_testing' || event.type === 'module_attempt.testing_started')
          ? null
          : existing.completion_summary || null,
      fail_count: event.type === 'module_attempt.failed' || event.type === 'module_attempt.blocked'
        ? Math.max(Number(existing.fail_count || 0), Number(event.refs.attempt || event.data.blocked_fail_count || 0))
        : existing.fail_count || 0,
      fail_summaries: failureSummaryEntry
        ? [...(existing.fail_summaries || []), failureSummaryEntry]
        : existing.fail_summaries || [],
      last_failure: event.type === 'module_attempt.failed' ? (event.data.summary || event.data.reason || null) : existing.last_failure || null,
      blocked_reason: event.type === 'module_attempt.blocked' ? event.data.reason : existing.blocked_reason || null,
      dispatch_id: event.refs.dispatch_id ?? existing.dispatch_id ?? null,
      gateway_label: event.refs.gateway_label ?? existing.gateway_label ?? null,
      session_key: event.refs.session_key ?? existing.session_key ?? null,
      model: event.refs.model ?? existing.model ?? null,
      commit_hash: event.data?.commit_hash ?? existing.commit_hash ?? null,
      validation: projectModuleValidation(existing, event),
      projection_source: 'canonical-events',
      latest_event_type: event.type,
      latest_event_at: event.occurred_at,
    };
  }

  recomputeProgression(next);
  return next;
}
