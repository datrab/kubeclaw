import type {
  AgentObservabilityIngressEventV1,
  AgentObservabilityJsonValue,
} from '../../agent-observability/src/index.ts';
import {
  aggregateUsage,
  hasUsageSnapshotEvent,
  recordUsageSnapshot,
} from '../observability.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
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

function usageTokenCount(usage: unknown, ...keys: string[]): number {
  return usageNumber(usage, ...keys) ?? 0;
}

function currentTokenTotal(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addNullableCost(currentCost: number | null, deltaCost: number | null): number | null {
  if (deltaCost === null) return currentCost;
  return (currentCost ?? 0) + deltaCost;
}

function modelUsageDelta(event: AgentObservabilityIngressEventV1): {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
} | null {
  const payload = event.payload;
  if (payload.hook !== 'model_usage') return null;
  const inputTokens = usageTokenCount(payload.usage, 'input', 'input_tokens', 'tokens_in');
  const outputTokens = usageTokenCount(payload.usage, 'output', 'output_tokens', 'tokens_out');
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
  if (!config) return null;
  if (!delta) return null;

  const current = aggregateUsage(config as never);
  const alreadyRecorded = hasUsageSnapshotEvent(config as never, opts.eventId);
  const currentCost = selectDefinedValue(() => (current?.run?.estimated_cost_usd), () => (null));
  const totalCostUsd = alreadyRecorded ? currentCost : addNullableCost(currentCost, delta.costUsd);

  return {
    totalCostUsd,
    totalInputTokens: currentTokenTotal(current?.run?.input_tokens) + (alreadyRecorded ? 0 : delta.inputTokens),
    totalOutputTokens: currentTokenTotal(current?.run?.output_tokens) + (alreadyRecorded ? 0 : delta.outputTokens),
    partial: usageAggregatePartial(current, alreadyRecorded, delta),
  };
}

function usageAggregatePartial(current: Record<string, any> | null | undefined, alreadyRecorded: boolean, delta: Record<string, any>): boolean {
  if (Boolean(current?.run?.partial)) return true;
  return !alreadyRecorded && delta.costUsd === null;
}

export function commitModelUsageSnapshot(
  ctx: unknown,
  event: AgentObservabilityIngressEventV1,
  opts: { eventId?: string | null } = {},
): void {
  const config = configFromContext(ctx);
  const delta = modelUsageDelta(event);
  if (!config) return;
  if (!delta) return;

  const identity = isRecord(event.identity) ? event.identity : {};
  recordUsageSnapshot(config as never, {
    agentType: selectDefinedValue(() => (identity.agent_type), () => ('missing_agent_type')),
    moduleId: selectDefinedValue(() => (identity.module_id), () => (undefined)),
    gateId: selectDefinedValue(() => (identity.gate_id), () => (undefined)),
    source: 'openclaw.model.usage',
    inputTokens: delta.inputTokens,
    outputTokens: delta.outputTokens,
    estimatedCostUsd: delta.costUsd,
    partial: delta.costUsd === null,
    sessionKey: selectDefinedValue(() => (identity.session_key), () => (undefined)),
    eventId: selectDefinedValue(() => (opts.eventId), () => (undefined)),
  });
}

function modelUsageAggregateDetails(
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
