import { discord } from "../integrations/discord.ts";
import { sleep } from "../timing.ts";
import { arrayValue } from "../value-boundary.ts";
import { buildSessionRateLimitDiscordFields } from "./discord-fields.ts";
import { createSessionRateLimitDiscordNotifier } from "./rate-limit-discord-notifier.ts";
import {
  createTrackedGateSessionRateLimitExhaustedResultOptions,
  createTrackedGateSessionRateLimitStatusBuilder,
} from "./rate-limit-gate-builders.ts";
import {
  callRateLimitResolver,
  resolveRateLimitIdentity,
} from "./rate-limit-builder-primitives.ts";

function gateNotifierFields(options: any, status: any) {
  const correlation = callRateLimitResolver(options.updateCorrelation, status);
  const extras =
    typeof options.extraFields === "function"
      ? arrayValue(options.extraFields(status))
      : arrayValue(options.extraFields);
  const identity = resolveRateLimitIdentity(options.identity, { status });
  const attempt =
    status?.attempt != null ? status.attempt : (identity.attempt ?? null);
  return [
    ...buildSessionRateLimitDiscordFields({
      run_id: status?.run_id ?? identity.run_id,
      ...(options.gateId == null ? {} : { gate_id: options.gateId }),
      ...(options.gateType == null ? {} : { gate_type: options.gateType }),
      attempt,
      dispatch_id: correlation.dispatch_id ?? identity.dispatch_id,
      gateway_label: correlation.gateway_label ?? identity.gateway_label,
      session_key: identity.session_key,
    }),
    ...extras,
  ];
}

function createGateSessionRateLimitDiscordNotifier(config: any, options: any) {
  const fields = (status: any) => gateNotifierFields(options, status);
  return createSessionRateLimitDiscordNotifier(config, {
    discordFn: options.discordFn,
    pauseFields: fields,
    resumeDescription: options.resumeDescription,
    resumeFields: fields,
  });
}

function optionalRecoveryFields(options: any) {
  return {
    ...(options.maxPauses == null ? {} : { maxPauses: options.maxPauses }),
    ...(options.pauseState == null ? {} : { pauseState: options.pauseState }),
    ...(options.pauseLogMessage == null
      ? {}
      : { pauseLogMessage: options.pauseLogMessage }),
    ...(options.resumeLogMessage == null
      ? {}
      : { resumeLogMessage: options.resumeLogMessage }),
    ...(options.suppressPausePresentation == null
      ? {}
      : { suppressPausePresentation: options.suppressPausePresentation }),
  };
}

export function createTrackedGateSessionRateLimitRecoveryOptions(
  config: any,
  options: any = {},
) {
  const resolved = {
    ...options,
    sleepFn: options.sleepFn ?? sleep,
    discordFn: options.discordFn ?? discord,
    gateId: options.gateId ?? null,
    gateType: options.gateType ?? null,
    identity: options.identity ?? {},
    updateCorrelation: options.updateCorrelation ?? null,
    extraFields: options.extraFields ?? [],
    resumeDescription: options.resumeDescription ?? "Resuming gate.",
  };
  const normalize = createTrackedGateSessionRateLimitStatusBuilder(resolved);
  const notifier = createGateSessionRateLimitDiscordNotifier(config, {
    ...resolved,
    updateCorrelation: (status: any) => normalize.getTrackedCorrelation(status),
  });
  const exhausted =
    options.exhaustedResultConfig == null
      ? {}
      : {
          exhaustedResultOptions:
            createTrackedGateSessionRateLimitExhaustedResultOptions({
              gateId: resolved.gateId,
              gateType: resolved.gateType,
              identity: resolved.identity,
              updateCorrelation: (status: any) =>
                normalize.getTrackedCorrelation(status),
              ...options.exhaustedResultConfig,
            }),
        };
  return {
    sleepFn: resolved.sleepFn,
    ...optionalRecoveryFields(options),
    getTrackedCorrelation: (status: any = null) =>
      normalize.getTrackedCorrelation(status),
    normalizeStatus: (result: any) => normalize(result?.status, { result }),
    ...notifier,
    ...exhausted,
  };
}
