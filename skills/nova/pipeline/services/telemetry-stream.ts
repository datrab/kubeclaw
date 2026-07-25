import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeTelemetryPayload } from '../egress.ts';
import { buildCanonicalEnvelope } from '../observability-contract.ts';
import {
  TELEMETRY_SEQ_TTL_SECONDS,
  requireTelemetryStreamMaxLenFromConfig,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  createRedisClient,
  loadRedisCtor,
} from '../telemetry.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { objectRecord, selectPresentValue, textValue } from '../value-boundary.ts';
const telemetryTransportState: { redis: any; key: string } = { redis: null, key: '' };
const TELEMETRY_EMITTER = 'nova/pipeline/services/telemetry';
const TELEMETRY_RUN_ID_MISSING = '';

function reportTelemetryStreamIncident(classification: any, error: any, message: any) {
  reportClassifiedNonBlockingError({
    reporter: 'telemetry-stream',
    classification,
    incidentKey: buildNonBlockingIncidentKey('telemetry-stream', classification),
    message,
    error,
    level: 'DEBUG',
  });
}

function telemetryTransportKey(config: any = {}) {
  const telemetry = objectRecord(config?.telemetry);
  return JSON.stringify({
    redisHost: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisHost), () => (telemetry.host))), () => (null)),
    redisPort: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisPort), () => (telemetry.port))), () => (null)),
    redisUsername: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisUsername), () => (telemetry.username))), () => (null)),
    redisPassword: telemetry.redisPassword ? '[set]' : null,
    redisTls: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisTls), () => (telemetry.tls))), () => (null)),
    redisNetworkIsolation: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisNetworkIsolation), () => (telemetry.networkIsolation))), () => (null)),
  });
}

