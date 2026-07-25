import type {
  AgentObservabilityIngressEventV1,
  AgentObservabilityIngressPayloadV1,
} from '../../agent-observability/src/index.ts';
import type {
  AgentObservabilityCoverageSummary,
  AgentObservabilityEvidenceIdentity,
  AgentObservabilityEvidenceIssue,
  AgentObservabilityEvidenceRecordType,
  AgentObservabilityLlmCoverageSummary,
  AgentObservabilityNormalizedEvidenceRecord,
  AgentObservabilityParallelRunEvidenceInput,
  AgentObservabilityParallelRunEvidenceOptions,
  AgentObservabilityParallelRunEvidenceV1,
  AgentObservabilityRedisPressureSummary,
  AgentObservabilitySessionTimingSummary,
  AgentObservabilitySpanCompletenessSummary,
} from './types.ts';
import { summarizeRedisPressure } from './pressure.ts';
import { coverageIssues, identityGapIssues } from './issues.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function identitySessionKey(identity: AgentObservabilityEvidenceIdentity): string | undefined {
  return firstDefined(identity.session_key, identity.child_session_key) ?? undefined;
}

function identityAgentType(identity: AgentObservabilityEvidenceIdentity): string | undefined {
  return firstDefined(identity.agent_type, identity.agent_id) ?? undefined;
}

function entitySessionIdentity(identity: AgentObservabilityEvidenceIdentity, recordType: string): string | undefined {
  if (recordType === 'agent.spawned') {
    return firstDefined(identity.child_session_key, identity.session_key, identity.gateway_label) ?? undefined;
  }
  return firstDefined(identity.session_key, identity.child_session_key, identity.gateway_label) ?? undefined;
}

function evidenceGeneratedAt(
  input: AgentObservabilityParallelRunEvidenceInput,
  options: AgentObservabilityParallelRunEvidenceOptions,
): string {
  if (input.generatedAt !== undefined && input.generatedAt !== null) return input.generatedAt;
  if (options.now !== undefined && options.now !== null) return options.now.toISOString();
  throw new Error('agent observability evidence generatedAt authority is required');
}

function evidenceStatus(
  hasCritical: boolean,
  hasWarnings: boolean,
  redisPressure: AgentObservabilityRedisPressureSummary,
): AgentObservabilityParallelRunEvidenceV1['status'] {
  if (selectTruthyValue(() => (hasCritical), () => (redisPressure.degraded.length > 0))) return 'degraded';
  return hasWarnings ? 'warning' : 'ok';
}

function issue(
  code: string,
  severity: AgentObservabilityEvidenceIssue['severity'],
  message: string,
  extra: Omit<AgentObservabilityEvidenceIssue, 'code' | 'severity' | 'message'> = {},
): AgentObservabilityEvidenceIssue {
  return { code, severity, message, ...extra };
}

function bump(counts: Record<string, number>, key: string): void {
  const current = numberValue(counts[key]) ?? 0;
  counts[key] = current + 1;
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
  const outcome = (stringValue(payload.outcome) ?? '').toLowerCase();
  const reason = (stringValue(payload.reason) ?? '').toLowerCase();
  const hasError = payload.error !== undefined && payload.error !== null;
  const error = hasError ? JSON.stringify(payload.error).toLowerCase() : '';
  const haystack = `${outcome} ${reason} ${error}`;
  if (haystack.includes('rate') && haystack.includes('limit')) return 'agent.rate_limited';
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (outcome === 'error'), () => (outcome === 'failed'))), () => (outcome === 'failure'))), () => (hasError))) return 'agent.failure';
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

function identityKey(record: AgentObservabilityNormalizedEvidenceRecord): string {
  const identity = record.identity;
  const key = [
    identity.run_id,
    identity.dispatch_id,
    identitySessionKey(identity),
    identity.gateway_label,
    identity.tool_call_id,
    identity.model_call_id,
    identity.module_id,
    identity.gate_id,
    identityAgentType(identity),
  ].filter(Boolean).join('|');
  return key ? key : `${record.type}|${record.ts}`;
}

function entityKey(record: AgentObservabilityNormalizedEvidenceRecord): string {
  const identity = record.identity;
  const sessionIdentity = entitySessionIdentity(identity, record.type);
  return selectTruthyValue(() => ([
    identity.run_id,
    identity.dispatch_id,
    sessionIdentity,
    identity.module_id,
    identity.gate_id,
    identityAgentType(identity),
].filter(Boolean).join('|')), () => (identityKey(record)));
}

function spanKey(record: AgentObservabilityNormalizedEvidenceRecord, field: 'tool_call_id' | 'model_call_id'): string {
  const identity = record.identity;
  return selectTruthyValue(() => ([
    identity.run_id,
    identity.dispatch_id,
    identity.session_key,
    identity[field],
].filter(Boolean).join('|')), () => (entityKey(record)));
}

function countByType(records: AgentObservabilityNormalizedEvidenceRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) bump(counts, record.type);
  return counts;
}

function recordsOf(records: AgentObservabilityNormalizedEvidenceRecord[], type: string): AgentObservabilityNormalizedEvidenceRecord[] {
  return records.filter((record: any) => record.type === type);
}

