import type {
  AgentObservabilityIngressEventV1,
  AgentObservabilityIngressPayloadV1,
} from '../../agent-observability/src/index.ts';
import type {
  AgentObservabilityCoverageSummary,
  AgentObservabilityEvidenceIdentity,
  AgentObservabilityEvidenceIssue,
  AgentObservabilityEvidenceRecordType,
  AgentObservabilityLegacyEvidenceRecord,
  AgentObservabilityLlmCoverageSummary,
  AgentObservabilityNormalizedEvidenceRecord,
  AgentObservabilityParallelRunEvidenceInput,
  AgentObservabilityParallelRunEvidenceOptions,
  AgentObservabilityParallelRunEvidenceV1,
  AgentObservabilityRedisPressureSnapshot,
  AgentObservabilityRedisPressureSummary,
  AgentObservabilitySessionTimingSummary,
  AgentObservabilitySpanCompletenessSummary,
} from './types.ts';

const DEFAULT_SESSION_END_TIMING_TOLERANCE_MS = 30_000;
const DEFAULT_CONTROL_LAG_THRESHOLD = 1_000;
const DEFAULT_PAYLOAD_PRESSURE_THRESHOLD = 10_000;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function issue(
  code: string,
  severity: AgentObservabilityEvidenceIssue['severity'],
  message: string,
  extra: Omit<AgentObservabilityEvidenceIssue, 'code' | 'severity' | 'message'> = {},
): AgentObservabilityEvidenceIssue {
  return { code, severity, message, ...extra };
}

function eventTimestampMs(ts: string): number | null {
  const value = Date.parse(ts);
  return Number.isFinite(value) ? value : null;
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function mapObservedType(type: string): AgentObservabilityEvidenceRecordType {
  switch (type) {
    case 'openclaw.subagent.spawned':
      return 'agent.spawned';
    case 'openclaw.agent.ended':
    case 'openclaw.subagent.ended':
      return 'agent.ended';
    case 'openclaw.session.ended':
      return 'agent.session.ended';
    case 'openclaw.tool.started':
      return 'agent.tool.started';
    case 'openclaw.tool.finished':
      return 'agent.tool.finished';
    case 'openclaw.model.started':
      return 'agent.model.started';
    case 'openclaw.model.ended':
      return 'agent.model.ended';
    case 'openclaw.llm.input':
      return 'agent.llm.input';
    case 'openclaw.llm.output':
      return 'agent.llm.output';
    default:
      return type;
  }
}

function payloadString(payload: AgentObservabilityIngressPayloadV1, key: string): string | undefined {
  return stringValue((payload as unknown as Record<string, unknown>)[key]);
}

function classifyObservedOutcome(event: AgentObservabilityIngressEventV1): AgentObservabilityEvidenceRecordType | null {
  const payload = event.payload as unknown as Record<string, unknown>;
  const outcome = stringValue(payload.outcome)?.toLowerCase() ?? '';
  const reason = stringValue(payload.reason)?.toLowerCase() ?? '';
  const hasError = payload.error !== undefined && payload.error !== null;
  const error = hasError ? JSON.stringify(payload.error).toLowerCase() : '';
  const haystack = `${outcome} ${reason} ${error}`;
  if (haystack.includes('rate') && haystack.includes('limit')) return 'agent.rate_limited';
  if (outcome === 'error' || outcome === 'failed' || outcome === 'failure' || hasError) return 'agent.failure';
  return null;
}

function observedIdentity(event: AgentObservabilityIngressEventV1): AgentObservabilityEvidenceIdentity {
  return { ...event.identity };
}

function normalizeObservedEvent(event: AgentObservabilityIngressEventV1): AgentObservabilityNormalizedEvidenceRecord[] {
  const base: AgentObservabilityNormalizedEvidenceRecord = {
    type: mapObservedType(event.type),
    observed_type: event.type,
    source: event.source,
    ts: event.ts,
    identity: observedIdentity(event),
    outcome: payloadString(event.payload, 'outcome') ?? null,
    reason: payloadString(event.payload, 'reason') ?? null,
  };
  const classified = classifyObservedOutcome(event);
  return classified ? [base, { ...base, type: classified }] : [base];
}

function normalizeLegacyRecord(record: AgentObservabilityLegacyEvidenceRecord): AgentObservabilityNormalizedEvidenceRecord {
  return {
    type: record.type,
    source: record.source ?? 'legacy.acp-gateway-polling',
    ts: record.ts,
    identity: { ...(record.identity ?? {}) },
    outcome: record.outcome ?? null,
    reason: record.reason ?? null,
  };
}

function identityKey(record: AgentObservabilityNormalizedEvidenceRecord): string {
  const identity = record.identity;
  return [
    identity.run_id,
    identity.dispatch_id,
    identity.session_key ?? identity.child_session_key,
    identity.gateway_label,
    identity.tool_call_id,
    identity.model_call_id,
    identity.module_id,
    identity.gate_id,
    identity.agent_type ?? identity.agent_id,
  ].filter(Boolean).join('|') || `${record.type}|${record.ts}`;
}

function entityKey(record: AgentObservabilityNormalizedEvidenceRecord): string {
  const identity = record.identity;
  const sessionIdentity = record.type === 'agent.spawned'
    ? identity.child_session_key ?? identity.session_key ?? identity.gateway_label
    : identity.session_key ?? identity.child_session_key ?? identity.gateway_label;
  return [
    identity.run_id,
    identity.dispatch_id,
    sessionIdentity,
    identity.module_id,
    identity.gate_id,
    identity.agent_type ?? identity.agent_id,
  ].filter(Boolean).join('|') || identityKey(record);
}

function spanKey(record: AgentObservabilityNormalizedEvidenceRecord, field: 'tool_call_id' | 'model_call_id'): string {
  const identity = record.identity;
  return [
    identity.run_id,
    identity.dispatch_id,
    identity.session_key,
    identity[field],
  ].filter(Boolean).join('|') || entityKey(record);
}

function countByType(records: AgentObservabilityNormalizedEvidenceRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) bump(counts, record.type);
  return counts;
}

