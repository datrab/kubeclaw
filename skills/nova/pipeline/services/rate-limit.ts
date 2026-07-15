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
  createTrackedModuleSessionRateLimitExhaustedResultOptions,
  createSessionRateLimitDiscordNotifier,
  defaultSessionRateLimitDetail,
  resolveRateLimitIdentity,
} from './rate-limit-builders.ts';
import {
  appendInvalidRateLimitCooldownResumeAtAlert,
  finalizeSessionRateLimitExhaustion,
} from './rate-limit-exit.ts';
import {
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from './correlation.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { resolveRateLimitCooldown } from './rate-limit-cooldown.ts';
export * from './rate-limit-builders.ts';
export * from './rate-limit-exit.ts';
export { resolveRateLimitCooldown } from './rate-limit-cooldown.ts';
const RATE_LIMIT_EXHAUSTED_REASON = 'rate_limit_exhausted';
const DURABLE_COOLDOWN_REPLAY_RESUME_DETAIL = 'Resumed after durable cooldown replay';
const RATE_LIMIT_SESSION_LABEL = 'session';
function requireRateLimitConfigSection(config) {
  const rateLimit = config?.rate_limit;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!rateLimit), () => (typeof rateLimit !== 'object'))), () => (Array.isArray(rateLimit)))) {
    throw new Error('config.rate_limit is required for rate-limit handling');
  }
  return rateLimit;
}
function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function requiredPauseCount(value, label) {
  const count = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(count)), () => (count < 1))) {
    throw new Error(`${label} requires explicit positive pauseCount`);
  }
  return Math.trunc(count);
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function errorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) return error.message;
  return String(error);
}

function resolveCooldownHours(cooldown) {
  if (cooldown.cooldownHours !== undefined && cooldown.cooldownHours !== null) return cooldown.cooldownHours;
  return cooldown.cooldownMs / (60 * 60 * 1000);
}

function resolveSleepFn(options) {
  return options.sleepFn !== undefined ? options.sleepFn : sleep;
}

function requireModuleIdentity(...values) {
  const moduleId = selectPresentValue(...values);
  if (!moduleId) throw new Error('tracked module rate-limit sync requires explicit module identity');
  return moduleId;
}

export function createRateLimitPauseState(initialCount = 0) {
  return { count: initialCount };
}

export function getRateLimitConfig(config) {
  const rateLimit = requireRateLimitConfigSection(config);
  return {
    max_pauses_per_module: Number(rateLimit.max_pauses_per_module),
    cooldown_hours: Number(rateLimit.cooldown_hours),
    cooldown_buffer_ms: Number(rateLimit.cooldown_buffer_ms),
  };
}

