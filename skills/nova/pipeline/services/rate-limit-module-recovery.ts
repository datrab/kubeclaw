import { discord } from "../integrations/discord.ts";
import { sleep } from "../timing.ts";
import { log } from "../core/logger.ts";
import { transitionModuleStatus } from "../lifecycle-state.ts";
import { objectRecord, selectPresentValue } from "../value-boundary.ts";
import {
  loadStatus,
  saveStatus,
  appendCooldownLifecycleEvent,
  getLifecycleCooldown,
} from "./status-store.ts";
import { onModuleStatusChanged } from "./telemetry.ts";
import { createSessionRateLimitDiscordNotifier } from "./rate-limit-discord-notifier.ts";
import { buildTrackedModuleSessionRateLimitStatus } from "./rate-limit-builders/exhaustion-options.ts";
import {
  STATUS,
  buildModuleStatusTelemetry,
  buildSessionRateLimitDiscordFields,
  createTrackedModuleSessionRateLimitExhaustedResultOptions,
  resolveRateLimitIdentity,
} from "./rate-limit-builders.ts";
import { appendInvalidRateLimitCooldownResumeAtAlert } from "./rate-limit-exit.ts";
import { withSessionRateLimitRecovery } from "./rate-limit-processing.ts";

const RESUME_DETAIL = "Resumed after durable cooldown replay";

function requireModuleIdentity(...values: any) {
  const moduleId = selectPresentValue(...values);
  if (!moduleId)
    throw new Error(
      "tracked module rate-limit sync requires explicit module identity",
    );
  return moduleId;
}

async function syncModuleRateLimitPause(
  config: any,
  moduleDir: any,
  status: any,
  options: any,
  ctx: any,
) {
  const previous = loadStatus(config, moduleDir);
  if (!previous) return;
  const phase = status.current_phase ?? null;
  const moduleId = requireModuleIdentity(
    status.module_id,
    previous.module_id,
    options.moduleId,
  );
  const event = buildModuleStatusTelemetry(previous, {
    old_status: previous.status,
    new_status: STATUS.RATE_LIMITED,
    phase,
    reason: `Paused ${ctx.cooldownHours}h (rate limit)`,
    attempt: status.attempt ?? null,
    dispatch_id: status.dispatch_id ?? null,
    gateway_label: status.gateway_label ?? null,
    session_key: status.session_key ?? null,
  });
  const transition = transitionModuleStatus(previous, STATUS.RATE_LIMITED, {
    note: `Paused ${ctx.cooldownHours}h (rate limit)`,
    phase,
  });
  saveStatus(config, moduleDir, previous, transition);
  onModuleStatusChanged({ config }, moduleId, event);
}

export async function syncModuleRateLimitResume(
  config: any,
  moduleDir: any,
  status: any = {},
  options: any = {},
) {
  const previous = loadStatus(config, moduleDir);
  if (!previous) return;
  if (previous.status !== STATUS.RATE_LIMITED) return;
  const phase = status.current_phase ?? null;
  const resumedStatus = phase === "forge" ? STATUS.IN_PROGRESS : STATUS.TESTING;
  const moduleId = requireModuleIdentity(
    status.module_id,
    previous.module_id,
    options.moduleId,
  );
  const event = buildModuleStatusTelemetry(previous, {
    old_status: previous.status,
    new_status: resumedStatus,
    phase,
    attempt: status.attempt ?? null,
    dispatch_id: status.dispatch_id ?? null,
    gateway_label: status.gateway_label ?? null,
    session_key: status.session_key ?? null,
  });
  const transition = transitionModuleStatus(previous, resumedStatus, {
    note: "Resumed after rate limit cooldown",
    phase,
  });
  saveStatus(config, moduleDir, previous, transition);
  onModuleStatusChanged({ config }, moduleId, event);
}

function moduleRecoveryCallbacks(config: any, moduleDir: any, options: any) {
  const moduleSyncOptions = {
    ...options,
    moduleId: options.moduleId,
    phase: options.phase,
  };
  return {
    normalizeStatus: (result: any, pauseCount: any) => {
      const normalized = buildTrackedModuleSessionRateLimitStatus(
        config,
        moduleDir,
        objectRecord(result?.status),
        {
          moduleId: options.moduleId,
          phase: options.phase,
          identity: resolveRateLimitIdentity(options.identity, {
            result,
            pauseCount,
          }),
        },
      );
      return typeof options.customNormalizeStatus === "function"
        ? options.customNormalizeStatus(normalized, result, pauseCount)
        : normalized;
    },
    onPause: async (ctx: any) => {
      if (typeof options.customOnPause === "function")
        await options.customOnPause(ctx);
      await syncModuleRateLimitPause(
        config,
        moduleDir,
        ctx.status,
        moduleSyncOptions,
        ctx,
      );
    },
    onResume: async (ctx: any) => {
      await syncModuleRateLimitResume(
        config,
        moduleDir,
        ctx.status,
        moduleSyncOptions,
      );
      if (typeof options.customOnResume === "function")
        await options.customOnResume(ctx);
    },
  };
}

export function createTrackedModuleSessionRateLimitRecoveryOptions(
  config: any,
  moduleDir: any,
  input: any = {},
) {
  const options = {
    ...input,
    sleepFn: input.sleepFn ?? sleep,
    discordFn: input.discordFn ?? discord,
    moduleId: input.moduleId ?? null,
    phase: input.phase ?? null,
    identity: input.identity ?? {},
    customNormalizeStatus: input.normalizeStatus ?? null,
    customOnPause: input.onPause ?? null,
    customOnResume: input.onResume ?? null,
  };
  const notifier = createSessionRateLimitDiscordNotifier(config, {
    discordFn: options.discordFn,
    pauseFields: (status: any) => buildSessionRateLimitDiscordFields(status),
    resumeDescription: (status: any) =>
      `Resuming module ${requireModuleIdentity(status?.module_id, options.moduleId)}`,
    resumeFields: (status: any) => buildSessionRateLimitDiscordFields(status),
  });
  const exhausted =
    input.exhaustedResultOptions != null
      ? input.exhaustedResultOptions
      : createTrackedModuleSessionRateLimitExhaustedResultOptions({
          moduleId: options.moduleId,
          moduleDir,
          phase: options.phase,
          identity: options.identity,
        });
  return {
    ...notifier,
    ...input,
    sleepFn: options.sleepFn,
    ...(input.maxPauses == null ? {} : { maxPauses: input.maxPauses }),
    ...(input.pauseState == null ? {} : { pauseState: input.pauseState }),
    ...(input.pauseLogMessage == null
      ? {}
      : { pauseLogMessage: input.pauseLogMessage }),
    ...(input.resumeLogMessage == null
      ? {}
      : { resumeLogMessage: input.resumeLogMessage }),
    exhaustedResultOptions: exhausted,
    ...moduleRecoveryCallbacks(config, moduleDir, options),
  };
}

export async function withRateLimitRecovery(
  config: any,
  moduleDir: any,
  pollFn: any,
  options: any = {},
) {
  return withSessionRateLimitRecovery(
    config,
    pollFn,
    createTrackedModuleSessionRateLimitRecoveryOptions(
      config,
      moduleDir,
      options,
    ),
  );
}
