import { log } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import { discord } from '../../integrations/discord.ts';
import { projectModuleSchedulerState } from '../status-store.ts';
import { onGateFail } from '../telemetry.ts';
import {
  resolveStatusDispatchId,
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from '../correlation.ts';
import {
  buildSessionRateLimitDiscordFields,
  emitGateRetryExhausted,
  resolveRateLimitIdentity,
  buildModuleSessionRateLimitStatus,
} from '../rate-limit-builders.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const RATE_LIMIT_DISCORD_RESUME_TITLE = 'Rate limit cooldown complete';
const RATE_LIMIT_DISCORD_RESUME_DESCRIPTION = 'Resuming session.';

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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

function errorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) return error.message;
  return String(error);
}

function requiredText(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) throw new Error(`${label} is required`);
  return value;
}

function resolveTrackedModuleId(config, moduleDir, moduleId, callerStatus) {
  const modules = config?._progress?.modules;
  if (selectTruthyValue(() => (!modules), () => (typeof modules !== 'object'))) {
    throw new Error('Tracked module rate-limit status requires canonical config._progress.modules');
  }
  if (callerStatus?.module_id) return callerStatus.module_id;
  if (moduleId) return moduleId;
  const matchedEntry = Object.entries(modules).find(([, mod]) => mod?.dir === moduleDir);
  if (matchedEntry?.[0]) return matchedEntry[0];
  throw new Error(`Tracked module rate-limit status requires canonical module identity for ${moduleDir}`);
}

function resolveTrackedModulePhase(phase, callerStatus, persistedStatus) {
  return firstDefined(
    phase,
    callerStatus.current_phase,
    callerStatus.phase,
    persistedStatus.current_phase,
  );
}

function resolveTrackedRateLimitAttempt(resolvedIdentity, persistedStatus) {
  return firstDefined(
    resolvedIdentity.attempt,
    persistedStatus.attempt,
    currentAttemptNumber(persistedStatus),
  );
}

function currentAttemptNumber(status) {
  return selectDefinedValue(() => (status?.attempt), () => (null));
}

