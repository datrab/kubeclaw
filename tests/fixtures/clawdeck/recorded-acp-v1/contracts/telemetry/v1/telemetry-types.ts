// Generated from contracts/telemetry/v1 JSON Schemas. Do not edit.
export type TelemetryEventType =
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.halted"
  | "module.started"
  | "module.status_changed"
  | "phase.started"
  | "phase.completed"
  | "retry.scheduled"
  | "retry.exhausted"
  | "system.io_warning"
  | "summary.started"
  | "summary.completed"
  | "gate.started"
  | "gate.verdict"
  | "agent.spawn.requested"
  | "agent.spawned"
  | "agent.delivery.target"
  | "agent.killed"
  | "agent.ended"
  | "agent.llm.input.summary"
  | "agent.llm.output.summary"
  | "agent.tool.started"
  | "agent.tool.finished"
  | "agent.model.started"
  | "agent.model.ended"
  | "agent.session.started"
  | "agent.session.ended"
  | "agent.transcript"
  | "agent.progress"
  | "cost.update"
  | "rate_limit.detected"
  | "observability.degraded"
  | "observability.restored"
  | "error.escalation"
  | "approval.requested"
  | "approval.resolved"
  | "budget.warning"
  | "budget.exceeded"
  | "plugin.event"
  | "artifact.published"
  | "lifecycle.transition"
  | "lifecycle.snapshot"
  | "producer.health"
  | "terminal.closure"
  | "runtime.log"
  | "git.evidence"
  | "quality.evidence"
  | "infrastructure.evidence"
  | "evaluation.fact"
  | "command.requested"
  | "command.accepted"
  | "command.rejected"
  | "command.completed";
export interface PipelineStartedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "execution_order": Array<unknown>;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gates": Array<unknown>;
  "manifest_fingerprint"?: string;
  "manifest_reference"?: string;
  "model_call_id"?: string | null;
  "models"?: Record<string, unknown> | null;
  "module_id"?: string | null;
  "modules": Array<unknown>;
  "nova_prompt"?: string | null;
  "resume": boolean;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface PipelineCompletedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "modules_failed"?: number | null;
  "modules_passed"?: number | null;
  "modules_total"?: number | null;
  "reason_code"?: string | null;
  "session_key"?: string | null;
  "terminal_status": string;
  "tool_call_id"?: string | null;
  "total_cost_usd"?: number | null;
}

export interface PipelineHaltedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "max_rate_limit_pauses"?: number | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "rate_limit_exhausted"?: boolean | null;
  "reason": string;
  "session_key"?: string | null;
  "step_id"?: string | null;
  "step_type"?: string | null;
  "terminal_decision"?: Record<string, unknown> | null;
  "terminal_status"?: string | null;
  "tool_call_id"?: string | null;
}

export interface ModuleStartedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id": string;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface ModuleStatusChangedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "commit_hash"?: string | null;
  "content_completeness"?: string;
  "cost_estimate_usd"?: number | null;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id": string;
  "new_status"?: string | null;
  "old_status"?: string | null;
  "phase"?: string | null;
  "reason"?: string | null;
  "session_key"?: string | null;
  "title"?: string | null;
  "tool_call_id"?: string | null;
}

export interface PhaseStartedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id": string;
  "phase": string;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface PhaseCompletedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id": string;
  "phase": string;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface RetryScheduledPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "delay_seconds"?: number | null;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "max_attempts"?: number | null;
  "max_fails"?: number | null;
  "model_call_id"?: string | null;
  "module_id": string;
  "reason"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface RetryExhaustedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "max_attempts"?: number | null;
  "max_fails"?: number | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "phase"?: string | null;
  "reason"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface SystemIoWarningPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "code"?: string | null;
  "component": string;
  "content_completeness"?: string;
  "detail"?: string | null;
  "dispatch_id"?: string | null;
  "errno"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "operation": string;
  "path": string;
  "path_role"?: string | null;
  "reason": string;
  "session_key"?: string | null;
  "surface": string;
  "syscall"?: string | null;
  "tool_call_id"?: string | null;
  "warning_at"?: string | null;
}

