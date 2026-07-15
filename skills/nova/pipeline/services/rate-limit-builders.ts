import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

const SESSION_RATE_LIMIT_DETAIL = 'rate limit detected';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function callRateLimitResolver(resolver, status) {
  if (typeof resolver !== 'function') return {};
  return selectDefinedValue(() => (objectRecord(resolver(status))), () => ({}));
}

function resolvedOptionRecord(value, ctx) {
  const resolved = resolveRateLimitOption(value, ctx);
  return selectDefinedValue(() => (objectRecord(resolved)), () => ({}));
}

function statusRecord(value) {
  return selectDefinedValue(() => (objectRecord(value)), () => ({}));
}

function currentAttemptNumber(status) {
  return selectDefinedValue(() => (status?.attempt), () => (null));
}

function resolveCommitHash(status) {
  return selectDefinedValue(() => (status?.commit_hash), () => (null));
}

function moduleIdentityFields(status, moduleId) {
  if (status?.module_id != null) return { module_id: status.module_id };
  if (moduleId != null) return { module_id: moduleId };
  return {};
}

export function buildModuleStatusTelemetry(status, overrides = {}) {
  const dispatchId = overrides.dispatch_id !== undefined
    ? overrides.dispatch_id
    : resolveStatusDispatchId(status);
  const sessionKey = overrides.session_key !== undefined
    ? overrides.session_key
    : resolveStatusSessionKey(status);
  const gatewayLabel = overrides.gateway_label !== undefined
    ? overrides.gateway_label
    : resolveStatusGatewayLabel(status);
  const attempt = overrides.attempt !== undefined ? overrides.attempt : currentAttemptNumber(status);
  const commitHash = overrides.commit_hash !== undefined ? overrides.commit_hash : resolveCommitHash(status);

  return {
    title: selectTruthyValue(() => (status?.title), () => (null)),
    old_status: selectDefinedValue(() => (selectDefinedValue(() => (overrides.old_status), () => (status?.status))), () => (null)),
    new_status: selectDefinedValue(() => (overrides.new_status), () => (null)),
    attempt,
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    session_key: sessionKey,
    phase: selectDefinedValue(() => (selectDefinedValue(() => (overrides.phase), () => (status?.current_phase))), () => (null)),
    model: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (overrides.model), () => (status?.active_agent?.model))), () => (status?.model))), () => (null)),
    duration_seconds: selectDefinedValue(() => (overrides.duration_seconds), () => (null)),
    cost_estimate_usd: selectDefinedValue(() => (overrides.cost_estimate_usd), () => (null)),
    commit_hash: commitHash,
    reason: selectDefinedValue(() => (overrides.reason), () => (null)),
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
    gate_type: selectTruthyValue(() => (gateType), () => (null)),
    attempt: selectDefinedValue(() => (attempt), () => (null)),
    phase,
    dispatch_id: selectTruthyValue(() => (dispatchId), () => (null)),
    gateway_label: selectTruthyValue(() => (gatewayLabel), () => (null)),
    session_key: selectTruthyValue(() => (sessionKey), () => (null)),
    reason: selectTruthyValue(() => (reason), () => (null)),
    max_attempts: selectDefinedValue(() => (maxAttempts), () => (null)),
    max_fails: selectDefinedValue(() => (maxAttempts), () => (null)),
  });
}

export function defaultSessionRateLimitDetail(status = {}) {
  return selectPresentValue(status?.detail, status?.reason, status?.summary, SESSION_RATE_LIMIT_DETAIL);
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
  return selectTruthyValue(() => (result?.rate_limit_status), () => (null));
}

export function resolveSessionRateLimitMaxPauses(result = {}, maxPauses = null) {
  if (result?.max_rate_limit_pauses !== undefined) return result.max_rate_limit_pauses;
  if (result?.rate_limit_status?.max_rate_limit_pauses !== undefined) return result.rate_limit_status.max_rate_limit_pauses;
  return selectDefinedValue(() => (maxPauses), () => (null));
}

export function resolveSessionRateLimitRunId(result = {}, runId = null) {
  if (result?.run_id !== undefined) return result.run_id;
  if (result?.rate_limit_status?.run_id !== undefined) return result.rate_limit_status.run_id;
  return selectDefinedValue(() => (runId), () => (null));
}

export function resolveRateLimitOption(value, ctx) {
  if (typeof value === 'function') {
    throw new TypeError('rate-limit options must be resolved typed values, not callbacks');
  }
  return value;
}

