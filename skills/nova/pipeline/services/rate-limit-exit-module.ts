import { discord } from "../integrations/discord.ts";
import { onRetryExhausted } from "./telemetry.ts";
import { buildSessionRateLimitDiscordFields } from "./rate-limit-builders.ts";
import { finalizeSessionRateLimitExhaustion } from "./rate-limit-exit-finalizer.ts";

function moduleIdentity(options: any) {
  return {
    ...(options.moduleId == null
      ? {}
      : { module: options.moduleId, module_id: options.moduleId }),
    ...(options.moduleDir == null ? {} : { module_dir: options.moduleDir }),
  };
}

function nullable(value: any) {
  return value ?? null;
}

function defaulted(value: any, fallback: any) {
  return value ?? fallback;
}

function resolvedModuleExitOptions(options: any) {
  const exhaustedReason = defaulted(
    options.exhaustedReason,
    "rate_limit_exhausted",
  );
  return {
    ...options,
    exhaustedReason,
    moduleDir: nullable(options.moduleDir),
    phase: nullable(options.phase),
    identity: defaulted(options.identity, {}),
    maxPauses: nullable(options.maxPauses),
    exit: nullable(options.exit),
    reason: defaulted(options.reason, exhaustedReason),
    notifyDiscord: defaulted(options.notifyDiscord, discord),
    discordLevel: defaulted(options.discordLevel, "CRITICAL"),
    discordTitle: nullable(options.discordTitle),
    discordDescription: nullable(options.discordDescription),
    discordFieldBuilder: defaulted(
      options.discordFieldBuilder,
      buildSessionRateLimitDiscordFields,
    ),
    discordIdentity: defaulted(options.discordIdentity, {}),
    discordExtraFields: defaulted(options.discordExtraFields, []),
    logMessage: nullable(options.logMessage),
    logLevel: defaulted(options.logLevel, "WARN"),
  };
}

function createModuleSessionRateLimitExhaustionOptions(
  config: any,
  options: any,
) {
  return {
    emitRetryExhausted: (exit: any) => {
      if (!config) return;
      if (!options.moduleId) return;
      return onRetryExhausted({ config }, options.moduleId, {
        attempt: exit.attempt,
        phase: options.phase,
        dispatch_id: exit.dispatch_id,
        gateway_label: exit.gateway_label,
        session_key: exit.session_key,
        reason: exit.reason,
        max_attempts: exit.max_rate_limit_pauses,
        max_fails: exit.max_rate_limit_pauses,
      });
    },
    sendDiscord: async (exit: any) => {
      if (!config || !options.discordTitle || !options.discordDescription)
        return;
      const title =
        typeof options.discordTitle === "function"
          ? options.discordTitle(exit)
          : options.discordTitle;
      const description =
        typeof options.discordDescription === "function"
          ? options.discordDescription(exit)
          : options.discordDescription;
      if (!title || !description) return;
      await options.notifyDiscord(
        config,
        options.discordLevel,
        title,
        description,
        options.discordFieldBuilder(
          { ...options.discordIdentity, ...exit, module_id: options.moduleId },
          options.discordExtraFields,
        ),
      );
    },
    logMessage: options.logMessage,
    logLevel: options.logLevel,
  };
}

async function finalizeModuleExhaustion(result: any, options: any) {
  const identity = moduleIdentity(options);
  return finalizeSessionRateLimitExhaustion(result, {
    ...options,
    statusOverrides: { ...identity, ...(options.statusOverrides ?? {}) },
    resultOverrides: { ...identity, ...(options.resultOverrides ?? {}) },
  });
}

export async function finalizeModuleSessionRateLimitExit(
  result: any = {},
  options: any = {},
) {
  const resolved = resolvedModuleExitOptions(options);
  return finalizeModuleExhaustion(result, {
    ...resolved,
    ...createModuleSessionRateLimitExhaustionOptions(options.config, resolved),
  });
}

export { createModuleSessionRateLimitExhaustionOptions };
