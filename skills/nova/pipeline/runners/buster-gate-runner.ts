// runners/buster-gate-runner.ts — Buster gate runner
// Handles the buster gate lifecycle:
//   1. Completion check (output_file is canonical; gate-status.json is diagnostic)
//   2. Stale file cleanup
//   3. Main loop: run Buster → optional fix-and-retest (Forge fixes, Buster retests)
//
// The fix-and-retest loop tracks fix history to prevent repeated failed approaches
// via anti-pattern framing in subsequent Forge prompts.

import { selectDeps } from '../core/deps.ts';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { validateBusterConfig, resolvePolicy, logEffectivePolicy } from '../core/config.ts';
import { relPath, gateLogDir, gateOutputPath, gateStatusPath } from '../core/paths.ts';
import { headHash } from '../core/git-context.ts';
import { discord } from '../integrations/discord.ts';
import { archiveGateOutputIfPresent, readBusterGateCompletion } from '../services/status-store.ts';
import { pollResult, sleep, archiveModuleCompletions, pollForSessionEnd } from '../services/polling.ts';
import {
  createRateLimitPauseState,
  createTrackedGateSessionRateLimitRecoveryOptions,
  emitGateRetryExhausted,
  withSessionRateLimitRecovery,
} from '../services/rate-limit.ts';
import { readGateInstructions, buildBusterGatePrompt } from '../prompts/buster-gate.ts';
import { buildGateFixPrompt } from '../prompts/gate-fix.ts';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive } from '../agents/orchestration.ts';
import { getTrackedAgent } from '../agents/lifecycle.ts';
import { getActiveContext } from '../core/logger.ts';
import { onGateStarted, onGateFail } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { writeRedactedPromptArtifact } from '../redaction.ts';
import { readGateRemediationSpec } from '../services/remediation-handoff.ts';
import { persistGateActiveSession, clearGateActiveSession } from '../services/gate-active-session.ts';
import {
  GATE_CONTROL_ACTIONS,
  buildTypedGateControlResult,
  cloneSerializable,
} from '../services/contracts/gate-control-result.ts';
import {
  applyTrackedBusterGateIdentity,
  buildBusterGateActiveSessionMetadata,
  buildBusterGateArchiveIdentity,
  buildBusterGateArchiveTarget,
  buildBusterGateRateLimitStatusOptions,
  buildBusterGateSpawnOptions,
  createBusterGateCompletionIdentity,
  syncBusterGateRateLimitStatusOptions,
} from './buster-gate-task.ts';
import { waitBusterGateCompletionEvidence } from './buster-gate-completion.ts';
import { performBusterGateFixAttempt } from './buster-gate-fix-cycle.ts';
import { handleBusterGateEvaluationResult } from './buster-gate-terminal.ts';
import {
  buildBusterGateControlResult,
  buildBusterIssueFindings,
  buildBusterRequestFixControlResult,
  coerceBusterGateControlResult,
  extractGateIssues,
} from './buster-gate-control.ts';

function _telemetryCtx(config, deps = null) {
  return { ...(getActiveContext() || { config, runId: config?.run_id || config?._runId || '' }), deps };
}

async function emitBusterGateFixCycleFail(config, gateId, gateType, cycle, gateStartedAt, reason, extra = {}) {
  await onGateFail(_telemetryCtx(config, extra?.deps || null), gateId, {
    gate_type: gateType,
    fix_cycle: cycle,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason,
    ...extra,
  });
}

const DEFAULT_DEPS = {
  resolvePolicy,
  logEffectivePolicy,
  validateBusterConfig,
  headHash,
  discord,
  archiveGateOutputIfPresent,
  readBusterGateCompletion,
  pollResult,
  sleep,
  archiveModuleCompletions,
  pollForSessionEnd,
  waitBusterGateCompletionEvidence,
  readGateInstructions,
  buildBusterGatePrompt,
  buildGateFixPrompt,
  acpLabel,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  getTrackedAgent,
};

function getBusterGateRunnerDeps(config, overrides = {}) {
  return { ...DEFAULT_DEPS, ...selectDeps(overrides, 'busterGate'), _explicitDeps: overrides };
}

function getGateStats(config) {
  return getRunStats(config);
}

/**
 * Run a single Buster gate attempt: spawn -> poll -> kill -> interpret.
 * Returns the poll result for the caller to handle.
 * @private
 */
