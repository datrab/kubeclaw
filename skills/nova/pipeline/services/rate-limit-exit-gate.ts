import { discord } from "../integrations/discord.ts";
import { createGateSessionRateLimitExhaustionOptions } from "./rate-limit-builders/exhaustion-options.ts";
import { finalizeSessionRateLimitExhaustion } from "./rate-limit-exit-finalizer.ts";

function normalizeRunId(value: any) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value !== value.trim()
  ) {
    throw new Error(
      "gate rate-limit finalizer requires non-empty explicit run id",
    );
  }
  return value;
}

function gateIdentity(options: any) {
  return {
    ...(options.gateId == null
      ? {}
      : { gate: options.gateId, gate_id: options.gateId }),
    ...(options.gateType == null ? {} : { gate_type: options.gateType }),
  };
}

function nullable(value: any) {
  return value ?? null;
}

function defaulted(value: any, fallback: any) {
  return value ?? fallback;
}

function resolvedGateExitOptions(options: any) {
  const exhaustedReason = defaulted(
    options.exhaustedReason,
    "rate_limit_exhausted",
  );
  return {
    ...options,
    exhaustedReason,
    gateType: nullable(options.gateType),
    identity: defaulted(options.identity, {}),
    maxPauses: nullable(options.maxPauses),
    exit: nullable(options.exit),
    reason: defaulted(options.reason, exhaustedReason),
    telemetryCtx: nullable(options.telemetryCtx),
    discordFn: defaulted(options.discordFn, discord),
    discordLevel: defaulted(options.discordLevel, "CRITICAL"),
    discordTitle: nullable(options.discordTitle),
    discordDescription: nullable(options.discordDescription),
    beforeReturn: nullable(options.beforeReturn),
    gateFailureData: nullable(options.gateFailureData),
    logMessage: defaulted(options.logMessage, exhaustedReason),
    logLevel: defaulted(options.logLevel, "WARN"),
  };
}

async function finalizeGateExhaustion(result: any, options: any) {
  const identity = gateIdentity(options);
  return finalizeSessionRateLimitExhaustion(result, {
    ...options,
    statusOverrides: { ...identity, ...(options.statusOverrides ?? {}) },
    resultOverrides: { ...identity, ...(options.resultOverrides ?? {}) },
  });
}

export async function finalizeGateSessionRateLimitExit(
  result: any = {},
  options: any = {},
) {
  const resolved = resolvedGateExitOptions(options);
  const runId = normalizeRunId(resolved.runId);
  return finalizeGateExhaustion(result, {
    ...resolved,
    resolveRunId: () => runId,
    ...createGateSessionRateLimitExhaustionOptions(resolved.config, {
      gateId: resolved.gateId,
      gateType: resolved.gateType,
      phase: resolved.phase,
      exhaustedReason: resolved.exhaustedReason,
      telemetryCtx: resolved.telemetryCtx,
      runId: resolved.runId,
      discordFn: resolved.discordFn,
      discordLevel: resolved.discordLevel,
      discordTitle: resolved.discordTitle,
      discordDescription: resolved.discordDescription,
      beforeReturn: resolved.beforeReturn,
      gateFailureData: resolved.gateFailureData,
      logMessage: resolved.logMessage,
      logLevel: resolved.logLevel,
    }),
  });
}
