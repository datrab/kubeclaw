import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
  resolveResultGatewayLabel,
  resolveResultSessionKey,
} from './correlation.ts';

const RATE_LIMIT_EXHAUSTED_REASON = 'rate_limit_exhausted';
const MAX_PAUSES_EXCEEDED_REASON = 'max_pauses_exceeded';
const REDIS_COMPLETION_SOURCE_MISSING = 'missing_completion_source';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function statusAuthority(status, key, resolvedValue) {
  return Object.prototype.hasOwnProperty.call(status, key) ? status[key] : resolvedValue;
}

function requiredNonnegativeInteger(value, label) {
  const count = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(count)), () => (count < 0))) {
    throw new Error(`${label} is required for rate-limit exhaustion results`);
  }
  return Math.trunc(count);
}

function normalizeGateRateLimitRunId(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'string'), () => (value.trim() === ''))), () => (value !== value.trim()))) {
    throw new Error('gate rate-limit finalizer requires non-empty explicit run id');
  }
  return value;
}

function errorMessage(error) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function buildRateLimitOperatorAlertPayload(exitResult = {}, reason = RATE_LIMIT_EXHAUSTED_REASON, overrides = {}) {
  return {
    module_id: selectTruthyValue(() => (selectTruthyValue(() => (exitResult.module_id), () => (exitResult.module))), () => (null)),
    gate_id: selectTruthyValue(() => (selectTruthyValue(() => (exitResult.gate_id), () => (exitResult.gate))), () => (null)),
    gate_type: selectTruthyValue(() => (exitResult.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (exitResult.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (exitResult.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (exitResult.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (exitResult.session_key), () => (null)),
    terminal_status: 'rate_limited',
    reason: selectPresentValue(exitResult.reason, reason),
    rate_limit_exhausted: true,
    max_rate_limit_pauses: selectDefinedValue(() => (exitResult.max_rate_limit_pauses), () => (null)),
    rate_limit_pauses: selectDefinedValue(() => (exitResult.rate_limit_pauses), () => (null)),
    rate_limit_status: selectTruthyValue(() => (exitResult.rate_limit_status), () => (null)),
    ...overrides,
  };
}

export function buildSessionRateLimitExitResult(result = {}, reason = RATE_LIMIT_EXHAUSTED_REASON, {
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
  if (selectTruthyValue(() => (!rateLimitStatus), () => (typeof rateLimitStatus !== 'object'))) {
    throw new Error('rate_limit_status is required for rate-limit exhaustion results');
  }
  const resolvedIdentity = resolveRateLimitIdentity(identity, { result, rateLimitStatus });
  const maxRateLimitPauses = requiredNonnegativeInteger(
    resolveSessionRateLimitMaxPauses(result, maxPauses),
    'max_rate_limit_pauses',
  );
  const resolvedRunId = resolveRunId(result, resolvedIdentity.run_id);
  const correlation = {
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (resolveAttempt(result)), () => (resolvedIdentity.attempt))), () => (null)),
    dispatch_id: selectDefinedValue(() => (resolveDispatchId(result)), () => (null)),
    gateway_label: selectDefinedValue(() => (resolveGatewayLabel(result)), () => (null)),
    session_key: selectDefinedValue(() => (resolveSessionKey(result)), () => (null)),
    ...(resolvedRunId == null ? {} : { run_id: resolvedRunId }),
  };
  const {
    status: _ignoredStatus,
    rate_limit_status: _ignoredRateLimitStatus,
    rate_limit_pauses: _ignoredRateLimitPauses,
    max_rate_limit_pauses: _ignoredMaxRateLimitPauses,
    ...resultRest
  } = objectRecord(result);

  return buildSessionRateLimitExhaustedResult(
    {
      ...rateLimitStatus,
      ...correlation,
      ...statusOverrides,
    },
    requiredNonnegativeInteger(result?.rate_limit_pauses, 'rate_limit_pauses'),
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
  reason = RATE_LIMIT_EXHAUSTED_REASON,
  exit = null,
} = {}) {
  const exhaustedDispatchId = selectDefinedValue(() => (expectedIdentity.dispatch_id), () => (null));
  const exhaustedSessionKey = selectDefinedValue(() => (expectedIdentity.session_key), () => (null));
  const exhaustedGatewayLabel = selectDefinedValue(() => (expectedIdentity.gateway_label), () => (null));
  const exhaustedAttempt = (selectDefinedValue(() => (selectDefinedValue(() => (resolveResultAttempt(redisEntry)), () => (expectedIdentity.attempt))), () => (null)));
  const exhaustedRunId = selectTruthyValue(() => (selectTruthyValue(() => (redisEntry.run_id), () => (expectedIdentity.run_id))), () => (null));
  const exhaustedMaxRateLimitPauses = selectDefinedValue(() => (redisEntry.max_rate_limit_pauses), () => (null));
  const exhaustedPauseCount = requiredNonnegativeInteger(redisEntry.rate_limit_pauses, 'redis rate_limit_pauses');
  const exhaustedStatus = {
    ...status,
    reason: selectDefinedValue(() => (status.reason), () => (selectPresentValue(redisEntry.reason, redisEntry.summary, MAX_PAUSES_EXCEEDED_REASON))),
    source: selectDefinedValue(() => (status.source), () => (selectPresentValue(redisEntry.source, REDIS_COMPLETION_SOURCE_MISSING))),
    run_id: statusAuthority(status, 'run_id', exhaustedRunId),
    attempt: statusAuthority(status, 'attempt', exhaustedAttempt),
    dispatch_id: statusAuthority(status, 'dispatch_id', exhaustedDispatchId),
    gateway_label: statusAuthority(status, 'gateway_label', exhaustedGatewayLabel),
    session_key: statusAuthority(status, 'session_key', exhaustedSessionKey),
    max_rate_limit_pauses: statusAuthority(status, 'max_rate_limit_pauses', exhaustedMaxRateLimitPauses),
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
      source: selectPresentValue(redisEntry.source, REDIS_COMPLETION_SOURCE_MISSING),
      status: exhaustedStatus,
      _source: 'redis',
      _redis_entry: redisEntry,
      ...resultOverrides,
    },
    reason,
    {
      identity: {
        run_id: exhaustedRunId,
        attempt: selectDefinedValue(() => (expectedIdentity.attempt), () => (null)),
        dispatch_id: selectDefinedValue(() => (expectedIdentity.dispatch_id), () => (null)),
        gateway_label: selectDefinedValue(() => (expectedIdentity.gateway_label), () => (null)),
        session_key: selectDefinedValue(() => (expectedIdentity.session_key), () => (null)),
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
      run_id: firstDefined(expectedIdentity.run_id, identity.run_id),
      attempt: firstDefined(expectedIdentity.attempt, identity.attempt),
      dispatch_id: firstDefined(expectedIdentity.dispatch_id, identity.dispatch_id),
      gateway_label: firstDefined(expectedIdentity.gateway_label, identity.gateway_label),
      session_key: firstDefined(expectedIdentity.session_key, identity.session_key),
    },
  });

  const resolvedCompletionSummary = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (exhaustedStatus.completion_summary), () => (completionSummary))), () => (redisEntry.summary))), () => (null));
  const resolvedForgeCommitHash = selectDefinedValue(() => (exhaustedStatus.forge_commit_hash), () => (null));

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
      appendDurableOperatorAlert(config, 'pipeline.operator_alert', buildRateLimitOperatorAlertPayload(exitResult, reason, {
        reason: 'rate_limit_exhaustion_delivery_failed',
        failed_hook: hookName,
        error: errorMessage(error),
        original_reason: selectPresentValue(exitResult.reason, reason),
      }), {
        severity: 'WARN',
        source: 'rate_limit',
        emitter: 'nova/pipeline/services/rate-limit-exit',
      });
    } catch (alertError) {
      log('WARN', `Rate-limit exhaustion ${hookName} delivery-failure alert write failed: ${errorMessage(alertError)}`);
    }
  };

  const runHook = async (hookName, hook) => {
    if (typeof hook !== 'function') return;
    try {
      await hook(exitResult);
    } catch (error) {
      appendDeliveryFailureAlert(hookName, error);
      log('WARN', `Rate-limit exhaustion ${hookName} hook failed after durable local evidence was written: ${errorMessage(error)}`);
    }
  };

  if (config) {
    appendDurableOperatorAlert(config, 'pipeline.operator_alert', buildRateLimitOperatorAlertPayload(exitResult, reason), {
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
    gate_type: selectTruthyValue(() => (cooldown.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (cooldown.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (cooldown.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (cooldown.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (cooldown.session_key), () => (null)),
    reason: 'invalid_rate_limit_cooldown_resume_at',
    resume_at: selectDefinedValue(() => (resumeAt), () => (null)),
    step_type: selectTruthyValue(() => (step.type), () => (null)),
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
      if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!config), () => (!moduleId))), () => (!phase))), () => (!exhaustedReason))) return;
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
      if (selectTruthyValue(() => (selectTruthyValue(() => (!config), () => (!summaryType))), () => (!exhaustedReason))) return;
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
        ? arrayValue(discordExtraFields(exitResult))
        : arrayValue(discordExtraFields);
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

export async function finalizeGateSessionRateLimitExit(result = {}, options = {}) {
  const {
    config,
    gateId,
    gateType = null,
    phase,
    exhaustedReason = 'rate_limit_exhausted',
    identity = {},
    maxPauses = null,
    exit = null,
    resultOverrides = {},
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
  } = options;
  const canonicalRunId = normalizeGateRateLimitRunId(runId);
  return finalizeGateSessionRateLimitExhaustion(result, {
    config,
    gateId,
    gateType,
    identity,
    maxPauses,
    exit,
    reason,
    resultOverrides,
    resolveRunId: () => canonicalRunId,
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
  resultOverrides = {},
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
    resultOverrides,
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
      if (selectTruthyValue(() => (!config), () => (!moduleId))) return;
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
      if (selectTruthyValue(() => (selectTruthyValue(() => (!config), () => (!discordTitle))), () => (!discordDescription))) return;
      const title = typeof discordTitle === 'function' ? discordTitle(exitResult) : discordTitle;
      const description = typeof discordDescription === 'function' ? discordDescription(exitResult) : discordDescription;
      if (selectTruthyValue(() => (!title), () => (!description))) return;
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
