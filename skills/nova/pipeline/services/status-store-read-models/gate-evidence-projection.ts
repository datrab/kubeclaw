import fs from "fs";

import { gateOutputPath } from "../../core/paths.ts";
import {
  appendWaitLifecycleEvent,
  buildResumeSignalRefs,
  cloneSerializable,
  deriveApprovalResolutionFromState,
  getLifecycleGateState,
  loadLifecycleReadModels,
  saveLifecycleReadModels,
} from "../status-store-lifecycle.ts";
import {
  GATE_OUTPUT_EVIDENCE_SOURCE,
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from "./common.ts";

import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
export const GATE_STATUS_AUTHORITY_ROLES = Object.freeze({
  DIAGNOSTIC_EVIDENCE: "diagnostic_evidence",
  APPROVAL_WAIT_EVIDENCE: "approval_wait_evidence",
  ABSENT: "absent",
});

export const GATE_OUTPUT_PASS_STATUSES = new Set(["PASS", "OK", "APPROVED"]);
export const GATE_OUTPUT_FAIL_STATUSES = new Set([
  "FAIL",
  "ISSUES_FOUND",
  "BLOCKED",
]);
const GATE_STATUS_TERMINAL_STATUSES = new Set([
  ...GATE_OUTPUT_PASS_STATUSES,
  ...GATE_OUTPUT_FAIL_STATUSES,
]);
export const GATE_OUTPUT_FAIL_STATUS = "FAIL";
const APPROVAL_GATE_TYPE = "approval";
const PENDING_APPROVAL_STATUS = "PENDING_APPROVAL";

function textValue(value: any) {
  return typeof value === "string" ? value : "";
}

export function selectPresentValue(...values: any) {
  return values.find(
    (value: any) => value !== undefined && value !== null && value !== "",
  );
}

export function isoNow() {
  return new Date().toISOString();
}

export function existingGateReadModel(readModels: any, gateId: any) {
  const existing = readModels?.gates?.[gateId];
  return existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing
    : { gate_id: gateId };
}

export function gateOutputStatus(output: any) {
  if (output?.status) return output.status;
  return normalizeGateOutputStatus(output?.data?.status);
}

export function normalizedUpperText(value: any) {
  return textValue(value).trim().toUpperCase();
}

export function normalizedLowerText(value: any) {
  return textValue(value).trim().toLowerCase();
}

export function approvalGateType(gate: any, state: any = null) {
  return selectPresentValue(gate?.type, state?.gate_type, APPROVAL_GATE_TYPE);
}

export function normalizeGateOutputStatus(value: any) {
  return normalizedUpperText(value);
}

function authorityCode(
  exists: boolean,
  approval: boolean,
  output: boolean,
  terminal: boolean,
): string {
  if (!exists) return "gate_status_absent";
  if (approval) return "gate_status_approval_wait_evidence";
  if (output) return "gate_status_diagnostic_shadowed_by_output";
  if (terminal)
    return "gate_status_terminal_candidate_requires_canonical_output";
  return "gate_status_diagnostic_only";
}

function authorityRole(exists: boolean, approval: boolean): string {
  if (!exists) return GATE_STATUS_AUTHORITY_ROLES.ABSENT;
  return approval
    ? GATE_STATUS_AUTHORITY_ROLES.APPROVAL_WAIT_EVIDENCE
    : GATE_STATUS_AUTHORITY_ROLES.DIAGNOSTIC_EVIDENCE;
}

export function buildGateStatusAuthorityPolicy({
  gate = null,
  gateStatus = null,
  output = null,
}: any = {}) {
  const gateRecord = gate ?? {};
  const statusRecord = gateStatus ?? {};
  const statusData = statusRecord.data ?? {};
  const outputRecord = output ?? {};
  const gateType = normalizedLowerText(gateRecord.type);
  const status = statusData.status
    ? normalizeGateOutputStatus(statusData.status)
    : normalizeGateOutputStatus(statusRecord.status);
  const exists = [statusRecord.exists === true, Boolean(status)].includes(true);
  const isApproval = gateType === "approval";
  const terminalEvidence = GATE_STATUS_TERMINAL_STATUSES.has(status);
  const outputAuthoritative = [
    outputRecord.isPass,
    outputRecord.isFail,
    outputRecord.invalid_contract,
  ].some((value: any) => value === true);

  return {
    code: authorityCode(
      exists,
      isApproval,
      outputAuthoritative,
      terminalEvidence,
    ),
    gate_type: selectTruthyValue(
      () => gateType,
      () => null,
    ),
    status: selectTruthyValue(
      () => status,
      () => null,
    ),
    gate_authority_source: isApproval
      ? "approval_wait_lifecycle"
      : "gate_output_file",
    gate_status_role: authorityRole(exists, isApproval),
    allow_gate_status_completion_authority: false,
    allow_gate_status_scheduler_authority: false,
    allow_approval_wait_sync: isApproval && exists,
    terminal_evidence_candidate: exists && terminalEvidence,
    rate_limit_evidence_candidate: exists && status === "RATE_LIMITED",
    active_dispatch_confirmed: false,
    requires_canonical_output: !isApproval,
    requires_active_dispatch_for_rate_limit: false,
  };
}

export function buildInvalidGateOutput(
  outPath: any,
  reason: any,
  extra: any = {},
) {
  return {
    exists: true,
    data: selectDefinedValue(
      () => extra.data,
      () => null,
    ),
    isPass: false,
    isFail: false,
    status: null,
    parse_error: extra.parse_error === true,
    invalid_contract: true,
    invalid_reason: reason,
    error: selectTruthyValue(
      () => extra.error,
      () => null,
    ),
    path: outPath,
  };
}

export function normalizeGateProjectionStatus({
  output = null,
  completion = null,
  busterCompletion = null,
}: any = {}) {
  const normalizedCompletion = selectDefinedValue(
    () => completion,
    () => busterCompletion ?? null,
  );
  const result = normalizedCompletion ?? {};
  const gateOutput = output ?? {};
  if (result.isPass) {
    return {
      status: "PASS",
      completed: true,
      completion_source: selectDefinedValue(
        () => result.source,
        () => null,
      ),
    };
  }

  if (gateOutput.isPass) {
    return {
      status: "PASS",
      completed: true,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  if (gateOutput.invalid_contract) {
    return {
      status: "INVALID_OUTPUT",
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  if (gateOutput.isFail) {
    return {
      status: selectPresentValue(
        gateOutput.status,
        normalizeGateOutputStatus((gateOutput.data ?? {}).status),
        GATE_OUTPUT_FAIL_STATUS,
      ),
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  if (normalizedCompletion) {
    return { status: "PENDING", completed: false, completion_source: null };
  }

  const outputStatus = gateOutputStatus(gateOutput);
  if (gateOutput.exists && outputStatus) {
    return {
      status: outputStatus,
      completed: false,
      completion_source: GATE_OUTPUT_EVIDENCE_SOURCE,
    };
  }

  return { status: "PENDING", completed: false, completion_source: null };
}
