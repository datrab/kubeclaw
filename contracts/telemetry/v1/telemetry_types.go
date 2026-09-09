// Code generated from contracts/telemetry/v1 JSON Schemas. DO NOT EDIT.
package telemetryv1

import "encoding/json"

type CorrelationIdentity struct {
	AgentID         json.RawMessage `json:"agent_id,omitempty"`
	ModuleID        json.RawMessage `json:"module_id,omitempty"`
	GateType        json.RawMessage `json:"gate_type,omitempty"`
	ParentSessionID json.RawMessage `json:"parent_session_id,omitempty"`
	TraceID         json.RawMessage `json:"trace_id,omitempty"`
	SpanID          json.RawMessage `json:"span_id,omitempty"`
	ParentSpanID    json.RawMessage `json:"parent_span_id,omitempty"`
	Attempt         json.RawMessage `json:"attempt,omitempty"`
	DispatchID      json.RawMessage `json:"dispatch_id,omitempty"`
	GateID          json.RawMessage `json:"gate_id,omitempty"`
	ModelCallID     json.RawMessage `json:"model_call_id,omitempty"`
	Producer        string          `json:"producer"`
	Project         string          `json:"project"`
	RunID           string          `json:"run_id"`
	SessionID       json.RawMessage `json:"session_id,omitempty"`
	Source          string          `json:"source"`
	ToolCallID      json.RawMessage `json:"tool_call_id,omitempty"`
	WorkID          json.RawMessage `json:"work_id,omitempty"`
	WorkType        json.RawMessage `json:"work_type,omitempty"`
}
type Envelope struct {
	CorrelationIdentity
	AuthorityClass string          `json:"authority_class"`
	CausationID    json.RawMessage `json:"causation_id,omitempty"`
	Cursor         *string         `json:"cursor"`
	EmittedAt      string          `json:"emitted_at"`
	EventID        string          `json:"event_id"`
	Extensions     json.RawMessage `json:"extensions"`
	OccurredAt     string          `json:"occurred_at"`
	SchemaVersion  string          `json:"schema_version"`
	SourceEventID  string          `json:"source_event_id"`
	Seq            json.Number     `json:"seq"`
	Type           string          `json:"type"`
}

type PipelineStartedPayload struct {
	AgentId             json.RawMessage   `json:"agent_id,omitempty"`
	ArtifactReference   *string           `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage   `json:"attempt,omitempty"`
	ContentCompleteness *string           `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage   `json:"dispatch_id,omitempty"`
	ExecutionOrder      []json.RawMessage `json:"execution_order"`
	Extensions          json.RawMessage   `json:"extensions,omitempty"`
	GateId              json.RawMessage   `json:"gate_id,omitempty"`
	GateType            json.RawMessage   `json:"gate_type,omitempty"`
	Gates               []json.RawMessage `json:"gates"`
	ManifestFingerprint *string           `json:"manifest_fingerprint,omitempty"`
	ManifestReference   *string           `json:"manifest_reference,omitempty"`
	ModelCallId         json.RawMessage   `json:"model_call_id,omitempty"`
	Models              json.RawMessage   `json:"models,omitempty"`
	ModuleId            json.RawMessage   `json:"module_id,omitempty"`
	Modules             []json.RawMessage `json:"modules"`
	NovaPrompt          json.RawMessage   `json:"nova_prompt,omitempty"`
	Resume              bool              `json:"resume"`
	SessionKey          json.RawMessage   `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage   `json:"tool_call_id,omitempty"`
}

type PipelineCompletedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	ModulesFailed       json.RawMessage `json:"modules_failed,omitempty"`
	ModulesPassed       json.RawMessage `json:"modules_passed,omitempty"`
	ModulesTotal        json.RawMessage `json:"modules_total,omitempty"`
	ReasonCode          json.RawMessage `json:"reason_code,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	TerminalStatus      string          `json:"terminal_status"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	TotalCostUsd        json.RawMessage `json:"total_cost_usd,omitempty"`
}

type PipelineHaltedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	MaxRateLimitPauses  json.RawMessage `json:"max_rate_limit_pauses,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	RateLimitExhausted  json.RawMessage `json:"rate_limit_exhausted,omitempty"`
	Reason              string          `json:"reason"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	StepId              json.RawMessage `json:"step_id,omitempty"`
	StepType            json.RawMessage `json:"step_type,omitempty"`
	TerminalDecision    json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      json.RawMessage `json:"terminal_status,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type ModuleStartedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type ModuleStatusChangedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	CommitHash          json.RawMessage `json:"commit_hash,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	CostEstimateUsd     json.RawMessage `json:"cost_estimate_usd,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id"`
	NewStatus           json.RawMessage `json:"new_status,omitempty"`
	OldStatus           json.RawMessage `json:"old_status,omitempty"`
	Phase               json.RawMessage `json:"phase,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Title               json.RawMessage `json:"title,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type PhaseStartedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id"`
	Phase               string          `json:"phase"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type PhaseCompletedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id"`
	Phase               string          `json:"phase"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type RetryScheduledPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DelaySeconds        json.RawMessage `json:"delay_seconds,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	MaxAttempts         json.RawMessage `json:"max_attempts,omitempty"`
	MaxFails            json.RawMessage `json:"max_fails,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type RetryExhaustedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	MaxAttempts         json.RawMessage `json:"max_attempts,omitempty"`
	MaxFails            json.RawMessage `json:"max_fails,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Phase               json.RawMessage `json:"phase,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type SystemIoWarningPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	Code                json.RawMessage `json:"code,omitempty"`
	Component           string          `json:"component"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	Detail              json.RawMessage `json:"detail,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Errno               json.RawMessage `json:"errno,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Operation           string          `json:"operation"`
	Path                string          `json:"path"`
	PathRole            json.RawMessage `json:"path_role,omitempty"`
	Reason              string          `json:"reason"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Surface             string          `json:"surface"`
	Syscall             json.RawMessage `json:"syscall,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	WarningAt           json.RawMessage `json:"warning_at,omitempty"`
}

type SummaryStartedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	OutputDir           json.RawMessage `json:"output_dir,omitempty"`
	ReasonCode          json.RawMessage `json:"reason_code,omitempty"`
	Runtime             json.RawMessage `json:"runtime,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Status              json.RawMessage `json:"status,omitempty"`
	SummaryType         string          `json:"summary_type"`
	TerminalDecision    json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      json.RawMessage `json:"terminal_status,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type SummaryCompletedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	CaseStudyBasePath   json.RawMessage `json:"case_study_base_path,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DataPath            json.RawMessage `json:"data_path,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	LatestJsonPath      json.RawMessage `json:"latest_json_path,omitempty"`
	MarkdownPath        json.RawMessage `json:"markdown_path,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Output              json.RawMessage `json:"output,omitempty"`
	OutputDir           json.RawMessage `json:"output_dir,omitempty"`
	OutputPath          json.RawMessage `json:"output_path,omitempty"`
	PipelineSummaryPath json.RawMessage `json:"pipeline_summary_path,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	ReasonCode          json.RawMessage `json:"reason_code,omitempty"`
	Runtime             json.RawMessage `json:"runtime,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Status              json.RawMessage `json:"status,omitempty"`
	SummaryJsonPath     json.RawMessage `json:"summary_json_path,omitempty"`
	SummaryType         string          `json:"summary_type"`
	TerminalDecision    json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      json.RawMessage `json:"terminal_status,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type GateStartedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              *string         `json:"gate_id"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Reviewers           json.RawMessage `json:"reviewers,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Title               json.RawMessage `json:"title,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type GateVerdictPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	BlockersCount       json.RawMessage `json:"blockers_count,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	FixCycle            json.RawMessage `json:"fix_cycle,omitempty"`
	GateId              *string         `json:"gate_id"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	IssuesCount         json.RawMessage `json:"issues_count,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	RunId               *string         `json:"run_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Verdict             string          `json:"verdict"`
}

