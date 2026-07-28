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
import { arrayValue, firstDefinedValue as firstDefined, objectRecord } from '../../value-boundary.ts';
import { buildRateLimitDiscordCorrelation } from '../rate-limit-correlation.ts';

function requiredText(value: any, label: any) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) throw new Error(`${label} is required`);
  return value;
}

function resolveTrackedModuleId(config: any, moduleDir: any, moduleId: any, callerStatus: any) {
  const modules = config?._progress?.modules;
  if (selectTruthyValue(() => (!modules), () => (typeof modules !== 'object'))) {
    throw new Error('Tracked module rate-limit status requires canonical config._progress.modules');
  }
  if (callerStatus?.module_id) return callerStatus.module_id;
  if (moduleId) return moduleId;
  const matchedEntry = Object.entries(modules).find(([, mod]: any) => mod?.dir === moduleDir);
  if (matchedEntry?.[0]) return matchedEntry[0];
  throw new Error(`Tracked module rate-limit status requires canonical module identity for ${moduleDir}`);
}

function resolveTrackedModulePhase(phase: any, callerStatus: any, persistedStatus: any) {
  return firstDefined(
    phase,
    callerStatus.current_phase,
    callerStatus.phase,
    persistedStatus.current_phase,
  );
}

function resolveTrackedRateLimitAttempt(resolvedIdentity: any, persistedStatus: any) {
  return firstDefined(
    resolvedIdentity.attempt,
    persistedStatus.attempt,
    currentAttemptNumber(persistedStatus),
  );
}

function currentAttemptNumber(status: any) {
  return selectDefinedValue(() => (status?.attempt), () => (null));
}

function resolveModuleProjectionInput(config: any, moduleDir: any, moduleId: any, callerStatus: any = {}) {
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

export function createGateSessionRateLimitExhaustionOptions(config: any, input: any = {}) {
  const options = {
    discordFn: discord,
    gateId: null,
    gateType: null,
    phase: null,
    exhaustedReason: 'rate_limit_exhausted',
    beforeReturn: null,
    gateFailureData: null,
    telemetryCtx: null,
    runId: null,
    discordLevel: 'CRITICAL',
    discordTitle: null,
    discordDescription: null,
    logLevel: 'WARN',
    ...input,
  };
  const logMessage = input.logMessage ?? options.exhaustedReason;
  return {
    beforeReturn: gateRateLimitBeforeReturn(options),
    emitRetryExhausted: gateRetryExhaustedEmitter(options),
    sendDiscord: gateRateLimitDiscordSender(config, options),
    logMessage,
    logLevel: options.logLevel,
  };
}

function gateRateLimitBeforeReturn(options: any) {
  return async (exitResult: any) => {
    try {
      if (typeof options.beforeReturn === 'function') await options.beforeReturn(exitResult);
    } finally {
      await emitGateFailureAfterReturn(options, exitResult);
    }
  };
}

async function emitGateFailureAfterReturn(options: any, exitResult: any): Promise<void> {
  if (!options.gateId || !options.telemetryCtx) return;
  const extra = typeof options.gateFailureData === 'function'
    ? objectRecord(options.gateFailureData(exitResult))
    : objectRecord(options.gateFailureData);
  const discordPresentation = extra?.presentation?.discord;
  const presentation = discordPresentation && typeof discordPresentation === 'object' && !Array.isArray(discordPresentation)
    ? {
      ...extra.presentation,
      discord: { next_action: 'retry_later', action: 'retry_later', ...discordPresentation },
    }
    : extra?.presentation;
  await onGateFail(options.telemetryCtx, options.gateId, {
    gate_type: options.gateType,
    attempt: exitResult.attempt,
    reason: options.exhaustedReason,
    dispatch_id: exitResult.dispatch_id,
    gateway_label: exitResult.gateway_label,
    session_key: exitResult.session_key,
    ...extra,
    ...(presentation == null ? {} : { presentation }),
  });
}

function gateRetryExhaustedEmitter(options: any) {
  return (exitResult: any) => {
    if (!options.gateId || !options.telemetryCtx || !options.phase) return;
    return emitGateRetryExhausted(options.telemetryCtx, options.gateId, {
      gateType: options.gateType,
      phase: options.phase,
      attempt: exitResult.attempt,
      maxAttempts: exitResult.max_rate_limit_pauses,
      reason: options.exhaustedReason,
      sessionKey: exitResult.session_key,
      dispatchId: exitResult.dispatch_id,
      gatewayLabel: exitResult.gateway_label,
    });
  };
}

function gateRateLimitDiscordSender(config: any, options: any) {
  return (exitResult: any) => {
    const title = typeof options.discordTitle === 'function'
      ? options.discordTitle(exitResult)
      : options.discordTitle;
    const description = typeof options.discordDescription === 'function'
      ? options.discordDescription(exitResult)
      : options.discordDescription;
    if (!config || !title || !description) return null;
    const identity = {
      run_id: firstDefined(exitResult.run_id, options.runId),
      ...(options.gateId == null ? {} : { gate_id: options.gateId }),
      ...(options.gateType == null ? {} : { gate_type: options.gateType }),
      attempt: exitResult.attempt,
      dispatch_id: exitResult.dispatch_id,
      gateway_label: exitResult.gateway_label,
      session_key: exitResult.session_key,
    };
    return options.discordFn(
      config,
      options.discordLevel,
      title,
      description,
      buildSessionRateLimitDiscordFields({
        ...identity,
        run_id: requiredText(identity.run_id, 'gate rate-limit run_id'),
      }),
      { correlation: buildRateLimitDiscordCorrelation(identity) },
    );
  };
}

export function createSummarySessionRateLimitExhaustionOptions(config: any, {
  notifyDiscord = discord,
  discordLevel = 'CRITICAL',
  discordTitle = null,
  discordDescription = null,
  discordFieldBuilder = buildSessionRateLimitDiscordFields,
  discordIdentity = {},
  discordExtraFields = [],
  logMessage = null,
  logLevel = 'WARN',
}: any = {}) {
  return {
    sendDiscord: async (exitResult: any) => {
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

export function buildTrackedModuleSessionRateLimitStatus(config: any, moduleDir: any, callerStatus: any = {}, {
  moduleId = null,
  phase = null,
  identity = {},
}: any = {}) {
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
