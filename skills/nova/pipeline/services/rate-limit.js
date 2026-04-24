// services/rate-limit.js — Rate-limit pause/recovery orchestration surface

import { log } from '../core/logger.js';
import { getRunId } from '../core/runtime.js';
import { loadStatus, saveStatus, appendCooldownLifecycleEvent, getLifecycleCooldown } from './status-store.js';
import { discord } from '../integrations/discord.js';
import { formatRateLimitEmbed } from './failures.js';
import { emitRateLimitDetected, onModuleStatusChanged } from './telemetry.js';
import { transitionModuleStatus } from '../../../common/pipeline/lifecycle-state.js';
import { buildRateLimitDetectedPayload } from '../../../common/pipeline/services/rate-limit-contract.js';
import { sleep } from './polling.js';
import {
  STATUS,
  buildModuleStatusTelemetry,
  buildSessionRateLimitDiscordFields,
  buildTrackedModuleSessionRateLimitStatus,
  createSessionRateLimitDiscordNotifier,
  defaultSessionRateLimitDetail,
  resolveRateLimitOption,
} from './rate-limit-builders.js';
import {
  buildSessionRateLimitExitResult,
} from './rate-limit-exit.js';

export * from './rate-limit-builders.js';
export * from './rate-limit-exit.js';

export function createRateLimitPauseState(initialCount = 0) {
  return { count: initialCount };
}

function defaultSessionRateLimitExhaustedResult(status = {}, pauseCount = 0, maxPauses = 0) {
  return buildSessionRateLimitExitResult(
    {
      status,
      rate_limit_pauses: pauseCount,
      max_rate_limit_pauses: maxPauses,
    },
    'rate_limit_exhausted',
    {
      statusFallback: status,
      maxPausesFallback: maxPauses,
    },
  );
}

function defaultSessionMonitorRateLimitExhaustedResult(status = {}, pauseCount = 0, maxPauses = 0) {
  return buildSessionRateLimitExitResult(
    {
      status,
      rate_limit_pauses: pauseCount,
      max_rate_limit_pauses: maxPauses,
    },
    'rate_limit_exhausted',
    {
      statusFallback: status,
      maxPausesFallback: maxPauses,
      resultOverrides: {
        completed: false,
        hasChanges: false,
        detail: defaultSessionRateLimitDetail(status),
        transcript: status?.transcript || null,
      },
    },
  );
}