export interface SummaryStartedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "output_dir"?: string | null;
  "reason_code"?: string | null;
  "runtime"?: string | null;
  "session_key"?: string | null;
  "status"?: string | null;
  "summary_type": string;
  "terminal_decision"?: Record<string, unknown> | null;
  "terminal_status"?: string | null;
  "tool_call_id"?: string | null;
}

export interface SummaryCompletedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "case_study_base_path"?: string | null;
  "content_completeness"?: string;
  "data_path"?: string | null;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "latest_json_path"?: string | null;
  "markdown_path"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "output"?: string | null;
  "output_dir"?: string | null;
  "output_path"?: string | null;
  "pipeline_summary_path"?: string | null;
  "reason"?: string | null;
  "reason_code"?: string | null;
  "runtime"?: string | null;
  "session_key"?: string | null;
  "status"?: string | null;
  "summary_json_path"?: string | null;
  "summary_type": string;
  "terminal_decision"?: Record<string, unknown> | null;
  "terminal_status"?: string | null;
  "tool_call_id"?: string | null;
}

export interface GateStartedPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id": string;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "reviewers"?: Array<unknown> | Record<string, unknown>;
  "session_key"?: string | null;
  "title"?: string | null;
  "tool_call_id"?: string | null;
}

export interface GateVerdictPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "blockers_count"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "fix_cycle"?: number | null;
  "gate_id": string;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "issues_count"?: number | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "reason"?: string | null;
  "run_id"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
  "verdict": "PASS" | "FAIL";
}

export interface AgentSpawnRequestedPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "child_run_id"?: string | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "expects_completion_message"?: boolean | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "mode"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "requested_at"?: string | null;
  "requester_origin"?: Record<string, unknown> | null;
  "requester_session_key"?: string | null;
  "session_key"?: string | null;
  "spawn_mode"?: string | null;
  "thread"?: boolean | null;
  "tool_call_id"?: string | null;
}

export interface AgentSpawnedPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch"?: string | null;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "label"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_key"?: string | null;
  "substep"?: string | null;
  "thinking_level"?: string | null;
  "timeout_minutes"?: number | null;
  "tool_call_id"?: string | null;
}

export interface AgentDeliveryTargetPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "child_run_id"?: string | null;
  "child_session_key"?: string | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "expects_completion_message"?: boolean | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "requester_origin"?: Record<string, unknown> | null;
  "requester_session_key"?: string | null;
  "session_key"?: string | null;
  "spawn_mode"?: string | null;
  "targeted_at"?: string | null;
  "tool_call_id"?: string | null;
}

export interface AgentKilledPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "files_changed"?: Array<string> | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "has_changes"?: boolean | null;
  "label"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "reason"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface AgentEndedPayload {
  "agent_id"?: string | null;
  "agent_scope"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "ended_at"?: string | null;
  "error"?: Record<string, unknown> | null;
  "error_message"?: string | null;
  "final_message_count"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "label"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "outcome"?: string | null;
  "reason"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface AgentLlmInputSummaryPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "history_message_count"?: number | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "prompt_chars"?: number | null;
  "provider"?: string | null;
  "request"?: Record<string, unknown> | null;
  "session_key"?: string | null;
  "system_prompt_chars"?: number | null;
  "tool_call_id"?: string | null;
}

export interface AgentLlmOutputSummaryPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "assistant_response_chars"?: number | null;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "history_message_count"?: number | null;
  "input_tokens"?: number | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "output_tokens"?: number | null;
  "provider"?: string | null;
  "response_chars"?: number | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
  "usage"?: Record<string, unknown> | null;
}

export interface AgentToolStartedPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt": number;
  "content_completeness": string;
  "dispatch_id": string;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model_call_id": string;
  "module_id": string;
  "param_keys"?: Array<string> | null;
  "params_bytes"?: number | null;
  "session_key": string;
  "tool_call_id": string;
  "tool_name": string;
}

