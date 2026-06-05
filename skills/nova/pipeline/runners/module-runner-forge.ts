import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_RATE_LIMITED } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { requireStageHandler } from '../core/registry.ts';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from '../services/correlation.ts';
import { finalizeModuleSessionRateLimitExit } from '../services/rate-limit.ts';
import { normalizeTypedValidatorControlResult } from '../services/contracts/validator-control-result.ts';
import {
  startModulePhase,
  transitionModuleStatus,
  markModuleBlocked,
  setModuleActiveAgent,
  clearModuleActiveAgent,
} from '../lifecycle-state.ts';
import {
  onModuleStarted,
  onModulePass,
  onPhaseStarted,
  onPhaseCompleted,
  emitOperatorAlert,
} from '../services/telemetry.ts';
import {
  _telemetryCtx,
  buildModuleForgeRunInput,
  buildModuleWorkerPluginInvocation,
  buildModuleValidatorPluginInvocation,
  buildModuleValidatorRunInput,
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
  setLogScope,
  buildWorkerPluginEffects,
} from './module-runner-shared.ts';
import { runModulePreflight } from './module-runner/preflight.ts';
import { buildRetryResult } from './module-runner/terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clearForgeActiveAgentAfterWorkerFailure({ config, dir, status, deps }: AnyRecord = {}) {
  try {
    const latestStatus = deps.loadStatus(config, dir) || status;
    clearModuleActiveAgent(latestStatus);
    deps.saveStatus(config, dir, latestStatus);
    return latestStatus;
  } catch (cleanupError) {
    log('WARN', `Failed to clear Module Forge active agent after worker failure: ${errorMessage(cleanupError)}`);
    return status;
  }
}

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

function workerTypedMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  const typedWorker = workerTypedWorker(controlResult);
  return typedWorker.metadata && typeof typedWorker.metadata === 'object'
    ? typedWorker.metadata
    : {};
}

function workerTypedWorker(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.typed?.worker && typeof controlResult.diagnostics.typed.worker === 'object'
    ? controlResult.diagnostics.typed.worker
    : {};
}

function workerOutcomeClass(controlResult: AnyRecord | null = null): string | null {
  const typedWorker = workerTypedWorker(controlResult);
  const outcomeClass = typedWorker.outcomeClass ?? typedWorker.metadata?.outcomeClass;
  return typeof outcomeClass === 'string' && outcomeClass.trim() ? outcomeClass.trim() : null;
}

