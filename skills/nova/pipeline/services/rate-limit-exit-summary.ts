import { discord } from "../integrations/discord.ts";
import { arrayValue } from "../value-boundary.ts";
import { onRetryExhausted, onSummaryCompleted } from "./telemetry.ts";
import {
  buildSessionRateLimitDiscordFields,
  buildSummarySessionRateLimitStatus,
} from "./rate-limit-builders.ts";
import { createSummarySessionRateLimitExhaustionOptions } from "./rate-limit-builders/exhaustion-options.ts";
import { finalizeSessionRateLimitExhaustion } from "./rate-limit-exit-finalizer.ts";

function summaryHooks(options: any) {
  return {
    emitRetryExhausted: (exit: any) => {
      if (
        !options.config ||
        !options.moduleId ||
        !options.phase ||
        !options.exhaustedReason
      )
        return;
      return onRetryExhausted({ config: options.config }, options.moduleId, {
        attempt: exit.attempt,
        phase: options.phase,
        dispatch_id: exit.dispatch_id,
        gateway_label: exit.gateway_label,
        session_key: exit.session_key,
        reason: options.exhaustedReason,
        max_attempts: exit.max_rate_limit_pauses,
        max_fails: exit.max_rate_limit_pauses,
      });
    },
    emitSummaryCompleted: (exit: any) => {
      if (!options.config || !options.summaryType || !options.exhaustedReason)
        return;
      return onSummaryCompleted(
        { config: options.config },
        options.summaryType,
        {
          attempt: exit.attempt,
          status: "failed",
          reason: options.exhaustedReason,
          dispatch_id: exit.dispatch_id,
          session_key: exit.session_key,
          label: exit.gateway_label,
          model: options.model ?? null,
          runtime: options.runtime ?? null,
        },
      );
    },
  };
}

async function finalizeSummaryExhaustion(result: any, options: any) {
  const status = buildSummarySessionRateLimitStatus(result?.rate_limit_status, {
    moduleId: options.moduleId,
    identity: options.identity ?? {},
  });
  return finalizeSessionRateLimitExhaustion(
    {
      ...result,
      status,
      rate_limit_status: status,
    },
    {
      ...options,
      ...summaryHooks(options),
    },
  );
}

export async function finalizeSummarySessionRateLimitExit(
  result: any = {},
  options: any = {},
) {
  const exhaustedReason = options.exhaustedReason;
  return finalizeSummaryExhaustion(result, {
    ...options,
    identity: options.identity ?? {},
    maxPauses: options.maxPauses ?? null,
    reason: exhaustedReason,
    ...createSummarySessionRateLimitExhaustionOptions(options.config, {
      notifyDiscord: options.notifyDiscord ?? discord,
      discordLevel: options.discordLevel ?? "CRITICAL",
      discordTitle: options.discordTitle ?? null,
      discordDescription: options.discordDescription ?? null,
      discordFieldBuilder:
        options.discordFieldBuilder ?? buildSessionRateLimitDiscordFields,
      discordIdentity: options.discordIdentity ?? {},
      discordExtraFields: options.discordExtraFields ?? [],
      logMessage: options.logMessage ?? exhaustedReason,
      logLevel: options.logLevel ?? "WARN",
    }),
  });
}

export function createTrackedSummarySessionRateLimitExhaustionOptions(
  options: any = {},
) {
  return {
    notifyDiscord: options.notifyDiscord ?? discord,
    discordTitle: options.discordTitle ?? null,
    discordDescription: (exit: any) =>
      `${options.discordSubject ?? "Session"} attempt ${exit.attempt} exceeded max ACP rate limit pauses (${exit.max_rate_limit_pauses}).`,
    discordFieldBuilder:
      options.discordFieldBuilder ?? buildSessionRateLimitDiscordFields,
    discordIdentity: options.discordIdentity ?? {},
    discordExtraFields: (exit: any) => {
      const extras =
        typeof options.discordExtraFields === "function"
          ? arrayValue(options.discordExtraFields(exit))
          : arrayValue(options.discordExtraFields ?? []);
      return [
        ...(options.agentId == null
          ? []
          : [{ name: "Agent", value: options.agentId, inline: true }]),
        ...(options.model == null
          ? []
          : [{ name: "Model", value: options.model, inline: true }]),
        ...(options.timeoutMinutes == null
          ? []
          : [
              {
                name: "Timeout",
                value: `${options.timeoutMinutes}min`,
                inline: true,
              },
            ]),
        ...extras,
      ];
    },
  };
}