export interface AgentToolFinishedPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt": number;
  "content_completeness": string;
  "dispatch_id": string;
  "duration_seconds"?: number | null;
  "error": Record<string, unknown> | null;
  "error_message"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model_call_id": string;
  "module_id": string;
  "outcome": string;
  "reason"?: string | null;
  "result_bytes": number;
  "session_key": string;
  "tool_call_id": string;
  "tool_name": string;
}

export interface AgentModelStartedPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "provider"?: string | null;
  "request"?: Record<string, unknown> | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface AgentModelEndedPayload {
  "status"?: string | null;
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "cost_usd"?: number | null;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "error"?: Record<string, unknown> | null;
  "error_message"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "input_tokens"?: number | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "outcome"?: string | null;
  "output_tokens"?: number | null;
  "provider"?: string | null;
  "reason"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
  "usage"?: Record<string, unknown> | null;
}

export interface AgentSessionStartedPayload {
  "label"?: string | null;
  "transcript_reference"?: string | null;
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_id"?: string | null;
  "session_key"?: string | null;
  "started_at"?: string | null;
  "tool_call_id"?: string | null;
}

export interface AgentSessionEndedPayload {
  "transcript_reference"?: string | null;
  "status"?: string | null;
  "runtime_ms"?: number | null;
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "ended_at"?: string | null;
  "error"?: Record<string, unknown> | null;
  "error_message"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "outcome"?: string | null;
  "reason"?: string | null;
  "session_id"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface AgentTranscriptPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "label"?: string | null;
  "line_count"?: number | null;
  "line_kind"?: string;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_key"?: string | null;
  "text"?: string;
  "tool_call_id"?: string | null;
  "transcript_offset"?: number | null;
}

export interface AgentProgressPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "elapsed_seconds"?: number | null;
  "files_touched"?: Array<unknown> | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "label"?: string | null;
  "last_activity"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_key"?: string | null;
  "status"?: string;
  "tool_call_id"?: string | null;
  "transcript_events"?: number | null;
}

export interface CostUpdatePayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "cost_usd"?: number | null;
  "cumulative_cost_usd"?: number | null;
  "dispatch_id"?: string | null;
  "estimated_cost_usd"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "input_tokens"?: number | null;
  "label"?: string | null;
  "model"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "output_tokens"?: number | null;
  "session_key"?: string | null;
  "tokens_in"?: number | null;
  "tokens_out"?: number | null;
  "tool_call_id"?: string | null;
  "total_cost_usd"?: number | null;
}

export interface RateLimitDetectedPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "cooldown_ms"?: number | null;
  "cooldown_source"?: string | null;
  "detail"?: string | null;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "max_pauses"?: number | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "pause_count"?: number | null;
  "provider"?: string | null;
  "resume_at"?: string | null;
  "retry_after_seconds"?: number | null;
  "run_id"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface ObservabilityDegradedPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "authorization"?: string | null;
  "component": string;
  "content_completeness"?: string;
  "degraded_at"?: string | null;
  "detail"?: string | null;
  "dispatch_id"?: string | null;
  "error"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "hook_id"?: string | null;
  "impacted_event_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "payload"?: Record<string, unknown> | null;
  "reason": string;
  "session_key"?: string | null;
  "stage_id"?: string | null;
  "stdout"?: string | null;
  "stream_key"?: string | null;
  "surface": string;
  "tool_call_id"?: string | null;
  "transcript"?: Array<unknown> | Record<string, unknown> | null;
  "validation_errors"?: Array<unknown> | null;
}

export interface ObservabilityRestoredPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "authorization"?: string | null;
  "component": string;
  "content_completeness"?: string;
  "degraded_at"?: string | null;
  "detail"?: string | null;
  "dispatch_id"?: string | null;
  "error"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "hook_id"?: string | null;
  "impacted_event_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "payload"?: Record<string, unknown> | null;
  "reason": string;
  "restored_after_ms"?: number | null;
  "restored_at"?: string | null;
  "session_key"?: string | null;
  "stage_id"?: string | null;
  "stdout"?: string | null;
  "stream_key"?: string | null;
  "surface": string;
  "tool_call_id"?: string | null;
  "transcript"?: Array<unknown> | Record<string, unknown> | null;
  "validation_errors"?: Array<unknown> | null;
}

