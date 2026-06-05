// services/rate-limit-exit.js — Rate-limit exit/result builders and finalizers

import { log } from '../core/logger.ts';
import { discord } from '../integrations/discord.ts';
import { appendDurableOperatorAlert, onGateFail, onRetryExhausted, onSummaryCompleted } from './telemetry.ts';
import {
  buildGateSessionRateLimitStatus,
  buildModuleSessionRateLimitStatus,
  buildSessionRateLimitDiscordFields,
  buildSessionRateLimitExhaustedResult,
  buildSummarySessionRateLimitStatus,
  createGateSessionRateLimitExhaustionOptions,
  createSummarySessionRateLimitExhaustionOptions,
  emitGateRetryExhausted,
  resolveRateLimitIdentity,
  resolveSessionRateLimitExhaustedStatus,
  resolveSessionRateLimitMaxPauses,
  resolveSessionRateLimitRunId,
} from './rate-limit-builders.ts';
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
} from './correlation.ts';

export function buildSessionRateLimitExitResult(result = {}, reason = 'rate_limit_exhausted', {
  identity = {},
  maxPauses = null,
  exit = null,
  statusOverrides = {},
  resultOverrides = {},
  resolveRunId = resolveSessionRateLimitRunId,
  resolveAttempt = resolveResultAttempt,
  resolveDispatchId = resolveResultDispatchId,
  resolveGatewayLabel = resolveResultGatewayLabel,
  resolveSessionKey = resolveResultSessionKey,
} = {}) {
  const rateLimitStatus = resolveSessionRateLimitExhaustedStatus(result);
  if (!rateLimitStatus || typeof rateLimitStatus !== 'object') {
    throw new Error('rate_limit_status is required for rate-limit exhaustion results');
  }
  const resolvedIdentity = resolveRateLimitIdentity(identity, { result, rateLimitStatus });
  const maxRateLimitPauses = resolveSessionRateLimitMaxPauses(result, maxPauses) ?? 0;
  const resolvedRunId = resolveRunId(result, resolvedIdentity.run_id);
  const correlation = {
    attempt: resolveAttempt(result) ?? resolvedIdentity.attempt ?? null,
    dispatch_id: resolveDispatchId(result) ?? resolvedIdentity.dispatch_id ?? null,
    gateway_label: resolveGatewayLabel(result) ?? resolvedIdentity.gateway_label ?? null,
    session_key: resolveSessionKey(result) ?? resolvedIdentity.session_key ?? null,
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
  const exhaustedDispatchId = (resolveResultDispatchId(redisEntry) ?? expectedIdentity.dispatch_id ?? null);
  const exhaustedSessionKey = (resolveResultSessionKey(redisEntry) ?? expectedIdentity.session_key ?? null);
  const exhaustedGatewayLabel = (resolveResultGatewayLabel(redisEntry) ?? expectedIdentity.gateway_label ?? null);
  const exhaustedAttempt = (resolveResultAttempt(redisEntry) ?? expectedIdentity.attempt ?? null);
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
      rate_limit_status: exhaustedStatus,
      source: redisEntry.source || 'unknown',
      status: exhaustedStatus,
      _source: 'redis',
      _redis_entry: redisEntry,
      ...resultOverrides,
    },
    reason,
    {
      identity: {
        run_id: exhaustedRunId,
        attempt: expectedIdentity.attempt || null,
        dispatch_id: expectedIdentity.dispatch_id || null,
        gateway_label: expectedIdentity.gateway_label || null,
        session_key: expectedIdentity.session_key || null,
      },
      maxPauses: exhaustedMaxRateLimitPauses,
      ...(exit == null ? {} : { exit }),
    },
  );
}

