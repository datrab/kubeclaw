import { recordObservabilityDegraded, recordObservabilityRestored } from '../observability.ts';
import { emitEventNonBlocking } from './dispatch.ts';
import { firstDefinedValue as firstDefined, selectPresent } from '../../value-boundary.ts';

const RATE_LIMIT_PROVIDER_MISSING = 'provider_missing';
const GATEWAY_UNREACHABLE_DETAIL = 'session status unreachable';
const TRANSCRIPT_UNREADABLE_DETAIL = 'transcript unreadable';
const REDIS_COMPLETION_UNAVAILABLE_DETAIL = 'redis completion stream unavailable';
const present = (...values: any[]) => selectPresent(...values);
const nullable = (value: any) => value === undefined || value === null ? null : value;

function retryAfterSeconds(data: any) {
  if (data.retry_after_seconds !== undefined && data.retry_after_seconds !== null) return data.retry_after_seconds;
  return typeof data.cooldown_ms === 'number' ? Math.round(data.cooldown_ms / 1000) : null;
}

export function emitCostUpdate(ctx: any, data: any = {}) {
  const costUsd = data.cost_usd ?? null;
  const totalCostUsd = data.total_cost_usd ?? null;
  const inputTokens = data.input_tokens ?? null;
  const outputTokens = data.output_tokens ?? null;
  emitEventNonBlocking(ctx, 'cost.update', {
    module_id: data.module_id ?? null, agent_type: data.agent_type ?? null, label: data.label ?? null,
    cost_usd: costUsd, total_cost_usd: totalCostUsd, input_tokens: inputTokens, output_tokens: outputTokens,
    gate_id: data.gate_id ?? null, model: data.model ?? null,
    estimated_cost_usd: firstDefined(data.estimated_cost_usd, costUsd),
    cumulative_cost_usd: firstDefined(data.cumulative_cost_usd, totalCostUsd),
    tokens_in: firstDefined(data.tokens_in, inputTokens), tokens_out: firstDefined(data.tokens_out, outputTokens),
  });
}

export function emitRateLimitDetected(ctx: any, data: any = {}) {
  emitEventNonBlocking(ctx, 'rate_limit.detected', {
    agent_type: nullable(data.agent_type), module_id: nullable(data.module_id), gate_id: nullable(data.gate_id),
    gate_type: data.gate_id != null ? nullable(data.gate_type) : undefined,
    gateway_label: nullable(data.gateway_label), session_key: nullable(data.session_key),
    attempt: nullable(data.attempt), dispatch_id: nullable(data.dispatch_id),
    provider: firstDefined(data.provider, RATE_LIMIT_PROVIDER_MISSING), retry_after_seconds: retryAfterSeconds(data),
    pause_count: firstDefined(data.pause_count, data.pause_number, null), max_pauses: nullable(data.max_pauses),
    cooldown_ms: nullable(data.cooldown_ms), resume_at: nullable(data.resume_at), detail: nullable(data.detail),
  });
}

export const emitObservabilityDegraded = (ctx: any, data: any = {}) => recordObservabilityDegraded(ctx, data);
export const emitObservabilityRestored = (ctx: any, data: any = {}) => recordObservabilityRestored(ctx, data);

function transitionPayload(data: any, detail: any, state: any) {
  return {
    detail, gateway_label: data.gateway_label ?? null, module_id: data.module_id ?? null,
    gate_id: data.gate_id ?? null, gate_type: data.gate_type ?? null,
    session_key: data.session_key ?? null, attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id ?? null, agent_type: data.agent_type ?? null,
    stream_key: data.stream_key ?? null, degraded_at: state.degradedAt ?? null,
  };
}

export function updateObservabilitySurface(ctx: any, state: any, data: any = {}, spec: any = {}) {
  const { isDegraded = false, component = 'acp_monitor', surface = null, reason = null,
    degradedDetail = null, restoredDetail = null, impactedEventType = null } = spec;
  if (isDegraded && !state.active) {
    state.active = true;
    state.degradedAt = new Date().toISOString();
    emitObservabilityDegraded(ctx, {
      component, surface, reason, ...transitionPayload(data, degradedDetail, state),
      impacted_event_type: impactedEventType,
    });
    return;
  }
  if (!isDegraded && state.active) {
    const restoredAt = new Date().toISOString();
    emitObservabilityRestored(ctx, {
      component, surface, reason, ...transitionPayload(data, restoredDetail, state), restored_at: restoredAt,
      restored_after_ms: state.degradedAt ? Math.max(0, Date.now() - new Date(state.degradedAt).getTime()) : null,
    });
    state.active = false;
    state.degradedAt = null;
  }
}

export function updateGatewayObservability(ctx: any, state: any, data: any = {}) {
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded: [data.gateway_unreachable === true, data.session_state === 'unreachable'].includes(true),
    surface: 'gateway', reason: 'gateway_unreachable',
    degradedDetail: present(data.gateway_detail, data.detail, GATEWAY_UNREACHABLE_DETAIL),
    restoredDetail: 'session status reachable again',
  });
}

export function updateTranscriptObservability(ctx: any, state: any, data: any = {}) {
  const detail = firstDefined(data.transcript_detail, data.detail, null);
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded: typeof detail === 'string' && detail.startsWith('transcript-read-failed:'),
    surface: 'transcript', reason: 'transcript_read_failed',
    degradedDetail: present(detail, TRANSCRIPT_UNREADABLE_DETAIL), restoredDetail: 'transcript readable again',
    impactedEventType: 'agent.transcript',
  });
}

export function updateRedisCompletionObservability(ctx: any, state: any, data: any = {}) {
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded: data.redis_unavailable === true, component: 'redis_completion', surface: 'completion_stream',
    reason: 'completion_stream_unavailable',
    degradedDetail: present(data.detail, REDIS_COMPLETION_UNAVAILABLE_DETAIL),
    restoredDetail: 'redis completion stream available again',
  });
}
