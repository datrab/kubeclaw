import type {
  AgentObservabilityEvidenceIssue,
  AgentObservabilityNormalizedEvidenceRecord,
  AgentObservabilityParallelRunEvidenceV1,
} from './types.ts';

export function identityGapIssues(records: AgentObservabilityNormalizedEvidenceRecord[]): AgentObservabilityEvidenceIssue[] {
  const gaps: AgentObservabilityEvidenceIssue[] = [];
  for (const record of records) {
    const identity = record.identity;
    const missing: string[] = [];
    if (!identity.session_key && !identity.child_session_key) missing.push('session_key');
    if (!identity.dispatch_id) missing.push('dispatch_id');
    if (!identity.gateway_label) missing.push('gateway_label');
    if (!identity.agent_type && !identity.agent_id) missing.push('agent_type');
    if (['agent.tool.started', 'agent.tool.finished'].includes(record.type) && !identity.tool_call_id) missing.push('tool_call_id');
    const requiresModelCallId = record.type.startsWith('agent.llm.')
      ? true
      : ['agent.model.started', 'agent.model.ended'].includes(record.type);
    if (requiresModelCallId && !identity.model_call_id) missing.push('model_call_id');
    if (missing.length === 0) continue;
    gaps.push({
      code: 'identity_gap', severity: 'warning', message: 'Observed hook record is missing canonical identity fields.',
      identity, details: { type: record.type, missing },
      ...(record.observed_type !== undefined ? { observed_type: record.observed_type } : {}),
    });
  }
  return gaps;
}

export function coverageIssues(summary: AgentObservabilityParallelRunEvidenceV1['coverage']): AgentObservabilityEvidenceIssue[] {
  return Object.entries(summary).filter(([, item]) => item.observed === 0).map(([name, item]) => ({
    code: `${name}_missing_observed_evidence`, severity: 'warning',
    message: `Canonical ${name} evidence was not observed.`, details: { observed: item.observed },
  }));
}
