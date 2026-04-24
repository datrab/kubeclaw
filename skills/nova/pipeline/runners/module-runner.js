// runners/module-runner.js — Module execution runner
//
// Module state machine:
//
//   PENDING ──► blueprint release ──► IN_PROGRESS
//                                          │
//                                    [FORGE PHASE]
//                                    spawn Forge agent
//                                    poll READY_FOR_TESTING / FAIL / BLOCKED
//                                          │
//                                  READY_FOR_TESTING
//                                          │
//                                    [PRE-CHECK]  (forge+buster only)
//                                    tsc / ruff / shellcheck
//                                    on fail → handleFail → Forge retry
//                                          │
//                                    [GIT SYNC]
//                                    commit + pull before Buster
//                                          │
//                                   [BUSTER PHASE]
//                                    dispatch Buster subagent
//                                    poll PASS / FAIL / BLOCKED
//                                          │
//                              ┌───────────┴───────────┐
//                            PASS                  FAIL / BLOCKED
//                              │                       │
//                           EXIT_OK              handleFail → retry
//                                                (up to max_fails)
//                                                    │
//                                              BLOCKED → EXIT_BLOCKED

import fs from 'fs';
import path from 'path';
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.js';
import { transcriptShowsProgress } from '../../../common/pipeline/agents/acp-monitor.js';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_RATE_LIMITED } from '../core/constants.js';
import { log, getActiveContext } from '../core/logger.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { statusPath } from '../core/paths.js';
import { resolveModel, validateBusterConfig, resolvePolicy, logEffectivePolicy } from '../core/config.js';
import { requireStageHandler } from '../core/registry.js';
import { headHash, invalidateHeadHash } from '../core/git.js';
import { loadStatus, saveStatus, initStatus, savePrompt, saveStreamLog } from '../services/status-store.js';
import { releaseBlueprint } from '../services/blueprint.js';
import { handleFail, extractAgentFailReason, extractPreTestFailReason, getFailedSuiteNames, classifyPreTestFailure, getPassedSuiteNames, buildPreTestDiscordFields } from '../services/failures.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
  resolveResultAttempt,
} from '../services/correlation.js';
import { sleep, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery, archiveModuleCompletions } from '../services/polling.js';
import { finalizeModuleSessionRateLimitExit } from '../services/rate-limit.js';
import { modelToHarness } from '../../../common/pipeline/agents/runtime.js';
import {
  acpLabel,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  runModuleForgeWorker,
  runModuleBusterWorker,
  extractModuleBusterWorkerLegacyResult,
} from '../agents/orchestration.js';
import { getTrackedAgent } from '../../../common/pipeline/agents/lifecycle.js';
import { setShutdownContext, clearShutdownContext } from '../agents/shutdown.js';
import { discord } from '../integrations/discord.js';
import { gitSyncBeforeBuster, gitCommitAndPush } from '../integrations/git.js';
import { buildForgePrompt } from '../prompts/forge.js';
import { buildBusterModulePrompt } from '../prompts/buster-module.js';
import { runPreCheck } from '../services/lint.js';
import { checkDependencies } from '../services/dependencies.js';
import { runPreflightValidation, runDeliveryLintValidation, formatValidationFailures } from '../services/validation.js';
import {
  startModulePhase,
  transitionModuleStatus,
  finalizeTerminalModuleState,
  markModuleBlocked,
  setModuleActiveAgent,
  clearModuleActiveAgent,
} from '../../../common/pipeline/lifecycle-state.js';
import {
  onModuleStarted,
  onModulePass,
  onModuleFail,
  onModuleBlocked,
  onPhaseStarted,
  onPhaseCompleted,
  onRetryScheduled,
  onRetryExhausted,
  onEscalated,
  emitOperatorAlert,
} from '../services/telemetry.js';
import {
  _telemetryCtx,
  buildBusterDiscordFields,
  buildModuleBusterRunInput,
  buildModuleDiscordFields,
  buildModuleWorkerPluginInvocation,
  buildTerminalBusterCrashFailEvent,
  computeElapsedSeconds,
  currentAttemptNumber,
  emitTerminalBusterCrashTelemetry,
  emitTerminalModuleFailTelemetry,
  ensureModulePluginLogDirs,
  ensureValidationState,
  formatDurationCompact,
  getAttemptStartedAt,
  getModuleStats,
  markValidationPassed,
  normalizeModuleBusterWorkerResult,
  readCorruptStatusIdentity,
  setLogScope,
  buildWorkerPluginEffects,
} from './module-runner-shared.js';
import {
  finalizeForgeOnlyPass,
  prepareModuleForBuster,
  runModuleForgePhase,
} from './module-runner-forge.js';

// Map Redis completion statuses to canonical STATUS values
function mapRedisStatus(redisStatus) {
  const map = {
    'PASS': STATUS.PASS,
    'FAIL': STATUS.FAIL,
    'ISSUES_FOUND': STATUS.FAIL,
    'BLOCKED': STATUS.BLOCKED,
    'RATE_LIMITED': STATUS.RATE_LIMITED,
  };
  return map[(redisStatus || '').toUpperCase()] || STATUS.FAIL;
}


const DEFAULT_DEPS = {
  checkDependencies,
  sleep,
  loadStatus,
  saveStatus,
  initStatus,
  savePrompt,
  saveStreamLog,
  releaseBlueprint,
  handleFail,
  extractAgentFailReason,
  extractPreTestFailReason,
  getFailedSuiteNames,
  classifyPreTestFailure,
  getPassedSuiteNames,
  buildPreTestDiscordFields,
  pollWithRateLimitRecovery,
  pollDualWithRateLimitRecovery,
  archiveModuleCompletions,
  acpLabel,
  modelToHarness,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  runModuleForgeWorker,
  runModuleBusterWorker,
  setShutdownContext,
  clearShutdownContext,
  getTrackedAgent,
  discord,
  gitSyncBeforeBuster,
  gitCommitAndPush,
  buildForgePrompt,
  buildBusterModulePrompt,
  runPreCheck,
  resolveModel,
  resolvePolicy,
  logEffectivePolicy,
  validateBusterConfig,
  headHash,
  invalidateHeadHash,
  runPreflightValidation,
  runDeliveryLintValidation,
  formatValidationFailures,
};

