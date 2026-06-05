const APPROVAL_SIGNAL_KINDS = new Set([
  'approve',
  'reject',
  'cancel',
  'timeout_continue',
  'timeout_block',
]);

export function ensureLifecycleEventLegal(config, readModels, proposal) {
  const type = proposal?.type;
  const refs = proposal?.refs || {};
  const waitState = refs?.wait_ref ? readModels?.waits?.by_ref?.[refs.wait_ref] || null : null;
  const gateState = refs?.gate_id ? readModels?.gates?.[refs.gate_id] || null : null;
  const cooldownScope = refs?.module_id ? 'modules' : (refs?.gate_id ? 'gates' : null);
  const cooldownKey = refs?.module_id || refs?.gate_id || null;
  const cooldownState = cooldownScope && cooldownKey
    ? readModels?.cooldowns?.[cooldownScope]?.[cooldownKey] || null
    : null;
  const pipelineState = readModels?.pipeline || null;
  const moduleState = refs?.module_id ? readModels?.modules?.[refs.module_id] || null : null;
  if (type === 'pipeline_run.started') {
    if (pipelineState?.status && pipelineState.run_id === refs.run_id) {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' already started`);
    }
    return;
  }

  if (type === 'pipeline_run.completed' || type === 'pipeline_run.halted') {
    if (!pipelineState || pipelineState.run_id !== refs.run_id) {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' has not started`);
    }
    if (pipelineState.status === 'COMPLETED' || pipelineState.status === 'HALTED') {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' is already terminal`);
    }
    return;
  }

  if (type === 'wait.opened') {
    if (!refs?.wait_ref) throw new Error('Illegal lifecycle append: wait.opened requires wait_ref');
    if (waitState?.state === 'OPEN') {
      throw new Error(`Illegal lifecycle append: wait '${refs.wait_ref}' is already open`);
    }
    if (gateState?.wait_status === 'OPEN') {
      throw new Error(`Illegal lifecycle append: gate '${refs.gate_id}' already has an open wait`);
    }
    const requestedAttempt = Number(refs?.attempt || 1);
    const currentGateAttempt = Number(gateState?.attempt || 0);
    if (gateState?.wait_status === 'CLOSED' && gateState?.status && requestedAttempt <= currentGateAttempt) {
      throw new Error(`Illegal lifecycle append: gate '${refs.gate_id}' already resolved its wait`);
    }
    return;
  }

  if (type === 'resume_signal.received') {
    const signalKind = String(proposal?.data?.signal_kind || refs?.signal_kind || '').trim().toLowerCase();
    if (!refs?.resume_signal_ref) throw new Error('Illegal lifecycle append: resume_signal.received requires resume_signal_ref');
    if (!waitState || waitState.state !== 'OPEN') {
      throw new Error(`Illegal lifecycle append: signal '${refs.resume_signal_ref}' has no open wait`);
    }
    if ((refs?.gate_type || '').toLowerCase() === 'approval' && !APPROVAL_SIGNAL_KINDS.has(signalKind)) {
      throw new Error(`Illegal lifecycle append: approval signal '${signalKind || 'unknown'}' is unsupported`);
    }
    return;
  }

  if (type === 'wait.closed') {
    if (!waitState || waitState.state !== 'OPEN') {
      throw new Error(`Illegal lifecycle append: wait '${refs.wait_ref || 'unknown'}' is not open`);
    }
    if (!proposal?.data?.close_reason) {
      throw new Error(`Illegal lifecycle append: wait '${refs.wait_ref}' close_reason is required`);
    }
    return;
  }

  if (type === 'rate_limit.cooldown_started') {
    if (cooldownState?.open) {
      throw new Error(`Illegal lifecycle append: cooldown already open for '${cooldownKey}'`);
    }
    return;
  }

  if (type === 'rate_limit.cooldown_completed') {
    if (!cooldownState?.open) {
      throw new Error(`Illegal lifecycle append: cooldown is not open for '${cooldownKey}'`);
    }
    return;
  }

  if (type === 'recovery.stale_reset') {
    if (!refs?.module_id && !refs?.gate_id) {
      throw new Error('Illegal lifecycle append: recovery.stale_reset requires module_id or gate_id');
    }
    if (!proposal?.data?.recovery_action) {
      throw new Error('Illegal lifecycle append: recovery.stale_reset requires recovery_action');
    }
    if (!proposal?.data?.reason) {
      throw new Error('Illegal lifecycle append: recovery.stale_reset requires reason');
    }
    return;
  }

  if (refs?.module_id) {
    if (type === 'module_attempt.started') {
      if (moduleState && moduleState.status && moduleState.status !== 'PASS' && moduleState.current_attempt === refs.attempt && moduleState.latest_event_type === 'module_attempt.started') {
        throw new Error(`Illegal lifecycle append: module '${refs.module_id}' attempt ${refs.attempt} already started`);
      }
      return;
    }

    if (type === 'module_attempt.ready_for_testing') {
      if (!moduleState) {
        if (Number(refs.attempt || 0) !== 1) {
          throw new Error(`Illegal lifecycle append: module '${refs.module_id}' cannot open attempt ${refs.attempt} at READY_FOR_TESTING`);
        }
        return;
      }

      const currentAttempt = Number(moduleState.current_attempt || 0);
      const requestedAttempt = Number(refs.attempt || 0);

      if (requestedAttempt === currentAttempt) return;

      const canAdvanceAttempt = requestedAttempt === currentAttempt + 1
        && ['FAIL', 'BLOCKED', 'READY_FOR_TESTING'].includes(moduleState.status);
      if (canAdvanceAttempt) return;

      throw new Error(`Illegal lifecycle append: module '${refs.module_id}' attempt mismatch (${refs.attempt} != ${moduleState.current_attempt})`);
    }

    if (!moduleState && type !== 'module_attempt.started') {
      throw new Error(`Illegal lifecycle append: module '${refs.module_id}' has no open attempt for ${type}`);
    }

    if (moduleState && moduleState.current_attempt != null && refs.attempt != null) {
      const currentAttempt = Number(moduleState.current_attempt);
      const requestedAttempt = Number(refs.attempt);
      const canBridgeRetryGap = requestedAttempt === currentAttempt + 1
        && ['FAIL', 'BLOCKED', 'READY_FOR_TESTING'].includes(moduleState.status);
      if (canBridgeRetryGap) return;
    }

    if (moduleState && moduleState.current_attempt != null && refs.attempt != null && Number(moduleState.current_attempt) !== Number(refs.attempt) && type !== 'module_attempt.started') {
      throw new Error(`Illegal lifecycle append: module '${refs.module_id}' attempt mismatch (${refs.attempt} != ${moduleState.current_attempt})`);
    }
  }
}
