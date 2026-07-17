import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/review-gate-runner.ts — Review gate runner
// Handles the review gate lifecycle:
//   1. Completion check (content-aware: FAIL files are not complete)
//   2. Lint report generation (deterministic static analysis)
//   3. Echo reviewer spawn → poll output file → parse PASS/FAIL
//   4. FAIL becomes action-required; review gates do not auto-fix.

import { selectDeps } from '../core/deps.ts';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { resolvePolicy, logEffectivePolicy } from '../core/config.ts';
import { gateOutputPath } from '../core/paths.ts';
import { gitExec, invalidateHeadHash } from '../core/git-context.ts';
import { discord } from '../integrations/discord.ts';
import { gitCommitAndPush } from '../integrations/git-worktree.ts';
import { archiveGateOutputIfPresent } from '../services/status-store.ts';
import { pollForFile, sleep } from '../services/polling.ts';
import { generateLintReport, formatLintReportForReviewer } from '../services/lint.ts';
import { readGateInstructions } from '../prompts/buster-gate.ts';
import { buildReviewerPrompt } from '../prompts/review.ts';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive, spawnReviewerAgent, killReviewerAgent } from '../agents/orchestration.ts';
import { getTrackedAgent } from '../agents/lifecycle.ts';
import { pollForSessionEnd } from '../services/polling.ts';
import { getActiveContext } from '../core/logger.ts';
import { onGateStarted } from '../services/telemetry.ts';
import {
  finalizeGateSessionRateLimitExit,
  getRateLimitConfig,
} from '../services/rate-limit.ts';
import {
  resolveResultSessionKey,
  resolveResultGatewayLabel,
} from '../services/correlation.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import {
  extractReviewIssues,
  summarizeReviewFailReason,
} from './review-gate-output.ts';
import { GATE_CONTROL_ACTIONS } from '../services/contracts/gate-control-result.ts';
import {
  buildReviewGateControlResult,
  coerceReviewGateControlResult,
} from './review-gate-control.ts';
import {
  reviewOutputPath,
  runReviewGateOnce,
} from './review-gate-task.ts';
import { getReviewDefaultsConfig } from '../services/runtime-defaults.ts';

const REVIEW_GATE_TYPE = 'review';
const REVIEW_GATE_FAIL_ACTION_STOP = 'stop';
const REVIEW_GATE_FIRST_ATTEMPT = 1;
const REVIEW_GATE_NO_REVIEWER = 'none';
const REVIEW_GATE_MISSING_STATUS = 'missing';
const TELEMETRY_CONTEXT_MISSING_RUN_ID = '';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function requireRunId(config) {
  const runId = getRunId(config);
  if (!runId) throw new Error('Review gate requires typed run id');
  return runId;
}

function requireReviewerLabel(reviewer) {
  const label = reviewerLabel(reviewer);
  if (!label) throw new Error('Review gate reviewer requires typed label');
  return label;
}

function reviewerLabels(reviewers) {
  return reviewers.map(requireReviewerLabel);
}

function resolveGateStartedAt(opts, remediation = null) {
  if (opts.gateStartedAt !== undefined) return opts.gateStartedAt;
  if (remediation?.startedAt) return new Date(remediation.startedAt).getTime();
  return Date.now();
}

function resolveReviewConfigOption(config, progress, gate, opts) {
  if (opts.reviewConfig !== undefined) return opts.reviewConfig;
  return resolveReviewConfig(config, progress, gate);
}

function normalizedUpperText(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function _telemetryCtx(config) {
  return selectTruthyValue(() => (getActiveContext()), () => ({ config, runId: selectPresentValue(config?.run_id, config?._runId, TELEMETRY_CONTEXT_MISSING_RUN_ID) }));
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
  return selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (reviewer?.label), () => (reviewer?.id))), () => (reviewer?.name))), () => (null));
}

