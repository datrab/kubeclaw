// services/rate-limit-exit.js — Rate-limit exit/result builders and finalizers

import { log } from '../core/logger.js';
import { discord } from '../integrations/discord.js';
import { onGateFail, onRetryExhausted, onSummaryCompleted } from './telemetry.js';
import {
  buildGateSessionRateLimitStatus,
  buildModuleSessionRateLimitStatus,
  buildSessionRateLimitDiscordFields,
  buildSessionRateLimitExhaustedResult,
  buildSummarySessionRateLimitStatus,
  createGateSessionRateLimitExhaustionOptions,
  createSummarySessionRateLimitExhaustionOptions,
  emitGateRetryExhausted,
  resolveSessionRateLimitExhaustedStatus,
  resolveSessionRateLimitMaxPauses,
  resolveSessionRateLimitRunId,
} from './rate-limit-builders.js';
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
} from './correlation.js';

export function buildSessionRateLimitExitResult(result = {}, reason = 'rate_limit_exhausted', {
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  maxPausesFallback = null,
  exit = null,
  statusFallback = result?.status || {},
  statusOverrides = {},
  resultOverrides = {},
  resolveRunId = resolveSessionRateLimitRunId,
  resolveAttempt = resolveResultAttempt,
  resolveDispatchId = resolveResultDispatchId,
  resolveGatewayLabel = resolveResultGatewayLabel,
  resolveSessionKey = resolveResultSessionKey,
} = {}) {
  const rateLimitStatus = resolveSessionRateLimitExhaustedStatus(result, statusFallback);
  const maxRateLimitPauses = resolveSessionRateLimitMaxPauses(result, maxPausesFallback) ?? 0;
  const resolvedRunId = resolveRunId(result, runIdFallback);
  const correlation = {
    attempt: resolveAttempt(result, attemptFallback),
    dispatch_id: resolveDispatchId(result, dispatchIdFallback),
    gateway_label: resolveGatewayLabel(result, gatewayLabelFallback),
    session_key: resolveSessionKey(result, sessionKeyFallback),
    ...(resolvedRunId == null ? {} : { run_id: resolvedRunId }),
  };
  const {
    status: _ignoredStatus,
    rate_limit_status: _ignoredRateLimitStatus,
    rate_limit_pauses: _ignoredRateLimitPauses,
    max_rate_limit_pauses: _ignoredMaxRateLimitPauses,
    ...resultRest
  } = result || {};

  return buildSessionRateLimitExhaustedResult(
    {
      ...rateLimitStatus,
      ...correlation,
      ...statusOverrides,
    },
    result?.rate_limit_pauses ?? 0,
    maxRateLimitPauses,
    {
      ...resultRest,
      ...correlation,
      ...resultOverrides,
      ...(exit == null ? {} : { exit }),
      reason,
    }
  );
}

