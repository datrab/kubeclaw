import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// pipeline/services/runtime-policy.ts — required Buster runtime policy from swarm.config.json

import fs from 'fs';
import { expandSwarmConfig } from '../platform-config.ts';
import { readBusterEnvironment } from '../buster-environment.ts';

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';

const runtimePolicyCache: {
  policy: Record<string, any> | null;
  platformConfig: Record<string, any> | null;
} = { policy: null, platformConfig: null };

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requirePositiveInteger(record: Record<string, any>, field: string, label: string): number {
  const value = record[field];
  if (selectTruthyValue(() => (!Number.isInteger(value)), () => (value <= 0))) {
    throw new Error(`${label}: required positive integer in swarm.config.json`);
  }
  return value;
}

function requireNonNegativeNumber(record: Record<string, any>, field: string, label: string): number {
  const value = record[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value < 0))) {
    throw new Error(`${label}: required non-negative number in swarm.config.json`);
  }
  return value;
}

function requireNonEmptyString(record: Record<string, any>, field: string, label: string): string {
  const value = typeof record[field] === 'string' ? record[field].trim() : '';
  if (!value) throw new Error(`${label}: required non-empty string in swarm.config.json`);
  return value;
}

export function loadBusterPlatformConfig(): Record<string, any> {
  if (runtimePolicyCache.platformConfig) return runtimePolicyCache.platformConfig;
  const configPath = resolveSwarmConfigPathFromEnv();
  const platformConfig = expandSwarmConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  runtimePolicyCache.platformConfig = platformConfig;
  return platformConfig;
}

function buildSpawnPolicy(policy: Record<string, any>, gateway: Record<string, any>): Record<string, any> {
  return {
    gateway,
    thread: policy.thread === true,
    mode: requireNonEmptyString(policy, 'mode', 'config.session.spawn.mode'),
    cleanup: requireNonEmptyString(policy, 'cleanup', 'config.session.spawn.cleanup'),
    streamTo: requireNonEmptyString(policy, 'stream_to', 'config.session.spawn.stream_to'),
  };
}

function buildKillPolicy(
  policy: Record<string, any>,
  statusGateway: Record<string, any>,
  requestGateway: Record<string, any>,
  stopGateway: Record<string, any>,
  listGateway: Record<string, any>,
): Record<string, any> {
  return {
    acpConfirmTimeoutMs: requireNonNegativeNumber(policy, 'acp_confirm_timeout_ms', 'config.session.kill.acp_confirm_timeout_ms'),
    subagentConfirmTimeoutMs: requireNonNegativeNumber(policy, 'subagent_confirm_timeout_ms', 'config.session.kill.subagent_confirm_timeout_ms'),
    confirmPollMs: requirePositiveInteger(policy, 'confirm_poll_ms', 'config.session.kill.confirm_poll_ms'),
    cleanupConfirmTimeoutMs: policy.cleanup_confirm_timeout_ms === 'match_confirm_timeout'
      ? 'match_confirm_timeout'
      : requireNonNegativeNumber(policy, 'cleanup_confirm_timeout_ms', 'config.session.kill.cleanup_confirm_timeout_ms'),
    statusTimeoutMs: statusGateway.timeoutMs,
    requestTimeoutMs: requestGateway.timeoutMs,
    stopRequestTimeoutMs: stopGateway.timeoutMs,
    listTimeoutMs: listGateway.timeoutMs,
    statusGateway,
    requestGateway,
    stopGateway,
    listGateway,
    acpxTimeoutMs: requireNonNegativeNumber(policy, 'acpx_timeout_ms', 'config.session.kill.acpx_timeout_ms'),
    stopMessage: requireNonEmptyString(policy, 'stop_message', 'config.session.kill.stop_message'),
  };
}

function buildTerminationPolicy(policy: Record<string, any>): Record<string, any> {
  const operationTimeoutMs = requirePositiveInteger(policy, 'gateway_operation_timeout_ms', 'config.session.termination.gateway_operation_timeout_ms');
  return {
    graceMs: requireNonNegativeNumber(policy, 'grace_ms', 'config.session.termination.grace_ms'),
    maxGraceMs: requireNonNegativeNumber(policy, 'max_grace_ms', 'config.session.termination.max_grace_ms'),
    confirmPollMs: requirePositiveInteger(policy, 'poll_ms', 'config.session.termination.poll_ms'),
    gatewayRequestMaxMs: requirePositiveInteger(policy, 'gateway_request_max_ms', 'config.session.termination.gateway_request_max_ms'),
    cleanupConfirmTimeoutMs: requireNonNegativeNumber(policy, 'cleanup_confirm_timeout_ms', 'config.session.termination.cleanup_confirm_timeout_ms'),
    statusTimeoutMs: operationTimeoutMs,
    requestTimeoutMs: operationTimeoutMs,
    stopRequestTimeoutMs: operationTimeoutMs,
    listTimeoutMs: operationTimeoutMs,
    acpxTimeoutMs: requirePositiveInteger(policy, 'acpx_timeout_ms', 'config.session.termination.acpx_timeout_ms'),
  };
}

export function loadBusterDiscordWebhookTimeoutMs(): number {
  const config = loadBusterPlatformConfig();
  if (!isRecord(config.discord)) {
    throw new Error('config.discord: required platform config object in swarm.config.json');
  }
  return requirePositiveInteger(config.discord, 'webhook_timeout_ms', 'config.discord.webhook_timeout_ms');
}
function resolveSwarmConfigPathFromEnv(): string {
  const configured = readBusterEnvironment('SWARM_CONFIG');
  if (configured !== undefined && configured !== null && String(configured).trim()) {
    return String(configured);
  }
  return DEFAULT_SWARM_CONFIG_PATH;
}
