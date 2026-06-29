// pipeline/services/runtime-policy.ts — required Buster runtime policy from swarm.config.json

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
import { expandSwarmConfig } from '../platform-config.ts';

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';

let cachedPolicy: Record<string, any> | null = null;
let cachedPlatformConfig: Record<string, any> | null = null;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requirePositiveInteger(record: Record<string, any>, field: string, label: string): number {
  const value = record[field];
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}: required positive integer in swarm.config.json`);
  }
  return value;
}

function requireNonNegativeNumber(record: Record<string, any>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}: required non-negative number in swarm.config.json`);
  }
  return value;
}

function requireNonEmptyString(record: Record<string, any>, field: string, label: string): string {
  const value = typeof record[field] === 'string' ? record[field].trim() : '';
  if (!value) throw new Error(`${label}: required non-empty string in swarm.config.json`);
  return value;
}

export function loadBusterRuntimePolicy(): Record<string, any> {
  if (cachedPolicy) return cachedPolicy;
  const config = loadBusterPlatformConfig();
  if (!isRecord(config?.buster)) {
    throw new Error('config.buster: required platform config object in swarm.config.json');
  }
  if (!isRecord(config.buster.runtime)) {
    throw new Error('config.buster.runtime: required platform config object in swarm.config.json');
  }
  const runtime = config.buster.runtime;
  cachedPolicy = Object.freeze({
    task_stream: requireNonEmptyString(runtime, 'task_stream', 'config.buster.runtime.task_stream'),
    heartbeat_path: requireNonEmptyString(runtime, 'heartbeat_path', 'config.buster.runtime.heartbeat_path'),
    heartbeat_interval_ms: requirePositiveInteger(runtime, 'heartbeat_interval_ms', 'config.buster.runtime.heartbeat_interval_ms'),
    task_poll_interval_ms: requirePositiveInteger(runtime, 'task_poll_interval_ms', 'config.buster.runtime.task_poll_interval_ms'),
    task_pending_reclaim_idle_ms: requirePositiveInteger(runtime, 'task_pending_reclaim_idle_ms', 'config.buster.runtime.task_pending_reclaim_idle_ms'),
    task_stream_max_len: requirePositiveInteger(runtime, 'task_stream_max_len', 'config.buster.runtime.task_stream_max_len'),
  });
  return cachedPolicy;
}

export function loadBusterPlatformConfig(): Record<string, any> {
  if (cachedPlatformConfig) return cachedPlatformConfig;
  const configPath = process.env.SWARM_CONFIG || DEFAULT_SWARM_CONFIG_PATH;
  cachedPlatformConfig = expandSwarmConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  return cachedPlatformConfig;
}

