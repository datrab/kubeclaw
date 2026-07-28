import {
  appendJsonLine,
  lifecycleEventsPath,
  withLifecycleAppendLock,
} from "./storage.ts";
import { buildLifecycleIdempotencyKey } from "./idempotency.ts";
import {
  loadLifecycleReadModels,
  readLifecycleEvents,
  rebuildLifecycleReadModels,
  saveLifecycleReadModels,
} from "./read-models.ts";
import { ensureLifecycleEventLegal } from "./legality.ts";
import {
  cloneSerializable,
} from "../serialization.ts";
import {
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  objectRecord,
  selectPresent,
} from "../../value-boundary.ts";
export const PIPELINE_RUN_COMPLETED_STATUS = "succeeded";
export const PIPELINE_RUN_COMPLETED_REASON = "PIPELINE_COMPLETE";
export const PIPELINE_RUN_HALTED_REASON = "halted";
export const STALE_RECOVERY_ATTEMPT = 1;
export const STALE_RECOVERY_TARGET_STATUS = "PENDING";
export const STALE_RECOVERY_REASON = "stale recovery";
export const MODULE_READY_FOR_TESTING_STATUS = "READY_FOR_TESTING";
export const MODULE_ATTEMPT_FAILED_REASON = "Module attempt failed";
export const MODULE_LIFECYCLE_PHASE_BUSTER = "buster";
export const MODULE_BLOCKED_REASON = "blocked";
export const MODULE_COMPLETION_PASS_STATUS = "PASS";
export const MODULE_COMPLETION_FAIL_STATUS = "FAIL";
export const MODULE_COMPLETION_BLOCKED_STATUS = "BLOCKED";
export const MODULE_COMPLETION_ERROR_STATUS = "ERROR";
export const GATE_COMPLETION_PASS_STATUS = "PASS";
export const GATE_COMPLETION_BLOCKED_STATUS = "BLOCKED";
export const GATE_COMPLETION_FAIL_STATUS = "FAIL";
export const GATE_COMPLETION_ERROR_STATUS = "ERROR";

export function selectPresentValue(...values: any) {
  return selectPresent(...values);
}

export function eventOccurredAt(value: any) {
  return value !== undefined && value !== null && value !== ""
    ? value
    : new Date().toISOString();
}

export function requiredText(value: any, label: any) {
  if (
    selectTruthyValue(
      () => typeof value !== "string",
      () => !value.trim(),
    )
  )
    throw new Error(`${label} is required for lifecycle event append`);
  return value;
}

export function pipelineProgressModules(progress: any) {
  return objectRecord(progress?.modules);
}

export function pipelineProgressGates(progress: any) {
  return objectRecord(progress?.gates);
}

function proposalData(proposal: any) {
  return objectRecord(proposal?.data);
}
function lifecycleWork(refs: any = {}) {
  if (refs.module_id) return { work_type: "module", work_id: refs.module_id };
  if (refs.gate_id) return { work_type: "gate", work_id: refs.gate_id };
  if (refs.primary_ref?.kind === "pipeline_run")
    return { work_type: "pipeline", work_id: refs.run_id };
  return { work_type: "pipeline_step", work_id: refs.primary_ref?.id };
}
function currentLifecycleState(readModels: any, refs: any = {}) {
  const resolvers = [
    [refs.module_id, () => readModels?.modules?.[refs.module_id]?.status],
    [refs.gate_id, () => readModels?.gates?.[refs.gate_id]?.status],
    [
      refs.primary_ref?.kind === "pipeline_run",
      () => readModels?.pipeline?.status,
    ],
  ] as const;
  for (const [matches, resolve] of resolvers) {
    if (matches) return resolve() ?? null;
  }
  return null;
}
function proposedLifecycleState(proposal: any) {
  const data = proposalData(proposal);
  const implicitStates: Record<string, string> = {
    "pipeline_run.completed": "COMPLETED",
    "pipeline_run.halted": "HALTED",
  };
  return selectPresentValue(
    data.new_state,
    data.new_status,
    data.status,
    data.terminal_status,
    proposal.type.endsWith(".started")
      ? "IN_PROGRESS"
      : implicitStates[proposal.type],
  );
}

function buildLifecycleEvent(
  config: any,
  proposal: any,
  readModels: any,
  idempotencyKey: string,
) {
  const occurredAt = eventOccurredAt(proposal.occurredAt);
  const data = proposalData(proposal);
  return {
    schema_version: "pipeline_lifecycle_event.v1",
    lifecycle_version: "pipeline_lifecycle.v1",
    event_id: `lifecycle_${idempotencyKey}`,
    source_event_id: `lifecycle/${idempotencyKey}`,
    type: proposal.type,
    project: config.project,
    run_id: proposal.refs.run_id,
    occurred_at: occurredAt,
    effective_at: occurredAt,
    recorded_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
    ...lifecycleWork(proposal.refs),
    attempt: proposal.refs?.attempt ?? null,
    previous_state: currentLifecycleState(readModels, proposal.refs),
    new_state: proposedLifecycleState(proposal),
    reason_code: selectPresentValue(
      data.reason_code,
      data.reason,
      data.note,
      proposal.type.toUpperCase().replaceAll(".", "_"),
    ),
    authority: "nova/pipeline/lifecycle-reducer",
    module_id: proposal.refs?.module_id ?? null,
    gate_id: proposal.refs?.gate_id ?? null,
    refs: cloneSerializable(proposal.refs),
    data: cloneSerializable(data),
  };
}

function emitLifecycleEvidence(config: any, event: any) {
  if (typeof config?._emitCanonicalEvidence !== "function") return;
  const payload = {
    lifecycle_version: event.lifecycle_version,
    previous_state: event.previous_state,
    new_state: event.new_state,
    reason_code: event.reason_code,
    effective_at: event.effective_at,
    authority: event.authority,
    module_id: event.module_id,
    gate_id: event.gate_id,
    attempt: event.attempt,
  };
  void Promise.resolve(
    config._emitCanonicalEvidence("lifecycle.transition", payload, {
      sourceEventId: event.source_event_id,
    }),
  );
}

export function appendLifecycleEvent(config: any, proposal: any = {}) {
  if (!proposal?.type) throw new Error("appendLifecycleEvent requires type");
  if (!proposal?.refs?.primary_ref?.id)
    throw new Error("appendLifecycleEvent requires refs.primary_ref.id");
  return withLifecycleAppendLock(config, () => {
    const eventsPath = lifecycleEventsPath(config);
    const readModels = loadLifecycleReadModels(config);
    const idempotencyKey = buildLifecycleIdempotencyKey(
      proposal.type,
      proposal.refs,
      proposalData(proposal),
    );
    const existing = readLifecycleEvents(config).find(
      (entry: any) => entry.idempotency_key === idempotencyKey,
    );
    if (existing) {
      return { record: existing, deduped: true, readModels };
    }

    ensureLifecycleEventLegal(config, readModels, proposal);

    const event = buildLifecycleEvent(
      config,
      proposal,
      readModels,
      idempotencyKey,
    );

    if (!Array.isArray(config._lifecycleEventsCache))
      config._lifecycleEventsCache = [];
    config._lifecycleEventsCache.push(cloneSerializable(event));
    appendJsonLine(eventsPath, event);
    const nextReadModels = saveLifecycleReadModels(
      config,
      rebuildLifecycleReadModels(config),
    );
    emitLifecycleEvidence(config, event);
    return { record: event, deduped: false, readModels: nextReadModels };
  });
}
