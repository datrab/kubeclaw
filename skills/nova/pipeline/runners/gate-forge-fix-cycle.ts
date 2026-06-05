// runners/gate-forge-fix-cycle.ts — shared Forge fix-cycle engine for gates
// Gate-specific adapters own prompt content and post-fix cleanup/re-evaluation policy.

import { log } from '../core/logger.ts';
import { EXIT_RATE_LIMITED } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { buildDiscordIdentitySurfaceFields } from '../services/discord-fields.ts';
import { emitGitCommitPushSoftFailDegraded } from '../services/git-soft-fail-observability.ts';
import { finalizeGateSessionRateLimitExit } from '../services/rate-limit.ts';
import { finishGateForgeFixCycleScaffold, startGateForgeFixCycleScaffold } from '../services/gate-fix-scaffold.ts';

function gateFixMessage(messages, key, context) {
  const value = messages?.[key];
  if (typeof value === 'function') return value(context);
  if (typeof value === 'string') return value;
  throw new Error(`Gate fix-cycle message '${key}' is required`);
}

function buildGitPersistenceDegraded(gitResult) {
  if (!gitResult || gitResult.committed === true) return null;
  return {
    code: 'gate_fix_git_persistence_degraded',
    committed: gitResult.committed === true,
    error: gitResult.error || 'Git commit/push did not report durable persistence',
  };
}

