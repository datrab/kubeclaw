import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.js';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_RATE_LIMITED } from '../core/constants.js';
import { log } from '../core/logger.js';
import { getRunId } from '../core/runtime.js';
import { requireStageHandler } from '../core/registry.js';
import { transcriptShowsProgress } from '../../../common/pipeline/agents/acp-monitor.js';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from '../services/correlation.js';
import { finalizeModuleSessionRateLimitExit } from '../services/rate-limit.js';
import {
  startModulePhase,
  transitionModuleStatus,
  setModuleActiveAgent,
  clearModuleActiveAgent,
} from '../../../common/pipeline/lifecycle-state.js';
import {
  onModuleStarted,
  onModulePass,
  onPhaseStarted,
  onPhaseCompleted,
  emitOperatorAlert,
} from '../services/telemetry.js';
import {
  _telemetryCtx,
  buildModuleDiscordFields,
  buildModuleForgeRunInput,
  buildModuleWorkerPluginInvocation,
  computeElapsedSeconds,
  currentAttemptNumber,
  emitTerminalModuleFailTelemetry,
  ensureModulePluginLogDirs,
  ensureValidationState,
  formatDurationCompact,
  getModuleStats,
  getAttemptStartedAt,
  getPhaseStartedAt,
  markValidationPassed,
  normalizeModuleForgeWorkerResult,
  readCorruptStatusIdentity,
  setLogScope,
  buildWorkerPluginEffects,
} from './module-runner-shared.js';
import { extractModuleForgeWorkerLegacyResult } from '../agents/orchestration.js';

function buildRetryResult(failResult, statusValue) {
  return {
    retry: true,
    fail_count: failResult?.fail_count ?? statusValue?.fail_count ?? 0,
    dispatch_id: resolveResultDispatchId(failResult),
    gateway_label: resolveResultGatewayLabel(failResult),
    session_key: resolveResultSessionKey(failResult),
    last_fail: failResult?.last_fail ?? null,
  };
}