function getRedisClient(config:any = {}) {
  const transportKey = telemetryTransportKey(config);
  if (telemetryTransportState.redis && telemetryTransportState.key === transportKey) return telemetryTransportState.redis;
  if (telemetryTransportState.redis && telemetryTransportState.key !== transportKey) {
    try {
      telemetryTransportState.redis.disconnect?.();
    } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */
      // Best-effort cache rotation; subsequent client creation still reports its own failures.
    }
    telemetryTransportState.redis = null;
    telemetryTransportState.key = '';
  }
  try {
    const Redis = loadRedisCtor();
    telemetryTransportState.redis = createRedisClient(Redis, objectRecord(config?.telemetry), {
      retryStrategy: (times:number) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    telemetryTransportState.redis.on('error', (error:unknown) => {
      reportTelemetryStreamIncident('redis_client_runtime_error', error, 'redis telemetry client emitted a non-blocking runtime error');
    });
    telemetryTransportState.key = transportKey;
    return telemetryTransportState.redis;
  } catch (error: any) {
    reportTelemetryStreamIncident('redis_client_init_failed', error, 'redis telemetry client initialization failed');
    return null;
  }
}

function normalizeTelemetryIdentityPart(value: any) {
  const normalized = textValue(value).trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function resolveTelemetryStreamIdentity(config: any = {}, opts: any = {}) {
  const runId = normalizeTelemetryIdentityPart(opts.runId);
  const project = normalizeTelemetryIdentityPart(config?.project);
  if (selectTruthyValue(() => (!project), () => (!runId))) {
    return {
      ok: false,
      project,
      runId,
      streamKey: null,
      seqKey: null,
      error: new Error('telemetry stream emission requires non-empty project and run_id'),
    };
  }
  return {
    ok: true,
    project,
    runId,
    streamKey: getTelemetryStreamKey(project, runId),
    seqKey: getTelemetrySeqKey(project, runId),
    error: null,
  };
}

export function isTelemetryEnabled(config: any) {
  return config?.telemetry?.enabled === true;
}

export function getTelemetryStreamKeyForRun(config: any, runId: any = '') {
  const identity = resolveTelemetryStreamIdentity(config, { runId });
  return identity.ok ? identity.streamKey : null;
}

async function allocateSeq(redis: any, seqKey: any) {
  const seq = await redis.incr(seqKey);
  await redis.expire(seqKey, TELEMETRY_SEQ_TTL_SECONDS);
  return seq;
}

function telemetryWorkIdentity(payload: any, runId: any) {
  const gateId = normalizeTelemetryIdentityPart(payload.gate_id);
  const moduleId = normalizeTelemetryIdentityPart(payload.module_id);
  const stepId = normalizeTelemetryIdentityPart(payload.step_id);
  if (gateId) return { gateId, moduleId, stepId, workId: gateId, workType: 'gate' };
  if (moduleId) return { gateId, moduleId, stepId, workId: moduleId, workType: 'module' };
  if (stepId) return { gateId, moduleId, stepId, workId: stepId, workType: 'pipeline_step' };
  return { gateId, moduleId, stepId, workId: runId, workType: 'pipeline' };
}

export function buildTelemetryStreamEvent(eventType: any, payload: any = {}, identity: any = {}, seq: any, opts: any = {}, emittedAt: any = new Date().toISOString()) {
  const sanitized = sanitizeTelemetryPayload(objectRecord(payload));
  delete sanitized.project;
  delete sanitized.run_id;
  delete sanitized.source;
  delete sanitized.emitter;
  const { gateId, moduleId, stepId, workId, workType } = telemetryWorkIdentity(sanitized, identity.runId);
  const sourceEventId = opts.sourceEventId !== undefined ? opts.sourceEventId : sanitized.source_event_id;
  return buildCanonicalEnvelope({
    type: eventType,
    payload: sanitized,
    seq,
    occurredAt: opts.occurredAt || emittedAt,
    emittedAt,
    causationId: opts.causationId || null,
    sourceEventId: sourceEventId ?? null,
    authorityClass: opts.authorityClass || 'pipeline_authority',
    identity: {
      project: identity.project, run_id: identity.runId, work_id: workId, work_type: workType,
      module_id:moduleId,gate_id: gateId,gate_type:sanitized.gate_type, attempt: sanitized.attempt, dispatch_id: sanitized.dispatch_id,
      session_id: sanitized.session_id || sanitized.session_key, agent_id: sanitized.agent_id || sanitized.agent_type,
      model_call_id: sanitized.model_call_id, tool_call_id: sanitized.tool_call_id,
      parent_session_id:sanitized.parent_session_id,trace_id:sanitized.trace_id,span_id:sanitized.span_id,parent_span_id:sanitized.parent_span_id,
      source: selectPresentValue(opts.source, 'pipeline'), producer: selectPresentValue(opts.emitter, TELEMETRY_EMITTER),
    },
  });
}

function telemetryEmitFailure(reason: string, identity: any = {}, error: any = null, redis: any = null) {
  return {
    ok: false, skipped: reason === 'disabled', reason,
    runId: selectPresentValue(identity.runId, TELEMETRY_RUN_ID_MISSING),
    streamKey: identity.streamKey ?? null, event: null, redis, error,
  };
}

export async function emitTelemetryStreamEvent(config: any, eventType: any, payload: any = {}, opts: any = {}) {
  if (!isTelemetryEnabled(config)) {
    return telemetryEmitFailure('disabled', { runId: opts.runId });
  }

  const identity = resolveTelemetryStreamIdentity(config, opts);
  const { runId, streamKey } = identity;
  if (!identity.ok) {
    return telemetryEmitFailure('missing_identity', { runId }, identity.error);
  }

  const redis = getRedisClient(config);
  if (!redis) {
    return telemetryEmitFailure('redis_unavailable', identity, new Error('redis client unavailable'));
  }

  const emittedAt = telemetryEmittedAtAuthority(opts);
  try {
    const seq = await allocateSeq(redis, identity.seqKey);
    const event = buildTelemetryStreamEvent(eventType, payload, identity, seq, opts, emittedAt);
    await redis.xadd(streamKey, 'MAXLEN', '~', String(requireTelemetryStreamMaxLenFromConfig(config)), '*', 'data', JSON.stringify(event));
    return {
      ok: true,
      skipped: false,
      reason: null,
      runId,
      streamKey,
      event,
      redis,
      error: null,
    };
  } catch (error: any) {
    return telemetryEmitFailure('redis_emit_failed', identity, error, redis);
  }
}

function telemetryEmittedAtAuthority(opts: any) {
  if (opts.emittedAt) return opts.emittedAt;
  return new Date().toISOString();
}

export async function closeTelemetryStreamRedis() {
  if (!telemetryTransportState.redis) return;
  try {
    await telemetryTransportState.redis.quit();
  } catch (e: any) {
    reportTelemetryStreamIncident('redis_client_close_failed', e, 'redis telemetry client close failed');
  } finally {
    telemetryTransportState.redis = null;
    telemetryTransportState.key = '';
  }
}