export function buildTerminalOwnedRedisRateLimitExitResult(redisEntry = {}, {
  expectedIdentity = {},
  status = {},
  resultOverrides = {},
  reason = 'rate_limit_exhausted',
  exit = null,
} = {}) {
  const exhaustedDispatchId = resolveResultDispatchId(redisEntry, expectedIdentity.dispatch_id || null);
  const exhaustedSessionKey = resolveResultSessionKey(redisEntry, expectedIdentity.session_key || null);
  const exhaustedGatewayLabel = resolveResultGatewayLabel(
    redisEntry,
    expectedIdentity.gateway_label || expectedIdentity.dispatch_id || null,
  );
  const exhaustedAttempt = resolveResultAttempt(redisEntry, expectedIdentity.attempt || null);
  const exhaustedRunId = redisEntry.run_id || expectedIdentity.run_id || null;
  const exhaustedMaxRateLimitPauses = redisEntry.max_rate_limit_pauses ?? redisEntry.max_pauses ?? null;
  const exhaustedPauseCount = redisEntry.rate_limit_pauses ?? redisEntry.pause_count ?? exhaustedMaxRateLimitPauses ?? 0;
  const exhaustedStatus = {
    ...status,
    reason: status.reason ?? (redisEntry.reason || redisEntry.summary || 'max_pauses_exceeded'),
    source: status.source ?? (redisEntry.source || 'unknown'),
    run_id: status.run_id ?? exhaustedRunId,
    attempt: status.attempt ?? exhaustedAttempt,
    dispatch_id: status.dispatch_id ?? exhaustedDispatchId,
    gateway_label: status.gateway_label ?? exhaustedGatewayLabel,
    session_key: status.session_key ?? exhaustedSessionKey,
    max_rate_limit_pauses: status.max_rate_limit_pauses ?? exhaustedMaxRateLimitPauses,
    _source: 'redis',
    _redis_entry: redisEntry,
  };

  return buildSessionRateLimitExitResult(
    {
      ...redisEntry,
      run_id: exhaustedRunId,
      attempt: exhaustedAttempt,
      dispatch_id: exhaustedDispatchId,
      gateway_label: exhaustedGatewayLabel,
      session_key: exhaustedSessionKey,
      max_rate_limit_pauses: exhaustedMaxRateLimitPauses,
      rate_limit_pauses: exhaustedPauseCount,
      source: redisEntry.source || 'unknown',
      status: exhaustedStatus,
      _source: 'redis',
      _redis_entry: redisEntry,
      ...resultOverrides,
    },
    reason,
    {
      runIdFallback: exhaustedRunId,
      attemptFallback: expectedIdentity.attempt || null,
      dispatchIdFallback: expectedIdentity.dispatch_id || null,
      gatewayLabelFallback: expectedIdentity.gateway_label || expectedIdentity.dispatch_id || null,
      sessionKeyFallback: expectedIdentity.session_key || null,
      maxPausesFallback: exhaustedMaxRateLimitPauses,
      statusFallback: exhaustedStatus,
      ...(exit == null ? {} : { exit }),
    },
  );
}

export function buildModuleTerminalOwnedRedisRateLimitExitResult(redisEntry = {}, {
  expectedIdentity = {},
  moduleId = null,
  phaseFallback = null,
  agentTypeFallback = null,
  completionSummary = null,
  forgeCommitHash = null,
  resultOverrides = {},
  reason = 'rate_limit_exhausted',
  exit = null,
} = {}) {
  const moduleIdentity = {
    ...(moduleId == null ? {} : { module: moduleId, module_id: moduleId }),
  };
  const exhaustedStatus = buildModuleSessionRateLimitStatus(redisEntry, {
    moduleId,
    phaseFallback,
    agentTypeFallback,
    runIdFallback: expectedIdentity.run_id || null,
    attemptFallback: expectedIdentity.attempt || null,
    dispatchIdFallback: expectedIdentity.dispatch_id || null,
    gatewayLabelFallback: expectedIdentity.gateway_label || expectedIdentity.dispatch_id || null,
    sessionKeyFallback: expectedIdentity.session_key || null,
  });

  const resolvedCompletionSummary = exhaustedStatus.completion_summary ?? completionSummary ?? redisEntry.summary ?? null;
  const resolvedForgeCommitHash = exhaustedStatus.forge_commit_hash ?? forgeCommitHash ?? redisEntry.commit_hash ?? null;

  return buildTerminalOwnedRedisRateLimitExitResult(redisEntry, {
    expectedIdentity,
    status: {
      ...exhaustedStatus,
      completion_summary: resolvedCompletionSummary,
      forge_commit_hash: resolvedForgeCommitHash,
    },
    resultOverrides: {
      ...moduleIdentity,
      ...(resolvedCompletionSummary == null ? {} : { completion_summary: resolvedCompletionSummary }),
      ...(resolvedForgeCommitHash == null ? {} : { forge_commit_hash: resolvedForgeCommitHash }),
      ...resultOverrides,
    },
    reason,
    exit,
  });
}

