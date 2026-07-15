import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const APPROVAL_SIGNAL_KINDS = new Set([
  'approve',
  'reject',
  'cancel',
  'timeout_continue',
  'timeout_block',
]);
const FIRST_ATTEMPT = 1;
const ZERO_ATTEMPT = 0;

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numericValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizedSignalKind(proposal, refs) {
  return (selectDefinedValue(() => (selectDefinedValue(() => (textValue(proposal?.data?.signal_kind)), () => (textValue(refs?.signal_kind)))), () => (''))).toLowerCase();
}

export function ensureLifecycleEventLegal(config, readModels, proposal) {
  const type = proposal?.type;
  const refs = objectRecord(proposal?.refs);
  const waitState = refs?.wait_ref ? selectTruthyValue(() => (readModels?.waits?.by_ref?.[refs.wait_ref]), () => (null)) : null;
  const gateState = refs?.gate_id ? selectTruthyValue(() => (readModels?.gates?.[refs.gate_id]), () => (null)) : null;
  const cooldownScope = refs?.module_id ? 'modules' : (refs?.gate_id ? 'gates' : null);
  const cooldownKey = selectTruthyValue(() => (selectTruthyValue(() => (refs?.module_id), () => (refs?.gate_id))), () => (null));
  const cooldownState = cooldownScope && cooldownKey
    ? selectTruthyValue(() => (readModels?.cooldowns?.[cooldownScope]?.[cooldownKey]), () => (null))
    : null;
  const pipelineState = selectTruthyValue(() => (readModels?.pipeline), () => (null));
  const moduleState = refs?.module_id ? selectTruthyValue(() => (readModels?.modules?.[refs.module_id]), () => (null)) : null;
  if (type === 'pipeline_run.started') {
    if (pipelineState?.status && pipelineState.run_id === refs.run_id) {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' already started`);
    }
    return;
  }

  if (selectTruthyValue(() => (type === 'pipeline_run.completed'), () => (type === 'pipeline_run.halted'))) {
    if (selectTruthyValue(() => (!pipelineState), () => (pipelineState.run_id !== refs.run_id))) {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' has not started`);
    }
    if (selectTruthyValue(() => (pipelineState.status === 'COMPLETED'), () => (pipelineState.status === 'HALTED'))) {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' is already terminal`);
    }
    return;
  }

  if (type === 'pipeline.checkpoint') {
    if (!proposal?.data?.point) {
      throw new Error('Illegal lifecycle append: pipeline.checkpoint requires point');
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
    const requestedAttempt = numericValue(refs?.attempt, FIRST_ATTEMPT);
    const currentGateAttempt = numericValue(gateState?.attempt, ZERO_ATTEMPT);
    if (gateState?.wait_status === 'CLOSED' && gateState?.status && requestedAttempt <= currentGateAttempt) {
      throw new Error(`Illegal lifecycle append: gate '${refs.gate_id}' already resolved its wait`);
    }
    return;
  }

  if (type === 'resume_signal.received') {
    const signalKind = normalizedSignalKind(proposal, refs);
    if (!refs?.resume_signal_ref) throw new Error('Illegal lifecycle append: resume_signal.received requires resume_signal_ref');
    if (selectTruthyValue(() => (!waitState), () => (waitState.state !== 'OPEN'))) {
      throw new Error(`Illegal lifecycle append: signal '${refs.resume_signal_ref}' has no open wait`);
    }
    if ((selectDefinedValue(() => (textValue(refs?.gate_type)), () => (''))).toLowerCase() === 'approval' && !APPROVAL_SIGNAL_KINDS.has(signalKind)) {
      throw new Error(`Illegal lifecycle append: approval signal '${selectTruthyValue(() => (signalKind), () => ('missing_signal_kind'))}' is unsupported`);
    }
    return;
  }

  if (type === 'wait.closed') {
    if (selectTruthyValue(() => (!waitState), () => (waitState.state !== 'OPEN'))) {
      throw new Error(`Illegal lifecycle append: wait '${selectTruthyValue(() => (refs.wait_ref), () => ('missing_wait_ref'))}' is not open`);
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
        if (numericValue(refs.attempt, ZERO_ATTEMPT) !== FIRST_ATTEMPT) {
          throw new Error(`Illegal lifecycle append: module '${refs.module_id}' cannot open attempt ${refs.attempt} at READY_FOR_TESTING`);
        }
        return;
      }

      const currentAttempt = numericValue(moduleState.current_attempt, ZERO_ATTEMPT);
      const requestedAttempt = numericValue(refs.attempt, ZERO_ATTEMPT);

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
