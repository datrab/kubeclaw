import { finalizeGateSessionRateLimitExit } from '../services/rate-limit.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

function exitIdentity(exitResult: any, identity: any) {
  return {
    attempt: exitResult?.attempt ?? identity.attempt,
    dispatch_id: exitResult?.dispatch_id ?? identity.dispatch_id,
    gateway_label: exitResult?.gateway_label ?? identity.gateway_label,
    session_key: exitResult?.session_key ?? identity.session_key,
  };
}

function gateFailureData(ctx: any, exitResult: any) {
  return {
    fix_cycle: ctx.attempt > 1 ? ctx.attempt - 1 : 0,
    duration_seconds: Math.round((Date.now() - ctx.gateStartedAt) / 1000),
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Gate '${ctx.gateId}' Rate Limit Exhausted`,
        description: `Gate attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
          ...ctx.identity,
          attempt: exitResult.attempt,
          dispatch_id: exitResult.dispatch_id,
          gateway_label: exitResult.gateway_label,
          session_key: exitResult.session_key,
        }),
      },
    },
  };
}

export async function handleBusterGateRateLimit(ctx: any) {
  const exhaustedReason = `Gate '${ctx.gateId}' exceeded max rate limit pauses`;
  const exitResult = await finalizeGateSessionRateLimitExit(ctx.result, {
    config: ctx.config,
    gateId: ctx.gateId,
    gateType: ctx.gate.type,
    phase: 'buster_gate',
    exhaustedReason,
    identity: { ...ctx.identity },
    maxPauses: ctx.maxRateLimitPauses,
    reason: exhaustedReason,
    resultOverrides: { outcome_class: 'rate_limited' },
    telemetryCtx: ctx.callbacks.telemetryCtx(ctx.config),
    runId: ctx.runId,
    discordFn: (...args: any[]) => ctx.deps.discord(...args),
    discordTitle: `Gate '${ctx.gateId}' Rate Limit Exhausted`,
    discordDescription: (result: any) => `Gate attempt ${result.attempt} exceeded max ACP rate limit pauses (${result.max_rate_limit_pauses}).`,
    beforeReturn: () => ctx.callbacks.getGateStats(ctx.config).gates_failed.push(ctx.gateId),
    gateFailureData: (result: any) => gateFailureData(ctx, result),
    logMessage: `Gate '${ctx.gateId}' rate limit pauses exhausted`,
    logLevel: 'ERROR',
  });
  return ctx.control({
    ...exitResult,
    failure_class: 'rate_limit_exhausted',
    outcome_class: 'rate_limited',
    ...exitIdentity(exitResult, ctx.identity),
  });
}
