import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/system-io-warning.js — point-in-time non-critical local I/O warning telemetry

import { sanitizeNonBlockingErrorDetail } from '../noncritical-reporting.ts';
import { emitTelemetryStreamEvent } from './telemetry-stream.ts';

const PIPELINE_JSONL_PATH_ROLE = 'pipeline_jsonl';
const SYSTEM_IO_WARNING_EMITTER = 'nova/pipeline/services/system-io-warning';
const SYSTEM_IO_WARNING_EMIT_FAILED = 'system_io_warning_emit_failed';

function detailFromError(error, fallback) {
  if (error == null) return selectDefinedValue(() => (fallback), () => (null));
  return selectDefinedValue(() => (error?.message), () => (String(error)));
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
    reason: selectDefinedValue(() => (selectDefinedValue(() => (warning?.reason), () => (reason))), () => (SYSTEM_IO_WARNING_EMIT_FAILED)),
    component: selectTruthyValue(() => (warning?.component), () => (null)),
    surface: selectTruthyValue(() => (warning?.surface), () => (null)),
    path_role: selectTruthyValue(() => (warning?.path_role), () => (null)),
    code: selectTruthyValue(() => (selectTruthyValue(() => (warning?.code), () => (error?.code))), () => (null)),
    detail: sanitizeNonBlockingErrorDetail(detailFromError(error, selectDefinedValue(() => (reason), () => ('system.io_warning emit failed'))), 500),
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
      path_role: selectDefinedValue(() => (data.path_role), () => (null)),
      detail: selectDefinedValue(() => (data.detail), () => (null)),
      code: selectDefinedValue(() => (data.code), () => (null)),
    errno: numberOrNull(data.errno),
    syscall: selectTruthyValue(() => (data.syscall), () => (null)),
    module_id: selectTruthyValue(() => (data.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (data.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (data.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (data.dispatch_id), () => (null)),
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
    warning_at: systemIoWarningAt(data),
  };
}

function systemIoWarningAt(data) {
  if (data.warning_at) return data.warning_at;
  return new Date().toISOString();
}

export function emitSystemIoWarning(config, data = {}, options = {}) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!data?.component), () => (!data?.surface))), () => (!data?.reason))), () => (!data?.operation))), () => (!data?.path))) return false;

  const warning = buildWarningPayload(data);
  void emitTelemetryStreamEvent(config, 'system.io_warning', warning, {
    emitter: selectDefinedValue(() => (options.emitter), () => (SYSTEM_IO_WARNING_EMITTER)),
    runId: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (options.runId), () => (config?._runId))), () => (config?.run_id))), () => (null)),
  }).then((result) => {
    if (selectTruthyValue(() => (result?.ok), () => (result?.skipped))) return;
    bareMetalWarningFallback(selectDefinedValue(() => (result?.reason), () => (SYSTEM_IO_WARNING_EMIT_FAILED)), result?.error, warning);
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
    code: selectDefinedValue(() => (error?.code), () => (null)),
    errno: error?.errno,
    syscall: selectDefinedValue(() => (error?.syscall), () => (null)),
    module_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.moduleId), () => (entry?.module_id))), () => (null)),
    gate_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.gateId), () => (entry?.gate_id))), () => (null)),
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (entry?.gateType), () => (entry?.gate_type))), () => (null)),
    attempt: entryAttempt(entry),
    dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.dispatchId), () => (entry?.dispatch_id))), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (entry?.sessionKey), () => (entry?.session_key))), () => (null)),
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
    path_role: selectDefinedValue(() => (selectDefinedValue(() => (entry?.pathRole), () => (entry?.path_role))), () => (PIPELINE_JSONL_PATH_ROLE)),
    detail: detailFromError(error, 'pipeline JSONL append failed'),
    code: selectDefinedValue(() => (error?.code), () => (null)),
    errno: error?.errno,
    syscall: selectDefinedValue(() => (error?.syscall), () => (null)),
    module_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.moduleId), () => (entry?.module_id))), () => (null)),
    gate_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.gateId), () => (entry?.gate_id))), () => (null)),
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (entry?.gateType), () => (entry?.gate_type))), () => (null)),
    attempt: entryAttempt(entry),
    dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.dispatchId), () => (entry?.dispatch_id))), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (entry?.sessionKey), () => (entry?.session_key))), () => (null)),
  }, {
    emitter: 'nova/pipeline/core/logger',
  });
}

export function emitPromptArtifactWriteWarning(config, promptPath, error, entry = {}) {
  return emitSystemIoWarning(config, {
    component: 'prompt_artifact',
    surface: 'prompt_artifact',
    reason: 'prompt_artifact_write_failed',
    operation: errorOperation(error, 'write'),
    path: promptPath,
    path_role: 'prompt_artifact',
    detail: detailFromError(error, 'prompt artifact write failed'),
    code: selectDefinedValue(() => (error?.code), () => (null)),
    errno: error?.errno,
    syscall: selectDefinedValue(() => (error?.syscall), () => (null)),
    module_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.moduleId), () => (entry?.module_id))), () => (null)),
    gate_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.gateId), () => (entry?.gate_id))), () => (null)),
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (entry?.gateType), () => (entry?.gate_type))), () => (null)),
    attempt: entryAttempt(entry),
    dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.dispatchId), () => (entry?.dispatch_id))), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (entry?.sessionKey), () => (entry?.session_key))), () => (null)),
  }, {
    emitter: 'nova/pipeline/services/status-store',
  });
}
