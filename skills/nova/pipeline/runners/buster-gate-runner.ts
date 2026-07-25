import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
import { validateBusterConfig } from '../core/buster-config.ts';
import { resolvePolicy, logEffectivePolicy } from '../core/policy.ts';
import { relPath, gateLogDir, gateOutputPath, gateStatusPath } from '../core/paths.ts';
import { headHash } from '../core/git-context.ts';
import { discord } from '../integrations/discord.ts';
import { gitCommitAndPush } from '../integrations/git-worktree.ts';
import { archiveGateOutputIfPresent, readBusterGateCompletion } from '../services/status-store.ts';
import { pollResult, sleep, archiveModuleCompletions, pollForSessionEnd } from '../services/polling.ts';
import {
  createRateLimitPauseState,
  createTrackedGateSessionRateLimitRecoveryOptions,
  getRateLimitConfig,
  withSessionRateLimitRecovery,
} from '../services/rate-limit.ts';
import { readGateInstructions, buildBusterGatePrompt } from '../prompts/buster-gate.ts';
import { buildGateFixPrompt } from '../prompts/gate-fix.ts';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive } from '../agents/orchestration.ts';
import { getTrackedAgent } from '../agents/lifecycle.ts';
import { getActiveContext } from '../core/logger.ts';
import { onGateStarted, onGateFail } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
import { readGateRemediationSpec } from '../services/remediation-handoff.ts';
import { writePromptArtifact } from '../egress.ts';
import { persistGateActiveSession, clearGateActiveSession } from '../services/gate-active-session.ts';
import {
  applyTrackedBusterGateIdentity,
  buildBusterGateActiveSessionMetadata,
  buildBusterGateActiveCompletionIdentity,
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
import { runBusterGateOnce } from './buster-gate-attempt.ts';
import { buildBusterRemediationExhaustedControlResult as buildExhaustedControlResult } from './buster-gate-remediation-exhausted.ts';
import { arrayValue, objectRecord, selectPresent as selectPresentValue } from '../value-boundary.ts';
import {
  buildBusterGateControlResult,
  buildBusterRequestFixControlResult,
  coerceBusterGateControlResult,
  extractGateIssues,
} from './buster-gate-control.ts';
const BUSTER_GATE_TYPE = 'buster';
const BUSTER_GATE_FIRST_ATTEMPT = 1;
const BUSTER_PIPELINE_SOURCE = 'buster-pipeline';
const BUSTER_GATE_MISSING_ERROR_DETAIL = 'missing_error_detail';
const TELEMETRY_CONTEXT_MISSING_RUN_ID = '';

function gateType(gate: any) {
  return selectPresentValue(gate?.type, BUSTER_GATE_TYPE);
}

function gateStartedAtAuthority(opts: any = {}, remediation: any = null) {
  if (opts.gateStartedAt !== undefined) return opts.gateStartedAt;
  if (remediation?.startedAt) return new Date(remediation.startedAt).getTime();
  return Date.now();
}

function gateMaxFixCyclesAuthority(remediation: any = {}, metadata: any = {}, pipelineDefaults: any = {}) {
  const candidate = selectDefinedValue(() => (selectDefinedValue(() => (remediation?.policy?.maxFixCycles), () => (metadata?.fix_attempts))), () => (pipelineDefaults.max_fails));
  return Number(candidate);
}

function gateTimeoutAuthority(gate: any = {}, pipelineDefaults: any = {}) {
  return selectDefinedValue(() => (gate.timeout_minutes), () => (pipelineDefaults.timeout_minutes));
}

function _telemetryCtx(config: any, deps: any = null) {
  const active = objectRecord(getActiveContext());
  return {
    ...active,
    config: active.config ? active.config : config,
    runId: selectPresentValue(active.runId, config?.run_id, config?._runId, TELEMETRY_CONTEXT_MISSING_RUN_ID),
    deps,
  };
}

async function emitBusterGateFixCycleFail(config: any, gateId: any, gateType: any, cycle: any, gateStartedAt: any, reason: any, extra: any = {}) {
  await onGateFail(_telemetryCtx(config, extra?.deps ? extra.deps : null), gateId, {
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
  gitCommitAndPush,
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

function getBusterGateRunnerDeps(config: any, overrides: any = {}) {
  return { ...DEFAULT_DEPS, ...selectDeps(overrides, 'busterGate'), _explicitDeps: overrides };
}

function getGateStats(config: any) {
  return getRunStats(config);
}

/**
 * Run a single Buster gate attempt: spawn -> poll -> kill -> interpret.
 * Returns the poll result for the caller to handle.
 * @private
 */
/**
 * Run a type:"buster" gate with optional fix-and-retest loop.
 *
 * If gate.on_fail === 'fix_and_retest':
 *   FAIL -> extract issues -> Forge fix -> cleanup old output -> retest (max N cycles)
 * Otherwise: FAIL -> typed BLOCK control result for the generic gate runner.
 */





export async function buildBusterRemediationExhaustedControlResult(config: any, gateId: any, gate: any, controlResult: any, opts: any = {}) {
  return buildExhaustedControlResult(config, gateId, gate, controlResult, opts, {
    gateType,
    gateStartedAtAuthority,
    gateMaxFixCyclesAuthority,
    telemetryCtx: _telemetryCtx,
  });
}

export async function runBusterGateEvaluation(config: any, progress: any, gateId: any, opts: any = {}) {
  const deps = getBusterGateRunnerDeps(config, opts.deps);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  const attempt = Number(selectDefinedValue(() => (opts.attempt), () => (BUSTER_GATE_FIRST_ATTEMPT)));
  const gateStartedAt = gateStartedAtAuthority(opts);
  const remediation = objectRecord(selectPresentValue(opts.remediation, readGateRemediationSpec(opts.controlResult)));
  const correlation = objectRecord(remediation?.correlation);

  if (!opts.skipStartedTelemetry) {
    log('STEP', `═══════════════════════════════════════════════════════`);
    log('STEP', `  GATE: ${gate.title}`);
    log('STEP', `═══════════════════════════════════════════════════════`);
  }

  const priorResult = prepareInitialBusterGateAttempt({ config, deps, gateId, gate, attempt, opts });
  if (priorResult) return priorResult;

  const busterGatePolicy = deps.resolvePolicy(config, progress, 'buster', {
    scopeModel: selectTruthyValue(() => (gate.model), () => (null)),
    dispatchPath: config?.agents?.buster?.dispatch,
  });
  const model = busterGatePolicy.model;
  deps.logEffectivePolicy(config, { scope: 'gate_buster', agent: 'buster', gateId, ...busterGatePolicy });
  log('INFO', `Gate '${gateId}' model: ${selectDefinedValue(() => (model), () => ('model_not_configured'))} [${busterGatePolicy.model_source}] thinking: ${selectDefinedValue(() => (busterGatePolicy.thinking), () => ('thinking_not_configured'))} (${busterGatePolicy.thinking_source})`);

  const instructionsResult = await readBusterGateInstructions({ config, deps, gateId, gate, attempt, model, busterGatePolicy, opts });
  if (instructionsResult.errorResult) return instructionsResult.errorResult;
  const instructions = instructionsResult.instructions;
  const pipelineDefaults = getPipelineDefaultsConfig(config);
  const timeout = gateTimeoutAuthority(gate, pipelineDefaults);
  const maxFixCycles = Number(selectDefinedValue(() => (gate.max_fix_cycles), () => (0)));
  const hasFixLoop = gate.on_fail === 'fix_and_retest' && Number.isFinite(maxFixCycles) && maxFixCycles > 0;

  await emitBusterGateStarted({ config, gateId, gate, attempt, maxFixCycles, hasFixLoop, opts });

  return executeBusterGateEvaluation({ config, progress, deps, gateId, gate, model, timeout, instructions, attempt, busterGatePolicy, correlation, maxFixCycles, hasFixLoop, gateStartedAt, opts });
}

async function executeBusterGateEvaluation(input: any) {
  const { config, progress, deps, gateId, gate, model, timeout, instructions, attempt, busterGatePolicy, correlation, maxFixCycles, hasFixLoop, gateStartedAt, opts } = input;
  const maxRateLimitPauses = getRateLimitConfig(config).max_pauses_per_module;
  const result = await withSessionRateLimitRecovery(config,
    () => runBusterGateOnce({ deps, config, progress, gateId, gate, model, timeout, instructions, attempt, busterGatePolicy }),
    createTrackedGateSessionRateLimitRecoveryOptions(config, {
      sleepFn: deps.sleep,
      discordFn: deps.discord,
      gateId,
      gateType: gate.type,
      identity: {
        agent_type: gateType(gate),
        run_id: getRunId(config),
        attempt,
        dispatch_id: selectTruthyValue(() => (correlation.dispatch_id), () => (null)),
        gateway_label: selectTruthyValue(() => (correlation.gateway_label), () => (null)),
        session_key: selectTruthyValue(() => (correlation.session_key), () => (null)),
      },
      updateCorrelation: () => correlation,
      maxPauses: maxRateLimitPauses,
      pauseState: createRateLimitPauseState(),
      resumeDescription: `Resuming gate ${gateId}`,
      pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }: any) => `Gate '${gateId}' rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
      resumeLogMessage: () => `Gate '${gateId}' rate limit cooldown complete — retrying (attempt stays at ${attempt} due to rate limit)`,
      suppressPausePresentation: ({ status }: any) => String(selectDefinedValue(() => (status?.source), () => (''))).toLowerCase() === BUSTER_PIPELINE_SOURCE,
      exhaustedResultConfig: {
        resultOverrides: { outcome_class: 'rate_limited' },
      },
    }));
  return handleBusterGateEvaluationResult({ config, deps, gateId, gate, result, attempt, opts, correlation, timeout, maxRateLimitPauses, maxFixCycles, hasFixLoop, gateStartedAt,
    callbacks: {
      getGateStats,
      buildBusterGateControlResult,
      buildBusterRequestFixControlResult,
      extractGateIssues,
      telemetryCtx: (cfg: any) => _telemetryCtx(cfg, opts.deps),
    } });
}

function prepareInitialBusterGateAttempt({ config, deps, gateId, gate, attempt, opts }: any) {
  if (attempt !== 1) return null;
  const completion = deps.readBusterGateCompletion(config, gateId, gate);
  if (completion.isPass) {
    log('OK', `Gate '${gateId}' already completed via output_file — skipping`);
    return buildBusterGateControlResult(config, gateId, gate, { status: STATUS.PASS, passed: true, outcome_class: 'passed', completion_source: completion.source || null, attempt }, { ...opts, input: { ids: { attempt } } });
  }
  const staleStatus = completion.output.exists && !completion.output.isPass ? completion.output?.data?.status : null;
  if (staleStatus) log('INFO', `Gate '${gateId}' output file exists but status is '${staleStatus}' — re-running`);
  archiveInitialBusterGateArtifacts(config, deps, gateId, gate);
  return null;
}

function archiveInitialBusterGateArtifacts(config: any, deps: any, gateId: any, gate: any) {
  if (gate.output_file) {
    const outputPath = gateOutputPath(config, gate);
    if (!outputPath) throw new Error(`Gate '${gateId}' requires a canonical output path`);
    archiveBusterGateArtifact(config, deps, gateId, outputPath);
  }
  archiveBusterGateArtifact(config, deps, gateId, gateStatusPath(config, gateId), 'gate-status');
}

function archiveBusterGateArtifact(config: any, deps: any, gateId: any, filePath: string, label?: string) {
  try {
    const archived = deps.archiveGateOutputIfPresent(config, gateId, filePath, label ? { label } : undefined);
    if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent. */ }
}

async function readBusterGateInstructions(input: any) {
  const { config, deps, gateId, gate, attempt, model, busterGatePolicy, opts } = input;
  try {
    return { instructions: deps.readGateInstructions(config, gate), errorResult: null };
  } catch (error: any) {
    log('ERROR', `Gate '${gateId}' instructions read failed: ${error.message}`);
    if (!opts.skipStartedTelemetry) await onGateStarted(_telemetryCtx(config, opts.deps), gateId, gate);
    await onGateFail(_telemetryCtx(config, opts.deps), gateId, buildInstructionFailureTelemetry({ config, gateId, gate, attempt, model, busterGatePolicy, error }));
    return { instructions: null, errorResult: buildBusterGateControlResult(config, gateId, gate, { reason: error.message, failure_class: 'instructions_read_failed', outcome_class: 'error', attempt }, { ...opts, input: { ids: { attempt } } }) };
  }
}

function buildInstructionFailureTelemetry({ config, gateId, gate, attempt, model, busterGatePolicy, error }: any) {
  const reasoningLevel = busterGatePolicy.thinking_supported === false ? 'not supported' : (busterGatePolicy.thinking || 'thinking_not_configured');
  return { gate_type: gate.type, reason: `Gate '${gateId}' instructions read failed: ${error.message}`, presentation: { discord: { level: 'CRITICAL', title: `Buster Gate Setup Failed: ${gate.title}`, description: `Gate instructions could not be read: ${error.message}`, fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt, model, reasoning_level: reasoningLevel, thinking_source: busterGatePolicy.thinking_source || null, runtime: 'session' }) } } };
}

async function emitBusterGateStarted({ config, gateId, gate, attempt, maxFixCycles, hasFixLoop, opts }: any) {
  if (opts.skipStartedTelemetry) return;
  await onGateStarted(_telemetryCtx(config, opts.deps), gateId, gate, { presentation: { discord: { level: 'INFO', title: `Gate: ${gate.title}`, description: `Starting buster gate${hasFixLoop ? ` (fix loop: max ${maxFixCycles})` : ''}`, fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt }) } } });
}

export async function runBusterGateFixAttempt(config: any, progress: any, gateId: any, controlResult: any, opts: any = {}) {
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
      telemetryCtx: (cfg: any) => _telemetryCtx(cfg, opts.deps),
    },
  });
}


export function createBusterGateRemediationController({ config, progress, gateId, gate, opts = {}, gateStartedAt }: any) {
  const fixHistory = arrayValue(opts.fixHistory);
  return {
    evaluateGate: ({ attempt, controlResult: remediationControlResult, remediation }: any) => runBusterGateEvaluation(config, progress, gateId, {
      attempt,
      gateStartedAt,
      skipStartedTelemetry: true,
      remediation,
      controlResult: remediationControlResult,
      deps: opts.deps,
    }),
    performFix: ({ controlResult: remediationControlResult, cycle }: any) => runBusterGateFixAttempt(config, progress, gateId, remediationControlResult, {
      cycle,
      gateStartedAt,
      fixHistory,
      deps: opts.deps,
    }),
    buildExhaustedControlResult: ({ controlResult: remediationControlResult }: any) =>
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


export async function runBusterGateStage(config: any, progress: any, gateId: any, opts: any = {}) {
  return runBusterGateEvaluation(config, progress, gateId, opts);
}