export function resolveRateLimitIdentity(identity = {}, ctx = {}) {
  const resolved = resolvedOptionRecord(identity, ctx);
  return {
    agent_type: selectDefinedValue(() => (resolveRateLimitOption(resolved.agent_type, ctx)), () => (null)),
    run_id: selectDefinedValue(() => (resolveRateLimitOption(resolved.run_id, ctx)), () => (null)),
    attempt: selectDefinedValue(() => (resolveRateLimitOption(resolved.attempt, ctx)), () => (null)),
    dispatch_id: selectDefinedValue(() => (resolveRateLimitOption(resolved.dispatch_id, ctx)), () => (null)),
    gateway_label: selectDefinedValue(() => (resolveRateLimitOption(resolved.gateway_label, ctx)), () => (null)),
    session_key: selectDefinedValue(() => (resolveRateLimitOption(resolved.session_key, ctx)), () => (null)),
  };
}

export function buildGateSessionRateLimitStatus(status = {}, {
  gateId = null,
  gateType = null,
  identity = {},
} = {}) {
  const resolvedGateId = selectDefinedValue(() => (selectDefinedValue(() => (gateId), () => (status?.gate_id))), () => (null));
  const resolvedGateType = selectDefinedValue(() => (gateType), () => (null));
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  const resolvedAgentType = selectDefinedValue(() => (status?.agent_type), () => (null));

  return {
    ...statusRecord(status),
    status: STATUS.RATE_LIMITED,
    ...(resolvedGateId == null ? {} : { gate_id: resolvedGateId }),
    ...(resolvedGateType == null ? {} : { gate_type: resolvedGateType }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: selectDefinedValue(() => (selectDefinedValue(() => (status?.run_id), () => (resolvedIdentity.run_id))), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (status?.attempt), () => (resolvedIdentity.attempt))), () => (null)),
    dispatch_id: resolvedIdentity.dispatch_id,
    gateway_label: resolvedIdentity.gateway_label,
    session_key: resolvedIdentity.session_key,
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
    const externalCorrelation = callRateLimitResolver(updateCorrelation, status);
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);

    trackedCorrelation.dispatch_id = selectDefinedValue(() => (externalCorrelation.dispatch_id), () => (null));
    trackedCorrelation.gateway_label = selectDefinedValue(() => (externalCorrelation.gateway_label), () => (null));

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
        dispatch_id: selectDefinedValue(() => (correlation.dispatch_id), () => (null)),
        gateway_label: selectDefinedValue(() => (correlation.gateway_label), () => (null)),
        session_key: resolvedIdentity.session_key,
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
  return ({ result = {}, status = statusRecord(result?.status), maxPauses } = {}) => {
    const ctx = { result, status, maxPauses };
    const correlation = callRateLimitResolver(updateCorrelation, status);
    const resolvedStatusOverrides = resolvedOptionRecord(statusOverrides, ctx);
    const resolvedResultOverrides = resolvedOptionRecord(resultOverrides, ctx);
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);
    const resolvedExit = resolveRateLimitOption(exit, ctx);
    const gateIdentity = {
      ...(gateId == null ? {} : { gate_id: gateId }),
      ...(gateType == null ? {} : { gate_type: gateType }),
    };

    return {
      identity: {
        ...resolvedIdentity,
        dispatch_id: selectDefinedValue(() => (correlation.dispatch_id), () => (null)),
        gateway_label: selectDefinedValue(() => (correlation.gateway_label), () => (null)),
        session_key: resolvedIdentity.session_key,
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

export function createTrackedModuleSessionRateLimitExhaustedResultOptions({
  moduleId = null,
  moduleDir = null,
  phase = null,
  identity = {},
  statusOverrides = {},
  resultOverrides = {},
  exit = null,
} = {}) {
  return ({ result = {}, status = statusRecord(result?.status), maxPauses } = {}) => {
    const ctx = { result, status, maxPauses };
    const resolvedStatusOverrides = resolvedOptionRecord(statusOverrides, ctx);
    const resolvedResultOverrides = resolvedOptionRecord(resultOverrides, ctx);
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);
    const resolvedExit = resolveRateLimitOption(exit, ctx);
    const moduleIdentity = {
      ...(moduleId == null ? {} : { module_id: moduleId }),
      ...(moduleDir == null ? {} : { module_dir: moduleDir }),
      ...(phase == null ? {} : { phase, current_phase: phase }),
    };

    return {
      identity: {
        ...resolvedIdentity,
        session_key: resolvedIdentity.session_key,
      },
      maxPauses,
      statusOverrides: {
        ...moduleIdentity,
        ...resolvedStatusOverrides,
      },
      ...(resolvedExit == null ? {} : { exit: resolvedExit }),
      resultOverrides: {
        ...moduleIdentity,
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
  const currentPhase = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (status?.current_phase), () => (status?.phase))), () => (phase))), () => (null));
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  const resolvedAgentType = selectDefinedValue(() => (status?.agent_type), () => (null));

  return {
    ...statusRecord(status),
    status: STATUS.RATE_LIMITED,
    ...moduleIdentityFields(status, moduleId),
    ...(currentPhase == null ? {} : { current_phase: currentPhase, phase: currentPhase }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: selectDefinedValue(() => (selectDefinedValue(() => (status?.run_id), () => (resolvedIdentity.run_id))), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (status?.attempt), () => (resolvedIdentity.attempt))), () => (null)),
    dispatch_id: resolvedIdentity.dispatch_id,
    gateway_label: resolvedIdentity.gateway_label,
    session_key: resolvedIdentity.session_key,
    model: selectDefinedValue(() => (selectDefinedValue(() => (status?.model), () => (status?.active_agent?.model))), () => (null)),
  };
}

