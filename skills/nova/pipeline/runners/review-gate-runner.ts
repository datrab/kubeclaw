// runners/review-gate-runner.ts — review gate lifecycle orchestration.

import fs from 'fs';
import path from 'path';
import { selectDeps } from '../core/deps.ts';
import { log, getActiveContext } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { resolvePolicy, logEffectivePolicy } from '../core/policy.ts';
import { gateOutputPath } from '../core/paths.ts';
import { gitExec, invalidateHeadHash } from '../core/git-context.ts';
import { discord } from '../integrations/discord.ts';
import { gitCommitAndPush } from '../integrations/git-worktree.ts';
import { archiveGateOutputIfPresent } from '../services/status-store.ts';
import { pollForFile, pollForSessionEnd, sleep } from '../services/polling.ts';
import { generateLintReport, formatLintReportForReviewer } from '../services/lint.ts';
import { readGateInstructions } from '../prompts/buster-gate.ts';
import { buildReviewerPrompt } from '../prompts/review.ts';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive, spawnReviewerAgent, killReviewerAgent } from '../agents/orchestration.ts';
import { getTrackedAgent } from '../agents/lifecycle.ts';
import { onGateStarted } from '../services/telemetry.ts';
import { getRateLimitConfig } from '../services/rate-limit.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { GATE_CONTROL_ACTIONS } from '../services/contracts/gate-control-result.ts';
import { buildReviewGateControlResult, coerceReviewGateControlResult } from './review-gate-control.ts';
import { reviewOutputPath, runReviewGateOnce } from './review-gate-task.ts';
import { resolveReviewGateConfig, reviewGateConfigErrors, reviewReviewerLabel } from './review-gate-config.ts';
import { resolveReviewGateResult } from './review-gate-result.ts';

type AnyRecord = Record<string, any>;
const FIRST_ATTEMPT = 1;

const DEFAULT_DEPS = {
  resolvePolicy, logEffectivePolicy, discord, gitCommitAndPush, archiveGateOutputIfPresent,
  pollForFile, sleep, generateLintReport, formatLintReportForReviewer, readGateInstructions,
  buildReviewerPrompt, acpLabel, spawnAgent, killAgent, verifyAgentAlive, spawnReviewerAgent,
  killReviewerAgent, getTrackedAgent, pollForSessionEnd,
};

function telemetryContext(config: AnyRecord) {
  const active = getActiveContext();
  if (active) return active;
  return { config, runId: getRunId(config) || '', stats: { errors: [] } };
}

function runnerDeps(overrides: AnyRecord = {}) {
  return { ...DEFAULT_DEPS, ...selectDeps(overrides, 'reviewGate') };
}

function reviewerLabels(reviewers: AnyRecord[]) {
  return reviewers.map((reviewer) => {
    const label = reviewReviewerLabel(reviewer);
    if (!label) throw new Error('Review gate reviewer requires typed label');
    return label;
  });
}

function completedOutput(config: AnyRecord, gateId: string, gate: AnyRecord, attempt: number) {
  if (attempt !== FIRST_ATTEMPT || !gate.output_file) return false;
  const output = gateOutputPath(config, gate);
  if (!output) throw new Error(`Review gate '${gateId}' requires a canonical output path`);
  if (!fs.existsSync(output)) return false;
  try {
    const status = String(JSON.parse(fs.readFileSync(output, 'utf8')).status || '').trim().toUpperCase();
    if (status === 'PASS') return true;
    log(status === 'FAIL' ? 'INFO' : 'WARN', `Review gate '${gateId}' output status is '${status || 'missing'}' — re-running`);
  } catch (error: any) {
    log('WARN', `Review gate '${gateId}' output file is not valid JSON — re-running (${error.message})`);
  }
  return false;
}

function logReviewStart(gate: AnyRecord, review: AnyRecord) {
  log('STEP', '═══════════════════════════════════════════════════════');
  log('STEP', `  REVIEW GATE: ${gate.title}`);
  log('STEP', `  Reviewer: ${review.primaryReviewer?.label || 'none'} | lint_tier: ${review.lintTier}`);
  log('STEP', `  on_fail: stop | max_fix_cycles: ${review.maxFixCycles}`);
  log('STEP', '═══════════════════════════════════════════════════════');
}

async function emitStarted(config: AnyRecord, gateId: string, gate: AnyRecord, review: AnyRecord, attempt: number) {
  const runId = getRunId(config);
  if (!runId) throw new Error('Review gate requires typed run id');
  const reviewer = review.primaryReviewer?.label || 'none';
  await onGateStarted(telemetryContext(config), gateId, { ...gate, reviewers: reviewerLabels(review.reviewers) }, {
    presentation: { discord: {
      level: 'INFO', title: `Review Gate: ${gate.title}`,
      description: `Reviewer: ${reviewer} with lint report (tier: ${review.lintTier}, ${review.lintRequired ? 'required' : 'optional'})`,
      fields: [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
          run_id: runId, gate_id: gateId, gate_type: gate.type, attempt,
        }),
        { name: 'Reviewer', value: reviewer }, { name: 'on_fail', value: 'stop' },
      ],
    } },
  });
}

