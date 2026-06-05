import type {
  AgentObservabilityIngressEventV1,
  AgentObservabilityJsonValue,
} from '../../agent-observability/src/index.ts';
import {
  aggregateUsage,
  hasUsageSnapshotEvent,
  recordUsageSnapshot,
} from '../observability.ts';

type UnknownRecord = Record<string, unknown>;

export interface ModelUsageAggregateProjection {
  totalCostUsd: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  partial: boolean;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function configFromContext(ctx: unknown): UnknownRecord | null {
  if (!isRecord(ctx)) return null;
  const config = ctx.config;
  return isRecord(config) ? config : null;
}

function usageNumber(usage: unknown, ...keys: string[]): number | null {
  if (!isRecord(usage)) return null;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function modelUsageDelta(event: AgentObservabilityIngressEventV1): {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
} | null {
  const payload = event.payload;
  if (payload.hook !== 'model_usage') return null;
  const inputTokens = usageNumber(payload.usage, 'input', 'input_tokens', 'tokens_in') ?? 0;
  const outputTokens = usageNumber(payload.usage, 'output', 'output_tokens', 'tokens_out') ?? 0;
  return {
    inputTokens,
    outputTokens,
    costUsd: typeof payload.cost_usd === 'number' && Number.isFinite(payload.cost_usd) ? payload.cost_usd : null,
  };
}

export function prepareModelUsageAggregate(
  ctx: unknown,
  event: AgentObservabilityIngressEventV1,
  opts: { eventId?: string | null } = {},
): ModelUsageAggregateProjection | null {
  const config = configFromContext(ctx);
  const delta = modelUsageDelta(event);
  if (!config || !delta) return null;

  const current = aggregateUsage(config as never);
  const alreadyRecorded = hasUsageSnapshotEvent(config as never, opts.eventId);
  const currentCost = current?.run?.estimated_cost_usd ?? null;
  const totalCostUsd = alreadyRecorded
    ? currentCost
    : delta.costUsd === null
    ? currentCost
    : (currentCost ?? 0) + delta.costUsd;

  return {
    totalCostUsd,
    totalInputTokens: (current?.run?.input_tokens ?? 0) + (alreadyRecorded ? 0 : delta.inputTokens),
    totalOutputTokens: (current?.run?.output_tokens ?? 0) + (alreadyRecorded ? 0 : delta.outputTokens),
    partial: Boolean(current?.run?.partial) || (!alreadyRecorded && delta.costUsd === null),
  };
}

export function commitModelUsageSnapshot(
  ctx: unknown,
  event: AgentObservabilityIngressEventV1,
  opts: { eventId?: string | null } = {},
): void {
  const config = configFromContext(ctx);
  const delta = modelUsageDelta(event);
  if (!config || !delta) return;

  const identity = event.identity || {};
  recordUsageSnapshot(config as never, {
    agentType: identity.agent_type ?? identity.agent_id ?? 'unknown',
    moduleId: identity.module_id ?? undefined,
    gateId: identity.gate_id ?? undefined,
    source: 'openclaw.model.usage',
    inputTokens: delta.inputTokens,
    outputTokens: delta.outputTokens,
    estimatedCostUsd: delta.costUsd,
    partial: delta.costUsd === null,
    sessionKey: identity.session_key ?? undefined,
    eventId: opts.eventId ?? undefined,
  });
}

export function modelUsageAggregateDetails(
  aggregate: ModelUsageAggregateProjection | null,
): Record<string, AgentObservabilityJsonValue | undefined> | null {
  if (!aggregate) return null;
  return {
    total_cost_usd: aggregate.totalCostUsd,
    cumulative_cost_usd: aggregate.totalCostUsd,
    total_input_tokens: aggregate.totalInputTokens,
    total_output_tokens: aggregate.totalOutputTokens,
    partial: aggregate.partial,
  };
}