export function buildGateTerminalOwnedRedisRateLimitExitResult(redisEntry = {}, {
  expectedIdentity = {},
  gateId = null,
  gateType = null,
  statusOptions = {},
  resultOverrides = {},
  reason = 'rate_limit_exhausted',
  exit = null,
} = {}) {
  const gateIdentity = {
    ...(gateId == null ? {} : { gate: gateId, gate_id: gateId }),
    ...(gateType == null ? {} : { gate_type: gateType }),
  };

  return buildTerminalOwnedRedisRateLimitExitResult(redisEntry, {
    expectedIdentity,
    status: buildGateSessionRateLimitStatus(redisEntry, {
      gateId,
      gateType,
      ...statusOptions,
    }),
    resultOverrides: {
      ...gateIdentity,
      ...resultOverrides,
    },
    reason,
    exit,
  });
}

export async function finalizeSessionRateLimitExhaustion(result = {}, {
  beforeReturn = null,
  emitRetryExhausted = null,
  emitSummaryCompleted = null,
  sendDiscord = null,
  logMessage = null,
  logLevel = 'WARN',
  reason = 'rate_limit_exhausted',
  ...buildOptions
} = {}) {
  const exitResult = buildSessionRateLimitExitResult(result, reason, buildOptions);

  if (typeof beforeReturn === 'function') await beforeReturn(exitResult);
  if (typeof emitRetryExhausted === 'function') await emitRetryExhausted(exitResult);
  if (typeof emitSummaryCompleted === 'function') await emitSummaryCompleted(exitResult);
  if (typeof sendDiscord === 'function') await sendDiscord(exitResult);

  const exhaustedLogMessage = typeof logMessage === 'function'
    ? logMessage(exitResult)
    : logMessage;
  if (exhaustedLogMessage) log(logLevel, exhaustedLogMessage);

  return exitResult;
}

export async function finalizePostRunSummaryRateLimitExhaustion(result = {}, {
  config,
  moduleId,
  summaryType,
  phase,
  exhaustedReason,
  model = null,
  runtime = null,
  sendDiscord = null,
  logMessage = exhaustedReason,
  ...buildOptions
} = {}) {
  return finalizeSessionRateLimitExhaustion(result, {
    ...buildOptions,
    emitRetryExhausted: (exitResult) => {
      if (!config || !moduleId || !phase || !exhaustedReason) return;
      onRetryExhausted({ config }, moduleId, {
        attempt: exitResult.attempt,
        phase,
        dispatch_id: exitResult.dispatch_id,
        gateway_label: exitResult.gateway_label,
        session_key: exitResult.session_key,
        reason: exhaustedReason,
        max_attempts: exitResult.max_rate_limit_pauses,
        max_fails: exitResult.max_rate_limit_pauses,
      });
    },
    emitSummaryCompleted: (exitResult) => {
      if (!config || !summaryType || !exhaustedReason) return;
      onSummaryCompleted({ config }, summaryType, {
        attempt: exitResult.attempt,
        status: 'failed',
        reason: exhaustedReason,
        dispatch_id: exitResult.dispatch_id,
        session_key: exitResult.session_key,
        label: exitResult.gateway_label,
        model,
        runtime,
      });
    },
    sendDiscord,
    logMessage,
  });
}

export async function finalizeSummarySessionRateLimitExhaustion(result = {}, {
  moduleId,
  agentTypeFallback = 'echo',
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  ...options
} = {}) {
  const exhaustedStatus = buildSummarySessionRateLimitStatus(
    result?.rate_limit_status || result?.status,
    {
      moduleId,
      agentTypeFallback,
      runIdFallback,
      attemptFallback,
      dispatchIdFallback,
      gatewayLabelFallback,
      sessionKeyFallback,
    },
  );

  return finalizePostRunSummaryRateLimitExhaustion(
    {
      ...result,
      status: exhaustedStatus,
      rate_limit_status: exhaustedStatus,
    },
    {
      ...options,
      moduleId,
      runIdFallback,
      attemptFallback,
      dispatchIdFallback,
      gatewayLabelFallback,
      sessionKeyFallback,
    },
  );
}