export interface ErrorEscalationPayload {
  "action"?: string | null;
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "fail_count"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "last_failure"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_key"?: string | null;
  "step_id"?: string | null;
  "step_type"?: string | null;
  "terminal_decision"?: Record<string, unknown> | null;
  "terminal_status"?: string | null;
  "tool_call_id"?: string | null;
}

export interface ApprovalRequestedPayload {
  "agent_id"?: string | null;
  "approval_id": string;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_title"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "options": Array<unknown>;
  "prompt": string;
  "session_key"?: string | null;
  "timeout_minutes"?: number | null;
  "timeout_policy"?: unknown;
  "tool_call_id"?: string | null;
}

export interface ApprovalResolvedPayload {
  "agent_id"?: string | null;
  "approval_id": string;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "choice"?: string | null;
  "content_completeness"?: string;
  "decision_by"?: string | null;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "resolved_by"?: string | null;
  "session_key"?: string | null;
  "status"?: string | null;
  "tool_call_id"?: string | null;
}

export interface BudgetWarningPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "budget_usd"?: number | null;
  "content_completeness"?: string;
  "current": number;
  "current_cost_usd"?: number | null;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "limit": number;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "percent_used"?: number | null;
  "session_key"?: string | null;
  "threshold": unknown;
  "tool_call_id"?: string | null;
  "unit": string;
}

export interface BudgetExceededPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "budget_usd"?: number | null;
  "content_completeness"?: string;
  "current": number;
  "current_cost_usd"?: number | null;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "limit": number;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "percent_used"?: number | null;
  "session_key"?: string | null;
  "threshold": unknown;
  "tool_call_id"?: string | null;
  "unit": string;
}

export interface PluginEventPayload {
  "agent_id"?: string | null;
  "agent_type"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "details": Record<string, unknown>;
  "dispatch_id"?: string | null;
  "duration_seconds"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway_label"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "outcome"?: string | null;
  "plugin_event": string;
  "plugin_id": string;
  "reason"?: string | null;
  "session_key"?: string | null;
  "severity"?: string | null;
  "status"?: string | null;
  "tool_call_id"?: string | null;
}

export interface ArtifactPublishedPayload {
  "agent_id"?: string | null;
  "artifact_id": string;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "byte_length": number;
  "completeness"?: "full" | "truncated" | "summarized" | "transformed" | "unavailable" | "reference_only";
  "content_class": "metadata" | "payload" | "artifact" | "quarantined";
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "kind": string;
  "logical_id": string;
  "media_type": string;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "original_byte_length"?: number | null;
  "original_sha256"?: string | null;
  "reference": string;
  "session_key"?: string | null;
  "sha256": string;
  "tool_call_id"?: string | null;
  "transformation"?: string | null;
}

export interface LifecycleTransitionPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "authority": string;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "effective_at": string;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "lifecycle_version": "pipeline_lifecycle.v1";
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "new_state": string;
  "previous_state": string | null;
  "reason_code": string;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface LifecycleSnapshotPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "event_count"?: number;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "last_cursor"?: string | null;
  "lifecycle_version": string;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "read_models": Record<string, unknown>;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface ProducerHealthPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "checkpoint"?: string | null;
  "capabilities": Array<{ "capability": string; "details"?: Record<string, unknown> | null; "reason_code": string | null; "status": "available" | "capability_unavailable" | "degraded" | "unknown" }>;
  "content_completeness"?: string;
  "dead_letter_count": number;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "invalid_count": number;
  "lag"?: number | null;
  "last_successful_emission": string | null;
  "missing_payload_count"?: number;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "producer_id": string;
  "quarantined_count": number;
  "reconciliation"?: Record<string, unknown> | null;
  "restart_count"?: number;
  "session_key"?: string | null;
  "status": "healthy" | "degraded" | "unhealthy" | "unknown" | "not_applicable";
  "tool_call_id"?: string | null;
}

