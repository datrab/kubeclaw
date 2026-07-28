// Code generated from contracts/telemetry/v1 JSON Schemas. DO NOT EDIT.
package telemetryv1

import "encoding/json"

type CorrelationIdentity struct {
	Project         string  `json:"project"`
	RunID           string  `json:"run_id"`
	WorkID          *string `json:"work_id,omitempty"`
	WorkType        *string `json:"work_type,omitempty"`
	ModuleID        *string `json:"module_id,omitempty"`
	GateID          *string `json:"gate_id,omitempty"`
	GateType        *string `json:"gate_type,omitempty"`
	Attempt         *int64  `json:"attempt,omitempty"`
	DispatchID      *string `json:"dispatch_id,omitempty"`
	SessionID       *string `json:"session_id,omitempty"`
	ParentSessionID *string `json:"parent_session_id,omitempty"`
	AgentID         *string `json:"agent_id,omitempty"`
	ModelCallID     *string `json:"model_call_id,omitempty"`
	ToolCallID      *string `json:"tool_call_id,omitempty"`
	TraceID         *string `json:"trace_id,omitempty"`
	SpanID          *string `json:"span_id,omitempty"`
	ParentSpanID    *string `json:"parent_span_id,omitempty"`
	Source          string  `json:"source"`
	Producer        string  `json:"producer"`
}
type Envelope struct {
	CorrelationIdentity
	SchemaVersion  string                     `json:"schema_version"`
	EventID        string                     `json:"event_id"`
	SourceEventID  string                     `json:"source_event_id"`
	Type           string                     `json:"type"`
	OccurredAt     string                     `json:"occurred_at"`
	EmittedAt      string                     `json:"emitted_at"`
	Seq            uint64                     `json:"seq"`
	Cursor         string                     `json:"cursor"`
	AuthorityClass string                     `json:"authority_class"`
	CausationID    *string                    `json:"causation_id,omitempty"`
	Extensions     map[string]json.RawMessage `json:"extensions,omitempty"`
}

type PipelineStartedPayload struct {
	AgentId             *string           `json:"agent_id,omitempty"`
	ArtifactReference   string            `json:"artifact_reference,omitempty"`
	Attempt             *float64          `json:"attempt,omitempty"`
	ContentCompleteness string            `json:"content_completeness,omitempty"`
	DispatchId          *string           `json:"dispatch_id,omitempty"`
	ExecutionOrder      []json.RawMessage `json:"execution_order"`
	GateId              *string           `json:"gate_id,omitempty"`
	GateType            *string           `json:"gate_type,omitempty"`
	Gates               []json.RawMessage `json:"gates"`
	ManifestFingerprint string            `json:"manifest_fingerprint,omitempty"`
	ManifestReference   string            `json:"manifest_reference,omitempty"`
	ModelCallId         *string           `json:"model_call_id,omitempty"`
	Models              *json.RawMessage  `json:"models,omitempty"`
	ModuleId            *string           `json:"module_id,omitempty"`
	Modules             []json.RawMessage `json:"modules"`
	NovaPrompt          *string           `json:"nova_prompt,omitempty"`
	Resume              bool              `json:"resume"`
	SessionKey          *string           `json:"session_key,omitempty"`
	ToolCallId          *string           `json:"tool_call_id,omitempty"`
}

type PipelineCompletedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64 `json:"duration_seconds,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	ModulesFailed       *float64 `json:"modules_failed,omitempty"`
	ModulesPassed       *float64 `json:"modules_passed,omitempty"`
	ModulesTotal        *float64 `json:"modules_total,omitempty"`
	ReasonCode          *string  `json:"reason_code,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	TerminalStatus      string   `json:"terminal_status"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
	TotalCostUsd        *float64 `json:"total_cost_usd,omitempty"`
}

type PipelineHaltedPayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	MaxRateLimitPauses  *float64         `json:"max_rate_limit_pauses,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	RateLimitExhausted  *bool            `json:"rate_limit_exhausted,omitempty"`
	Reason              string           `json:"reason"`
	SessionKey          *string          `json:"session_key,omitempty"`
	StepId              *string          `json:"step_id,omitempty"`
	StepType            *string          `json:"step_type,omitempty"`
	TerminalDecision    *json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      *string          `json:"terminal_status,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type ModuleStartedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	Model               *string  `json:"model,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            string   `json:"module_id"`
	SessionKey          *string  `json:"session_key,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type ModuleStatusChangedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	CommitHash          *string  `json:"commit_hash,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	CostEstimateUsd     *float64 `json:"cost_estimate_usd,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64 `json:"duration_seconds,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	GatewayLabel        *string  `json:"gateway_label,omitempty"`
	Model               *string  `json:"model,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            string   `json:"module_id"`
	NewStatus           *string  `json:"new_status,omitempty"`
	OldStatus           *string  `json:"old_status,omitempty"`
	Phase               *string  `json:"phase,omitempty"`
	Reason              *string  `json:"reason,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	Title               *string  `json:"title,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type PhaseStartedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	Model               *string  `json:"model,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            string   `json:"module_id"`
	Phase               string   `json:"phase"`
	SessionKey          *string  `json:"session_key,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type PhaseCompletedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            string   `json:"module_id"`
	Phase               string   `json:"phase"`
	SessionKey          *string  `json:"session_key,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type RetryScheduledPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DelaySeconds        *float64 `json:"delay_seconds,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	GatewayLabel        *string  `json:"gateway_label,omitempty"`
	MaxAttempts         *float64 `json:"max_attempts,omitempty"`
	MaxFails            *float64 `json:"max_fails,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            string   `json:"module_id"`
	Reason              *string  `json:"reason,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type RetryExhaustedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	GatewayLabel        *string  `json:"gateway_label,omitempty"`
	MaxAttempts         *float64 `json:"max_attempts,omitempty"`
	MaxFails            *float64 `json:"max_fails,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	Phase               *string  `json:"phase,omitempty"`
	Reason              *string  `json:"reason,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type SystemIoWarningPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	Code                *string  `json:"code,omitempty"`
	Component           string   `json:"component"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	Detail              *string  `json:"detail,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	Errno               *float64 `json:"errno,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	Operation           string   `json:"operation"`
	Path                string   `json:"path"`
	PathRole            *string  `json:"path_role,omitempty"`
	Reason              string   `json:"reason"`
	SessionKey          *string  `json:"session_key,omitempty"`
	Surface             string   `json:"surface"`
	Syscall             *string  `json:"syscall,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
	WarningAt           *string  `json:"warning_at,omitempty"`
}

type SummaryStartedPayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	Model               *string          `json:"model,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	OutputDir           *string          `json:"output_dir,omitempty"`
	ReasonCode          *string          `json:"reason_code,omitempty"`
	Runtime             *string          `json:"runtime,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	Status              *string          `json:"status,omitempty"`
	SummaryType         string           `json:"summary_type"`
	TerminalDecision    *json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      *string          `json:"terminal_status,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type SummaryCompletedPayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	CaseStudyBasePath   *string          `json:"case_study_base_path,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DataPath            *string          `json:"data_path,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	LatestJsonPath      *string          `json:"latest_json_path,omitempty"`
	MarkdownPath        *string          `json:"markdown_path,omitempty"`
	Model               *string          `json:"model,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	Output              *string          `json:"output,omitempty"`
	OutputDir           *string          `json:"output_dir,omitempty"`
	OutputPath          *string          `json:"output_path,omitempty"`
	PipelineSummaryPath *string          `json:"pipeline_summary_path,omitempty"`
	Reason              *string          `json:"reason,omitempty"`
	ReasonCode          *string          `json:"reason_code,omitempty"`
	Runtime             *string          `json:"runtime,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	Status              *string          `json:"status,omitempty"`
	SummaryJsonPath     *string          `json:"summary_json_path,omitempty"`
	SummaryType         string           `json:"summary_type"`
	TerminalDecision    *json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      *string          `json:"terminal_status,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type GateStartedPayload struct {
	AgentId             *string           `json:"agent_id,omitempty"`
	ArtifactReference   string            `json:"artifact_reference,omitempty"`
	Attempt             *float64          `json:"attempt,omitempty"`
	ContentCompleteness string            `json:"content_completeness,omitempty"`
	DispatchId          *string           `json:"dispatch_id,omitempty"`
	GateId              string            `json:"gate_id"`
	GateType            *string           `json:"gate_type,omitempty"`
	ModelCallId         *string           `json:"model_call_id,omitempty"`
	ModuleId            *string           `json:"module_id,omitempty"`
	Reviewers           []json.RawMessage `json:"reviewers,omitempty"`
	SessionKey          *string           `json:"session_key,omitempty"`
	Title               *string           `json:"title,omitempty"`
	ToolCallId          *string           `json:"tool_call_id,omitempty"`
}

type GateVerdictPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	BlockersCount       *float64 `json:"blockers_count,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64 `json:"duration_seconds,omitempty"`
	FixCycle            *float64 `json:"fix_cycle,omitempty"`
	GateId              string   `json:"gate_id"`
	GateType            *string  `json:"gate_type,omitempty"`
	GatewayLabel        *string  `json:"gateway_label,omitempty"`
	IssuesCount         *float64 `json:"issues_count,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	Reason              *string  `json:"reason,omitempty"`
	RunId               *string  `json:"run_id,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
	Verdict             string   `json:"verdict"`
}

type AgentSpawnRequestedPayload struct {
	AgentId                  *string          `json:"agent_id,omitempty"`
	AgentType                *string          `json:"agent_type,omitempty"`
	ArtifactReference        string           `json:"artifact_reference,omitempty"`
	Attempt                  *float64         `json:"attempt,omitempty"`
	ChildRunId               *string          `json:"child_run_id,omitempty"`
	ContentCompleteness      string           `json:"content_completeness,omitempty"`
	DispatchId               *string          `json:"dispatch_id,omitempty"`
	ExpectsCompletionMessage *bool            `json:"expects_completion_message,omitempty"`
	GateId                   *string          `json:"gate_id,omitempty"`
	GateType                 *string          `json:"gate_type,omitempty"`
	GatewayLabel             *string          `json:"gateway_label,omitempty"`
	Mode                     *string          `json:"mode,omitempty"`
	ModelCallId              *string          `json:"model_call_id,omitempty"`
	ModuleId                 *string          `json:"module_id,omitempty"`
	RequestedAt              *string          `json:"requested_at,omitempty"`
	RequesterOrigin          *json.RawMessage `json:"requester_origin,omitempty"`
	RequesterSessionKey      *string          `json:"requester_session_key,omitempty"`
	SessionKey               *string          `json:"session_key,omitempty"`
	SpawnMode                *string          `json:"spawn_mode,omitempty"`
	Thread                   *bool            `json:"thread,omitempty"`
	ToolCallId               *string          `json:"tool_call_id,omitempty"`
}

type AgentSpawnedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	AgentType           *string  `json:"agent_type,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	Dispatch            *string  `json:"dispatch,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	Label               *string  `json:"label,omitempty"`
	Model               *string  `json:"model,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	Substep             *string  `json:"substep,omitempty"`
	ThinkingLevel       *string  `json:"thinking_level,omitempty"`
	TimeoutMinutes      *float64 `json:"timeout_minutes,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type AgentDeliveryTargetPayload struct {
	AgentId                  *string          `json:"agent_id,omitempty"`
	AgentType                *string          `json:"agent_type,omitempty"`
	ArtifactReference        string           `json:"artifact_reference,omitempty"`
	Attempt                  *float64         `json:"attempt,omitempty"`
	ChildRunId               *string          `json:"child_run_id,omitempty"`
	ChildSessionKey          *string          `json:"child_session_key,omitempty"`
	ContentCompleteness      string           `json:"content_completeness,omitempty"`
	DispatchId               *string          `json:"dispatch_id,omitempty"`
	ExpectsCompletionMessage *bool            `json:"expects_completion_message,omitempty"`
	GateId                   *string          `json:"gate_id,omitempty"`
	GateType                 *string          `json:"gate_type,omitempty"`
	GatewayLabel             *string          `json:"gateway_label,omitempty"`
	ModelCallId              *string          `json:"model_call_id,omitempty"`
	ModuleId                 *string          `json:"module_id,omitempty"`
	RequesterOrigin          *json.RawMessage `json:"requester_origin,omitempty"`
	RequesterSessionKey      *string          `json:"requester_session_key,omitempty"`
	SessionKey               *string          `json:"session_key,omitempty"`
	SpawnMode                *string          `json:"spawn_mode,omitempty"`
	TargetedAt               *string          `json:"targeted_at,omitempty"`
	ToolCallId               *string          `json:"tool_call_id,omitempty"`
}

