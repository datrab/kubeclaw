import type { AgentObservabilityIngressEventV1 } from '../../agent-observability/src/index.ts';

export type AgentObservabilityEvidenceSeverity = 'info' | 'warning' | 'critical';

export type AgentObservabilityEvidenceRecordType =
  | 'agent.spawned'
  | 'agent.ended'
  | 'agent.session.ended'
  | 'agent.tool.started'
  | 'agent.tool.finished'
  | 'agent.model.started'
  | 'agent.model.ended'
  | 'agent.llm.input'
  | 'agent.llm.output'
  | 'agent.rate_limited'
  | 'agent.failure'
  | string;

export interface AgentObservabilityEvidenceIdentity {
  run_id?: string;
  project?: string;
  session_key?: string;
  session_id?: string;
  gateway_label?: string;
  dispatch_id?: string;
  agent_id?: string;
  agent_type?: string;
  module_id?: string;
  gate_id?: string;
  tool_call_id?: string;
  model_call_id?: string;
  parent_session_key?: string;
  child_session_key?: string;
}

export interface AgentObservabilityLegacyEvidenceRecord {
  type: AgentObservabilityEvidenceRecordType;
  ts: string;
  source?: string;
  identity?: AgentObservabilityEvidenceIdentity;
  outcome?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
}

export interface AgentObservabilityRedisPressureSnapshot {
  controlPending?: number;
  controlLag?: number;
  payloadLength?: number;
  payloadBytes?: number;
  memoryBytes?: number;
  controlLagThreshold?: number;
  payloadPressureThreshold?: number;
  payloadBytesThreshold?: number;
  memoryPressureThreshold?: number;
}

export interface AgentObservabilityParallelRunEvidenceInput {
  observedEvents: AgentObservabilityIngressEventV1[];
  legacyRecords?: AgentObservabilityLegacyEvidenceRecord[];
  redisPressure?: AgentObservabilityRedisPressureSnapshot;
  generatedAt?: string;
}

export interface AgentObservabilityParallelRunEvidenceOptions {
  sessionEndTimingToleranceMs?: number;
  now?: Date;
}

export interface AgentObservabilityNormalizedEvidenceRecord {
  type: AgentObservabilityEvidenceRecordType;
  observed_type?: string;
  source: string;
  ts: string;
  identity: AgentObservabilityEvidenceIdentity;
  outcome?: string | null;
  reason?: string | null;
}

export interface AgentObservabilityEvidenceIssue {
  code: string;
  severity: AgentObservabilityEvidenceSeverity;
  message: string;
  identity?: AgentObservabilityEvidenceIdentity;
  observed_type?: string;
  legacy_type?: string;
  details?: Record<string, unknown>;
}

export interface AgentObservabilityCoverageSummary {
  observed: number;
  legacy: number;
  missing_observed: number;
  missing_legacy: number;
  coverage: number | null;
}

export interface AgentObservabilitySpanCompletenessSummary {
  started: number;
  finished: number;
  complete: number;
  orphan_started: number;
  orphan_finished: number;
}

export interface AgentObservabilityLlmCoverageSummary {
  inputs: number;
  outputs: number;
  paired: number;
  input_without_output: number;
  output_without_input: number;
}

export interface AgentObservabilitySessionTimingSummary {
  compared: number;
  max_delta_ms: number | null;
  out_of_tolerance: number;
}

export interface AgentObservabilityRedisPressureSummary {
  control_pending: number | null;
  control_lag: number | null;
  payload_length: number | null;
  payload_bytes: number | null;
  memory_bytes: number | null;
  degraded: string[];
}

export interface AgentObservabilityParallelRunEvidenceV1 {
  v: 1;
  generated_at: string;
  status: 'ok' | 'warning' | 'degraded';
  observed_counts: Record<string, number>;
  legacy_counts: Record<string, number>;
  coverage: {
    spawn: AgentObservabilityCoverageSummary;
    agent_end: AgentObservabilityCoverageSummary;
    session_end: AgentObservabilityCoverageSummary;
    rate_limit: AgentObservabilityCoverageSummary;
    failure: AgentObservabilityCoverageSummary;
  };
  spans: {
    tool: AgentObservabilitySpanCompletenessSummary;
    model: AgentObservabilitySpanCompletenessSummary;
    llm: AgentObservabilityLlmCoverageSummary;
  };
  session_end_timing: AgentObservabilitySessionTimingSummary;
  identity_gaps: AgentObservabilityEvidenceIssue[];
  redis_pressure: AgentObservabilityRedisPressureSummary;
  issues: AgentObservabilityEvidenceIssue[];
}
