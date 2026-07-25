import {
  AGENT_OBSERVABILITY_CONTROL_STREAM, AGENT_OBSERVABILITY_DEADLETTER_STREAM,
  AGENT_OBSERVABILITY_PAYLOAD_STREAM,
} from '../../agent-observability/src/index.ts';
import { errorMessage, pendingCount, redisCount } from './consumer-values.ts';

const runtimeLog = (level: string, message: string, reasonCode: string | null = null) => JSON.stringify({
  schema_version: 'runtime_log.v1', timestamp: new Date().toISOString(), level,
  component: 'nova/agent-observability-ingester', message, error_class: null, reason_code: reasonCode,
});

export async function trimIngester(owner: any): Promise<void> {
  const redis = await owner.ensureRedisReady();
  if (!redis.xtrim) return;
  const targets = [
    [AGENT_OBSERVABILITY_CONTROL_STREAM, owner.config.controlStreamMaxLen, 'agent observability control XTRIM'],
    [AGENT_OBSERVABILITY_PAYLOAD_STREAM, owner.config.payloadStreamMaxLen, 'agent observability payload XTRIM'],
    [AGENT_OBSERVABILITY_DEADLETTER_STREAM, owner.config.deadLetterMaxLen, 'agent observability dead-letter XTRIM'],
  ] as const;
  for (const [streamKey, maxLen, description] of targets) {
    try { await owner.redisCall(() => redis.xtrim?.(streamKey, 'MAXLEN', '~', maxLen), description); }
    catch (error: any) { owner.logger.warn?.(runtimeLog('warn', `${description} failed: ${errorMessage(error)}`, 'REDIS_TRIM_FAILED')); }
  }
}

async function reportPressure(owner: any, ctx: unknown, reason: string, degraded: boolean, detail: Record<string, unknown>) {
  if (degraded) {
    if (owner.degradedReasons.has(reason)) return;
    owner.degradedReasons.add(reason);
    await owner.recordObservabilityDegraded(ctx, { component: 'agent_observability_ingester', surface: 'redis_control_stream',
      reason, detail: JSON.stringify(detail), stream_key: detail.stream_key });
    return;
  }
  if (!owner.degradedReasons.has(reason)) return;
  owner.degradedReasons.delete(reason);
  await owner.recordObservabilityRestored(ctx, { component: 'agent_observability_ingester', surface: 'redis_control_stream',
    reason, detail: JSON.stringify(detail), stream_key: detail.stream_key });
}

export async function checkIngesterPressure(owner: any, ctx: unknown) {
  const redis = await owner.ensureRedisReady();
  const controlPending = redis.xpending ? pendingCount(await owner.redisCall(
    () => redis.xpending?.(AGENT_OBSERVABILITY_CONTROL_STREAM, owner.config.groupName), 'agent observability XPENDING')) : 0;
  const payloadLength = redis.xlen ? redisCount(await owner.redisCall(
    () => redis.xlen?.(AGENT_OBSERVABILITY_PAYLOAD_STREAM), 'agent observability payload XLEN')) : 0;
  const degraded: string[] = [];
  if (controlPending > owner.config.controlLagDegradedThreshold) degraded.push('control_lag');
  if (payloadLength > owner.config.payloadPressureDegradedThreshold) degraded.push('payload_pressure');
  await reportPressure(owner, ctx, 'control_lag', degraded.includes('control_lag'), {
    stream_key: AGENT_OBSERVABILITY_CONTROL_STREAM, pending: controlPending,
    threshold: owner.config.controlLagDegradedThreshold,
  });
  await reportPressure(owner, ctx, 'payload_pressure', degraded.includes('payload_pressure'), {
    stream_key: AGENT_OBSERVABILITY_PAYLOAD_STREAM, length: payloadLength,
    threshold: owner.config.payloadPressureDegradedThreshold,
  });
  return { controlPending, payloadLength, degraded };
}
