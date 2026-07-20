import fs from 'node:fs';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { gateStatusPath } from '../core/paths.ts';
import { loadLifecycleReadModels } from './status-store.ts';
import { publishApprovalSignalState } from './approval-signal-event-adapter.ts';
import { commandControlEnabled, consumeCommandOnce } from './command-lifecycle.ts';

type AnyRecord = Record<string, any>;

function record(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}
function readJson(file: string): AnyRecord {
  try { return record(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return {}; }
}
function lifecycleVersion(config: AnyRecord): number {
  const readModels = record(loadLifecycleReadModels(config));
  const pipeline = record(readModels.pipeline);
  const version = Number(readModels.lifecycle_version ?? pipeline.lifecycle_version ?? 0);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}
function controlCapabilities(config: AnyRecord): string[] {
  const configured = config?.control?.capabilities;
  return Array.isArray(configured) ? configured.filter((item: unknown) => typeof item === 'string') : ['pipeline.control'];
}
function cancellationError(command: AnyRecord): Error {
  return Object.assign(new Error(command.reason || 'Pipeline cancelled by authorized command'), {
    name: 'PipelineCommandCancelledError',
    code: 'PIPELINE_CANCELLED',
    command_id: command.command_id,
  });
}

export function startCommandRuntime(config: AnyRecord, progress: AnyRecord, options: AnyRecord = {}) {
  if (!commandControlEnabled(config)) {
    return { enabled: false, awaitPermission: async () => {}, stop: async () => {} };
  }
  const Redis = loadRedisCtor();
  const redis = options.redis ?? createRedisClient(Redis, record(config.telemetry), {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
  });
  let stopped = false;
  let paused = false;
  let cancelled: Error | null = null;
  const waiters = new Set<() => void>();
  const releaseWaiters = () => { for (const resolve of waiters) resolve(); waiters.clear(); };
  config._commandRuntimeHealth = { status: 'healthy', checked_at: new Date().toISOString() };
  const handlers = {
    'pipeline.pause': async () => { paused = true; },
    'pipeline.resume': async () => { paused = false; releaseWaiters(); },
    'pipeline.cancel': async (command: AnyRecord) => {
      cancelled = cancellationError(command);
      paused = false;
      releaseWaiters();
      options.abort?.(cancelled);
    },
    'approval.resolve': async (command: AnyRecord) => {
      const gateId = command?.target?.gate_id;
      if (!gateId || !progress?.gates?.[gateId]) throw new Error('approval.resolve requires a configured target.gate_id');
      const current = readJson(gateStatusPath(config, gateId));
      await publishApprovalSignalState(config, gateId, progress.gates[gateId], {
        ...current,
        project: config.project,
        run_id: config._runId ?? config.run_id,
        gate_id: gateId,
        gate_type: 'approval',
        status: command.decision === 'approve' ? 'APPROVED' : 'REJECTED',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        decision_by: command.actor,
        decision_via: 'pipeline_command',
        reason: command.reason ?? null,
      }, { redisClient: redis });
    },
  };
  const context = () => ({
    capabilities: controlCapabilities(config),
    lifecycle_version: lifecycleVersion(config),
    run_id: config._runId ?? config.run_id,
  });
  const loop = (async () => {
    while (!stopped) {
      try {
        await consumeCommandOnce(config, { redis, context: context(), handlers });
        config._commandRuntimeHealth = { status: 'healthy', checked_at: new Date().toISOString() };
      }
      catch (error) {
        if (stopped) break;
        config._commandRuntimeHealth = { status: 'degraded', last_error: String((error as Error)?.message ?? error), checked_at: new Date().toISOString() };
      }
    }
  })();
  return {
    enabled: true,
    async awaitPermission() {
      if (cancelled) throw cancelled;
      while (paused && !cancelled && !stopped) await new Promise<void>(resolve => waiters.add(resolve));
      if (cancelled) throw cancelled;
    },
    async stop() {
      stopped = true;
      releaseWaiters();
      try { await redis.quit?.(); } catch { redis.disconnect?.(); }
      await loop;
    },
  };
}
