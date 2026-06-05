// services/rate-limit-builders.js — Rate-limit status builders, notifier factories, and exhaustion option scaffolding

import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { loadStatus, saveStatus, appendCooldownLifecycleEvent, getLifecycleCooldown } from './status-store.ts';
import { discord } from '../integrations/discord.ts';
import { formatRateLimitEmbed } from './failures/presentation.ts';
import { emitRateLimitDetected, onGateFail, onModuleStatusChanged, onRetryExhausted, onSummaryCompleted } from './telemetry.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { buildSessionRateLimitDiscordFields as buildSharedSessionRateLimitDiscordFields } from './discord-fields.ts';
import { buildRateLimitDetectedPayload } from './rate-limit-contract.ts';
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveStatusDispatchId,
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from './correlation.ts';

// Imported from polling.ts — circular import is safe because these are function
// references only used inside function bodies, never at module initialisation.
import { sleep } from './polling.ts';
import {
  buildTrackedModuleSessionRateLimitStatus,
  createGateSessionRateLimitExhaustionOptions,
  createSessionRateLimitDiscordNotifier,
  createSummarySessionRateLimitExhaustionOptions,
} from './rate-limit-builders/exhaustion-options.ts';
export {
  buildTrackedModuleSessionRateLimitStatus,
  createGateSessionRateLimitExhaustionOptions,
  createSessionRateLimitDiscordNotifier,
  createSummarySessionRateLimitExhaustionOptions,
} from './rate-limit-builders/exhaustion-options.ts';

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
  return status?.attempt ?? null;
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
    ?? resolveStatusDispatchId(status);
  const sessionKey = overrides.session_key
    ?? resolveStatusSessionKey(status);
  const gatewayLabel = overrides.gateway_label
    ?? resolveStatusGatewayLabel(status);

  return {
    title: status?.title || null,
    old_status: overrides.old_status ?? status?.status ?? null,
    new_status: overrides.new_status ?? null,
    attempt: overrides.attempt ?? currentAttemptNumber(status),
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    session_key: sessionKey,
    phase: overrides.phase ?? status?.current_phase ?? null,
    model: overrides.model ?? status?.active_agent?.model ?? status?.model ?? null,
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
  return onRetryExhausted(telemetryCtx, gateId, {
    gate_id: gateId,
    gate_type: gateType || null,
    attempt: attempt ?? null,
    phase,
    dispatch_id: dispatchId || null,
    gateway_label: gatewayLabel || null,
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

export function resolveSessionRateLimitExhaustedStatus(result = {}) {
  return result?.rate_limit_status || null;
}

export function resolveSessionRateLimitMaxPauses(result = {}, maxPauses = null) {
  return result?.max_rate_limit_pauses
    ?? result?.rate_limit_status?.max_rate_limit_pauses
    ?? maxPauses
    ?? null;
}

export function resolveSessionRateLimitRunId(result = {}, runId = null) {
  return result?.run_id
    ?? result?.rate_limit_status?.run_id
    ?? runId
    ?? null;
}

export function resolveRateLimitOption(value, ctx) {
  if (typeof value === 'function') {
    throw new TypeError('rate-limit options must be resolved typed values, not callbacks');
  }
  return value;
}

export function resolveRateLimitIdentity(identity = {}, ctx = {}) {
  const resolved = resolveRateLimitOption(identity, ctx) || {};
  return {
    agent_type: resolveRateLimitOption(resolved.agent_type, ctx) ?? null,
    run_id: resolveRateLimitOption(resolved.run_id, ctx) ?? null,
    attempt: resolveRateLimitOption(resolved.attempt, ctx) ?? null,
    dispatch_id: resolveRateLimitOption(resolved.dispatch_id, ctx) ?? null,
    gateway_label: resolveRateLimitOption(resolved.gateway_label, ctx) ?? null,
    session_key: resolveRateLimitOption(resolved.session_key, ctx) ?? null,
  };
}

export function buildGateSessionRateLimitStatus(status = {}, {
  gateId = null,
  gateType = null,
  identity = {},
} = {}) {
  const resolvedGateId = gateId ?? status?.gate_id ?? status?.gate ?? null;
  const resolvedGateType = gateType ?? status?.gate_type ?? null;
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  const resolvedAgentType = status?.agent_type ?? resolvedIdentity.agent_type ?? resolvedGateType ?? null;

  return {
    ...(status || {}),
    status: STATUS.RATE_LIMITED,
    ...(resolvedGateId == null ? {} : { gate: resolvedGateId, gate_id: resolvedGateId }),
    ...(resolvedGateType == null ? {} : { gate_type: resolvedGateType }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: status?.run_id ?? resolvedIdentity.run_id ?? null,
    attempt: status?.attempt ?? resolvedIdentity.attempt ?? null,
    dispatch_id: (resolveStatusDispatchId(status) ?? resolvedIdentity.dispatch_id ?? null),
    gateway_label: (resolveStatusGatewayLabel(status) ?? resolvedIdentity.gateway_label ?? null),
    session_key: (resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
  };
}

export function buildTrackedGateSessionRateLimitStatus(status = {}, {
  gateId = null,
  gateType = null,
  identity = {},
  updateCorrelation = null,
} = {}) {
  return createTrackedGateSessionRateLimitStatusBuilder({
    gateId,
    gateType,
    identity,
    updateCorrelation,
  })(status, { status });
}

export function createTrackedGateSessionRateLimitStatusBuilder({
  gateId = null,
  gateType = null,
  identity = {},
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
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);

    trackedCorrelation.dispatch_id = externalCorrelation.dispatch_id
      ?? (resolveStatusDispatchId(status) ?? trackedCorrelation.dispatch_id ?? resolvedIdentity.dispatch_id ?? null);
    trackedCorrelation.gateway_label = externalCorrelation.gateway_label
      ?? (resolveStatusGatewayLabel(status) ?? trackedCorrelation.gateway_label ?? resolvedIdentity.gateway_label ?? null);

    return { ...trackedCorrelation };
  };

  const normalizeStatus = (status = {}, ctx = { status }) => {
    const correlation = updateTrackedCorrelation(status, ctx);
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);

    return buildGateSessionRateLimitStatus(status, {
      gateId,
      gateType,
      identity: {
        ...resolvedIdentity,
        dispatch_id: correlation.dispatch_id ?? null,
        gateway_label: correlation.gateway_label ?? null,
        session_key: (resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
      },
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
  identity = {},
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
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);
    const resolvedExit = resolveRateLimitOption(exit, ctx);
    const gateIdentity = {
      ...(gateId == null ? {} : { gate: gateId, gate_id: gateId }),
      ...(gateType == null ? {} : { gate_type: gateType }),
    };

    return {
      identity: {
        ...resolvedIdentity,
        dispatch_id: correlation.dispatch_id ?? resolvedIdentity.dispatch_id ?? null,
        gateway_label: correlation.gateway_label ?? resolvedIdentity.gateway_label ?? null,
        session_key: (resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
      },
      maxPauses,
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
  phase = null,
  identity = {},
} = {}) {
  const currentPhase = status?.current_phase ?? status?.phase ?? phase ?? null;
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  const resolvedAgentType = status?.agent_type ?? resolvedIdentity.agent_type ?? currentPhase ?? null;

  return {
    ...(status || {}),
    status: STATUS.RATE_LIMITED,
    ...(status?.module_id != null || moduleId != null ? { module_id: status?.module_id ?? moduleId } : {}),
    ...(currentPhase == null ? {} : { current_phase: currentPhase, phase: currentPhase }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: status?.run_id ?? resolvedIdentity.run_id ?? null,
    attempt: status?.attempt ?? resolvedIdentity.attempt ?? null,
    dispatch_id: (status?.active_agent?.dispatch_id ?? resolveStatusDispatchId(status) ?? resolvedIdentity.dispatch_id ?? null),
    gateway_label: (status?.active_agent?.gateway_label ?? resolveStatusGatewayLabel(status) ?? resolvedIdentity.gateway_label ?? null),
    session_key: (status?.active_agent?.session_key ?? resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
    model: status?.model ?? status?.active_agent?.model ?? null,
  };
}

export function buildSummarySessionRateLimitStatus(status = {}, {
  moduleId = null,
  identity = {},
} = {}) {
  const resolvedModuleId = status?.module_id ?? moduleId ?? null;
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  const resolvedAgentType = status?.agent_type ?? resolvedIdentity.agent_type ?? null;

  return {
    ...(status || {}),
    status: STATUS.RATE_LIMITED,
    ...(resolvedModuleId == null ? {} : { module_id: resolvedModuleId }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: status?.run_id ?? resolvedIdentity.run_id ?? null,
    attempt: status?.attempt ?? resolvedIdentity.attempt ?? null,
    dispatch_id: (resolveStatusDispatchId(status) ?? resolvedIdentity.dispatch_id ?? null),
    gateway_label: (resolveStatusGatewayLabel(status) ?? resolvedIdentity.gateway_label ?? null),
    session_key: (resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
  };
}

export function buildTrackedSummarySessionRateLimitStatus(status = {}, {
  moduleId = null,
  identity = {},
  updateCorrelation = null,
} = {}) {
  const correlation = typeof updateCorrelation === 'function'
    ? (updateCorrelation(status) || {})
    : {};
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });

  return buildSummarySessionRateLimitStatus(status, {
    moduleId,
    identity: {
      ...resolvedIdentity,
      dispatch_id: correlation.dispatch_id ?? resolvedIdentity.dispatch_id ?? null,
      gateway_label: correlation.gateway_label ?? resolvedIdentity.gateway_label ?? null,
      session_key: (resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
    },
  });
}

export function createSummarySessionRateLimitDiscordNotifier(config, {
  discordFn = discord,
  buildFields,
  identity = {},
  updateCorrelation = null,
  agentId = null,
  model = null,
  resumeDescription = 'Resuming session.',
} = {}) {
  const buildNotifierFields = (status) => {
    const correlation = typeof updateCorrelation === 'function'
      ? (updateCorrelation(status) || {})
      : {};
    const resolvedIdentity = resolveRateLimitIdentity(identity, { status });

    return [
      ...buildFields({
        run_id: resolvedIdentity.run_id,
        dispatch_id: (resolveStatusDispatchId(status) ?? correlation.dispatch_id ?? resolvedIdentity.dispatch_id ?? null),
        gateway_label: (resolveStatusGatewayLabel(status) ?? correlation.gateway_label ?? resolvedIdentity.gateway_label ?? null),
        session_key: (resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
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
  identity = {},
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
    const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
    trackedCorrelation.dispatch_id = externalCorrelation.dispatch_id
      ?? (resolveStatusDispatchId(status) ?? trackedCorrelation.dispatch_id ?? resolvedIdentity.dispatch_id ?? null);
    trackedCorrelation.gateway_label = externalCorrelation.gateway_label
      ?? (resolveStatusGatewayLabel(status) ?? trackedCorrelation.gateway_label ?? resolvedIdentity.gateway_label ?? null);
    return { ...trackedCorrelation };
  };
  const rateLimitDiscord = createSummarySessionRateLimitDiscordNotifier(config, {
    discordFn,
    buildFields,
    identity,
    updateCorrelation: updateTrackedCorrelation,
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
      identity: resolveRateLimitIdentity(identity, { result }),
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
    ?? (resolveStatusDispatchId(status) ?? dispatchId ?? null);
  const resolvedGatewayLabel = trackedCorrelation.gateway_label
    ?? (resolveStatusGatewayLabel(status) ?? gatewayLabel ?? null);

  return {
    attempt: resolveResultAttempt(result) ?? attempt ?? null,
    dispatchId: resolvedDispatchId,
    gatewayLabel: resolvedGatewayLabel,
    status: status || lastStatus || null,
  };
}

export function createGateSessionRateLimitDiscordNotifier(config, {
  discordFn = discord,
  gateId = null,
  gateType = null,
  identity = {},
  updateCorrelation = null,
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
    const resolvedIdentity = resolveRateLimitIdentity(identity, { status });

    return [
      ...buildSessionRateLimitDiscordFields({
        run_id: status?.run_id || resolvedIdentity.run_id,
        ...(gateId == null ? {} : { gate_id: gateId }),
        ...(gateType == null ? {} : { gate_type: gateType }),
        attempt: status?.attempt ?? resolvedIdentity.attempt ?? null,
        dispatch_id: (resolveStatusDispatchId(status) ?? correlation.dispatch_id ?? resolvedIdentity.dispatch_id ?? null),
        gateway_label: (resolveStatusGatewayLabel(status) ?? correlation.gateway_label ?? resolvedIdentity.gateway_label ?? null),
        session_key: (resolveStatusSessionKey(status) ?? resolvedIdentity.session_key ?? null),
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
  identity = {},
  updateCorrelation = null,
  extraFields = [],
  resumeDescription = 'Resuming gate.',
  pauseLogMessage = null,
  resumeLogMessage = null,
  maxPauses = null,
  pauseState = null,
  suppressPausePresentation = null,
  exhaustedResultConfig = null,
} = {}) {
  const normalizeTrackedStatus = createTrackedGateSessionRateLimitStatusBuilder({
    gateId,
    gateType,
    identity,
    updateCorrelation,
  });
  const rateLimitDiscord = createGateSessionRateLimitDiscordNotifier(config, {
    discordFn,
    gateId,
    gateType,
    identity,
    updateCorrelation: (status) => normalizeTrackedStatus.getTrackedCorrelation(status),
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
    ...(suppressPausePresentation == null ? {} : { suppressPausePresentation }),
    ...rateLimitDiscord,
    ...(exhaustedResultConfig == null
      ? {}
      : {
          exhaustedResultOptions: createTrackedGateSessionRateLimitExhaustedResultOptions({
            gateId,
            gateType,
            identity,
            updateCorrelation: (status) => normalizeTrackedStatus.getTrackedCorrelation(status),
            ...exhaustedResultConfig,
          }),
        }),
  };
}