type AgentSpawnRequestedPayload struct {
	AgentId                  json.RawMessage `json:"agent_id,omitempty"`
	AgentType                json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference        *string         `json:"artifact_reference,omitempty"`
	Attempt                  json.RawMessage `json:"attempt,omitempty"`
	ChildRunId               json.RawMessage `json:"child_run_id,omitempty"`
	ContentCompleteness      *string         `json:"content_completeness,omitempty"`
	DispatchId               json.RawMessage `json:"dispatch_id,omitempty"`
	ExpectsCompletionMessage json.RawMessage `json:"expects_completion_message,omitempty"`
	Extensions               json.RawMessage `json:"extensions,omitempty"`
	GateId                   json.RawMessage `json:"gate_id,omitempty"`
	GateType                 json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel             json.RawMessage `json:"gateway_label,omitempty"`
	Mode                     json.RawMessage `json:"mode,omitempty"`
	ModelCallId              json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId                 json.RawMessage `json:"module_id,omitempty"`
	RequestedAt              json.RawMessage `json:"requested_at,omitempty"`
	RequesterOrigin          json.RawMessage `json:"requester_origin,omitempty"`
	RequesterSessionKey      json.RawMessage `json:"requester_session_key,omitempty"`
	SessionKey               json.RawMessage `json:"session_key,omitempty"`
	SpawnMode                json.RawMessage `json:"spawn_mode,omitempty"`
	Thread                   json.RawMessage `json:"thread,omitempty"`
	ToolCallId               json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentSpawnedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	Dispatch            json.RawMessage `json:"dispatch,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Label               json.RawMessage `json:"label,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Substep             json.RawMessage `json:"substep,omitempty"`
	ThinkingLevel       json.RawMessage `json:"thinking_level,omitempty"`
	TimeoutMinutes      json.RawMessage `json:"timeout_minutes,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentDeliveryTargetPayload struct {
	AgentId                  json.RawMessage `json:"agent_id,omitempty"`
	AgentType                json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference        *string         `json:"artifact_reference,omitempty"`
	Attempt                  json.RawMessage `json:"attempt,omitempty"`
	ChildRunId               json.RawMessage `json:"child_run_id,omitempty"`
	ChildSessionKey          json.RawMessage `json:"child_session_key,omitempty"`
	ContentCompleteness      *string         `json:"content_completeness,omitempty"`
	DispatchId               json.RawMessage `json:"dispatch_id,omitempty"`
	ExpectsCompletionMessage json.RawMessage `json:"expects_completion_message,omitempty"`
	Extensions               json.RawMessage `json:"extensions,omitempty"`
	GateId                   json.RawMessage `json:"gate_id,omitempty"`
	GateType                 json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel             json.RawMessage `json:"gateway_label,omitempty"`
	ModelCallId              json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId                 json.RawMessage `json:"module_id,omitempty"`
	RequesterOrigin          json.RawMessage `json:"requester_origin,omitempty"`
	RequesterSessionKey      json.RawMessage `json:"requester_session_key,omitempty"`
	SessionKey               json.RawMessage `json:"session_key,omitempty"`
	SpawnMode                json.RawMessage `json:"spawn_mode,omitempty"`
	TargetedAt               json.RawMessage `json:"targeted_at,omitempty"`
	ToolCallId               json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentKilledPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	FilesChanged        json.RawMessage `json:"files_changed,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	HasChanges          json.RawMessage `json:"has_changes,omitempty"`
	Label               json.RawMessage `json:"label,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentEndedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentScope          json.RawMessage `json:"agent_scope,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	EndedAt             json.RawMessage `json:"ended_at,omitempty"`
	Error               json.RawMessage `json:"error,omitempty"`
	ErrorMessage        json.RawMessage `json:"error_message,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	FinalMessageCount   json.RawMessage `json:"final_message_count,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	Label               json.RawMessage `json:"label,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Outcome             json.RawMessage `json:"outcome,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentLlmInputSummaryPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	HistoryMessageCount json.RawMessage `json:"history_message_count,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	PromptChars         json.RawMessage `json:"prompt_chars,omitempty"`
	Provider            json.RawMessage `json:"provider,omitempty"`
	Request             json.RawMessage `json:"request,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	SystemPromptChars   json.RawMessage `json:"system_prompt_chars,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentLlmOutputSummaryPayload struct {
	AgentId                json.RawMessage `json:"agent_id,omitempty"`
	AgentType              json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference      *string         `json:"artifact_reference,omitempty"`
	AssistantResponseChars json.RawMessage `json:"assistant_response_chars,omitempty"`
	Attempt                json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness    *string         `json:"content_completeness,omitempty"`
	DispatchId             json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions             json.RawMessage `json:"extensions,omitempty"`
	GateId                 json.RawMessage `json:"gate_id,omitempty"`
	GateType               json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel           json.RawMessage `json:"gateway_label,omitempty"`
	HistoryMessageCount    json.RawMessage `json:"history_message_count,omitempty"`
	InputTokens            json.RawMessage `json:"input_tokens,omitempty"`
	Model                  json.RawMessage `json:"model,omitempty"`
	ModelCallId            json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId               json.RawMessage `json:"module_id,omitempty"`
	OutputTokens           json.RawMessage `json:"output_tokens,omitempty"`
	Provider               json.RawMessage `json:"provider,omitempty"`
	ResponseChars          json.RawMessage `json:"response_chars,omitempty"`
	SessionKey             json.RawMessage `json:"session_key,omitempty"`
	ToolCallId             json.RawMessage `json:"tool_call_id,omitempty"`
	Usage                  json.RawMessage `json:"usage,omitempty"`
}

type AgentToolStartedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             *json.Number    `json:"attempt"`
	ContentCompleteness string          `json:"content_completeness"`
	DispatchId          *string         `json:"dispatch_id"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	ModelCallId         *string         `json:"model_call_id"`
	ModuleId            *string         `json:"module_id"`
	ParamKeys           json.RawMessage `json:"param_keys,omitempty"`
	ParamsBytes         json.RawMessage `json:"params_bytes,omitempty"`
	SessionKey          string          `json:"session_key"`
	ToolCallId          *string         `json:"tool_call_id"`
	ToolName            string          `json:"tool_name"`
}

type AgentToolFinishedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             *json.Number    `json:"attempt"`
	ContentCompleteness string          `json:"content_completeness"`
	DispatchId          *string         `json:"dispatch_id"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	Error               json.RawMessage `json:"error"`
	ErrorMessage        json.RawMessage `json:"error_message,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	ModelCallId         *string         `json:"model_call_id"`
	ModuleId            *string         `json:"module_id"`
	Outcome             string          `json:"outcome"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	ResultBytes         json.Number     `json:"result_bytes"`
	SessionKey          string          `json:"session_key"`
	ToolCallId          *string         `json:"tool_call_id"`
	ToolName            string          `json:"tool_name"`
}

type AgentModelStartedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Provider            json.RawMessage `json:"provider,omitempty"`
	Request             json.RawMessage `json:"request,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentModelEndedPayload struct {
	Status              json.RawMessage `json:"status,omitempty"`
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	CostUsd             json.RawMessage `json:"cost_usd,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	Error               json.RawMessage `json:"error,omitempty"`
	ErrorMessage        json.RawMessage `json:"error_message,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	InputTokens         json.RawMessage `json:"input_tokens,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Outcome             json.RawMessage `json:"outcome,omitempty"`
	OutputTokens        json.RawMessage `json:"output_tokens,omitempty"`
	Provider            json.RawMessage `json:"provider,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Usage               json.RawMessage `json:"usage,omitempty"`
}

type AgentSessionStartedPayload struct {
	Label               json.RawMessage `json:"label,omitempty"`
	TranscriptReference json.RawMessage `json:"transcript_reference,omitempty"`
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	SessionId           json.RawMessage `json:"session_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	StartedAt           json.RawMessage `json:"started_at,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentSessionEndedPayload struct {
	TranscriptReference json.RawMessage `json:"transcript_reference,omitempty"`
	Status              json.RawMessage `json:"status,omitempty"`
	RuntimeMs           json.RawMessage `json:"runtime_ms,omitempty"`
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	EndedAt             json.RawMessage `json:"ended_at,omitempty"`
	Error               json.RawMessage `json:"error,omitempty"`
	ErrorMessage        json.RawMessage `json:"error_message,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Outcome             json.RawMessage `json:"outcome,omitempty"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionId           json.RawMessage `json:"session_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type AgentTranscriptPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Label               json.RawMessage `json:"label,omitempty"`
	LineCount           json.RawMessage `json:"line_count,omitempty"`
	LineKind            *string         `json:"line_kind,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Text                *string         `json:"text,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	TranscriptOffset    json.RawMessage `json:"transcript_offset,omitempty"`
}

type AgentProgressPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	ElapsedSeconds      json.RawMessage `json:"elapsed_seconds,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	FilesTouched        json.RawMessage `json:"files_touched,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Label               json.RawMessage `json:"label,omitempty"`
	LastActivity        json.RawMessage `json:"last_activity,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Status              *string         `json:"status,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	TranscriptEvents    json.RawMessage `json:"transcript_events,omitempty"`
}

type CostUpdatePayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	CostUsd             json.RawMessage `json:"cost_usd,omitempty"`
	CumulativeCostUsd   json.RawMessage `json:"cumulative_cost_usd,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	EstimatedCostUsd    json.RawMessage `json:"estimated_cost_usd,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	InputTokens         json.RawMessage `json:"input_tokens,omitempty"`
	Label               json.RawMessage `json:"label,omitempty"`
	Model               json.RawMessage `json:"model,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	OutputTokens        json.RawMessage `json:"output_tokens,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	TokensIn            json.RawMessage `json:"tokens_in,omitempty"`
	TokensOut           json.RawMessage `json:"tokens_out,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	TotalCostUsd        json.RawMessage `json:"total_cost_usd,omitempty"`
}

type RateLimitDetectedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	CooldownMs          json.RawMessage `json:"cooldown_ms,omitempty"`
	CooldownSource      json.RawMessage `json:"cooldown_source,omitempty"`
	Detail              json.RawMessage `json:"detail,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	MaxPauses           json.RawMessage `json:"max_pauses,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	PauseCount          json.RawMessage `json:"pause_count,omitempty"`
	Provider            json.RawMessage `json:"provider,omitempty"`
	ResumeAt            json.RawMessage `json:"resume_at,omitempty"`
	RetryAfterSeconds   json.RawMessage `json:"retry_after_seconds,omitempty"`
	RunId               *string         `json:"run_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type ObservabilityDegradedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	Authorization       json.RawMessage `json:"authorization,omitempty"`
	Component           string          `json:"component"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DegradedAt          json.RawMessage `json:"degraded_at,omitempty"`
	Detail              json.RawMessage `json:"detail,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Error               json.RawMessage `json:"error,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	HookId              json.RawMessage `json:"hook_id,omitempty"`
	ImpactedEventType   json.RawMessage `json:"impacted_event_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Payload             json.RawMessage `json:"payload,omitempty"`
	Reason              string          `json:"reason"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	StageId             json.RawMessage `json:"stage_id,omitempty"`
	Stdout              json.RawMessage `json:"stdout,omitempty"`
	StreamKey           json.RawMessage `json:"stream_key,omitempty"`
	Surface             string          `json:"surface"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Transcript          json.RawMessage `json:"transcript,omitempty"`
	ValidationErrors    json.RawMessage `json:"validation_errors,omitempty"`
}

type ObservabilityRestoredPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	Authorization       json.RawMessage `json:"authorization,omitempty"`
	Component           string          `json:"component"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DegradedAt          json.RawMessage `json:"degraded_at,omitempty"`
	Detail              json.RawMessage `json:"detail,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Error               json.RawMessage `json:"error,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	HookId              json.RawMessage `json:"hook_id,omitempty"`
	ImpactedEventType   json.RawMessage `json:"impacted_event_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Payload             json.RawMessage `json:"payload,omitempty"`
	Reason              string          `json:"reason"`
	RestoredAfterMs     json.RawMessage `json:"restored_after_ms,omitempty"`
	RestoredAt          json.RawMessage `json:"restored_at,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	StageId             json.RawMessage `json:"stage_id,omitempty"`
	Stdout              json.RawMessage `json:"stdout,omitempty"`
	StreamKey           json.RawMessage `json:"stream_key,omitempty"`
	Surface             string          `json:"surface"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Transcript          json.RawMessage `json:"transcript,omitempty"`
	ValidationErrors    json.RawMessage `json:"validation_errors,omitempty"`
}

type ErrorEscalationPayload struct {
	Action              json.RawMessage `json:"action,omitempty"`
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	FailCount           json.RawMessage `json:"fail_count,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	LastFailure         json.RawMessage `json:"last_failure,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	StepId              json.RawMessage `json:"step_id,omitempty"`
	StepType            json.RawMessage `json:"step_type,omitempty"`
	TerminalDecision    json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      json.RawMessage `json:"terminal_status,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type ApprovalRequestedPayload struct {
	AgentId             json.RawMessage   `json:"agent_id,omitempty"`
	ApprovalId          string            `json:"approval_id"`
	ArtifactReference   *string           `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage   `json:"attempt,omitempty"`
	ContentCompleteness *string           `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage   `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage   `json:"extensions,omitempty"`
	GateId              json.RawMessage   `json:"gate_id,omitempty"`
	GateTitle           json.RawMessage   `json:"gate_title,omitempty"`
	GateType            json.RawMessage   `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage   `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage   `json:"module_id,omitempty"`
	Options             []json.RawMessage `json:"options"`
	Prompt              string            `json:"prompt"`
	SessionKey          json.RawMessage   `json:"session_key,omitempty"`
	TimeoutMinutes      json.RawMessage   `json:"timeout_minutes,omitempty"`
	TimeoutPolicy       json.RawMessage   `json:"timeout_policy,omitempty"`
	ToolCallId          json.RawMessage   `json:"tool_call_id,omitempty"`
}

type ApprovalResolvedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ApprovalId          string          `json:"approval_id"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	Choice              json.RawMessage `json:"choice,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DecisionBy          json.RawMessage `json:"decision_by,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	ResolvedBy          json.RawMessage `json:"resolved_by,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Status              json.RawMessage `json:"status,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type BudgetWarningPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	BudgetUsd           json.RawMessage `json:"budget_usd,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	Current             json.Number     `json:"current"`
	CurrentCostUsd      json.RawMessage `json:"current_cost_usd,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Limit               json.Number     `json:"limit"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	PercentUsed         json.RawMessage `json:"percent_used,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Threshold           json.RawMessage `json:"threshold"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Unit                string          `json:"unit"`
}

type BudgetExceededPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	BudgetUsd           json.RawMessage `json:"budget_usd,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	Current             json.Number     `json:"current"`
	CurrentCostUsd      json.RawMessage `json:"current_cost_usd,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Limit               json.Number     `json:"limit"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	PercentUsed         json.RawMessage `json:"percent_used,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Threshold           json.RawMessage `json:"threshold"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Unit                string          `json:"unit"`
}

type PluginEventPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	AgentType           json.RawMessage `json:"agent_type,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	Details             json.RawMessage `json:"details"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	DurationSeconds     json.RawMessage `json:"duration_seconds,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	GatewayLabel        json.RawMessage `json:"gateway_label,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Outcome             json.RawMessage `json:"outcome,omitempty"`
	PluginEvent         string          `json:"plugin_event"`
	PluginId            string          `json:"plugin_id"`
	Reason              json.RawMessage `json:"reason,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Severity            json.RawMessage `json:"severity,omitempty"`
	Status              json.RawMessage `json:"status,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type ArtifactPublishedPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactId          string          `json:"artifact_id"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ByteLength          json.Number     `json:"byte_length"`
	Completeness        *string         `json:"completeness,omitempty"`
	ContentClass        string          `json:"content_class"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Kind                string          `json:"kind"`
	LogicalId           string          `json:"logical_id"`
	MediaType           string          `json:"media_type"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	OriginalByteLength  json.RawMessage `json:"original_byte_length,omitempty"`
	OriginalSha256      json.RawMessage `json:"original_sha256,omitempty"`
	Reference           string          `json:"reference"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Sha256              string          `json:"sha256"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Transformation      json.RawMessage `json:"transformation,omitempty"`
}

type LifecycleTransitionPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	Authority           string          `json:"authority"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	EffectiveAt         string          `json:"effective_at"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	LifecycleVersion    string          `json:"lifecycle_version"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	NewState            string          `json:"new_state"`
	PreviousState       *string         `json:"previous_state"`
	ReasonCode          string          `json:"reason_code"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type LifecycleSnapshotPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	EventCount          *json.Number    `json:"event_count,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	LastCursor          json.RawMessage `json:"last_cursor,omitempty"`
	LifecycleVersion    string          `json:"lifecycle_version"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	ReadModels          json.RawMessage `json:"read_models"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type ProducerHealthPayload struct {
	AgentId           json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference *string         `json:"artifact_reference,omitempty"`
	Attempt           json.RawMessage `json:"attempt,omitempty"`
	Checkpoint        json.RawMessage `json:"checkpoint,omitempty"`
	Capabilities      []struct {
		Capability string          `json:"capability"`
		Details    json.RawMessage `json:"details,omitempty"`
		ReasonCode *string         `json:"reason_code"`
		Status     string          `json:"status"`
	} `json:"capabilities"`
	ContentCompleteness    *string         `json:"content_completeness,omitempty"`
	DeadLetterCount        json.Number     `json:"dead_letter_count"`
	DispatchId             json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions             json.RawMessage `json:"extensions,omitempty"`
	GateId                 json.RawMessage `json:"gate_id,omitempty"`
	GateType               json.RawMessage `json:"gate_type,omitempty"`
	InvalidCount           json.Number     `json:"invalid_count"`
	Lag                    json.RawMessage `json:"lag,omitempty"`
	LastSuccessfulEmission *string         `json:"last_successful_emission"`
	MissingPayloadCount    *json.Number    `json:"missing_payload_count,omitempty"`
	ModelCallId            json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId               json.RawMessage `json:"module_id,omitempty"`
	ProducerId             string          `json:"producer_id"`
	QuarantinedCount       json.Number     `json:"quarantined_count"`
	Reconciliation         json.RawMessage `json:"reconciliation,omitempty"`
	RestartCount           *json.Number    `json:"restart_count,omitempty"`
	SessionKey             json.RawMessage `json:"session_key,omitempty"`
	Status                 string          `json:"status"`
	ToolCallId             json.RawMessage `json:"tool_call_id,omitempty"`
}

type TerminalClosurePayload struct {
	AgentId             json.RawMessage    `json:"agent_id,omitempty"`
	ArtifactReference   *string            `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage    `json:"attempt,omitempty"`
	ContentCompleteness *string            `json:"content_completeness,omitempty"`
	Cost                json.RawMessage    `json:"cost,omitempty"`
	Counts              json.RawMessage    `json:"counts,omitempty"`
	DispatchId          json.RawMessage    `json:"dispatch_id,omitempty"`
	DurationMs          json.RawMessage    `json:"duration_ms,omitempty"`
	Extensions          json.RawMessage    `json:"extensions,omitempty"`
	GateId              json.RawMessage    `json:"gate_id,omitempty"`
	GateType            json.RawMessage    `json:"gate_type,omitempty"`
	LastWorkId          json.RawMessage    `json:"last_work_id,omitempty"`
	ManifestFingerprint string             `json:"manifest_fingerprint"`
	ModelCallId         json.RawMessage    `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage    `json:"module_id,omitempty"`
	Observability       string             `json:"observability"`
	Outcome             string             `json:"outcome"`
	ReasonCode          string             `json:"reason_code"`
	References          *[]json.RawMessage `json:"references,omitempty"`
	SessionKey          json.RawMessage    `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage    `json:"tool_call_id,omitempty"`
}

type RuntimeLogPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	Component           string          `json:"component"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	ErrorClass          json.RawMessage `json:"error_class,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Level               string          `json:"level"`
	Message             string          `json:"message"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	ReasonCode          json.RawMessage `json:"reason_code,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type GitEvidencePayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	Branch              json.RawMessage `json:"branch,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DiffReference       json.RawMessage `json:"diff_reference,omitempty"`
	DiffStat            json.RawMessage `json:"diff_stat,omitempty"`
	Dirty               json.RawMessage `json:"dirty,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	FilesTouched        *[]string       `json:"files_touched,omitempty"`
	FinalCommit         json.RawMessage `json:"final_commit,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Repository          string          `json:"repository"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	StartingCommit      json.RawMessage `json:"starting_commit,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type QualityEvidencePayload struct {
	AgentId             json.RawMessage    `json:"agent_id,omitempty"`
	ArtifactReference   *string            `json:"artifact_reference,omitempty"`
	ArtifactReferences  *[]json.RawMessage `json:"artifact_references,omitempty"`
	Attempt             json.RawMessage    `json:"attempt,omitempty"`
	Check               json.RawMessage    `json:"check,omitempty"`
	ContentCompleteness *string            `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage    `json:"dispatch_id,omitempty"`
	Dispositions        *[]json.RawMessage `json:"dispositions,omitempty"`
	Extensions          json.RawMessage    `json:"extensions,omitempty"`
	Findings            *[]json.RawMessage `json:"findings,omitempty"`
	GateId              json.RawMessage    `json:"gate_id,omitempty"`
	GateType            json.RawMessage    `json:"gate_type,omitempty"`
	ItemType            string             `json:"item_type"`
	ModelCallId         json.RawMessage    `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage    `json:"module_id,omitempty"`
	PreviewUrl          json.RawMessage    `json:"preview_url,omitempty"`
	SessionKey          json.RawMessage    `json:"session_key,omitempty"`
	SkippedReason       json.RawMessage    `json:"skipped_reason,omitempty"`
	SourceCommit        json.RawMessage    `json:"source_commit,omitempty"`
	Suite               json.RawMessage    `json:"suite,omitempty"`
	ToolCallId          json.RawMessage    `json:"tool_call_id,omitempty"`
	Verdict             string             `json:"verdict"`
}

type InfrastructureEvidencePayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	Delivery            json.RawMessage `json:"delivery,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	EvidenceType        string          `json:"evidence_type"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	Gateway             json.RawMessage `json:"gateway,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	NamespaceLease      json.RawMessage `json:"namespace_lease,omitempty"`
	PreviewUrl          json.RawMessage `json:"preview_url,omitempty"`
	Readiness           json.RawMessage `json:"readiness,omitempty"`
	Redis               json.RawMessage `json:"redis,omitempty"`
	ResourceUsage       json.RawMessage `json:"resource_usage,omitempty"`
	Restarts            json.RawMessage `json:"restarts,omitempty"`
	Rollout             json.RawMessage `json:"rollout,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Status              string          `json:"status"`
	TerminationReason   json.RawMessage `json:"termination_reason,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Workload            json.RawMessage `json:"workload,omitempty"`
}

type EvaluationFactPayload struct {
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	Dimension           string          `json:"dimension"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	Fingerprint         json.RawMessage `json:"fingerprint,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
	Value               json.RawMessage `json:"value"`
}

type CommandRequestedPayload struct {
	Actor                    string          `json:"actor"`
	AgentId                  json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference        *string         `json:"artifact_reference,omitempty"`
	Attempt                  json.RawMessage `json:"attempt,omitempty"`
	Capability               string          `json:"capability"`
	CommandId                string          `json:"command_id"`
	CommandType              string          `json:"command_type"`
	ContentCompleteness      *string         `json:"content_completeness,omitempty"`
	Decision                 json.RawMessage `json:"decision,omitempty"`
	DispatchId               json.RawMessage `json:"dispatch_id,omitempty"`
	ExpectedLifecycleVersion json.Number     `json:"expected_lifecycle_version"`
	ExpiresAt                string          `json:"expires_at"`
	IssuedAt                 string          `json:"issued_at"`
	Reason                   string          `json:"reason"`
	Extensions               json.RawMessage `json:"extensions,omitempty"`
	GateId                   json.RawMessage `json:"gate_id,omitempty"`
	GateType                 json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId              json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId                 json.RawMessage `json:"module_id,omitempty"`
	SessionKey               json.RawMessage `json:"session_key,omitempty"`
	Target                   json.RawMessage `json:"target,omitempty"`
	ToolCallId               json.RawMessage `json:"tool_call_id,omitempty"`
}

type CommandAcceptedPayload struct {
	Actor               json.RawMessage `json:"actor,omitempty"`
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	CommandId           string          `json:"command_id"`
	CommandType         string          `json:"command_type"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Target              json.RawMessage `json:"target,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type CommandRejectedPayload struct {
	Actor               json.RawMessage `json:"actor,omitempty"`
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	CommandId           string          `json:"command_id"`
	CommandType         json.RawMessage `json:"command_type,omitempty"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	ReasonCode          string          `json:"reason_code"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Target              json.RawMessage `json:"target,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}

type CommandCompletedPayload struct {
	Actor               json.RawMessage `json:"actor,omitempty"`
	AgentId             json.RawMessage `json:"agent_id,omitempty"`
	ArtifactReference   *string         `json:"artifact_reference,omitempty"`
	Attempt             json.RawMessage `json:"attempt,omitempty"`
	CommandId           string          `json:"command_id"`
	CommandType         string          `json:"command_type"`
	ContentCompleteness *string         `json:"content_completeness,omitempty"`
	DispatchId          json.RawMessage `json:"dispatch_id,omitempty"`
	Extensions          json.RawMessage `json:"extensions,omitempty"`
	GateId              json.RawMessage `json:"gate_id,omitempty"`
	GateType            json.RawMessage `json:"gate_type,omitempty"`
	ModelCallId         json.RawMessage `json:"model_call_id,omitempty"`
	ModuleId            json.RawMessage `json:"module_id,omitempty"`
	Result              json.RawMessage `json:"result,omitempty"`
	ReasonCode          json.RawMessage `json:"reason_code,omitempty"`
	SessionKey          json.RawMessage `json:"session_key,omitempty"`
	Target              json.RawMessage `json:"target,omitempty"`
	ToolCallId          json.RawMessage `json:"tool_call_id,omitempty"`
}
