import fs from 'fs';
import { getRunId } from '../core/runtime.ts';
import { getActiveContext, log } from '../core/logger.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { getTelemetryStreamKeyForRun, isTelemetryEnabled } from './telemetry-stream.ts';
import { sleep } from '../timing.ts';
import { agentObservabilityConfig, agentObservabilityStartupWait } from './agent-observability-config.ts';

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
  return agentObservabilityConfig(config);
}

export function isAgentObservabilityRequired(config: unknown = {}) {
  return requiredConfig(config).required === true;
}

export function agentObservabilityStartupTimeoutMs(config: unknown = {}) {
  return agentObservabilityStartupWait(config).timeoutMs;
}

function agentObservabilityStartupReadBlockMs(config: unknown = {}) {
  return agentObservabilityStartupWait(config).blockMs;
}

function redisFieldValue(value: unknown): string {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function decodeRedisEntry(rawEntry: unknown) {
  if (!Array.isArray(rawEntry)) return null;
  if (typeof rawEntry[0] !== 'string') return null;
  if (!Array.isArray(rawEntry[1])) return null;
  const data: AnyRecord = {};
  for (let i = 0; i < rawEntry[1].length; i += 2) data[String(rawEntry[1][i])] = redisFieldValue(rawEntry[1][i + 1]);
  return { id: rawEntry[0], data };
}

function decodeXreadEntries(result: unknown) {
  const decoded: Array<{ id: string; data: AnyRecord }> = [];
  if (!Array.isArray(result)) return decoded;
  for (const streamResult of result) {
    const entries = Array.isArray(streamResult?.[1]) ? streamResult[1] : [];
    for (const rawEntry of entries) {
      const entry = decodeRedisEntry(rawEntry);
      if (entry) decoded.push(entry);
    }
  }
  return decoded;
}

function parseTelemetryEvent(entry: { id: string; data: AnyRecord }) {
  const raw = entry?.data?.data;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...parsed, redis_id: entry.id } : null;
  } catch (_error) {
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
  if (isStartupLifecycleType(event.type)) {
    if (!matchesKnown(identity.session_key, eventSessionKey(event))) return false;
    if (!matchesKnownWhenPresent(identity.gateway_label, eventGatewayLabel(event))) return false;
    if (!matchesKnownWhenPresent(identity.project, event.project)) return false;
    if (!matchesKnownWhenPresent(identity.dispatch_id, event.dispatch_id)) return false;
    if (!matchesKnownWhenPresent(identity.module_id, event.module_id)) return false;
    if (!matchesKnownWhenPresent(identity.gate_id, event.gate_id)) return false;
    return true;
  }

  if (!matchesKnown(identity.run_id, event.run_id)) return false;
  if (!matchesKnown(identity.project, event.project)) return false;
  if (!matchesKnown(identity.dispatch_id, event.dispatch_id)) return false;
  if (!matchesKnown(identity.session_key, eventSessionKey(event))) return false;
  if (!matchesKnown(identity.gateway_label, eventGatewayLabel(event))) return false;
  if (!matchesKnown(identity.module_id, event.module_id)) return false;
  if (!matchesKnown(identity.gate_id, event.gate_id)) return false;
  if (!matchesKnown(identity.agent_type, event.agent_type)) return false;
  return true;
}

function parsePipelineJsonlLine(line: string) {
  const trimmed = String(selectDefinedValue(() => (line), () => (''))).trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
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
  if (opts.stream !== undefined && opts.stream !== null) return opts.stream;
  return getTelemetryStreamKeyForRun(config, runId);
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
  if (Array.isArray(opts.pipelineLogPaths)) return opts.pipelineLogPaths.filter(Boolean);
  const activeContext = getActiveContext();
  const contextPaths = [
    activeContext?._runPipelineLogPath,
    activeContext?._pipelineLogPath,
  ].filter(Boolean);
  const artifacts = getPipelineArtifactBundle(config);
  return [...new Set([
    ...contextPaths,
    artifacts.run_pipeline_jsonl_path,
    artifacts.global_pipeline_jsonl_path,
  ].filter(Boolean))];
}

function findMatchingPipelineJsonlEvent(filePath: string, identity: AnyRecord = {}, types: string[] = []) {
  if (selectTruthyValue(() => (!filePath), () => (!fs.existsSync(filePath)))) return null;
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return null;
  }
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const event = parsePipelineJsonlLine(lines[i]);
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
  let lastId = selectDefinedValue(() => (opts.startId), () => (AGENT_OBSERVABILITY_STREAM_START_ID));
  let client: AnyRecord | null = null;
  let redisReady = false;

  function redis() {
    if (client) return client;
    const RedisCtor = startupRedisCtor(opts);
    client = createRedisClient(RedisCtor, configRecord(opts.redis), {
      retryStrategy: startupRetryStrategy(opts),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on?.('error', () => {});
    return client;
  }

  async function ensureRedisReady() {
    const current = redis();
    if (redisReady) return current;
    const status = typeof current.status === 'string' ? current.status : '';
    if (typeof current.connect === 'function' && status !== 'ready') {
      await current.connect();
    }
    if (typeof current.ping === 'function') {
      await current.ping();
    }
    redisReady = true;
    return current;
  }

  return {
    async read(identity: AnyRecord = {}, types: string[] = []) {
      if (stream) {
        const current = await ensureRedisReady();
        const result = await current.xread('BLOCK', String(blockMs), 'COUNT', '10', 'STREAMS', stream, lastId);
        let matched = null;
        for (const entry of decodeXreadEntries(result)) {
          if (entry.id) lastId = entry.id;
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
      if (!client) return;
      const current = client;
      client = null;
      redisReady = false;
      try {
        if (typeof current.disconnect === 'function') current.disconnect();
        else void current.quit?.().catch?.(() => {});
      } catch (_error) {
        // best effort only
      }
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
