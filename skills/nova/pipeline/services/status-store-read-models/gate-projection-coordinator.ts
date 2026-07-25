import { gateOutputPath } from "../../core/paths.ts";
import {
  cloneSerializable,
  getLifecycleGateState,
  loadLifecycleReadModels,
  saveLifecycleReadModels,
} from "../status-store-lifecycle.ts";
import {
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from "./common.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  buildGateStatusAuthorityPolicy,
  existingGateReadModel,
  normalizeGateProjectionStatus,
  normalizedLowerText,
  selectPresentValue,
} from "./gate-evidence-projection.ts";
import { syncApprovalWaitState } from "./gate-approval-projection.ts";
import { buildGateSchedulerDrift } from "./gate-output-projection.ts";
import {
  readGateOutput,
  readGateCompletionEvidence,
} from "./gate-output-projection.ts";
const APPROVAL_GATE_TYPE = "approval";

function projectApprovalEvidence(
  config: any,
  gateId: any,
  gate: any,
  approvalState: any,
): any {
  const state = approvalState === undefined ? null : approvalState;
  const projected = syncApprovalWaitState(config, gateId, gate, state);
  const lifecycleGate = getLifecycleGateState(config, gateId) ?? projected;
  if (!lifecycleGate) return null;
  const source =
    lifecycleGate.projection_source ?? READ_MODEL_SOURCE_CANONICAL_EVENTS;
  return {
    ...lifecycleGate,
    completed: lifecycleGate.scheduler_consumed === true,
    completion_source: source,
    ...buildProjectionSourceFields({
      readModelSource: source,
      operatorProjectionSource: "approval_wait_read_model",
      diagnosticEvidenceSource: state ? "approval_state" : null,
      completionEvidenceSource: source,
    }),
  };
}

function buildStandardGate(
  config: any,
  gateId: any,
  gate: any,
  existing: any,
  output: any,
  normalized: any,
  drift: any[],
) {
  const source = normalized.completion_source ?? READ_MODEL_SOURCE_PENDING;
  return {
    ...existing,
    gate_id: gateId,
    gate_type: selectPresentValue(gate?.type, existing.gate_type, null),
    gate_ref: existing.gate_ref ?? `gate:${gateId}`,
    status: normalized.status,
    completed: normalized.completed,
    scheduler_consumed: normalized.completed === true,
    title: selectPresentValue(gate?.title, existing.title, null),
    projection_source: source,
    completion_source: normalized.completion_source ?? null,
    ...buildProjectionSourceFields({
      readModelSource: source,
      operatorProjectionSource: "gate_scheduler_read_model",
      completionEvidenceSource: normalized.completion_source ?? null,
    }),
    gate_output_exists: output?.exists === true,
    gate_output_status: output?.data?.status ?? null,
    gate_status_authority: buildGateStatusAuthorityPolicy({ gate, output }),
    gate_output_path: gateOutputPath(config, gate),
    scheduler_drift: drift,
    scheduler_drift_detected: drift.length > 0,
    latest_event_type: existing.latest_event_type ?? null,
    latest_event_at: existing.latest_event_at ?? null,
  };
}
export function projectGateEvidenceIntoReadModel(
  config: any,
  gateId: any,
  gate: any = null,
  {
    output = null,
    completion = null,
    busterCompletion = null,
    approvalState = undefined,
  }: any = {},
) {
  if (!gateId) return null;
  if (normalizedLowerText(gate?.type) === APPROVAL_GATE_TYPE) {
    return projectApprovalEvidence(config, gateId, gate, approvalState);
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
    completion: selectDefinedValue(
      () =>
        selectDefinedValue(
          () => completion,
          () => busterCompletion,
        ),
      () => null,
    ),
  });
  const nextGate = buildStandardGate(
    config,
    gateId,
    gate,
    existing,
    output,
    normalized,
    drift,
  );

  readModels.gates[gateId] = nextGate;
  saveLifecycleReadModels(config, readModels);
  return cloneSerializable(nextGate);
}
export function projectGateSchedulerState(
  config: any,
  gateId: any,
  gate: any = null,
  deps: any = {},
) {
  const output = readGateOutput(config, gate);

  return projectGateEvidenceIntoReadModel(config, gateId, gate, {
    output,
    completion:
      gate?.type === "approval"
        ? null
        : readGateCompletionEvidence(config, gateId, gate),
    approvalState: gate?.type === "approval" ? deps.approvalState : undefined,
  });
}
