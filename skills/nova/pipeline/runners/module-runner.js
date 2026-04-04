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
import { readAcpTranscriptState, transcriptShowsProgress } from '../agents/acp-monitor.js';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_RATE_LIMITED } from '../core/constants.js';
import { log, getActiveContext } from '../core/logger.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { statusPath } from '../core/paths.js';
import { resolveModel, validateBusterConfig, resolvePolicy, logEffectivePolicy } from '../core/config.js';
import { headHash, invalidateHeadHash } from '../core/git.js';
import { loadStatus, saveStatus, addHistory, initStatus, savePrompt, saveStreamLog } from '../services/status-store.js';
import { releaseBlueprint } from '../services/blueprint.js';
import { handleFail, extractAgentFailReason, extractPreTestFailReason, getFailedSuiteNames } from '../services/failures.js';
import { sleep, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery, archiveModuleCompletions } from '../services/polling.js';
import { acpLabel, modelToHarness, spawnAgent, killAgent, verifyAgentAlive } from '../agents/lifecycle.js';
import { setShutdownContext, clearShutdownContext, getTrackedAgent } from '../agents/shutdown.js';
import { discord } from '../integrations/discord.js';
import { gitSyncBeforeBuster, gitCommitAndPush } from '../integrations/git.js';
import { buildForgePrompt } from '../prompts/forge.js';
import { buildBusterModulePrompt } from '../prompts/buster-module.js';
import { runPreCheck } from '../services/lint.js';
import { checkDependencies } from '../services/dependencies.js';
import { runPreflightValidation, runDeliveryLintValidation, formatValidationFailures } from '../services/validation.js';
import {
  onModuleStarted,
  onModulePass,
  onModuleFail,
  onModuleBlocked,
  onPhaseStarted,
  onPhaseCompleted,
  onRetryScheduled,
  onEscalated,
  // DEPRECATED: memory recall disabled pending improvement
  // emitMemoryRecalled,
} from '../services/telemetry.js';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

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

// Mutate the active logger context to set module/phase scope for structured log output
function setLogScope(moduleId, phase) {
  const ctx = getActiveContext();
  if (ctx) {
    if (moduleId !== undefined) ctx._logModule = moduleId;
    if (phase !== undefined) ctx._logPhase = phase;
  }
}