type AgentKilledPayload struct {
	AgentId             *string   `json:"agent_id,omitempty"`
	AgentType           *string   `json:"agent_type,omitempty"`
	ArtifactReference   string    `json:"artifact_reference,omitempty"`
	Attempt             *float64  `json:"attempt,omitempty"`
	ContentCompleteness string    `json:"content_completeness,omitempty"`
	DispatchId          *string   `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64  `json:"duration_seconds,omitempty"`
	FilesChanged        *[]string `json:"files_changed,omitempty"`
	GateId              *string   `json:"gate_id,omitempty"`
	GateType            *string   `json:"gate_type,omitempty"`
	HasChanges          *bool     `json:"has_changes,omitempty"`
	Label               *string   `json:"label,omitempty"`
	ModelCallId         *string   `json:"model_call_id,omitempty"`
	ModuleId            *string   `json:"module_id,omitempty"`
	Reason              *string   `json:"reason,omitempty"`
	SessionKey          *string   `json:"session_key,omitempty"`
	ToolCallId          *string   `json:"tool_call_id,omitempty"`
}

type AgentEndedPayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	AgentScope          *string          `json:"agent_scope,omitempty"`
	AgentType           *string          `json:"agent_type,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64         `json:"duration_seconds,omitempty"`
	EndedAt             *string          `json:"ended_at,omitempty"`
	Error               *json.RawMessage `json:"error,omitempty"`
	ErrorMessage        *string          `json:"error_message,omitempty"`
	FinalMessageCount   *float64         `json:"final_message_count,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	Label               *string          `json:"label,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	Outcome             *string          `json:"outcome,omitempty"`
	Reason              *string          `json:"reason,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type AgentLlmInputSummaryPayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	AgentType           *string          `json:"agent_type,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	HistoryMessageCount *float64         `json:"history_message_count,omitempty"`
	Model               *string          `json:"model,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	PromptChars         *float64         `json:"prompt_chars,omitempty"`
	Provider            *string          `json:"provider,omitempty"`
	Request             *json.RawMessage `json:"request,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	SystemPromptChars   *float64         `json:"system_prompt_chars,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type AgentLlmOutputSummaryPayload struct {
	AgentId                *string          `json:"agent_id,omitempty"`
	AgentType              *string          `json:"agent_type,omitempty"`
	ArtifactReference      string           `json:"artifact_reference,omitempty"`
	AssistantResponseChars *float64         `json:"assistant_response_chars,omitempty"`
	Attempt                *float64         `json:"attempt,omitempty"`
	ContentCompleteness    string           `json:"content_completeness,omitempty"`
	DispatchId             *string          `json:"dispatch_id,omitempty"`
	GateId                 *string          `json:"gate_id,omitempty"`
	GateType               *string          `json:"gate_type,omitempty"`
	GatewayLabel           *string          `json:"gateway_label,omitempty"`
	HistoryMessageCount    *float64         `json:"history_message_count,omitempty"`
	InputTokens            *float64         `json:"input_tokens,omitempty"`
	Model                  *string          `json:"model,omitempty"`
	ModelCallId            *string          `json:"model_call_id,omitempty"`
	ModuleId               *string          `json:"module_id,omitempty"`
	OutputTokens           *float64         `json:"output_tokens,omitempty"`
	Provider               *string          `json:"provider,omitempty"`
	ResponseChars          *float64         `json:"response_chars,omitempty"`
	SessionKey             *string          `json:"session_key,omitempty"`
	ToolCallId             *string          `json:"tool_call_id,omitempty"`
	Usage                  *json.RawMessage `json:"usage,omitempty"`
}

type AgentToolStartedPayload struct {
	AgentId             *string   `json:"agent_id,omitempty"`
	AgentType           *string   `json:"agent_type,omitempty"`
	ArtifactReference   string    `json:"artifact_reference,omitempty"`
	Attempt             float64   `json:"attempt"`
	ContentCompleteness string    `json:"content_completeness"`
	DispatchId          string    `json:"dispatch_id"`
	GateId              *string   `json:"gate_id,omitempty"`
	GateType            *string   `json:"gate_type,omitempty"`
	GatewayLabel        *string   `json:"gateway_label,omitempty"`
	ModelCallId         string    `json:"model_call_id"`
	ModuleId            string    `json:"module_id"`
	ParamKeys           *[]string `json:"param_keys,omitempty"`
	ParamsBytes         *float64  `json:"params_bytes,omitempty"`
	SessionKey          string    `json:"session_key"`
	ToolCallId          string    `json:"tool_call_id"`
	ToolName            string    `json:"tool_name"`
}

type AgentToolFinishedPayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	AgentType           *string          `json:"agent_type,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             float64          `json:"attempt"`
	ContentCompleteness string           `json:"content_completeness"`
	DispatchId          string           `json:"dispatch_id"`
	DurationSeconds     *float64         `json:"duration_seconds,omitempty"`
	Error               *json.RawMessage `json:"error"`
	ErrorMessage        *string          `json:"error_message,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	ModelCallId         string           `json:"model_call_id"`
	ModuleId            string           `json:"module_id"`
	Outcome             string           `json:"outcome"`
	Reason              *string          `json:"reason,omitempty"`
	ResultBytes         float64          `json:"result_bytes"`
	SessionKey          string           `json:"session_key"`
	ToolCallId          string           `json:"tool_call_id"`
	ToolName            string           `json:"tool_name"`
}

type AgentModelStartedPayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	AgentType           *string          `json:"agent_type,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	Model               *string          `json:"model,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	Provider            *string          `json:"provider,omitempty"`
	Request             *json.RawMessage `json:"request,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type AgentModelEndedPayload struct {
	Status              *string          `json:"status,omitempty"`
	AgentId             *string          `json:"agent_id,omitempty"`
	AgentType           *string          `json:"agent_type,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	CostUsd             *float64         `json:"cost_usd,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64         `json:"duration_seconds,omitempty"`
	Error               *json.RawMessage `json:"error,omitempty"`
	ErrorMessage        *string          `json:"error_message,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	InputTokens         *float64         `json:"input_tokens,omitempty"`
	Model               *string          `json:"model,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	Outcome             *string          `json:"outcome,omitempty"`
	OutputTokens        *float64         `json:"output_tokens,omitempty"`
	Provider            *string          `json:"provider,omitempty"`
	Reason              *string          `json:"reason,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
	Usage               *json.RawMessage `json:"usage,omitempty"`
}

type AgentSessionStartedPayload struct {
	Label               *string  `json:"label,omitempty"`
	TranscriptReference *string  `json:"transcript_reference,omitempty"`
	AgentId             *string  `json:"agent_id,omitempty"`
	AgentType           *string  `json:"agent_type,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	GatewayLabel        *string  `json:"gateway_label,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	SessionId           *string  `json:"session_id,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	StartedAt           *string  `json:"started_at,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type AgentSessionEndedPayload struct {
	TranscriptReference *string          `json:"transcript_reference,omitempty"`
	Status              *string          `json:"status,omitempty"`
	RuntimeMs           *float64         `json:"runtime_ms,omitempty"`
	AgentId             *string          `json:"agent_id,omitempty"`
	AgentType           *string          `json:"agent_type,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64         `json:"duration_seconds,omitempty"`
	EndedAt             *string          `json:"ended_at,omitempty"`
	Error               *json.RawMessage `json:"error,omitempty"`
	ErrorMessage        *string          `json:"error_message,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	Outcome             *string          `json:"outcome,omitempty"`
	Reason              *string          `json:"reason,omitempty"`
	SessionId           *string          `json:"session_id,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type AgentTranscriptPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	AgentType           *string  `json:"agent_type,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	Label               *string  `json:"label,omitempty"`
	LineCount           *float64 `json:"line_count,omitempty"`
	LineKind            string   `json:"line_kind,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	Text                string   `json:"text,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
	TranscriptOffset    *float64 `json:"transcript_offset,omitempty"`
}

type AgentProgressPayload struct {
	AgentId             *string            `json:"agent_id,omitempty"`
	AgentType           *string            `json:"agent_type,omitempty"`
	ArtifactReference   string             `json:"artifact_reference,omitempty"`
	Attempt             *float64           `json:"attempt,omitempty"`
	ContentCompleteness string             `json:"content_completeness,omitempty"`
	DispatchId          *string            `json:"dispatch_id,omitempty"`
	ElapsedSeconds      *float64           `json:"elapsed_seconds,omitempty"`
	FilesTouched        *[]json.RawMessage `json:"files_touched,omitempty"`
	GateId              *string            `json:"gate_id,omitempty"`
	GateType            *string            `json:"gate_type,omitempty"`
	Label               *string            `json:"label,omitempty"`
	LastActivity        *string            `json:"last_activity,omitempty"`
	ModelCallId         *string            `json:"model_call_id,omitempty"`
	ModuleId            *string            `json:"module_id,omitempty"`
	SessionKey          *string            `json:"session_key,omitempty"`
	Status              string             `json:"status,omitempty"`
	ToolCallId          *string            `json:"tool_call_id,omitempty"`
	TranscriptEvents    *float64           `json:"transcript_events,omitempty"`
}

type CostUpdatePayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	AgentType           *string  `json:"agent_type,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	CostUsd             *float64 `json:"cost_usd,omitempty"`
	CumulativeCostUsd   *float64 `json:"cumulative_cost_usd,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	EstimatedCostUsd    *float64 `json:"estimated_cost_usd,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	InputTokens         *float64 `json:"input_tokens,omitempty"`
	Label               *string  `json:"label,omitempty"`
	Model               *string  `json:"model,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	OutputTokens        *float64 `json:"output_tokens,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	TokensIn            *float64 `json:"tokens_in,omitempty"`
	TokensOut           *float64 `json:"tokens_out,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
	TotalCostUsd        *float64 `json:"total_cost_usd,omitempty"`
}

type RateLimitDetectedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	AgentType           *string  `json:"agent_type,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	CooldownMs          *float64 `json:"cooldown_ms,omitempty"`
	CooldownSource      *string  `json:"cooldown_source,omitempty"`
	Detail              *string  `json:"detail,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	GatewayLabel        *string  `json:"gateway_label,omitempty"`
	MaxPauses           *float64 `json:"max_pauses,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	PauseCount          *float64 `json:"pause_count,omitempty"`
	Provider            *string  `json:"provider,omitempty"`
	ResumeAt            *string  `json:"resume_at,omitempty"`
	RetryAfterSeconds   *float64 `json:"retry_after_seconds,omitempty"`
	RunId               *string  `json:"run_id,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type ObservabilityDegradedPayload struct {
	AgentId             *string            `json:"agent_id,omitempty"`
	AgentType           *string            `json:"agent_type,omitempty"`
	ArtifactReference   string             `json:"artifact_reference,omitempty"`
	Attempt             *float64           `json:"attempt,omitempty"`
	Authorization       *string            `json:"authorization,omitempty"`
	Component           string             `json:"component"`
	ContentCompleteness string             `json:"content_completeness,omitempty"`
	DegradedAt          *string            `json:"degraded_at,omitempty"`
	Detail              *string            `json:"detail,omitempty"`
	DispatchId          *string            `json:"dispatch_id,omitempty"`
	Error               *string            `json:"error,omitempty"`
	GateId              *string            `json:"gate_id,omitempty"`
	GateType            *string            `json:"gate_type,omitempty"`
	GatewayLabel        *string            `json:"gateway_label,omitempty"`
	HookId              *string            `json:"hook_id,omitempty"`
	ImpactedEventType   *string            `json:"impacted_event_type,omitempty"`
	ModelCallId         *string            `json:"model_call_id,omitempty"`
	ModuleId            *string            `json:"module_id,omitempty"`
	Payload             *json.RawMessage   `json:"payload,omitempty"`
	Reason              string             `json:"reason"`
	SessionKey          *string            `json:"session_key,omitempty"`
	StageId             *string            `json:"stage_id,omitempty"`
	Stdout              *string            `json:"stdout,omitempty"`
	StreamKey           *string            `json:"stream_key,omitempty"`
	Surface             string             `json:"surface"`
	ToolCallId          *string            `json:"tool_call_id,omitempty"`
	Transcript          *[]json.RawMessage `json:"transcript,omitempty"`
	ValidationErrors    *[]json.RawMessage `json:"validation_errors,omitempty"`
}

type ObservabilityRestoredPayload struct {
	AgentId             *string            `json:"agent_id,omitempty"`
	AgentType           *string            `json:"agent_type,omitempty"`
	ArtifactReference   string             `json:"artifact_reference,omitempty"`
	Attempt             *float64           `json:"attempt,omitempty"`
	Authorization       *string            `json:"authorization,omitempty"`
	Component           string             `json:"component"`
	ContentCompleteness string             `json:"content_completeness,omitempty"`
	DegradedAt          *string            `json:"degraded_at,omitempty"`
	Detail              *string            `json:"detail,omitempty"`
	DispatchId          *string            `json:"dispatch_id,omitempty"`
	Error               *string            `json:"error,omitempty"`
	GateId              *string            `json:"gate_id,omitempty"`
	GateType            *string            `json:"gate_type,omitempty"`
	GatewayLabel        *string            `json:"gateway_label,omitempty"`
	HookId              *string            `json:"hook_id,omitempty"`
	ImpactedEventType   *string            `json:"impacted_event_type,omitempty"`
	ModelCallId         *string            `json:"model_call_id,omitempty"`
	ModuleId            *string            `json:"module_id,omitempty"`
	Payload             *json.RawMessage   `json:"payload,omitempty"`
	Reason              string             `json:"reason"`
	RestoredAfterMs     *float64           `json:"restored_after_ms,omitempty"`
	RestoredAt          *string            `json:"restored_at,omitempty"`
	SessionKey          *string            `json:"session_key,omitempty"`
	StageId             *string            `json:"stage_id,omitempty"`
	Stdout              *string            `json:"stdout,omitempty"`
	StreamKey           *string            `json:"stream_key,omitempty"`
	Surface             string             `json:"surface"`
	ToolCallId          *string            `json:"tool_call_id,omitempty"`
	Transcript          *[]json.RawMessage `json:"transcript,omitempty"`
	ValidationErrors    *[]json.RawMessage `json:"validation_errors,omitempty"`
}

type ErrorEscalationPayload struct {
	Action              *string          `json:"action,omitempty"`
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	FailCount           *float64         `json:"fail_count,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	GatewayLabel        *string          `json:"gateway_label,omitempty"`
	LastFailure         *string          `json:"last_failure,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	StepId              *string          `json:"step_id,omitempty"`
	StepType            *string          `json:"step_type,omitempty"`
	TerminalDecision    *json.RawMessage `json:"terminal_decision,omitempty"`
	TerminalStatus      *string          `json:"terminal_status,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type ApprovalRequestedPayload struct {
	AgentId             *string           `json:"agent_id,omitempty"`
	ApprovalId          string            `json:"approval_id"`
	ArtifactReference   string            `json:"artifact_reference,omitempty"`
	Attempt             *float64          `json:"attempt,omitempty"`
	ContentCompleteness string            `json:"content_completeness,omitempty"`
	DispatchId          *string           `json:"dispatch_id,omitempty"`
	GateId              *string           `json:"gate_id,omitempty"`
	GateTitle           *string           `json:"gate_title,omitempty"`
	GateType            *string           `json:"gate_type,omitempty"`
	ModelCallId         *string           `json:"model_call_id,omitempty"`
	ModuleId            *string           `json:"module_id,omitempty"`
	Options             []json.RawMessage `json:"options"`
	Prompt              string            `json:"prompt"`
	SessionKey          *string           `json:"session_key,omitempty"`
	TimeoutMinutes      *float64          `json:"timeout_minutes,omitempty"`
	TimeoutPolicy       json.RawMessage   `json:"timeout_policy,omitempty"`
	ToolCallId          *string           `json:"tool_call_id,omitempty"`
}

type ApprovalResolvedPayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ApprovalId          string   `json:"approval_id"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	Choice              *string  `json:"choice,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DecisionBy          *string  `json:"decision_by,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	ResolvedBy          *string  `json:"resolved_by,omitempty"`
	SessionKey          *string  `json:"session_key,omitempty"`
	Status              *string  `json:"status,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type BudgetWarningPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	BudgetUsd           *float64        `json:"budget_usd,omitempty"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	Current             float64         `json:"current"`
	CurrentCostUsd      *float64        `json:"current_cost_usd,omitempty"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	Limit               float64         `json:"limit"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	PercentUsed         *float64        `json:"percent_used,omitempty"`
	SessionKey          *string         `json:"session_key,omitempty"`
	Threshold           json.RawMessage `json:"threshold"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
	Unit                string          `json:"unit"`
}

type BudgetExceededPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	BudgetUsd           *float64        `json:"budget_usd,omitempty"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	Current             float64         `json:"current"`
	CurrentCostUsd      *float64        `json:"current_cost_usd,omitempty"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	Limit               float64         `json:"limit"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	PercentUsed         *float64        `json:"percent_used,omitempty"`
	SessionKey          *string         `json:"session_key,omitempty"`
	Threshold           json.RawMessage `json:"threshold"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
	Unit                string          `json:"unit"`
}

type PluginEventPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	AgentType           *string         `json:"agent_type,omitempty"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	Details             json.RawMessage `json:"details"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	DurationSeconds     *float64        `json:"duration_seconds,omitempty"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	GatewayLabel        *string         `json:"gateway_label,omitempty"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	Outcome             *string         `json:"outcome,omitempty"`
	PluginEvent         string          `json:"plugin_event"`
	PluginId            string          `json:"plugin_id"`
	Reason              *string         `json:"reason,omitempty"`
	SessionKey          *string         `json:"session_key,omitempty"`
	Severity            *string         `json:"severity,omitempty"`
	Status              *string         `json:"status,omitempty"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
}

type ArtifactPublishedPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	ArtifactId          string          `json:"artifact_id"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	ByteLength          int64           `json:"byte_length"`
	Completeness        json.RawMessage `json:"completeness,omitempty"`
	ContentClass        json.RawMessage `json:"content_class"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	Kind                string          `json:"kind"`
	LogicalId           string          `json:"logical_id"`
	MediaType           string          `json:"media_type"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	OriginalByteLength  *int64          `json:"original_byte_length,omitempty"`
	OriginalSha256      *string         `json:"original_sha256,omitempty"`
	Reference           string          `json:"reference"`
	SessionKey          *string         `json:"session_key,omitempty"`
	Sha256              string          `json:"sha256"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
	Transformation      *string         `json:"transformation,omitempty"`
}

type LifecycleTransitionPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	Authority           string          `json:"authority"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	EffectiveAt         string          `json:"effective_at"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	LifecycleVersion    json.RawMessage `json:"lifecycle_version"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	NewState            string          `json:"new_state"`
	PreviousState       *string         `json:"previous_state"`
	ReasonCode          string          `json:"reason_code"`
	SessionKey          *string         `json:"session_key,omitempty"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
}

type LifecycleSnapshotPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	EventCount          float64         `json:"event_count,omitempty"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	LastCursor          *string         `json:"last_cursor,omitempty"`
	LifecycleVersion    string          `json:"lifecycle_version"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	ReadModels          json.RawMessage `json:"read_models"`
	SessionKey          *string         `json:"session_key,omitempty"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
}

type ProducerHealthPayload struct {
	AgentId           *string  `json:"agent_id,omitempty"`
	ArtifactReference string   `json:"artifact_reference,omitempty"`
	Attempt           *float64 `json:"attempt,omitempty"`
	Checkpoint        *string  `json:"checkpoint,omitempty"`
	Capabilities      []struct {
		Capability string           `json:"capability"`
		Details    *json.RawMessage `json:"details,omitempty"`
		ReasonCode *string          `json:"reason_code"`
		Status     json.RawMessage  `json:"status"`
	} `json:"capabilities"`
	ContentCompleteness    string           `json:"content_completeness,omitempty"`
	DeadLetterCount        int64            `json:"dead_letter_count"`
	DispatchId             *string          `json:"dispatch_id,omitempty"`
	GateId                 *string          `json:"gate_id,omitempty"`
	GateType               *string          `json:"gate_type,omitempty"`
	InvalidCount           int64            `json:"invalid_count"`
	Lag                    *int64           `json:"lag,omitempty"`
	LastSuccessfulEmission *string          `json:"last_successful_emission"`
	MissingPayloadCount    int64            `json:"missing_payload_count,omitempty"`
	ModelCallId            *string          `json:"model_call_id,omitempty"`
	ModuleId               *string          `json:"module_id,omitempty"`
	ProducerId             string           `json:"producer_id"`
	QuarantinedCount       int64            `json:"quarantined_count"`
	Reconciliation         *json.RawMessage `json:"reconciliation,omitempty"`
	RestartCount           int64            `json:"restart_count,omitempty"`
	SessionKey             *string          `json:"session_key,omitempty"`
	Status                 json.RawMessage  `json:"status"`
	ToolCallId             *string          `json:"tool_call_id,omitempty"`
}

type TerminalClosurePayload struct {
	AgentId             *string           `json:"agent_id,omitempty"`
	ArtifactReference   string            `json:"artifact_reference,omitempty"`
	Attempt             *float64          `json:"attempt,omitempty"`
	ContentCompleteness string            `json:"content_completeness,omitempty"`
	Cost                *json.RawMessage  `json:"cost,omitempty"`
	Counts              json.RawMessage   `json:"counts,omitempty"`
	DispatchId          *string           `json:"dispatch_id,omitempty"`
	DurationMs          *int64            `json:"duration_ms,omitempty"`
	GateId              *string           `json:"gate_id,omitempty"`
	GateType            *string           `json:"gate_type,omitempty"`
	LastWorkId          *string           `json:"last_work_id,omitempty"`
	ManifestFingerprint string            `json:"manifest_fingerprint"`
	ModelCallId         *string           `json:"model_call_id,omitempty"`
	ModuleId            *string           `json:"module_id,omitempty"`
	Observability       json.RawMessage   `json:"observability"`
	Outcome             json.RawMessage   `json:"outcome"`
	ReasonCode          string            `json:"reason_code"`
	References          []json.RawMessage `json:"references,omitempty"`
	SessionKey          *string           `json:"session_key,omitempty"`
	ToolCallId          *string           `json:"tool_call_id,omitempty"`
}

type RuntimeLogPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	Component           string          `json:"component"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	ErrorClass          *string         `json:"error_class,omitempty"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	Level               json.RawMessage `json:"level"`
	Message             string          `json:"message"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	ReasonCode          *string         `json:"reason_code,omitempty"`
	SessionKey          *string         `json:"session_key,omitempty"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
}

type GitEvidencePayload struct {
	AgentId             *string  `json:"agent_id,omitempty"`
	ArtifactReference   string   `json:"artifact_reference,omitempty"`
	Attempt             *float64 `json:"attempt,omitempty"`
	Branch              *string  `json:"branch,omitempty"`
	ContentCompleteness string   `json:"content_completeness,omitempty"`
	DiffReference       *string  `json:"diff_reference,omitempty"`
	DiffStat            *string  `json:"diff_stat,omitempty"`
	Dirty               *bool    `json:"dirty,omitempty"`
	DispatchId          *string  `json:"dispatch_id,omitempty"`
	FilesTouched        []string `json:"files_touched,omitempty"`
	FinalCommit         *string  `json:"final_commit,omitempty"`
	GateId              *string  `json:"gate_id,omitempty"`
	GateType            *string  `json:"gate_type,omitempty"`
	ModelCallId         *string  `json:"model_call_id,omitempty"`
	ModuleId            *string  `json:"module_id,omitempty"`
	Repository          string   `json:"repository"`
	SessionKey          *string  `json:"session_key,omitempty"`
	StartingCommit      *string  `json:"starting_commit,omitempty"`
	ToolCallId          *string  `json:"tool_call_id,omitempty"`
}

type QualityEvidencePayload struct {
	AgentId             *string           `json:"agent_id,omitempty"`
	ArtifactReference   string            `json:"artifact_reference,omitempty"`
	ArtifactReferences  []json.RawMessage `json:"artifact_references,omitempty"`
	Attempt             *float64          `json:"attempt,omitempty"`
	Check               *string           `json:"check,omitempty"`
	ContentCompleteness string            `json:"content_completeness,omitempty"`
	DispatchId          *string           `json:"dispatch_id,omitempty"`
	Dispositions        []json.RawMessage `json:"dispositions,omitempty"`
	Findings            []json.RawMessage `json:"findings,omitempty"`
	GateId              *string           `json:"gate_id,omitempty"`
	GateType            *string           `json:"gate_type,omitempty"`
	ItemType            string            `json:"item_type"`
	ModelCallId         *string           `json:"model_call_id,omitempty"`
	ModuleId            *string           `json:"module_id,omitempty"`
	PreviewUrl          *string           `json:"preview_url,omitempty"`
	SessionKey          *string           `json:"session_key,omitempty"`
	SkippedReason       *string           `json:"skipped_reason,omitempty"`
	SourceCommit        *string           `json:"source_commit,omitempty"`
	Suite               *string           `json:"suite,omitempty"`
	ToolCallId          *string           `json:"tool_call_id,omitempty"`
	Verdict             string            `json:"verdict"`
}

type InfrastructureEvidencePayload struct {
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	Delivery            *json.RawMessage `json:"delivery,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	EvidenceType        string           `json:"evidence_type"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	Gateway             *json.RawMessage `json:"gateway,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	NamespaceLease      *json.RawMessage `json:"namespace_lease,omitempty"`
	PreviewUrl          *string          `json:"preview_url,omitempty"`
	Readiness           *bool            `json:"readiness,omitempty"`
	Redis               *json.RawMessage `json:"redis,omitempty"`
	ResourceUsage       *json.RawMessage `json:"resource_usage,omitempty"`
	Restarts            *float64         `json:"restarts,omitempty"`
	Rollout             *json.RawMessage `json:"rollout,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	Status              string           `json:"status"`
	TerminationReason   *string          `json:"termination_reason,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
	Workload            *json.RawMessage `json:"workload,omitempty"`
}

