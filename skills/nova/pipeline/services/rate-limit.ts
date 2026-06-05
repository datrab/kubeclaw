import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { loadStatus, saveStatus, appendCooldownLifecycleEvent, getLifecycleCooldown } from './status-store.ts';
import { discord } from '../integrations/discord.ts';
import { formatRateLimitEmbed } from './failures/presentation.ts';
import { emitRateLimitDetected, onModuleStatusChanged } from './telemetry.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { buildRateLimitDetectedPayload } from './rate-limit-contract.ts';
import { sleep } from '../timing.ts';
import {
  STATUS,
  buildModuleStatusTelemetry,
  buildSessionRateLimitDiscordFields,
  buildTrackedModuleSessionRateLimitStatus,
  createSessionRateLimitDiscordNotifier,
  defaultSessionRateLimitDetail,
  resolveRateLimitIdentity,
} from './rate-limit-builders.ts';
import {
  appendInvalidRateLimitCooldownResumeAtAlert,
  buildSessionRateLimitExitResult,
  finalizeSessionRateLimitExhaustion,
} from './rate-limit-exit.ts';

export * from './rate-limit-builders.ts';
export * from './rate-limit-exit.ts';

export function createRateLimitPauseState(initialCount = 0) {
  return { count: initialCount };
}

function defaultSessionRateLimitExhaustedResult(status = {}, pauseCount = 0, maxPauses = 0) {
  return buildSessionRateLimitExitResult(
    {
      status,
      rate_limit_status: status,
      rate_limit_pauses: pauseCount,
      max_rate_limit_pauses: maxPauses,
    },
    'rate_limit_exhausted',
    {
      identity: {
        run_id: status?.run_id ?? null,
        attempt: status?.attempt ?? null,
        dispatch_id: status?.dispatch_id ?? null,
        gateway_label: status?.gateway_label ?? null,
        session_key: status?.session_key ?? null,
      },
      maxPauses,
    },
  );
}

function defaultSessionMonitorRateLimitExhaustedResult(status = {}, pauseCount = 0, maxPauses = 0) {
  return buildSessionRateLimitExitResult(
    {
      status,
      rate_limit_status: status,
      rate_limit_pauses: pauseCount,
      max_rate_limit_pauses: maxPauses,
    },
    'rate_limit_exhausted',
    {
      identity: {
        run_id: status?.run_id ?? null,
        attempt: status?.attempt ?? null,
        dispatch_id: status?.dispatch_id ?? null,
        gateway_label: status?.gateway_label ?? null,
        session_key: status?.session_key ?? null,
      },
      maxPauses,
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
  const maxPauses = options.maxPauses ?? (config.rate_limit.max_pauses_per_module);
  const cooldownHours = options.cooldownHours ?? (config.rate_limit.cooldown_hours);
  const cooldownMs = Math.ceil(cooldownHours * 60 * 60 * 1000);
  const cooldownBufferMs = options.cooldownBufferMs ?? config.rate_limit.cooldown_buffer_ms;
  const resumeAt = new Date(Date.now() + cooldownMs);
  const detail = options.getDetail ? options.getDetail(status) : defaultSessionRateLimitDetail(status);
  const ctx = { status, pauseCount, maxPauses, cooldownHours, cooldownMs, resumeAt, detail };
  const hasLifecycleTarget = Boolean(status?.module_id || status?.gate_id);
  const suppressPausePresentation = typeof options.suppressPausePresentation === 'function'
    ? options.suppressPausePresentation(ctx)
    : options.suppressPausePresentation === true;

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
      gatewayLabel: status?.gateway_label ?? null,
      sessionKey: status?.session_key || null,
      commitHash: status?.commit_hash || null,
    });
  }

  const pauseLogMessage = typeof options.pauseLogMessage === 'function'
    ? options.pauseLogMessage(ctx)
    : options.pauseLogMessage;
  if (pauseLogMessage) log('WARN', pauseLogMessage);

  if (!suppressPausePresentation) {
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
        gateway_label: status?.gateway_label ?? null,
        attempt: status?.attempt ?? null,
        dispatch_id: status?.dispatch_id ?? null,
      }, {
        provider: status?.provider,
        allowAnthropicDefault: true,
        pauseCount,
        maxPauses,
        cooldownMs,
        resumeAt: resumeAt.toISOString(),
        detail,
      }));
    }
  }

  const embed = formatRateLimitEmbed(config, { detail }, pauseCount, maxPauses, cooldownMs);
  if (!suppressPausePresentation) {
    if (typeof options.sendPauseDiscord === 'function') {
      await options.sendPauseDiscord({ ...ctx, embed });
    } else {
      await discord(config, 'WARN', embed.title, embed.description, [
        ...buildSessionRateLimitDiscordFields(status),
        ...embed.fields,
      ]).catch((e) => {
        log('DEBUG', `Rate-limit pause Discord notice failed: ${e?.message || e}`);
      });
    }
  }

  if (typeof options.onPause === 'function') {
    await options.onPause({ ...ctx, embed });
  }

  if (options.budget?.extendForRateLimit) {
    options.budget.extendForRateLimit(cooldownMs, {
      bufferMs: cooldownBufferMs,
      reason: 'authorized_rate_limit_cooldown',
    });
  }

  const sleepFn = options.sleepFn || sleep;
  await sleepFn(cooldownMs, options.budget ? { budget: options.budget } : undefined);

  const resumeLogMessage = typeof options.resumeLogMessage === 'function'
    ? options.resumeLogMessage(ctx)
    : options.resumeLogMessage;
  if (resumeLogMessage) log('OK', resumeLogMessage);

  if (typeof options.onResume === 'function') {
    await options.onResume({ ...ctx, embed });
  }

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
    ).catch((e) => {
      log('DEBUG', `Rate-limit resume Discord notice failed: ${e?.message || e}`);
    });
  }

  return { ...ctx, embed };
}