export async function handleSessionRateLimit(config, status = {}, options = {}) {
  const pauseCount = options.pauseCount ?? 1;
  const maxPauses = options.maxPauses ?? (config.rate_limit?.max_pauses_per_module ?? 5);
  const cooldownHours = options.cooldownHours ?? (config.rate_limit?.cooldown_hours ?? 2);
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const resumeAt = new Date(Date.now() + cooldownMs);
  const detail = options.getDetail ? options.getDetail(status) : defaultSessionRateLimitDetail(status);
  const ctx = { status, pauseCount, maxPauses, cooldownHours, cooldownMs, resumeAt, detail };
  const hasLifecycleTarget = Boolean(status?.module_id || status?.gate_id);

  if (hasLifecycleTarget) {
    appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_started', {
      moduleId: status?.module_id || null,
      gateId: status?.gate_id || null,
      gateType: status?.gate_type || null,
      attempt: status?.attempt ?? null,
      pauseCount,
      maxPauses,
      cooldownHours,
      resumeAt: resumeAt.toISOString(),
      detail,
      agentType: status?.agent_type || status?.phase || null,
      dispatchId: status?.dispatch_id ?? null,
      gatewayLabel: status?.gateway_label || status?.label || null,
      sessionKey: status?.session_key || null,
      commitHash: status?.commit_hash || null,
    });
  }

  const pauseLogMessage = typeof options.pauseLogMessage === 'function'
    ? options.pauseLogMessage(ctx)
    : options.pauseLogMessage;
  if (pauseLogMessage) log('WARN', pauseLogMessage);

  if (typeof options.emitDetected === 'function') {
    await options.emitDetected(ctx);
  } else {
    emitRateLimitDetected({ config }, buildRateLimitDetectedPayload({
      run_id: getRunId(config) ?? config?._runId ?? config?.run_id ?? null,
      agent_type: status?.agent_type || status?.phase || null,
      module_id: status?.module_id || null,
      gate_id: status?.gate_id || null,
      gate_type: status?.gate_id != null ? (status?.gate_type ?? null) : undefined,
      session_key: status?.session_key || null,
      gateway_label: status?.gateway_label || status?.label || null,
      attempt: status?.attempt ?? null,
      dispatch_id: status?.dispatch_id ?? null,
    }, {
      provider: status?.provider || 'anthropic',
      pauseCount,
      maxPauses,
      cooldownMs,
      resumeAt: resumeAt.toISOString(),
      detail,
    }));
  }

  const embed = formatRateLimitEmbed(config, { detail }, pauseCount, maxPauses, cooldownMs);
  if (typeof options.sendPauseDiscord === 'function') {
    await options.sendPauseDiscord({ ...ctx, embed });
  } else {
    await discord(config, 'WARN', embed.title, embed.description, [
      ...buildSessionRateLimitDiscordFields(status),
      ...embed.fields,
    ]).catch(() => {});
  }

  if (typeof options.onPause === 'function') {
    await options.onPause({ ...ctx, embed });
  }

  const sleepFn = options.sleepFn || sleep;
  await sleepFn(cooldownMs);

  const resumeLogMessage = typeof options.resumeLogMessage === 'function'
    ? options.resumeLogMessage(ctx)
    : options.resumeLogMessage;
  if (resumeLogMessage) log('OK', resumeLogMessage);

  if (hasLifecycleTarget) {
    appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_completed', {
      moduleId: status?.module_id || null,
      gateId: status?.gate_id || null,
      gateType: status?.gate_type || null,
      attempt: status?.attempt ?? null,
      pauseCount,
      maxPauses,
      resumedAt: new Date().toISOString(),
      detail,
    });
  }

  if (typeof options.sendResumeDiscord === 'function') {
    await options.sendResumeDiscord({ ...ctx, embed });
  } else {
    const resumeTarget = status?.gate_id
      ? `gate fix ${status.gate_id}`
      : `session ${status?.module_id || status?.gateway_label || status?.session_key || 'session'}`;
    await discord(config, 'INFO', 'Rate limit cooldown complete', `Resuming ${resumeTarget}`,
      buildSessionRateLimitDiscordFields(status)
    ).catch(() => {});
  }

  if (typeof options.onResume === 'function') {
    await options.onResume({ ...ctx, embed });
  }

  return { ...ctx, embed };
}

export async function processSessionRateLimit(config, status = {}, options = {}) {
  const pauseCount = options.pauseCount ?? 1;
  const maxPauses = options.maxPauses ?? (config.rate_limit?.max_pauses_per_module ?? 5);
  const normalizedStatus = options.normalizeStatus
    ? options.normalizeStatus(status, pauseCount)
    : { ...(status || {}) };

  if (pauseCount > maxPauses) {
    const exhaustedCtx = { status: normalizedStatus, pauseCount, maxPauses };
    const exhaustedLogMessage = typeof options.exhaustedLogMessage === 'function'
      ? options.exhaustedLogMessage(exhaustedCtx)
      : options.exhaustedLogMessage;
    if (exhaustedLogMessage) log('ERROR', exhaustedLogMessage);

    return {
      exhausted: true,
      status: normalizedStatus,
      result: typeof options.buildExhaustedResult === 'function'
        ? options.buildExhaustedResult(exhaustedCtx)
        : defaultSessionMonitorRateLimitExhaustedResult(normalizedStatus, pauseCount, maxPauses),
    };
  }

  const handled = await handleSessionRateLimit(config, normalizedStatus, {
    ...options,
    pauseCount,
    maxPauses,
  });

  return {
    exhausted: false,
    status: normalizedStatus,
    ...handled,
  };
}

/**
 * Generic rate-limit recovery wrapper for any poll function.
 * Handles the retry-after-cooldown loop that is identical for all polling modes.
 *
 * @param {object} config - Pipeline config
 * @param {string} moduleDir - Module directory (for handleRateLimit's saveStatus/loadStatus)
 * @param {function} pollFn - Zero-arg async function that returns a PollResult
 * @returns {PollResult}
 */
