import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/gate-forge-fix-cycle.ts — shared Forge fix-cycle engine for gates
// Gate-specific adapters own prompt content and post-fix cleanup/re-evaluation policy.

import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { buildDiscordIdentitySurfaceFields } from '../services/discord-fields.ts';
import { emitGitCommitPushSoftFailDegraded } from '../services/git-soft-fail-observability.ts';
import { finalizeGateSessionRateLimitExit, getRateLimitConfig } from '../services/rate-limit.ts';
import { finishGateForgeFixCycleScaffold, startGateForgeFixCycleScaffold } from '../services/gate-fix-scaffold.ts';

function gateFixMessage(messages, key, context) {
  const value = messages?.[key];
  if (typeof value === 'function') return value(context);
  if (typeof value === 'string') return value;
  throw new Error(`Gate fix-cycle message '${key}' is required`);
}

function buildGitPersistenceDegraded(gitResult) {
  if (selectTruthyValue(() => (!gitResult), () => (gitResult.committed === true))) return null;
  return {
    code: 'gate_fix_git_persistence_degraded',
    committed: gitResult.committed === true,
    error: selectDefinedValue(() => (gitResult.error), () => ('Git commit/push did not report durable persistence')),
  };
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
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
  if (typeof deps?.gitCommitAndPush !== 'function') {
    throw new Error('gate Forge fix-cycle requires canonical gitCommitAndPush dependency');
  }
  let fixSessionKey = selectTruthyValue(() => (initialCorrelation.sessionKey), () => (null));
  let fixGatewayLabel = selectTruthyValue(() => (initialCorrelation.gatewayLabel), () => (null));
  let fixDispatchId = selectTruthyValue(() => (initialCorrelation.dispatchId), () => (null));

  const resolveFixCycleSessionKey = () => selectTruthyValue(() => (selectTruthyValue(() => (fixSessionKey), () => (initialCorrelation.sessionKey))), () => (null));
  const resolveFixCycleGatewayLabel = () => selectTruthyValue(() => (selectTruthyValue(() => (fixGatewayLabel), () => (initialCorrelation.gatewayLabel))), () => (null));
  const resolveFixCycleDispatchId = () => selectTruthyValue(() => (selectTruthyValue(() => (fixDispatchId), () => (initialCorrelation.dispatchId))), () => (null));
  const identity = (overrides = {}) => ({
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (getRunId(config)), () => (config?._runId))), () => (config?.run_id))), () => ('missing_run_id')),
    gate_id: gateId,
    gate_type: gate?.type,
    attempt: firstDefined(overrides.attempt, cycle),
    dispatch_id: firstDefined(overrides.dispatch_id, resolveFixCycleDispatchId()),
    gateway_label: firstDefined(overrides.gateway_label, resolveFixCycleGatewayLabel()),
    session_key: firstDefined(overrides.session_key, resolveFixCycleSessionKey()),
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
    deps.discord(config, level, msg(titleKey, overrides), msg(descriptionKey, overrides), fields(fieldOverrides, extraFields), { correlation: identity(fieldOverrides) });
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
    await send('CRITICAL', 'spawnFailedTitle', 'spawnFailedDescription', { error }, { gateway_label: firstDefined(error.gateway_label, resolveFixCycleGatewayLabel()) });
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
      gateway_label: selectDefinedValue(() => (sessionResult.gateway_label), () => (null)),
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
      maxPauses: getRateLimitConfig(config).max_pauses_per_module,
      reason: exhaustedReason,
      resultOverrides: { outcome_class: 'rate_limited' },
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
    const reason = selectTruthyValue(() => (sessionResult.reason === 'timeout'), () => (sessionResult.completed !== true))
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
    gate_type: selectTruthyValue(() => (gate.type), () => (null)),
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
