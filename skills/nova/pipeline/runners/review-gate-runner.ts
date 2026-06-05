// runners/review-gate-runner.ts — Review gate runner
// Handles the review gate lifecycle:
//   1. Completion check (content-aware: NO-GO files are not complete)
//   2. Lint report generation (deterministic static analysis)
//   3. Echo reviewer spawn → poll output file → parse GO/NO-GO
//   4. Fix-and-rereview loop (Forge fixes issues, Echo re-reviews)

import { selectDeps } from '../core/deps.ts';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_RATE_LIMITED } from '../core/constants.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { resolvePolicy, logEffectivePolicy } from '../core/config.ts';
import { relPath, gateOutputPath } from '../core/paths.ts';
import { gitExec, invalidateHeadHash } from '../core/git-context.ts';
import { discord } from '../integrations/discord.ts';
import { gitCommitAndPush } from '../integrations/git-worktree.ts';
import { archiveGateOutputIfPresent } from '../services/status-store.ts';
import { truncateForDiscord } from '../services/failures/presentation.ts';
import { pollForFile, sleep } from '../services/polling.ts';
import { generateLintReport, formatLintReportForReviewer } from '../services/lint.ts';
import { readGateInstructions } from '../prompts/buster-gate.ts';
import { buildReviewerPrompt } from '../prompts/review.ts';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive, spawnReviewerAgent, killReviewerAgent } from '../agents/orchestration.ts';
import { getTrackedAgent } from '../agents/lifecycle.ts';
import { pollForSessionEnd } from '../services/polling.ts';
import { getActiveContext } from '../core/logger.ts';
import { onGateStarted, onGatePass, onGateFail } from '../services/telemetry.ts';
import {
  emitGateRetryExhausted,
  finalizeGateSessionRateLimitExit,
} from '../services/rate-limit.ts';
import {
  resolveResultDispatchId,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
} from '../services/correlation.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { readGateRemediationSpec } from '../services/remediation-handoff.ts';
import {
  GATE_CONTROL_ACTIONS,
  buildTypedGateControlResult,
  cloneSerializable,
} from '../services/contracts/gate-control-result.ts';
import {
  buildReviewGateFindings,
  extractReviewIssues,
  summarizeReviewNoGoReason,
} from './review-gate-output.ts';
import {
  buildReviewGateControlResult,
  buildReviewRequestFixControlResult,
  coerceReviewGateControlResult,
} from './review-gate-control.ts';
import { performReviewGateFixAttempt } from './review-gate-fix-cycle.ts';
import {
  describeReviewTranscriptActivityState,
  reviewOutputPath,
  runReviewGateOnce,
} from './review-gate-task.ts';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

const DEFAULT_DEPS = {
  resolvePolicy,
  logEffectivePolicy,
  discord,
  gitCommitAndPush,
  archiveGateOutputIfPresent,
  pollForFile,
  sleep,
  generateLintReport,
  formatLintReportForReviewer,
  readGateInstructions,
  buildReviewerPrompt,
  acpLabel,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  spawnReviewerAgent,
  killReviewerAgent,
  getTrackedAgent,
  pollForSessionEnd,
};

function getReviewGateRunnerDeps(config, overrides = {}) {
  return { ...DEFAULT_DEPS, ...selectDeps(overrides, 'reviewGate') };
}