function getDeps(config) {
  return { ...DEFAULT_DEPS, ...(config?._testOverrides?.moduleRunner || {}) };
}

/**
 * Run a module through its full lifecycle.
 *
 * Resolves module config, checks dependencies (once before any attempt), then
 * enters the retry loop which executes the forge → precheck → buster state
 * machine via executeModuleAttempt. Each loop iteration re-reads status from
 * disk so fail_count, fail_summaries, and retry context are always fresh.
 *
 * @param {object} config    - Pipeline config
 * @param {object} progress  - Project progress
 * @param {string} moduleId  - Module identifier
 * @param {object} opts      - Options: { novaPrompt }
 * @returns {Promise<{ exit: number, [key: string]: any }>}
 */
export async function runModule(config, progress, moduleId, opts = {}) {
  const deps = getDeps(config);
  const mod = progress.modules[moduleId];
  if (!mod) throw new Error(`Module ${moduleId} not in progress.json`);

  const dir = mod.dir;
  const timeout = mod.timeout_minutes ?? config.default_timeout_minutes;
  const maxFails = mod.max_fails ?? config.default_max_fails;
  const novaPrompt = opts.novaPrompt || null;

  setLogScope(moduleId, null);

  log('STEP', `═══════════════════════════════════════════════════`);
  log('STEP', `  MODULE ${moduleId}: ${mod.title}`);
  log('STEP', `  Stages: ${(mod.stages || ['forge', 'buster']).join(' → ')}`);
  log('STEP', `═══════════════════════════════════════════════════`);

  // ── Dependencies (checked once, before any attempt) ──
  const dependencyState = deps.checkDependencies(config, progress, moduleId);
  if (!dependencyState.met) {
    const dependencyStatus = deps.loadStatus(config, dir);
    const reason = `Dependencies not met: ${dependencyState.reason}`;
    log('ERROR', `Module ${moduleId} dependencies not met: ${dependencyState.reason}`);
    emitTerminalModuleFailTelemetry(config, moduleId, dependencyStatus, mod, 'dependency_check', null, dependencyStatus?.status ?? STATUS.PENDING, reason);
    return {
      exit: EXIT_ERROR,
      reason,
      gateway_label: resolveStatusGatewayLabel(dependencyStatus),
      session_key: resolveStatusSessionKey(dependencyStatus),
    };
  }

  // ── Retry loop ──
  // Each iteration re-reads status from disk so fail_count, fail_summaries,
  // and retry context are always fresh after handleFail writes them.
  while (true) {
    const attempt = await executeModuleAttempt(
      config, progress, moduleId, mod, dir, timeout, maxFails, novaPrompt, deps
    );
    if (!attempt.retry) return attempt.result;
    log('INFO', `Retry loop continuing — attempt ${attempt.fail_count}/${maxFails}`);
    onRetryScheduled(_telemetryCtx(config), moduleId, {
      attempt: attempt.fail_count,
      max_attempts: maxFails,
      max_fails: maxFails,
      dispatch_id: resolveResultDispatchId(attempt),
      gateway_label: resolveResultGatewayLabel(attempt),
      session_key: resolveResultSessionKey(attempt),
      reason: attempt.last_fail?.summary || null,
    });
    await deps.sleep(5000); // Allow gateway to release session labels before retry
  }
}

/**
 * Execute one complete module attempt. Stages determine which phases run:
 *   ['forge', 'buster'] — full cycle (default)
 *   ['forge']           — build only, PASS after Forge
 *   ['buster']          — test only, skip Forge
 *
 * @returns {{ retry: true, fail_count: number }} - auto-retry, loop again
 * @returns {{ retry: false, result: object }}    - done (PASS, BLOCKED, EXIT_*)
 */