export function createTrackedModuleSessionRateLimitRecoveryOptions(config, moduleDir, {
  sleepFn = sleep,
  discordFn = discord,
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
  pauseLogMessage = null,
  resumeLogMessage = null,
  maxPauses = null,
  pauseState = null,
  normalizeStatus: customNormalizeStatus = null,
  onPause: customOnPause = null,
  onResume: customOnResume = null,
  ...options
} = {}) {
  const moduleRecoveryOptions = {
    moduleId,
    phase,
    phaseFallback,
    runIdFallback,
    attemptFallback,
    dispatchIdFallback,
    sessionKey,
    sessionKeyFallback,
    gatewayLabel,
    gatewayLabelFallback,
  };
  const moduleSyncOptions = {
    ...options,
    moduleId,
    phase: phase ?? phaseFallback ?? null,
  };
  const rateLimitDiscord = createSessionRateLimitDiscordNotifier(config, {
    discordFn,
    pauseFields: (status) => buildSessionRateLimitDiscordFields(status),
    resumeDescription: (status) => `Resuming module ${status?.module_id || moduleId || moduleDir}`,
    resumeFields: (status) => buildSessionRateLimitDiscordFields(status),
  });

  return {
    ...rateLimitDiscord,
    ...options,
    sleepFn,
    ...(maxPauses == null ? {} : { maxPauses }),
    ...(pauseState == null ? {} : { pauseState }),
    ...(pauseLogMessage == null ? {} : { pauseLogMessage }),
    ...(resumeLogMessage == null ? {} : { resumeLogMessage }),
    normalizeStatus: (result, pauseCount) => {
      const normalized = buildTrackedModuleSessionRateLimitStatus(config, moduleDir, result?.status || {}, {
        ...moduleRecoveryOptions,
        runIdFallback: resolveRateLimitOption(runIdFallback, { result, pauseCount }),
        attemptFallback: resolveRateLimitOption(attemptFallback, { result, pauseCount }),
        dispatchIdFallback: resolveRateLimitOption(dispatchIdFallback, { result, pauseCount }),
        sessionKeyFallback: resolveRateLimitOption(sessionKeyFallback ?? sessionKey, { result, pauseCount }),
        gatewayLabelFallback: resolveRateLimitOption(gatewayLabelFallback ?? gatewayLabel, { result, pauseCount }),
      });
      if (typeof customNormalizeStatus === 'function') {
        return customNormalizeStatus(normalized, result, pauseCount);
      }
      return normalized;
    },
    onPause: async (ctx) => {
      if (typeof customOnPause === 'function') {
        await customOnPause(ctx);
      }
      await syncModuleRateLimitPause(config, moduleDir, ctx.status, moduleSyncOptions, ctx);
    },
    onResume: async (ctx) => {
      if (typeof customOnResume === 'function') {
        await customOnResume(ctx);
      }
      await syncModuleRateLimitResume(config, moduleDir, ctx.status, moduleSyncOptions);
    },
  };
}

async function syncModuleRateLimitPause(config, moduleDir, status = {}, options = {}, ctx = {}) {
  const preStatus = loadStatus(config, moduleDir);
  if (!preStatus) return;

  const currentPhase = status.current_phase ?? options.phase ?? preStatus.current_phase ?? null;
  const moduleId = status.module_id || preStatus.module_id || options.moduleId || moduleDir;
  const rateLimitedEvent = buildModuleStatusTelemetry(preStatus, {
    old_status: preStatus.status,
    new_status: STATUS.RATE_LIMITED,
    phase: currentPhase,
    reason: `Paused ${ctx.cooldownHours}h (rate limit)`,
  });
  transitionModuleStatus(preStatus, STATUS.RATE_LIMITED, {
    note: `Paused ${ctx.cooldownHours}h (rate limit)`,
    phase: currentPhase,
  });
  saveStatus(config, moduleDir, preStatus);
  onModuleStatusChanged({ config }, moduleId, rateLimitedEvent);
}

async function syncModuleRateLimitResume(config, moduleDir, status = {}, options = {}) {
  const freshStatus = loadStatus(config, moduleDir);
  if (!freshStatus || freshStatus.status !== STATUS.RATE_LIMITED) return;

  const currentPhase = status.current_phase ?? options.phase ?? freshStatus.current_phase ?? null;
  const resumedStatus = currentPhase === 'forge' ? STATUS.IN_PROGRESS : STATUS.TESTING;
  const moduleId = status.module_id || freshStatus.module_id || options.moduleId || moduleDir;
  const resumedEvent = buildModuleStatusTelemetry(freshStatus, {
    old_status: freshStatus.status,
    new_status: resumedStatus,
    phase: currentPhase,
  });
  transitionModuleStatus(freshStatus, resumedStatus, {
    note: 'Resumed after rate limit cooldown',
    phase: currentPhase,
  });
  saveStatus(config, moduleDir, freshStatus);
  onModuleStatusChanged({ config }, moduleId, resumedEvent);
}