function getGateStats(config) {
  return getRunStats(config);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function coercePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function coerceNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeReviewer(value) {
  if (typeof value === 'string') return { label: value };
  return value;
}

function resolveReviewers(gate, projectDefaults) {
  if (Array.isArray(gate?.reviewers)) return { reviewers: gate.reviewers.map(normalizeReviewer), source: 'gate.reviewers' };
  if (Array.isArray(projectDefaults?.reviewers)) return { reviewers: projectDefaults.reviewers.map(normalizeReviewer), source: 'progress.defaults.reviewers' };
  return { reviewers: [], source: 'none' };
}

function reviewerLabel(reviewer) {
  if (typeof reviewer === 'string') return reviewer;
  return reviewer?.label || reviewer?.id || reviewer?.name || null;
}

function resolvePrimaryReviewer(gate, projectDefaults, reviewers, reviewersSource) {
  const explicit =
    gate?.primaryReviewer ||
    gate?.primary_reviewer ||
    gate?.primary_reviewer_label ||
    projectDefaults?.primaryReviewer ||
    projectDefaults?.primary_reviewer ||
    projectDefaults?.primary_reviewer_label ||
    null;
  const explicitLabel = reviewerLabel(explicit) || (typeof explicit === 'string' ? explicit : null);
  if (explicitLabel) {
    const reviewer = reviewers.find((candidate) => reviewerLabel(candidate) === explicitLabel);
    return {
      reviewer: reviewer || { label: explicitLabel },
      policy: reviewer ? 'explicit_primary_reviewer' : 'explicit_primary_reviewer_label',
      source: reviewer ? reviewersSource : 'primary_reviewer_label',
    };
  }
  if (reviewers.length === 1) {
    const [onlyReviewer] = reviewers;
    return {
      reviewer: onlyReviewer,
      policy: 'single_configured_reviewer',
      source: reviewersSource,
    };
  }
  return {
    reviewer: null,
    policy: reviewers.length > 1 ? 'missing_primary_reviewer' : 'none',
    source: reviewersSource,
  };
}

function resolveReviewLintPolicy(gate, defaults, lintTier) {
  const rawRequired =
    gate?.lint_required ??
    gate?.review_lint_required ??
    defaults?.lint_required ??
    defaults?.review_lint_required;
  if (rawRequired === false) return { lintRequired: false, source: 'explicit_optional_review_lint' };
  if (rawRequired === true) return { lintRequired: true, source: 'explicit_required_review_lint' };
  return { lintRequired: Boolean(lintTier), source: 'configured_review_lint_required' };
}

function resolveReviewConfig(config, progress, gate) {
  const defaults = isPlainObject(config.review_defaults) ? config.review_defaults : {};
  const projectDefaults = isPlainObject(progress?.defaults) ? progress.defaults : {};
  const { reviewers, source: reviewersSource } = resolveReviewers(gate, projectDefaults);
  const primary = resolvePrimaryReviewer(gate, projectDefaults, reviewers, reviewersSource);
  const timeout = coercePositiveNumber(gate.timeout_minutes ?? defaults.timeout_minutes);
  const maxFixCycles = coerceNonNegativeNumber(gate.max_fix_cycles ?? defaults.max_fix_cycles);
  const lintTier = gate.lint_tier ?? defaults.lint_tier;
  const lintPolicy = resolveReviewLintPolicy(gate, defaults, lintTier);
  return {
    reviewers,
    reviewersSource,
    primaryReviewer: primary.reviewer,
    primaryReviewerPolicy: primary.policy,
    primaryReviewerSource: primary.source,
    timeout,
    timeoutPolicySource: gate.timeout_minutes !== undefined ? 'gate.timeout_minutes' : 'config.review_defaults.timeout_minutes',
    maxFixCycles,
    maxFixCyclesPolicySource: gate.max_fix_cycles !== undefined ? 'gate.max_fix_cycles' : 'config.review_defaults.max_fix_cycles',
    lintTier,
    lintRequired: lintPolicy.lintRequired,
    lintPolicySource: lintPolicy.source,
  };
}

function reviewConfigErrors(gateId, reviewConfig) {
  const errors = [];
  if (!Array.isArray(reviewConfig.reviewers) || reviewConfig.reviewers.length === 0) {
    errors.push(`No reviewers configured for gate '${gateId}'`);
  }
  if (!reviewConfig.primaryReviewer) {
    errors.push(`Review gate '${gateId}' requires an explicit primary reviewer policy`);
  }
  if (!Number.isFinite(reviewConfig.timeout) || reviewConfig.timeout <= 0) {
    errors.push(`Review gate '${gateId}' requires typed review timeout policy`);
  }
  if (!Number.isFinite(reviewConfig.maxFixCycles) || reviewConfig.maxFixCycles < 0) {
    errors.push(`Review gate '${gateId}' requires typed max fix-cycle policy`);
  }
  if (!reviewConfig.lintTier) {
    errors.push(`Review gate '${gateId}' requires typed review lint tier policy`);
  }
  return errors;
}

async function emitReviewGateFixCycleFail(config, gateId, gateType, cycle, gateStartedAt, reason, extra = {}) {
  await onGateFail(_telemetryCtx(config), gateId, {
    gate_type: gateType,
    fix_cycle: cycle,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason,
    ...extra,
  });
}

/**
 * Clean up all review files before a re-review cycle.
 */
export async function cleanupReviewFiles(config, gate, reviewers) {
  const cleaned = [];

  for (const reviewer of reviewers) {
    const filePath = reviewOutputPath(config, gate, reviewer.label);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        cleaned.push(filePath);
        log('INFO', `Cleaned up: ${path.basename(filePath)}`);
      }
    } catch (_error) { /* non-critical */ }
  }

  if (gate.output_file) {
    const mergedPath = gateOutputPath(config, gate);
    try {
      if (fs.existsSync(mergedPath)) {
        fs.unlinkSync(mergedPath);
        cleaned.push(mergedPath);
      }
    } catch (_error) { /* ok */ }
  }

  // Commit the deletions so the worktree is clean for subsequent Echo polling.
  if (cleaned.length > 0) {
    try {
      const trackedPathspecs = cleaned
        .map(filePath => path.relative(config.repo_root, filePath))
        .filter(relPath => {
          try {
            gitExec(config.repo_root, ['ls-files', '--error-unmatch', '--', relPath], { stdio: 'ignore' });
            return true;
          } catch (_error) {
            return false;
          }
        });
      if (trackedPathspecs.length === 0) {
        log('DEBUG', 'Review cleanup: removed files were untracked; skipping cleanup commit');
        return;
      }
      gitExec(config.repo_root, ['add', '--', ...trackedPathspecs], { stdio: 'ignore' });
      gitExec(config.repo_root, ['commit', '-m',
        `[pipeline] Cleanup ${trackedPathspecs.length} review file(s) before re-review`],
        { stdio: 'ignore' });
      invalidateHeadHash(config);
      log('OK', `Review cleanup committed (${trackedPathspecs.length} file(s))`);
    } catch (_error) {
      log('DEBUG', 'Review cleanup: nothing to commit (files may have been untracked)');
    }
  }
}

