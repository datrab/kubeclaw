import { discord } from "../integrations/discord.ts";
import { getRunId } from "../core/runtime.ts";
import { log } from "../core/logger.ts";
import { sleep } from "../timing.ts";
import { objectRecord, selectPresentValue } from "../value-boundary.ts";
import { appendCooldownLifecycleEvent } from "./status-store.ts";
import { formatRateLimitEmbed } from "./failures/presentation.ts";
import { emitRateLimitDetected } from "./telemetry.ts";
import { buildRateLimitDetectedPayload } from "./rate-limit-contract.ts";
import { buildRateLimitDiscordCorrelation } from "./rate-limit-correlation.ts";
import { resolveRateLimitCooldown } from "./rate-limit-cooldown.ts";
import {
  buildSessionRateLimitDiscordFields,
  defaultSessionRateLimitDetail,
} from "./rate-limit-builders.ts";
import { finalizeSessionRateLimitExhaustion } from "./rate-limit-exit.ts";

const EXHAUSTED = "rate_limit_exhausted";

function rateLimitConfig(config: any) {
  const value = config?.rate_limit;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("config.rate_limit is required for rate-limit handling");
  }
  return {
    max_pauses_per_module: Number(value.max_pauses_per_module),
    cooldown_hours: Number(value.cooldown_hours),
    cooldown_buffer_ms: Number(value.cooldown_buffer_ms),
  };
}

export function getRateLimitConfig(config: any) {
  return rateLimitConfig(config);
}

function requiredPauseCount(value: any, label: string) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 1)
    throw new Error(`${label} requires explicit positive pauseCount`);
  return Math.trunc(count);
}

function errorMessage(error: any) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : String(error);
}

function handleContext(config: any, status: any, options: any) {
  const pauseCount = requiredPauseCount(
    options.pauseCount,
    "handleSessionRateLimit",
  );
  const limits = getRateLimitConfig(config);
  const cooldown: any = resolveRateLimitCooldown(status, limits, {
    cooldownBufferMs: limits.cooldown_buffer_ms,
    nowMs: options.nowMs,
  });
  const cooldownHours =
    cooldown.cooldownHours != null
      ? cooldown.cooldownHours
      : cooldown.cooldownMs / (60 * 60 * 1000);
  const detail = options.getDetail
    ? options.getDetail(status)
    : defaultSessionRateLimitDetail(status);
  return {
    status,
    pauseCount,
    maxPauses: limits.max_pauses_per_module,
    detail,
    ...cooldown,
    cooldownHours,
    cooldownMs: cooldown.cooldownMs,
    resumeAt: cooldown.resumeAt,
    cooldownBufferMs: limits.cooldown_buffer_ms,
  };
}

function agentType(status: any) {
  if (status.agent_type) return status.agent_type;
  return status.phase || null;
}

function lifecycleIdentity(status: any) {
  return {
    moduleId: status?.module_id || null,
    gateId: status?.gate_id || null,
    gateType: status?.gate_type || null,
    attempt: status?.attempt ?? null,
  };
}

function appendCooldownStarted(config: any, ctx: any) {
  if (!ctx.status?.module_id && !ctx.status?.gate_id) return;
  appendCooldownLifecycleEvent(config, "rate_limit.cooldown_started", {
    ...lifecycleIdentity(ctx.status),
    pauseCount: ctx.pauseCount,
    maxPauses: ctx.maxPauses,
    cooldownHours: ctx.cooldownHours,
    cooldownMs: ctx.cooldownMs,
    cooldownSource: ctx.cooldownSource,
    cooldownSourceDetail: ctx.cooldownSourceDetail,
    cooldownBufferMs: ctx.cooldownBufferMs,
    retryAfterSeconds: ctx.retryAfterSeconds,
    resumeAt: ctx.resumeAt.toISOString(),
    detail: ctx.detail,
    agentType: agentType(ctx.status),
    dispatchId: ctx.status.dispatch_id ?? null,
    gatewayLabel: ctx.status.gateway_label ?? null,
    sessionKey: ctx.status.session_key || null,
    commitHash: ctx.status.commit_hash || null,
  });
}

function appendCooldownCompleted(config: any, ctx: any) {
  if (!ctx.status?.module_id && !ctx.status?.gate_id) return;
  appendCooldownLifecycleEvent(config, "rate_limit.cooldown_completed", {
    ...lifecycleIdentity(ctx.status),
    pauseCount: ctx.pauseCount,
    maxPauses: ctx.maxPauses,
    resumedAt: new Date().toISOString(),
    detail: ctx.detail,
  });
}