export function loadBusterSessionPolicies(): Record<string, any> {
  const config = loadBusterPlatformConfig();
  const session = config.session;
  const gateway = config.gateway;
  if (!isRecord(session?.spawn)) throw new Error('config.session.spawn: required platform config object in swarm.config.json');
  if (!isRecord(session?.kill)) throw new Error('config.session.kill: required platform config object in swarm.config.json');
  if (!isRecord(session?.termination)) throw new Error('config.session.termination: required platform config object in swarm.config.json');
  if (!isRecord(gateway?.invoke)) throw new Error('config.gateway.invoke: required platform config object in swarm.config.json');
  if (!isRecord(gateway.invoke.retry)) throw new Error('config.gateway.invoke.retry: required platform config object in swarm.config.json');
  const spawnPolicy = session.spawn;
  const killPolicy = session.kill;
  const terminationPolicy = session.termination;
  const retryPolicy = gateway.invoke.retry;
  const gatewayPolicy = (field: string, label: string) => {
    const invokePolicy = gateway.invoke[field];
    if (!isRecord(invokePolicy)) throw new Error(`${label}: required platform config object in swarm.config.json`);
    return {
      timeoutMs: requireNonNegativeNumber(invokePolicy, 'timeout_ms', `${label}.timeout_ms`),
      maxRetries: requirePositiveInteger(retryPolicy, 'max_attempts', 'config.gateway.invoke.retry.max_attempts'),
      retryDelayMs: requireNonNegativeNumber(retryPolicy, 'retry_delay_ms', 'config.gateway.invoke.retry.retry_delay_ms'),
    };
  };
  const statusGateway = gatewayPolicy('session_status', 'config.gateway.invoke.session_status');
  const spawnGateway = gatewayPolicy('session_spawn', 'config.gateway.invoke.session_spawn');
  const requestGateway = gatewayPolicy('subagent_kill', 'config.gateway.invoke.subagent_kill');
  const stopGateway = gatewayPolicy('session_send', 'config.gateway.invoke.session_send');
  const listGateway = gatewayPolicy('subagent_list', 'config.gateway.invoke.subagent_list');
  return {
    gatewayStatusPolicy: statusGateway,
    spawnPolicy: {
      gateway: spawnGateway,
      thread: spawnPolicy.thread === true,
      mode: requireNonEmptyString(spawnPolicy, 'mode', 'config.session.spawn.mode'),
      cleanup: requireNonEmptyString(spawnPolicy, 'cleanup', 'config.session.spawn.cleanup'),
      streamTo: requireNonEmptyString(spawnPolicy, 'stream_to', 'config.session.spawn.stream_to'),
    },
    killPolicy: {
      acpConfirmTimeoutMs: requireNonNegativeNumber(killPolicy, 'acp_confirm_timeout_ms', 'config.session.kill.acp_confirm_timeout_ms'),
      subagentConfirmTimeoutMs: requireNonNegativeNumber(killPolicy, 'subagent_confirm_timeout_ms', 'config.session.kill.subagent_confirm_timeout_ms'),
      confirmPollMs: requirePositiveInteger(killPolicy, 'confirm_poll_ms', 'config.session.kill.confirm_poll_ms'),
      cleanupConfirmTimeoutMs: killPolicy.cleanup_confirm_timeout_ms === 'match_confirm_timeout'
        ? 'match_confirm_timeout'
        : requireNonNegativeNumber(killPolicy, 'cleanup_confirm_timeout_ms', 'config.session.kill.cleanup_confirm_timeout_ms'),
      statusTimeoutMs: statusGateway.timeoutMs,
      requestTimeoutMs: requestGateway.timeoutMs,
      stopRequestTimeoutMs: stopGateway.timeoutMs,
      listTimeoutMs: listGateway.timeoutMs,
      statusGateway,
      requestGateway,
      stopGateway,
      listGateway,
      acpxTimeoutMs: requireNonNegativeNumber(killPolicy, 'acpx_timeout_ms', 'config.session.kill.acpx_timeout_ms'),
      stopMessage: requireNonEmptyString(killPolicy, 'stop_message', 'config.session.kill.stop_message'),
    },
    terminationPolicy: {
      graceMs: requireNonNegativeNumber(terminationPolicy, 'grace_ms', 'config.session.termination.grace_ms'),
      maxGraceMs: requireNonNegativeNumber(terminationPolicy, 'max_grace_ms', 'config.session.termination.max_grace_ms'),
      confirmPollMs: requirePositiveInteger(terminationPolicy, 'poll_ms', 'config.session.termination.poll_ms'),
      gatewayRequestMaxMs: requirePositiveInteger(terminationPolicy, 'gateway_request_max_ms', 'config.session.termination.gateway_request_max_ms'),
      cleanupConfirmTimeoutMs: requireNonNegativeNumber(terminationPolicy, 'cleanup_confirm_timeout_ms', 'config.session.termination.cleanup_confirm_timeout_ms'),
      statusTimeoutMs: requirePositiveInteger(terminationPolicy, 'gateway_operation_timeout_ms', 'config.session.termination.gateway_operation_timeout_ms'),
      requestTimeoutMs: requirePositiveInteger(terminationPolicy, 'gateway_operation_timeout_ms', 'config.session.termination.gateway_operation_timeout_ms'),
      stopRequestTimeoutMs: requirePositiveInteger(terminationPolicy, 'gateway_operation_timeout_ms', 'config.session.termination.gateway_operation_timeout_ms'),
      listTimeoutMs: requirePositiveInteger(terminationPolicy, 'gateway_operation_timeout_ms', 'config.session.termination.gateway_operation_timeout_ms'),
      acpxTimeoutMs: requirePositiveInteger(terminationPolicy, 'acpx_timeout_ms', 'config.session.termination.acpx_timeout_ms'),
    },
  };
}

export function loadBusterGatewayHealthPolicy(): Record<string, any> {
  const config = loadBusterPlatformConfig();
  if (!isRecord(config?.gateway?.invoke?.health)) throw new Error('config.gateway.invoke.health: required platform config object in swarm.config.json');
  if (!isRecord(config?.gateway?.health)) throw new Error('config.gateway.health: required platform config object in swarm.config.json');
  return {
    invokeTimeoutMs: requireNonNegativeNumber(config.gateway.invoke.health, 'timeout_ms', 'config.gateway.invoke.health.timeout_ms'),
    readyTimeoutMs: requirePositiveInteger(config.gateway.health, 'timeout_ms', 'config.gateway.health.timeout_ms'),
    readyIntervalMs: requirePositiveInteger(config.gateway.health, 'interval_ms', 'config.gateway.health.interval_ms'),
    monitorIntervalMs: requirePositiveInteger(config.gateway.health, 'monitor_interval_ms', 'config.gateway.health.monitor_interval_ms'),
    maxFailures: requirePositiveInteger(config.gateway.health, 'max_failures', 'config.gateway.health.max_failures'),
  };
}

export function resetBusterRuntimePolicyForTests(): void {
  cachedPolicy = null;
  cachedPlatformConfig = null;
}