function buildReviewNoGoFields(config, reviewResult, issues = []) {
  const fields = [];
  for (let i = 0; i < Math.min(issues.length, 3); i++) {
    fields.push({ name: `Issue ${i + 1}`, value: truncateForDiscord(issues[i].description, 200), inline: false });
  }
  if (issues.length > 3) {
    const artifactRef = reviewResult?.mergedFilePath ? relPath(config, reviewResult.mergedFilePath) : 'review output';
    fields.push({ name: `+ ${issues.length - 3} more`, value: `See full report: ${artifactRef}`, inline: false });
  }
  return fields;
}

export async function buildReviewRemediationExhaustedControlResult(config, gateId, gate, controlResult, opts = {}) {
  const remediation = readGateRemediationSpec(controlResult) || {};
  const metadata = controlResult?.diagnostics?.metadata || {};
  const gateStartedAt = opts.gateStartedAt ?? (remediation?.startedAt ? new Date(remediation.startedAt).getTime() : Date.now());
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles || metadata?.fix_cycles);
  if (!Number.isFinite(maxFixCycles) || maxFixCycles < 1) throw new Error(`Review remediation exhaustion for '${gateId}' is missing typed maxFixCycles`);
  const latestReviewGatewayLabel = remediation?.correlation?.gateway_label || metadata?.gateway_label || null;
  const latestReviewSessionKey = remediation?.correlation?.session_key || metadata?.session_key || null;
  const lastReview = remediation?.diagnostics?.last_review || metadata?.last_review || null;
  const issues = remediation?.diagnostics?.issues || extractReviewIssues(lastReview);

  log('ERROR', `Review gate '${gateId}' fix_and_rereview exhausted (${maxFixCycles} cycles)`);
  getGateStats(config).gates_failed.push(gateId);
  await onGateFail(_telemetryCtx(config), gateId, {
    gate_type: gate.type,
    issues_count: Array.isArray(issues) ? issues.length : extractReviewIssues(lastReview).length,
    fix_cycle: maxFixCycles,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason: `NO-GO after ${maxFixCycles} fix cycles`,
    session_key: latestReviewSessionKey,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Review: ${gate.title} BLOCKED`,
        description: `Fix-and-rereview exhausted after ${maxFixCycles} cycles. Nova must intervene.`,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: maxFixCycles, gateway_label: latestReviewGatewayLabel, session_key: latestReviewSessionKey }),
      },
    },
  });
  emitGateRetryExhausted(_telemetryCtx(config), gateId, {
    gateType: gate.type,
    phase: 'review_gate_fix',
    attempt: maxFixCycles,
    maxAttempts: maxFixCycles,
    reason: `Review gate '${gateId}' NO-GO after ${maxFixCycles} fix cycles`,
    sessionKey: latestReviewSessionKey,
    gatewayLabel: latestReviewGatewayLabel,
  });

  return buildTypedGateControlResult({
    producerType: 'review',
    nextAction: GATE_CONTROL_ACTIONS.BLOCK,
    issueType: 'code',
    summary: `Review gate '${gateId}' NO-GO after ${maxFixCycles} fix cycles`,
    findings: buildReviewGateFindings(issues),
    metadata: {
      gate_id: gateId,
      gate_type: gate?.type || 'review',
      run_id: getRunId(config) || config?._runId || config?.run_id || null,
      gate: gateId,
      reason: `Review gate '${gateId}' NO-GO after ${maxFixCycles} fix cycles`,
      fix_cycles: maxFixCycles,
      last_review: cloneSerializable(lastReview),
      gateway_label: latestReviewGatewayLabel,
      session_key: latestReviewSessionKey,
    },
    gateRunStatus: STATUS.FAIL,
    outcomeClass: 'needs_nova',
    recommendation: 'stop',
    metrics: {
      fix_cycles: maxFixCycles,
      issues_count: Array.isArray(issues) ? issues.length : 0,
    },
  });
}

export async function runReviewGateEvaluation(config, progress, gateId, opts = {}) {
  const deps = getReviewGateRunnerDeps(config, opts.deps);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const reviewConfig = opts.reviewConfig || resolveReviewConfig(config, progress, gate);
  const { reviewers } = reviewConfig;
  const noGoAction = gate.on_nogo || 'fix_and_rereview';
  const remediation = opts.remediation || readGateRemediationSpec(opts.controlResult) || null;
  const maxRateLimitPauses = config.rate_limit.max_pauses_per_module;
  const attempt = Number(opts.attempt || 1);
  const gateStartedAt = opts.gateStartedAt ?? Date.now();

  if (!opts.skipStartedTelemetry) {
    log('STEP', `═══════════════════════════════════════════════════════`);
    log('STEP', `  REVIEW GATE: ${gate.title}`);
    log('STEP', `  Reviewer: ${reviewConfig.primaryReviewer?.label || 'none'} | lint_tier: ${reviewConfig.lintTier}`);
    log('STEP', `  on_nogo: ${noGoAction} | max_fix_cycles: ${reviewConfig.maxFixCycles}`);
    log('STEP', `═══════════════════════════════════════════════════════`);
  }

  let skipInitialReview = false;
  if (attempt === 1 && gate.output_file) {
    const outPath = gateOutputPath(config, gate);
    if (fs.existsSync(outPath)) {
      let isCompleted = false;
      try {
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const s = String(data.status || '').trim().toUpperCase();
        if (s === 'GO') {
          isCompleted = true;
        } else if (s === 'NO-GO') {
          if (opts.novaPrompt) {
            skipInitialReview = true;
            log('INFO', `Review gate '${gateId}' is ${data.status} + Nova prompt provided — skipping initial review, going to Forge fix`);
          } else {
            log('INFO', `Review gate '${gateId}' output file exists but status is '${data.status}' — re-running`);
          }
        } else {
          log('WARN', `Review gate '${gateId}' output file has invalid status '${data.status || 'missing'}' — re-running`);
        }
      } catch (e) {
        log('WARN', `Review gate '${gateId}' output file is not valid JSON — re-running (${e.message})`);
      }

      if (isCompleted) {
        log('OK', `Review gate '${gateId}' already completed — skipping`);
        return buildReviewGateControlResult(config, gateId, gate, { exit: EXIT_OK, status: STATUS.PASS, attempt }, opts);
      }
    }
  }

  const setupErrors = reviewConfigErrors(gateId, reviewConfig);
  if (setupErrors.length > 0) {
    const setupReason = setupErrors[0] === `No reviewers configured for gate '${gateId}'` ? 'No reviewers configured' : setupErrors.join('; ');
    log('ERROR', setupErrors.join('; '));
    if (!opts.skipStartedTelemetry) {
      await onGateStarted(_telemetryCtx(config), gateId, {
        ...gate,
        reviewers: reviewers.map(r => r.label || r.model || String(r)),
      });
    }
    await onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      reason: setupErrors[0],
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Review Gate Misconfigured: ${gate.title}`,
          description: `${setupErrors[0]}.`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt }),
        },
      },
    });
    return buildReviewGateControlResult(config, gateId, gate, { exit: EXIT_ERROR, reason: setupReason, failure_class: 'config_invalid', attempt }, opts);
  }

  const primaryReviewer = reviewConfig.primaryReviewer;
  const reviewerLabel = primaryReviewer?.label || null;
  if (!opts.skipStartedTelemetry) {
    await onGateStarted(_telemetryCtx(config), gateId, {
      ...gate,
      reviewers: reviewers.map(r => r.label || r.model || String(r)),
    }, {
      presentation: {
        discord: {
          level: 'INFO',
          title: `Review Gate: ${gate.title}`,
          description: `Reviewer: ${reviewerLabel || 'none'} with lint report (tier: ${reviewConfig.lintTier}, ${reviewConfig.lintRequired ? 'required' : 'optional'})`,
          fields: [
            ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt }),
            { name: 'Reviewer', value: reviewerLabel || 'none' },
            { name: 'on_nogo', value: noGoAction },
          ],
        },
      },
    });
  }

  let reviewResult;
  if (skipInitialReview) {
    const outPath = gateOutputPath(config, gate);
    const existingData = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    reviewResult = { ok: false, mergedResult: existingData };
    log('INFO', 'Loaded existing review result for Forge fix (skipped Echo)');
  } else {
    reviewResult = deps.runOnce
      ? await deps.runOnce(deps, config, progress, gateId, gate, reviewConfig, attempt)
      : await runReviewGateOnce({
        deps,
        config,
        progress,
        gateId,
        gate,
        reviewConfig,
        reviewAttempt: attempt,
      });
  }

  if (reviewResult.rate_limit_exhausted) {
    const exhaustedReason = `Review gate '${gateId}' exceeded max rate limit pauses`;
    const reviewRateLimitExit = await finalizeGateSessionRateLimitExit(reviewResult, {
      config,
      gateId,
      gateType: gate.type,
      phase: attempt > 1 ? 'review_gate_rereview' : 'review_gate',
      exhaustedReason,
      identity: {
        run_id: getRunId(config),
        attempt,
        gateway_label: resolveResultGatewayLabel(reviewResult),
      },
      maxPauses: maxRateLimitPauses,
      exit: EXIT_RATE_LIMITED,
      reason: exhaustedReason,
      telemetryCtx: _telemetryCtx(config),
      runId: getRunId(config),
      discordFn: deps.discord,
      discordTitle: attempt > 1 ? `Review Re-Review Rate Limit Exhausted: ${gate.title}` : `Review Gate Rate Limit Exhausted: ${gate.title}`,
      discordDescription: (exitResult) => `${attempt > 1 ? 'Re-review' : 'Review'} attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      beforeReturn: () => {
        getGateStats(config).gates_failed.push(gateId);
      },
      gateFailureData: (exitResult) => ({
        fix_cycle: Math.max(0, (exitResult.attempt ?? 1) - 1),
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: attempt > 1 ? `Review Re-Review Rate Limit Exhausted: ${gate.title}` : `Review Gate Rate Limit Exhausted: ${gate.title}`,
            description: `${attempt > 1 ? 'Re-review' : 'Review'} attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
            fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
              run_id: getRunId(config),
              gate_id: gateId,
              gate_type: gate.type,
              attempt: exitResult.attempt,
              gateway_label: exitResult.gateway_label,
              session_key: exitResult.session_key,
              dispatch_id: exitResult.dispatch_id,
            }),
          },
        },
      }),
      logMessage: `${attempt > 1 ? 'Review re-review' : 'Review gate'} '${gateId}' rate limit pauses exhausted`,
    });
    return buildReviewGateControlResult(config, gateId, gate, {
      ...reviewRateLimitExit,
      failure_class: 'rate_limit_exhausted',
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (reviewResult.error) {
    if (reviewResult.invalid_contract) {
      log('ERROR', `Review gate '${gateId}' invalid output contract: ${reviewResult.error}`);
      const reviewSessionKey = resolveResultSessionKey(reviewResult);
      const reviewDispatchId = resolveResultDispatchId(reviewResult);
      const reviewGatewayLabel = resolveResultGatewayLabel(reviewResult);
      await onGateFail(_telemetryCtx(config), gateId, {
        gate_type: gate.type,
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        reason: `Review invalid output: ${reviewResult.error}`,
        session_key: reviewSessionKey,
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: `Review Gate Invalid Output: ${gate.title}`,
            description: `Review invalid output: ${reviewResult.error}`,
            fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, dispatch_id: reviewDispatchId, gateway_label: reviewGatewayLabel, session_key: reviewSessionKey }),
          },
        },
      });
      return buildReviewGateControlResult(config, gateId, gate, {
        exit: EXIT_ERROR,
        reason: `Review invalid output: ${reviewResult.error}`,
        failure_class: 'invalid_contract',
        gateway_label: reviewGatewayLabel,
        session_key: reviewSessionKey,
        attempt,
      }, { ...opts, input: { ids: { attempt } } });
    }

    log('ERROR', `Review gate '${gateId}' failed: ${reviewResult.error}`);
    const reviewSessionKey = resolveResultSessionKey(reviewResult);
    const reviewDispatchId = resolveResultDispatchId(reviewResult);
    const reviewGatewayLabel = resolveResultGatewayLabel(reviewResult);
    const reviewFailureFields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, dispatch_id: reviewDispatchId, gateway_label: reviewGatewayLabel, session_key: reviewSessionKey });
    const transcriptState = describeReviewTranscriptActivityState(reviewResult.transcript);
    if (transcriptState) reviewFailureFields.push({ name: 'Transcript', value: transcriptState, inline: false });
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Review failed: ${reviewResult.error}`,
      session_key: reviewSessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Review Gate Failed: ${gate.title}`,
          description: `Review failed: ${reviewResult.error}`,
          fields: reviewFailureFields,
        },
      },
    });
    return buildReviewGateControlResult(config, gateId, gate, {
      exit: EXIT_ERROR,
      reason: `Review failed: ${reviewResult.error}`,
      failure_class: 'review_failed',
      gateway_label: reviewGatewayLabel,
      session_key: reviewSessionKey,
      attempt,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (reviewResult.ok) {
    const reviewSessionKey = resolveResultSessionKey(reviewResult);
    log('OK', `Review gate '${gateId}' GO${attempt > 1 ? ` after ${attempt - 1} fix cycle(s)` : ''}`);
    getGateStats(config).gates_completed.push(gateId);
    onGatePass(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: Math.max(0, attempt - 1),
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      session_key: reviewSessionKey,
      presentation: {
        discord: {
          level: 'OK',
          title: `Review: ${gate.title} GO`,
          description: attempt > 1 ? `Passed after ${attempt - 1} fix cycle(s)` : 'Review approved',
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, gateway_label: resolveResultGatewayLabel(reviewResult), session_key: reviewSessionKey }),
        },
      },
    });
    return buildReviewGateControlResult(config, gateId, gate, { exit: EXIT_OK, status: STATUS.PASS, attempt }, { ...opts, input: { ids: { attempt } } });
  }

  log('WARN', `Review gate '${gateId}' NO-GO`);
  const issues = extractReviewIssues(reviewResult.mergedResult);
  log('INFO', `${issues.length} critical issue(s) extracted from review`);
  const noGoFields = buildReviewNoGoFields(config, reviewResult, issues);
  const noGoReason = summarizeReviewNoGoReason(issues, reviewResult?.mergedResult);

  onGateFail(_telemetryCtx(config), gateId, {
    gate_type: gate.type,
    issues_count: issues.length,
    blockers_count: Array.isArray(reviewResult?.mergedResult?.critical_blockers) ? reviewResult.mergedResult.critical_blockers.length : null,
    fix_cycle: Math.max(0, attempt - 1),
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason: noGoReason,
    session_key: resolveResultSessionKey(reviewResult),
    presentation: {
      discord: {
        level: 'WARN',
        title: attempt > 1 ? 'Review Fix: Still NO-GO' : `Review: ${gate.title} NO-GO — Fix & Re-Review`,
        description: attempt > 1 ? `Cycle ${attempt - 1}/${reviewConfig.maxFixCycles} for ${gate.title}. Echo still found ${issues.length} issue(s).` : `${issues.length} critical issue(s). Starting fix-and-rereview cycle.`,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, gateway_label: resolveResultGatewayLabel(reviewResult), session_key: resolveResultSessionKey(reviewResult) }, noGoFields),
      },
    },
  });

  if (noGoAction !== 'fix_and_rereview') {
    return buildReviewGateControlResult(config, gateId, gate, {
      exit: EXIT_NEEDS_NOVA,
      reason: `Review gate '${gateId}' NO-GO`,
      failure_class: 'verdict_fail',
      attempt,
      last_review: reviewResult.mergedResult,
      gateway_label: resolveResultGatewayLabel(reviewResult),
      session_key: resolveResultSessionKey(reviewResult),
    }, { ...opts, input: { ids: { attempt } } });
  }

  return buildReviewRequestFixControlResult(config, gateId, gate, reviewResult, reviewConfig, {
    attempt,
    reviewerLabel,
    gateStartedAt,
    issues,
    gatewayLabel: resolveResultGatewayLabel(reviewResult),
    sessionKey: resolveResultSessionKey(reviewResult),
  });
}