function coverage(
  observed: AgentObservabilityNormalizedEvidenceRecord[],
  type: string,
): AgentObservabilityCoverageSummary {
  const observedKeys = new Set(recordsOf(observed, type).map(entityKey));
  return {
    observed: observedKeys.size,
  };
}

function spanCompleteness(
  records: AgentObservabilityNormalizedEvidenceRecord[],
  startedType: string,
  finishedType: string,
  field: 'tool_call_id' | 'model_call_id',
): AgentObservabilitySpanCompletenessSummary {
  const started = new Set(recordsOf(records, startedType).map((record: any) => spanKey(record, field)));
  const finished = new Set(recordsOf(records, finishedType).map((record: any) => spanKey(record, field)));
  let complete = 0;
  for (const key of started) if (finished.has(key)) complete += 1;
  return {
    started: started.size,
    finished: finished.size,
    complete,
    orphan_started: [...started].filter((key: any) => !finished.has(key)).length,
    orphan_finished: [...finished].filter((key: any) => !started.has(key)).length,
  };
}

function llmCoverage(records: AgentObservabilityNormalizedEvidenceRecord[]): AgentObservabilityLlmCoverageSummary {
  const inputs = new Set(recordsOf(records, 'agent.llm.input').map((record: any) => spanKey(record, 'model_call_id')));
  const outputs = new Set(recordsOf(records, 'agent.llm.output').map((record: any) => spanKey(record, 'model_call_id')));
  let paired = 0;
  for (const key of inputs) if (outputs.has(key)) paired += 1;
  return {
    inputs: inputs.size,
    outputs: outputs.size,
    paired,
    input_without_output: [...inputs].filter((key: any) => !outputs.has(key)).length,
    output_without_input: [...outputs].filter((key: any) => !inputs.has(key)).length,
  };
}

function sessionEndTiming(
  observed: AgentObservabilityNormalizedEvidenceRecord[],
): AgentObservabilitySessionTimingSummary {
  const ended = recordsOf(observed, 'agent.session.ended');
  return { compared: ended.length, max_delta_ms: null, out_of_tolerance: 0 };
}

export function compareAgentObservabilityParallelRunEvidence(
  input: AgentObservabilityParallelRunEvidenceInput,
  options: AgentObservabilityParallelRunEvidenceOptions = {},
): AgentObservabilityParallelRunEvidenceV1 {
  const generatedAt = evidenceGeneratedAt(input, options);
  const observed = input.observedEvents.flatMap(normalizeObservedEvent);
  const issues: AgentObservabilityEvidenceIssue[] = [];
  const identityGaps = identityGapIssues(observed);

  const coverageSummary = {
    spawn: coverage(observed, 'agent.spawned'),
    agent_end: coverage(observed, 'agent.ended'),
    session_end: coverage(observed, 'agent.session.ended'),
    rate_limit: coverage(observed, 'agent.rate_limited'),
    failure: coverage(observed, 'agent.failure'),
  };

  issues.push(...coverageIssues(coverageSummary));

  const spans = {
    tool: spanCompleteness(observed, 'agent.tool.started', 'agent.tool.finished', 'tool_call_id'),
    model: spanCompleteness(observed, 'agent.model.started', 'agent.model.ended', 'model_call_id'),
    llm: llmCoverage(observed),
  };

  if (selectTruthyValue(() => (spans.tool.orphan_started), () => (spans.tool.orphan_finished))) {
    issues.push(issue('tool_span_incomplete', 'warning', 'Observed tool started/finished records are not fully paired.', { details: { ...spans.tool } }));
  }
  if (selectTruthyValue(() => (spans.model.orphan_started), () => (spans.model.orphan_finished))) {
    issues.push(issue('model_span_incomplete', 'warning', 'Observed model started/ended records are not fully paired.', { details: { ...spans.model } }));
  }
  if (selectTruthyValue(() => (spans.llm.input_without_output), () => (spans.llm.output_without_input))) {
    issues.push(issue('llm_payload_unpaired', 'info', 'Observed LLM input/output payload records are not fully paired.', { details: { ...spans.llm } }));
  }

  const sessionTiming = sessionEndTiming(
    observed,
  );
  const redisPressure = summarizeRedisPressure(input.redisPressure);
  if (redisPressure.degraded.length > 0) {
    issues.push(issue('redis_observability_pressure', 'warning', 'Agent-observability Redis stream pressure exceeded configured evidence thresholds.', {
      details: { degraded: redisPressure.degraded },
    }));
  }

  issues.push(...identityGaps);
  const hasCritical = issues.some((item: any) => item.severity === 'critical');
  const hasWarnings = issues.some((item: any) => item.severity === 'warning');
  return {
    v: 1,
    generated_at: generatedAt,
    status: evidenceStatus(hasCritical, hasWarnings, redisPressure),
    observed_counts: countByType(observed),
    coverage: coverageSummary,
    spans,
    session_end_timing: sessionTiming,
    identity_gaps: identityGaps,
    redis_pressure: redisPressure,
    issues,
  };
}