async function _runBusterGateOnce(deps, config, progress, gateId, gate, model, timeout, instructions, attempt, busterGatePolicy = {}) {
  getGateStats(config).total_buster_attempts++;
  const commitHash = deps.headHash(config);
  const completionIdentity = createBusterGateCompletionIdentity({
    runId: getRunId(config),
    gateId,
    attempt,
  });
  completionIdentity.model = model || null;
  completionIdentity.model_source = busterGatePolicy.model_source || null;
  completionIdentity.reasoning_level = busterGatePolicy.thinking_supported === false ? 'not supported' : (busterGatePolicy.thinking || 'default');
  completionIdentity.thinking_source = busterGatePolicy.thinking_source || null;
  completionIdentity.runtime = 'redis_dispatch';
  const gateRateLimitStatusOptions = buildBusterGateRateLimitStatusOptions({ gateId, gate, completionIdentity });
  const busterPromptResult = deps.buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt, completionIdentity);
  const busterPrompt = busterPromptResult.prompt;

  try {
    const logDir = gateLogDir(config, gateId);
    fs.mkdirSync(logDir, { recursive: true });
    writeRedactedPromptArtifact(path.join(logDir, `buster-prompt-attempt-${attempt}.md`), busterPrompt, { gate_id: gateId, attempt, agent_type: 'buster' });
  } catch (_error) { /* non-critical */ }

  // Pre-dispatch config validation (gate) — only on first attempt
  if (attempt === 1) {
    try {
      deps.validateBusterConfig(config);
    } catch (e) {
      const reason = `Gate '${gateId}' config validation failed: ${e.message}`;
      const configInvalidCorrelation = {
        run_id: completionIdentity.runId,
        gate_id: gateId,
        gate_type: gate.type,
        attempt,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: completionIdentity.gateway_label,
        session_key: completionIdentity.sessionKey,
      };
      log('ERROR', reason);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' — Config Invalid`,
        `Pre-dispatch validation caught config issues. Fix before retrying.`,
        buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, configInvalidCorrelation, [
          { name: 'Issue', value: e.message.slice(0, 200) },
        ]),
        { correlation: configInvalidCorrelation },
      );
      return deps.pollResult(false, 'config_invalid', {
        error: reason,
        errors: [e.message],
        run_id: completionIdentity.runId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: completionIdentity.gateway_label,
      });
    }
  }

  // Archive stale Redis completions for this gate before dispatching while preserving the active dispatch identity.
  const archiveResult = await deps.archiveModuleCompletions(
    config,
    gateId,
    buildBusterGateArchiveIdentity(completionIdentity),
    { ...buildBusterGateArchiveTarget(gateId, gate), deps: deps._explicitDeps }
  );
  if (archiveResult?.failed) {
    const reason = `Gate '${gateId}' Redis completion archive failed before Buster dispatch: ${archiveResult.error || 'unknown'}`;
    log('ERROR', reason);
    return deps.pollResult(false, 'completion_archive_failed', {
      gate: gateId,
      status: STATUS.FAIL,
      reason,
      error: archiveResult.error || null,
      source: 'redis_archive',
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      gateway_label: completionIdentity.gateway_label,
      _source: 'redis_archive',
      archive_failure: archiveResult,
    });
  }

  try {
    await deps.spawnAgent(config, progress, 'buster', gateId, model, busterPrompt, {
      ...buildBusterGateSpawnOptions(gate, completionIdentity),
      model_source: completionIdentity.model_source,
      reasoning_level: completionIdentity.reasoning_level,
      thinking: busterGatePolicy.thinking || null,
      thinking_source: completionIdentity.thinking_source,
      thinking_supported: busterGatePolicy.thinking_supported ?? null,
      runtime_kind: completionIdentity.runtime,
      deps: deps._explicitDeps,
    });
    const gateLabel = deps.acpLabel('buster', gateId);
    const trackedGate = deps.getTrackedAgent(gateLabel);
    applyTrackedBusterGateIdentity(completionIdentity, trackedGate);
    syncBusterGateRateLimitStatusOptions(gateRateLimitStatusOptions, completionIdentity);
    persistGateActiveSession(config, gateId, gateLabel, trackedGate, buildBusterGateActiveSessionMetadata(completionIdentity));
  } catch (e) {
    return deps.pollResult(false, 'spawn_failed', {
      error: e.message,
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      gateway_label: completionIdentity.gateway_label,
    });
  }

  let result;
  try {
    result = await deps.waitBusterGateCompletionEvidence({
      deps,
      config,
      gateId,
      gate,
      completionIdentity,
      gateRateLimitStatusOptions,
      timeoutMinutes: timeout,
    });
  } finally {
    await deps.killAgent(config, 'buster', gateId, result?.ok || false);
    clearGateActiveSession(config, gateId, completionIdentity);
  }
  return result;
}

