import fs from 'fs';
import { getRunId } from '../core/runtime.ts';
import { getActiveContext, log } from '../core/logger.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { getTelemetryStreamKeyForRun, isTelemetryEnabled } from './telemetry-stream.ts';
import { sleep } from '../timing.ts';
import { agentObservabilityConfig, agentObservabilityStartupWait } from './agent-observability-config.ts';
import { createBlockingRedisStreamReader } from './agent-observability-redis-reader.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

const AGENT_OBSERVABILITY_STREAM_START_ID = '0-0';
const MISSING_AGENT_OBSERVABILITY_STARTUP_EVIDENCE = 'missing_agent_observability_startup_evidence';

function nonEmpty(value: unknown): string | null {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function configRecord(config: unknown): AnyRecord {
  return config && typeof config === 'object' && !Array.isArray(config) ? config as AnyRecord : {};
}

function requiredConfig(config: unknown) {
  return agentObservabilityConfig(configRecord(config));
}

function isAgentObservabilityRequired(config: unknown = {}) {
  return requiredConfig(config).required === true;
}

export function agentObservabilityStartupTimeoutMs(config: unknown = {}) {
  return agentObservabilityStartupWait(configRecord(config)).timeoutMs;
}

function agentObservabilityStartupReadBlockMs(config: unknown = {}) {
  return agentObservabilityStartupWait(configRecord(config)).blockMs;
}

function parseTelemetryEvent(entry: { id: string; data: AnyRecord }) {
  const raw = entry?.data?.data;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...parsed, redis_id: entry.id } : null;
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */
    return null;
  }
}

function matchesKnown(expected: unknown, actual: unknown) {
  const expectedValue = nonEmpty(expected);
  const actualValue = nonEmpty(actual);
  if (!expectedValue) return true;
  return actualValue === expectedValue;
}

function matchesKnownWhenPresent(expected: unknown, actual: unknown) {
  const expectedValue = nonEmpty(expected);
  const actualValue = nonEmpty(actual);
  if (!expectedValue) return true;
  if (!actualValue) return true;
  return actualValue === expectedValue;
}

function eventSessionKey(event: AnyRecord) {
  return selectDefinedValue(() => (selectDefinedValue(() => (event.session_key), () => (event.child_session_key))), () => (null));
}

function eventGatewayLabel(event: AnyRecord) {
  return selectDefinedValue(() => (selectDefinedValue(() => (event.gateway_label), () => (event.label))), () => (null));
}

function isStartupLifecycleType(type: unknown) {
  return new Set(['agent.spawned', 'agent.session.started']).has(String(type));
}

export function matchesAgentLifecycleTelemetry(event: AnyRecord = {}, identity: AnyRecord = {}, types: string[] = []) {
  if (!types.includes(event.type)) return false;
  const commonPairs: Array<[unknown, unknown]> = [
    [identity.project, event.project],
    [identity.dispatch_id, event.dispatch_id],
    [identity.session_key, eventSessionKey(event)],
    [identity.gateway_label, eventGatewayLabel(event)],
    [identity.module_id, event.module_id],
    [identity.gate_id, event.gate_id],
  ];
  if (isStartupLifecycleType(event.type)) {
    return commonPairs.every(([expected, actual], index) => index === 2
      ? matchesKnown(expected, actual)
      : matchesKnownWhenPresent(expected, actual));
  }
  return [[identity.run_id, event.run_id], ...commonPairs, [identity.agent_type, event.agent_type]]
    .every(([expected, actual]) => matchesKnown(expected, actual));
}

function parsePipelineJsonlLine(line: string) {
  const trimmed = String(selectDefinedValue(() => (line), () => (''))).trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */
    return null;
  }
}

function firstDefined<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function startupStreamKey(config: AnyRecord, opts: AnyRecord, runId: string): string {
  if (typeof opts.stream === 'string') return opts.stream;
  return getTelemetryStreamKeyForRun(config, runId) ?? '';
}

function startupReadBlockMs(config: AnyRecord, opts: AnyRecord): number {
  return firstDefined(opts.blockMs, agentObservabilityStartupReadBlockMs(config)) as number;
}

function startupRedisCtor(opts: AnyRecord): unknown {
  if (opts.RedisCtor !== undefined && opts.RedisCtor !== null) return opts.RedisCtor;
  return loadRedisCtor();
}

function startupRetryStrategy(opts: AnyRecord): unknown {
  const configured = firstDefined(opts.retryStrategy);
  return configured !== undefined ? configured : ((times: number) => Math.min(times * 100, 1000));
}

function startupTimeoutMs(config: AnyRecord, opts: AnyRecord): number {
  return firstDefined(opts.timeoutMs, agentObservabilityStartupTimeoutMs(config)) as number;
}

function startupEventTypes(opts: AnyRecord): string[] {
  return firstDefined(opts.types, ['agent.spawned', 'agent.session.started']) as string[];
}

