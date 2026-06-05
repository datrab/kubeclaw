import { log } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import { discord } from '../../integrations/discord.ts';
import { loadStatus } from '../status-store.ts';
import { onGateFail } from '../telemetry.ts';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from '../correlation.ts';
import {
  buildSessionRateLimitDiscordFields,
  emitGateRetryExhausted,
  resolveRateLimitIdentity,
  buildModuleSessionRateLimitStatus,
} from '../rate-limit-builders.ts';

function currentAttemptNumber(status) {
  return status?.attempt ?? null;
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
        }
      }
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
      ]).catch((e) => {
        log('DEBUG', `Tracked rate-limit pause Discord notice failed: ${e?.message || e}`);
      });
    },
    sendResumeDiscord: async ({ status }) => {
      const description = typeof options.resumeDescription === 'function'
        ? options.resumeDescription(status)
        : options.resumeDescription;
      const fields = typeof options.resumeFields === 'function'
        ? options.resumeFields(status)
        : (options.resumeFields || []);
      await discordFn(config, 'INFO', options.resumeTitle || 'Rate limit cooldown complete', description || 'Resuming session.', fields).catch((e) => {
        log('DEBUG', `Tracked rate-limit resume Discord notice failed: ${e?.message || e}`);
      });
    },
  };
}

export function buildTrackedModuleSessionRateLimitStatus(config, moduleDir, callerStatus = {}, {
  moduleId = null,
  phase = null,
  identity = {},
} = {}) {
  const persistedStatus = loadStatus(config, moduleDir) || {};
  const currentPhase = phase
    ?? callerStatus.current_phase
    ?? callerStatus.phase
    ?? persistedStatus.current_phase
    ?? null;
  const optionCtx = { callerStatus, persistedStatus };
  const resolvedIdentity = resolveRateLimitIdentity(identity, optionCtx);

  return buildModuleSessionRateLimitStatus(
    {
      ...persistedStatus,
      ...callerStatus,
    },
    {
      moduleId: callerStatus.module_id || persistedStatus.module_id || moduleId || moduleDir,
      phase: currentPhase,
      identity: {
        agent_type: resolvedIdentity.agent_type ?? currentPhase ?? persistedStatus.current_phase ?? null,
        run_id: resolvedIdentity.run_id ?? persistedStatus.run_id ?? getRunId(config) ?? config._runId ?? config.run_id ?? null,
        attempt: resolvedIdentity.attempt ?? persistedStatus.attempt ?? currentAttemptNumber(persistedStatus),
        dispatch_id: resolvedIdentity.dispatch_id ?? persistedStatus.dispatch_id ?? null,
        session_key: (resolveStatusSessionKey(persistedStatus) ?? resolvedIdentity.session_key ?? null),
        gateway_label: (resolveStatusGatewayLabel(persistedStatus) ?? resolvedIdentity.gateway_label ?? null),
      },
    },
  );
}
