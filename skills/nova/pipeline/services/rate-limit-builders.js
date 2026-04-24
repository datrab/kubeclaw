// services/rate-limit-builders.js — Rate-limit status builders, notifier factories, and exhaustion option scaffolding

import { log } from '../core/logger.js';
import { getRunId } from '../core/runtime.js';
import { loadStatus, saveStatus, appendCooldownLifecycleEvent, getLifecycleCooldown } from './status-store.js';
import { discord } from '../integrations/discord.js';
import { formatRateLimitEmbed } from './failures.js';
import { emitRateLimitDetected, onGateFail, onModuleStatusChanged, onRetryExhausted, onSummaryCompleted } from './telemetry.js';
import { transitionModuleStatus } from '../../../common/pipeline/lifecycle-state.js';
import { buildSessionRateLimitDiscordFields as buildSharedSessionRateLimitDiscordFields } from './discord-fields.js';
import { buildRateLimitDetectedPayload } from '../../../common/pipeline/services/rate-limit-contract.js';
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveStatusDispatchId,
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from './correlation.js';

// Imported from polling.js — circular import is safe because these are function
// references only used inside function bodies, never at module initialisation.
import { sleep } from './polling.js';

export const STATUS = {
  PENDING:           'PENDING',
  IN_PROGRESS:       'IN_PROGRESS',
  READY_FOR_TESTING: 'READY_FOR_TESTING',
  TESTING:           'TESTING',
  PASS:              'PASS',
  FAIL:              'FAIL',
  BLOCKED:           'BLOCKED',
  RATE_LIMITED:      'RATE_LIMITED',
};

function currentAttemptNumber(status) {
  return status?.attempt ?? ((status?.fail_count || 0) + 1);
}

function resolveCommitHash(status) {
  return status?.commit_hash
    || status?.forge_commit_hash
    || status?.buster_commit_hash
    || status?.forge_commit
    || status?.buster_commit
    || null;
}

export function buildModuleStatusTelemetry(status, overrides = {}) {
  const dispatchId = overrides.dispatch_id
    ?? resolveStatusDispatchId(status, null);
  const sessionKey = overrides.session_key
    ?? resolveStatusSessionKey(status, null);
  const gatewayLabel = overrides.gateway_label
    ?? resolveStatusGatewayLabel(status, dispatchId ?? null);

  return {
    title: status?.title || null,
    old_status: overrides.old_status ?? status?.status ?? null,
    new_status: overrides.new_status ?? null,
    attempt: overrides.attempt ?? currentAttemptNumber(status),
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    session_key: sessionKey,
    phase: overrides.phase ?? status?.current_phase ?? null,
    model: overrides.model ?? status?.active_agent?.model ?? null,
    duration_seconds: overrides.duration_seconds ?? null,
    cost_estimate_usd: overrides.cost_estimate_usd ?? null,
    commit_hash: overrides.commit_hash ?? resolveCommitHash(status),
    reason: overrides.reason ?? null,
  };
}

export function buildSessionRateLimitDiscordFields(identity = {}, extra = []) {
  return buildSharedSessionRateLimitDiscordFields(identity, extra);
}

export function emitGateRetryExhausted(telemetryCtx, gateId, {
  gateType = null,
  phase = null,
  attempt = null,
  maxAttempts = null,
  reason = null,
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
} = {}) {
  onRetryExhausted(telemetryCtx, gateId, {
    gate_id: gateId,
    gate_type: gateType || null,
    attempt: attempt ?? null,
    phase,
    dispatch_id: dispatchId || null,
    gateway_label: gatewayLabel || dispatchId || null,
    session_key: sessionKey || null,
    reason: reason || null,
    max_attempts: maxAttempts ?? null,
    max_fails: maxAttempts ?? null,
  });
}

export function defaultSessionRateLimitDetail(status = {}) {
  return status?.detail || status?.reason || status?.summary || 'rate limit detected';
}

export function buildSessionRateLimitExhaustedResult(status = {}, pauseCount = 0, maxPauses = 0, extras = {}) {
  return {
    ok: false,
    reason: 'rate_limit_exhausted',
    status,
    rate_limit_exhausted: true,
    rate_limit_status: status,
    rate_limit_pauses: pauseCount,
    max_rate_limit_pauses: maxPauses,
    ...extras,
  };
}