function startupPipelineJsonlPaths(config: AnyRecord, opts: AnyRecord): string[] {
  if (Array.isArray(opts.pipelineLogPaths)) return opts.pipelineLogPaths.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
  const activeContext = getActiveContext();
  const contextPaths = [
    activeContext?._runPipelineLogPath,
    activeContext?._pipelineLogPath,
  ].filter((value: any): value is string => typeof value === 'string' && value.length > 0);
  const artifacts = getPipelineArtifactBundle(config);
  return [...new Set([
    ...contextPaths,
    artifacts.run_pipeline_jsonl_path,
    artifacts.global_pipeline_jsonl_path,
  ].filter((value: any): value is string => typeof value === 'string' && value.length > 0))];
}

function findMatchingPipelineJsonlEvent(filePath: string, identity: AnyRecord = {}, types: string[] = []) {
  if (selectTruthyValue(() => (!filePath), () => (!fs.existsSync(filePath)))) return null;
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */
    return null;
  }
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const event = parsePipelineJsonlLine(lines[i] ?? '');
    if (!event) continue;
    if (matchesAgentLifecycleTelemetry(event as AnyRecord, identity, types)) {
      return { ...event, observability_source: 'pipeline_jsonl', pipeline_jsonl_path: filePath };
    }
  }
  return null;
}

export function createAgentLifecycleTelemetryReader(config: AnyRecord = {}, opts: AnyRecord = {}) {
  if (opts.reader) return opts.reader;
  const runId = firstDefined(opts.runId, '') as string;
  const stream = startupStreamKey(config, opts, runId);
  const blockMs = startupReadBlockMs(config, opts);
  let pipelineJsonlPaths: string[] | null = null;
  const reader = stream ? createBlockingRedisStreamReader({
    stream,
    blockMs,
    startId: selectDefinedValue(() => (opts.startId), () => (AGENT_OBSERVABILITY_STREAM_START_ID)),
    createClient() {
      const RedisCtor = startupRedisCtor(opts);
      return createRedisClient(RedisCtor as any, configRecord(opts.redis), {
        retryStrategy: startupRetryStrategy(opts),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      }) as any;
    },
  }) : null;

  return {
    async read(identity: AnyRecord = {}, types: string[] = []) {
      if (stream) {
        let matched = null;
        for (const entry of await reader!.read()) {
          const event = parseTelemetryEvent(entry);
          if (!event) continue;
          if (!matched && matchesAgentLifecycleTelemetry(event, identity, types)) matched = event;
        }
        if (matched) return matched;
      }
      if (!pipelineJsonlPaths) pipelineJsonlPaths = startupPipelineJsonlPaths(config, opts);
      for (const filePath of pipelineJsonlPaths) {
        const matched = findMatchingPipelineJsonlEvent(filePath, identity, types);
        if (matched) return matched;
      }
      return null;
    },
    close() {
      reader?.close();
    },
  };
}

export async function waitForRequiredAgentStartupEvidence(config: AnyRecord = {}, identity: AnyRecord = {}, opts: AnyRecord = {}) {
  if (!isAgentObservabilityRequired(config)) {
    return { ok: true, skipped: true, reason: 'agent_observability_not_required', event: null };
  }
  if (!isTelemetryEnabled(config)) {
    return { ok: false, skipped: false, reason: 'telemetry_disabled', event: null };
  }

  const timeoutMs = startupTimeoutMs(config, opts);
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const reader = createAgentLifecycleTelemetryReader(config, opts);
  const types = startupEventTypes(opts);

  try {
    while (Date.now() <= deadline) {
      const event = await reader.read(identity, types);
      if (event) {
        return {
          ok: true,
          skipped: false,
          reason: 'observed',
          event,
          elapsed_ms: Date.now() - startedAt,
        };
      }
      if (timeoutMs === 0) break;
      await sleep(Math.min(25, Math.max(0, deadline - Date.now())));
    }
  } finally {
    reader.close?.();
  }

  const displayIdentity = selectDefinedValue(() => (identity.gateway_label), () => ('agent session'));
  log('ERROR', `[agent-observability] required startup evidence missing for ${displayIdentity}`);
  return {
    ok: false,
    skipped: false,
    reason: MISSING_AGENT_OBSERVABILITY_STARTUP_EVIDENCE,
    event: null,
    elapsed_ms: Date.now() - startedAt,
  };
}

export function assertRequiredAgentStartupEvidence(result: AnyRecord, identity: AnyRecord = {}) {
  if (result?.ok) return result;
  const displayIdentity = selectDefinedValue(() => (identity.gateway_label), () => ('missing_gateway_label'));
  const reason = selectDefinedValue(() => (result?.reason), () => ('missing_observability_reason'));
  const err: AnyRecord = new Error(`Required agent observability evidence missing for session '${displayIdentity}': ${reason}`);
  err.reason = selectDefinedValue(() => (result?.reason), () => (MISSING_AGENT_OBSERVABILITY_STARTUP_EVIDENCE));
  err.identity = { ...identity };
  err.observability_required = true;
  throw err;
}