function recordsOf(records: AgentObservabilityNormalizedEvidenceRecord[], type: string): AgentObservabilityNormalizedEvidenceRecord[] {
  return records.filter((record) => record.type === type);
}

function coverage(
  observed: AgentObservabilityNormalizedEvidenceRecord[],
  legacy: AgentObservabilityNormalizedEvidenceRecord[],
  type: string,
): AgentObservabilityCoverageSummary {
  const observedKeys = new Set(recordsOf(observed, type).map(entityKey));
  const legacyKeys = new Set(recordsOf(legacy, type).map(entityKey));
  let matched = 0;
  for (const key of legacyKeys) if (observedKeys.has(key)) matched += 1;
  return {
    observed: observedKeys.size,
    legacy: legacyKeys.size,
    missing_observed: [...legacyKeys].filter((key) => !observedKeys.has(key)).length,
    missing_legacy: [...observedKeys].filter((key) => !legacyKeys.has(key)).length,
    coverage: legacyKeys.size === 0 ? null : matched / legacyKeys.size,
  };
}

function spanCompleteness(
  records: AgentObservabilityNormalizedEvidenceRecord[],
  startedType: string,
  finishedType: string,
  field: 'tool_call_id' | 'model_call_id',
): AgentObservabilitySpanCompletenessSummary {
  const started = new Set(recordsOf(records, startedType).map((record) => spanKey(record, field)));
  const finished = new Set(recordsOf(records, finishedType).map((record) => spanKey(record, field)));
  let complete = 0;
  for (const key of started) if (finished.has(key)) complete += 1;
  return {
    started: started.size,
    finished: finished.size,
    complete,
    orphan_started: [...started].filter((key) => !finished.has(key)).length,
    orphan_finished: [...finished].filter((key) => !started.has(key)).length,
  };
}

function llmCoverage(records: AgentObservabilityNormalizedEvidenceRecord[]): AgentObservabilityLlmCoverageSummary {
  const inputs = new Set(recordsOf(records, 'agent.llm.input').map((record) => spanKey(record, 'model_call_id')));
  const outputs = new Set(recordsOf(records, 'agent.llm.output').map((record) => spanKey(record, 'model_call_id')));
  let paired = 0;
  for (const key of inputs) if (outputs.has(key)) paired += 1;
  return {
    inputs: inputs.size,
    outputs: outputs.size,
    paired,
    input_without_output: [...inputs].filter((key) => !outputs.has(key)).length,
    output_without_input: [...outputs].filter((key) => !inputs.has(key)).length,
  };
}