/**
 * Run a type:"buster" gate with optional fix-and-retest loop.
 *
 * If gate.on_fail === 'fix_and_retest':
 *   FAIL -> extract issues -> Forge fix -> cleanup old output -> retest (max N cycles)
 * Otherwise: FAIL -> typed BLOCK control result for the generic gate runner.
 */





export async function buildBusterRemediationExhaustedControlResult(config, gateId, gate, controlResult, opts = {}) {
  const remediation = readGateRemediationSpec(controlResult) || {};
  const metadata = controlResult?.diagnostics?.metadata || {};
  const gateStartedAt = opts.gateStartedAt ?? (remediation?.startedAt ? new Date(remediation.startedAt).getTime() : Date.now());
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles || metadata?.fix_attempts || config.default_max_fails);
  const issues = remediation?.diagnostics?.issues || metadata?.remaining_issues || [];
  const latestGateDispatchId = remediation?.correlation?.dispatch_id || metadata?.dispatch_id || null;
  const latestGateGatewayLabel = remediation?.correlation?.gateway_label || metadata?.gateway_label || null;
  const latestGateSessionKey = remediation?.correlation?.session_key || metadata?.session_key || null;
  const failReason = issues.map((issue = {}) => issue.title).filter(Boolean).join('; ') || 'unknown (no error detail available)';

  log('ERROR', `Gate '${gateId}' fix loop exhausted (${maxFixCycles} attempts)`);
  getGateStats(config).gates_failed.push(gateId);
  await onGateFail(_telemetryCtx(config, opts.deps), gateId, {
    gate_type: gate.type,
    issues_count: issues.length,
    fix_cycle: maxFixCycles,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason: `Fix loop exhausted after ${maxFixCycles} attempts`,
    dispatch_id: latestGateDispatchId,
    session_key: latestGateSessionKey,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Gate '${gateId}' BLOCKED`,
        description: `Fix loop exhausted after ${maxFixCycles} attempts. Issues: ${failReason}`,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
          run_id: getRunId(config),
          gate_id: gateId,
          gate_type: gate.type,
          attempt: maxFixCycles,
          dispatch_id: latestGateDispatchId,
          gateway_label: latestGateGatewayLabel,
          session_key: latestGateSessionKey,
        }),
      },
    },
  });
  emitGateRetryExhausted(_telemetryCtx(config, opts.deps), gateId, {
    gateType: gate.type,
    phase: 'buster_gate_fix',
    attempt: maxFixCycles,
    maxAttempts: maxFixCycles,
    reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
    sessionKey: latestGateSessionKey,
    dispatchId: latestGateDispatchId,
    gatewayLabel: latestGateGatewayLabel,
  });
  return buildTypedGateControlResult({
    producerType: 'buster',
    nextAction: GATE_CONTROL_ACTIONS.BLOCK,
    issueType: 'code',
    summary: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
    findings: buildBusterIssueFindings(issues),
    metadata: {
      gate_id: gateId,
      gate_type: gate?.type || 'buster',
      run_id: getRunId(config) || config?._runId || config?.run_id || null,
      gate: gateId,
      reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
      failure_class: 'fix_loop_exhausted',
      fix_attempts: maxFixCycles,
      remaining_issues: cloneSerializable(issues),
      dispatch_id: latestGateDispatchId,
      gateway_label: latestGateGatewayLabel,
      session_key: latestGateSessionKey,
    },
    gateRunStatus: STATUS.FAIL,
    outcomeClass: 'needs_nova',
    recommendation: 'stop',
    metrics: {
      fix_attempts: maxFixCycles,
      issues_count: Array.isArray(issues) ? issues.length : 0,
    },
  });
}

export async function runBusterGateEvaluation(config, progress, gateId, opts = {}) {
  const deps = getBusterGateRunnerDeps(config, opts.deps);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  const attempt = Number(opts.attempt || 1);
  const gateStartedAt = opts.gateStartedAt ?? Date.now();
  const remediation = opts.remediation || readGateRemediationSpec(opts.controlResult) || {};
  const correlation = remediation?.correlation || {};

  if (!opts.skipStartedTelemetry) {
    log('STEP', `═══════════════════════════════════════════════════════`);
    log('STEP', `  GATE: ${gate.title}`);
    log('STEP', `═══════════════════════════════════════════════════════`);
  }

  if (attempt === 1) {
    const existingCompletion = deps.readBusterGateCompletion(config, gateId, gate);
    if (existingCompletion.isPass) {
      log('OK', `Gate '${gateId}' already completed via output_file — skipping`);
      return buildBusterGateControlResult(config, gateId, gate, {
        status: STATUS.PASS,
        passed: true,
        outcome_class: 'passed',
        completion_source: existingCompletion.source || null,
        attempt,
      }, { ...opts, input: { ids: { attempt } } });
    }
    if (existingCompletion.output.exists && !existingCompletion.output.isPass) {
      const staleStatus = existingCompletion.output?.data?.status;
      if (staleStatus) {
        log('INFO', `Gate '${gateId}' output file exists but status is '${staleStatus}' — re-running`);
      }
    }

    if (gate.output_file) {
      const outPath = gateOutputPath(config, gate);
      try {
        const archived = deps.archiveGateOutputIfPresent(config, gateId, outPath);
        if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      } catch (_error) { /* ok */ }
    }
    try {
      const gsp = gateStatusPath(config, gateId);
      const archivedStatus = deps.archiveGateOutputIfPresent(config, gateId, gsp, { label: 'gate-status' });
      if (archivedStatus) log('INFO', `Archived previous gate status: ${relPath(config, archivedStatus)}`);
      if (fs.existsSync(gsp)) fs.unlinkSync(gsp);
    } catch (_error) { /* ok */ }
  }

  let instructions;
  try {
    instructions = deps.readGateInstructions(config, gate);
  } catch (e) {
    log('ERROR', `Gate '${gateId}' instructions read failed: ${e.message}`);
    if (!opts.skipStartedTelemetry) {
      await onGateStarted(_telemetryCtx(config, opts.deps), gateId, gate);
    }
    await onGateFail(_telemetryCtx(config, opts.deps), gateId, {
      gate_type: gate.type,
      reason: `Gate '${gateId}' instructions read failed: ${e.message}`,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Buster Gate Setup Failed: ${gate.title}`,
          description: `Gate instructions could not be read: ${e.message}`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt, model, reasoning_level: busterGatePolicy.thinking_supported === false ? 'not supported' : (busterGatePolicy.thinking || 'default'), thinking_source: busterGatePolicy.thinking_source || null, runtime: 'redis_dispatch' }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: e.message,
      failure_class: 'instructions_read_failed',
      outcome_class: 'error',
      attempt,
    }, { ...opts, input: { ids: { attempt } } });
  }

  const busterGatePolicy = deps.resolvePolicy(config, progress, 'buster', {
    scopeModel: gate.model || null,
    dispatchPath: 'redis',
  });
  const model = busterGatePolicy.model;
  deps.logEffectivePolicy(config, { scope: 'gate_buster', agent: 'buster', gateId, ...busterGatePolicy });
  log('INFO', `Gate '${gateId}' model: ${model ?? '(none)'} [${busterGatePolicy.model_source}] thinking: not_supported_on_redis`);
  const timeout = gate.timeout_minutes ?? config.default_timeout_minutes;
  const maxFixCycles = gate.max_fix_cycles ?? config.default_max_fails;
  const hasFixLoop = gate.on_fail === 'fix_and_retest';

  if (hasFixLoop && maxFixCycles < 1) {
    const reason = `Gate '${gateId}' ended unexpectedly`;
    log('ERROR', reason);
    getGateStats(config).gates_failed.push(gateId);
    if (!opts.skipStartedTelemetry) {
      await onGateStarted(_telemetryCtx(config, opts.deps), gateId, gate);
    }
    await onGateFail(_telemetryCtx(config, opts.deps), gateId, {
      gate_type: gate.type,
      fix_cycle: 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Ended Unexpectedly`,
          description: 'Buster gate loop exited without a terminal outcome. Manual review required.',
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason,
      failure_class: 'unexpected_exit',
      outcome_class: 'needs_nova',
      attempt,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (!opts.skipStartedTelemetry) {
    await onGateStarted(_telemetryCtx(config, opts.deps), gateId, gate, {
      presentation: {
        discord: {
          level: 'INFO',
          title: `Gate: ${gate.title}`,
          description: `Starting buster gate${hasFixLoop ? ` (fix loop: max ${maxFixCycles})` : ''}`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt }),
        },
      },
    });
  }

  const maxRateLimitPauses = config.rate_limit.max_pauses_per_module;
  const gateRateLimitPauseState = createRateLimitPauseState();

  const result = await withSessionRateLimitRecovery(
    config,
    () => (deps.runOnce || _runBusterGateOnce)(deps, config, progress, gateId, gate, model, timeout, instructions, attempt, busterGatePolicy),
    createTrackedGateSessionRateLimitRecoveryOptions(config, {
      sleepFn: deps.sleep,
      discordFn: deps.discord,
      gateId,
      gateType: gate.type,
      identity: {
        agent_type: gate.type || 'buster',
        run_id: getRunId(config),
        attempt,
        dispatch_id: correlation.dispatch_id || null,
        gateway_label: correlation.gateway_label || null,
        session_key: correlation.session_key || null,
      },
      updateCorrelation: () => correlation,
      maxPauses: maxRateLimitPauses,
      pauseState: gateRateLimitPauseState,
      resumeDescription: `Resuming gate ${gateId}`,
      pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `Gate '${gateId}' rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
      resumeLogMessage: () => `Gate '${gateId}' rate limit cooldown complete — retrying (attempt stays at ${attempt} due to rate limit)`,
      suppressPausePresentation: ({ status }) => (status?.source || '').toLowerCase() === 'buster-pipeline',
      exhaustedResultConfig: {
        resultOverrides: { outcome_class: 'rate_limited' },
      },
    }),
  );

  return handleBusterGateEvaluationResult({
    config,
    deps,
    gateId,
    gate,
    result,
    attempt,
    opts,
    correlation,
    timeout,
    maxRateLimitPauses,
    maxFixCycles,
    hasFixLoop,
    gateStartedAt,
    callbacks: {
      getGateStats,
      buildBusterGateControlResult,
      buildBusterRequestFixControlResult,
      extractGateIssues,
      telemetryCtx: (cfg) => _telemetryCtx(cfg, opts.deps),
    },
  });
}

