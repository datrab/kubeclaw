import { discord } from "../integrations/discord.ts";
import { sleep } from "../timing.ts";
import {
  resolveResultAttempt,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from "./correlation.ts";
import { createSessionRateLimitDiscordNotifier } from "./rate-limit-discord-notifier.ts";
import {
  callRateLimitResolver,
  resolveRateLimitIdentity,
  resolveRateLimitOption,
  resolvedRateLimitStatusBase,
} from "./rate-limit-builder-primitives.ts";

export function buildSummarySessionRateLimitStatus(
  status: any = {},
  options: any = {},
) {
  const moduleId =
    status?.module_id != null ? status.module_id : (options.moduleId ?? null);
  const identity = resolveRateLimitIdentity(options.identity ?? {}, { status });
  return {
    ...resolvedRateLimitStatusBase(status, identity),
    ...(moduleId == null ? {} : { module_id: moduleId }),
  };
}

export function buildTrackedSummarySessionRateLimitStatus(
  status: any = {},
  options: any = {},
) {
  const correlation = callRateLimitResolver(options.updateCorrelation, status);
  const identity = resolveRateLimitIdentity(options.identity ?? {}, { status });
  return buildSummarySessionRateLimitStatus(status, {
    moduleId: options.moduleId ?? null,
    identity: {
      ...identity,
      dispatch_id: correlation.dispatch_id ?? null,
      gateway_label: correlation.gateway_label ?? null,
      session_key: identity.session_key,
    },
  });
}

function notifierFields(options: any, status: any) {
  const correlation = callRateLimitResolver(options.updateCorrelation, status);
  const identity = resolveRateLimitIdentity(options.identity ?? {}, { status });
  const fields = options.buildFields({
    run_id: identity.run_id,
    dispatch_id: correlation.dispatch_id ?? identity.dispatch_id,
    gateway_label: correlation.gateway_label ?? identity.gateway_label,
    session_key: identity.session_key,
  });
  const agentId = resolveRateLimitOption(options.agentId, { status });
  const model = resolveRateLimitOption(options.model, { status });
  if (agentId) fields.push({ name: "Agent", value: agentId, inline: true });
  if (model) fields.push({ name: "Model", value: model, inline: true });
  return fields;
}

export function createSummarySessionRateLimitDiscordNotifier(
  config: any,
  options: any = {},
) {
  const resolved = {
    discordFn: options.discordFn ?? discord,
    identity: options.identity ?? {},
    updateCorrelation: options.updateCorrelation ?? null,
    agentId: options.agentId ?? null,
    model: options.model ?? null,
    buildFields: options.buildFields,
  };
  const buildFields = (status: any) => notifierFields(resolved, status);
  return createSessionRateLimitDiscordNotifier(config, {
    discordFn: resolved.discordFn,
    pauseFields: buildFields,
    resumeDescription: options.resumeDescription ?? "Resuming session.",
    resumeFields: buildFields,
  });
}

function trackedCorrelationOwner(identity: any, updateCorrelation: any) {
  const tracked = { dispatch_id: null, gateway_label: null };
  const update = (status: any = null) => {
    const external = callRateLimitResolver(updateCorrelation, status);
    resolveRateLimitIdentity(identity, { status });
    tracked.dispatch_id = external.dispatch_id ?? null;
    tracked.gateway_label = external.gateway_label ?? null;
    return { ...tracked };
  };
  return { tracked, update };
}

export function createTrackedSummarySessionRateLimitRecoveryOptions(
  config: any,
  options: any = {},
) {
  const identity = options.identity ?? {};
  const correlation = trackedCorrelationOwner(
    identity,
    options.updateCorrelation ?? null,
  );
  const discordOptions = createSummarySessionRateLimitDiscordNotifier(config, {
    ...options,
    discordFn: options.discordFn ?? discord,
    identity,
    updateCorrelation: correlation.update,
  });
  return {
    sleepFn: options.sleepFn ?? sleep,
    ...(options.maxPauses == null ? {} : { maxPauses: options.maxPauses }),
    ...(options.pauseState == null ? {} : { pauseState: options.pauseState }),
    getTrackedCorrelation: (status: any = null) =>
      status != null ? correlation.update(status) : { ...correlation.tracked },
    normalizeStatus: (result: any) =>
      buildTrackedSummarySessionRateLimitStatus(result?.status, {
        moduleId: options.moduleId ?? null,
        identity: resolveRateLimitIdentity(identity, { result }),
        updateCorrelation: correlation.update,
      }),
    ...(options.pauseLogMessage == null
      ? {}
      : { pauseLogMessage: options.pauseLogMessage }),
    ...(options.resumeLogMessage == null
      ? {}
      : { resumeLogMessage: options.resumeLogMessage }),
    ...discordOptions,
  };
}

function statusFromResult(result: any) {
  if (result?.rate_limit_status) return result.rate_limit_status;
  return result?.status || null;
}

function trackedOrFallback(tracked: any, statusValue: any, fallback: any) {
  if (tracked != null) return tracked;
  return statusValue != null ? statusValue : (fallback ?? null);
}

function statusOrLast(status: any, lastStatus: any) {
  return status ? status : (lastStatus || null);
}

export function resolveTrackedSessionRateLimitOutcome(
  result: any = {},
  recoveryOptions: any = null,
  fallback: any = {},
) {
  const status = statusFromResult(result);
  const tracked = callRateLimitResolver(
    recoveryOptions?.getTrackedCorrelation,
    status,
  );
  const dispatchId = trackedOrFallback(
    tracked.dispatch_id,
    resolveStatusDispatchId(status),
    fallback.dispatchId,
  );
  const gatewayLabel = trackedOrFallback(
    tracked.gateway_label,
    resolveStatusGatewayLabel(status),
    fallback.gatewayLabel,
  );
  const attempt = trackedOrFallback(
    resolveResultAttempt(result),
    null,
    fallback.attempt,
  );
  const resolvedStatus = statusOrLast(status, fallback.lastStatus);
  return {
    attempt,
    dispatchId,
    gatewayLabel,
    status: resolvedStatus,
  };
}
