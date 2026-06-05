import { createHash } from 'crypto';

function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function slugify(value, fallback = null) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized) return normalized;
  if (fallback) return fallback;
  throw new Error('lifecycle idempotency key requires a typed non-empty discriminator');
}

function requireRef(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`lifecycle idempotency key requires ${label}`);
  }
  return value.trim();
}

export function buildLifecycleIdempotencyKey(type, refs, data = {}) {
  const primaryRef = refs?.primary_ref?.id || refs?.module_attempt_ref || refs?.run_ref || null;
  switch (type) {
    case 'pipeline_run.started':
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|mode:${slugify(data.run_mode || 'full')}`;
    case 'pipeline_run.completed':
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|final:completed`;
    case 'pipeline_run.halted':
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|reason:${slugify(data.halt_reason)}`;
    case 'module_attempt.started':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|phase:start`;
    case 'module_attempt.ready_for_testing':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|phase:ready_for_testing`;
    case 'module_attempt.testing_started':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|phase:testing_started`;
    case 'module_attempt.failed': {
      const fingerprint = hashValue(stableStringify({
        reason: data.reason || null,
        summary: data.summary || null,
        validator_name: data.validator_name || null,
        suite_names: data.suite_names || [],
      }));
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|failure:${slugify(data.failure_class)}:${fingerprint}`;
    }
    case 'module_attempt.passed':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|final:passed`;
    case 'module_attempt.blocked':
      return `${type}|${requireRef(refs?.module_attempt_ref, 'module_attempt_ref')}|reason:${slugify(data.reason || 'blocked')}`;
    case 'wait.opened':
      return `${type}|${requireRef(refs?.wait_ref, 'wait_ref')}|state:open`;
    case 'wait.closed':
      return `${type}|${requireRef(refs?.wait_ref, 'wait_ref')}|reason:${slugify(data.close_reason || 'closed')}`;
    case 'resume_signal.received':
      return `${type}|${requireRef(refs?.resume_signal_ref, 'resume_signal_ref')}|signal:${slugify(data.signal_kind || refs?.signal_kind)}`;
    case 'rate_limit.cooldown_started':
      return `${type}|${requireRef(primaryRef, 'primary_ref')}|cooldown:${Number(data.pause_count || 0)}`;
    case 'rate_limit.cooldown_completed':
      return `${type}|${requireRef(primaryRef, 'primary_ref')}|cooldown:${Number(data.pause_count || 0)}:completed`;
    case 'recovery.stale_reset': {
      const recoveryRef = refs?.module_id
        ? `module:${requireRef(refs.module_id, 'module_id')}`
        : `gate:${requireRef(refs?.gate_id, 'gate_id')}`;
      const fingerprint = hashValue(stableStringify({
        action: data.recovery_action || null,
        reason: data.reason || null,
        session_key: data.session_key || refs?.session_key || null,
        dispatch_id: data.dispatch_id || refs?.dispatch_id || null,
      }));
      return `${type}|${recoveryRef}|action:${slugify(data.recovery_action)}:${fingerprint}`;
    }
    case 'recovery.stale_blocked': {
      const recoveryRef = data.module_id
        ? `module:${requireRef(data.module_id, 'module_id')}`
        : data.gate_id
          ? `gate:${requireRef(data.gate_id, 'gate_id')}`
          : `scope:${slugify(data.scope || 'unknown')}`;
      const fingerprint = hashValue(stableStringify({
        action: data.recovery_action || null,
        reason: data.reason || null,
        session_key: data.session_key || null,
        dispatch_id: data.dispatch_id || null,
      }));
      return `${type}|${requireRef(refs?.run_ref, 'run_ref')}|${recoveryRef}|action:${slugify(data.recovery_action || 'blocked')}:${fingerprint}`;
    }
    default:
      throw new Error(`unsupported lifecycle event type for idempotency: ${type}`);
  }
}
