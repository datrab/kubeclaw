import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { getTelemetryStreamKeyForRun } from './telemetry-stream.ts';
import { agentObservabilityForgeCompletionWait } from './agent-observability-config.ts';
import { createBlockingRedisStreamReader } from './agent-observability-redis-reader.ts';

const REDIS_XREAD_LATEST_ID = '$';
const firstDefined = (...values: any[]) => values.find((value) => value !== undefined && value !== null) ?? null;
const stringValue = (value: any) => typeof value === 'string' && value.trim() ? value.trim() : null;
const objectRecord = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};

function parseTelemetryEvent(entry: any) {
  const raw = entry?.data?.data;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.type === 'agent.ended' ? { ...parsed, redis_id: entry.id } : null;
  } catch { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): malformed optional stream entries are ignored by the reader. */
    return null;
  }
}

function matchesKnownIdentity(expectedValue: any, actualValue: any) {
  const expected = stringValue(expectedValue);
  const actual = stringValue(actualValue);
  return !expected || !actual || expected === actual;
}

export function matchesForgeAgentEndedTelemetry(event: any = {}, identity: any = {}) {
  if (event.type !== 'agent.ended' || (event.agent_type && event.agent_type !== 'forge')) return false;
  if (event.agent_scope && event.agent_scope !== 'agent') return false;
  const expectedModule = stringValue(identity.module_id);
  if (expectedModule && event.module_id && event.module_id !== expectedModule) return false;
  return [
    [identity.run_id, event.run_id], [identity.dispatch_id, event.dispatch_id],
    [identity.session_key, event.session_key], [identity.gateway_label, event.gateway_label],
  ].every(([expected, actual]) => matchesKnownIdentity(expected, actual));
}

export function buildForgeAgentEndedIdentity(_config: any, moduleDir: any, opts: any = {}) {
  return {
    run_id: opts.runId ?? null, module_id: opts.moduleId ?? null, moduleDir,
    attempt: opts.attempt ?? null, dispatch_id: opts.dispatchId ?? null,
    session_key: opts.sessionKey ?? null, gateway_label: opts.gatewayLabel ?? null,
  };
}

export function createAgentEndedTelemetryReader(config: any, opts: any = {}) {
  if (opts.agentEndedReader) return opts.agentEndedReader;
  const runId = opts.runId ?? '';
  if (config?.telemetry?.enabled !== true || !runId || !stringValue(config?.project)) return null;
  const stream = firstDefined(opts.stream, getTelemetryStreamKeyForRun(config, runId));
  if (!stream) return null;
  const reader = createBlockingRedisStreamReader({
    stream,
    blockMs: firstDefined(opts.blockMs, agentEndedReadBlockMs(config)),
    startId: stringValue(opts.startId) ?? REDIS_XREAD_LATEST_ID,
    createClient() {
      const RedisCtor = firstDefined(opts.RedisCtor, loadRedisCtor());
      return createRedisClient(RedisCtor as any, objectRecord(opts.redis), {
        retryStrategy: typeof opts.retryStrategy === 'function' ? opts.retryStrategy : (times: number) => Math.min(times * 100, 1000),
        maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true,
      }) as any;
    },
  });
  return {
    async read(identity: any) {
      let matched = null;
      for (const entry of await reader.read()) {
        const event = parseTelemetryEvent(entry);
        if (!matched && event && matchesForgeAgentEndedTelemetry(event, identity)) matched = event;
      }
      return matched;
    },
    close: () => reader.close(),
  };
}

export function shouldSettleAgentEnded(seenAtMs: any, nowMs: any = Date.now(), settleMs: any) {
  if (!Number.isFinite(Number(settleMs)) || Number(settleMs) < 0) {
    throw new Error('agent_observability forge completion settle_ms must be a non-negative number');
  }
  return seenAtMs > 0 && nowMs - seenAtMs < settleMs;
}

export function agentEndedSettleMs(config: any = {}, opts: any = {}) {
  const value = firstDefined(opts.agentEndedSettleMs, opts.settleMs, agentObservabilityForgeCompletionWait(config).settleMs);
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= 0) return normalized;
  throw new Error('agent_observability forge completion settle_ms must be a non-negative number');
}

export function agentEndedReadBlockMs(config: any = {}, opts: any = {}) {
  const value = firstDefined(opts.blockMs, agentObservabilityForgeCompletionWait(config).xreadBlockMs);
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= 0) return normalized;
  throw new Error('agent_observability forge completion read block policy must resolve to a non-negative number');
}