export async function runModuleForgePhase({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  maxFails,
  timeout,
  novaPrompt,
  stages,
  deps,
  recalledMemoryIds = [],
} = {}) {
  const handleModuleFail = (statusValue, phase, reason, opts = {}) => (
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
  );

  setLogScope(moduleId, 'forge');
  ensureValidationState(status);

  {
    const preflightResult = deps.runPreflightValidation(mod, dir, config);
    if (!preflightResult.passed) {
      const reason = deps.formatValidationFailures(preflightResult.failures);
      log('WARN', `Module ${moduleId} preflight contract validation failed — aborting Forge spawn`);
      await deps.discord(config, 'WARN', `Module ${moduleId} PREFLIGHT FAIL`,
        `Contract mismatch detected before Forge spawn. Fix FORGE.md and retry.`, [
          ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status) }),
          { name: 'Stage', value: 'preflight_contract' },
          { name: 'Issues', value: String(preflightResult.failures.length) },
          { name: 'Codes', value: preflightResult.failures.map(f => f.code).join(', ') },
        ]);
      const failResult = await handleModuleFail(status, 'preflight_contract', reason, { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }
  }

  const forgePolicy = deps.resolvePolicy(config, progress, 'forge', {
    scopeModel: mod.forge_model,
    scopeThinking: mod.thinking_level?.forge || null,
    dispatchPath: 'acp',
  });
  const forgeModel = forgePolicy.model;
  const forgeHarness = deps.modelToHarness(forgeModel) || config.agents?.forge?.acp_agent_id || 'forge';
  log('STEP', `Phase: FORGE (harness: ${forgeHarness}, model: ${forgeModel ?? '(none)'}, thinking: ${forgePolicy.thinking ?? 'default'}, model_source: ${forgePolicy.model_source})`);
  deps.logEffectivePolicy(config, { scope: 'module_forge', agent: 'forge', moduleId, ...forgePolicy });
  getModuleStats(config).total_forge_attempts++;
  await onModuleStarted(_telemetryCtx(config), moduleId, forgeModel, currentAttemptNumber(status), {
    presentation: {
      discord: {
        level: 'INFO',
        title: `Module ${moduleId} started`,
        description: mod.title,
        fields: [
          ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status) }),
          { name: 'Model', value: forgeModel },
          { name: 'Harness', value: forgeHarness },
          { name: 'Retry Budget', value: `${status.fail_count + 1}/${maxFails}` },
        ],
      },
    },
  });
  onPhaseStarted(_telemetryCtx(config), moduleId, 'forge', forgeModel);

  const promptResult = await deps.buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt);
  if (promptResult.error) {
    log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}: forge prompt assembly failed: ${promptResult.error}`);
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'forge', forgeModel, status?.status ?? STATUS.IN_PROGRESS, promptResult.error);
    return {
      status,
      recalledMemoryIds,
      terminal: {
        retry: false,
        result: {
          exit: EXIT_ERROR,
          reason: promptResult.error,
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: resolveStatusSessionKey(status),
        },
      },
    };
  }
  const forgePrompt = promptResult.prompt;
  recalledMemoryIds = promptResult.recalledMemoryIds || [];

  deps.savePrompt(config, dir, 'forge', status.fail_count + 1, forgePrompt);

  const forgeAttemptStartedAt = new Date().toISOString();
  startModulePhase(status, 'forge', `Forge started (${forgeHarness})`, { now: forgeAttemptStartedAt });
  status.validation = {
    attempt: currentAttemptNumber(status),
    delivery_lint_passed: false,
    delivery_lint_passed_at: null,
    pre_check_passed: false,
    pre_check_passed_at: null,
  };
  deps.saveStatus(config, dir, status);

  deps.setShutdownContext(config, 'forge', moduleId, dir);
  deps.invalidateHeadHash();
  const headBeforeForge = deps.headHash();
  const forgeSessionLabel = deps.acpLabel('forge', moduleId);

  const forgeStageId = 'worker:module_forge';
  const forgeExecutionInput = buildModuleForgeRunInput(config, moduleId, mod, dir, status, {
    attempt: currentAttemptNumber(status),
    maxFails,
    model: forgeModel,
    thinking: forgePolicy.thinking,
    timeoutMinutes: timeout,
    headBefore: headBeforeForge,
    novaPromptProvided: Boolean(novaPrompt),
    recalledMemoryIds,
  });
  const forgeWorkerInput = {
    ...forgeExecutionInput,
    moduleId,
    moduleDir: dir,
    timeoutMinutes: timeout,
    model: forgeModel,
    prompt: forgePrompt,
    thinking: forgePolicy.thinking,
    attempt: currentAttemptNumber(status),
    headBefore: headBeforeForge,
    onDispatched: async (dispatch = {}) => {
      setModuleActiveAgent(status, {
        session_key: dispatch.session_key || null,
        stream_log_path: dispatch.stream_log_path || null,
        label: forgeSessionLabel,
        gateway_label: dispatch.gateway_label || null,
        attempt: currentAttemptNumber(status),
        runtime: dispatch.runtime || null,
        model: forgeModel,
        agent_id: dispatch.agent_id || forgeHarness,
        phase: 'forge',
        started_at: new Date().toISOString(),
      });
      deps.saveStatus(config, dir, status);
    },
    onFinalized: async ({ status: finalizedStatus = null } = {}) => {
      status = finalizedStatus || deps.loadStatus(config, dir) || status;
      clearModuleActiveAgent(status);
      deps.saveStatus(config, dir, status);
    },
  };

  let executeForgeWorker;
  let forgeOwnerRecord;
  let forgeWorkerResult;
  try {
    ({ handler: executeForgeWorker, record: forgeOwnerRecord } = requireStageHandler(config, 'worker.execute', forgeStageId, 'execute'));
    ensureModulePluginLogDirs(config);
    const pluginContext = createPluginContext({
      config,
      progress,
      hookFamily: 'worker.execute',
      stageId: forgeStageId,
      record: forgeOwnerRecord,
      invocation: buildModuleWorkerPluginInvocation(moduleId, status, forgeStageId, {
        attempt: currentAttemptNumber(status),
      }),
      stateSnapshot: async () => forgeExecutionInput.stateSnapshot,
      environmentMetadata: {
        moduleId,
        phase: 'forge',
        workerType: 'module_forge',
        model: forgeModel,
        thinking: forgePolicy.thinking || null,
      },
      effects: buildWorkerPluginEffects(config, progress, forgeStageId, forgeWorkerInput, deps),
    });

    const rawForgeWorkerResult = await executeForgeWorker(
      buildPluginInvocationEnvelope(forgeExecutionInput, pluginContext, { workerInput: forgeWorkerInput }),
      pluginContext,
    );
    const controlResult = normalizeModuleForgeWorkerResult(config, forgeExecutionInput, rawForgeWorkerResult, { stageId: forgeStageId });
    forgeWorkerResult = extractModuleForgeWorkerLegacyResult(controlResult);
  } catch (error) {
    const reason = `Module Forge worker execution failed: ${error.message}`;
    log('ERROR', reason);
    emitTerminalModuleFailTelemetry(
      config,
      moduleId,
      status,
      mod,
      'forge',
      forgeModel,
      status?.status ?? STATUS.IN_PROGRESS,
      reason,
    );
    return {
      status,
      recalledMemoryIds,
      terminal: {
        retry: false,
        result: {
          exit: EXIT_ERROR,
          reason,
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: resolveStatusSessionKey(status),
        },
      },
    };
  }

  const result = forgeWorkerResult?.poll_result || null;
  const forgeSessionKey = resolveResultSessionKey(forgeWorkerResult, resolveStatusSessionKey(status));

  if (forgeWorkerResult?.reason === 'spawn_failed') {
    const reason = `Forge spawn failed: ${forgeWorkerResult.error}`;
    const spawnFailureGatewayLabel = resolveResultGatewayLabel(forgeWorkerResult, resolveStatusGatewayLabel(status));
    const spawnFailureSessionKey = resolveResultSessionKey(forgeWorkerResult, resolveStatusSessionKey(status));
    log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}/${maxFails}: forge agent spawn failed: ${forgeWorkerResult.error}`);
    await emitOperatorAlert(_telemetryCtx(config), 'module.operator_alert', {
      module_id: moduleId,
      phase: 'forge',
      attempt: currentAttemptNumber(status),
      gateway_label: spawnFailureGatewayLabel,
      session_key: spawnFailureSessionKey,
    }, {
      hookId: 'module.completed',
      moduleId,
      attempt: currentAttemptNumber(status),
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Module ${moduleId} — Forge Spawn Failed`,
          description: reason,
          fields: buildModuleDiscordFields({
            run_id: getRunId(config),
            module_id: moduleId,
            attempt: currentAttemptNumber(status),
            gateway_label: spawnFailureGatewayLabel,
            session_key: spawnFailureSessionKey,
          }),
        },
      },
    });
    emitTerminalModuleFailTelemetry(
      config,
      moduleId,
      status,
      mod,
      'forge',
      forgeModel,
      status?.status ?? STATUS.IN_PROGRESS,
      reason,
      {
        gatewayLabel: spawnFailureGatewayLabel,
        sessionKey: spawnFailureSessionKey,
      },
    );
    return {
      status,
      recalledMemoryIds,
      terminal: { retry: false, result: { exit: EXIT_ERROR, reason, gateway_label: spawnFailureGatewayLabel, session_key: spawnFailureSessionKey } },
    };
  }

  if (forgeWorkerResult?.reason === 'healthcheck_failed') {
    const failResult = await handleModuleFail(status, 'forge',
      'Forge agent failed health check — session not running after spawn', { recalledMemoryIds });
    return failResult._retry
      ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
      : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
  }

  if (!result.ok) {
    status = forgeWorkerResult?.status || deps.loadStatus(config, dir) || status;

    if (result.reason === 'session_ended_no_changes') {
      const transcriptState = result.transcript || null;
      const transcriptActive = transcriptShowsProgress(transcriptState);
      const transcriptField = transcriptState
        ? (transcriptActive
            ? `active (${transcriptState.eventCount} events)`
            : `stale (no activity for ${transcriptState.lastActivityPoll} polls)`)
        : 'unknown';
      const terminalDetail = typeof result.status?.detail === 'string' && result.status.detail.trim()
        ? result.status.detail.trim()
        : null;
      const forgeNoChangesBaseMsg = transcriptActive
        ? 'Forge completed without file changes (transcript shows recent activity — possible no-op session)'
        : 'Forge session ended but produced no commits — agent may have crashed or errored';
      const forgeNoChangesMsg = terminalDetail
        ? `${forgeNoChangesBaseMsg} (${terminalDetail})`
        : forgeNoChangesBaseMsg;
      await emitOperatorAlert(_telemetryCtx(config), 'module.operator_alert', {
        module_id: moduleId,
        phase: 'forge',
        attempt: currentAttemptNumber(status),
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: forgeSessionKey,
      }, {
        hookId: 'module.completed',
        moduleId,
        attempt: currentAttemptNumber(status),
        presentation: {
          discord: {
            level: 'WARN',
            title: `Module ${moduleId} — Forge no changes`,
            description: forgeNoChangesMsg,
            fields: [
              ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: forgeSessionKey }),
              { name: 'Transcript', value: transcriptField },
            ],
          },
        },
      });
      const failResult = await handleModuleFail(status, 'forge', forgeNoChangesMsg, { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }

    if (result.reason === 'timeout') {
      const failResult = await handleModuleFail(status, 'forge',
        `TIMEOUT: Forge did not complete within ${timeout} minutes`, { isTimeout: true, recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }
    if (result.reason === 'rate_limit_exhausted') {
      const rateLimitReason = 'Rate limit pauses exceeded maximum — pipeline halted';
      const forgeRateLimitExit = await finalizeModuleSessionRateLimitExit(result, {
        config,
        moduleId,
        moduleDir: dir,
        phase: 'forge',
        notifyDiscord: deps.discord,
        discordTitle: `Module ${moduleId} RATE LIMITED`,
        discordDescription: (exitResult) =>
          `Forge attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}). Pipeline cannot continue.`,
        reason: rateLimitReason,
        exit: EXIT_RATE_LIMITED,
        runIdFallback: getRunId(config),
        attemptFallback: currentAttemptNumber(status),
        gatewayLabelFallback: resolveResultGatewayLabel(forgeWorkerResult, resolveStatusGatewayLabel(status)),
        sessionKeyFallback: forgeSessionKey,
        maxPausesFallback: config.rate_limit?.max_pauses_per_module ?? 5,
        logLevel: 'ERROR',
        logMessage: `Module ${moduleId} rate limit pauses exhausted in forge phase`,
      });
      return { status, recalledMemoryIds, terminal: { retry: false, result: forgeRateLimitExit } };
    }
    if (result.reason === 'parse_corrupted') {
      const failResult = await handleModuleFail(status, 'forge',
        'status.json is permanently corrupted (unparseable after multiple attempts)', { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }
    if (result.reason === 'git_error') {
      return {
        status,
        recalledMemoryIds,
        terminal: {
          retry: false,
          result: {
            exit: EXIT_ERROR,
            reason: result.status?.message || 'Polling git sync failed closed during Forge phase',
            module: moduleId,
            module_dir: dir,
            gateway_label: resolveStatusGatewayLabel(status),
            session_key: resolveStatusSessionKey(status, forgeSessionKey),
            polling_git: result.status?.details || result.status || null,
          },
        },
      };
    }

    const failResult = await handleModuleFail(status, 'forge', deps.extractAgentFailReason(status, 'forge'), { recalledMemoryIds });
    return failResult._retry
      ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
      : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
  }

  status = forgeWorkerResult?.status || deps.loadStatus(config, dir) || status;

  if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
    const failResult = await handleModuleFail(status, 'forge', deps.extractAgentFailReason(status, 'forge'), { recalledMemoryIds });
    return failResult._retry
      ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
      : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
  }

  if (status.status !== STATUS.READY_FOR_TESTING) {
    log('WARN', `Forge finished but status is '${status.status}' instead of READY_FOR_TESTING — pipeline forcing advancement`);
    transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: 'Pipeline forced READY_FOR_TESTING: Forge completed with changes but did not update status.json',
    });
    ensureValidationState(status);
    deps.saveStatus(config, dir, status);
    await deps.discord(config, 'WARN', `Module ${moduleId} — forced READY_FOR_TESTING`,
      'Forge completed but did not update status.json. Pipeline advanced automatically.',
      buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: forgeSessionKey }),
    );
  }

  ensureValidationState(status);
  deps.saveStatus(config, dir, status);
  log('OK', 'Forge complete → READY_FOR_TESTING');
  onPhaseCompleted(_telemetryCtx(config), moduleId, 'forge');

  const forgeDurationSec = computeElapsedSeconds(getPhaseStartedAt(status));
  const forgeNextStep = stages.includes('buster') ? 'Buster' : 'done (no Buster)';
  await deps.discord(config, 'OK', `Module ${moduleId} Forge complete → ${forgeNextStep}`, mod.title, [
    ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: forgeSessionKey }),
    { name: 'Forge Duration', value: formatDurationCompact(forgeDurationSec) },
    { name: 'Model', value: forgeModel },
    { name: 'Retry Budget', value: `${status.fail_count + 1}/${maxFails}` },
  ]);

  return { status, recalledMemoryIds, terminal: null };
}

export async function finalizeForgeOnlyPass({
  config,
  moduleId,
  mod,
  dir,
  status,
  stages,
  deps,
} = {}) {
  log('INFO', 'No buster in stages — promoting READY_FOR_TESTING → PASS');

  try {
    await deps.gitCommitAndPush(config, `[pipeline] Module ${moduleId}: Forge output (no buster)`, { softFail: true });
  } catch {
    // non-critical
  }

  const forgeOnlyCompletedAt = new Date().toISOString();
  transitionModuleStatus(status, STATUS.PASS, {
    note: 'Forge-only module — no Buster phase',
    now: forgeOnlyCompletedAt,
    completedAt: forgeOnlyCompletedAt,
  });
  if (status.started_at) {
    status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
  }
  status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);
  deps.saveStatus(config, dir, status);

  log('OK', `Module ${moduleId} PASS (forge-only)`);
  onModulePass(_telemetryCtx(config), moduleId, {
    title: mod.title,
    old_status: 'READY_FOR_TESTING',
    attempt: status.fail_count + 1,
    phase: 'forge',
    model: null,
    duration_seconds: status.cost?.attempt_duration_seconds ?? status.cost?.total_duration_seconds ?? 0,
    cost_estimate_usd: null,
    commit_hash: status.commit_hash || null,
    presentation: {
      discord: {
        level: 'OK',
        title: `Module ${moduleId} PASS ✓ (forge-only)`,
        description: mod.title,
        fields: [
          ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: resolveStatusSessionKey(status) }),
          { name: 'Duration', value: formatDurationCompact(status.cost.attempt_duration_seconds || status.cost.total_duration_seconds) },
          { name: 'Stages', value: stages.join(', ') },
        ],
      },
    },
  });
  setLogScope(null, null);
  getModuleStats(config).modules_completed.push(moduleId);

  return { status, terminal: { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } } };
}

export async function prepareModuleForBuster({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  maxFails,
  timeout,
  stages,
  deps,
  recalledMemoryIds = [],
} = {}) {
  const handleModuleFail = (statusValue, phase, reason, opts = {}) => (
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
  );

  if (!stages.includes('forge') && stages.includes('buster')
      && [STATUS.PENDING, STATUS.FAIL].includes(status.status)) {
    log('INFO', 'No forge in stages — promoting to READY_FOR_TESTING for buster-only run');
    const busterOnlyStartedAt = new Date().toISOString();
    if (!status.started_at) status.started_at = busterOnlyStartedAt;
    transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: 'Buster-only module — skipping Forge',
      now: busterOnlyStartedAt,
      attemptStartedAt: busterOnlyStartedAt,
    });
    ensureValidationState(status);
    deps.saveStatus(config, dir, status);
  }

  if (stages.includes('forge') && stages.includes('buster')
      && status.status === STATUS.READY_FOR_TESTING) {
    const validation = ensureValidationState(status);

    if (!validation.delivery_lint_passed) {
      const deliveryLintResult = deps.runDeliveryLintValidation(mod, dir, config);

      if (!deliveryLintResult.passed) {
        const reason = deps.formatValidationFailures(deliveryLintResult.failures);
        log('WARN', `Module ${moduleId} delivery lint failed — aborting before Buster dispatch`);
        await deps.discord(config, 'WARN', `Module ${moduleId} DELIVERY LINT FAIL`,
          `Deterministic artifact inconsistency detected after Forge. Retrying without Buster.`, [
            ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: resolveStatusSessionKey(status) }),
            { name: 'Stage', value: 'delivery_lint' },
            { name: 'Issues', value: String(deliveryLintResult.failures.length) },
            { name: 'Codes', value: deliveryLintResult.failures.map(f => f.code).join(', ') },
          ]);
        const failResult = await handleModuleFail(status, 'delivery_lint', reason, { recalledMemoryIds });
        return failResult._retry
          ? { status, terminal: buildRetryResult(failResult, status) }
          : { status, terminal: { retry: false, result: failResult } };
      }

      markValidationPassed(status, 'delivery_lint_passed');
      deps.saveStatus(config, dir, status);
    }

    if (!validation.pre_check_passed) {
      const preCheck = await deps.runPreCheck(config, dir, status, moduleId);
      if (!preCheck.passed) {
        const precheckReason = preCheck.summary || preCheck.error || 'Pre-check failed';
        log('WARN', `Module ${moduleId} pre-check failed — retrying Forge before Buster dispatch`);
        await deps.discord(config, 'WARN', `Module ${moduleId} PRE-CHECK FAIL`, precheckReason.slice(0, 500), [
          ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: resolveStatusSessionKey(status) }),
          { name: 'Stage', value: 'pre_check' },
          ...(preCheck.report?.summary ? [{
            name: 'Lint',
            value: `${preCheck.report.summary.total_errors} errors / ${preCheck.report.summary.total_warnings} warnings`,
          }] : []),
        ]);
        const failResult = await handleModuleFail(status, 'pre_check', precheckReason, { recalledMemoryIds });
        return failResult._retry
          ? { status, terminal: buildRetryResult(failResult, status) }
          : { status, terminal: { retry: false, result: failResult } };
      }

      markValidationPassed(status, 'pre_check_passed');
      deps.saveStatus(config, dir, status);
    }
  }

  const validation = ensureValidationState(status);
  if (stages.includes('forge') && stages.includes('buster')
      && status.status === STATUS.READY_FOR_TESTING
      && (!validation.delivery_lint_passed || !validation.pre_check_passed)) {
    return {
      status,
      terminal: {
        retry: false,
        result: {
          exit: EXIT_ERROR,
          reason: 'Validation milestones missing before Buster dispatch — refusing to continue',
          module: moduleId,
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: resolveStatusSessionKey(status),
        },
      },
    };
  }

  if (stages.includes('buster')
      && (status.status === STATUS.READY_FOR_TESTING
        || (status.status === STATUS.TESTING && status.current_phase === 'buster'))) {
    try {
      await deps.gitSyncBeforeBuster(config, dir, status);
      deps.saveStatus(config, dir, status);
    } catch (e) {
      log('ERROR', `Git sync before Buster failed: ${e.message}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'git_sync', null, status?.status ?? STATUS.READY_FOR_TESTING, e.message);
      return {
        status,
        terminal: {
          retry: false,
          result: {
            exit: EXIT_ERROR,
            reason: e.message,
            gateway_label: resolveStatusGatewayLabel(status),
            session_key: resolveStatusSessionKey(status),
          },
        },
      };
    }
  }

  return { status, terminal: null };
}