export function buildModuleTerminalOwnedRedisRateLimitExitResult(redisEntry = {}, {
  expectedIdentity = {},
  moduleId = null,
  phase = null,
  identity = {},
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
    phase,
    identity: {
      ...identity,
      run_id: expectedIdentity.run_id || identity.run_id || null,
      attempt: expectedIdentity.attempt || identity.attempt || null,
      dispatch_id: expectedIdentity.dispatch_id || identity.dispatch_id || null,
      gateway_label: expectedIdentity.gateway_label || identity.gateway_label || null,
      session_key: expectedIdentity.session_key || identity.session_key || null,
    },
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
  config = null,
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

  const appendDeliveryFailureAlert = (hookName, error) => {
    if (!config) return;
    try {
      appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
        module_id: exitResult.module_id || exitResult.module || null,
        gate_id: exitResult.gate_id || exitResult.gate || null,
        gate_type: exitResult.gate_type || null,
        attempt: exitResult.attempt ?? null,
        dispatch_id: exitResult.dispatch_id || null,
        gateway_label: exitResult.gateway_label || null,
        session_key: exitResult.session_key || null,
        exit_code: exitResult.exit ?? null,
        reason: 'rate_limit_exhaustion_delivery_failed',
        failed_hook: hookName,
        error: error?.message || String(error),
        original_reason: exitResult.reason || reason,
        rate_limit_exhausted: true,
        max_rate_limit_pauses: exitResult.max_rate_limit_pauses ?? null,
        rate_limit_pauses: exitResult.rate_limit_pauses ?? null,
        rate_limit_status: exitResult.rate_limit_status || null,
      }, {
        severity: 'WARN',
        source: 'rate_limit',
        emitter: 'nova/pipeline/services/rate-limit-exit',
      });
    } catch (alertError) {
      log('WARN', `Rate-limit exhaustion ${hookName} delivery-failure alert write failed: ${alertError?.message || alertError}`);
    }
  };

  const runHook = async (hookName, hook) => {
    if (typeof hook !== 'function') return;
    try {
      await hook(exitResult);
    } catch (error) {
      appendDeliveryFailureAlert(hookName, error);
      log('WARN', `Rate-limit exhaustion ${hookName} hook failed after durable local evidence was written: ${error?.message || error}`);
    }
  };

  if (config) {
    appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
      module_id: exitResult.module_id || exitResult.module || null,
      gate_id: exitResult.gate_id || exitResult.gate || null,
      gate_type: exitResult.gate_type || null,
      attempt: exitResult.attempt ?? null,
      dispatch_id: exitResult.dispatch_id || null,
      gateway_label: exitResult.gateway_label || null,
      session_key: exitResult.session_key || null,
      exit_code: exitResult.exit ?? null,
      reason: exitResult.reason || reason,
      rate_limit_exhausted: true,
      max_rate_limit_pauses: exitResult.max_rate_limit_pauses ?? null,
      rate_limit_pauses: exitResult.rate_limit_pauses ?? null,
      rate_limit_status: exitResult.rate_limit_status || null,
    }, {
      severity: 'CRITICAL',
      source: 'rate_limit',
      emitter: 'nova/pipeline/services/rate-limit-exit',
    });
  }

  await runHook('beforeReturn', beforeReturn);
  await runHook('emitRetryExhausted', emitRetryExhausted);
  await runHook('emitSummaryCompleted', emitSummaryCompleted);
  await runHook('sendDiscord', sendDiscord);

  const exhaustedLogMessage = typeof logMessage === 'function'
    ? logMessage(exitResult)
    : logMessage;
  if (exhaustedLogMessage) log(logLevel, exhaustedLogMessage);

  return exitResult;
}

export function appendInvalidRateLimitCooldownResumeAtAlert(config, step = {}, cooldown = {}, resumeAt = null) {
  appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
    module_id: step.type === 'module' ? step.id : null,
    gate_id: step.type === 'gate' ? step.id : null,
    gate_type: cooldown.gate_type || null,
    attempt: cooldown.attempt ?? null,
    dispatch_id: cooldown.dispatch_id || null,
    gateway_label: cooldown.gateway_label || null,
    session_key: cooldown.session_key || null,
    reason: 'invalid_rate_limit_cooldown_resume_at',
    resume_at: resumeAt ?? null,
    step_type: step.type || null,
  }, {
    severity: 'WARN',
    source: 'rate_limit',
    emitter: 'nova/pipeline/services/rate-limit-exit',
  });
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
    config,
    emitRetryExhausted: (exitResult) => {
      if (!config || !moduleId || !phase || !exhaustedReason) return;
      return onRetryExhausted({ config }, moduleId, {
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
      return onSummaryCompleted({ config }, summaryType, {
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
  identity = {},
  ...options
} = {}) {
  const exhaustedStatus = buildSummarySessionRateLimitStatus(
    result?.rate_limit_status,
    {
      moduleId,
      identity,
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
      identity,
    },
  );
}

export async function finalizeSummarySessionRateLimitExit(result = {}, {
  config,
  moduleId,
  summaryType,
  phase,
  exhaustedReason,
  identity = {},
  maxPauses = null,
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
    identity,
    maxPauses,
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
    notifyDiscord,
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
  identity = {},
  maxPauses = null,
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
    config,
    gateId,
    gateType,
    identity,
    maxPauses,
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
  identity = {},
  maxPauses = null,
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
    config,
    moduleId,
    moduleDir,
    identity,
    maxPauses,
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
      return onRetryExhausted({ config }, moduleId, {
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
