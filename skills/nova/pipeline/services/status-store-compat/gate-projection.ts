import fs from 'fs';

import { gateOutputPath, gateStatusPath } from '../../core/paths.ts';
import {
  appendWaitLifecycleEvent,
  buildResumeSignalRefs,
  cloneSerializable,
  deriveApprovalResolutionFromState,
  getLifecycleGateState,
  loadLifecycleReadModels,
  saveLifecycleReadModels,
} from '../status-store-lifecycle.ts';
import {
  GATE_OUTPUT_EVIDENCE_SOURCE,
  LEGACY_GATE_STATUS_EVIDENCE_SOURCE,
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from './common.ts';

export const GATE_STATUS_AUTHORITY_ROLES = Object.freeze({
  DIAGNOSTIC_EVIDENCE: 'diagnostic_evidence',
  APPROVAL_WAIT_EVIDENCE: 'approval_wait_evidence',
  ABSENT: 'absent',
});

const GATE_OUTPUT_PASS_STATUSES = new Set(['PASS', 'GO', 'OK', 'APPROVED']);
const GATE_OUTPUT_FAIL_STATUSES = new Set(['FAIL', 'ISSUES_FOUND', 'NO-GO', 'NOGO', 'BLOCKED']);
const GATE_STATUS_TERMINAL_STATUSES = new Set(['PASS', 'GO', 'OK', 'APPROVED', 'FAIL', 'ISSUES_FOUND', 'NO-GO', 'NOGO', 'BLOCKED']);

function normalizeGateOutputStatus(value) {
  return String(value || '').trim().toUpperCase();
}

export function buildGateStatusAuthorityPolicy({
  gate = null,
  gateStatus = null,
  output = null,
} = {}) {
  const gateType = String(gate?.type || '').trim().toLowerCase();
  const status = normalizeGateOutputStatus(gateStatus?.data?.status || gateStatus?.status);
  const exists = gateStatus?.exists === true || Boolean(status);
  const isApproval = gateType === 'approval';
  const terminalEvidence = GATE_STATUS_TERMINAL_STATUSES.has(status);
  const outputAuthoritative = output?.isPass === true || output?.isFail === true || output?.invalid_contract === true;

  let code = 'gate_status_absent';
  if (exists && isApproval) code = 'gate_status_approval_wait_evidence';
  else if (exists && outputAuthoritative) code = 'gate_status_diagnostic_shadowed_by_output';
  else if (exists && terminalEvidence) code = 'gate_status_terminal_candidate_requires_canonical_output';
  else if (exists) code = 'gate_status_diagnostic_only';

  return {
    code,
    gate_type: gateType || null,
    status: status || null,
    gate_authority_source: isApproval ? 'approval_wait_lifecycle' : 'gate_output_file',
    gate_status_role: exists
      ? (isApproval ? GATE_STATUS_AUTHORITY_ROLES.APPROVAL_WAIT_EVIDENCE : GATE_STATUS_AUTHORITY_ROLES.DIAGNOSTIC_EVIDENCE)
      : GATE_STATUS_AUTHORITY_ROLES.ABSENT,
    allow_gate_status_completion_authority: false,
    allow_gate_status_scheduler_authority: false,
    allow_approval_wait_sync: isApproval && exists,
    terminal_evidence_candidate: exists && terminalEvidence,
    rate_limit_evidence_candidate: exists && status === 'RATE_LIMITED',
    active_dispatch_confirmed: false,
    requires_canonical_output: !isApproval,
    requires_active_dispatch_for_rate_limit: false,
  };
}

function buildInvalidGateOutput(outPath, reason, extra = {}) {
  return {
    exists: true,
    data: extra.data ?? null,
    isPass: false,
    isFail: false,
    status: null,
    parse_error: extra.parse_error === true,
    invalid_contract: true,
    invalid_reason: reason,
    error: extra.error || null,
    path: outPath,
  };
}


function normalizeGateProjectionStatus({ output = null, gateStatus = null, completion = null, busterCompletion = null } = {}) {
  const normalizedCompletion = completion || busterCompletion || null;
  if (normalizedCompletion?.isPass) {
    return {
      status: 'PASS',
      completed: true,
      completion_source: normalizedCompletion.source || null,
    };
  }

  if (output?.isPass) {
    return {
      status: 'PASS',
      completed: true,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  if (output?.invalid_contract) {
    return {
      status: 'INVALID_OUTPUT',
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  if (output?.isFail) {
    return {
      status: output.status || normalizeGateOutputStatus(output?.data?.status) || 'FAIL',
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  if (normalizedCompletion) {
    return { status: 'PENDING', completed: false, completion_source: null };
  }

  const outputStatus = output?.status || normalizeGateOutputStatus(output?.data?.status);
  if (output?.exists && outputStatus) {
    return {
      status: outputStatus,
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  return { status: 'PENDING', completed: false, completion_source: null };
}

export function projectGateLegacyEvidenceIntoReadModel(config, gateId, gate = null, {
  output = null,
  gateStatus = null,
  completion = null,
  busterCompletion = null,
  approvalState = undefined,
} = {}) {
  if (!gateId) return null;

  if ((gate?.type || '').toLowerCase() === 'approval') {
    const nextApprovalState = approvalState === undefined
      ? gateStatus?.data || null
      : approvalState;
    const projected = syncApprovalWaitState(config, gateId, gate, nextApprovalState);
    const lifecycleGate = getLifecycleGateState(config, gateId) || projected || null;
    if (!lifecycleGate) return null;
    const readModelSource = lifecycleGate.projection_source || READ_MODEL_SOURCE_CANONICAL_EVENTS;
    return {
      ...lifecycleGate,
      completed: lifecycleGate.scheduler_consumed === true,
      completion_source: readModelSource,
      ...buildProjectionSourceFields({
        readModelSource,
        operatorProjectionSource: 'approval_wait_read_model',
        legacyEvidenceSource: nextApprovalState ? LEGACY_GATE_STATUS_EVIDENCE_SOURCE : null,
        completionEvidenceSource: readModelSource,
      }),
    };
  }

  const readModels = loadLifecycleReadModels(config);
  const existing = readModels?.gates?.[gateId] || { gate_id: gateId };
  const normalized = normalizeGateProjectionStatus({
    output,
    gateStatus,
    completion,
    busterCompletion,
  });
  const drift = buildGateSchedulerDrift({
    output,
    gateStatus,
    completion: completion || busterCompletion || null,
  });
  const gateStatusAuthority = buildGateStatusAuthorityPolicy({ gate, gateStatus, output });
  const readModelSource = normalized.completion_source || READ_MODEL_SOURCE_PENDING;

  const nextGate = {
    ...existing,
    gate_id: gateId,
    gate_type: gate?.type || existing.gate_type || null,
    gate_ref: existing.gate_ref || `gate:${gateId}`,
    status: normalized.status,
    completed: normalized.completed,
    scheduler_consumed: normalized.completed === true,
    title: gate?.title || existing.title || null,
    projection_source: readModelSource,
    completion_source: normalized.completion_source || null,
    ...buildProjectionSourceFields({
      readModelSource,
      operatorProjectionSource: 'gate_scheduler_read_model',
      legacyEvidenceSource: gateStatus?.exists === true ? LEGACY_GATE_STATUS_EVIDENCE_SOURCE : null,
      completionEvidenceSource: normalized.completion_source || null,
    }),
    gate_output_exists: output?.exists === true,
    gate_output_status: output?.data?.status || null,
    legacy_gate_status_exists: gateStatus?.exists === true,
    legacy_gate_status: gateStatus?.data?.status || null,
    gate_status_authority: gateStatusAuthority,
    gate_output_path: gateOutputPath(config, gate),
    legacy_gate_status_path: gateStatusPath(config, gateId),
    scheduler_drift: drift,
    scheduler_drift_detected: drift.length > 0,
    latest_event_type: existing.latest_event_type || null,
    latest_event_at: existing.latest_event_at || null,
  };

  readModels.gates[gateId] = nextGate;
  saveLifecycleReadModels(config, readModels);
  return cloneSerializable(nextGate);
}

function projectApprovalGateReadModel(readModels, gateId, gate = null) {
  const gateEntry = readModels?.gates?.[gateId] || null;
  if (!gateEntry) return null;

  const waitEntry = gateEntry.wait_ref ? readModels?.waits?.by_ref?.[gateEntry.wait_ref] || null : null;
  const normalizedTimeoutPolicy = gateEntry.timeout_policy || waitEntry?.timeout_policy || null;
  const timeoutMinutes = gateEntry.timeout_minutes ?? waitEntry?.timeout_minutes ?? null;
  const requestedAt = gateEntry.requested_at || waitEntry?.requested_at || null;
  const deadline = gateEntry.deadline || waitEntry?.deadline || null;

  return {
    gate_id: gateId,
    gate_type: gateEntry.gate_type || gate?.type || 'approval',
    status: gateEntry.status || 'PENDING_APPROVAL',
    run_id: gateEntry.run_id || readModels?.run_id || null,
    project: readModels?.project || null,
    requested_at: requestedAt,
    deadline,
    timeout_minutes: timeoutMinutes,
    timeout_policy: normalizedTimeoutPolicy,
    resolved_at: gateEntry.resolved_at || waitEntry?.closed_at || null,
    decision_by: gateEntry.decision_by || waitEntry?.decision_by || null,
    decision_via: gateEntry.decision_via || waitEntry?.decision_via || null,
    continued: gateEntry.continued ?? null,
    reason: gateEntry.reason || null,
    request_message_ref: gateEntry.request_message_ref ?? waitEntry?.request_message_ref ?? null,
  };
}

export function syncApprovalWaitState(config, gateId, gate = null, state = null) {
  const normalizedState = state && typeof state === 'object'
    ? cloneSerializable(state)
    : null;
  const initialReadModels = loadLifecycleReadModels(config);
  const existingGate = initialReadModels?.gates?.[gateId] || null;

  if (existingGate && existingGate.wait_status === 'CLOSED' && existingGate.status) {
    return projectApprovalGateReadModel(initialReadModels, gateId, gate);
  }

  if (!normalizedState) {
    return existingGate
      ? projectApprovalGateReadModel(initialReadModels, gateId, gate)
      : null;
  }

  const attempt = 1;
  const waitOpenedAt = normalizedState.requested_at || normalizedState.updated_at || normalizedState.resolved_at || new Date().toISOString();
  const pendingState = String(normalizedState.status || '').trim().toUpperCase() === 'PENDING_APPROVAL';

  if (!existingGate || !existingGate.wait_ref) {
    appendWaitLifecycleEvent(config, 'wait.opened', {
      gateId,
      gateType: gate?.type || normalizedState.gate_type || 'approval',
      attempt,
      waitKind: 'approval',
      occurredAt: waitOpenedAt,
      data: {
        wait_kind: 'approval',
        gate_title: gate?.title || normalizedState.gate_title || null,
        requested_at: normalizedState.requested_at || waitOpenedAt,
        deadline: normalizedState.deadline || null,
        timeout_minutes: normalizedState.timeout_minutes ?? null,
        timeout_policy: normalizedState.timeout_policy,
        request_message_ref: normalizedState.request_message_ref ?? null,
        request_artifact_path: normalizedState.request_artifact_path ?? null,
      },
    });
  }

  if (!pendingState) {
    const resolution = deriveApprovalResolutionFromState(normalizedState);
    if (resolution.signalKind) {
      appendWaitLifecycleEvent(config, 'resume_signal.received', {
        gateId,
        gateType: gate?.type || normalizedState.gate_type || 'approval',
        attempt,
        waitKind: 'approval',
        signalKind: resolution.signalKind,
        occurredAt: normalizedState.resolved_at || normalizedState.updated_at || new Date().toISOString(),
        data: {
          signal_kind: resolution.signalKind,
          received_via: normalizedState.decision_via || (resolution.closeReason === 'timed_out' ? 'timeout' : 'openclaw'),
          decision_by: normalizedState.decision_by || null,
          reason: normalizedState.reason || null,
          continued: normalizedState.continued ?? null,
          source_message_ref: normalizedState.request_message_ref ?? null,
        },
      });
      appendWaitLifecycleEvent(config, 'wait.closed', {
        gateId,
        gateType: gate?.type || normalizedState.gate_type || 'approval',
        attempt,
        waitKind: 'approval',
        occurredAt: normalizedState.resolved_at || normalizedState.updated_at || new Date().toISOString(),
        data: {
          close_reason: resolution.closeReason,
          closed_at: normalizedState.resolved_at || normalizedState.updated_at || new Date().toISOString(),
          resolution_kind: resolution.resolutionKind,
          decision_by: normalizedState.decision_by || null,
          decision_via: normalizedState.decision_via || null,
          resume_signal_ref: buildResumeSignalRefs(config, {
            gateId,
            gateType: gate?.type || normalizedState.gate_type || 'approval',
            attempt,
            waitKind: 'approval',
            signalKind: resolution.signalKind,
          }).resume_signal_ref,
        },
      });
    }
  }

  return projectApprovalGateReadModel(loadLifecycleReadModels(config), gateId, gate);
}


function buildGateSchedulerDrift({ output = null, gateStatus = null, completion = null } = {}) {
  const drift = [];
  const gateStatusText = String(gateStatus?.data?.status || '').trim().toUpperCase();
  const outputStatusText = output?.status || String(output?.data?.status || '').trim().toUpperCase();
  if (output?.invalid_contract) {
    drift.push({
      code: 'gate_output_invalid_contract',
      output_path: output.path || null,
      reason: output.invalid_reason || null,
      parse_error: output.parse_error === true,
    });
  }
  if ((gateStatusText === 'PASS' || gateStatusText === 'OK' || gateStatusText === 'APPROVED') && completion?.isPass !== true) {
    drift.push({
      code: 'gate_status_pass_without_canonical_output',
      gate_status: gateStatusText,
      output_exists: output?.exists === true,
      output_status: outputStatusText || null,
    });
  }
  if ((gateStatusText === 'FAIL' || gateStatusText === 'ISSUES_FOUND' || gateStatusText === 'NO-GO') && output?.isFail !== true) {
    drift.push({
      code: 'gate_status_terminal_without_canonical_output',
      gate_status: gateStatusText,
      output_exists: output?.exists === true,
      output_status: outputStatusText || null,
    });
  }
  if (gateStatusText === 'RATE_LIMITED') {
    drift.push({
      code: 'gate_status_rate_limit_requires_active_dispatch',
      gate_status: gateStatusText,
      output_exists: output?.exists === true,
      output_status: outputStatusText || null,
    });
  }
  if (output?.exists === true && outputStatusText && gateStatusText && outputStatusText !== gateStatusText) {
    drift.push({
      code: 'gate_output_status_mismatch',
      output_status: outputStatusText,
      gate_status: gateStatusText,
    });
  }
  return drift;
}

export function readGateOutput(config, gate) {
  if (!gate?.output_file) return { exists: false, data: null, isPass: false, isFail: false, parse_error: false, invalid_contract: false, path: null, status: null };
  const outPath = gateOutputPath(config, gate);
  if (!fs.existsSync(outPath)) return { exists: false, data: null, isPass: false, isFail: false, parse_error: false, invalid_contract: false, path: outPath, status: null };
  let content = '';
  try {
    content = fs.readFileSync(outPath, 'utf8');
  } catch (e) {
    return buildInvalidGateOutput(outPath, 'read_failed', { error: e.message });
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return buildInvalidGateOutput(outPath, 'invalid_json', { parse_error: true, error: e.message });
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return buildInvalidGateOutput(outPath, 'not_object', { data });
  }

  const status = normalizeGateOutputStatus(data.status);
  if (!status) {
    return buildInvalidGateOutput(outPath, 'missing_status', { data });
  }

  if (GATE_OUTPUT_PASS_STATUSES.has(status)) {
    return { exists: true, data, isPass: true, isFail: false, status, parse_error: false, invalid_contract: false, path: outPath };
  }

  if (GATE_OUTPUT_FAIL_STATUSES.has(status)) {
    return { exists: true, data, isPass: false, isFail: true, status, parse_error: false, invalid_contract: false, path: outPath };
  }

  return buildInvalidGateOutput(outPath, 'unknown_status', { data });
}

/**
 * Check if a gate's output file exists (regardless of content).
 * Use readGateOutput for content-aware completion checks.
 */
export function gateOutputExists(config, gate) {
  if (!gate?.output_file) return false;
  return fs.existsSync(gateOutputPath(config, gate));
}

/**
 * Read the legacy gate-status.json diagnostic file.
 * For Buster this is diagnostic only, not scheduler authority.
 *
 * @returns {{ exists: boolean, data: object|null, isPass: boolean }}
 */
export function readGateStatusJson(config, gateId) {
  const gsPath = gateStatusPath(config, gateId);
  if (!fs.existsSync(gsPath)) return { exists: false, data: null, isPass: false, parse_error: false, path: gsPath };
  try {
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    const s = (gs.status || '').toUpperCase();
    return { exists: true, data: gs, isPass: s === 'PASS' || s === 'OK' || s === 'APPROVED', parse_error: false, path: gsPath };
  } catch (e) {
    return { exists: true, data: null, isPass: false, parse_error: true, error: e.message, path: gsPath };
  }
}

export function projectGateCompletionState(config, gateId, gate = null, deps = {}) {
  const output = deps.output || (deps.readGateOutput || readGateOutput)(config, gate);
  const gateStatus = deps.gateStatus || (deps.readGateStatusJson || readGateStatusJson)(config, gateId);
  const gateStatusAuthority = buildGateStatusAuthorityPolicy({ gate, gateStatus, output });

  if (output?.exists) {
    if (output.invalid_contract) {
      const outcome = output.parse_error ? 'parse_error' : 'invalid_contract';
      return {
        done: true,
        ok: false,
        outcome,
        source: GATE_OUTPUT_EVIDENCE_SOURCE,
        status: 'INVALID_OUTPUT',
        data: {
          gate: gateId,
          status: 'INVALID_OUTPUT',
          reason: `Gate output contract invalid: ${output.invalid_reason || 'unknown'}`,
          invalid_reason: output.invalid_reason || null,
          error: output.error || null,
        },
        output,
        gateStatus,
        gateStatusAuthority,
      };
    }
    const data = output.data || { gate: gateId };
    const status = output.status || normalizeGateOutputStatus(data?.status);
    if (GATE_OUTPUT_FAIL_STATUSES.has(status)) {
      return { done: true, ok: false, outcome: 'gate_fail', source: GATE_OUTPUT_EVIDENCE_SOURCE, status: status || 'FAIL', data, output, gateStatus, gateStatusAuthority };
    }
    if (GATE_OUTPUT_PASS_STATUSES.has(status)) {
      return { done: true, ok: true, outcome: 'target_reached', source: GATE_OUTPUT_EVIDENCE_SOURCE, status, data, output, gateStatus, gateStatusAuthority };
    }
    return {
      done: true,
      ok: false,
      outcome: 'invalid_contract',
      source: GATE_OUTPUT_EVIDENCE_SOURCE,
      status: 'INVALID_OUTPUT',
      data: {
        gate: gateId,
        status: 'INVALID_OUTPUT',
        reason: `Gate output contract invalid: unknown_status`,
        invalid_reason: 'unknown_status',
      },
      output,
      gateStatus,
      gateStatusAuthority,
    };
  }

  if (!gateStatus?.exists) {
    return { done: false, ok: false, outcome: 'pending', source: null, status: null, output, gateStatus, gateStatusAuthority, logMsg: 'waiting for output' };
  }

  if (gateStatus.parse_error) {
    return { done: false, ok: false, outcome: 'parse_error', source: LEGACY_GATE_STATUS_EVIDENCE_SOURCE, status: null, output, gateStatus, gateStatusAuthority };
  }

  const data = gateStatus.data || {};
  const status = String(data?.status || '').toUpperCase();
  if (status === 'FAIL' || status === 'ISSUES_FOUND' || status === 'NO-GO') {
    return { done: false, ok: false, outcome: 'candidate_gate_failure', source: LEGACY_GATE_STATUS_EVIDENCE_SOURCE, status, data, output, gateStatus, gateStatusAuthority, logMsg: 'gate-status terminal failure observed, waiting for canonical output_file' };
  }
  if (status === 'RATE_LIMITED') {
    return { done: false, ok: false, outcome: 'candidate_rate_limited', source: LEGACY_GATE_STATUS_EVIDENCE_SOURCE, status, data, output, gateStatus, gateStatusAuthority, logMsg: 'gate-status rate limit observed as diagnostic evidence only; waiting for Redis/completion state' };
  }
  if (status === 'PASS' || status === 'OK') {
    return { done: false, ok: false, outcome: 'pending_canonical_output', source: LEGACY_GATE_STATUS_EVIDENCE_SOURCE, status, data, output, gateStatus, gateStatusAuthority, logMsg: 'gate-status PASS observed, waiting for canonical output_file' };
  }

  return { done: false, ok: false, outcome: 'pending', source: LEGACY_GATE_STATUS_EVIDENCE_SOURCE, status, data, output, gateStatus, gateStatusAuthority, logMsg: `status=${data?.status || 'unknown'}` };
}

/**
 * Read the canonical Buster gate completion signal for resume/scheduler/dependency checks.
 *
 * `output_file` is the only completion authority here. `gate-status.json` remains
 * available as a diagnostic surface, but it no longer advances scheduler truth.
 *
 * @returns {{ isPass: boolean, source: string|null, output: object, gateStatus: object }}
 */
export function readBusterGateCompletion(config, gateId, gate) {
  const output = readGateOutput(config, gate);
  if (output.isPass) {
    return {
      isPass: true,
      source: GATE_OUTPUT_EVIDENCE_SOURCE,
      output,
      gateStatus: { exists: false, data: null, isPass: false },
    };
  }

  const gateStatus = readGateStatusJson(config, gateId);

  return {
    isPass: false,
    source: null,
    output,
    gateStatus,
  };
}

export function readGateCompletionEvidence(config, gateId, gate) {
  return readBusterGateCompletion(config, gateId, gate);
}

export function projectGateSchedulerState(config, gateId, gate = null, deps = {}) {
  const readGateOutputFn = deps.readGateOutput || readGateOutput;
  const readGateStatusJsonFn = deps.readGateStatusJson || readGateStatusJson;
  const readGateCompletionEvidenceFn = deps.readGateCompletionEvidence || readGateCompletionEvidence;
  const output = readGateOutputFn(config, gate);
  const gateStatus = readGateStatusJsonFn(config, gateId);

  return projectGateLegacyEvidenceIntoReadModel(config, gateId, gate, {
    output,
    gateStatus,
    completion: gate?.type === 'approval'
      ? null
      : readGateCompletionEvidenceFn(config, gateId, gate),
    approvalState: gate?.type === 'approval' ? gateStatus?.data || null : undefined,
  });
}