type EvaluationFactPayload struct {
	AgentId             *string         `json:"agent_id,omitempty"`
	ArtifactReference   string          `json:"artifact_reference,omitempty"`
	Attempt             *float64        `json:"attempt,omitempty"`
	ContentCompleteness string          `json:"content_completeness,omitempty"`
	Dimension           string          `json:"dimension"`
	DispatchId          *string         `json:"dispatch_id,omitempty"`
	Fingerprint         *string         `json:"fingerprint,omitempty"`
	GateId              *string         `json:"gate_id,omitempty"`
	GateType            *string         `json:"gate_type,omitempty"`
	ModelCallId         *string         `json:"model_call_id,omitempty"`
	ModuleId            *string         `json:"module_id,omitempty"`
	SessionKey          *string         `json:"session_key,omitempty"`
	ToolCallId          *string         `json:"tool_call_id,omitempty"`
	Value               json.RawMessage `json:"value"`
}

type CommandRequestedPayload struct {
	Actor                    string           `json:"actor"`
	AgentId                  *string          `json:"agent_id,omitempty"`
	ArtifactReference        string           `json:"artifact_reference,omitempty"`
	Attempt                  *float64         `json:"attempt,omitempty"`
	Capability               string           `json:"capability"`
	CommandId                string           `json:"command_id"`
	CommandType              json.RawMessage  `json:"command_type"`
	ContentCompleteness      string           `json:"content_completeness,omitempty"`
	Decision                 *string          `json:"decision,omitempty"`
	DispatchId               *string          `json:"dispatch_id,omitempty"`
	ExpectedLifecycleVersion int64            `json:"expected_lifecycle_version"`
	ExpiresAt                string           `json:"expires_at"`
	IssuedAt                 string           `json:"issued_at"`
	Reason                   string           `json:"reason"`
	GateId                   *string          `json:"gate_id,omitempty"`
	GateType                 *string          `json:"gate_type,omitempty"`
	ModelCallId              *string          `json:"model_call_id,omitempty"`
	ModuleId                 *string          `json:"module_id,omitempty"`
	SessionKey               *string          `json:"session_key,omitempty"`
	Target                   *json.RawMessage `json:"target,omitempty"`
	ToolCallId               *string          `json:"tool_call_id,omitempty"`
}

type CommandAcceptedPayload struct {
	Actor               *string          `json:"actor,omitempty"`
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	CommandId           string           `json:"command_id"`
	CommandType         string           `json:"command_type"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	Target              *json.RawMessage `json:"target,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type CommandRejectedPayload struct {
	Actor               *string          `json:"actor,omitempty"`
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	CommandId           string           `json:"command_id"`
	CommandType         *string          `json:"command_type,omitempty"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	ReasonCode          string           `json:"reason_code"`
	SessionKey          *string          `json:"session_key,omitempty"`
	Target              *json.RawMessage `json:"target,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}

type CommandCompletedPayload struct {
	Actor               *string          `json:"actor,omitempty"`
	AgentId             *string          `json:"agent_id,omitempty"`
	ArtifactReference   string           `json:"artifact_reference,omitempty"`
	Attempt             *float64         `json:"attempt,omitempty"`
	CommandId           string           `json:"command_id"`
	CommandType         string           `json:"command_type"`
	ContentCompleteness string           `json:"content_completeness,omitempty"`
	DispatchId          *string          `json:"dispatch_id,omitempty"`
	GateId              *string          `json:"gate_id,omitempty"`
	GateType            *string          `json:"gate_type,omitempty"`
	ModelCallId         *string          `json:"model_call_id,omitempty"`
	ModuleId            *string          `json:"module_id,omitempty"`
	Result              *json.RawMessage `json:"result,omitempty"`
	ReasonCode          *string          `json:"reason_code,omitempty"`
	SessionKey          *string          `json:"session_key,omitempty"`
	Target              *json.RawMessage `json:"target,omitempty"`
	ToolCallId          *string          `json:"tool_call_id,omitempty"`
}