async function finalizeConfiguredSessionRateLimitExhaustion(config, options = {}, exhaustedCtx = {}) {
  const { status = {}, pauseCount = 0, maxPauses = 0 } = exhaustedCtx;
  if (typeof options.buildExhaustedResult === 'function') {
    const builtExhaustedResult = await options.buildExhaustedResult(exhaustedCtx);
    return finalizeSessionRateLimitExhaustion(builtExhaustedResult, {
      config,
      reason: selectPresentValue(builtExhaustedResult?.reason, RATE_LIMIT_EXHAUSTED_REASON),
      maxPauses,
    });
  }
  if (!options.exhaustedResultOptions) {
    throw new Error('session rate-limit exhaustion requires explicit typed buildExhaustedResult or exhaustedResultOptions');
  }
  const exhaustedResultOptions = typeof options.exhaustedResultOptions === 'function'
    ? options.exhaustedResultOptions(exhaustedCtx)
    : options.exhaustedResultOptions;
  const exhaustedResultOptionsRecord = objectRecord(exhaustedResultOptions);
  const {
    reason = RATE_LIMIT_EXHAUSTED_REASON,
    resultOverrides = {},
    ...buildOptions
  } = exhaustedResultOptionsRecord;
  return finalizeSessionRateLimitExhaustion(
    {
      status,
      rate_limit_status: status,
      rate_limit_pauses: pauseCount,
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
}

function buildRateLimitDiscordCorrelation(status = {}) {
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

export async function handleSessionRateLimit(config, status = {}, options = {}) {
  const pauseCount = requiredPauseCount(options.pauseCount, 'handleSessionRateLimit');
  const rateLimitConfig = getRateLimitConfig(config);
  const maxPauses = rateLimitConfig.max_pauses_per_module;
  const cooldownBufferMs = rateLimitConfig.cooldown_buffer_ms;
  const cooldown = resolveRateLimitCooldown(status, rateLimitConfig, {
    cooldownBufferMs,
    nowMs: options.nowMs,
  });
  const cooldownHours = resolveCooldownHours(cooldown);
  const cooldownMs = cooldown.cooldownMs;
  const resumeAt = cooldown.resumeAt;
  const detail = options.getDetail ? options.getDetail(status) : defaultSessionRateLimitDetail(status);
  const ctx = { status, pauseCount, maxPauses, cooldownHours, cooldownMs, resumeAt, detail, ...cooldown };
  const hasLifecycleTarget = Boolean(selectTruthyValue(() => (status?.module_id), () => (status?.gate_id)));
  const suppressPausePresentation = typeof options.suppressPausePresentation === 'function'
    ? options.suppressPausePresentation(ctx)
    : options.suppressPausePresentation === true;

  if (hasLifecycleTarget) {
    appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_started', {
      moduleId: selectTruthyValue(() => (status?.module_id), () => (null)),
      gateId: selectTruthyValue(() => (status?.gate_id), () => (null)),
      gateType: selectTruthyValue(() => (status?.gate_type), () => (null)),
      attempt: selectDefinedValue(() => (status?.attempt), () => (null)),
      pauseCount,
      maxPauses,
      cooldownHours,
      cooldownMs,
      cooldownSource: cooldown.cooldownSource,
      cooldownSourceDetail: cooldown.cooldownSourceDetail,
      cooldownBufferMs: cooldown.cooldownBufferMs,
      retryAfterSeconds: cooldown.retryAfterSeconds,
      resumeAt: resumeAt.toISOString(),
      detail,
      agentType: selectTruthyValue(() => (selectTruthyValue(() => (status?.agent_type), () => (status?.phase))), () => (null)),
      dispatchId: selectDefinedValue(() => (status?.dispatch_id), () => (null)),
      gatewayLabel: selectDefinedValue(() => (status?.gateway_label), () => (null)),
      sessionKey: selectTruthyValue(() => (status?.session_key), () => (null)),
      commitHash: selectTruthyValue(() => (status?.commit_hash), () => (null)),
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
        run_id: selectDefinedValue(() => (getRunId(config)), () => (null)),
        agent_type: selectTruthyValue(() => (selectTruthyValue(() => (status?.agent_type), () => (status?.phase))), () => (null)),
        module_id: selectTruthyValue(() => (status?.module_id), () => (null)),
        gate_id: selectTruthyValue(() => (status?.gate_id), () => (null)),
        gate_type: status?.gate_id != null ? (selectDefinedValue(() => (status?.gate_type), () => (null))) : undefined,
        session_key: selectTruthyValue(() => (status?.session_key), () => (null)),
        gateway_label: selectDefinedValue(() => (status?.gateway_label), () => (null)),
        attempt: selectDefinedValue(() => (status?.attempt), () => (null)),
        dispatch_id: selectDefinedValue(() => (status?.dispatch_id), () => (null)),
      }, {
        provider: status?.provider,
        allowAnthropicDefault: false,
        pauseCount,
        maxPauses,
        cooldownMs,
        cooldownSource: cooldown.cooldownSource,
        resumeAt: resumeAt.toISOString(),
        retryAfterSeconds: cooldown.retryAfterSeconds,
        detail,
      }));
    }
  }

  const embed = formatRateLimitEmbed(config, {
    detail,
    cooldownSource: cooldown.cooldownSource,
    cooldownSourceDetail: cooldown.cooldownSourceDetail,
  }, pauseCount, maxPauses, cooldownMs);
  if (!suppressPausePresentation) {
    if (typeof options.sendPauseDiscord === 'function') {
      await options.sendPauseDiscord({ ...ctx, embed });
    } else {
      await discord(config, 'WARN', embed.title, embed.description, [
        ...buildSessionRateLimitDiscordFields(status),
        ...embed.fields,
      ], { correlation: buildRateLimitDiscordCorrelation(status) }).catch((e) => {
        log('DEBUG', `Rate-limit pause Discord notice failed: ${errorMessage(e)}`);
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

  const sleepFn = resolveSleepFn(options);
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
      moduleId: selectTruthyValue(() => (status?.module_id), () => (null)),
      gateId: selectTruthyValue(() => (status?.gate_id), () => (null)),
      gateType: selectTruthyValue(() => (status?.gate_type), () => (null)),
      attempt: selectDefinedValue(() => (status?.attempt), () => (null)),
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
      : `${RATE_LIMIT_SESSION_LABEL} ${selectPresentValue(status?.module_id, status?.gateway_label, status?.session_key, RATE_LIMIT_SESSION_LABEL)}`;
    await discord(config, 'INFO', 'Rate limit cooldown complete', `Resuming ${resumeTarget}`,
      buildSessionRateLimitDiscordFields(status),
      { correlation: buildRateLimitDiscordCorrelation(status) },
    ).catch((e) => {
      log('DEBUG', `Rate-limit resume Discord notice failed: ${errorMessage(e)}`);
    });
  }

  return { ...ctx, embed };
}

export async function processSessionRateLimit(config, status = {}, options = {}) {
  const pauseCount = requiredPauseCount(options.pauseCount, 'processSessionRateLimit');
  const maxPauses = getRateLimitConfig(config).max_pauses_per_module;
  const normalizedStatus = options.normalizeStatus
    ? options.normalizeStatus(status, pauseCount)
    : { ...objectRecord(status) };

  if (pauseCount > maxPauses) {
    const exhaustedCtx = { status: normalizedStatus, pauseCount, maxPauses };
    const exhaustedLogMessage = typeof options.exhaustedLogMessage === 'function'
      ? options.exhaustedLogMessage(exhaustedCtx)
      : options.exhaustedLogMessage;
    if (exhaustedLogMessage) log('ERROR', exhaustedLogMessage);

    const exhaustedResult = await finalizeConfiguredSessionRateLimitExhaustion(config, options, exhaustedCtx);
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
  exhaustedResultOptions: customExhaustedResultOptions = null,
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
    resumeDescription: (status) => `Resuming module ${requireModuleIdentity(status?.module_id, moduleId)}`,
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
    exhaustedResultOptions: firstDefined(customExhaustedResultOptions, createTrackedModuleSessionRateLimitExhaustedResultOptions({
      moduleId,
      moduleDir,
      phase,
      identity,
    })),
    normalizeStatus: (result, pauseCount) => {
      const normalized = buildTrackedModuleSessionRateLimitStatus(config, moduleDir, objectRecord(result?.status), {
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

  const currentPhase = selectDefinedValue(() => (status.current_phase), () => (null));
  const moduleId = requireModuleIdentity(status.module_id, preStatus.module_id, options.moduleId);
  const rateLimitedEvent = buildModuleStatusTelemetry(preStatus, {
    old_status: preStatus.status,
    new_status: STATUS.RATE_LIMITED,
    phase: currentPhase,
    reason: `Paused ${ctx.cooldownHours}h (rate limit)`,
    attempt: selectDefinedValue(() => (status.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (status.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (status.gateway_label), () => (null)),
    session_key: selectDefinedValue(() => (status.session_key), () => (null)),
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
  if (selectTruthyValue(() => (!freshStatus), () => (freshStatus.status !== STATUS.RATE_LIMITED))) return;

  const currentPhase = selectDefinedValue(() => (status.current_phase), () => (null));
  const resumedStatus = currentPhase === 'forge' ? STATUS.IN_PROGRESS : STATUS.TESTING;
  const moduleId = requireModuleIdentity(status.module_id, freshStatus.module_id, options.moduleId);
  const resumedEvent = buildModuleStatusTelemetry(freshStatus, {
    old_status: freshStatus.status,
    new_status: resumedStatus,
    phase: currentPhase,
    attempt: selectDefinedValue(() => (status.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (status.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (status.gateway_label), () => (null)),
    session_key: selectDefinedValue(() => (status.session_key), () => (null)),
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
  if (selectTruthyValue(() => (!step?.type), () => (!step?.id))) return { resumed: false, cooldown: null };

  const cooldown = getLifecycleCooldown(config, {
    stepType: step.type,
    stepId: step.id,
  });

  if (!cooldown?.open) {
    return { resumed: false, cooldown: selectTruthyValue(() => (cooldown), () => (null)) };
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
        current_phase: selectTruthyValue(() => (cooldown.agent_type), () => (null)),
      }, {
        moduleId: step.id,
        phase: selectTruthyValue(() => (cooldown.agent_type), () => (null)),
      });
    }
  }

  appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_completed', {
    moduleId: step.type === 'module' ? step.id : null,
    gateId: step.type === 'gate' ? step.id : null,
    gateType: selectTruthyValue(() => (cooldown.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (cooldown.attempt), () => (null)),
    pauseCount: selectDefinedValue(() => (cooldown.pause_count), () => (null)),
    maxPauses: selectDefinedValue(() => (cooldown.max_pauses), () => (null)),
    resumedAt: new Date().toISOString(),
    detail: selectPresentValue(cooldown.detail, DURABLE_COOLDOWN_REPLAY_RESUME_DETAIL),
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
  const pauseState = selectTruthyValue(() => (options.pauseState), () => (null));
  let rateLimitPauses = Number.isFinite(Number(pauseState?.count)) ? Math.trunc(Number(pauseState.count)) : 0;
  const maxPauses = getRateLimitConfig(config).max_pauses_per_module;

  while (true) {
    const result = await pollFn();
    if (result?.reason !== 'rate_limited') return result;

    rateLimitPauses++;
    if (pauseState) pauseState.count = rateLimitPauses;
    const status = options.normalizeStatus
      ? options.normalizeStatus(result, rateLimitPauses)
      : { ...objectRecord(result?.status) };

    if (rateLimitPauses > maxPauses) {
      const exhaustedCtx = { result, status, pauseCount: rateLimitPauses, maxPauses };
      return finalizeConfiguredSessionRateLimitExhaustion(config, options, exhaustedCtx);
    }

    await handleSessionRateLimit(config, status, {
      ...options,
      pauseCount: rateLimitPauses,
      maxPauses,
    });
  }
}
