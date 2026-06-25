type AnyRecord = Record<string, any>;

function record(value: any, field: string): AnyRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  throw new Error(`${field} must be an object`);
}

function optionalRecord(value: any): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nonEmptyString(value: any, field: string): string {
  const normalized = String(value ?? '').trim();
  if (normalized) return normalized;
  throw new Error(`${field} must be a non-empty string`);
}

function numberValue(value: any, field: string, { positive = false, integer = false } = {}): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${field} must be a number`);
  if (integer && !Number.isInteger(normalized)) throw new Error(`${field} must be an integer`);
  if (positive ? normalized <= 0 : normalized < 0) {
    throw new Error(`${field} must be ${positive ? 'positive' : 'non-negative'}`);
  }
  return normalized;
}

export function agentObservabilityConfig(config: AnyRecord = {}): AnyRecord {
  return optionalRecord(config?.agent_observability);
}

export function agentObservabilityProfile(config: AnyRecord = {}): AnyRecord {
  const observability = agentObservabilityConfig(config);
  const profileName = nonEmptyString(observability.profile, 'agent_observability.profile');
  const profiles = record(observability.profiles, 'agent_observability.profiles');
  return record(profiles[profileName], `agent_observability.profiles.${profileName}`);
}

export function agentObservabilityPayloadMaxBytes(config: AnyRecord = {}): number {
  const payload = record(agentObservabilityProfile(config).payload, 'agent_observability profile payload');
  return numberValue(payload.max_event_bytes, 'agent_observability payload max_event_bytes', { positive: true, integer: true });
}

export function agentObservabilityStartupWait(config: AnyRecord = {}) {
  const wait = record(agentObservabilityProfile(config).startup_evidence, 'agent_observability profile startup_evidence');
  return {
    timeoutMs: numberValue(wait.timeout_ms, 'agent_observability startup wait timeout_ms'),
    blockMs: numberValue(wait.block_ms, 'agent_observability startup wait block_ms'),
  };
}

export function agentObservabilityForgeCompletionWait(config: AnyRecord = {}) {
  const wait = record(agentObservabilityProfile(config).forge_completion, 'agent_observability profile forge_completion');
  return {
    xreadBlockMs: numberValue(wait.xread_block_ms, 'agent_observability forge completion xread_block_ms'),
    settleMs: numberValue(wait.settle_ms, 'agent_observability forge completion settle_ms'),
  };
}

export function agentObservabilityIngesterConfig(config: AnyRecord = {}) {
  const observability = agentObservabilityConfig(config);
  const profileConfig = agentObservabilityProfile(config);
  const ingester = optionalRecord(observability.ingester);
  if (ingester.enabled !== true) return { enabled: false };
  const redis = record(profileConfig.redis, 'agent_observability profile redis');
  const streams = record(profileConfig.streams, 'agent_observability profile streams');
  const ingesterProfile = record(profileConfig.ingester, 'agent_observability profile ingester');
  const read = record(ingesterProfile.read, 'agent_observability profile ingester read');
  const loop = record(ingesterProfile.loop, 'agent_observability profile ingester loop');
  const trim = record(ingesterProfile.trim, 'agent_observability profile ingester trim');
  const pressure = record(ingesterProfile.pressure, 'agent_observability profile ingester pressure');
  return {
    enabled: true,
    redisNetworkIsolation: ingester.redisNetworkIsolation,
    groupName: nonEmptyString(ingester.groupName, 'agent_observability.ingester.groupName'),
    consumerName: nonEmptyString(ingester.consumerName, 'agent_observability.ingester.consumerName'),
    pollBlockMs: numberValue(read.block_ms, 'agent_observability ingester read block_ms', { positive: true, integer: true }),
    reclaimIdleMs: numberValue(read.reclaim_idle_ms, 'agent_observability ingester read reclaim_idle_ms', { positive: true, integer: true }),
    redisCommandTimeoutMs: numberValue(redis.command_timeout_ms, 'agent_observability redis command_timeout_ms', { positive: true, integer: true }),
    loopDelayMs: numberValue(loop.delay_ms, 'agent_observability ingester loop delay_ms', { positive: true, integer: true }),
    healthCheckEvery: numberValue(loop.health_check_every, 'agent_observability ingester loop health_check_every', { integer: true }),
    stopTimeoutMs: numberValue(loop.stop_timeout_ms, 'agent_observability ingester loop stop_timeout_ms', { integer: true }),
    trimIntervalMs: numberValue(trim.interval_ms, 'agent_observability ingester trim interval_ms', { positive: true, integer: true }),
    deadLetterMaxLen: numberValue(streams.dead_letter_max_len, 'agent_observability streams dead_letter_max_len', { positive: true, integer: true }),
    controlStreamMaxLen: numberValue(streams.stream_max_len, 'agent_observability streams stream_max_len', { positive: true, integer: true }),
    payloadStreamMaxLen: numberValue(trim.payload_stream_max_len, 'agent_observability ingester trim payload_stream_max_len', { positive: true, integer: true }),
    controlLagDegradedThreshold: numberValue(pressure.control_lag_degraded_threshold, 'agent_observability ingester pressure control_lag_degraded_threshold', { integer: true }),
    payloadPressureDegradedThreshold: numberValue(pressure.payload_pressure_degraded_threshold, 'agent_observability ingester pressure payload_pressure_degraded_threshold', { integer: true }),
  };
}
