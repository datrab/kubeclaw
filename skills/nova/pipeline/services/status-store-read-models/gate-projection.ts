import fs from 'fs';

import { gateOutputPath } from '../../core/paths.ts';
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
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from './common.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
export const GATE_STATUS_AUTHORITY_ROLES = Object.freeze({
  DIAGNOSTIC_EVIDENCE: 'diagnostic_evidence',
  APPROVAL_WAIT_EVIDENCE: 'approval_wait_evidence',
  ABSENT: 'absent',
});

const GATE_OUTPUT_PASS_STATUSES = new Set(['PASS', 'OK', 'APPROVED']);
const GATE_OUTPUT_FAIL_STATUSES = new Set(['FAIL', 'ISSUES_FOUND', 'BLOCKED']);
const GATE_STATUS_TERMINAL_STATUSES = new Set([...GATE_OUTPUT_PASS_STATUSES, ...GATE_OUTPUT_FAIL_STATUSES]);
const GATE_OUTPUT_FAIL_STATUS = 'FAIL';
const APPROVAL_GATE_TYPE = 'approval';
const PENDING_APPROVAL_STATUS = 'PENDING_APPROVAL';

function textValue(value) {
  return typeof value === 'string' ? value : '';
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function isoNow() {
  return new Date().toISOString();
}

function existingGateReadModel(readModels, gateId) {
  const existing = readModels?.gates?.[gateId];
  return existing && typeof existing === 'object' && !Array.isArray(existing)
    ? existing
    : { gate_id: gateId };
}

function gateOutputStatus(output) {
  if (output?.status) return output.status;
  return normalizeGateOutputStatus(output?.data?.status);
}

function normalizedUpperText(value) {
  return textValue(value).trim().toUpperCase();
}

function normalizedLowerText(value) {
  return textValue(value).trim().toLowerCase();
}

function approvalGateType(gate, state = null) {
  return selectPresentValue(gate?.type, state?.gate_type, APPROVAL_GATE_TYPE);
}

function normalizeGateOutputStatus(value) {
  return normalizedUpperText(value);
}

export function buildGateStatusAuthorityPolicy({
  gate = null,
  gateStatus = null,
  output = null,
} = {}) {
  const gateType = normalizedLowerText(gate?.type);
  const status = gateStatus?.data?.status
    ? normalizeGateOutputStatus(gateStatus.data.status)
    : normalizeGateOutputStatus(gateStatus?.status);
  const exists = gateStatus?.exists === true ? true : Boolean(status);
  const isApproval = gateType === 'approval';
  const terminalEvidence = GATE_STATUS_TERMINAL_STATUSES.has(status);
  const outputAuthoritative = [output?.isPass, output?.isFail, output?.invalid_contract].some((value) => value === true);

  let code = 'gate_status_absent';
  if (exists && isApproval) code = 'gate_status_approval_wait_evidence';
  else if (exists && outputAuthoritative) code = 'gate_status_diagnostic_shadowed_by_output';
  else if (exists && terminalEvidence) code = 'gate_status_terminal_candidate_requires_canonical_output';
  else if (exists) code = 'gate_status_diagnostic_only';

  return {
    code,
    gate_type: selectTruthyValue(() => (gateType), () => (null)),
    status: selectTruthyValue(() => (status), () => (null)),
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
    data: selectDefinedValue(() => (extra.data), () => (null)),
    isPass: false,
    isFail: false,
    status: null,
    parse_error: extra.parse_error === true,
    invalid_contract: true,
    invalid_reason: reason,
    error: selectTruthyValue(() => (extra.error), () => (null)),
    path: outPath,
  };
}


function normalizeGateProjectionStatus({ output = null, completion = null, busterCompletion = null } = {}) {
  const normalizedCompletion = selectDefinedValue(() => (selectDefinedValue(() => (completion), () => (busterCompletion))), () => (null));
  if (normalizedCompletion?.isPass) {
    return {
      status: 'PASS',
      completed: true,
      completion_source: selectDefinedValue(() => (normalizedCompletion.source), () => (null)),
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
      status: selectPresentValue(output.status, normalizeGateOutputStatus(output?.data?.status), GATE_OUTPUT_FAIL_STATUS),
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  if (normalizedCompletion) {
    return { status: 'PENDING', completed: false, completion_source: null };
  }

  const outputStatus = gateOutputStatus(output);
  if (output?.exists && outputStatus) {
    return {
      status: outputStatus,
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  return { status: 'PENDING', completed: false, completion_source: null };
}

export function projectGateEvidenceIntoReadModel(config, gateId, gate = null, {
  output = null,
  completion = null,
  busterCompletion = null,
  approvalState = undefined,
} = {}) {
  if (!gateId) return null;

  if (normalizedLowerText(gate?.type) === APPROVAL_GATE_TYPE) {
    const nextApprovalState = approvalState === undefined
      ? null
      : approvalState;
    const projected = syncApprovalWaitState(config, gateId, gate, nextApprovalState);
    const lifecycleGate = selectTruthyValue(() => (selectTruthyValue(() => (getLifecycleGateState(config, gateId)), () => (projected))), () => (null));
    if (!lifecycleGate) return null;
    const readModelSource = selectDefinedValue(() => (lifecycleGate.projection_source), () => (READ_MODEL_SOURCE_CANONICAL_EVENTS));
    return {
      ...lifecycleGate,
      completed: lifecycleGate.scheduler_consumed === true,
      completion_source: readModelSource,
      ...buildProjectionSourceFields({
        readModelSource,
        operatorProjectionSource: 'approval_wait_read_model',
        diagnosticEvidenceSource: nextApprovalState ? 'approval_state' : null,
        completionEvidenceSource: readModelSource,
      }),
    };
  }

  const readModels = loadLifecycleReadModels(config);
  const existing = existingGateReadModel(readModels, gateId);
  const normalized = normalizeGateProjectionStatus({
    output,
    completion,
    busterCompletion,
  });
  const drift = buildGateSchedulerDrift({
    output,
    completion: selectDefinedValue(() => (selectDefinedValue(() => (completion), () => (busterCompletion))), () => (null)),
  });
  const readModelSource = selectDefinedValue(() => (normalized.completion_source), () => (READ_MODEL_SOURCE_PENDING));

  const nextGate = {
    ...existing,
    gate_id: gateId,
    gate_type: selectPresentValue(gate?.type, existing.gate_type, null),
    gate_ref: selectDefinedValue(() => (existing.gate_ref), () => (`gate:${gateId}`)),
    status: normalized.status,
    completed: normalized.completed,
    scheduler_consumed: normalized.completed === true,
    title: selectPresentValue(gate?.title, existing.title, null),
    projection_source: readModelSource,
    completion_source: selectDefinedValue(() => (normalized.completion_source), () => (null)),
    ...buildProjectionSourceFields({
      readModelSource,
      operatorProjectionSource: 'gate_scheduler_read_model',
      completionEvidenceSource: selectDefinedValue(() => (normalized.completion_source), () => (null)),
    }),
    gate_output_exists: output?.exists === true,
    gate_output_status: selectDefinedValue(() => (output?.data?.status), () => (null)),
    gate_status_authority: buildGateStatusAuthorityPolicy({ gate, output }),
    gate_output_path: gateOutputPath(config, gate),
    scheduler_drift: drift,
    scheduler_drift_detected: drift.length > 0,
    latest_event_type: selectDefinedValue(() => (existing.latest_event_type), () => (null)),
    latest_event_at: selectDefinedValue(() => (existing.latest_event_at), () => (null)),
  };

  readModels.gates[gateId] = nextGate;
  saveLifecycleReadModels(config, readModels);
  return cloneSerializable(nextGate);
}

function projectApprovalGateReadModel(readModels, gateId, gate = null) {
  const gateEntry = selectTruthyValue(() => (readModels?.gates?.[gateId]), () => (null));
  if (!gateEntry) return null;

  const waitEntry = gateEntry.wait_ref ? selectDefinedValue(() => (readModels?.waits?.by_ref?.[gateEntry.wait_ref]), () => (null)) : null;
  const normalizedTimeoutPolicy = selectDefinedValue(() => (selectDefinedValue(() => (gateEntry.timeout_policy), () => (waitEntry?.timeout_policy))), () => (null));
  const timeoutMinutes = selectDefinedValue(() => (gateEntry.timeout_minutes), () => (null));
  const requestedAt = selectDefinedValue(() => (selectDefinedValue(() => (gateEntry.requested_at), () => (waitEntry?.requested_at))), () => (null));
  const deadline = selectDefinedValue(() => (selectDefinedValue(() => (gateEntry.deadline), () => (waitEntry?.deadline))), () => (null));

  return {
    gate_id: gateId,
    gate_type: selectPresentValue(gateEntry.gate_type, gate?.type, APPROVAL_GATE_TYPE),
    status: selectPresentValue(gateEntry.status, PENDING_APPROVAL_STATUS),
    run_id: selectDefinedValue(() => (selectDefinedValue(() => (gateEntry.run_id), () => (readModels?.run_id))), () => (null)),
    project: selectDefinedValue(() => (readModels?.project), () => (null)),
    requested_at: requestedAt,
    deadline,
    timeout_minutes: timeoutMinutes,
    timeout_policy: normalizedTimeoutPolicy,
    resolved_at: selectDefinedValue(() => (selectDefinedValue(() => (gateEntry.resolved_at), () => (waitEntry?.closed_at))), () => (null)),
    decision_by: selectDefinedValue(() => (selectDefinedValue(() => (gateEntry.decision_by), () => (waitEntry?.decision_by))), () => (null)),
    decision_via: selectDefinedValue(() => (selectDefinedValue(() => (gateEntry.decision_via), () => (waitEntry?.decision_via))), () => (null)),
    continued: selectDefinedValue(() => (gateEntry.continued), () => (null)),
    reason: selectDefinedValue(() => (gateEntry.reason), () => (null)),
    request_message_ref: selectDefinedValue(() => (gateEntry.request_message_ref), () => (null)),
  };
}

export function syncApprovalWaitState(config, gateId, gate = null, state = null) {
  const normalizedState = state && typeof state === 'object'
    ? cloneSerializable(state)
    : null;
  const initialReadModels = loadLifecycleReadModels(config);
  const existingGate = selectDefinedValue(() => (initialReadModels?.gates?.[gateId]), () => (null));

  if (existingGate && existingGate.wait_status === 'CLOSED' && existingGate.status) {
    return projectApprovalGateReadModel(initialReadModels, gateId, gate);
  }

  if (!normalizedState) {
    return existingGate
      ? projectApprovalGateReadModel(initialReadModels, gateId, gate)
      : null;
  }

  const attempt = 1;
  const waitOpenedAt = selectPresentValue(normalizedState.requested_at, normalizedState.updated_at, normalizedState.resolved_at, isoNow());
  const pendingState = normalizedUpperText(normalizedState.status) === PENDING_APPROVAL_STATUS;

  if (selectTruthyValue(() => (!existingGate), () => (!existingGate.wait_ref))) {
    appendWaitLifecycleEvent(config, 'wait.opened', {
      gateId,
      gateType: approvalGateType(gate, normalizedState),
      attempt,
      waitKind: 'approval',
      occurredAt: waitOpenedAt,
      data: {
        wait_kind: 'approval',
        gate_title: selectPresentValue(gate?.title, normalizedState.gate_title, null),
        requested_at: selectDefinedValue(() => (normalizedState.requested_at), () => (waitOpenedAt)),
        deadline: selectDefinedValue(() => (normalizedState.deadline), () => (null)),
        timeout_minutes: selectDefinedValue(() => (normalizedState.timeout_minutes), () => (null)),
        timeout_policy: normalizedState.timeout_policy,
        request_message_ref: selectDefinedValue(() => (normalizedState.request_message_ref), () => (null)),
        request_artifact_path: selectDefinedValue(() => (normalizedState.request_artifact_path), () => (null)),
      },
    });
  }

  if (!pendingState) {
    const resolution = deriveApprovalResolutionFromState(normalizedState);
    if (resolution.signalKind) {
      appendWaitLifecycleEvent(config, 'resume_signal.received', {
        gateId,
        gateType: approvalGateType(gate, normalizedState),
        attempt,
        waitKind: 'approval',
        signalKind: resolution.signalKind,
        occurredAt: selectPresentValue(normalizedState.resolved_at, normalizedState.updated_at, isoNow()),
        data: {
          signal_kind: resolution.signalKind,
          received_via: selectDefinedValue(() => (normalizedState.decision_via), () => ((resolution.closeReason === 'timed_out' ? 'timeout' : 'openclaw'))),
          decision_by: selectDefinedValue(() => (normalizedState.decision_by), () => (null)),
          reason: selectDefinedValue(() => (normalizedState.reason), () => (null)),
          continued: selectDefinedValue(() => (normalizedState.continued), () => (null)),
          source_message_ref: selectDefinedValue(() => (normalizedState.request_message_ref), () => (null)),
        },
      });
      appendWaitLifecycleEvent(config, 'wait.closed', {
        gateId,
        gateType: approvalGateType(gate, normalizedState),
        attempt,
        waitKind: 'approval',
        occurredAt: selectPresentValue(normalizedState.resolved_at, normalizedState.updated_at, isoNow()),
        data: {
          close_reason: resolution.closeReason,
          closed_at: selectPresentValue(normalizedState.resolved_at, normalizedState.updated_at, isoNow()),
          resolution_kind: resolution.resolutionKind,
          decision_by: selectDefinedValue(() => (normalizedState.decision_by), () => (null)),
          decision_via: selectDefinedValue(() => (normalizedState.decision_via), () => (null)),
          resume_signal_ref: buildResumeSignalRefs(config, {
            gateId,
            gateType: approvalGateType(gate, normalizedState),
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


function buildGateSchedulerDrift({ output = null, completion = null } = {}) {
  void completion;
  const drift = [];
  if (output?.invalid_contract) {
    drift.push({
      code: 'gate_output_invalid_contract',
      output_path: selectDefinedValue(() => (output.path), () => (null)),
      reason: selectDefinedValue(() => (output.invalid_reason), () => (null)),
      parse_error: output.parse_error === true,
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

  if (selectTruthyValue(() => (selectTruthyValue(() => (!data), () => (typeof data !== 'object'))), () => (Array.isArray(data)))) {
    return buildInvalidGateOutput(outPath, 'not_object', { data });
  }

  const status = normalizeGateOutputStatus(data.status);
  if (!status) {
    return buildInvalidGateOutput(outPath, 'missing_gate_output_status', { data });
  }

  if (GATE_OUTPUT_PASS_STATUSES.has(status)) {
    return { exists: true, data, isPass: true, isFail: false, status, parse_error: false, invalid_contract: false, path: outPath };
  }

  if (GATE_OUTPUT_FAIL_STATUSES.has(status)) {
    return { exists: true, data, isPass: false, isFail: true, status, parse_error: false, invalid_contract: false, path: outPath };
  }

  return buildInvalidGateOutput(outPath, 'unsupported_gate_output_status', { data });
}

/**
 * Check if a gate's output file exists (regardless of content).
 * Use readGateOutput for content-aware completion checks.
 */
export function gateOutputExists(config, gate) {
  if (!gate?.output_file) return false;
  return fs.existsSync(gateOutputPath(config, gate));
}

export function projectGateCompletionState(config, gateId, gate = null) {
  const output = readGateOutput(config, gate);
  const gateStatusAuthority = buildGateStatusAuthorityPolicy({ gate, output });

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
          reason: `Gate output contract invalid: ${selectDefinedValue(() => (output.invalid_reason), () => ('missing_invalid_reason'))}`,
          invalid_reason: selectDefinedValue(() => (output.invalid_reason), () => (null)),
          error: selectDefinedValue(() => (output.error), () => (null)),
        },
        output,
        gateStatusAuthority,
      };
    }
    const data = selectDefinedValue(() => (output.data), () => ({ gate: gateId }));
    const status = gateOutputStatus(output);
    if (GATE_OUTPUT_FAIL_STATUSES.has(status)) {
      return { done: true, ok: false, outcome: 'verdict_fail', source: GATE_OUTPUT_EVIDENCE_SOURCE, status: selectPresentValue(status, GATE_OUTPUT_FAIL_STATUS), data, output, gateStatusAuthority };
    }
    if (GATE_OUTPUT_PASS_STATUSES.has(status)) {
      return { done: true, ok: true, outcome: 'target_reached', source: GATE_OUTPUT_EVIDENCE_SOURCE, status, data, output, gateStatusAuthority };
    }
    const invalidReason = status ? 'unsupported_gate_output_status' : 'missing_gate_output_status';
    const invalidStatusReason = status
      ? `Gate output contract invalid: unsupported status '${status}'`
      : 'Gate output contract invalid: missing status';
    return {
      done: true,
      ok: false,
      outcome: 'invalid_contract',
      source: GATE_OUTPUT_EVIDENCE_SOURCE,
      status: 'INVALID_OUTPUT',
      data: {
        gate: gateId,
        status: 'INVALID_OUTPUT',
        reason: invalidStatusReason,
        invalid_reason: invalidReason,
        observed_status: selectTruthyValue(() => (status), () => (null)),
      },
      output,
      gateStatusAuthority,
    };
  }

  return { done: false, ok: false, outcome: 'pending', source: null, status: null, output, gateStatusAuthority, logMsg: 'waiting for output' };
}

/**
 * Read the canonical Buster gate completion signal for resume/scheduler/dependency checks.
 *
 * `output_file` is the only completion authority here.
 *
 * @returns {{ isPass: boolean, source: string|null, output: object }}
 */
export function readBusterGateCompletion(config, gateId, gate) {
  void gateId;
  const output = readGateOutput(config, gate);
  if (output.isPass) {
    return {
      isPass: true,
      source: GATE_OUTPUT_EVIDENCE_SOURCE,
      output,
    };
  }

  return {
    isPass: false,
    source: null,
    output,
  };
}

export function readGateCompletionEvidence(config, gateId, gate) {
  return readBusterGateCompletion(config, gateId, gate);
}

export function projectGateSchedulerState(config, gateId, gate = null, deps = {}) {
  const output = readGateOutput(config, gate);

  return projectGateEvidenceIntoReadModel(config, gateId, gate, {
    output,
    completion: gate?.type === 'approval'
      ? null
      : readGateCompletionEvidence(config, gateId, gate),
    approvalState: gate?.type === 'approval' ? deps.approvalState : undefined,
  });
}