async function executeModuleAttempt(config, progress, moduleId, mod, dir, timeout, maxFails, novaPrompt, deps) {

  let recalledMemoryIds = [];
  const {
    saveStatus,
    discord,
    runPreflightValidation,
    formatValidationFailures,
    runDeliveryLintValidation,
    runPreCheck,
    gitSyncBeforeBuster,
    gitCommitAndPush,
    resolveModel,
    resolvePolicy,
    logEffectivePolicy,
    validateBusterConfig,
    archiveModuleCompletions,
    spawnAgent,
    killAgent,
    clearShutdownContext,
    pollDualWithRateLimitRecovery,
    buildBusterModulePrompt,
  } = deps;

  const handleModuleFail = (statusValue, phase, reason, opts = {}) => (
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
  );
  const buildRetryResult = (failResult, statusValue) => ({
    retry: true,
    fail_count: failResult?.fail_count ?? statusValue?.fail_count ?? 0,
    dispatch_id: resolveResultDispatchId(failResult),
    gateway_label: resolveResultGatewayLabel(failResult),
    session_key: resolveResultSessionKey(failResult),
    last_fail: failResult?.last_fail ?? null,
  });

  // ── Load or init status ──
  let status = deps.loadStatus(config, dir);

  if (status?.status === STATUS.PASS) {
    log('OK', `Module ${moduleId} already PASS — skipping`);
    return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
  }
  if (status?.status === STATUS.BLOCKED) {
    log('WARN', `Module ${moduleId} is BLOCKED — cannot proceed`);
    return {
      retry: false,
      result: {
        exit: EXIT_BLOCKED,
        reason: status?.blockedReason || status?.fail_summaries?.[status.fail_summaries.length - 1]?.summary || `Module ${moduleId} is BLOCKED`,
        module: moduleId,
        fail_count: status?.blockedFailCount ?? status?.fail_count ?? null,
        phase: status?.blockedPhase || status?.current_phase || null,
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: resolveStatusSessionKey(status),
      },
    };
  }

  // ── Release blueprint if needed ──
  // CRITICAL: Distinguish "file doesn't exist" (→ init) from "file exists but corrupt"
  // (→ error). loadStatus returns null for both cases. If status.json EXISTS on disk
  // but couldn't parse, we must NOT release a blueprint — that would overwrite
  // existing Forge output with the architecture-branch template.
  const statusFileExists = fs.existsSync(statusPath(config, dir));
  if (!status && statusFileExists) {
    const corruptStatusIdentity = readCorruptStatusIdentity(config, dir);
    const reason = `status.json for ${moduleId} exists but is unparseable (corrupt). ` +
      `Pipeline cannot safely proceed — blueprint release would overwrite existing work. ` +
      `Inspect: ${statusPath(config, dir)}`;
    log('ERROR', `status.json for ${moduleId} is corrupt — aborting to prevent data loss`);
    emitTerminalModuleFailTelemetry(config, moduleId, { ...corruptStatusIdentity, status: STATUS.PENDING }, mod, 'status_load', null, STATUS.PENDING, reason);
    return { retry: false, result: {
      exit: EXIT_ERROR,
      reason,
      module: moduleId,
      gateway_label: corruptStatusIdentity.gateway_label,
      session_key: corruptStatusIdentity.session_key,
    }};
  }
  if (!status || status.status === STATUS.PENDING) {
    try {
      await deps.releaseBlueprint(config, progress, moduleId, dir, mod.stages || ['forge', 'buster']);
    } catch (e) {
      const reason = `Blueprint release failed: ${e.message}. Nova may need to create/fix the architecture branch.`;
      log('ERROR', `Module ${moduleId}: blueprint release failed: ${e.message}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'blueprint_release', null, status?.status ?? STATUS.PENDING, reason);
      return { retry: false, result: {
        exit: EXIT_NEEDS_NOVA,
        reason,
        module: moduleId,
        resume_command: `node pipeline.js --project ${config.project} --resume`,
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: resolveStatusSessionKey(status),
      }};
    }
    if (!status) {
      status = deps.initStatus(moduleId, mod);
      deps.saveStatus(config, dir, status);
    }
  }

  // ── Determine stages and resume point ──
  // Stages control which phases run for this module.
  // Default: ['forge', 'buster'] (full build+test cycle).
  // Examples: ['forge'] = build only, ['buster'] = test only.
  const stages = mod.stages || ['forge', 'buster'];
  ensureValidationState(status);

  log('INFO', `Module ${moduleId}: entering attempt (status=${status?.status || 'NEW'}, ` +
    `fail_count=${status?.fail_count || 0}, stages=${stages.join('+')})`);

  const needsForge = stages.includes('forge')
    && [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.FAIL].includes(status.status)
    && status.current_phase !== 'buster';
  const needsBuster = stages.includes('buster')
    && (status.status === STATUS.READY_FOR_TESTING
      || (status.status === STATUS.TESTING && status.current_phase === 'buster'));

  // ──────────────────────────────────────────────────────────────────────────
  //  FORGE PHASE
  // ──────────────────────────────────────────────────────────────────────────
  if (needsForge) {
    const forgePhase = await runModuleForgePhase({
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
      recalledMemoryIds,
    });
    status = forgePhase.status;
    recalledMemoryIds = forgePhase.recalledMemoryIds;
    if (forgePhase.terminal) return forgePhase.terminal;
  }

  if (!stages.includes('buster') && status.status === STATUS.READY_FOR_TESTING) {
    const forgeOnlyPass = await finalizeForgeOnlyPass({
      config,
      moduleId,
      mod,
      dir,
      status,
      stages,
      deps,
    });
    status = forgeOnlyPass.status;
    return forgeOnlyPass.terminal;
  }

  const busterPreparation = await prepareModuleForBuster({
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
    recalledMemoryIds,
  });
  status = busterPreparation.status;
  if (busterPreparation.terminal) return busterPreparation.terminal;

  // ──────────────────────────────────────────────────────────────────────────
  //  BUSTER PHASE
  //  Enters on READY_FOR_TESTING (normal flow) or TESTING+buster (resume after interrupt).
  // ──────────────────────────────────────────────────────────────────────────
  if (status.status === STATUS.READY_FOR_TESTING
      || (status.status === STATUS.TESTING && status.current_phase === 'buster')) {
    setLogScope(moduleId, 'buster');
    const busterPolicy = deps.resolvePolicy(config, progress, 'buster', {
      scopeModel: mod.buster_model || null,
      dispatchPath: 'redis',
    });
    const busterModel = busterPolicy.model;
    log('STEP', `Phase: BUSTER (model: ${busterModel ?? '(none)'}, thinking: not_supported_on_redis, model_source: ${busterPolicy.model_source})`);
    deps.logEffectivePolicy(config, { scope: 'module_buster', agent: 'buster', moduleId, ...busterPolicy });
    getModuleStats(config).total_buster_attempts++;
    onPhaseStarted(_telemetryCtx(config), moduleId, 'buster', busterModel);

    // Buster subagent crash retry loop.
    // Crashes (Buster-Pipeline-detected, timeouts) retry the Buster dispatch directly
    // instead of going back to Forge. Status stays at READY_FOR_TESTING.
    // Only real test failures (source: 'agent') or exhausted retries go to handleFail → Forge.
    const maxBusterCrashRetries = mod.max_buster_crash_retries ?? config.max_buster_crash_retries ?? 2;

    for (let busterAttempt = 1; busterAttempt <= maxBusterCrashRetries + 1; busterAttempt++) {
      const isLastBusterAttempt = busterAttempt > maxBusterCrashRetries;
      const completionIdentity = {
        runId: getRunId(config),
        attempt: status.fail_count + 1,
        dispatchId: `buster-module-${moduleId}-${Date.now()}-${busterAttempt}`,
        gateway_label: null,
      };

      let busterPrompt;
      {
        const promptResult = deps.buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails, completionIdentity);
        if (promptResult.error) {
          log('ERROR', `Buster prompt build failed for ${moduleId}: ${promptResult.error}`);
          emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status ?? STATUS.READY_FOR_TESTING, promptResult.error);
          return {
            retry: false,
            result: {
              exit: EXIT_ERROR,
              reason: promptResult.error,
              gateway_label: resolveStatusGatewayLabel(status),
              session_key: resolveStatusSessionKey(status),
            },
          };
        }
        busterPrompt = promptResult.prompt;
      }

      deps.savePrompt(config, dir, 'buster', status.fail_count + 1, busterPrompt);

      // ── Pre-dispatch config validation ──
      // Catches obvious config issues (missing paths, bad binaries) before wasting
      // a full Buster dispatch cycle. Only checked on first buster attempt per module
      // attempt — crash retries reuse the same config.
      if (busterAttempt === 1) {
        try {
          deps.validateBusterConfig(config);
        } catch (e) {
          const reason = `Config validation failed: ${e.message}`;
          log('ERROR', `Module ${moduleId} — ${reason}`);
          emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status ?? STATUS.READY_FOR_TESTING, reason);
          await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Config Invalid`,
            `Pre-dispatch validation caught config issues. Fix progress.json before retrying.`,
            buildBusterDiscordFields(completionIdentity, [
              { name: 'Issue', value: e.message.slice(0, 200) },
            ])
          );
          deps.clearShutdownContext();
          return { retry: false, result: {
            exit: EXIT_NEEDS_NOVA,
            reason,
            module: moduleId, module_dir: dir,
            gateway_label: resolveStatusGatewayLabel(status),
            session_key: resolveStatusSessionKey(status),
          }};
        }
      }

      const busterPhaseStartedAt = new Date().toISOString();
      startModulePhase(status, 'buster',
        `Buster started (subagent attempt ${busterAttempt}/${maxBusterCrashRetries + 1})`,
        { now: busterPhaseStartedAt, clearCompletionSummary: true });
      deps.saveStatus(config, dir, status);

      deps.setShutdownContext(config, 'buster', moduleId, dir);

      await deps.discord(config, 'INFO', `Module ${moduleId} — Buster queued`,
        `Buster work is queued. Pre-test suites run first; a Buster subagent is spawned only if critical pre-tests pass.`, [
          ...buildBusterDiscordFields({ ...completionIdentity, module_id: moduleId }),
          { name: 'Phase', value: 'buster', inline: true },
          { name: 'Queued Suites', value: (mod.test_suites || []).join(', ') || 'none', inline: true },
          { name: 'Subagent Spawned?', value: 'Not yet', inline: true },
          { name: 'Next', value: 'Watch for either suite results, a pre-test failure, or a Buster subagent spawn message.', inline: false },
        ]);

      completionIdentity.gateway_label = completionIdentity.dispatchId;

      const busterStageId = 'worker:module_buster';
      const busterExecutionInput = buildModuleBusterRunInput(config, moduleId, mod, dir, status, {
        attempt: completionIdentity.attempt,
        runId: completionIdentity.runId,
        dispatchId: completionIdentity.dispatchId,
        gatewayLabel: completionIdentity.gateway_label,
        model: busterModel,
        timeoutMinutes: timeout,
        maxFails,
        maxCrashRetries: maxBusterCrashRetries,
        busterAttempt,
      });
      const busterWorkerInput = {
        ...busterExecutionInput,
        moduleId,
        moduleDir: dir,
        timeoutMinutes: timeout,
        model: busterModel,
        prompt: busterPrompt,
        status,
        runId: completionIdentity.runId,
        attempt: completionIdentity.attempt,
        dispatchId: completionIdentity.dispatchId,
        onDispatched: async (dispatch = {}) => {
          completionIdentity.dispatchId = dispatch.dispatch_id || completionIdentity.dispatchId;
          completionIdentity.gateway_label = dispatch.gateway_label || completionIdentity.dispatchId;
          setModuleActiveAgent(status, {
            session_key: dispatch.session_key || null,
            stream_log_path: dispatch.stream_log_path || null,
            label: dispatch.dispatch_id || completionIdentity.dispatchId,
            gateway_label: dispatch.gateway_label || completionIdentity.dispatchId,
            dispatch_id: dispatch.dispatch_id || completionIdentity.dispatchId,
            run_id: dispatch.run_id || completionIdentity.runId,
            attempt: completionIdentity.attempt,
            runtime: dispatch.runtime || null,
            model: busterModel,
            agent_id: dispatch.agent_id || null,
            phase: 'buster',
            started_at: new Date().toISOString(),
          });
          deps.saveStatus(config, dir, status);
        },
        onFinalized: async ({ status: finalizedStatus = null, session_key: finalizedSessionKey = null } = {}) => {
          status = finalizedStatus || deps.loadStatus(config, dir) || status;
          busterSessionKey = finalizedSessionKey || status.active_agent?.session_key || null;
          clearModuleActiveAgent(status);
          deps.saveStatus(config, dir, status);
        },
      };

      let executeBusterWorker;
      let busterOwnerRecord;
      let busterSessionKey = null;
      let busterWorkerResult;
      try {
        ({ handler: executeBusterWorker, record: busterOwnerRecord } = requireStageHandler(config, 'worker.execute', busterStageId, 'execute'));
        ensureModulePluginLogDirs(config);
        const pluginContext = createPluginContext({
          config,
          progress,
          hookFamily: 'worker.execute',
          stageId: busterStageId,
          record: busterOwnerRecord,
          invocation: buildModuleWorkerPluginInvocation(moduleId, status, busterStageId, {
            attempt: completionIdentity.attempt,
            dispatchId: completionIdentity.dispatchId,
          }),
          stateSnapshot: async () => busterExecutionInput.stateSnapshot,
          environmentMetadata: {
            moduleId,
            phase: 'buster',
            workerType: 'module_buster',
            model: busterModel,
            dispatchId: completionIdentity.dispatchId,
          },
          effects: buildWorkerPluginEffects(config, progress, busterStageId, busterWorkerInput, deps),
        });

        const rawBusterWorkerResult = await executeBusterWorker(
          buildPluginInvocationEnvelope(busterExecutionInput, pluginContext, { workerInput: busterWorkerInput }),
          pluginContext,
        );
        const controlResult = normalizeModuleBusterWorkerResult(config, busterExecutionInput, rawBusterWorkerResult, { stageId: busterStageId });
        busterWorkerResult = extractModuleBusterWorkerLegacyResult(controlResult);
      } catch (error) {
        const reason = `Module Buster worker execution failed: ${error.message}`;
        log('ERROR', reason);
        emitTerminalModuleFailTelemetry(
          config,
          moduleId,
          status,
          mod,
          'buster',
          busterModel,
          status?.status ?? STATUS.READY_FOR_TESTING,
          reason,
          {
            dispatchId: completionIdentity.dispatchId,
            gatewayLabel: completionIdentity.gateway_label,
            sessionKey: busterSessionKey,
          },
        );
        return {
          retry: false,
          result: {
            exit: EXIT_ERROR,
            reason,
            dispatch_id: completionIdentity.dispatchId,
            gateway_label: completionIdentity.gateway_label,
            session_key: busterSessionKey,
          },
        };
      }

      let result = busterWorkerResult?.poll_result || null;
      completionIdentity.dispatchId = busterWorkerResult?.dispatch_id || completionIdentity.dispatchId;
      completionIdentity.gateway_label = busterWorkerResult?.gateway_label || completionIdentity.dispatchId;

      if (busterWorkerResult?.reason === 'spawn_failed') {
        const reason = `Buster spawn failed: ${busterWorkerResult.error}`;
        log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}/${maxFails}: buster agent spawn failed: ${busterWorkerResult.error}`);
        const spawnFailureGatewayLabel = resolveResultGatewayLabel(busterWorkerResult, resolveResultGatewayLabel({ ...completionIdentity, status }, resolveStatusGatewayLabel(status)));
        const spawnFailureSessionKey = resolveResultSessionKey(busterWorkerResult, resolveResultSessionKey({ ...completionIdentity, status }));
        await emitOperatorAlert(_telemetryCtx(config), 'module.operator_alert', {
          module_id: moduleId,
          phase: 'buster',
          attempt: currentAttemptNumber(status),
          dispatch_id: completionIdentity.dispatchId,
          gateway_label: spawnFailureGatewayLabel,
          session_key: spawnFailureSessionKey,
        }, {
          hookId: 'module.completed',
          moduleId,
          attempt: currentAttemptNumber(status),
          presentation: {
            discord: {
              level: 'CRITICAL',
              title: `Module ${moduleId} — Buster Spawn Failed`,
              description: reason,
              fields: buildModuleDiscordFields({
                run_id: getRunId(config),
                module_id: moduleId,
                attempt: currentAttemptNumber(status),
                dispatch_id: completionIdentity.dispatchId,
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
          'buster',
          busterModel,
          status?.status ?? STATUS.READY_FOR_TESTING,
          reason,
          {
            dispatchId: completionIdentity.dispatchId,
            gatewayLabel: spawnFailureGatewayLabel,
            sessionKey: spawnFailureSessionKey,
          },
        );
        return { retry: false, result: { exit: EXIT_ERROR, reason, dispatch_id: completionIdentity.dispatchId, gateway_label: spawnFailureGatewayLabel, session_key: spawnFailureSessionKey } };
      }

      // ── Poll failed (timeout, parse error, etc.) ──
      if (!result.ok) {
        status = busterWorkerResult?.status || deps.loadStatus(config, dir) || status;
        const pollSessionKey = resolveResultSessionKey(result.status?._redis_entry, resolveResultSessionKey({ status: result.status }, resolveStatusSessionKey(status, busterSessionKey)));

        if (result.reason === 'rate_limit_exhausted') {
          const rateLimitReason = 'Rate limit pauses exceeded maximum during Buster phase';
          const busterRateLimitExit = await finalizeModuleSessionRateLimitExit(result, {
            config,
            moduleId,
            moduleDir: dir,
            phase: 'buster',
            notifyDiscord: deps.discord,
            discordTitle: `Module ${moduleId} RATE LIMITED (Buster)`,
            discordDescription: (exitResult) =>
              `Buster attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
            discordIdentity: completionIdentity,
            reason: rateLimitReason,
            exit: EXIT_RATE_LIMITED,
            runIdFallback: completionIdentity.runId || getRunId(config),
            attemptFallback: completionIdentity.attempt ?? currentAttemptNumber(status),
            dispatchIdFallback: completionIdentity.dispatchId,
            gatewayLabelFallback: resolveResultGatewayLabel({ ...completionIdentity, status }, resolveStatusGatewayLabel(status)),
            sessionKeyFallback: pollSessionKey,
            maxPausesFallback: config.rate_limit?.max_pauses_per_module ?? 5,
            logLevel: 'ERROR',
            logMessage: `Module ${moduleId} rate limit pauses exhausted in buster phase`,
          });
          return { retry: false, result: busterRateLimitExit };
        }
        if (result.reason === 'git_error') {
          return { retry: false, result: {
            exit: EXIT_ERROR,
            reason: result.status?.message || 'Polling git sync failed closed during Buster phase',
            module: moduleId,
            module_dir: dir,
            gateway_label: resolveResultGatewayLabel({ ...completionIdentity, status }, resolveStatusGatewayLabel(status)),
            session_key: pollSessionKey,
            polling_git: result.status?.details || result.status || null,
          }};
        }

        // Crash-retryable: timeout, parse corruption, catch-all
        if (!isLastBusterAttempt) {
          const reason = result.reason === 'timeout'
            ? `Buster timed out (${timeout}min)`
            : result.reason === 'parse_corrupted'
              ? 'status.json corrupted'
              : `Poll failed: ${result.reason}`;
          log('WARN', `Buster subagent crash (attempt ${busterAttempt}/${maxBusterCrashRetries + 1}): ${reason} — retrying Buster`);
          await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
            `${reason}. Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
            buildBusterDiscordFields({ ...completionIdentity, module_id: moduleId, session_key: pollSessionKey })
          );

          // Reset to READY_FOR_TESTING for next Buster attempt
          transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
            note: `Buster subagent crashed — retrying (${busterAttempt}/${maxBusterCrashRetries})`,
          });
          deps.saveStatus(config, dir, status);
          continue; // → next busterAttempt
        }

        // Last attempt exhausted — BLOCKED, not handleFail.
        // Buster crashing repeatedly is an infrastructure problem, not a code problem.
        // Forge can't fix it. Requires human intervention.
        log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

        const crashAttemptBudget = maxBusterCrashRetries + 1;
        const crashAttemptSuffix = crashAttemptBudget === 1 ? '' : 's';
        const crashFailReason = result.reason === 'timeout'
          ? `Buster timed out (${timeout}min)`
          : result.reason === 'parse_corrupted'
            ? 'Buster status.json corrupted'
            : `Buster subagent crash: ${result.reason || 'unknown'}`;
        const blockedTelemetryReason = `Buster crash retries exhausted after ${crashAttemptBudget} attempt${crashAttemptSuffix} (${crashFailReason})`;
        const crashDispatchId = resolveStatusDispatchId(status, completionIdentity.dispatchId);
        const crashGatewayLabel = resolveStatusGatewayLabel(status, completionIdentity.gateway_label || crashDispatchId);
        const failEvent = buildTerminalBusterCrashFailEvent(
          status,
          mod,
          busterModel,
          status.status,
          crashFailReason,
          {
            sessionKey: pollSessionKey,
            dispatchId: crashDispatchId,
            gatewayLabel: crashGatewayLabel,
          },
        );

        markModuleBlocked(
          status,
          'buster',
          `Buster subagent crashed ${maxBusterCrashRetries + 1} times without producing a test result. Infrastructure issue — Forge cannot fix this.`,
          { reason: 'buster_crash_retries_exhausted' },
        );
        deps.saveStatus(config, dir, status);
        await emitTerminalBusterCrashTelemetry(config, moduleId, failEvent, blockedTelemetryReason, crashAttemptBudget);

        await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
          `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
            ...buildBusterDiscordFields({ ...completionIdentity, module_id: moduleId, session_key: pollSessionKey }),
            { name: 'Last Reason', value: result.reason || 'unknown (no error detail available)' },
            { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
          ]);

        return { retry: false, result: {
          exit: EXIT_BLOCKED,
          reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
          module: moduleId, module_dir: dir,
          attempt: failEvent.attempt,
          dispatch_id: failEvent.dispatch_id,
          gateway_label: failEvent.gateway_label,
          session_key: pollSessionKey,
        }};
      }

      // ── Poll succeeded (terminal status reached) ──
      status = busterWorkerResult?.status || deps.loadStatus(config, dir) || status;

      // Trust Redis over stale status.json
      const redisEntry = result.status?._redis_entry;
      const completionSessionKey = resolveResultSessionKey(redisEntry, resolveResultSessionKey({ status: result.status }, resolveStatusSessionKey(status, busterSessionKey)));
      if (redisEntry?.status) {
        const redisStatus = mapRedisStatus(redisEntry.status);
        if ([STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(redisStatus) &&
            ![STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(status.status)) {
          const syncedAt = new Date().toISOString();
          const redisSource = redisEntry.source || 'redis';
          log('WARN', `status.json shows '${status.status}' but Redis says '${redisStatus}' — trusting Redis`);
          transitionModuleStatus(status, redisStatus, {
            note: `Trusted terminal status from Redis completion (${redisSource})`,
            now: syncedAt,
            completedAt: redisStatus === STATUS.PASS ? syncedAt : undefined,
            completionSummary: redisEntry.summary ?? undefined,
          });
          deps.saveStatus(config, dir, status);
        }
      }

      // ── PASS ──
      if (status.status === STATUS.PASS) {
        const passCompletedAt = new Date().toISOString();
        finalizeTerminalModuleState(status, { completedAt: passCompletedAt });
        if (status.started_at) {
          status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
        }
        status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);
        deps.saveStatus(config, dir, status);

        log('OK', `Module ${moduleId} PASS`);
        onPhaseCompleted(_telemetryCtx(config), moduleId, 'buster');
        onModulePass(_telemetryCtx(config), moduleId, {
          title: mod.title,
          old_status: 'TESTING',
          attempt: status.fail_count + 1,
          phase: 'buster',
          model: busterModel,
          duration_seconds: status.cost?.attempt_duration_seconds ?? status.cost?.total_duration_seconds ?? 0,
          cost_estimate_usd: null,
          commit_hash: status.commit_hash || null,
          presentation: {
            discord: {
              level: 'OK',
              title: `Module ${moduleId} PASS ✓`,
              description: mod.title,
              fields: [
                ...buildBusterDiscordFields({ ...completionIdentity, module_id: moduleId, session_key: completionSessionKey }),
                { name: 'Duration', value: formatDurationCompact(status.cost.attempt_duration_seconds || status.cost.total_duration_seconds) },
                { name: 'Attempts', value: `${status.fail_count + 1}` },
              ],
            },
          },
        });

        setLogScope(null, null);
        getModuleStats(config).modules_completed.push(moduleId);

        return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
      }

      // ── FAIL / BLOCKED ──
      if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
        // Classify the failure source into three categories:
        //
        //   1. INFRA CRASH — Buster Pipeline timeout, process death, no test output
        //      → Buster retry (same Forge output), then BLOCKED if exhausted
        //
        //   2. PRE-TEST FAILURE — Buster Pipeline detected build/health/suite failure
        //      before spawning a subagent (has structured verdict with per-suite details)
        //      → First occurrence: handleFail → Forge (might be a code issue)
        //      → Repeated same suite: fast-track EXIT_NEEDS_NOVA (likely config issue)
        //
        //   3. AGENT TEST FAILURE — subagent ran tests, reported FAIL
        //      → handleFail → Forge retry (normal flow)

        const source = redisEntry?.source || 'unknown';
        const isFromBusterPipeline = /(?:^|-)(?:orchestrator|buster-pipeline)/i.test(source);
        const hasPreTestVerdict = isFromBusterPipeline && !!redisEntry?.verdict;
        const isCrash = isFromBusterPipeline && !hasPreTestVerdict;

        // ── Category 1: Infrastructure crash ──
        if (isCrash && !isLastBusterAttempt) {
          log('WARN', `Buster subagent crashed (source: ${source}, attempt ${busterAttempt}/${maxBusterCrashRetries + 1}) — retrying Buster`);
          await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
            `Subagent crashed (source: ${source}). Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
            buildBusterDiscordFields({ ...completionIdentity, module_id: moduleId, session_key: completionSessionKey })
          );

          // Reset to READY_FOR_TESTING — don't count as fail_count (that's for Forge retries)
          transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
            note: `Buster subagent crashed (source: ${source}) — retrying (${busterAttempt}/${maxBusterCrashRetries})`,
          });
          deps.saveStatus(config, dir, status);
          continue; // → next busterAttempt
        }

        if (isCrash) {
          // Crash retries exhausted → BLOCKED (infrastructure issue)
          log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

          const crashAttemptBudget = maxBusterCrashRetries + 1;
          const crashAttemptSuffix = crashAttemptBudget === 1 ? '' : 's';
          const crashFailReason = `Buster subagent crashed (${source})`;
          const blockedTelemetryReason = `Buster crash retries exhausted after ${crashAttemptBudget} attempt${crashAttemptSuffix} (${source})`;
          const crashDispatchId = resolveStatusDispatchId(status, completionIdentity.dispatchId);
          const crashGatewayLabel = resolveStatusGatewayLabel(status, completionIdentity.gateway_label || crashDispatchId);
          const failEvent = buildTerminalBusterCrashFailEvent(
            status,
            mod,
            busterModel,
            'TESTING',
            crashFailReason,
            {
              sessionKey: completionSessionKey,
              dispatchId: crashDispatchId,
              gatewayLabel: crashGatewayLabel,
            },
          );

          markModuleBlocked(
            status,
            'buster',
            `Buster subagent crashed ${maxBusterCrashRetries + 1} times (source: ${source}). Infrastructure issue — Forge cannot fix this.`,
            { reason: 'buster_infra_crash_retries_exhausted' },
          );
          deps.saveStatus(config, dir, status);

          await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
            `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
              ...buildBusterDiscordFields({ ...completionIdentity, module_id: moduleId, session_key: completionSessionKey }),
              { name: 'Source', value: source },
              { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
            ]);
          await emitTerminalBusterCrashTelemetry(config, moduleId, failEvent, blockedTelemetryReason, crashAttemptBudget);

          return { retry: false, result: {
            exit: EXIT_BLOCKED,
            reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
            module: moduleId, module_dir: dir,
            attempt: failEvent.attempt,
            dispatch_id: failEvent.dispatch_id,
            gateway_label: failEvent.gateway_label,
            session_key: resolveStatusSessionKey(status, completionSessionKey),
          }};
        }

        // ── Category 2: Pre-test failure (Buster Pipeline with verdict) ──
        if (hasPreTestVerdict) {
          const failedSuiteNames = deps.getFailedSuiteNames(redisEntry);
          const passedSuiteNames = deps.getPassedSuiteNames(redisEntry);
          const preTestReason = deps.extractPreTestFailReason(redisEntry);
          const preTestClass = deps.classifyPreTestFailure(redisEntry);
          const preTestFields = deps.buildPreTestDiscordFields(redisEntry);

          log('WARN', `Pre-test failure [${preTestClass.kind}/${preTestClass.code}]: ${preTestReason} (suites: ${failedSuiteNames.join(',') || 'unknown'})`);

          if (preTestClass.kind === 'infra' || preTestClass.kind === 'config') {
            transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
              note: `Buster pre-test ${preTestClass.kind} issue: ${preTestClass.summary}`,
            });
            deps.saveStatus(config, dir, status);

            const preTestDispatchId = resolveResultDispatchId(
              result.status?._redis_entry,
              resolveStatusDispatchId(status, completionIdentity.dispatchId),
            );
            const preTestGatewayLabel = resolveResultGatewayLabel(
              result.status?._redis_entry,
              resolveResultGatewayLabel({ ...completionIdentity, status }, resolveStatusGatewayLabel(status, preTestDispatchId)),
            );
            const preTestSessionKey = resolveResultSessionKey(
              result.status?._redis_entry,
              resolveStatusSessionKey(status, completionSessionKey),
            );

            await deps.discord(
              config,
              preTestClass.kind === 'infra' ? 'CRITICAL' : 'WARN',
              `Module ${moduleId} — ${preTestClass.kind === 'infra' ? 'Buster Infra Issue' : 'Buster Config Issue'}`,
              `${preTestClass.summary}. Forge output preserved; fix the ${preTestClass.kind === 'infra' ? 'test environment' : 'test config'} and resume Buster.`,
              [
                ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), dispatch_id: preTestDispatchId, gateway_label: preTestGatewayLabel, session_key: preTestSessionKey }),
                { name: 'Classification', value: preTestClass.summary, inline: false },
                ...preTestFields,
                { name: 'Action', value: preTestClass.kind === 'infra' ? 'Fix Buster / registry / sandbox infra, then --resume' : 'Fix progress.json test_config / test_suites / serve, then --resume', inline: false },
                { name: 'Reason', value: preTestReason.slice(0, 1024), inline: false },
              ],
            );

            emitTerminalModuleFailTelemetry(
              config,
              moduleId,
              status,
              mod,
              'buster',
              busterModel,
              status?.status ?? STATUS.TESTING,
              `Buster ${preTestClass.kind} issue (${preTestClass.code}) — Forge output preserved: ${preTestClass.detail}`,
              {
                dispatchId: preTestDispatchId,
                gatewayLabel: preTestGatewayLabel,
                sessionKey: preTestSessionKey,
              },
            );

            return { retry: false, result: {
              exit: EXIT_NEEDS_NOVA,
              reason: `Buster ${preTestClass.kind} issue (${preTestClass.code}) — Forge output preserved: ${preTestClass.detail}`,
              module: moduleId, module_dir: dir,
              dispatch_id: preTestDispatchId,
              gateway_label: preTestGatewayLabel,
              session_key: preTestSessionKey,
              failed_suites: failedSuiteNames,
              passed_suites: passedSuiteNames,
              forge_preserved: true,
              pretest_classification: preTestClass,
            }};
          }

          // Check if same suite(s) already failed as pre-test in a previous attempt.
          const previousPreTestFails = (status.fail_summaries || [])
            .filter(s => typeof s === 'object' && typeof s.summary === 'string'
                      && s.summary.startsWith('[buster/pre-test]'));

          const isRepeatedPreTestFail = failedSuiteNames.length > 0
            && previousPreTestFails.some(prev =>
              failedSuiteNames.some(suite => prev.summary.includes(suite))
            );

          if (isRepeatedPreTestFail) {
            log('ERROR', `Module ${moduleId}: repeated pre-test failure in ${failedSuiteNames.join(',')} — escalating without another Forge cycle`);

            const repeatedPreTestDispatchId = resolveResultDispatchId(
              result.status?._redis_entry,
              resolveStatusDispatchId(status, completionIdentity.dispatchId),
            );
            const repeatedPreTestGatewayLabel = resolveResultGatewayLabel(
              result.status?._redis_entry,
              resolveResultGatewayLabel({ ...completionIdentity, status }, resolveStatusGatewayLabel(status, repeatedPreTestDispatchId)),
            );
            const repeatedPreTestSessionKey = resolveResultSessionKey(
              result.status?._redis_entry,
              resolveStatusSessionKey(status, completionSessionKey),
            );

            await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Repeated Pre-Test Failure`,
              `The same pre-test suite(s) failed again after a Forge retry. Stopping before another code cycle.`, [
                ...buildModuleDiscordFields({ run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), dispatch_id: repeatedPreTestDispatchId, gateway_label: repeatedPreTestGatewayLabel, session_key: repeatedPreTestSessionKey }),
                ...preTestFields,
                { name: 'Reason', value: preTestReason.slice(0, 1024), inline: false },
                { name: 'Action', value: 'Investigate deterministic test failure before resuming Forge', inline: false },
              ]);

            emitTerminalModuleFailTelemetry(
              config,
              moduleId,
              status,
              mod,
              'buster',
              busterModel,
              status?.status ?? STATUS.TESTING,
              `Repeated pre-test failure (${failedSuiteNames.join(',')}) — needs Nova review before another Forge cycle`,
              {
                dispatchId: repeatedPreTestDispatchId,
                gatewayLabel: repeatedPreTestGatewayLabel,
                sessionKey: repeatedPreTestSessionKey,
              },
            );

            return { retry: false, result: {
              exit: EXIT_NEEDS_NOVA,
              reason: `Repeated pre-test failure (${failedSuiteNames.join(',')}) — needs Nova review before another Forge cycle`,
              module: moduleId, module_dir: dir,
              dispatch_id: repeatedPreTestDispatchId,
              gateway_label: repeatedPreTestGatewayLabel,
              session_key: repeatedPreTestSessionKey,
              failed_suites: failedSuiteNames,
              passed_suites: passedSuiteNames,
              pretest_classification: preTestClass,
            }};
          }

          // Code-side pre-test failure → give Forge a chance.
          log('INFO', `Code-side pre-test failure — routing to Forge via handleFail`);
          const failResult = await handleModuleFail(status, 'buster',
            preTestReason, {
              recalledMemoryIds,
              dispatch_id: completionIdentity.dispatchId,
              gateway_label: resolveResultGatewayLabel({ ...completionIdentity, status }, resolveStatusGatewayLabel(status)),
              session_key: resolveStatusSessionKey(status, completionSessionKey),
              discordFields: [
                ...preTestFields,
                { name: 'Stage', value: 'Pre-test suites', inline: true },
                { name: 'Subagent Spawned?', value: 'No', inline: true },
              ],
            });
          if (failResult._retry) return buildRetryResult(failResult, status);
          return { retry: false, result: failResult };
        }

        // ── Category 3: Agent test failure (normal) ──
        const failResult = await handleModuleFail(status, 'buster',
          deps.extractAgentFailReason(status, 'buster'), { recalledMemoryIds, dispatch_id: completionIdentity.dispatchId, gateway_label: resolveResultGatewayLabel({ ...completionIdentity, status }, resolveStatusGatewayLabel(status)), session_key: completionSessionKey });
        if (failResult._retry) return buildRetryResult(failResult, status);
        return { retry: false, result: failResult };
      }

      // Unexpected status — break out of retry loop
      break;
    } // end busterAttempt loop
  }

  setLogScope(null, null);
  const reason = `Unexpected status: ${status?.status}`;
  log('ERROR', `Module ${moduleId} ended in unexpected status: ${status?.status}`);
  emitTerminalModuleFailTelemetry(config, moduleId, status, mod, status?.current_phase || null, status?.active_agent?.model || null, status?.status ?? null, reason);
  return { retry: false, result: {
    exit: EXIT_ERROR,
    reason,
    gateway_label: resolveStatusGatewayLabel(status),
    session_key: resolveStatusSessionKey(status),
  } };
}

export default runModule;