export async function processSessionRateLimit(config, status = {}, options = {}) {
  const pauseCount = options.pauseCount ?? 1;
  const maxPauses = options.maxPauses ?? (config.rate_limit.max_pauses_per_module);
  const normalizedStatus = options.normalizeStatus
    ? options.normalizeStatus(status, pauseCount)
    : { ...(status || {}) };

  if (pauseCount > maxPauses) {
    const exhaustedCtx = { status: normalizedStatus, pauseCount, maxPauses };
    const exhaustedLogMessage = typeof options.exhaustedLogMessage === 'function'
      ? options.exhaustedLogMessage(exhaustedCtx)
      : options.exhaustedLogMessage;
    if (exhaustedLogMessage) log('ERROR', exhaustedLogMessage);

    const builtExhaustedResult = typeof options.buildExhaustedResult === 'function'
      ? await options.buildExhaustedResult(exhaustedCtx)
      : defaultSessionMonitorRateLimitExhaustedResult(normalizedStatus, pauseCount, maxPauses);
    const exhaustedResult = await finalizeSessionRateLimitExhaustion(builtExhaustedResult, {
      config,
      reason: builtExhaustedResult?.reason || 'rate_limit_exhausted',
      maxPauses,
    });
    return {
      exhausted: true,
      status: normalizedStatus,
      result: exhaustedResult,
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

export function createTrackedModuleSessionRateLimitRecoveryOptions(config, moduleDir, {
  sleepFn = sleep,
  discordFn = discord,
  moduleId = null,
  phase = null,
  identity = {},
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
    identity,
  };
  const moduleSyncOptions = {
    ...options,
    moduleId,
    phase,
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
        identity: resolveRateLimitIdentity(identity, { result, pauseCount }),
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
      await syncModuleRateLimitResume(config, moduleDir, ctx.status, moduleSyncOptions);
      if (typeof customOnResume === 'function') {
        await customOnResume(ctx);
      }
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
    attempt: status.attempt ?? null,
    dispatch_id: status.dispatch_id ?? null,
    gateway_label: status.gateway_label ?? null,
    session_key: status.session_key ?? null,
  });
  const pausedTransition = transitionModuleStatus(preStatus, STATUS.RATE_LIMITED, {
    note: `Paused ${ctx.cooldownHours}h (rate limit)`,
    phase: currentPhase,
  });
  saveStatus(config, moduleDir, preStatus, pausedTransition);
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
    attempt: status.attempt ?? null,
    dispatch_id: status.dispatch_id ?? null,
    gateway_label: status.gateway_label ?? null,
    session_key: status.session_key ?? null,
  });
  const resumedTransition = transitionModuleStatus(freshStatus, resumedStatus, {
    note: 'Resumed after rate limit cooldown',
    phase: currentPhase,
  });
  saveStatus(config, moduleDir, freshStatus, resumedTransition);
  onModuleStatusChanged({ config }, moduleId, resumedEvent);
}