export function resolveSessionRateLimitExhaustedStatus(result = {}, fallback = null) {
  return result?.rate_limit_status
    || result?.status
    || fallback
    || null;
}

export function resolveSessionRateLimitMaxPauses(result = {}, fallback = null) {
  return result?.max_rate_limit_pauses
    ?? result?.rate_limit_status?.max_rate_limit_pauses
    ?? result?.status?.max_rate_limit_pauses
    ?? fallback
    ?? null;
}

export function resolveSessionRateLimitRunId(result = {}, fallback = null) {
  return result?.run_id
    ?? result?.rate_limit_status?.run_id
    ?? result?.status?.run_id
    ?? fallback
    ?? null;
}

export function buildGateSessionRateLimitStatus(status = {}, {
  gateId = null,
  gateType = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
} = {}) {
  const resolvedGateId = gateId ?? status?.gate_id ?? status?.gate ?? null;
  const resolvedGateType = gateType ?? status?.gate_type ?? null;
  const resolvedAgentType = status?.agent_type ?? agentTypeFallback ?? resolvedGateType ?? null;

  return {
    ...(status || {}),
    status: STATUS.RATE_LIMITED,
    ...(resolvedGateId == null ? {} : { gate: resolvedGateId, gate_id: resolvedGateId }),
    ...(resolvedGateType == null ? {} : { gate_type: resolvedGateType }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: status?.run_id ?? runIdFallback ?? null,
    attempt: status?.attempt ?? attemptFallback ?? null,
    dispatch_id: resolveStatusDispatchId(status, dispatchIdFallback),
    gateway_label: resolveStatusGatewayLabel(status, gatewayLabelFallback),
    session_key: resolveStatusSessionKey(status, sessionKeyFallback),
  };
}

export function buildTrackedGateSessionRateLimitStatus(status = {}, {
  gateId = null,
  gateType = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  updateCorrelation = null,
} = {}) {
  return createTrackedGateSessionRateLimitStatusBuilder({
    gateId,
    gateType,
    agentTypeFallback,
    runIdFallback,
    attemptFallback,
    dispatchIdFallback,
    gatewayLabelFallback,
    sessionKeyFallback,
    updateCorrelation,
  })(status, { status });
}

export function resolveRateLimitOption(value, ctx) {
  return typeof value === 'function' ? value(ctx) : value;
}

export function createTrackedGateSessionRateLimitStatusBuilder({
  gateId = null,
  gateType = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  updateCorrelation = null,
} = {}) {
  const trackedCorrelation = {
    dispatch_id: null,
    gateway_label: null,
  };

  const updateTrackedCorrelation = (status = null, ctx = { status }) => {
    const externalCorrelation = typeof updateCorrelation === 'function'
      ? (updateCorrelation(status) || {})
      : {};

    trackedCorrelation.dispatch_id = externalCorrelation.dispatch_id
      ?? resolveStatusDispatchId(status, trackedCorrelation.dispatch_id ?? resolveRateLimitOption(dispatchIdFallback, ctx) ?? null);
    trackedCorrelation.gateway_label = externalCorrelation.gateway_label
      ?? resolveStatusGatewayLabel(
        status,
        trackedCorrelation.gateway_label
          ?? resolveRateLimitOption(gatewayLabelFallback, ctx)
          ?? trackedCorrelation.dispatch_id
          ?? null,
      );

    return { ...trackedCorrelation };
  };

  const normalizeStatus = (status = {}, ctx = { status }) => {
    const correlation = updateTrackedCorrelation(status, ctx);

    return buildGateSessionRateLimitStatus(status, {
      gateId,
      gateType,
      agentTypeFallback,
      runIdFallback: resolveRateLimitOption(runIdFallback, ctx),
      attemptFallback: resolveRateLimitOption(attemptFallback, ctx),
      dispatchIdFallback: correlation.dispatch_id ?? null,
      gatewayLabelFallback: correlation.gateway_label ?? null,
      sessionKeyFallback: resolveStatusSessionKey(status, resolveRateLimitOption(sessionKeyFallback, ctx) ?? null),
    });
  };

  normalizeStatus.getTrackedCorrelation = (status = null, ctx = status == null ? null : { status }) => {
    if (status != null) return updateTrackedCorrelation(status, ctx);
    return { ...trackedCorrelation };
  };

  return normalizeStatus;
}

export function createTrackedGateSessionRateLimitExhaustedResultOptions({
  gateId = null,
  gateType = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  updateCorrelation = null,
  statusOverrides = {},
  resultOverrides = {},
  exit = null,
} = {}) {
  return ({ result = {}, status = result?.status || {}, maxPauses } = {}) => {
    const ctx = { result, status, maxPauses };
    const correlation = typeof updateCorrelation === 'function'
      ? (updateCorrelation(status) || {})
      : {};
    const resolvedStatusOverrides = resolveRateLimitOption(statusOverrides, ctx) || {};
    const resolvedResultOverrides = resolveRateLimitOption(resultOverrides, ctx) || {};
    const resolvedRunIdFallback = resolveRateLimitOption(runIdFallback, ctx);
    const resolvedAttemptFallback = resolveRateLimitOption(attemptFallback, ctx);
    const resolvedDispatchIdFallback = correlation.dispatch_id ?? resolveRateLimitOption(dispatchIdFallback, ctx) ?? null;
    const resolvedGatewayLabelFallback = correlation.gateway_label ?? resolveRateLimitOption(gatewayLabelFallback, ctx) ?? null;
    const resolvedSessionKeyFallback = resolveStatusSessionKey(status, resolveRateLimitOption(sessionKeyFallback, ctx) ?? null);
    const resolvedExit = resolveRateLimitOption(exit, ctx);
    const gateIdentity = {
      ...(gateId == null ? {} : { gate: gateId, gate_id: gateId }),
      ...(gateType == null ? {} : { gate_type: gateType }),
    };

    return {
      runIdFallback: resolvedRunIdFallback,
      attemptFallback: resolvedAttemptFallback,
      dispatchIdFallback: resolvedDispatchIdFallback,
      gatewayLabelFallback: resolvedGatewayLabelFallback,
      sessionKeyFallback: resolvedSessionKeyFallback,
      maxPausesFallback: maxPauses,
      statusOverrides: {
        ...gateIdentity,
        ...resolvedStatusOverrides,
      },
      ...(resolvedExit == null ? {} : { exit: resolvedExit }),
      resultOverrides: {
        ...gateIdentity,
        ...resolvedResultOverrides,
      },
    };
  };
}

export function buildModuleSessionRateLimitStatus(status = {}, {
  moduleId = null,
  phaseFallback = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
} = {}) {
  const currentPhase = status?.current_phase ?? status?.phase ?? phaseFallback ?? null;
  const resolvedAgentType = status?.agent_type ?? agentTypeFallback ?? currentPhase ?? null;

  return {
    ...(status || {}),
    status: STATUS.RATE_LIMITED,
    ...(status?.module_id != null || moduleId != null ? { module_id: status?.module_id ?? moduleId } : {}),
    ...(currentPhase == null ? {} : { current_phase: currentPhase, phase: currentPhase }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: status?.run_id ?? runIdFallback ?? null,
    attempt: status?.attempt ?? attemptFallback ?? null,
    dispatch_id: resolveStatusDispatchId(status, dispatchIdFallback),
    gateway_label: resolveStatusGatewayLabel(status, gatewayLabelFallback),
    session_key: resolveStatusSessionKey(status, sessionKeyFallback),
  };
}

export function buildSummarySessionRateLimitStatus(status = {}, {
  moduleId = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
} = {}) {
  const resolvedModuleId = status?.module_id ?? moduleId ?? null;
  const resolvedAgentType = status?.agent_type ?? agentTypeFallback ?? null;

  return {
    ...(status || {}),
    status: STATUS.RATE_LIMITED,
    ...(resolvedModuleId == null ? {} : { module_id: resolvedModuleId }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: status?.run_id ?? runIdFallback ?? null,
    attempt: status?.attempt ?? attemptFallback ?? null,
    dispatch_id: resolveStatusDispatchId(status, dispatchIdFallback),
    gateway_label: resolveStatusGatewayLabel(status, gatewayLabelFallback),
    session_key: resolveStatusSessionKey(status, sessionKeyFallback),
  };
}

export function buildTrackedSummarySessionRateLimitStatus(status = {}, {
  moduleId = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  updateCorrelation = null,
} = {}) {
  const correlation = typeof updateCorrelation === 'function'
    ? (updateCorrelation(status) || {})
    : {};

  return buildSummarySessionRateLimitStatus(status, {
    moduleId,
    agentTypeFallback,
    runIdFallback,
    attemptFallback,
    dispatchIdFallback: correlation.dispatch_id ?? resolveRateLimitOption(dispatchIdFallback, { status }) ?? null,
    gatewayLabelFallback: correlation.gateway_label ?? resolveRateLimitOption(gatewayLabelFallback, { status }) ?? null,
    sessionKeyFallback: resolveStatusSessionKey(status, sessionKeyFallback),
  });
}

export function createSummarySessionRateLimitDiscordNotifier(config, {
  discordFn = discord,
  buildFields,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  updateCorrelation = null,
  runId = null,
  sessionKey = null,
  agentId = null,
  model = null,
  resumeDescription = 'Resuming session.',
} = {}) {
  const buildNotifierFields = (status) => {
    const correlation = typeof updateCorrelation === 'function'
      ? (updateCorrelation(status) || {})
      : {};

    return [
      ...buildFields({
        run_id: resolveRateLimitOption(runId, { status }),
        dispatch_id: resolveStatusDispatchId(status, correlation.dispatch_id ?? resolveRateLimitOption(dispatchIdFallback, { status }) ?? null),
        gateway_label: resolveStatusGatewayLabel(status, correlation.gateway_label ?? resolveRateLimitOption(gatewayLabelFallback, { status }) ?? null),
        session_key: resolveStatusSessionKey(status, resolveRateLimitOption(sessionKey, { status })),
      }),
      ...(resolveRateLimitOption(agentId, { status }) ? [{ name: 'Agent', value: resolveRateLimitOption(agentId, { status }), inline: true }] : []),
      ...(resolveRateLimitOption(model, { status }) ? [{ name: 'Model', value: resolveRateLimitOption(model, { status }), inline: true }] : []),
    ];
  };

  return createSessionRateLimitDiscordNotifier(config, {
    discordFn,
    pauseFields: buildNotifierFields,
    resumeDescription,
    resumeFields: buildNotifierFields,
  });
}

export function createTrackedSummarySessionRateLimitRecoveryOptions(config, {
  sleepFn = sleep,
  discordFn = discord,
  buildFields,
  moduleId = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  updateCorrelation = null,
  agentId = null,
  model = null,
  resumeDescription = 'Resuming session.',
  pauseLogMessage = null,
  resumeLogMessage = null,
  maxPauses = null,
  pauseState = null,
} = {}) {
  const trackedCorrelation = {
    dispatch_id: null,
    gateway_label: null,
  };
  const updateTrackedCorrelation = (status = null) => {
    const externalCorrelation = typeof updateCorrelation === 'function'
      ? (updateCorrelation(status) || {})
      : {};
    trackedCorrelation.dispatch_id = externalCorrelation.dispatch_id
      ?? resolveStatusDispatchId(status, trackedCorrelation.dispatch_id ?? resolveRateLimitOption(dispatchIdFallback, { status }) ?? null);
    trackedCorrelation.gateway_label = externalCorrelation.gateway_label
      ?? resolveStatusGatewayLabel(status, trackedCorrelation.gateway_label ?? trackedCorrelation.dispatch_id ?? resolveRateLimitOption(gatewayLabelFallback, { status }) ?? null);
    return { ...trackedCorrelation };
  };
  const rateLimitDiscord = createSummarySessionRateLimitDiscordNotifier(config, {
    discordFn,
    buildFields,
    dispatchIdFallback,
    gatewayLabelFallback,
    updateCorrelation: updateTrackedCorrelation,
    runId: runIdFallback,
    sessionKey: sessionKeyFallback,
    agentId,
    model,
    resumeDescription,
  });

  return {
    sleepFn,
    ...(maxPauses == null ? {} : { maxPauses }),
    ...(pauseState == null ? {} : { pauseState }),
    getTrackedCorrelation: (status = null) => {
      if (status != null) return updateTrackedCorrelation(status);
      return { ...trackedCorrelation };
    },
    normalizeStatus: (result) => buildTrackedSummarySessionRateLimitStatus(result?.status, {
      moduleId,
      agentTypeFallback,
      runIdFallback: resolveRateLimitOption(runIdFallback, { result }),
      attemptFallback: resolveRateLimitOption(attemptFallback, { result }),
      dispatchIdFallback: resolveRateLimitOption(dispatchIdFallback, { result }),
      gatewayLabelFallback: resolveRateLimitOption(gatewayLabelFallback, { result }),
      sessionKeyFallback: resolveRateLimitOption(sessionKeyFallback, { result }),
      updateCorrelation: updateTrackedCorrelation,
    }),
    ...(pauseLogMessage == null ? {} : { pauseLogMessage }),
    ...(resumeLogMessage == null ? {} : { resumeLogMessage }),
    ...rateLimitDiscord,
  };
}

export function resolveTrackedSessionRateLimitOutcome(result = {}, recoveryOptions = null, {
  attempt = null,
  dispatchId = null,
  gatewayLabel = null,
  lastStatus = null,
} = {}) {
  const status = result?.rate_limit_status || result?.status || null;
  const trackedCorrelation = typeof recoveryOptions?.getTrackedCorrelation === 'function'
    ? (recoveryOptions.getTrackedCorrelation(status) || {})
    : {};
  const resolvedDispatchId = trackedCorrelation.dispatch_id
    ?? resolveStatusDispatchId(status, dispatchId);
  const resolvedGatewayLabel = trackedCorrelation.gateway_label
    ?? resolveStatusGatewayLabel(status, gatewayLabel ?? resolvedDispatchId);

  return {
    attempt: resolveResultAttempt(result, attempt),
    dispatchId: resolvedDispatchId,
    gatewayLabel: resolvedGatewayLabel,
    status: status || lastStatus || null,
  };
}

export function createGateSessionRateLimitDiscordNotifier(config, {
  discordFn = discord,
  gateId = null,
  gateType = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  updateCorrelation = null,
  runId = null,
  sessionKey = null,
  extraFields = [],
  resumeDescription = 'Resuming gate.',
} = {}) {
  const buildNotifierFields = (status) => {
    const correlation = typeof updateCorrelation === 'function'
      ? (updateCorrelation(status) || {})
      : {};
    const extraNotifierFields = typeof extraFields === 'function'
      ? (extraFields(status) || [])
      : extraFields;

    return [
      ...buildSessionRateLimitDiscordFields({
        run_id: status?.run_id || resolveRateLimitOption(runId, { status }),
        ...(gateId == null ? {} : { gate_id: gateId }),
        ...(gateType == null ? {} : { gate_type: gateType }),
        attempt: status?.attempt ?? resolveRateLimitOption(attemptFallback, { status }) ?? null,
        dispatch_id: resolveStatusDispatchId(status, correlation.dispatch_id ?? resolveRateLimitOption(dispatchIdFallback, { status }) ?? null),
        gateway_label: resolveStatusGatewayLabel(status, correlation.gateway_label ?? resolveRateLimitOption(gatewayLabelFallback, { status }) ?? null),
        session_key: resolveStatusSessionKey(status, resolveRateLimitOption(sessionKey, { status })),
      }),
      ...(extraNotifierFields || []),
    ];
  };

  return createSessionRateLimitDiscordNotifier(config, {
    discordFn,
    pauseFields: buildNotifierFields,
    resumeDescription,
    resumeFields: buildNotifierFields,
  });
}

export function createTrackedGateSessionRateLimitRecoveryOptions(config, {
  sleepFn = sleep,
  discordFn = discord,
  gateId = null,
  gateType = null,
  agentTypeFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  gatewayLabelFallback = null,
  sessionKeyFallback = null,
  updateCorrelation = null,
  extraFields = [],
  resumeDescription = 'Resuming gate.',
  pauseLogMessage = null,
  resumeLogMessage = null,
  maxPauses = null,
  pauseState = null,
  exhaustedResultConfig = null,
} = {}) {
  const normalizeTrackedStatus = createTrackedGateSessionRateLimitStatusBuilder({
    gateId,
    gateType,
    agentTypeFallback,
    runIdFallback,
    attemptFallback,
    dispatchIdFallback,
    gatewayLabelFallback,
    sessionKeyFallback,
    updateCorrelation,
  });
  const rateLimitDiscord = createGateSessionRateLimitDiscordNotifier(config, {
    discordFn,
    gateId,
    gateType,
    attemptFallback,
    dispatchIdFallback,
    gatewayLabelFallback,
    updateCorrelation: (status) => normalizeTrackedStatus.getTrackedCorrelation(status),
    runId: runIdFallback,
    sessionKey: sessionKeyFallback,
    extraFields,
    resumeDescription,
  });

  return {
    sleepFn,
    ...(maxPauses == null ? {} : { maxPauses }),
    ...(pauseState == null ? {} : { pauseState }),
    getTrackedCorrelation: (status = null) => {
      return normalizeTrackedStatus.getTrackedCorrelation(status);
    },
    normalizeStatus: (result) => normalizeTrackedStatus(result?.status, { result }),
    ...(pauseLogMessage == null ? {} : { pauseLogMessage }),
    ...(resumeLogMessage == null ? {} : { resumeLogMessage }),
    ...rateLimitDiscord,
    ...(exhaustedResultConfig == null
      ? {}
      : {
          exhaustedResultOptions: createTrackedGateSessionRateLimitExhaustedResultOptions({
            gateId,
            gateType,
            runIdFallback: (ctx) => resolveRateLimitOption(runIdFallback, ctx),
            attemptFallback: (ctx) => resolveRateLimitOption(attemptFallback, ctx),
            dispatchIdFallback: (ctx) => resolveRateLimitOption(dispatchIdFallback, ctx),
            gatewayLabelFallback: (ctx) => resolveRateLimitOption(gatewayLabelFallback, ctx),
            sessionKeyFallback: (ctx) => resolveRateLimitOption(sessionKeyFallback, ctx),
            updateCorrelation: (status) => normalizeTrackedStatus.getTrackedCorrelation(status),
            ...exhaustedResultConfig,
          }),
        }),
  };
}

export function createGateSessionRateLimitExhaustionOptions(config, {
  discordFn = discord,
  gateId = null,
  gateType = null,
  phase = null,
  exhaustedReason = 'rate_limit_exhausted',
  beforeReturn = null,
  gateFailureData = null,
  telemetryCtx = null,
  runId = null,
  discordLevel = 'CRITICAL',
  discordTitle = null,
  discordDescription = null,
  logMessage = exhaustedReason,
  logLevel = 'WARN',
} = {}) {
  return {
    beforeReturn: async (exitResult) => {
      if (typeof beforeReturn === 'function') await beforeReturn(exitResult);
      if (!gateId || !telemetryCtx) return;
      const extraGateFailureData = typeof gateFailureData === 'function'
        ? (gateFailureData(exitResult) || {})
        : (gateFailureData || {});
      await onGateFail(telemetryCtx, gateId, {
        gate_type: gateType,
        attempt: exitResult.attempt,
        reason: exhaustedReason,
        dispatch_id: exitResult.dispatch_id,
        gateway_label: exitResult.gateway_label,
        session_key: exitResult.session_key,
        ...extraGateFailureData,
      });
    },
    emitRetryExhausted: (exitResult) => {
      if (!gateId || !telemetryCtx || !phase) return;
      return emitGateRetryExhausted(telemetryCtx, gateId, {
        gateType,
        phase,
        attempt: exitResult.attempt,
        maxAttempts: exitResult.max_rate_limit_pauses,
        reason: exhaustedReason,
        sessionKey: exitResult.session_key,
        dispatchId: exitResult.dispatch_id,
        gatewayLabel: exitResult.gateway_label,
      });
    },
    sendDiscord: (exitResult) => {
      const title = typeof discordTitle === 'function' ? discordTitle(exitResult) : discordTitle;
      const description = typeof discordDescription === 'function' ? discordDescription(exitResult) : discordDescription;
      if (!config || !title || !description) return null;

      return discordFn(
        config,
        discordLevel,
        title,
        description,
        buildSessionRateLimitDiscordFields({
          run_id: exitResult.run_id || runId || 'unknown',
          ...(gateId == null ? {} : { gate_id: gateId }),
          ...(gateType == null ? {} : { gate_type: gateType }),
          attempt: exitResult.attempt,
          dispatch_id: exitResult.dispatch_id,
          gateway_label: exitResult.gateway_label,
          session_key: exitResult.session_key,
        }),
      );
    },
    logMessage,
    logLevel,
  };
}

export function createSummarySessionRateLimitExhaustionOptions(config, {
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
  return {
    sendDiscord: async (exitResult) => {
      const title = typeof discordTitle === 'function' ? discordTitle(exitResult) : discordTitle;
      const description = typeof discordDescription === 'function' ? discordDescription(exitResult) : discordDescription;
      if (!config || !title || !description) return;

      const extraFields = typeof discordExtraFields === 'function'
        ? (discordExtraFields(exitResult) || [])
        : discordExtraFields;

      await notifyDiscord(
        config,
        discordLevel,
        title,
        description,
        discordFieldBuilder(
          {
            ...discordIdentity,
            ...exitResult,
          },
          extraFields,
        ),
      );
    },
    logMessage,
    logLevel,
  };
}

export function createSessionRateLimitDiscordNotifier(config, options = {}) {
  const discordFn = options.discordFn || discord;

  return {
    sendPauseDiscord: async ({ status, embed }) => {
      const fields = typeof options.pauseFields === 'function'
        ? options.pauseFields(status)
        : (options.pauseFields || []);
      await discordFn(config, 'WARN', embed.title, embed.description, [
        ...fields,
        ...(embed?.fields || []),
      ]).catch(() => {});
    },
    sendResumeDiscord: async ({ status }) => {
      const description = typeof options.resumeDescription === 'function'
        ? options.resumeDescription(status)
        : options.resumeDescription;
      const fields = typeof options.resumeFields === 'function'
        ? options.resumeFields(status)
        : (options.resumeFields || []);
      await discordFn(config, 'INFO', options.resumeTitle || 'Rate limit cooldown complete', description || 'Resuming session.', fields).catch(() => {});
    },
  };
}

export function buildTrackedModuleSessionRateLimitStatus(config, moduleDir, callerStatus = {}, {
  moduleId = null,
  phase = null,
  phaseFallback = null,
  runIdFallback = null,
  attemptFallback = null,
  dispatchIdFallback = null,
  sessionKey = null,
  sessionKeyFallback = null,
  gatewayLabel = null,
  gatewayLabelFallback = null,
} = {}) {
  const persistedStatus = loadStatus(config, moduleDir) || {};
  const currentPhase = phase
    ?? phaseFallback
    ?? callerStatus.current_phase
    ?? callerStatus.phase
    ?? persistedStatus.current_phase
    ?? null;
  const optionCtx = { callerStatus, persistedStatus };
  const resolvedRunIdFallback = resolveRateLimitOption(runIdFallback, optionCtx);
  const resolvedAttemptFallback = resolveRateLimitOption(attemptFallback, optionCtx);
  const resolvedDispatchIdFallback = resolveRateLimitOption(dispatchIdFallback, optionCtx);
  const resolvedSessionKeyFallback = resolveRateLimitOption(sessionKeyFallback ?? sessionKey, optionCtx);
  const resolvedGatewayLabelFallback = resolveRateLimitOption(gatewayLabelFallback ?? gatewayLabel, optionCtx);

  return buildModuleSessionRateLimitStatus(
    {
      ...persistedStatus,
      ...callerStatus,
    },
    {
      moduleId: callerStatus.module_id || persistedStatus.module_id || moduleId || moduleDir,
      phaseFallback: currentPhase,
      agentTypeFallback: currentPhase || persistedStatus.current_phase || null,
      runIdFallback: resolvedRunIdFallback ?? persistedStatus.run_id ?? getRunId(config) ?? config._runId ?? config.run_id ?? null,
      attemptFallback: resolvedAttemptFallback ?? persistedStatus.attempt ?? currentAttemptNumber(persistedStatus),
      dispatchIdFallback: resolvedDispatchIdFallback ?? persistedStatus.dispatch_id ?? persistedStatus.active_agent?.dispatch_id ?? null,
      sessionKeyFallback: resolveStatusSessionKey(persistedStatus, resolvedSessionKeyFallback ?? null),
      gatewayLabelFallback: resolveStatusGatewayLabel(persistedStatus, resolvedGatewayLabelFallback ?? null),
    },
  );
}