function buildRateLimitDiscordCorrelation(status: Record<string, any> = {}): Record<string, any> {
  return {
    run_id: selectTruthyValue(() => (status?.run_id), () => (null)),
    module_id: selectTruthyValue(() => (status?.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (status?.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (status?.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (status?.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (resolveStatusDispatchId(status)), () => (null)),
    gateway_label: selectDefinedValue(() => (resolveStatusGatewayLabel(status)), () => (null)),
    session_key: selectDefinedValue(() => (resolveStatusSessionKey(status)), () => (null)),
  };
}

function resolveModuleProjectionInput(config, moduleDir, moduleId, callerStatus = {}) {
  const modules = config?._progress?.modules;
  if (selectTruthyValue(() => (!modules), () => (typeof modules !== 'object'))) {
    throw new Error('Tracked module rate-limit status requires canonical config._progress.modules');
  }
  const resolvedModuleId = resolveTrackedModuleId(config, moduleDir, moduleId, callerStatus);
  const moduleConfig = modules[resolvedModuleId];
  if (!moduleConfig) {
    throw new Error(`Tracked module rate-limit status requires canonical module config for ${resolvedModuleId}`);
  }
  return {
    moduleId: resolvedModuleId,
    moduleConfig,
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
      try {
        if (typeof beforeReturn === 'function') await beforeReturn(exitResult);
      } finally {
        if (gateId && telemetryCtx) {
          const extraGateFailureData = typeof gateFailureData === 'function'
            ? objectRecord(gateFailureData(exitResult))
            : objectRecord(gateFailureData);
          const discordPresentation = extraGateFailureData?.presentation?.discord;
          const presentation = discordPresentation && typeof discordPresentation === 'object' && !Array.isArray(discordPresentation)
            ? {
              ...extraGateFailureData.presentation,
              discord: {
                next_action: 'retry_later',
                action: 'retry_later',
                ...discordPresentation,
              },
            }
            : extraGateFailureData?.presentation;
          await onGateFail(telemetryCtx, gateId, {
            gate_type: gateType,
            attempt: exitResult.attempt,
            reason: exhaustedReason,
            dispatch_id: exitResult.dispatch_id,
            gateway_label: exitResult.gateway_label,
            session_key: exitResult.session_key,
            ...extraGateFailureData,
            ...(presentation == null ? {} : { presentation }),
          });
        }
      }
    },
    emitRetryExhausted: (exitResult) => {
      if (selectTruthyValue(() => (selectTruthyValue(() => (!gateId), () => (!telemetryCtx))), () => (!phase))) return;
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
      if (selectTruthyValue(() => (selectTruthyValue(() => (!config), () => (!title))), () => (!description))) return null;

      return discordFn(
        config,
        discordLevel,
        title,
        description,
        buildSessionRateLimitDiscordFields({
          run_id: requiredText(firstDefined(exitResult.run_id, runId), 'gate rate-limit run_id'),
          ...(gateId == null ? {} : { gate_id: gateId }),
          ...(gateType == null ? {} : { gate_type: gateType }),
          attempt: exitResult.attempt,
          dispatch_id: exitResult.dispatch_id,
          gateway_label: exitResult.gateway_label,
          session_key: exitResult.session_key,
        }),
        {
          correlation: {
            run_id: firstDefined(exitResult.run_id, runId),
            ...(gateId == null ? {} : { gate_id: gateId }),
            ...(gateType == null ? {} : { gate_type: gateType }),
            attempt: selectDefinedValue(() => (exitResult.attempt), () => (null)),
            dispatch_id: selectTruthyValue(() => (exitResult.dispatch_id), () => (null)),
            gateway_label: selectTruthyValue(() => (exitResult.gateway_label), () => (null)),
            session_key: selectTruthyValue(() => (exitResult.session_key), () => (null)),
          },
        },
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
      if (selectTruthyValue(() => (selectTruthyValue(() => (!config), () => (!title))), () => (!description))) return;

      const extraFields = typeof discordExtraFields === 'function'
        ? arrayValue(discordExtraFields(exitResult))
        : arrayValue(discordExtraFields);

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
        { correlation: buildRateLimitDiscordCorrelation({ ...discordIdentity, ...exitResult }) },
      );
    },
    logMessage,
    logLevel,
  };
}

export function createSessionRateLimitDiscordNotifier(config, options = {}) {
  const discordFn = options.discordFn !== undefined ? options.discordFn : discord;

  return {
    sendPauseDiscord: async ({ status, embed }) => {
      const fields = typeof options.pauseFields === 'function'
        ? arrayValue(options.pauseFields(status))
        : arrayValue(options.pauseFields);
      await discordFn(config, 'WARN', embed.title, embed.description, [
        ...fields,
        ...arrayValue(embed?.fields),
      ], { correlation: buildRateLimitDiscordCorrelation(status) }).catch((e) => {
        log('DEBUG', `Tracked rate-limit pause Discord notice failed: ${errorMessage(e)}`);
      });
    },
    sendResumeDiscord: async ({ status }) => {
      const description = typeof options.resumeDescription === 'function'
        ? options.resumeDescription(status)
        : options.resumeDescription;
      const fields = typeof options.resumeFields === 'function'
        ? arrayValue(options.resumeFields(status))
        : arrayValue(options.resumeFields);
      await discordFn(
        config,
        'INFO',
        selectPresentValue(options.resumeTitle, RATE_LIMIT_DISCORD_RESUME_TITLE),
        selectPresentValue(description, RATE_LIMIT_DISCORD_RESUME_DESCRIPTION),
        fields,
        { correlation: buildRateLimitDiscordCorrelation(status) },
      ).catch((e) => {
        log('DEBUG', `Tracked rate-limit resume Discord notice failed: ${errorMessage(e)}`);
      });
    },
  };
}

export function buildTrackedModuleSessionRateLimitStatus(config, moduleDir, callerStatus = {}, {
  moduleId = null,
  phase = null,
  identity = {},
} = {}) {
  const moduleProjection = resolveModuleProjectionInput(config, moduleDir, moduleId, callerStatus);
  const persistedStatus = objectRecord(projectModuleSchedulerState(config, moduleProjection.moduleId, moduleProjection.moduleConfig));
  const currentPhase = resolveTrackedModulePhase(phase, callerStatus, persistedStatus);
  const optionCtx = { callerStatus, persistedStatus };
  const resolvedIdentity = resolveRateLimitIdentity(identity, optionCtx);

  return buildModuleSessionRateLimitStatus(
    {
      ...persistedStatus,
      ...callerStatus,
    },
    {
      moduleId: selectDefinedValue(() => (callerStatus.module_id), () => (moduleProjection.moduleId)),
      phase: currentPhase,
      identity: {
        agent_type: selectDefinedValue(() => (resolvedIdentity.agent_type), () => (null)),
        run_id: selectDefinedValue(() => (resolvedIdentity.run_id), () => (null)),
        attempt: resolveTrackedRateLimitAttempt(resolvedIdentity, persistedStatus),
        dispatch_id: selectDefinedValue(() => (resolvedIdentity.dispatch_id), () => (null)),
        session_key: resolvedIdentity.session_key,
        gateway_label: resolvedIdentity.gateway_label,
      },
    },
  );
}