function sessionEndTiming(
  observed: AgentObservabilityNormalizedEvidenceRecord[],
  legacy: AgentObservabilityNormalizedEvidenceRecord[],
  toleranceMs: number,
  issues: AgentObservabilityEvidenceIssue[],
): AgentObservabilitySessionTimingSummary {
  const observedByKey = new Map(recordsOf(observed, 'agent.session.ended').map((record) => [entityKey(record), record]));
  let compared = 0;
  let maxDelta: number | null = null;
  let outOfTolerance = 0;
  for (const legacyRecord of recordsOf(legacy, 'agent.session.ended')) {
    const observedRecord = observedByKey.get(entityKey(legacyRecord));
    if (!observedRecord) continue;
    const legacyTs = eventTimestampMs(legacyRecord.ts);
    const observedTs = eventTimestampMs(observedRecord.ts);
    if (legacyTs === null || observedTs === null) continue;
    const delta = Math.abs(observedTs - legacyTs);
    compared += 1;
    maxDelta = Math.max(maxDelta ?? 0, delta);
    if (delta > toleranceMs) {
      outOfTolerance += 1;
      issues.push(issue('session_end_timing_delta', 'warning', 'Hook session_end timing differs from legacy polling beyond tolerance.', {
        identity: observedRecord.identity,
        details: { delta_ms: delta, tolerance_ms: toleranceMs },
      }));
    }
  }
  return { compared, max_delta_ms: maxDelta, out_of_tolerance: outOfTolerance };
}

function identityGaps(records: AgentObservabilityNormalizedEvidenceRecord[]): AgentObservabilityEvidenceIssue[] {
  const gaps: AgentObservabilityEvidenceIssue[] = [];
  for (const record of records) {
    const identity = record.identity;
    const missing: string[] = [];
    if (!identity.session_key && !identity.child_session_key) missing.push('session_key');
    if (!identity.dispatch_id) missing.push('dispatch_id');
    if (!identity.gateway_label) missing.push('gateway_label');
    if (!identity.agent_type && !identity.agent_id) missing.push('agent_type');
    if (record.type === 'agent.tool.started' || record.type === 'agent.tool.finished') {
      if (!identity.tool_call_id) missing.push('tool_call_id');
    }
    if (record.type === 'agent.model.started' || record.type === 'agent.model.ended' || record.type.startsWith('agent.llm.')) {
      if (!identity.model_call_id) missing.push('model_call_id');
    }
    if (missing.length > 0) {
      const issueData: Omit<AgentObservabilityEvidenceIssue, 'severity' | 'code' | 'message'> = {
        identity,
        details: { type: record.type, missing },
      };
      if (record.observed_type !== undefined) issueData.observed_type = record.observed_type;
      gaps.push(issue('identity_gap', 'warning', 'Observed hook record is missing comparison identity fields.', issueData));
    }
  }
  return gaps;
}

function pressureSummary(input?: AgentObservabilityRedisPressureSnapshot): AgentObservabilityRedisPressureSummary {
  const controlPending = numberValue(input?.controlPending) ?? null;
  const controlLag = numberValue(input?.controlLag) ?? controlPending;
  const payloadLength = numberValue(input?.payloadLength) ?? null;
  const payloadBytes = numberValue(input?.payloadBytes) ?? null;
  const memoryBytes = numberValue(input?.memoryBytes) ?? null;
  const controlLagThreshold = numberValue(input?.controlLagThreshold) ?? DEFAULT_CONTROL_LAG_THRESHOLD;
  const payloadPressureThreshold = numberValue(input?.payloadPressureThreshold) ?? DEFAULT_PAYLOAD_PRESSURE_THRESHOLD;
  const payloadBytesThreshold = numberValue(input?.payloadBytesThreshold);
  const memoryPressureThreshold = numberValue(input?.memoryPressureThreshold);
  const degraded: string[] = [];
  if (controlLag !== null && controlLag > controlLagThreshold) degraded.push('control_lag');
  if (payloadLength !== null && payloadLength > payloadPressureThreshold) degraded.push('payload_stream_length');
  if (payloadBytes !== null && payloadBytesThreshold !== null && payloadBytes > payloadBytesThreshold) degraded.push('payload_stream_bytes');
  if (memoryBytes !== null && memoryPressureThreshold !== null && memoryBytes > memoryPressureThreshold) degraded.push('redis_memory');
  return {
    control_pending: controlPending,
    control_lag: controlLag,
    payload_length: payloadLength,
    payload_bytes: payloadBytes,
    memory_bytes: memoryBytes,
    degraded,
  };
}

