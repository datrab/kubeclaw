import { objectRecord } from "./projection-support.ts";

function pipelineStarted(event: any) {
  return {
    run_id: event.refs.run_id,
    run_ref: event.refs.run_ref,
    status: "RUNNING",
    run_mode: event.data.run_mode,
    resume: event.data.resume,
    requested_module_id: event.data.requested_module_id,
    entrypoint: event.data.entrypoint,
    started_at: event.occurred_at,
    completed_at: null,
    terminal_status: null,
    terminal_decision: null,
    reason_code: null,
    halt_reason: null,
    latest_event_type: event.type,
    lifecycle_version: event.lifecycle_version,
  };
}

function pipelineCompleted(current: any, event: any) {
  return {
    ...(objectRecord(current) ?? {}),
    run_id: event.refs.run_id,
    run_ref: event.refs.run_ref,
    status: "COMPLETED",
    completed_at: event.occurred_at,
    terminal_status: event.data.terminal_status,
    terminal_decision: event.data.terminal_decision,
    reason_code: event.data.reason_code,
    latest_event_type: event.type,
    lifecycle_version: event.lifecycle_version,
  };
}

function pipelineHalted(current: any, event: any) {
  return {
    ...(objectRecord(current) ?? {}),
    run_id: event.refs.run_id,
    run_ref: event.refs.run_ref,
    status: "HALTED",
    completed_at: event.occurred_at,
    terminal_status: event.data.terminal_status,
    terminal_decision: event.data.terminal_decision,
    reason_code: event.data.halt_reason,
    halt_reason: event.data.halt_reason,
    step_type: event.data.step_type,
    step_id: event.data.step_id,
    latest_event_type: event.type,
    lifecycle_version: event.lifecycle_version,
  };
}

export function applyPipelineEvent(next: any, event: any): void {
  if (event.type === "pipeline_run.started")
    next.pipeline = pipelineStarted(event);
  else if (event.type === "pipeline_run.completed")
    next.pipeline = pipelineCompleted(next.pipeline, event);
  else if (event.type === "pipeline_run.halted")
    next.pipeline = pipelineHalted(next.pipeline, event);
}