const DEFAULT_DEPS = {
  checkDependencies,
  sleep,
  loadStatus,
  saveStatus,
  initStatus,
  addHistory,
  savePrompt,
  saveStreamLog,
  releaseBlueprint,
  handleFail,
  extractAgentFailReason,
  extractPreTestFailReason,
  getFailedSuiteNames,
  pollWithRateLimitRecovery,
  pollDualWithRateLimitRecovery,
  archiveModuleCompletions,
  acpLabel,
  modelToHarness,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
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

function currentAttemptNumber(status) {
  return (status?.fail_count || 0) + 1;
}

function ensureValidationState(status) {
  const attempt = currentAttemptNumber(status);
  if (!status.validation || status.validation.attempt !== attempt) {
    status.validation = {
      attempt,
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    };
  }
  return status.validation;
}

function markValidationPassed(status, key) {
  const validation = ensureValidationState(status);
  validation[key] = true;
  validation[`${key}_at`] = new Date().toISOString();
}

function getModuleStats(config) {
  return getRunStats(config);
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
    log('ERROR', `Module ${moduleId} dependencies not met: ${dependencyState.reason}`);
    return { exit: EXIT_ERROR, reason: `Dependencies not met: ${dependencyState.reason}` };
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
    onRetryScheduled(_telemetryCtx(config), moduleId, attempt.fail_count, maxFails);
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
    addHistory,
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

  // ── Load or init status ──
  let status = deps.loadStatus(config, dir);

  if (status?.status === STATUS.PASS) {
    log('OK', `Module ${moduleId} already PASS — skipping`);
    return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
  }
  if (status?.status === STATUS.BLOCKED) {
    log('WARN', `Module ${moduleId} is BLOCKED — cannot proceed`);
    return { retry: false, result: { exit: EXIT_BLOCKED, reason: `Module ${moduleId} is BLOCKED`, module: moduleId } };
  }

  // ── Release blueprint if needed ──
  // CRITICAL: Distinguish "file doesn't exist" (→ init) from "file exists but corrupt"
  // (→ error). loadStatus returns null for both cases. If status.json EXISTS on disk
  // but couldn't parse, we must NOT release a blueprint — that would overwrite
  // existing Forge output with the architecture-branch template.
  const statusFileExists = fs.existsSync(statusPath(config, dir));
  if (!status && statusFileExists) {
    log('ERROR', `status.json for ${moduleId} is corrupt — aborting to prevent data loss`);
    return { retry: false, result: {
      exit: EXIT_ERROR,
      reason: `status.json for ${moduleId} exists but is unparseable (corrupt). ` +
        `Pipeline cannot safely proceed — blueprint release would overwrite existing work. ` +
        `Inspect: ${statusPath(config, dir)}`,
      module: moduleId,
    }};
  }
  if (!status || status.status === STATUS.PENDING) {
    try {
      await deps.releaseBlueprint(config, progress, moduleId, dir, mod.stages || ['forge', 'buster']);
    } catch (e) {
      log('ERROR', `Module ${moduleId}: blueprint release failed: ${e.message}`);
      return { retry: false, result: {
        exit: EXIT_NEEDS_NOVA,
        reason: `Blueprint release failed: ${e.message}. Nova may need to create/fix the architecture branch.`,
        module: moduleId,
        resume_command: `node pipeline.js --project ${config.project} --resume`,
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
    setLogScope(moduleId, 'forge');
    ensureValidationState(status);

    // ── Preflight contract validation ──
    // Check test_config references are declared in FORGE.md before spawning Forge.
    // Fails deterministically — no Forge spawn occurs if contract is inconsistent.
    {
      const preflightResult = deps.runPreflightValidation(mod, dir, config);
      if (!preflightResult.passed) {
        const reason = deps.formatValidationFailures(preflightResult.failures);
        log('WARN', `Module ${moduleId} preflight contract validation failed — aborting Forge spawn`);
        await deps.discord(config, 'WARN', `Module ${moduleId} PREFLIGHT FAIL`,
          `Contract mismatch detected before Forge spawn. Fix FORGE.md and retry.`, [
            { name: 'Stage', value: 'preflight_contract' },
            { name: 'Issues', value: String(preflightResult.failures.length) },
            { name: 'Codes', value: preflightResult.failures.map(f => f.code).join(', ') },
          ]);
        const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'preflight_contract',
          reason, { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
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
    onModuleStarted(_telemetryCtx(config), moduleId, forgeModel, currentAttemptNumber(status));
    onPhaseStarted(_telemetryCtx(config), moduleId, 'forge', forgeModel);

    // Build complete prompt with priority hierarchy and anti-pattern framing
    const promptResult = await deps.buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt);
    if (promptResult.error) {
      log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}: forge prompt assembly failed: ${promptResult.error}`);
      return { retry: false, result: { exit: EXIT_ERROR, reason: promptResult.error } };
    }
    const forgePrompt = promptResult.prompt;
    recalledMemoryIds = promptResult.recalledMemoryIds || [];
    if (recalledMemoryIds.length > 0) {
      // DEPRECATED: memory recall disabled pending improvement
      // emitMemoryRecalled(_telemetryCtx(config), moduleId, recalledMemoryIds);
    }

    deps.savePrompt(config, dir, 'forge', status.fail_count + 1, forgePrompt);

    status.status = STATUS.IN_PROGRESS;
    status.current_phase = 'forge';
    if (!status.started_at) status.started_at = new Date().toISOString();
    addHistory(status, STATUS.IN_PROGRESS, 'pipeline', `Forge started (${forgeHarness})`);
    status.validation = {
      attempt: currentAttemptNumber(status),
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    };
    deps.saveStatus(config, dir, status);

    await deps.discord(config, 'INFO', `Module ${moduleId} started`, mod.title, [
      { name: 'Model', value: forgeModel },
      { name: 'Harness', value: forgeHarness },
      { name: 'Attempt', value: `${status.fail_count + 1}/${maxFails}` },
    ]);

    deps.setShutdownContext(config, 'forge', moduleId, dir);

    // Capture HEAD before Forge starts — used for stall detection in pollStatus
    deps.invalidateHeadHash();
    const headBeforeForge = deps.headHash();
    const forgeSessionLabel = deps.acpLabel('forge', moduleId);

    // Spawn fresh Forge session
    try { await deps.spawnAgent(config, progress, 'forge', moduleId, forgeModel, forgePrompt, { thinking: forgePolicy.thinking }); }
    catch (e) {
      log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}/${maxFails}: forge agent spawn failed: ${e.message}`);
      deps.clearShutdownContext();
      return { retry: false, result: { exit: EXIT_ERROR, reason: `Forge spawn failed: ${e.message}` } };
    }

    // Early health check — catch silent spawn failures (OOM, bad model, gateway down)
    // in ~8 seconds instead of waiting the full timeout (up to 60 minutes).
    if (!(await deps.verifyAgentAlive(config, 'forge', moduleId))) {
      await deps.killAgent(config, 'forge', moduleId);
      deps.clearShutdownContext();
      const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'forge',
        'Forge agent failed health check — session not running after spawn', { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    // Poll — dual channel: status.json + ACP session state.
    // If Forge's session ends and HEAD moved, pollStatus auto-advances to READY_FOR_TESTING.
    const result = await deps.pollWithRateLimitRecovery(config, dir,
      [STATUS.READY_FOR_TESTING, STATUS.FAIL, STATUS.BLOCKED], timeout,
      { sessionLabel: forgeSessionLabel, headBefore: headBeforeForge });

    // ALWAYS destroy session — kill-and-respawn strategy
    // Graceful (wait for idle + summary) only on successful completion
    const forgeStreamPath = deps.getTrackedAgent(forgeSessionLabel)?.streamLogPath;
    await deps.killAgent(config, 'forge', moduleId, result.ok);
    deps.saveStreamLog(config, dir, 'forge', status.fail_count + 1, forgeStreamPath);
    deps.clearShutdownContext();

    if (!result.ok) {
      status = deps.loadStatus(config, dir) || status;

      if (result.reason === 'session_ended_no_changes') {
        const _tsState = readAcpTranscriptState(forgeStreamPath);
        const _tsActive = transcriptShowsProgress(_tsState);
        const _tsField = _tsActive
          ? `active (${_tsState.eventCount} events)`
          : `stale (no activity for ${_tsState.lastActivityPoll} polls)`;
        const forgeNoChangesMsg = _tsActive
          ? 'Forge completed without file changes (transcript shows recent activity — possible no-op session)'
          : 'Forge session ended but produced no commits — agent may have crashed or errored';
        await discord(config, 'WARN', `Module ${moduleId} — Forge no changes`, forgeNoChangesMsg, [
          { name: 'Transcript', value: _tsField },
        ]);
        const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'forge',
          forgeNoChangesMsg, { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }

      if (result.reason === 'timeout') {
        const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'forge',
          `TIMEOUT: Forge did not complete within ${timeout} minutes`, { isTimeout: true, recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }
      if (result.reason === 'rate_limit_exhausted') {
        log('ERROR', `Module ${moduleId} rate limit pauses exhausted in forge phase`);
        await deps.discord(config, 'CRITICAL', `Module ${moduleId} RATE LIMITED`,
          `Exceeded max rate limit pauses. Pipeline cannot continue.`);
        return { retry: false, result: {
          exit: EXIT_RATE_LIMITED,
          reason: 'Rate limit pauses exceeded maximum — pipeline halted',
          module: moduleId, module_dir: dir,
        }};
      }
      if (result.reason === 'parse_corrupted') {
        const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'forge',
          'status.json is permanently corrupted (unparseable after multiple attempts)', { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }
      if (result.reason === 'git_error') {
        return { retry: false, result: {
          exit: EXIT_ERROR,
          reason: result.status?.message || 'Polling git sync failed closed during Forge phase',
          module: moduleId,
          module_dir: dir,
          polling_git: result.status?.details || result.status || null,
        }};
      }

      // blocked or FAIL without details
      const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'forge',
        deps.extractAgentFailReason(status, 'forge'), { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    status = deps.loadStatus(config, dir) || status;

    if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
      const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'forge',
        deps.extractAgentFailReason(status, 'forge'), { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    // ── Pipeline guarantee: READY_FOR_TESTING ──
    // Forge may have committed code but forgotten to update status.json.
    // The pipeline owns the state machine — if Forge produced changes and
    // didn't set a terminal status (FAIL/BLOCKED), force READY_FOR_TESTING.
    if (status.status !== STATUS.READY_FOR_TESTING) {
      log('WARN', `Forge finished but status is '${status.status}' instead of READY_FOR_TESTING — pipeline forcing advancement`);
      status.status = STATUS.READY_FOR_TESTING;
      addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline',
        'Pipeline forced READY_FOR_TESTING: Forge completed with changes but did not update status.json');
      ensureValidationState(status);
      deps.saveStatus(config, dir, status);
      await deps.discord(config, 'WARN', `Module ${moduleId} — forced READY_FOR_TESTING`,
        'Forge completed but did not update status.json. Pipeline advanced automatically.');
    }

    ensureValidationState(status);
    deps.saveStatus(config, dir, status);
    log('OK', 'Forge complete → READY_FOR_TESTING');
    onPhaseCompleted(_telemetryCtx(config), moduleId, 'forge');

    // ── Discord: Forge completion summary ──
    const forgeDurationSec = Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000);
    const forgeNextStep = stages.includes('buster') ? 'Buster' : 'done (no Buster)';
    await deps.discord(config, 'OK', `Module ${moduleId} Forge complete → ${forgeNextStep}`, mod.title, [
      { name: 'Forge Duration', value: `${Math.round(forgeDurationSec / 60)}min` },
      { name: 'Model', value: forgeModel },
      { name: 'Attempt', value: `${status.fail_count + 1}/${maxFails}` },
    ]);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  FORGE-ONLY PASS (no Buster in stages)
  //  When stages = ['forge'], READY_FOR_TESTING is the terminal state.
  //  Promote directly to PASS — there's no Buster to run tests.
  // ──────────────────────────────────────────────────────────────────────────
  if (!stages.includes('buster') && status.status === STATUS.READY_FOR_TESTING) {
    log('INFO', 'No buster in stages — promoting READY_FOR_TESTING → PASS');

    // Still commit+push so the code is on origin
    try {
      await deps.gitCommitAndPush(config, `[pipeline] Module ${moduleId}: Forge output (no buster)`, { softFail: true });
    } catch { /* non-critical */ }

    status.status = STATUS.PASS;
    status.completed_at = new Date().toISOString();
    status.current_phase = null;
    if (status.started_at) {
      status.cost.total_duration_seconds = Math.round(
        (new Date(status.completed_at) - new Date(status.started_at)) / 1000
      );
    }
    addHistory(status, STATUS.PASS, 'pipeline', 'Forge-only module — no Buster phase');
    deps.saveStatus(config, dir, status);

    await deps.discord(config, 'OK', `Module ${moduleId} PASS ✓ (forge-only)`, mod.title, [
      { name: 'Duration', value: `${Math.round(status.cost.total_duration_seconds / 60)}min` },
      { name: 'Stages', value: stages.join(', ') },
    ]);

    log('OK', `Module ${moduleId} PASS (forge-only)`);
    onModulePass(_telemetryCtx(config), moduleId, {
      title: mod.title,
      old_status: 'READY_FOR_TESTING',
      attempt: status.fail_count + 1,
      phase: 'forge',
      model: null,
      duration_seconds: status.cost?.total_duration_seconds ?? 0,
      cost_estimate_usd: null,
      commit_hash: status.commit_hash || null,
    });
    setLogScope(null, null);
    getModuleStats(config).modules_completed.push(moduleId);

    return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  BUSTER-ONLY PROMOTION (no Forge in stages)
  //  When stages = ['buster'], there's no Forge to set READY_FOR_TESTING.
  //  Promote PENDING/FAIL → READY_FOR_TESTING so the Buster phase can start.
  // ──────────────────────────────────────────────────────────────────────────
  if (!stages.includes('forge') && stages.includes('buster')
      && [STATUS.PENDING, STATUS.FAIL].includes(status.status)) {
    log('INFO', 'No forge in stages — promoting to READY_FOR_TESTING for buster-only run');
    if (!status.started_at) status.started_at = new Date().toISOString();
    status.status = STATUS.READY_FOR_TESTING;
    addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline', 'Buster-only module — skipping Forge');
    ensureValidationState(status);
    deps.saveStatus(config, dir, status);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  DELIVERY LINT (post-Forge artifact consistency)
  //  Deterministic checks on produced artifacts before Buster dispatch.
  //  Catches path mismatches and missing referenced files without running tests.
  //  Only runs when Forge produced output AND Buster will follow.
  //  On failure: handleFail with delivery_lint phase → Forge retry with details.
  // ──────────────────────────────────────────────────────────────────────────
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
            { name: 'Stage', value: 'delivery_lint' },
            { name: 'Issues', value: String(deliveryLintResult.failures.length) },
            { name: 'Codes', value: deliveryLintResult.failures.map(f => f.code).join(', ') },
          ]);
        const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'delivery_lint',
          reason, { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
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
          { name: 'Stage', value: 'pre_check' },
          ...(preCheck.report?.summary ? [{
            name: 'Lint',
            value: `${preCheck.report.summary.total_errors} errors / ${preCheck.report.summary.total_warnings} warnings`,
          }] : []),
        ]);
        const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'pre_check', precheckReason, { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }

      markValidationPassed(status, 'pre_check_passed');
      deps.saveStatus(config, dir, status);
    }
  }

  const validation = ensureValidationState(status);
  if (stages.includes('forge') && stages.includes('buster')
      && status.status === STATUS.READY_FOR_TESTING
      && (!validation.delivery_lint_passed || !validation.pre_check_passed)) {
    return { retry: false, result: {
      exit: EXIT_ERROR,
      reason: 'Validation milestones missing before Buster dispatch — refusing to continue',
      module: moduleId,
    }};
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  GIT SYNC (Forge → Buster handoff)
  //  Ensures Buster always works on committed, pushed code.
  //  Records commit hash in status.json for traceability.
  // ──────────────────────────────────────────────────────────────────────────
  if (stages.includes('buster') && (needsBuster || status.status === STATUS.READY_FOR_TESTING)) {
    try {
      await deps.gitSyncBeforeBuster(config, dir, status);
      deps.saveStatus(config, dir, status);
    } catch (e) {
      log('ERROR', `Git sync before Buster failed: ${e.message}`);
      return { retry: false, result: { exit: EXIT_ERROR, reason: e.message } };
    }
  }

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
    // Crashes (orchestrator-detected, timeouts) retry the Buster dispatch directly
    // instead of going back to Forge. Status stays at READY_FOR_TESTING.
    // Only real test failures (source: 'agent') or exhausted retries go to handleFail → Forge.
    const maxBusterCrashRetries = mod.max_buster_crash_retries ?? config.max_buster_crash_retries ?? 2;

    for (let busterAttempt = 1; busterAttempt <= maxBusterCrashRetries + 1; busterAttempt++) {
      const isLastBusterAttempt = busterAttempt > maxBusterCrashRetries;

      let busterPrompt;
      {
        const promptResult = deps.buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails);
        if (promptResult.error) {
          log('ERROR', `Buster prompt build failed for ${moduleId}: ${promptResult.error}`);
          return { retry: false, result: { exit: EXIT_ERROR, reason: promptResult.error } };
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
          await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Config Invalid`,
            `Pre-dispatch validation caught config issues. Fix progress.json before retrying.`,
            [{ name: 'Issue', value: e.message.slice(0, 200) }]
          );
          deps.clearShutdownContext();
          return { retry: false, result: {
            exit: EXIT_NEEDS_NOVA,
            reason,
            module: moduleId, module_dir: dir,
          }};
        }
      }

      status.status = STATUS.TESTING;
      status.current_phase = 'buster';
      addHistory(status, STATUS.TESTING, 'pipeline',
        `Buster started (subagent attempt ${busterAttempt}/${maxBusterCrashRetries + 1})`);
      deps.saveStatus(config, dir, status);

      deps.setShutdownContext(config, 'buster', moduleId, dir);

      // Archive old completion entries for this module before dispatching.
      // Prevents pollDual from reading stale FAIL/PASS from a previous attempt.
      await deps.archiveModuleCompletions(config, moduleId);

      try { await deps.spawnAgent(config, progress, 'buster', moduleId, busterModel, busterPrompt, {
        status, taskType: 'module_test', run_id: getRunId(config), attempt: status.fail_count + 1,
      }); }
      catch (e) {
        log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}/${maxFails}: buster agent spawn failed: ${e.message}`);
        deps.clearShutdownContext();
        return { retry: false, result: { exit: EXIT_ERROR, reason: `Buster spawn failed: ${e.message}` } };
      }

      const result = await deps.pollDualWithRateLimitRecovery(config, dir, moduleId,
        [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED], timeout);

      // Kill agent session (safety net — Processor should have killed already after completion)
      await deps.killAgent(config, 'buster', moduleId);
      deps.clearShutdownContext();

      // ── Poll failed (timeout, parse error, etc.) ──
      if (!result.ok) {
        status = deps.loadStatus(config, dir) || status;

        if (result.reason === 'rate_limit_exhausted') {
          log('ERROR', `Module ${moduleId} rate limit pauses exhausted in buster phase`);
          await deps.discord(config, 'CRITICAL', `Module ${moduleId} RATE LIMITED (Buster)`,
            `Exceeded max rate limit pauses during testing.`);
          return { retry: false, result: {
            exit: EXIT_RATE_LIMITED,
            reason: 'Rate limit pauses exceeded maximum during Buster phase',
            module: moduleId, module_dir: dir,
          }};
        }
        if (result.reason === 'git_error') {
          return { retry: false, result: {
            exit: EXIT_ERROR,
            reason: result.status?.message || 'Polling git sync failed closed during Buster phase',
            module: moduleId,
            module_dir: dir,
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
            `${reason}. Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`);

          // Reset to READY_FOR_TESTING for next Buster attempt
          status.status = STATUS.READY_FOR_TESTING;
          addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline',
            `Buster subagent crashed — retrying (${busterAttempt}/${maxBusterCrashRetries})`);
          deps.saveStatus(config, dir, status);
          continue; // → next busterAttempt
        }

        // Last attempt exhausted — BLOCKED, not handleFail.
        // Buster crashing repeatedly is an infrastructure problem, not a code problem.
        // Forge can't fix it. Requires human intervention.
        log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

        status.status = STATUS.BLOCKED;
        status.current_phase = 'buster';
        addHistory(status, STATUS.BLOCKED, 'pipeline',
          `Buster subagent crashed ${maxBusterCrashRetries + 1} times without producing a test result. Infrastructure issue — Forge cannot fix this.`);
        deps.saveStatus(config, dir, status);

        await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
          `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
            { name: 'Last Reason', value: result.reason || 'unknown (no error detail available)' },
            { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
          ]);

        return { retry: false, result: {
          exit: EXIT_BLOCKED,
          reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
          module: moduleId, module_dir: dir,
        }};
      }

      // ── Poll succeeded (terminal status reached) ──
      status = deps.loadStatus(config, dir) || status;

      // Trust Redis over stale status.json
      const redisEntry = result.status?._redis_entry;
      if (redisEntry?.status) {
        const redisStatus = mapRedisStatus(redisEntry.status);
        if ([STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(redisStatus) &&
            ![STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(status.status)) {
          log('WARN', `status.json shows '${status.status}' but Redis says '${redisStatus}' — trusting Redis`);
          status.status = redisStatus;
          if (redisEntry.summary) {
            status.fail_summaries = status.fail_summaries || [];
            status.fail_summaries.push(redisEntry.summary);
          }
          deps.saveStatus(config, dir, status);
        }
      }

      // ── PASS ──
      if (status.status === STATUS.PASS) {
        status.completed_at = new Date().toISOString();
        status.current_phase = null;
        if (status.started_at) {
          status.cost.total_duration_seconds = Math.round(
            (new Date(status.completed_at) - new Date(status.started_at)) / 1000
          );
        }
        deps.saveStatus(config, dir, status);

        await deps.discord(config, 'OK', `Module ${moduleId} PASS ✓`, mod.title, [
          { name: 'Duration', value: `${Math.round(status.cost.total_duration_seconds / 60)}min` },
          { name: 'Attempts', value: `${status.fail_count + 1}` },
        ]);

        log('OK', `Module ${moduleId} PASS`);
        onPhaseCompleted(_telemetryCtx(config), moduleId, 'buster');
        onModulePass(_telemetryCtx(config), moduleId, {
          title: mod.title,
          old_status: 'TESTING',
          attempt: status.fail_count + 1,
          phase: 'buster',
          model: busterModel,
          duration_seconds: status.cost?.total_duration_seconds ?? 0,
          cost_estimate_usd: null,
          commit_hash: status.commit_hash || null,
        });

        setLogScope(null, null);
        getModuleStats(config).modules_completed.push(moduleId);

        return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
      }

      // ── FAIL / BLOCKED ──
      if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
        // Classify the failure source into three categories:
        //
        //   1. INFRA CRASH — orchestrator timeout, process death, no test output
        //      → Buster retry (same Forge output), then BLOCKED if exhausted
        //
        //   2. PRE-TEST FAILURE — orchestrator detected build/health/suite failure
        //      before spawning a subagent (has structured verdict with per-suite details)
        //      → First occurrence: handleFail → Forge (might be a code issue)
        //      → Repeated same suite: fast-track EXIT_NEEDS_NOVA (likely config issue)
        //
        //   3. AGENT TEST FAILURE — subagent ran tests, reported FAIL
        //      → handleFail → Forge retry (normal flow)

        const source = redisEntry?.source || 'unknown';
        const isFromOrchestrator = /^orchestrator/i.test(source);
        const hasPreTestVerdict = isFromOrchestrator && !!redisEntry?.verdict;
        const isCrash = isFromOrchestrator && !hasPreTestVerdict;

        // ── Category 1: Infrastructure crash ──
        if (isCrash && !isLastBusterAttempt) {
          log('WARN', `Buster subagent crashed (source: ${source}, attempt ${busterAttempt}/${maxBusterCrashRetries + 1}) — retrying Buster`);
          await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
            `Subagent crashed (source: ${source}). Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`);

          // Reset to READY_FOR_TESTING — don't count as fail_count (that's for Forge retries)
          status.status = STATUS.READY_FOR_TESTING;
          addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline',
            `Buster subagent crashed (source: ${source}) — retrying (${busterAttempt}/${maxBusterCrashRetries})`);
          deps.saveStatus(config, dir, status);
          continue; // → next busterAttempt
        }

        if (isCrash) {
          // Crash retries exhausted → BLOCKED (infrastructure issue)
          log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

          status.status = STATUS.BLOCKED;
          status.current_phase = 'buster';
          addHistory(status, STATUS.BLOCKED, 'pipeline',
            `Buster subagent crashed ${maxBusterCrashRetries + 1} times (source: ${source}). Infrastructure issue — Forge cannot fix this.`);
          deps.saveStatus(config, dir, status);

          await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
            `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
              { name: 'Source', value: source },
              { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
            ]);

          onModuleBlocked(_telemetryCtx(config), moduleId, {
            title: mod.title,
            old_status: 'TESTING',
            phase: 'buster',
            reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue`,
          });

          return { retry: false, result: {
            exit: EXIT_BLOCKED,
            reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
            module: moduleId, module_dir: dir,
          }};
        }

        // ── Category 2: Pre-test failure (orchestrator with verdict) ──
        if (hasPreTestVerdict) {
          const failedSuiteNames = deps.getFailedSuiteNames(redisEntry);
          const preTestReason = deps.extractPreTestFailReason(redisEntry);

          log('WARN', `Pre-test failure: ${preTestReason} (suites: ${failedSuiteNames.join(',') || 'unknown'})`);

          // Check if same suite(s) already failed as pre-test in a previous attempt.
          // Repeated pre-test failures in the same suite = config issue, not code.
          // Forge cannot fix progress.json — don't waste cycles.
          const previousPreTestFails = (status.fail_summaries || [])
            .filter(s => typeof s === 'object' && typeof s.summary === 'string'
                      && s.summary.startsWith('[buster/pre-test]'));

          const isRepeatedPreTestFail = failedSuiteNames.length > 0
            && previousPreTestFails.some(prev =>
              failedSuiteNames.some(suite => prev.summary.includes(suite))
            );

          if (isRepeatedPreTestFail) {
            log('ERROR', `Module ${moduleId}: repeated pre-test failure in ${failedSuiteNames.join(',')} — likely config issue, skipping Forge`);

            status.fail_count++;
            status.fail_summaries.push({
              attempt: status.fail_count,
              timestamp: new Date().toISOString(),
              summary: preTestReason,
              phase: 'buster',
              is_pre_test: true,
              failed_suites: failedSuiteNames,
            });

            // ── BLOCKED check — must respect max_fails like handleFail does ──
            if (status.fail_count >= maxFails) {
              status.status = STATUS.BLOCKED;
              status.current_phase = null;
              addHistory(status, STATUS.FAIL, 'pipeline',
                `Repeated pre-test failure (${failedSuiteNames.join(',')}) — config issue, Forge cannot fix`);
              addHistory(status, STATUS.BLOCKED, 'pipeline', `Max retries (${maxFails}) exceeded`);
              deps.saveStatus(config, dir, status);

              log('ERROR', `Module ${moduleId} BLOCKED — repeated pre-test failure, ${maxFails}x in buster phase`);
              getModuleStats(config).modules_blocked.push(moduleId);
              await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED`,
                `Repeated pre-test failure in ${failedSuiteNames.join(', ')}. Failed ${maxFails} times. Human intervention needed.`, [
                  { name: 'Failed Suites', value: failedSuiteNames.join(', ') },
                  { name: 'Reason', value: preTestReason.slice(0, 200) },
                  { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
                ]);

              onModuleBlocked(_telemetryCtx(config), moduleId, {
                title: mod.title,
                old_status: 'TESTING',
                phase: 'buster',
                reason: `Repeated pre-test failure — max retries exceeded (${failedSuiteNames.join(',')})`,
              });

              return { retry: false, result: {
                exit: EXIT_BLOCKED,
                reason: `Repeated pre-test failure — max retries exceeded (${failedSuiteNames.join(',')})`,
                module: moduleId, module_dir: dir,
                failed_suites: failedSuiteNames,
              }};
            }

            status.status = STATUS.FAIL;
            status.current_phase = null;
            addHistory(status, STATUS.FAIL, 'pipeline',
              `Repeated pre-test failure (${failedSuiteNames.join(',')}) — config issue, Forge cannot fix`);
            deps.saveStatus(config, dir, status);

            await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Config Issue Detected`,
              `Same pre-test suite(s) failed again: ${failedSuiteNames.join(', ')}. This is likely a config problem in progress.json, not a code issue.`, [
                { name: 'Failed Suites', value: failedSuiteNames.join(', ') },
                { name: 'Reason', value: preTestReason.slice(0, 200) },
                { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
                { name: 'Action', value: 'Check progress.json test_config / test_suites / serve' },
              ]);

            onModuleFail(_telemetryCtx(config), moduleId, {
              title: mod.title,
              old_status: 'TESTING',
              phase: 'buster',
              attempt: status.fail_count,
              reason: `Repeated pre-test failure (${failedSuiteNames.join(',')}) — likely config issue`,
            });

            return { retry: false, result: {
              exit: EXIT_NEEDS_NOVA,
              reason: `Repeated pre-test failure (${failedSuiteNames.join(',')}) — likely config issue in progress.json`,
              module: moduleId, module_dir: dir,
              failed_suites: failedSuiteNames,
            }};
          }

          // First pre-test failure → give Forge a chance (might be a code issue)
          log('INFO', `First pre-test failure — routing to Forge via handleFail`);
          const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'buster',
            preTestReason, { recalledMemoryIds });
          if (failResult._retry) return { retry: true, fail_count: status.fail_count };
          return { retry: false, result: failResult };
        }

        // ── Category 3: Agent test failure (normal) ──
        const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'buster',
          deps.extractAgentFailReason(status, 'buster'), { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }

      // Unexpected status — break out of retry loop
      break;
    } // end busterAttempt loop
  }

  setLogScope(null, null);
  log('ERROR', `Module ${moduleId} ended in unexpected status: ${status?.status}`);
  return { retry: false, result: { exit: EXIT_ERROR, reason: `Unexpected status: ${status?.status}` } };
}

export default runModule;