async function emitDetected(config: any, ctx: any, options: any) {
  if (typeof options.emitDetected === "function")
    return options.emitDetected(ctx);
  const status = ctx.status;
  return emitRateLimitDetected(
    { config },
    buildRateLimitDetectedPayload(
      {
        run_id: getRunId(config) ?? null,
        agent_type: agentType(status),
        module_id: status.module_id || null,
        gate_id: status.gate_id || null,
        gate_type:
          status.gate_id != null ? (status.gate_type ?? null) : undefined,
        session_key: status.session_key || null,
        gateway_label: status.gateway_label ?? null,
        attempt: status.attempt ?? null,
        dispatch_id: status.dispatch_id ?? null,
      },
      {
        provider: status.provider,
        allowAnthropicDefault: false,
        pauseCount: ctx.pauseCount,
        maxPauses: ctx.maxPauses,
        cooldownMs: ctx.cooldownMs,
        cooldownSource: ctx.cooldownSource,
        resumeAt: ctx.resumeAt.toISOString(),
        retryAfterSeconds: ctx.retryAfterSeconds,
        detail: ctx.detail,
      },
    ),
  );
}

function suppressPresentation(options: any, ctx: any) {
  return typeof options.suppressPausePresentation === "function"
    ? options.suppressPausePresentation(ctx)
    : options.suppressPausePresentation === true;
}

async function presentPause(config: any, ctx: any, options: any, embed: any) {
  if (suppressPresentation(options, ctx)) return;
  await emitDetected(config, ctx, options);
  if (typeof options.sendPauseDiscord === "function") {
    await options.sendPauseDiscord({ ...ctx, embed });
    return;
  }
  await discord(
    config,
    "WARN",
    embed.title,
    embed.description,
    [...buildSessionRateLimitDiscordFields(ctx.status), ...embed.fields],
    { correlation: buildRateLimitDiscordCorrelation(ctx.status) },
  ).catch((error: any) => {
    log(
      "DEBUG",
      `Rate-limit pause Discord notice failed: ${errorMessage(error)}`,
    );
  });
}

async function pauseAndResume(config: any, ctx: any, options: any, embed: any) {
  if (typeof options.onPause === "function")
    await options.onPause({ ...ctx, embed });
  options.budget?.extendForRateLimit?.(ctx.cooldownMs, {
    bufferMs: ctx.cooldownBufferMs,
    reason: "authorized_rate_limit_cooldown",
  });
  const sleepFn = options.sleepFn !== undefined ? options.sleepFn : sleep;
  await sleepFn(
    ctx.cooldownMs,
    options.budget ? { budget: options.budget } : undefined,
  );
  const message =
    typeof options.resumeLogMessage === "function"
      ? options.resumeLogMessage(ctx)
      : options.resumeLogMessage;
  if (message) log("OK", message);
  if (typeof options.onResume === "function")
    await options.onResume({ ...ctx, embed });
  appendCooldownCompleted(config, ctx);
}

async function presentResume(config: any, ctx: any, options: any, embed: any) {
  if (typeof options.sendResumeDiscord === "function")
    return options.sendResumeDiscord({ ...ctx, embed });
  const target = ctx.status.gate_id
    ? `gate fix ${ctx.status.gate_id}`
    : `session ${selectPresentValue(ctx.status.module_id, ctx.status.gateway_label, ctx.status.session_key, "session")}`;
  return discord(
    config,
    "INFO",
    "Rate limit cooldown complete",
    `Resuming ${target}`,
    buildSessionRateLimitDiscordFields(ctx.status),
    {
      correlation: buildRateLimitDiscordCorrelation(ctx.status),
    },
  ).catch((error: any) =>
    log(
      "DEBUG",
      `Rate-limit resume Discord notice failed: ${errorMessage(error)}`,
    ),
  );
}

export async function handleSessionRateLimit(
  config: any,
  status: any = {},
  options: any = {},
) {
  const ctx = handleContext(config, status, options);
  appendCooldownStarted(config, ctx);
  const message =
    typeof options.pauseLogMessage === "function"
      ? options.pauseLogMessage(ctx)
      : options.pauseLogMessage;
  if (message) log("WARN", message);
  const embed = formatRateLimitEmbed(
    config,
    {
      detail: ctx.detail,
      cooldownSource: ctx.cooldownSource,
      cooldownSourceDetail: ctx.cooldownSourceDetail,
    },
    ctx.pauseCount,
    ctx.maxPauses,
    ctx.cooldownMs,
  );
  await presentPause(config, ctx, options, embed);
  await pauseAndResume(config, ctx, options, embed);
  await presentResume(config, ctx, options, embed);
  return { ...ctx, embed };
}
