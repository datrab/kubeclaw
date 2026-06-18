import { getRunId } from '../core/runtime.ts';
import { log } from '../core/logger.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { getTelemetryStreamKeyForRun, isTelemetryEnabled } from './telemetry-stream.ts';
import { sleep } from '../timing.ts';

type AnyRecord = Record<string, any>;

const DEFAULT_STARTUP_TIMEOUT_MS = 15000;
const DEFAULT_READ_BLOCK_MS = 250;

function nonEmpty(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function requiredConfig(config: AnyRecord = {}) {
  return config?.agent_observability ?? {};
}

export function isAgentObservabilityRequired(config: AnyRecord = {}) {
  return requiredConfig(config).required === true;
}

export function agentObservabilityStartupTimeoutMs(config: AnyRecord = {}) {
  const value = Number(requiredConfig(config).startup_evidence_timeout_ms ?? DEFAULT_STARTUP_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_STARTUP_TIMEOUT_MS;
}

function decodeRedisEntry(rawEntry: unknown) {
  if (!Array.isArray(rawEntry)) return null;
  if (typeof rawEntry[0] !== 'string') return null;
  if (!Array.isArray(rawEntry[1])) return null;
  const data: AnyRecord = {};
  for (let i = 0; i < rawEntry[1].length; i += 2) data[String(rawEntry[1][i])] = String(rawEntry[1][i + 1] ?? '');
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

function eventSessionKey(event: AnyRecord) {
  return event.session_key ?? event.child_session_key ?? null;
}

export function matchesAgentLifecycleTelemetry(event: AnyRecord = {}, identity: AnyRecord = {}, types: string[] = []) {
  if (!types.includes(event.type)) return false;
  if (!matchesKnown(identity.run_id, event.run_id)) return false;
  if (!matchesKnown(identity.project, event.project)) return false;
  if (!matchesKnown(identity.dispatch_id, event.dispatch_id)) return false;
  if (!matchesKnown(identity.session_key, eventSessionKey(event))) return false;
  if (!matchesKnown(identity.gateway_label, event.gateway_label ?? event.label)) return false;
  if (!matchesKnown(identity.module_id, event.module_id)) return false;
  if (!matchesKnown(identity.gate_id, event.gate_id)) return false;
  if (!matchesKnown(identity.agent_type, event.agent_type)) return false;
  return true;
}

export function createAgentLifecycleTelemetryReader(config: AnyRecord = {}, opts: AnyRecord = {}) {
  if (opts.reader) return opts.reader;
  const runId = opts.runId ?? opts.run_id ?? getRunId(config) ?? '';
  const stream = opts.stream ?? getTelemetryStreamKeyForRun(config, runId);
  const blockMs = opts.blockMs ?? DEFAULT_READ_BLOCK_MS;
  let lastId = opts.startId ?? '0-0';
  let client: AnyRecord | null = null;

  function redis() {
    if (client) return client;
    const RedisCtor = opts.RedisCtor ?? loadRedisCtor();
    client = createRedisClient(RedisCtor, opts.redis ?? {}, {
      retryStrategy: opts.retryStrategy ?? ((times: number) => Math.min(times * 100, 1000)),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on?.('error', () => {});
    return client;
  }

  return {
    async read(identity: AnyRecord = {}, types: string[] = []) {
      if (!stream) return null;
      const result = await redis().xread('BLOCK', String(blockMs), 'COUNT', '10', 'STREAMS', stream, lastId);
      let matched = null;
      for (const entry of decodeXreadEntries(result)) {
        if (entry.id) lastId = entry.id;
        const event = parseTelemetryEvent(entry);
        if (!event) continue;
        if (!matched && matchesAgentLifecycleTelemetry(event, identity, types)) matched = event;
      }
      return matched;
    },
    close() {
      if (!client) return;
      const current = client;
      client = null;
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

  const timeoutMs = opts.timeoutMs ?? agentObservabilityStartupTimeoutMs(config);
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const reader = createAgentLifecycleTelemetryReader(config, opts);
  const types = opts.types ?? ['agent.spawned', 'agent.session.started'];

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

  const displayIdentity = identity.gateway_label ?? identity.session_key ?? 'agent session';
  log('ERROR', `[agent-observability] required startup evidence missing for ${displayIdentity}`);
  return {
    ok: false,
    skipped: false,
    reason: 'missing_agent_observability_startup_evidence',
    event: null,
    elapsed_ms: Date.now() - startedAt,
  };
}

export function assertRequiredAgentStartupEvidence(result: AnyRecord, identity: AnyRecord = {}) {
  if (result?.ok) return result;
  const displayIdentity = identity.gateway_label ?? identity.session_key ?? 'unknown';
  const reason = result?.reason ?? 'unknown';
  const err: AnyRecord = new Error(`Required agent observability evidence missing for session '${displayIdentity}': ${reason}`);
  err.reason = result?.reason ?? 'missing_agent_observability_startup_evidence';
  err.identity = { ...identity };
  err.observability_required = true;
  throw err;
}