export async function runReviewGateFixAttempt(config, progress, gateId, controlResult, opts = {}) {
  const deps = getReviewGateRunnerDeps(config, opts.deps);
  const gate = progress.gates[gateId];
  return performReviewGateFixAttempt({
    config,
    progress,
    gateId,
    controlResult,
    opts,
    deps,
    gate,
    reviewConfig: opts.reviewConfig || resolveReviewConfig(config, progress, gate),
    callbacks: {
      buildReviewGateControlResult,
      buildReviewRemediationExhaustedControlResult,
      cleanupReviewFiles,
      emitReviewGateFixCycleFail,
      getGateStats,
      telemetryCtx: _telemetryCtx,
    },
  });
}


export function createReviewGateRemediationController({ config, progress, gateId, gate, opts = {}, gateStartedAt }) {
  const reviewConfig = opts.reviewConfig || resolveReviewConfig(config, progress, gate);
  const fixHistory = opts.fixHistory || [];
  return {
    evaluateGate: ({ attempt, controlResult: remediationControlResult, remediation }) => runReviewGateEvaluation(config, progress, gateId, {
      attempt,
      gateStartedAt,
      reviewConfig,
      skipStartedTelemetry: true,
      controlResult: remediationControlResult,
      remediation,
      deps: opts.deps,
    }),
    performFix: ({ controlResult, cycle }) => runReviewGateFixAttempt(config, progress, gateId, controlResult, {
      cycle,
      novaPrompt: opts?.novaPrompt || null,
      gateStartedAt,
      reviewConfig,
      fixHistory,
      deps: opts.deps,
    }),
    buildExhaustedControlResult: ({ controlResult }) => buildReviewRemediationExhaustedControlResult(config, gateId, gate, controlResult, { gateStartedAt }),
  };
}

export function getReviewGateControlAdapter() {
  return Object.freeze({
    mode: 'remediable',
    label: 'Review',
    coerce: coerceReviewGateControlResult,
    createRemediationController: createReviewGateRemediationController,
  });
}


export async function runReviewGateStage(config, progress, gateId, opts = {}) {
  return runReviewGateEvaluation(config, progress, gateId, opts);
}
