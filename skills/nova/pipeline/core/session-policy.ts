// core/session-policy.ts — map swarm.config.json session/gateway policy into runtime options

type AnyRecord = Record<string, any>;

function requireObject(value: any, label: string): AnyRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: required in swarm.config.json`);
  }
  return value;
}

function requireNumber(value: any, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}: required non-negative number in swarm.config.json`);
  }
  return value;
}

function requireString(value: any, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}: required non-empty string in swarm.config.json`);
  }
  return value;
}

function invokePolicy(config: AnyRecord, key: string): AnyRecord {
  const policy = requireObject(config?.gateway?.invoke?.[key], `config.gateway.invoke.${key}`);
  return {
    timeoutMs: requireNumber(policy.timeout_ms, `config.gateway.invoke.${key}.timeout_ms`),
    maxRetries: requireNumber(policy.max_retries, `config.gateway.invoke.${key}.max_retries`),
    retryDelayMs: requireNumber(policy.retry_delay_ms, `config.gateway.invoke.${key}.retry_delay_ms`),
  };
}

export function sessionSpawnPolicy(config: AnyRecord): AnyRecord {
  const spawn = requireObject(config?.session?.spawn, 'config.session.spawn');
  return {
    gateway: invokePolicy(config, 'session_spawn'),
    thread: spawn.thread === true,
    mode: requireString(spawn.mode, 'config.session.spawn.mode'),
    cleanup: requireString(spawn.cleanup, 'config.session.spawn.cleanup'),
    streamTo: requireString(spawn.stream_to, 'config.session.spawn.stream_to'),
  };
}

export function sessionKillPolicy(config: AnyRecord): AnyRecord {
  const kill = requireObject(config?.session?.kill, 'config.session.kill');
  const statusGateway = invokePolicy(config, 'session_status');
  const requestGateway = invokePolicy(config, 'subagent_kill');
  const stopGateway = invokePolicy(config, 'session_send');
  const listGateway = invokePolicy(config, 'subagent_list');
  return {
    acpConfirmTimeoutMs: requireNumber(kill.acp_confirm_timeout_ms, 'config.session.kill.acp_confirm_timeout_ms'),
    subagentConfirmTimeoutMs: requireNumber(kill.subagent_confirm_timeout_ms, 'config.session.kill.subagent_confirm_timeout_ms'),
    confirmPollMs: requireNumber(kill.confirm_poll_ms, 'config.session.kill.confirm_poll_ms'),
    cleanupConfirmTimeoutMs: kill.cleanup_confirm_timeout_ms === 'match_confirm_timeout'
      ? 'match_confirm_timeout'
      : requireNumber(kill.cleanup_confirm_timeout_ms, 'config.session.kill.cleanup_confirm_timeout_ms'),
    statusTimeoutMs: statusGateway.timeoutMs,
    requestTimeoutMs: requestGateway.timeoutMs,
    stopRequestTimeoutMs: stopGateway.timeoutMs,
    listTimeoutMs: listGateway.timeoutMs,
    statusGateway,
    requestGateway,
    stopGateway,
    listGateway,
    acpxTimeoutMs: requireNumber(kill.acpx_timeout_ms, 'config.session.kill.acpx_timeout_ms'),
    stopMessage: requireString(kill.stop_message, 'config.session.kill.stop_message'),
  };
}

export function sessionTerminationPolicy(config: AnyRecord): AnyRecord {
  const termination = requireObject(config?.session?.termination, 'config.session.termination');
  return {
    graceMs: requireNumber(termination.grace_ms, 'config.session.termination.grace_ms'),
    maxGraceMs: requireNumber(termination.max_grace_ms, 'config.session.termination.max_grace_ms'),
    confirmPollMs: requireNumber(termination.poll_ms, 'config.session.termination.poll_ms'),
    gatewayRequestMaxMs: requireNumber(termination.gateway_request_max_ms, 'config.session.termination.gateway_request_max_ms'),
    cleanupConfirmTimeoutMs: requireNumber(termination.cleanup_confirm_timeout_ms, 'config.session.termination.cleanup_confirm_timeout_ms'),
    statusTimeoutMs: requireNumber(termination.status_timeout_ms, 'config.session.termination.status_timeout_ms'),
    requestTimeoutMs: requireNumber(termination.request_timeout_ms, 'config.session.termination.request_timeout_ms'),
    stopRequestTimeoutMs: requireNumber(termination.stop_request_timeout_ms, 'config.session.termination.stop_request_timeout_ms'),
    listTimeoutMs: requireNumber(termination.list_timeout_ms, 'config.session.termination.list_timeout_ms'),
    acpxTimeoutMs: requireNumber(termination.acpx_timeout_ms, 'config.session.termination.acpx_timeout_ms'),
  };
}

export function sessionLifecyclePolicies(config: AnyRecord): AnyRecord {
  return {
    spawnPolicy: sessionSpawnPolicy(config),
    killPolicy: sessionKillPolicy(config),
    terminationPolicy: sessionTerminationPolicy(config),
  };
}

export function gatewayInvokePolicy(config: AnyRecord, key: string): AnyRecord {
  return invokePolicy(config, key);
}
