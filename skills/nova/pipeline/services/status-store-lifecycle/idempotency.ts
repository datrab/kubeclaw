import { createHash } from 'crypto';
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const FULL_RUN_MODE = 'full';
const BLOCKED_REASON = 'blocked';
const CLOSED_REASON = 'closed';
const ZERO_PAUSE_COUNT = 0;

function stableStringify(value) {
  if (selectTruthyValue(() => (value === null), () => (value === undefined))) return JSON.stringify(selectDefinedValue(() => (value), () => (null)));
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash('sha1').update(stringInput(value)).digest('hex').slice(0, 12);
}

function slugify(value, fallback = null) {
  const normalized = stringInput(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized) return normalized;
  if (fallback) return fallback;
  throw new Error('lifecycle idempotency key requires a typed non-empty discriminator');
}

function stringInput(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function pauseCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : ZERO_PAUSE_COUNT;
}

function requireRef(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`lifecycle idempotency key requires ${label}`);
  }
  return value.trim();
}

function phaseIdentitySuffix(refs) {
  const dispatchId = typeof refs?.dispatch_id === 'string' ? refs.dispatch_id.trim() : '';
  const sessionKey = typeof refs?.session_key === 'string' ? refs.session_key.trim() : '';
  if (dispatchId || sessionKey) {
    return `|identity:${hashValue(stableStringify({ dispatch_id: dispatchId || null, session_key: sessionKey || null }))}`;
  }
  return '';
}

export function buildLifecycleIdempotencyKey(type, refs, data = {}) {
  const primaryRef = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (refs?.primary_ref?.id), () => (refs?.module_attempt_ref))), () => (refs?.run_ref))), () => (null));
  switch (type) {
    case 'pipeline_run.started':
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|mode:${slugify(data.run_mode, FULL_RUN_MODE)}`;
    case 'pipeline_run.completed':
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|final:completed`;
    case 'pipeline_run.halted':
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|reason:${slugify(data.halt_reason)}`;
    case 'pipeline.checkpoint':
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|point:${slugify(data.point)}`;
    case 'module_attempt.started':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|phase:start${phaseIdentitySuffix(refs)}`;
    case 'module_attempt.ready_for_testing':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|phase:ready_for_testing`;
    case 'module_attempt.testing_started':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|phase:testing_started${phaseIdentitySuffix(refs)}`;
    case 'module_attempt.failed': {
      const fingerprint = hashValue(stableStringify({
        reason: selectTruthyValue(() => (data.reason), () => (null)),
        summary: selectTruthyValue(() => (data.summary), () => (null)),
        validator_name: selectTruthyValue(() => (data.validator_name), () => (null)),
        suite_names: arrayValue(data.suite_names),
      }));
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|failure:${slugify(data.failure_class)}:${fingerprint}`;
    }
    case 'module_attempt.passed':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|final:passed`;
    case 'module_attempt.blocked':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|reason:${slugify(data.reason, BLOCKED_REASON)}`;
    case 'gate_evaluation.passed':
      return `${type}|${requireRef(refs?.gate_evaluation_ref, 'gate_evaluation_ref')}|final:passed`;
    case 'gate_evaluation.failed':
      return `${type}|${requireRef(refs?.gate_evaluation_ref, 'gate_evaluation_ref')}|reason:${slugify(data.reason, BLOCKED_REASON)}`;
    case 'gate_evaluation.blocked':
      return `${type}|${requireRef(refs?.gate_evaluation_ref, 'gate_evaluation_ref')}|reason:${slugify(data.reason, BLOCKED_REASON)}`;
    case 'wait.opened':
      return `${type}|${requireRef(refs?.wait_ref, 'wait_ref')}|state:open`;
    case 'wait.closed':
      return `${type}|${requireRef(refs?.wait_ref, 'wait_ref')}|reason:${slugify(data.close_reason, CLOSED_REASON)}`;
    case 'resume_signal.received':
      return `${type}|${requireRef(refs?.resume_signal_ref, 'resume_signal_ref')}|signal:${slugify(signalKindAuthority(data, refs))}`;
    case 'rate_limit.cooldown_started':
      return `${type}|${requireRef(primaryRef, 'primary_ref')}|cooldown:${pauseCount(data.pause_count)}`;
    case 'rate_limit.cooldown_completed':
      return `${type}|${requireRef(primaryRef, 'primary_ref')}|cooldown:${pauseCount(data.pause_count)}:completed`;
    case 'recovery.stale_reset': {
      const recoveryRef = refs?.module_id
        ? `module:${requireRef(refs.module_id, 'module_id')}`
        : `gate:${requireRef(refs?.gate_id, 'gate_id')}`;
      const fingerprint = hashValue(stableStringify({
        action: selectTruthyValue(() => (data.recovery_action), () => (null)),
        reason: selectTruthyValue(() => (data.reason), () => (null)),
        session_key: selectTruthyValue(() => (selectTruthyValue(() => (data.session_key), () => (refs?.session_key))), () => (null)),
        dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (data.dispatch_id), () => (refs?.dispatch_id))), () => (null)),
      }));
      return `${type}|${recoveryRef}|action:${slugify(data.recovery_action)}:${fingerprint}`;
    }
    case 'recovery.stale_blocked': {
      const recoveryRef = data.module_id
        ? `module:${requireRef(data.module_id, 'module_id')}`
        : data.gate_id
          ? `gate:${requireRef(data.gate_id, 'gate_id')}`
          : `scope:${slugify(data.scope, 'missing_scope')}`;
      const fingerprint = hashValue(stableStringify({
        action: selectTruthyValue(() => (data.recovery_action), () => (null)),
        reason: selectTruthyValue(() => (data.reason), () => (null)),
        session_key: selectTruthyValue(() => (data.session_key), () => (null)),
        dispatch_id: selectTruthyValue(() => (data.dispatch_id), () => (null)),
      }));
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|${recoveryRef}|action:${slugify(data.recovery_action, BLOCKED_REASON)}:${fingerprint}`;
    }
    default:
      throw new Error(`unsupported lifecycle event type for idempotency: ${type}`);
  }
}

function signalKindAuthority(data, refs) {
  if (data.signal_kind) return data.signal_kind;
  return refs?.signal_kind;
}