export async function resumeDurableCooldownForStep(config, progress, step, {
  budget = null,
  cooldownBufferMs = config?.rate_limit?.cooldown_buffer_ms,
  sleepFn = sleep,
} = {}) {
  if (!step?.type || !step?.id) return { resumed: false, cooldown: null };

  const cooldown = getLifecycleCooldown(config, {
    stepType: step.type,
    stepId: step.id,
  });

  if (!cooldown?.open) {
    return { resumed: false, cooldown: cooldown || null };
  }

  const resumeAt = cooldown.resume_at;
  const resumeAtMs = typeof resumeAt === 'string' && resumeAt.trim()
    ? new Date(resumeAt).getTime()
    : NaN;
  if (!Number.isFinite(resumeAtMs)) {
    appendInvalidRateLimitCooldownResumeAtAlert(config, step, cooldown, resumeAt);
    log('WARN', `[cooldown-resume] ${step.type} ${step.id} has invalid cooldown resume_at '${resumeAt}', leaving cooldown open`);
    return {
      resumed: false,
      cooldown,
      error: 'invalid_rate_limit_cooldown_resume_at',
    };
  }

  const remainingMs = Math.max(0, resumeAtMs - Date.now());
  if (remainingMs > 0) {
    log('WARN', `[cooldown-resume] ${step.type} ${step.id} is still cooling down for ${Math.ceil(remainingMs / 1000)}s`);
    if (budget?.extendForRateLimit) {
      budget.extendForRateLimit(remainingMs, {
        bufferMs: cooldownBufferMs,
        reason: 'authorized_rate_limit_cooldown',
      });
    }
    await sleepFn(remainingMs, budget ? { budget } : undefined);
  }

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
  const maxPauses = options.maxPauses ?? (config.rate_limit.max_pauses_per_module);

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
      let exhaustedResult;
      if (typeof options.buildExhaustedResult === 'function') {
        const builtExhaustedResult = await options.buildExhaustedResult(exhaustedCtx);
        exhaustedResult = await finalizeSessionRateLimitExhaustion(builtExhaustedResult, {
          config,
          reason: builtExhaustedResult?.reason || 'rate_limit_exhausted',
          maxPauses,
        });
      } else if (options.exhaustedResultOptions) {
        const exhaustedResultOptions = typeof options.exhaustedResultOptions === 'function'
          ? options.exhaustedResultOptions(exhaustedCtx)
          : options.exhaustedResultOptions;
        const {
          reason = 'rate_limit_exhausted',
          resultOverrides = {},
          ...buildOptions
        } = exhaustedResultOptions || {};
        exhaustedResult = await finalizeSessionRateLimitExhaustion(
          {
            status,
            rate_limit_status: status,
            rate_limit_pauses: rateLimitPauses,
            max_rate_limit_pauses: maxPauses,
            ...resultOverrides,
          },
          {
            config,
            reason,
            maxPauses,
            ...buildOptions,
          },
        );
      } else {
        const builtExhaustedResult = defaultSessionRateLimitExhaustedResult(status, rateLimitPauses, maxPauses);
        exhaustedResult = await finalizeSessionRateLimitExhaustion(builtExhaustedResult, {
          config,
          reason: builtExhaustedResult.reason || 'rate_limit_exhausted',
          maxPauses,
        });
      }
      return exhaustedResult;
    }

    await handleSessionRateLimit(config, status, {
      ...options,
      pauseCount: rateLimitPauses,
      maxPauses,
    });
  }
}