export interface TerminalClosurePayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "cost"?: Record<string, unknown> | null;
  "counts"?: Record<string, unknown>;
  "dispatch_id"?: string | null;
  "duration_ms"?: number | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "last_work_id"?: string | null;
  "manifest_fingerprint": string;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "observability": "complete" | "partial" | "degraded" | "unknown";
  "outcome": "success" | "failure" | "paused" | "cancelled" | "process_lost" | "abandoned" | "completed";
  "reason_code": string;
  "references"?: Array<unknown>;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface RuntimeLogPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "component": string;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "error_class"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "level": "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  "message": string;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "reason_code"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
}

export interface GitEvidencePayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "branch"?: string | null;
  "content_completeness"?: string;
  "diff_reference"?: string | null;
  "diff_stat"?: string | null;
  "dirty"?: boolean | null;
  "dispatch_id"?: string | null;
  "files_touched"?: Array<string>;
  "final_commit"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "repository": string;
  "session_key"?: string | null;
  "starting_commit"?: string | null;
  "tool_call_id"?: string | null;
}

export interface QualityEvidencePayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "artifact_references"?: Array<unknown>;
  "attempt"?: number | null;
  "check"?: string | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "dispositions"?: Array<unknown>;
  "findings"?: Array<unknown>;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "item_type": string;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "preview_url"?: string | null;
  "session_key"?: string | null;
  "skipped_reason"?: string | null;
  "source_commit"?: string | null;
  "suite"?: string | null;
  "tool_call_id"?: string | null;
  "verdict": string;
}

export interface InfrastructureEvidencePayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "delivery"?: Record<string, unknown> | null;
  "dispatch_id"?: string | null;
  "evidence_type": string;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "gateway"?: Record<string, unknown> | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "namespace_lease"?: Record<string, unknown> | null;
  "preview_url"?: string | null;
  "readiness"?: boolean | null;
  "redis"?: Record<string, unknown> | null;
  "resource_usage"?: Record<string, unknown> | null;
  "restarts"?: number | null;
  "rollout"?: Record<string, unknown> | null;
  "session_key"?: string | null;
  "status": string;
  "termination_reason"?: string | null;
  "tool_call_id"?: string | null;
  "workload"?: Record<string, unknown> | null;
}

export interface EvaluationFactPayload {
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "content_completeness"?: string;
  "dimension": string;
  "dispatch_id"?: string | null;
  "fingerprint"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_key"?: string | null;
  "tool_call_id"?: string | null;
  "value": unknown;
}

export interface CommandRequestedPayload {
  "actor": string;
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "capability": string;
  "command_id": string;
  "command_type": "approval.resolve" | "pipeline.pause" | "pipeline.resume" | "pipeline.cancel";
  "content_completeness"?: string;
  "decision"?: string | null;
  "dispatch_id"?: string | null;
  "expected_lifecycle_version": number;
  "expires_at": string;
  "issued_at": string;
  "reason": string;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_key"?: string | null;
  "target"?: Record<string, unknown> | null;
  "tool_call_id"?: string | null;
}

export interface CommandAcceptedPayload {
  "actor"?: string | null;
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "command_id": string;
  "command_type": string;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "session_key"?: string | null;
  "target"?: Record<string, unknown> | null;
  "tool_call_id"?: string | null;
}

export interface CommandRejectedPayload {
  "actor"?: string | null;
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "command_id": string;
  "command_type"?: string | null;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "reason_code": string;
  "session_key"?: string | null;
  "target"?: Record<string, unknown> | null;
  "tool_call_id"?: string | null;
}

