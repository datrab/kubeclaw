// pipeline/services/runtime-policy.ts — required Buster runtime policy from swarm.config.json

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';

let cachedPolicy: Record<string, any> | null = null;

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

function requireNonEmptyString(record: Record<string, any>, field: string, label: string): string {
  const value = typeof record[field] === 'string' ? record[field].trim() : '';
  if (!value) throw new Error(`${label}: required non-empty string in swarm.config.json`);
  return value;
}

export function loadBusterRuntimePolicy(): Record<string, any> {
  if (cachedPolicy) return cachedPolicy;
  const configPath = process.env.SWARM_CONFIG || DEFAULT_SWARM_CONFIG_PATH;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!isRecord(config?.buster)) {
    throw new Error('config.buster: required platform config object in swarm.config.json');
  }
  if (!isRecord(config.buster.runtime)) {
    throw new Error('config.buster.runtime: required platform config object in swarm.config.json');
  }
  const runtime = config.buster.runtime;
  cachedPolicy = Object.freeze({
    heartbeat_path: requireNonEmptyString(runtime, 'heartbeat_path', 'config.buster.runtime.heartbeat_path'),
    heartbeat_interval_ms: requirePositiveInteger(runtime, 'heartbeat_interval_ms', 'config.buster.runtime.heartbeat_interval_ms'),
    task_poll_interval_ms: requirePositiveInteger(runtime, 'task_poll_interval_ms', 'config.buster.runtime.task_poll_interval_ms'),
    task_pending_reclaim_idle_ms: requirePositiveInteger(runtime, 'task_pending_reclaim_idle_ms', 'config.buster.runtime.task_pending_reclaim_idle_ms'),
    task_stream_max_len: requirePositiveInteger(runtime, 'task_stream_max_len', 'config.buster.runtime.task_stream_max_len'),
  });
  return cachedPolicy;
}

export function resetBusterRuntimePolicyForTests(): void {
  cachedPolicy = null;
}