export async function resumeDurableCooldownForStep(config, progress, step, {
  sleepFn = sleep,
} = {}) {
  if (!step?.type || !step?.id) return { resumed: false, cooldown: null };

  const cooldown = getLifecycleCooldown(config, {
    stepType: step.type,
    stepId: step.id,
  });

  if (!cooldown?.open || !cooldown?.resume_at) {
    return { resumed: false, cooldown: cooldown || null };
  }

  const remainingMs = Math.max(0, new Date(cooldown.resume_at).getTime() - Date.now());
  if (remainingMs > 0) {
    log('WARN', `[cooldown-resume] ${step.type} ${step.id} is still cooling down for ${Math.ceil(remainingMs / 1000)}s`);
    await sleepFn(remainingMs);
  }

  appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_completed', {
    moduleId: step.type === 'module' ? step.id : null,
    gateId: step.type === 'gate' ? step.id : null,
    gateType: cooldown.gate_type || null,
    attempt: cooldown.attempt ?? null,
    pauseCount: cooldown.pause_count ?? null,
    maxPauses: cooldown.max_pauses ?? null,
    resumedAt: new Date().toISOString(),
    detail: cooldown.detail || 'Resumed after durable cooldown replay',
  });

  if (step.type === 'module') {
    const moduleDir = progress?.modules?.[step.id]?.dir;
    if (moduleDir) {
      await syncModuleRateLimitResume(config, moduleDir, {
        module_id: step.id,
        current_phase: cooldown.agent_type || null,
      }, {
        moduleId: step.id,
        phase: cooldown.agent_type || null,
      });
    }
  }

  log('OK', `[cooldown-resume] ${step.type} ${step.id} cooldown complete, resuming work`);
  return {
    resumed: true,
    cooldown: getLifecycleCooldown(config, {
      stepType: step.type,
      stepId: step.id,
    }),
  };
}

export async function withRateLimitRecovery(config, moduleDir, pollFn, options = {}) {
  return withSessionRateLimitRecovery(config, pollFn, createTrackedModuleSessionRateLimitRecoveryOptions(config, moduleDir, options));
}

export async function withSessionRateLimitRecovery(config, pollFn, options = {}) {
  const pauseState = options.pauseState || null;
  let rateLimitPauses = pauseState?.count ?? 0;
  const maxPauses = options.maxPauses ?? (config.rate_limit?.max_pauses_per_module ?? 5);

  while (true) {
    const result = await pollFn();
    if (result?.reason !== 'rate_limited') return result;

    rateLimitPauses++;
    if (pauseState) pauseState.count = rateLimitPauses;
    const status = options.normalizeStatus
      ? options.normalizeStatus(result, rateLimitPauses)
      : { ...(result?.status || {}) };

    if (rateLimitPauses > maxPauses) {
      const exhaustedCtx = { result, status, pauseCount: rateLimitPauses, maxPauses };
      if (typeof options.buildExhaustedResult === 'function') {
        return options.buildExhaustedResult(exhaustedCtx);
      }
      if (options.exhaustedResultOptions) {
        const exhaustedResultOptions = typeof options.exhaustedResultOptions === 'function'
          ? options.exhaustedResultOptions(exhaustedCtx)
          : options.exhaustedResultOptions;
        const {
          reason = 'rate_limit_exhausted',
          resultOverrides = {},
          ...buildOptions
        } = exhaustedResultOptions || {};
        return buildSessionRateLimitExitResult(
          {
            status,
            rate_limit_pauses: rateLimitPauses,
            max_rate_limit_pauses: maxPauses,
            ...resultOverrides,
          },
          reason,
          {
            maxPausesFallback: maxPauses,
            ...buildOptions,
          },
        );
      }
      return defaultSessionRateLimitExhaustedResult(status, rateLimitPauses, maxPauses);
    }

    await handleSessionRateLimit(config, status, {
      ...options,
      pauseCount: rateLimitPauses,
      maxPauses,
    });
  }
}

export async function handleRateLimit(config, callerStatus, moduleDir, pauseCount = 1, maxPauses = 5) {
  const status = buildTrackedModuleSessionRateLimitStatus(config, moduleDir, callerStatus || {});
  await handleSessionRateLimit(config, status, {
    ...createTrackedModuleSessionRateLimitRecoveryOptions(config, moduleDir),
    pauseCount,
    maxPauses,
  });
}