export function buildSummarySessionRateLimitStatus(status = {}, {
  moduleId = null,
  identity = {},
} = {}) {
  const resolvedModuleId = selectDefinedValue(() => (selectDefinedValue(() => (status?.module_id), () => (moduleId))), () => (null));
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  const resolvedAgentType = selectDefinedValue(() => (status?.agent_type), () => (null));

  return {
    ...statusRecord(status),
    status: STATUS.RATE_LIMITED,
    ...(resolvedModuleId == null ? {} : { module_id: resolvedModuleId }),
    ...(resolvedAgentType == null ? {} : { agent_type: resolvedAgentType }),
    run_id: selectDefinedValue(() => (selectDefinedValue(() => (status?.run_id), () => (resolvedIdentity.run_id))), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (status?.attempt), () => (resolvedIdentity.attempt))), () => (null)),
    dispatch_id: resolvedIdentity.dispatch_id,
    gateway_label: resolvedIdentity.gateway_label,
    session_key: resolvedIdentity.session_key,
  };
}

export function buildTrackedSummarySessionRateLimitStatus(status = {}, {
  moduleId = null,
  identity = {},
  updateCorrelation = null,
} = {}) {
  const correlation = callRateLimitResolver(updateCorrelation, status);
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });

  return buildSummarySessionRateLimitStatus(status, {
    moduleId,
    identity: {
      ...resolvedIdentity,
      dispatch_id: selectDefinedValue(() => (correlation.dispatch_id), () => (null)),
      gateway_label: selectDefinedValue(() => (correlation.gateway_label), () => (null)),
      session_key: resolvedIdentity.session_key,
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
    const correlation = callRateLimitResolver(updateCorrelation, status);
    const resolvedIdentity = resolveRateLimitIdentity(identity, { status });

    return [
      ...buildFields({
        run_id: resolvedIdentity.run_id,
        dispatch_id: selectDefinedValue(() => (correlation.dispatch_id), () => (resolvedIdentity.dispatch_id)),
        gateway_label: selectDefinedValue(() => (correlation.gateway_label), () => (resolvedIdentity.gateway_label)),
        session_key: resolvedIdentity.session_key,
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
    const externalCorrelation = callRateLimitResolver(updateCorrelation, status);
    const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
    trackedCorrelation.dispatch_id = selectDefinedValue(() => (externalCorrelation.dispatch_id), () => (null));
    trackedCorrelation.gateway_label = selectDefinedValue(() => (externalCorrelation.gateway_label), () => (null));
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
  const status = selectTruthyValue(() => (selectTruthyValue(() => (result?.rate_limit_status), () => (result?.status))), () => (null));
  const trackedCorrelation = callRateLimitResolver(recoveryOptions?.getTrackedCorrelation, status);
  const resolvedDispatchId = selectDefinedValue(() => (trackedCorrelation.dispatch_id), () => ((selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(status)), () => (dispatchId))), () => (null)))));
  const resolvedGatewayLabel = selectDefinedValue(() => (trackedCorrelation.gateway_label), () => ((selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(status)), () => (gatewayLabel))), () => (null)))));

  return {
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (resolveResultAttempt(result)), () => (attempt))), () => (null)),
    dispatchId: resolvedDispatchId,
    gatewayLabel: resolvedGatewayLabel,
    status: selectTruthyValue(() => (selectTruthyValue(() => (status), () => (lastStatus))), () => (null)),
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
    const correlation = callRateLimitResolver(updateCorrelation, status);
    const extraNotifierFields = typeof extraFields === 'function'
      ? arrayValue(extraFields(status))
      : arrayValue(extraFields);
    const resolvedIdentity = resolveRateLimitIdentity(identity, { status });

    return [
      ...buildSessionRateLimitDiscordFields({
        run_id: selectDefinedValue(() => (status?.run_id), () => (resolvedIdentity.run_id)),
        ...(gateId == null ? {} : { gate_id: gateId }),
        ...(gateType == null ? {} : { gate_type: gateType }),
        attempt: selectDefinedValue(() => (selectDefinedValue(() => (status?.attempt), () => (resolvedIdentity.attempt))), () => (null)),
        dispatch_id: selectDefinedValue(() => (correlation.dispatch_id), () => (resolvedIdentity.dispatch_id)),
        gateway_label: selectDefinedValue(() => (correlation.gateway_label), () => (resolvedIdentity.gateway_label)),
        session_key: resolvedIdentity.session_key,
      }),
      ...extraNotifierFields,
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