function workerSummary(controlResult: AnyRecord | null = null): string | null {
  const summary = controlResult?.diagnostics?.summary;
  return typeof summary === 'string' && summary.trim() ? summary.trim() : null;
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
}: AnyRecord = {}) {
  const handleModuleFail = (statusValue: AnyRecord, phase: string, reason: string, opts: AnyRecord = {}) => (
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
  );

  setLogScope(moduleId, 'forge');
  ensureValidationState(status);

  const preflight = await runModulePreflight({
    config,
    progress,
    moduleId,
    mod,
    dir,
    status,
    maxFails,
    deps,
    recalledMemoryIds,
  } as AnyRecord);
  if (preflight.terminal) return { status: preflight.status, recalledMemoryIds, terminal: preflight.terminal };

  const forgePolicy = deps.resolvePolicy(config, progress, 'forge', {
    scopeModel: mod.forge_model,
    scopeThinking: mod.thinking_level?.forge || null,
    dispatchPath: 'acp',
  });
  const forgeModel = forgePolicy.model;
  const forgeHarness = deps.modelToHarness(forgeModel) || config.agents?.forge?.acp_agent_id;
  if (!forgeHarness) throw new Error('Forge ACP dispatch requires explicit agents.forge.acp_agent_id or model harness mapping');
  log('STEP', `Phase: FORGE (harness: ${forgeHarness}, model: ${forgeModel ?? '(none)'}, thinking: ${forgePolicy.thinking ?? 'default'}, model_source: ${forgePolicy.model_source})`);
  deps.logEffectivePolicy(config, { scope: 'module_forge', agent: 'forge', moduleId, ...forgePolicy });
  getModuleStats(config).total_forge_attempts++;
  await onModuleStarted(_telemetryCtx(config, deps._explicitDeps), moduleId, forgeModel, currentAttemptNumber(status), {
    presentation: {
      discord: {
        level: 'INFO',
        title: `Module ${moduleId} started`,
        description: mod.title,
        fields: [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status) }),
          { name: 'Model', value: forgeModel },
          { name: 'Harness', value: forgeHarness },
          { name: 'Retry Budget', value: `${status.fail_count + 1}/${maxFails}` },
        ],
      },
    },
  });
  onPhaseStarted(_telemetryCtx(config, deps._explicitDeps), moduleId, 'forge', forgeModel);

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
  const forgeStartTransition = startModulePhase(status, 'forge', `Forge started (${forgeHarness})`, { now: forgeAttemptStartedAt });
  status.validation = {
    attempt: currentAttemptNumber(status),
    delivery_lint_passed: false,
    delivery_lint_passed_at: null,
    pre_check_passed: false,
    pre_check_passed_at: null,
  };
  deps.saveStatus(config, dir, status, forgeStartTransition);

  deps.setShutdownContext(config, 'forge', moduleId, dir);
  deps.invalidateHeadHash(config);
  const headBeforeForge = deps.headHash(config);
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
    onDispatched: async (dispatch: AnyRecord = {}) => {
      setModuleActiveAgent(status, {
        session_key: dispatch.session_key || null,
        stream_log_path: dispatch.stream_log_path || null,
        label: forgeSessionLabel,
        gateway_label: dispatch.gateway_label || null,
        dispatch_id: dispatch.dispatch_id || null,
        run_id: dispatch.run_id || config?._runId || config?.run_id || null,
        attempt: currentAttemptNumber(status),
        runtime: dispatch.runtime || null,
        model: forgeModel,
        agent_id: dispatch.agent_id || forgeHarness,
        phase: 'forge',
        started_at: new Date().toISOString(),
      });
      deps.saveStatus(config, dir, status);
    },
    onFinalized: async ({ status: finalizedStatus = null }: AnyRecord = {}) => {
      status = finalizedStatus || deps.loadStatus(config, dir) || status;
      clearModuleActiveAgent(status);
      deps.saveStatus(config, dir, status);
    },
  };

  let executeForgeWorker;
  let forgeOwnerRecord;
  let forgeWorkerControlResult: AnyRecord | null = null;
  try {
    ({ handler: executeForgeWorker, record: forgeOwnerRecord } = requireStageHandler(config, 'worker.execute', forgeStageId, 'execute'));
    ensureModulePluginLogDirs(config);
    const pluginInvocation = buildModuleWorkerPluginInvocation(moduleId, status, forgeStageId, {
      attempt: currentAttemptNumber(status),
    });
    const pluginContext = createPluginContext({
      config,
      progress,
      hookFamily: 'worker.execute',
      stageId: forgeStageId,
      record: forgeOwnerRecord,
      invocation: pluginInvocation,
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

    const rawForgeWorkerResult: unknown = await executeForgeWorker(
      buildPluginInvocationEnvelope(forgeExecutionInput, pluginContext, { workerInput: forgeWorkerInput }),
      pluginContext,
    );
    const controlResult = normalizeModuleForgeWorkerResult(config, forgeExecutionInput, rawForgeWorkerResult, { stageId: forgeStageId, moduleId: forgeOwnerRecord.manifest.moduleId, pluginInvocation });
    forgeWorkerControlResult = controlResult;
  } catch (error) {
    const reason = `Module Forge worker execution failed: ${errorMessage(error)}`;
    log('ERROR', reason);
    const failureGatewayLabel = status?.active_agent?.gateway_label ?? resolveStatusGatewayLabel(status);
    const failureSessionKey = status?.active_agent?.session_key ?? resolveStatusSessionKey(status);
    status = clearForgeActiveAgentAfterWorkerFailure({ config, dir, status, deps });
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
        gatewayLabel: failureGatewayLabel,
        sessionKey: failureSessionKey,
      },
    );
    return {
      status,
      recalledMemoryIds,
      terminal: {
        retry: false,
        result: {
          exit: EXIT_ERROR,
          reason,
          gateway_label: failureGatewayLabel,
          session_key: failureSessionKey,
          ...((error as AnyRecord)?.diagnostics ? { diagnostics: { contract_invalid: true, contract_diagnostic: (error as AnyRecord).diagnostics } } : {}),
        },
      },
    };
  }

  const forgeWorkerMetadata = workerMetadata(forgeWorkerControlResult);
  const forgeWorkerTypedMetadata = workerTypedMetadata(forgeWorkerControlResult);
  const forgeWorkerSummary = workerSummary(forgeWorkerControlResult);
  const result = forgeWorkerMetadata.poll_result || null;
  const resultStatus = result?.status || null;
  const forgeFinalStatus = forgeWorkerMetadata.final_status || null;
  const workerReason = forgeWorkerMetadata.reason || result?.reason || workerOutcomeClass(forgeWorkerControlResult) || forgeWorkerTypedMetadata.outcomeClass || null;
  const forgeSessionKey = (forgeWorkerMetadata.session_key ?? resolveStatusSessionKey(status));

  if (workerReason === 'spawn_failed') {
    const reason = `Forge spawn failed: ${forgeWorkerMetadata.error}`;
    const spawnFailureGatewayLabel = (forgeWorkerMetadata.gateway_label ?? resolveStatusGatewayLabel(status));
    const spawnFailureSessionKey = (forgeWorkerMetadata.session_key ?? resolveStatusSessionKey(status));
    log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}/${maxFails}: forge agent spawn failed: ${forgeWorkerMetadata.error}`);
    await emitOperatorAlert(_telemetryCtx(config, deps._explicitDeps), 'module.operator_alert', {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
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

  if (workerReason === 'healthcheck_failed') {
    const failResult = await handleModuleFail(status, 'forge',
      'Forge agent failed health check — session not running after spawn', { recalledMemoryIds });
    return failResult._retry
      ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
      : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
  }

  if (forgeWorkerControlResult?.nextAction !== 'pass') {
    status = forgeFinalStatus || deps.loadStatus(config, dir) || status;

    const forgeNoWorkReasons = new Set([
      'session_ended_no_changes',
      'agent_ended_no_meaningful_diff',
      'session_ended_no_meaningful_diff',
    ]);
    if (forgeNoWorkReasons.has(workerReason)) {
      const terminalDetail = typeof resultStatus?.detail === 'string' && resultStatus.detail.trim()
        ? resultStatus.detail.trim()
        : null;
      const forgeNoChangesBaseMsg = 'Forge session ended but produced no typed meaningful-diff completion evidence';
      const forgeNoChangesMsg = terminalDetail
        ? `${forgeNoChangesBaseMsg} (${terminalDetail})`
        : forgeNoChangesBaseMsg;
      await emitOperatorAlert(_telemetryCtx(config, deps._explicitDeps), 'module.operator_alert', {
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
              ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: forgeSessionKey }),
            ],
          },
        },
      });
      const failResult = await handleModuleFail(status, 'forge', forgeNoChangesMsg, { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }

    if (workerReason === 'timeout') {
      const failResult = await handleModuleFail(status, 'forge',
        `TIMEOUT: Forge did not complete within ${timeout} minutes`, { isTimeout: true, recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }
    if (workerReason === 'rate_limit_exhausted') {
      const rateLimitReason = 'Rate limit pauses exceeded maximum — pipeline halted';
      const forgeRateLimitExit = await finalizeModuleSessionRateLimitExit(result, {
        config,
        moduleId,
        moduleDir: dir,
        phase: 'forge',
        notifyDiscord: deps.discord,
        discordTitle: `Module ${moduleId} RATE LIMITED`,
        discordDescription: (exitResult: AnyRecord) =>
          `Forge attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}). Pipeline cannot continue.`,
        reason: rateLimitReason,
        exit: EXIT_RATE_LIMITED,
        identity: {
          run_id: getRunId(config),
          attempt: currentAttemptNumber(status),
          gateway_label: (forgeWorkerMetadata.gateway_label ?? resolveStatusGatewayLabel(status)),
          session_key: forgeSessionKey,
        },
        maxPauses: config.rate_limit.max_pauses_per_module,
        logLevel: 'ERROR',
        logMessage: `Module ${moduleId} rate limit pauses exhausted in forge phase`,
      } as AnyRecord);
      return { status, recalledMemoryIds, terminal: { retry: false, result: forgeRateLimitExit } };
    }
    if (workerReason === 'invalid_forge_completion') {
      const detail = Array.isArray(resultStatus?.errors) && resultStatus.errors.length > 0
        ? resultStatus.errors.join('; ')
        : 'invalid Forge completion artifact';
      const failResult = await handleModuleFail(status, 'forge', detail, { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }
    if (workerReason === 'parse_corrupted') {
      const failResult = await handleModuleFail(status, 'forge',
        'Forge completion artifact is permanently corrupted (unparseable after multiple attempts)', { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
    }
    if (workerReason === 'git_error') {
      return {
        status,
        recalledMemoryIds,
        terminal: {
          retry: false,
          result: {
            exit: EXIT_ERROR,
            reason: resultStatus?.message || 'Polling git sync failed closed during Forge phase',
            module: moduleId,
            module_dir: dir,
            gateway_label: resolveStatusGatewayLabel(status),
            session_key: (resolveStatusSessionKey(status) ?? forgeSessionKey ?? null),
            polling_git: resultStatus?.details || resultStatus || null,
          },
        },
      };
    }

    const failReason = resultStatus?.detail
      || resultStatus?.reason
      || resultStatus?.message
      || forgeWorkerSummary
      || workerReason
      || 'Forge completion artifact was not produced';
    const failResult = await handleModuleFail(status, 'forge', failReason, { recalledMemoryIds });
    return failResult._retry
      ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
      : { status, recalledMemoryIds, terminal: { retry: false, result: failResult } };
  }

  const forgeCompletionReasons = new Set([
    'forge_completion',
    'agent_ended_meaningful_diff',
    'session_ended_meaningful_diff',
  ]);
  const typedPassForgeCompletion = workerReason === 'passed'
    ? {
        status: STATUS.READY_FOR_TESTING,
        summary: forgeWorkerSummary || 'Forge worker passed',
      }
    : null;
  const forgeCompletion = forgeCompletionReasons.has(workerReason)
    ? (resultStatus || forgeFinalStatus)
    : typedPassForgeCompletion;

  if (forgeCompletion?.status === STATUS.BLOCKED) {
    const blockedAt = new Date().toISOString();
    const blockedTransition = markModuleBlocked(status, 'forge', forgeCompletion.summary, {
      reason: forgeCompletion.summary,
      now: blockedAt,
      clearActiveAgent: true,
    });
    deps.saveStatus(config, dir, status, blockedTransition);
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'forge', forgeModel, STATUS.BLOCKED, forgeCompletion.summary);
    return {
      status,
      recalledMemoryIds,
      terminal: {
        retry: false,
        result: {
          exit: EXIT_BLOCKED,
          reason: forgeCompletion.summary,
          module: moduleId,
          module_dir: dir,
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: forgeSessionKey,
        },
      },
    };
  }

  if (forgeCompletion?.status !== STATUS.READY_FOR_TESTING) {
    const reason = `Unexpected Forge completion result: ${result?.reason || 'unknown'}`;
    log('ERROR', reason);
    return {
      status,
      recalledMemoryIds,
      terminal: {
        retry: false,
        result: {
          exit: EXIT_ERROR,
          reason,
          module: moduleId,
          module_dir: dir,
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: forgeSessionKey,
        },
      },
    };
  }

  const forgeReadyTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
    note: `Forge completion evidence: ${forgeCompletion.summary}`,
  });

  ensureValidationState(status);
  deps.saveStatus(config, dir, status, forgeReadyTransition);
  log('OK', 'Forge completion evidence accepted → READY_FOR_TESTING');
  onPhaseCompleted(_telemetryCtx(config, deps._explicitDeps), moduleId, 'forge');

  const forgeDurationSec = computeElapsedSeconds(getPhaseStartedAt(status));
  const forgeNextStep = stages.includes('buster') ? 'Buster' : 'done (no Buster)';
  await deps.discord(config, 'OK', `Module ${moduleId} Forge complete → ${forgeNextStep}`, mod.title, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: forgeSessionKey }),
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
}: AnyRecord = {}) {
  log('INFO', 'No buster in stages — promoting READY_FOR_TESTING → PASS');

  let gitResult;
  try {
    gitResult = await deps.gitCommitAndPush(config, `[pipeline] Module ${moduleId}: Forge output (no buster)`);
  } catch (error) {
    const reason = `Forge-only module cannot PASS without durable Git persistence: ${errorMessage(error)}`;
    log('ERROR', reason);
    return { terminal: { retry: false, result: {
      exit: EXIT_ERROR,
      reason,
      module: moduleId,
      module_dir: dir,
      gateway_label: resolveStatusGatewayLabel(status),
      session_key: resolveStatusSessionKey(status),
    }} };
  }
  if (gitResult?.committed !== true) {
    const reason = `Forge-only module cannot PASS without a durable Git commit: ${gitResult?.error || 'no commit was created'}`;
    log('ERROR', reason);
    return { terminal: { retry: false, result: {
      exit: EXIT_ERROR,
      reason,
      module: moduleId,
      module_dir: dir,
      gateway_label: resolveStatusGatewayLabel(status),
      session_key: resolveStatusSessionKey(status),
    }} };
  }

  const forgeOnlyCompletedAt = new Date().toISOString();
  const forgeOnlyPassTransition = transitionModuleStatus(status, STATUS.PASS, {
    note: 'Forge-only module — no Buster phase',
    now: forgeOnlyCompletedAt,
    completedAt: forgeOnlyCompletedAt,
  });
  status.cost ||= {};
  if (status.started_at) {
    status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
  }
  status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);
  deps.saveStatus(config, dir, status, forgeOnlyPassTransition);

  log('OK', `Module ${moduleId} PASS (forge-only)`);
  onModulePass(_telemetryCtx(config, deps._explicitDeps), moduleId, {
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
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: resolveStatusSessionKey(status) }),
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