function coverageIssues(summary: AgentObservabilityParallelRunEvidenceV1['coverage']): AgentObservabilityEvidenceIssue[] {
  const issues: AgentObservabilityEvidenceIssue[] = [];
  for (const [name, item] of Object.entries(summary)) {
    if (item.missing_observed > 0) {
      issues.push(issue(`${name}_missing_hook_evidence`, 'warning', `Legacy ${name} evidence has no matching hook record.`, {
        details: { missing_observed: item.missing_observed },
      }));
    }
  }
  return issues;
}

export function compareAgentObservabilityParallelRunEvidence(
  input: AgentObservabilityParallelRunEvidenceInput,
  options: AgentObservabilityParallelRunEvidenceOptions = {},
): AgentObservabilityParallelRunEvidenceV1 {
  const generatedAt = input.generatedAt ?? (options.now ?? new Date()).toISOString();
  const observed = input.observedEvents.flatMap(normalizeObservedEvent);
  const legacy = (input.legacyRecords ?? []).map(normalizeLegacyRecord);
  const issues: AgentObservabilityEvidenceIssue[] = [];
  const identityGapIssues = identityGaps(observed);

  const coverageSummary = {
    spawn: coverage(observed, legacy, 'agent.spawned'),
    agent_end: coverage(observed, legacy, 'agent.ended'),
    session_end: coverage(observed, legacy, 'agent.session.ended'),
    rate_limit: coverage(observed, legacy, 'agent.rate_limited'),
    failure: coverage(observed, legacy, 'agent.failure'),
  };

  issues.push(...coverageIssues(coverageSummary));

  const spans = {
    tool: spanCompleteness(observed, 'agent.tool.started', 'agent.tool.finished', 'tool_call_id'),
    model: spanCompleteness(observed, 'agent.model.started', 'agent.model.ended', 'model_call_id'),
    llm: llmCoverage(observed),
  };

  if (spans.tool.orphan_started || spans.tool.orphan_finished) {
    issues.push(issue('tool_span_incomplete', 'warning', 'Observed tool started/finished records are not fully paired.', { details: { ...spans.tool } }));
  }
  if (spans.model.orphan_started || spans.model.orphan_finished) {
    issues.push(issue('model_span_incomplete', 'warning', 'Observed model started/ended records are not fully paired.', { details: { ...spans.model } }));
  }
  if (spans.llm.input_without_output || spans.llm.output_without_input) {
    issues.push(issue('llm_payload_unpaired', 'info', 'Observed LLM input/output payload records are not fully paired.', { details: { ...spans.llm } }));
  }

  const sessionTiming = sessionEndTiming(
    observed,
    legacy,
    options.sessionEndTimingToleranceMs ?? DEFAULT_SESSION_END_TIMING_TOLERANCE_MS,
    issues,
  );
  const redisPressure = pressureSummary(input.redisPressure);
  if (redisPressure.degraded.length > 0) {
    issues.push(issue('redis_observability_pressure', 'warning', 'Agent-observability Redis stream pressure exceeded configured evidence thresholds.', {
      details: { degraded: redisPressure.degraded },
    }));
  }

  issues.push(...identityGapIssues);
  const hasCritical = issues.some((item) => item.severity === 'critical');
  const hasWarnings = issues.some((item) => item.severity === 'warning');
  return {
    v: 1,
    generated_at: generatedAt,
    status: hasCritical || redisPressure.degraded.length > 0 ? 'degraded' : hasWarnings ? 'warning' : 'ok',
    observed_counts: countByType(observed),
    legacy_counts: countByType(legacy),
    coverage: coverageSummary,
    spans,
    session_end_timing: sessionTiming,
    identity_gaps: identityGapIssues,
    redis_pressure: redisPressure,
    issues,
  };
}