async function prepareEvaluation(context: AnyRecord) {
  const { config, progress, gateId, gate, opts, reviewConfig, attempt } = context;
  if (!opts.skipStartedTelemetry) logReviewStart(gate, reviewConfig);
  if (completedOutput(config, gateId, gate, attempt)) {
    log('OK', `Review gate '${gateId}' already completed — skipping`);
    return buildReviewGateControlResult(config, gateId, gate, { outcome_class: 'passed', attempt }, opts);
  }
  const errors = reviewGateConfigErrors(gateId, reviewConfig);
  if (errors.length === 0) {
    if (!opts.skipStartedTelemetry) await emitStarted(config, gateId, gate, reviewConfig, attempt);
    return null;
  }
  log('ERROR', errors.join('; '));
  if (!opts.skipStartedTelemetry) {
    await onGateStarted(telemetryContext(config), gateId, { ...gate, reviewers: reviewerLabels(reviewConfig.reviewers) });
  }
  const reason = errors[0] === `No reviewers configured for gate '${gateId}'` ? 'No reviewers configured' : errors.join('; ');
  return buildReviewGateControlResult(config, gateId, gate, {
    reason, failure_class: 'config_invalid', outcome_class: 'error', attempt,
  }, opts);
}

export async function cleanupReviewFiles(config: AnyRecord, gate: AnyRecord, reviewers: AnyRecord[]) {
  const cleaned: string[] = [];
  for (const reviewer of reviewers) {
    const file = reviewOutputPath(config, gate, reviewer.label);
    try {
      if (fs.existsSync(file)) { fs.unlinkSync(file); cleaned.push(file); log('INFO', `Cleaned up: ${path.basename(file)}`); }
    } catch (_error: unknown) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent. */ }
  }
  const merged = gate.output_file ? gateOutputPath(config, gate) : null;
  try {
    if (merged && fs.existsSync(merged)) { fs.unlinkSync(merged); cleaned.push(merged); }
  } catch (_error: unknown) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): cleanup is idempotent. */ }
  const tracked = cleaned.map((file) => path.relative(config.repo_root, file)).filter((file) => {
    try { gitExec(config.repo_root, ['ls-files', '--error-unmatch', '--', file], { stdio: 'ignore' }); return true; }
    catch (_error: unknown) { return false; }
  });
  if (tracked.length === 0) return;
  try {
    gitExec(config.repo_root, ['add', '--', ...tracked], { stdio: 'ignore' });
    gitExec(config.repo_root, ['commit', '-m', `[pipeline] Cleanup ${tracked.length} review file(s) before re-review`], { stdio: 'ignore' });
    invalidateHeadHash(config);
    log('OK', `Review cleanup committed (${tracked.length} file(s))`);
  } catch (_error: unknown) {
    log('DEBUG', 'Review cleanup: nothing to commit (files may have been untracked)');
  }
}

export async function runReviewGateEvaluation(config: AnyRecord, progress: AnyRecord, gateId: string, opts: AnyRecord = {}) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);
  const deps = runnerDeps(opts.deps);
  const reviewConfig = opts.reviewConfig ?? resolveReviewGateConfig(config, progress, gate);
  const attempt = Number(opts.attempt ?? FIRST_ATTEMPT);
  const gateStartedAt = opts.gateStartedAt ?? Date.now();
  const context = { config, progress, gateId, gate, opts, deps, reviewConfig, attempt, gateStartedAt };
  const setupResult = await prepareEvaluation(context);
  if (setupResult) return setupResult;
  const reviewResult = deps.runOnce
    ? await deps.runOnce(deps, config, progress, gateId, gate, reviewConfig, attempt)
    : await runReviewGateOnce({ deps, config, progress, gateId, gate, reviewConfig, reviewAttempt: attempt });
  return resolveReviewGateResult({
    ...context, maxRateLimitPauses: getRateLimitConfig(config).max_pauses_per_module,
    telemetryContext: telemetryContext(config),
  }, reviewResult);
}

export function getReviewGateControlAdapter() {
  return Object.freeze({
    mode: 'standard', label: 'Review',
    allowedNextActions: [GATE_CONTROL_ACTIONS.PASS, GATE_CONTROL_ACTIONS.BLOCK],
    coerce: coerceReviewGateControlResult,
  });
}

export async function runReviewGateStage(config: AnyRecord, progress: AnyRecord, gateId: string, opts: AnyRecord = {}) {
  return runReviewGateEvaluation(config, progress, gateId, opts);
}