export async function finalizeSummarySessionRateLimitExit(result = {}, {
  config,
  moduleId,
  summaryType,
  phase,
  exhaustedReason,
  agentTypeFallback = 'echo',
  attemptFallback = null,
  runIdFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  maxPausesFallback = null,
  model = null,
  runtime = null,
  notifyDiscord = discord,
  discordLevel = 'CRITICAL',
  discordTitle = null,
  discordDescription = null,
  discordFieldBuilder = buildSessionRateLimitDiscordFields,
  discordIdentity = {},
  discordExtraFields = [],
  logMessage = null,
  logLevel = 'WARN',
} = {}) {
  return finalizeSummarySessionRateLimitExhaustion(result, {
    config,
    moduleId,
    summaryType,
    phase,
    exhaustedReason,
    agentTypeFallback,
    attemptFallback,
    runIdFallback,
    dispatchIdFallback,
    gatewayLabelFallback,
    sessionKeyFallback,
    maxPausesFallback,
    model,
    runtime,
    ...createSummarySessionRateLimitExhaustionOptions(config, {
      notifyDiscord,
      discordLevel,
      discordTitle,
      discordDescription,
      discordFieldBuilder,
      discordIdentity,
      discordExtraFields,
      logMessage,
      logLevel,
    }),
  });
}