function resolvePrimaryReviewer(gate, projectDefaults, reviewers, reviewersSource) {
  const explicit = selectDefinedValue(() => (selectDefinedValue(() => (gate?.primary_reviewer), () => (projectDefaults?.primary_reviewer))), () => (null));
  const explicitLabel = reviewerLabel(explicit);
  if (explicitLabel) {
    const reviewer = reviewers.find((candidate) => reviewerLabel(candidate) === explicitLabel);
    return {
      reviewer: selectDefinedValue(() => (reviewer), () => (null)),
      policy: reviewer ? 'explicit_primary_reviewer' : 'primary_reviewer_not_configured',
      source: reviewer ? reviewersSource : 'primary_reviewer',
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
  let rawRequired;
  if (gate?.lint_required !== undefined) {
    rawRequired = gate.lint_required;
  } else {
    rawRequired = defaults?.lint_required;
  }
  if (rawRequired === false) return { lintRequired: false, source: 'explicit_optional_review_lint' };
  if (rawRequired === true) return { lintRequired: true, source: 'explicit_required_review_lint' };
  return { lintRequired: Boolean(lintTier), source: 'configured_review_lint_required' };
}

function resolveReviewConfig(config, progress, gate) {
  const defaults = getReviewDefaultsConfig(config);
  const projectDefaults = isPlainObject(progress?.defaults) ? progress.defaults : {};
  const { reviewers, source: reviewersSource } = resolveReviewers(gate, projectDefaults);
  const primary = resolvePrimaryReviewer(gate, projectDefaults, reviewers, reviewersSource);
  const timeout = coercePositiveNumber(gate.timeout_minutes);
  const maxFixCycles = coerceNonNegativeNumber(selectDefinedValue(() => (gate.max_fix_cycles), () => (0)));
  const lintTier = gate.lint_tier
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
  if (selectTruthyValue(() => (!Array.isArray(reviewConfig.reviewers)), () => (reviewConfig.reviewers.length === 0))) {
    errors.push(`No reviewers configured for gate '${gateId}'`);
  }
  if (!reviewConfig.primaryReviewer) {
    errors.push(`Review gate '${gateId}' requires an explicit primary reviewer policy`);
  }
  if (selectTruthyValue(() => (!Number.isFinite(reviewConfig.timeout)), () => (reviewConfig.timeout <= 0))) {
    errors.push(`Review gate '${gateId}' requires typed review timeout policy`);
  }
  if (!reviewConfig.lintTier) {
    errors.push(`Review gate '${gateId}' requires typed review lint tier policy`);
  }
  return errors;
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

export async function runReviewGateEvaluation(config, progress, gateId, opts = {}) {
  const deps = getReviewGateRunnerDeps(config, opts.deps);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const reviewConfig = resolveReviewConfigOption(config, progress, gate, opts);
  const { reviewers } = reviewConfig;
  const failAction = REVIEW_GATE_FAIL_ACTION_STOP;
  const maxRateLimitPauses = getRateLimitConfig(config).max_pauses_per_module;
  const attempt = Number(selectDefinedValue(() => (opts.attempt), () => (REVIEW_GATE_FIRST_ATTEMPT)));
  const gateStartedAt = resolveGateStartedAt(opts);

  if (!opts.skipStartedTelemetry) {
    log('STEP', `═══════════════════════════════════════════════════════`);
    log('STEP', `  REVIEW GATE: ${gate.title}`);
    log('STEP', `  Reviewer: ${selectPresentValue(reviewConfig.primaryReviewer?.label, REVIEW_GATE_NO_REVIEWER)} | lint_tier: ${reviewConfig.lintTier}`);
    log('STEP', `  on_fail: ${failAction} | max_fix_cycles: ${reviewConfig.maxFixCycles}`);
    log('STEP', `═══════════════════════════════════════════════════════`);
  }

  if (attempt === 1 && gate.output_file) {
    const outPath = gateOutputPath(config, gate);
    if (fs.existsSync(outPath)) {
      let isCompleted = false;
      try {
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const s = normalizedUpperText(data.status);
        if (s === 'PASS') {
          isCompleted = true;
        } else if (s === 'FAIL') {
          log('INFO', `Review gate '${gateId}' output file exists but status is '${data.status}' — re-running`);
        } else {
          log('WARN', `Review gate '${gateId}' output file has invalid status '${selectPresentValue(data.status, REVIEW_GATE_MISSING_STATUS)}' — re-running`);
        }
      } catch (e) {
        log('WARN', `Review gate '${gateId}' output file is not valid JSON — re-running (${e.message})`);
      }

      if (isCompleted) {
        log('OK', `Review gate '${gateId}' already completed — skipping`);
        return buildReviewGateControlResult(config, gateId, gate, { outcome_class: 'passed', attempt }, opts);
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
        reviewers: reviewerLabels(reviewers),
      });
    }
    return buildReviewGateControlResult(config, gateId, gate, { reason: setupReason, failure_class: 'config_invalid', outcome_class: 'error', attempt }, opts);
  }

  const primaryReviewer = reviewConfig.primaryReviewer;
  const reviewerLabel = selectTruthyValue(() => (primaryReviewer?.label), () => (null));
  if (!opts.skipStartedTelemetry) {
    await onGateStarted(_telemetryCtx(config), gateId, {
        ...gate,
        reviewers: reviewerLabels(reviewers),
    }, {
      presentation: {
        discord: {
          level: 'INFO',
          title: `Review Gate: ${gate.title}`,
          description: `Reviewer: ${selectPresentValue(reviewerLabel, REVIEW_GATE_NO_REVIEWER)} with lint report (tier: ${reviewConfig.lintTier}, ${reviewConfig.lintRequired ? 'required' : 'optional'})`,
          fields: [
            ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: requireRunId(config), gate_id: gateId, gate_type: gate.type, attempt }),
            { name: 'Reviewer', value: selectPresentValue(reviewerLabel, REVIEW_GATE_NO_REVIEWER) },
            { name: 'on_fail', value: failAction },
          ],
        },
      },
    });
  }

  const reviewResult = deps.runOnce
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
      reason: exhaustedReason,
      resultOverrides: { outcome_class: 'rate_limited' },
      telemetryCtx: _telemetryCtx(config),
      runId: getRunId(config),
      discordFn: deps.discord,
      discordTitle: `Review Gate Rate Limit Exhausted: ${gate.title}`,
      discordDescription: (exitResult) => `Review attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      beforeReturn: () => {
        getGateStats(config).gates_failed.push(gateId);
      },
      gateFailureData: (exitResult) => ({
        fix_cycle: Math.max(0, (selectDefinedValue(() => (exitResult.attempt), () => (REVIEW_GATE_FIRST_ATTEMPT))) - 1),
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: `Review Gate Rate Limit Exhausted: ${gate.title}`,
            description: `Review attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
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
      logMessage: `Review gate '${gateId}' rate limit pauses exhausted`,
    });
    return buildReviewGateControlResult(config, gateId, gate, {
      ...reviewRateLimitExit,
      failure_class: 'rate_limit_exhausted',
      outcome_class: 'rate_limited',
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (reviewResult.error) {
    if (reviewResult.invalid_contract) {
      log('ERROR', `Review gate '${gateId}' invalid output contract: ${reviewResult.error}`);
      const reviewSessionKey = resolveResultSessionKey(reviewResult);
      const reviewGatewayLabel = resolveResultGatewayLabel(reviewResult);
      return buildReviewGateControlResult(config, gateId, gate, {
        reason: `Review invalid output: ${reviewResult.error}`,
        failure_class: 'invalid_contract',
        outcome_class: 'error',
        gateway_label: reviewGatewayLabel,
        session_key: reviewSessionKey,
        attempt,
      }, { ...opts, input: { ids: { attempt } } });
    }

    log('ERROR', `Review gate '${gateId}' failed: ${reviewResult.error}`);
    const reviewSessionKey = resolveResultSessionKey(reviewResult);
    const reviewGatewayLabel = resolveResultGatewayLabel(reviewResult);
    const failureClass = typeof reviewResult?.failure_class === 'string' && reviewResult.failure_class.trim()
      ? reviewResult.failure_class.trim()
      : 'review_failed';
    return buildReviewGateControlResult(config, gateId, gate, {
      reason: `Review failed: ${reviewResult.error}`,
      failure_class: failureClass,
      gateway_label: reviewGatewayLabel,
      session_key: reviewSessionKey,
      attempt,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (reviewResult.ok) {
    const reviewSessionKey = resolveResultSessionKey(reviewResult);
    const merged = objectRecord(reviewResult.mergedResult);
    const criticalIssues = arrayValue(merged.critical_issues).length + arrayValue(merged.critical_blockers).length;
    const deferredIssues = arrayValue(merged.deferred_issues).length;
    const findingsCount = arrayValue(merged.findings).length;
    log('OK', `Review gate '${gateId}' PASS`);
    return buildReviewGateControlResult(config, gateId, gate, {
      outcome_class: 'passed',
      attempt,
      gateway_label: resolveResultGatewayLabel(reviewResult),
      session_key: reviewSessionKey,
      critical_issues_count: criticalIssues,
      deferred_issues_count: deferredIssues,
      findings_count: findingsCount,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    }, { ...opts, input: { ids: { attempt } } });
  }

  log('WARN', `Review gate '${gateId}' FAIL`);
  const issues = extractReviewIssues(reviewResult.mergedResult);
  log('INFO', `${issues.length} critical issue(s) extracted from review`);
  const failReason = summarizeReviewFailReason(issues, reviewResult?.mergedResult);

  return buildReviewGateControlResult(config, gateId, gate, {
    reason: `Review gate '${gateId}' FAIL`,
    failure_class: 'verdict_fail',
    outcome_class: 'needs_nova',
    attempt,
    last_review: reviewResult.mergedResult,
    gatewayLabel: resolveResultGatewayLabel(reviewResult),
    sessionKey: resolveResultSessionKey(reviewResult),
  }, { ...opts, input: { ids: { attempt } } });
}

export function getReviewGateControlAdapter() {
  return Object.freeze({
    mode: 'standard',
    label: 'Review',
    allowedNextActions: [GATE_CONTROL_ACTIONS.PASS, GATE_CONTROL_ACTIONS.BLOCK],
    coerce: coerceReviewGateControlResult,
  });
}


export async function runReviewGateStage(config, progress, gateId, opts = {}) {
  return runReviewGateEvaluation(config, progress, gateId, opts);
}