export async function runBusterGateFixAttempt(config, progress, gateId, controlResult, opts = {}) {
  const deps = getBusterGateRunnerDeps(config, opts.deps);
  const gate = progress.gates[gateId];
  return performBusterGateFixAttempt({
    config,
    progress,
    gateId,
    controlResult,
    opts,
    deps,
    gate,
    callbacks: {
      getGateStats,
      emitBusterGateFixCycleFail,
      buildBusterGateControlResult,
      telemetryCtx: (cfg) => _telemetryCtx(cfg, opts.deps),
    },
  });
}


export function createBusterGateRemediationController({ config, progress, gateId, gate, opts = {}, gateStartedAt }) {
  const fixHistory = opts.fixHistory || [];
  return {
    evaluateGate: ({ attempt, controlResult: remediationControlResult, remediation }) => runBusterGateEvaluation(config, progress, gateId, {
      attempt,
      gateStartedAt,
      skipStartedTelemetry: true,
      remediation,
      controlResult: remediationControlResult,
      deps: opts.deps,
    }),
    performFix: ({ controlResult: remediationControlResult, cycle }) => runBusterGateFixAttempt(config, progress, gateId, remediationControlResult, {
      cycle,
      gateStartedAt,
      fixHistory,
      deps: opts.deps,
    }),
    buildExhaustedControlResult: ({ controlResult: remediationControlResult }) =>
      buildBusterRemediationExhaustedControlResult(config, gateId, gate, remediationControlResult, { gateStartedAt }),
  };
}

export function getBusterGateControlAdapter() {
  return Object.freeze({
    mode: 'remediable',
    label: 'Buster',
    coerce: coerceBusterGateControlResult,
    createRemediationController: createBusterGateRemediationController,
  });
}


export async function runBusterGateStage(config, progress, gateId, opts = {}) {
  return runBusterGateEvaluation(config, progress, gateId, opts);
}
