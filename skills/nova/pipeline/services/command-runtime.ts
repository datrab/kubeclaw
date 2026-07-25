import fs from "node:fs";
import { createRedisClient, loadRedisCtor } from "../telemetry.ts";
import { gateStatusPath } from "../core/paths.ts";
import { loadLifecycleReadModels } from "./status-store.ts";
import { publishApprovalSignalState } from "./approval-signal-event-adapter.ts";
import {
  commandControlEnabled,
  consumeCommandOnce,
} from "./command-lifecycle.ts";

type AnyRecord = Record<string, any>;

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}
function readJson(file: string): AnyRecord {
  try {
    return record(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return {};
  }
}
function lifecycleVersion(config: AnyRecord): number {
  const readModels = record(loadLifecycleReadModels(config));
  const version = Number(readModels.event_count ?? 0);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}
function controlCapabilities(config: AnyRecord): string[] {
  const configured = config?.control?.capabilities;
  return Array.isArray(configured)
    ? configured.filter((item: unknown) => typeof item === "string")
    : ["pipeline.control"];
}
function cancellationError(command: AnyRecord): Error {
  return Object.assign(
    new Error(command.reason || "Pipeline cancelled by authorized command"),
    {
      name: "PipelineCommandCancelledError",
      code: "PIPELINE_CANCELLED",
      command_id: command.command_id,
    },
  );
}

export function startCommandRuntime(
  config: AnyRecord,
  progress: AnyRecord,
  options: AnyRecord = {},
) {
  if (!commandControlEnabled(config)) {
    return {
      enabled: false,
      awaitPermission: async () => {},
      stop: async () => {},
    };
  }
  return createEnabledCommandRuntime(config, progress, options);
}

function createEnabledCommandRuntime(
  config: AnyRecord,
  progress: AnyRecord,
  options: AnyRecord,
) {
  const Redis = loadRedisCtor();
  const redis =
    options.redis ??
    createRedisClient(Redis, record(config.telemetry), {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
    });
  const state = {
    stopped: false,
    paused: false,
    cancelled: null as Error | null,
    waiters: new Set<() => void>(),
  };
  const releaseWaiters = () => {
    for (const resolve of state.waiters) resolve();
    state.waiters.clear();
  };
  config._commandRuntimeHealth = {
    status: "healthy",
    checked_at: new Date().toISOString(),
  };
  const handlers = buildCommandHandlers(
    config,
    progress,
    options,
    redis,
    state,
    releaseWaiters,
  );
  const context = () => commandContext(config, state.paused);
  const loop = runCommandLoop(config, redis, handlers, context, state);
  return commandRuntimeController(redis, loop, state, releaseWaiters);
}

function buildCommandHandlers(
  config: AnyRecord,
  progress: AnyRecord,
  options: AnyRecord,
  redis: any,
  state: AnyRecord,
  releaseWaiters: () => void,
) {
  return {
    "pipeline.pause": async () => {
      state.paused = true;
    },
    "pipeline.resume": async () => {
      state.paused = false;
      releaseWaiters();
    },
    "pipeline.cancel": async (command: AnyRecord) => {
      state.cancelled = cancellationError(command);
      state.paused = false;
      releaseWaiters();
      options.abort?.(state.cancelled);
    },
    "approval.resolve": async (command: AnyRecord) => {
      const gateId = command?.target?.gate_id;
      if (!gateId || !progress?.gates?.[gateId])
        throw new Error(
          "approval.resolve requires a configured target.gate_id",
        );
      const current = readJson(gateStatusPath(config, gateId));
      await publishApprovalSignalState(
        config,
        gateId,
        progress.gates[gateId],
        {
          ...current,
          project: config.project,
          run_id: config._runId ?? config.run_id,
          gate_id: gateId,
          gate_type: "approval",
          status: command.decision === "approve" ? "APPROVED" : "REJECTED",
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          decision_by: command.actor,
          decision_via: "pipeline_command",
          reason: command.reason ?? null,
        },
        { redisClient: redis },
      );
    },
  };
}

function commandContext(config: AnyRecord, paused: boolean) {
  return {
    project: config.project,
    capabilities: controlCapabilities(config),
    lifecycle_version: lifecycleVersion(config),
    run_id: config._runId ?? config.run_id,
    pipeline_state: paused
      ? "paused"
      : Object.values(record(loadLifecycleReadModels(config)).gates ?? {}).some(
            (gate: any) =>
              String(gate?.status || "").toUpperCase() === "PENDING_APPROVAL",
          )
        ? "waiting_approval"
        : "running",
  };
}

function runCommandLoop(
  config: AnyRecord,
  redis: any,
  handlers: AnyRecord,
  context: () => AnyRecord,
  state: AnyRecord,
) {
  return (async () => {
    while (!state.stopped) {
      try {
        await consumeCommandOnce(config, {
          redis,
          context: context(),
          handlers,
        });
        config._commandRuntimeHealth = {
          status: "healthy",
          checked_at: new Date().toISOString(),
        };
      } catch (error: any) {
        if (state.stopped) break;
        config._commandRuntimeHealth = {
          status: "degraded",
          last_error: String((error as Error)?.message ?? error),
          checked_at: new Date().toISOString(),
        };
      }
    }
  })();
}

function commandRuntimeController(
  redis: any,
  loop: Promise<void>,
  state: AnyRecord,
  releaseWaiters: () => void,
) {
  return {
    enabled: true,
    async awaitPermission() {
      if (state.cancelled) throw state.cancelled;
      while (state.paused && !state.cancelled && !state.stopped)
        await new Promise<void>((resolve: any) => state.waiters.add(resolve));
      if (state.cancelled) throw state.cancelled;
    },
    async stop() {
      state.stopped = true;
      releaseWaiters();
      try {
        await redis.quit?.();
      } catch {
        redis.disconnect?.();
      }
      await loop;
    },
  };
}
