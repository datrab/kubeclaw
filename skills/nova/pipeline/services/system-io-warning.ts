// services/system-io-warning.js — point-in-time non-critical local I/O warning telemetry

import { sanitizeNonBlockingErrorDetail } from '../noncritical-reporting.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';

function detailFromError(error, fallback) {
  if (error == null) return fallback || null;
  return error?.message || String(error);
}

function numberOrNull(value) {
  return typeof value === 'number' ? value : null;
}

function entryAttempt(entry = {}) {
  return typeof entry?.attempt === 'number' ? entry.attempt : null;
}

function errorOperation(error, fallback = 'append') {
  return error?.syscall === 'mkdir' ? 'mkdir' : fallback;
}

function bareMetalWarningFallback(reason, error, warning = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'WARN',
    msg: '[system.io_warning] emit failed (non-critical)',
    reason: warning?.reason || reason || 'system_io_warning_emit_failed',
    component: warning?.component || null,
    surface: warning?.surface || null,
    path_role: warning?.path_role || null,
    code: warning?.code || error?.code || null,
    detail: sanitizeNonBlockingErrorDetail(detailFromError(error, reason || 'system.io_warning emit failed'), 500),
  });
  try {
    console.error(line);
  } catch (_consoleError) {
    try { process.stderr.write(`${line}\n`); } catch (_stderrError) { /* bare-metal fallback exhausted */ }
  }
}

function buildWarningPayload(data = {}) {
  return {
    component: data.component,
    surface: data.surface,
    reason: data.reason,
    operation: data.operation,
    path: data.path,
    path_role: data.path_role || null,
    detail: data.detail || null,
    code: data.code || null,
    errno: numberOrNull(data.errno),
    syscall: data.syscall || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_type || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id || null,
    session_key: data.session_key || null,
    warning_at: data.warning_at || new Date().toISOString(),
  };
}

export function emitSystemIoWarning(config, data = {}, options = {}) {
  if (!data?.component || !data?.surface || !data?.reason || !data?.operation || !data?.path) return false;

  const warning = buildWarningPayload(data);
  void emitTelemetryStreamEvent(config, 'system.io_warning', warning, {
    emitter: options.emitter || 'nova/pipeline/services/system-io-warning',
    runId: options.runId || config?._runId || config?.run_id || null,
  }).then((result) => {
    if (result?.ok || result?.skipped) return;
    bareMetalWarningFallback(result?.reason || 'system_io_warning_emit_failed', result?.error, warning);
  }).catch((telemetryError) => {
    bareMetalWarningFallback('system_io_warning_emit_failed', telemetryError, warning);
  });

  return true;
}

export function emitPolicyAuditAppendWarning(config, policyLogPath, error, entry = {}) {
  return emitSystemIoWarning(config, {
    component: 'model_policy',
    surface: 'audit_log',
    reason: 'policy_audit_append_failed',
    operation: 'append',
    path: policyLogPath,
    path_role: 'model_policy_jsonl',
    detail: detailFromError(error, 'model policy audit append failed'),
    code: error?.code ?? null,
    errno: error?.errno,
    syscall: error?.syscall ?? null,
    module_id: entry?.moduleId || entry?.module_id || null,
    gate_id: entry?.gateId || entry?.gate_id || null,
    gate_type: entry?.gateType || entry?.gate_type || null,
    attempt: entryAttempt(entry),
    dispatch_id: entry?.dispatchId || entry?.dispatch_id || null,
    session_key: entry?.sessionKey || entry?.session_key || null,
  }, {
    emitter: 'nova/pipeline/core/policy',
  });
}

export function emitPipelineLogAppendWarning(config, targetPath, error, entry = {}) {
  return emitSystemIoWarning(config, {
    component: 'pipeline_logger',
    surface: 'pipeline_jsonl',
    reason: 'pipeline_jsonl_append_failed',
    operation: errorOperation(error, 'append'),
    path: targetPath,
    path_role: entry?.pathRole || entry?.path_role || 'pipeline_jsonl',
    detail: detailFromError(error, 'pipeline JSONL append failed'),
    code: error?.code ?? null,
    errno: error?.errno,
    syscall: error?.syscall ?? null,
    module_id: entry?.moduleId || entry?.module_id || null,
    gate_id: entry?.gateId || entry?.gate_id || null,
    gate_type: entry?.gateType || entry?.gate_type || null,
    attempt: entryAttempt(entry),
    dispatch_id: entry?.dispatchId || entry?.dispatch_id || null,
    session_key: entry?.sessionKey || entry?.session_key || null,
  }, {
    emitter: 'nova/pipeline/core/logger',
  });
}

export function emitPromptArtifactWriteWarning(config, promptPath, error, entry = {}) {
  return emitSystemIoWarning(config, {
    component: 'prompt_artifact',
    surface: 'redacted_prompt_artifact',
    reason: 'prompt_artifact_write_failed',
    operation: errorOperation(error, 'write'),
    path: promptPath,
    path_role: 'redacted_prompt_artifact',
    detail: detailFromError(error, 'redacted prompt artifact write failed'),
    code: error?.code ?? null,
    errno: error?.errno,
    syscall: error?.syscall ?? null,
    module_id: entry?.moduleId || entry?.module_id || null,
    gate_id: entry?.gateId || entry?.gate_id || null,
    gate_type: entry?.gateType || entry?.gate_type || null,
    attempt: entryAttempt(entry),
    dispatch_id: entry?.dispatchId || entry?.dispatch_id || null,
    session_key: entry?.sessionKey || entry?.session_key || null,
  }, {
    emitter: 'nova/pipeline/services/status-store',
  });
}