export async function runGateForgeFixCycle({
  config,
  progress,
  deps,
  gateId,
  gate,
  cycle,
  maxFixCycles,
  gateStartedAt,
  controlResult,
  issues = [],
  fixHistory = [],
  fixPrompt,
  fixLabelPrefix,
  policyScope,
  initialCorrelation = {},
  clearActiveSessionBeforeSpawn = false,
  buildActiveSessionExtra = () => ({}),
  discordIdentitySurface,
  messages = {},
  phase,
  timeoutMinutes,
  artifactLogLabel,
  emitFixCycleFail,
  getGateStats,
  telemetryCtx,
  buildRateLimitControlResult,
  buildNextControlResult = () => controlResult,
  includeControlResultOnSuccess = true,
  commitMessage,
  onBeforeSuccessDiscord,
  onSuccess,
} = {}) {
  let fixSessionKey = initialCorrelation.sessionKey || null;
  let fixGatewayLabel = initialCorrelation.gatewayLabel || null;
  let fixDispatchId = initialCorrelation.dispatchId || null;

  const resolveFixCycleSessionKey = () => fixSessionKey || initialCorrelation.sessionKey || null;
  const resolveFixCycleGatewayLabel = () => fixGatewayLabel || initialCorrelation.gatewayLabel || null;
  const resolveFixCycleDispatchId = () => fixDispatchId || initialCorrelation.dispatchId || null;
  const identity = (overrides = {}) => ({
    run_id: getRunId(config) || config?._runId || config?.run_id || 'unknown',
    gate_id: gateId,
    gate_type: gate?.type,
    attempt: overrides.attempt ?? cycle,
    dispatch_id: overrides.dispatch_id ?? resolveFixCycleDispatchId(),
    gateway_label: overrides.gateway_label ?? resolveFixCycleGatewayLabel(),
    session_key: overrides.session_key ?? resolveFixCycleSessionKey(),
  });
  const fields = (overrides = {}, extra = []) => buildDiscordIdentitySurfaceFields(discordIdentitySurface, identity(overrides), extra);
  const context = {
    config,
    progress,
    deps,
    gateId,
    gate,
    cycle,
    maxFixCycles,
    gateStartedAt,
    controlResult,
    issues,
    fixHistory,
    identity,
    fields,
    resolveFixCycleSessionKey,
    resolveFixCycleGatewayLabel,
    resolveFixCycleDispatchId,
  };
  const msg = (key, overrides = {}) => gateFixMessage(messages, key, { ...context, ...overrides });
  const send = (level, titleKey, descriptionKey, overrides = {}, fieldOverrides = {}, extraFields = []) =>
    deps.discord(config, level, msg(titleKey, overrides), msg(descriptionKey, overrides), fields(fieldOverrides, extraFields));
  const emitFailure = (reasonKey, overrides = {}) => emitFixCycleFail(config, gateId, gate.type, cycle, gateStartedAt, msg(reasonKey, overrides), {
    issues_count: issues.length,
    session_key: resolveFixCycleSessionKey(),
  });

  await send(msg('startLevel'), 'startTitle', 'startDescription');

  const fixStart = await startGateForgeFixCycleScaffold({
    config,
    progress,
    deps,
    gateId,
    gate,
    cycle,
    fixPrompt,
    fixLabelPrefix,
    policyScope,
    initialCorrelation,
    clearActiveSessionBeforeSpawn,
    buildActiveSessionExtra,
  });
  const fixLabel = fixStart.fixLabel;
  fixSessionKey = fixStart.correlation.sessionKey;
  fixGatewayLabel = fixStart.correlation.gatewayLabel;
  fixDispatchId = fixStart.correlation.dispatchId;

  if (!fixStart.ok && fixStart.stage === 'spawn') {
    const error = fixStart.error;
    log('ERROR', msg('spawnFailedLog', { error }));
    await send('CRITICAL', 'spawnFailedTitle', 'spawnFailedDescription', { error }, { gateway_label: error.gateway_label || resolveFixCycleGatewayLabel() });
    await emitFailure('spawnFailedReason', { error });
    return { mode: 'retry_request_fix', controlResult };
  }

  if (!fixStart.ok && fixStart.stage === 'health_check') {
    log('WARN', msg('healthFailedLog'));
    await send('WARN', 'healthFailedTitle', 'healthFailedDescription');
    await emitFailure('healthFailedReason');
    return { mode: 'retry_request_fix', controlResult };
  }

  await send('INFO', 'workingTitle', 'workingDescription');

  const { sessionResult } = await finishGateForgeFixCycleScaffold({
    config,
    deps,
    gateId,
    gate,
    cycle,
    fixLabel,
    fixAcpLabel: fixStart.fixAcpLabel,
    timeoutMinutes,
    artifactLogLabel,
  });

  const nextControlResult = await buildNextControlResult({
    ...context,
    fixLabel,
    sessionResult,
    correlation: {
      dispatch_id: resolveFixCycleDispatchId(),
      gateway_label: resolveFixCycleGatewayLabel(),
      session_key: resolveFixCycleSessionKey(),
    },
  });

  if (sessionResult.reason === 'rate_limit_exhausted') {
    const exhaustedReason = msg('rateLimitReason', { fixLabel, sessionResult });
    const rateLimitExit = await finalizeGateSessionRateLimitExit({
      ...sessionResult,
      gateway_label: sessionResult.gateway_label ?? sessionResult.rate_limit_status?.gateway_label ?? resolveFixCycleGatewayLabel() ?? null,
    }, {
      config,
      gateId,
      gateType: gate.type,
      phase,
      exhaustedReason,
      identity: {
        run_id: getRunId(config),
        attempt: cycle,
        dispatch_id: resolveFixCycleDispatchId(),
        gateway_label: resolveFixCycleGatewayLabel(),
        session_key: resolveFixCycleSessionKey(),
      },
      maxPauses: config.rate_limit.max_pauses_per_module,
      exit: EXIT_RATE_LIMITED,
      reason: exhaustedReason,
      telemetryCtx: telemetryCtx(config),
      runId: getRunId(config),
      discordFn: deps.discord,
      discordTitle: msg('rateLimitTitle', { fixLabel, sessionResult }),
      discordDescription: (exitResult) => msg('rateLimitDescription', { fixLabel, sessionResult, exitResult }),
      beforeReturn: () => {
        getGateStats(config).gates_failed.push(gateId);
      },
      gateFailureData: (exitResult) => ({
        issues_count: issues.length,
        fix_cycle: cycle,
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: msg('rateLimitTitle', { fixLabel, sessionResult, exitResult }),
            description: msg('rateLimitDescription', { fixLabel, sessionResult, exitResult }),
            fields: fields({
              attempt: exitResult.attempt,
              dispatch_id: exitResult.dispatch_id,
              gateway_label: exitResult.gateway_label,
              session_key: exitResult.session_key,
            }),
          },
        },
      }),
      logMessage: msg('rateLimitLogMessage', { fixLabel, sessionResult }),
      logLevel: msg('rateLimitLogLevel', { fixLabel, sessionResult }),
    });
    return {
      mode: 'terminal',
      controlResult: buildRateLimitControlResult(rateLimitExit),
    };
  }

  fixHistory.push({ attempt: cycle, hasChanges: sessionResult.hasChanges, issues });

  if (!sessionResult.hasChanges) {
    const reason = sessionResult.reason === 'timeout' || sessionResult.completed !== true
      ? 'timeout'
      : 'no_file_changes';
    const noChanges = { fixLabel, sessionResult, reason };
    log('WARN', msg('noChangesLog', noChanges));
    await send('WARN', 'noChangesTitle', 'noChangesDescription', noChanges, {}, [{ name: 'Fix Result', value: reason }]);
    await emitFailure('noChangesReason', noChanges);
    return { mode: 'retry_request_fix', controlResult: nextControlResult };
  }

  const gitResult = await deps.gitCommitAndPush(config, commitMessage, { softFail: true });
  const gitPersistenceDegraded = buildGitPersistenceDegraded(gitResult);
  emitGitCommitPushSoftFailDegraded(telemetryCtx(config), {
    error: gitResult?.error,
    gate_id: gateId,
    gate_type: gate.type || null,
    attempt: cycle,
    dispatch_id: resolveFixCycleDispatchId(),
    gateway_label: resolveFixCycleGatewayLabel(),
    session_key: resolveFixCycleSessionKey(),
  });

  if (typeof onBeforeSuccessDiscord === 'function') {
    await onBeforeSuccessDiscord({
      ...context,
      fixLabel,
      sessionResult,
      nextControlResult,
      gitResult,
      gitPersistenceDegraded,
      correlation: {
        dispatch_id: resolveFixCycleDispatchId(),
        gateway_label: resolveFixCycleGatewayLabel(),
        session_key: resolveFixCycleSessionKey(),
      },
    });
  }

  await send(
    gitPersistenceDegraded ? 'WARN' : 'INFO',
    'successTitle',
    'successDescription',
    { fixLabel, sessionResult, gitResult, gitPersistenceDegraded },
    {},
    gitPersistenceDegraded ? [{ name: 'Git Persistence', value: gitPersistenceDegraded.error }] : [],
  );

  if (typeof onSuccess === 'function') {
    await onSuccess({
      ...context,
      fixLabel,
      sessionResult,
      nextControlResult,
      gitResult,
      gitPersistenceDegraded,
      correlation: {
        dispatch_id: resolveFixCycleDispatchId(),
        gateway_label: resolveFixCycleGatewayLabel(),
        session_key: resolveFixCycleSessionKey(),
      },
    });
  }

  if (!includeControlResultOnSuccess) return { mode: 're_evaluate', degraded: gitPersistenceDegraded };
  return nextControlResult === undefined
    ? { mode: 're_evaluate', degraded: gitPersistenceDegraded }
    : { mode: 're_evaluate', controlResult: nextControlResult, degraded: gitPersistenceDegraded };
}