export interface CommandCompletedPayload {
  "actor"?: string | null;
  "agent_id"?: string | null;
  "artifact_reference"?: string;
  "attempt"?: number | null;
  "command_id": string;
  "command_type": string;
  "content_completeness"?: string;
  "dispatch_id"?: string | null;
  "gate_id"?: string | null;
  "gate_type"?: string | null;
  "model_call_id"?: string | null;
  "module_id"?: string | null;
  "result"?: Record<string, unknown> | null;
  "reason_code"?: string | null;
  "session_key"?: string | null;
  "target"?: Record<string, unknown> | null;
  "tool_call_id"?: string | null;
}
export interface TelemetryPayloadMap {
  "pipeline.started": PipelineStartedPayload;
  "pipeline.completed": PipelineCompletedPayload;
  "pipeline.halted": PipelineHaltedPayload;
  "module.started": ModuleStartedPayload;
  "module.status_changed": ModuleStatusChangedPayload;
  "phase.started": PhaseStartedPayload;
  "phase.completed": PhaseCompletedPayload;
  "retry.scheduled": RetryScheduledPayload;
  "retry.exhausted": RetryExhaustedPayload;
  "system.io_warning": SystemIoWarningPayload;
  "summary.started": SummaryStartedPayload;
  "summary.completed": SummaryCompletedPayload;
  "gate.started": GateStartedPayload;
  "gate.verdict": GateVerdictPayload;
  "agent.spawn.requested": AgentSpawnRequestedPayload;
  "agent.spawned": AgentSpawnedPayload;
  "agent.delivery.target": AgentDeliveryTargetPayload;
  "agent.killed": AgentKilledPayload;
  "agent.ended": AgentEndedPayload;
  "agent.llm.input.summary": AgentLlmInputSummaryPayload;
  "agent.llm.output.summary": AgentLlmOutputSummaryPayload;
  "agent.tool.started": AgentToolStartedPayload;
  "agent.tool.finished": AgentToolFinishedPayload;
  "agent.model.started": AgentModelStartedPayload;
  "agent.model.ended": AgentModelEndedPayload;
  "agent.session.started": AgentSessionStartedPayload;
  "agent.session.ended": AgentSessionEndedPayload;
  "agent.transcript": AgentTranscriptPayload;
  "agent.progress": AgentProgressPayload;
  "cost.update": CostUpdatePayload;
  "rate_limit.detected": RateLimitDetectedPayload;
  "observability.degraded": ObservabilityDegradedPayload;
  "observability.restored": ObservabilityRestoredPayload;
  "error.escalation": ErrorEscalationPayload;
  "approval.requested": ApprovalRequestedPayload;
  "approval.resolved": ApprovalResolvedPayload;
  "budget.warning": BudgetWarningPayload;
  "budget.exceeded": BudgetExceededPayload;
  "plugin.event": PluginEventPayload;
  "artifact.published": ArtifactPublishedPayload;
  "lifecycle.transition": LifecycleTransitionPayload;
  "lifecycle.snapshot": LifecycleSnapshotPayload;
  "producer.health": ProducerHealthPayload;
  "terminal.closure": TerminalClosurePayload;
  "runtime.log": RuntimeLogPayload;
  "git.evidence": GitEvidencePayload;
  "quality.evidence": QualityEvidencePayload;
  "infrastructure.evidence": InfrastructureEvidencePayload;
  "evaluation.fact": EvaluationFactPayload;
  "command.requested": CommandRequestedPayload;
  "command.accepted": CommandAcceptedPayload;
  "command.rejected": CommandRejectedPayload;
  "command.completed": CommandCompletedPayload;
}
export interface CorrelationIdentity { project:string; run_id:string; work_id?:string|null; work_type?:string|null; module_id?:string|null; gate_id?:string|null; gate_type?:string|null; attempt?:number|null; dispatch_id?:string|null; session_id?:string|null; parent_session_id?:string|null; agent_id?:string|null; model_call_id?:string|null; tool_call_id?:string|null; trace_id?:string|null; span_id?:string|null; parent_span_id?:string|null; source:string; producer:string; }
export type TelemetryEnvelope<K extends TelemetryEventType = TelemetryEventType> = CorrelationIdentity & TelemetryPayloadMap[K] & { schema_version:'telemetry_envelope.v1'; event_id:string; source_event_id:string; type:K; occurred_at:string; emitted_at:string; seq:number; cursor:string; authority_class:string; causation_id?:string|null; extensions?:Record<string,unknown>; };
