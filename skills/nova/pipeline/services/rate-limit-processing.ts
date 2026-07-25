import { log } from "../core/logger.ts";
import { objectRecord } from "../value-boundary.ts";
import { finalizeSessionRateLimitExhaustion } from "./rate-limit-exit.ts";
import {
  getRateLimitConfig,
  handleSessionRateLimit,
} from "./rate-limit-handler.ts";

const EXHAUSTED = "rate_limit_exhausted";

function requiredPauseCount(value: any, label: string) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 1)
    throw new Error(`${label} requires explicit positive pauseCount`);
  return Math.trunc(count);
}

async function finalizeConfiguredExhaustion(
  config: any,
  options: any,
  exhausted: any,
) {
  const { status = {}, pauseCount = 0, maxPauses = 0 } = exhausted;
  if (typeof options.buildExhaustedResult === "function") {
    const result = await options.buildExhaustedResult(exhausted);
    return finalizeSessionRateLimitExhaustion(result, {
      config,
      reason: result?.reason || EXHAUSTED,
      maxPauses,
    });
  }
  if (!options.exhaustedResultOptions) {
    throw new Error(
      "session rate-limit exhaustion requires explicit typed buildExhaustedResult or exhaustedResultOptions",
    );
  }
  const resolved =
    typeof options.exhaustedResultOptions === "function"
      ? options.exhaustedResultOptions(exhausted)
      : options.exhaustedResultOptions;
  const {
    reason = EXHAUSTED,
    resultOverrides = {},
    ...buildOptions
  } = objectRecord(resolved);
  return finalizeSessionRateLimitExhaustion(
    {
      status,
      rate_limit_status: status,
      rate_limit_pauses: pauseCount,
      max_rate_limit_pauses: maxPauses,
      ...resultOverrides,
    },
    { config, reason, maxPauses, ...buildOptions },
  );
}

export async function processSessionRateLimit(
  config: any,
  status: any = {},
  options: any = {},
) {
  const pauseCount = requiredPauseCount(
    options.pauseCount,
    "processSessionRateLimit",
  );
  const maxPauses = getRateLimitConfig(config).max_pauses_per_module;
  const normalized = options.normalizeStatus
    ? options.normalizeStatus(status, pauseCount)
    : { ...objectRecord(status) };
  if (pauseCount > maxPauses) {
    const exhausted = { status: normalized, pauseCount, maxPauses };
    const message =
      typeof options.exhaustedLogMessage === "function"
        ? options.exhaustedLogMessage(exhausted)
        : options.exhaustedLogMessage;
    if (message) log("ERROR", message);
    const result = await finalizeConfiguredExhaustion(
      config,
      options,
      exhausted,
    );
    return { exhausted: true, status: normalized, result };
  }
  const handled = await handleSessionRateLimit(config, normalized, {
    ...options,
    pauseCount,
    maxPauses,
  });
  return { exhausted: false, ...handled, status: normalized };
}

export async function withSessionRateLimitRecovery(
  config: any,
  pollFn: any,
  options: any = {},
) {
  const pauseState = options.pauseState || null;
  let pauses = Number.isFinite(Number(pauseState?.count))
    ? Math.trunc(Number(pauseState.count))
    : 0;
  const maxPauses = getRateLimitConfig(config).max_pauses_per_module;
  while (true) {
    const result = await pollFn();
    if (result?.reason !== "rate_limited") return result;
    pauses += 1;
    if (pauseState) pauseState.count = pauses;
    const normalized = options.normalizeStatus
      ? options.normalizeStatus(result, pauses)
      : { ...objectRecord(result?.status) };
    if (pauses > maxPauses) {
      return finalizeConfiguredExhaustion(config, options, {
        result,
        status: normalized,
        pauseCount: pauses,
        maxPauses,
      });
    }
    await handleSessionRateLimit(config, normalized, {
      ...options,
      pauseCount: pauses,
      maxPauses,
    });
  }
}
