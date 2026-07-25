import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { emitGitCommitPushSoftFailDegraded } from '../services/git-soft-fail-observability.ts';
import { finalizeGateSessionRateLimitExit, getRateLimitConfig } from '../services/rate-limit.ts';

function gitPersistenceFailure(gitResult: any) {
  if (selectTruthyValue(() => !gitResult, () => gitResult.committed === true)) return null;
  return {
    code: 'gate_fix_git_persistence_degraded',
    committed: false,
    error: gitResult.error ?? 'Git commit/push did not report durable persistence',
  };
}

export async function handleGateFixStartFailure(ctx: any, fixStart: any) {
  if (fixStart.ok) return null;
  if (fixStart.stage === 'spawn') {
    const { error } = fixStart;
    log('ERROR', ctx.msg('spawnFailedLog', { error }));
    await ctx.send('CRITICAL', 'spawnFailedTitle', 'spawnFailedDescription', { error }, { gateway_label: error.gateway_label ?? ctx.snapshot().gateway_label });
    await ctx.emitFailure('spawnFailedReason', { error });
  } else {
    log('WARN', ctx.msg('healthFailedLog'));
    await ctx.send('WARN', 'healthFailedTitle', 'healthFailedDescription');
    await ctx.emitFailure('healthFailedReason');
  }
  return { mode: 'retry_request_fix', controlResult: ctx.controlResult };
}

function gateFailureData(ctx: any, fixLabel: string, sessionResult: any, exitResult: any) {
  return {
    issues_count: ctx.issues.length,
    fix_cycle: ctx.cycle,
    duration_seconds: Math.round((Date.now() - ctx.gateStartedAt) / 1000),
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: ctx.msg('rateLimitTitle', { fixLabel, sessionResult, exitResult }),
        description: ctx.msg('rateLimitDescription', { fixLabel, sessionResult, exitResult }),
        fields: ctx.fields({ attempt: exitResult.attempt, dispatch_id: exitResult.dispatch_id, gateway_label: exitResult.gateway_label, session_key: exitResult.session_key }),
      },
    },
  };
}

export async function handleGateFixRateLimit(ctx: any, fixLabel: string, sessionResult: any) {
  if (sessionResult.reason !== 'rate_limit_exhausted') return null;
  const exhaustedReason = ctx.msg('rateLimitReason', { fixLabel, sessionResult });
  const exit = await finalizeGateSessionRateLimitExit({ ...sessionResult, gateway_label: sessionResult.gateway_label ?? null }, {
    config: ctx.config,
    gateId: ctx.gateId,
    gateType: ctx.gate.type,
    phase: ctx.phase,
    exhaustedReason,
    identity: { run_id: getRunId(ctx.config), attempt: ctx.cycle, ...ctx.snapshot() },
    maxPauses: getRateLimitConfig(ctx.config).max_pauses_per_module,
    reason: exhaustedReason,
    resultOverrides: { outcome_class: 'rate_limited' },
    telemetryCtx: ctx.telemetryCtx(ctx.config),
    runId: getRunId(ctx.config),
    discordFn: ctx.deps.discord,
    discordTitle: ctx.msg('rateLimitTitle', { fixLabel, sessionResult }),
    discordDescription: (result: any) => ctx.msg('rateLimitDescription', { fixLabel, sessionResult, exitResult: result }),
    beforeReturn: () => ctx.getGateStats(ctx.config).gates_failed.push(ctx.gateId),
    gateFailureData: (result: any) => gateFailureData(ctx, fixLabel, sessionResult, result),
    logMessage: ctx.msg('rateLimitLogMessage', { fixLabel, sessionResult }),
    logLevel: ctx.msg('rateLimitLogLevel', { fixLabel, sessionResult }),
  });
  return { mode: 'terminal', controlResult: ctx.buildRateLimitControlResult(exit) };
}

export async function handleGateFixNoChanges(ctx: any, fixLabel: string, sessionResult: any, nextControlResult: any) {
  if (sessionResult.hasChanges) return null;
  const reason = selectTruthyValue(() => sessionResult.reason === 'timeout', () => sessionResult.completed !== true) ? 'timeout' : 'no_file_changes';
  const outcome = { fixLabel, sessionResult, reason };
  log('WARN', ctx.msg('noChangesLog', outcome));
  await ctx.send('WARN', 'noChangesTitle', 'noChangesDescription', outcome, {}, [{ name: 'Fix Result', value: reason }]);
  await ctx.emitFailure('noChangesReason', outcome);
  return { mode: 'retry_request_fix', controlResult: nextControlResult };
}

function successContext(ctx: any, values: any) {
  return { ...ctx, ...values, correlation: ctx.snapshot() };
}

export async function handleGateFixSuccess(ctx: any, fixLabel: string, sessionResult: any, nextControlResult: any) {
  const gitResult = await ctx.deps.gitCommitAndPush(ctx.config, ctx.commitMessage, { softFail: true });
  const degraded = gitPersistenceFailure(gitResult);
  emitGitCommitPushSoftFailDegraded(ctx.telemetryCtx(ctx.config), { error: gitResult?.error, gate_id: ctx.gateId, gate_type: ctx.gate.type ?? null, attempt: ctx.cycle, ...ctx.snapshot() });
  const values = { fixLabel, sessionResult, nextControlResult, gitResult, gitPersistenceDegraded: degraded };
  if (typeof ctx.onBeforeSuccessDiscord === 'function') await ctx.onBeforeSuccessDiscord(successContext(ctx, values));
  await ctx.send(degraded ? 'WARN' : 'INFO', 'successTitle', 'successDescription', values, {}, degraded ? [{ name: 'Git Persistence', value: degraded.error }] : []);
  if (typeof ctx.onSuccess === 'function') await ctx.onSuccess(successContext(ctx, values));
  if (selectTruthyValue(() => !ctx.includeControlResultOnSuccess, () => nextControlResult === undefined)) return { mode: 're_evaluate', degraded };
  return { mode: 're_evaluate', controlResult: nextControlResult, degraded };
}