export function createTrackedSummarySessionRateLimitExhaustionOptions({
  agentId = null,
  model = null,
  timeoutMinutes = null,
  notifyDiscord = discord,
  discordTitle = null,
  discordSubject = 'Session',
  discordFieldBuilder = buildSessionRateLimitDiscordFields,
  discordIdentity = {},
  discordExtraFields = [],
} = {}) {
  return {
    notifyDiscord: async (...args) => {
      try {
        await notifyDiscord(...args);
      } catch {}
    },
    discordTitle,
    discordDescription: (exitResult) => `${discordSubject} attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
    discordFieldBuilder,
    discordIdentity,
    discordExtraFields: (exitResult) => {
      const resolvedExtraFields = typeof discordExtraFields === 'function'
        ? (discordExtraFields(exitResult) || [])
        : (discordExtraFields || []);
      return [
        ...(agentId == null ? [] : [{ name: 'Agent', value: agentId, inline: true }]),
        ...(model == null ? [] : [{ name: 'Model', value: model, inline: true }]),
        ...(timeoutMinutes == null ? [] : [{ name: 'Timeout', value: `${timeoutMinutes}min`, inline: true }]),
        ...resolvedExtraFields,
      ];
    },
  };
}

export async function finalizeGateSessionRateLimitExhaustion(result = {}, {
  gateId,
  gateType = null,
  statusOverrides = {},
  resultOverrides = {},
  ...options
} = {}) {
  const gateIdentity = {
    ...(gateId == null ? {} : { gate: gateId, gate_id: gateId }),
    ...(gateType == null ? {} : { gate_type: gateType }),
  };

  return finalizeSessionRateLimitExhaustion(result, {
    ...options,
    statusOverrides: {
      ...gateIdentity,
      ...statusOverrides,
    },
    resultOverrides: {
      ...gateIdentity,
      ...resultOverrides,
    },
  });
}

export async function finalizeGateSessionRateLimitExit(result = {}, {
  config,
  gateId,
  gateType = null,
  phase,
  exhaustedReason = 'rate_limit_exhausted',
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  maxPausesFallback = null,
  exit = null,
  reason = exhaustedReason,
  telemetryCtx = null,
  runId = null,
  discordFn = discord,
  discordLevel = 'CRITICAL',
  discordTitle = null,
  discordDescription = null,
  beforeReturn = null,
  gateFailureData = null,
  logMessage = exhaustedReason,
  logLevel = 'WARN',
} = {}) {
  return finalizeGateSessionRateLimitExhaustion(result, {
    gateId,
    gateType,
    runIdFallback,
    attemptFallback,
    dispatchIdFallback,
    gatewayLabelFallback,
    sessionKeyFallback,
    maxPausesFallback,
    exit,
    reason,
    ...createGateSessionRateLimitExhaustionOptions(config, {
      gateId,
      gateType,
      phase,
      exhaustedReason,
      telemetryCtx,
      runId,
      discordFn,
      discordLevel,
      discordTitle,
      discordDescription,
      beforeReturn,
      gateFailureData,
      logMessage,
      logLevel,
    }),
  });
}

export async function finalizeModuleSessionRateLimitExhaustion(result = {}, {
  moduleId,
  moduleDir = null,
  statusOverrides = {},
  resultOverrides = {},
  ...options
} = {}) {
  const moduleIdentity = {
    ...(moduleId == null ? {} : { module: moduleId, module_id: moduleId }),
    ...(moduleDir == null ? {} : { module_dir: moduleDir }),
  };

  return finalizeSessionRateLimitExhaustion(result, {
    ...options,
    statusOverrides: {
      ...moduleIdentity,
      ...statusOverrides,
    },
    resultOverrides: {
      ...moduleIdentity,
      ...resultOverrides,
    },
  });
}

export async function finalizeModuleSessionRateLimitExit(result = {}, {
  config,
  moduleId,
  moduleDir = null,
  phase = null,
  exhaustedReason = 'rate_limit_exhausted',
  attemptFallback = null,
  runIdFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  maxPausesFallback = null,
  exit = null,
  reason = exhaustedReason,
  notifyDiscord = discord,
  discordLevel = 'CRITICAL',
  discordTitle = null,
  discordDescription = null,
  discordFieldBuilder = buildSessionRateLimitDiscordFields,
  discordIdentity = {},
  discordExtraFields = [],
  logMessage = null,
  logLevel = 'WARN',
} = {}) {
  return finalizeModuleSessionRateLimitExhaustion(result, {
    moduleId,
    moduleDir,
    attemptFallback,
    runIdFallback,
    dispatchIdFallback,
    gatewayLabelFallback,
    sessionKeyFallback,
    maxPausesFallback,
    exit,
    reason,
    ...createModuleSessionRateLimitExhaustionOptions(config, {
      moduleId,
      phase,
      notifyDiscord,
      discordLevel,
      discordTitle,
      discordDescription,
      discordFieldBuilder,
      discordIdentity,
      discordExtraFields,
      logMessage,
      logLevel,
    }),
  });
}

export function createModuleSessionRateLimitExhaustionOptions(config, {
  moduleId,
  phase = null,
  discordLevel = 'CRITICAL',
  notifyDiscord = discord,
  discordTitle = null,
  discordDescription = null,
  discordFieldBuilder = buildSessionRateLimitDiscordFields,
  discordIdentity = {},
  discordExtraFields = [],
  logMessage = null,
  logLevel = 'WARN',
} = {}) {
  return {
    emitRetryExhausted: (exitResult) => {
      if (!config || !moduleId) return;
      onRetryExhausted({ config }, moduleId, {
        attempt: exitResult.attempt,
        phase,
        dispatch_id: exitResult.dispatch_id,
        gateway_label: exitResult.gateway_label,
        session_key: exitResult.session_key,
        reason: exitResult.reason,
        max_attempts: exitResult.max_rate_limit_pauses,
        max_fails: exitResult.max_rate_limit_pauses,
      });
    },
    sendDiscord: async (exitResult) => {
      if (!config || !discordTitle || !discordDescription) return;
      const title = typeof discordTitle === 'function' ? discordTitle(exitResult) : discordTitle;
      const description = typeof discordDescription === 'function' ? discordDescription(exitResult) : discordDescription;
      if (!title || !description) return;
      await notifyDiscord(
        config,
        discordLevel,
        title,
        description,
        discordFieldBuilder(
          {
            ...discordIdentity,
            ...exitResult,
            module_id: moduleId,
          },
          discordExtraFields,
        ),
      );
    },
    logMessage,
    logLevel,
  };
}

