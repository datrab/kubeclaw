// runners/review-gate-runner.js — Review gate runner
// Handles the review gate lifecycle:
//   1. Completion check (content-aware: NO-GO files are not complete)
//   2. Lint report generation (deterministic static analysis)
//   3. Echo reviewer spawn → poll output file → parse GO/NO-GO
//   4. Fix-and-rereview loop (Forge fixes issues, Echo re-reviews)

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_RATE_LIMITED } from '../core/constants.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { resolveModel, resolvePolicy, logEffectivePolicy } from '../core/config.js';
import { swarmRoot, relPath, projectSrcPath, gateLogDir, gateLintLogDir } from '../core/paths.js';
import { gitExec, invalidateHeadHash } from '../core/git.js';
import { discord } from '../integrations/discord.js';
import { gitCommitAndPush } from '../integrations/git.js';
import { archiveGateOutputIfPresent } from '../services/status-store.js';
import { truncateForDiscord } from '../services/failures.js';
import { pollForFile, sleep } from '../services/polling.js';
import { generateLintReport, formatLintReportForReviewer } from '../services/lint.js';
import { readGateInstructions } from '../prompts/buster-gate.js';
import { buildReviewerPrompt } from '../prompts/review.js';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive, spawnReviewerAgent, killReviewerAgent } from '../agents/orchestration.js';
import { transcriptShowsProgress } from '../../../common/pipeline/agents/acp-monitor.js';
import { getTrackedAgent } from '../../../common/pipeline/agents/lifecycle.js';
import { pollForSessionEnd } from '../services/polling.js';
import { getActiveContext } from '../core/logger.js';
import { onGateStarted, onGatePass, onGateFail } from '../services/telemetry.js';
import {
  createTrackedGateSessionRateLimitRecoveryOptions,
  emitGateRetryExhausted,
  finalizeGateSessionRateLimitExit,
  withSessionRateLimitRecovery,
} from '../services/rate-limit.js';
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../services/correlation.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';
import { copyRedactedTranscriptArtifact, writeRedactedPromptArtifact } from '../../../common/pipeline/redaction.js';
import {
  buildGateRemediationRequestControlResult,
  readGateRemediationSpec,
} from '../services/remediation-handoff.js';
import { persistGateActiveSession, clearGateActiveSession } from '../services/gate-active-session.js';
import { finishGateForgeFixCycleScaffold, startGateForgeFixCycleScaffold } from '../services/gate-fix-scaffold.js';
import { runRemediableGateControlLoop } from './remediable-gate-engine.js';
import {
  buildTypedGateControlResult,
  cloneSerializable,
  coerceTypedGateControlResult,
  extractTypedGateLegacyResult,
  isTypedGateControlResult,
} from '../services/gate-control-result.js';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

function buildReviewGateDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
  ], extra);
}

function formatReviewPollFailureReason(pollRes) {
  const reason = pollRes?.reason || 'unknown';
  const detail = pollRes?.status?.detail || null;
  return detail ? `${reason} (${detail})` : reason;
}

function describeTranscriptActivityState(transcript) {
  if (!transcript) return null;
  if (transcriptShowsProgress(transcript)) {
    return `active (${transcript.eventCount} events)`;
  }
  if (typeof transcript.lastActivityPoll === 'number') {
    return `stale (no activity for ${transcript.lastActivityPoll} polls)`;
  }
  return 'present';
}

const DEFAULT_DEPS = {
  resolveModel,
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

function getDeps(config) {
  return { ...DEFAULT_DEPS, ...(config?._testOverrides?.reviewGate || {}) };
}

function getGateStats(config) {
  return getRunStats(config);
}

function resolveReviewConfig(config, gate) {
  const defaults = config.review_defaults ?? {};
  return {
    reviewers: gate.reviewers ?? defaults.reviewers ?? [],
    timeout: gate.timeout_minutes ?? defaults.timeout_minutes ?? config.default_timeout_minutes,
    maxFixCycles: gate.max_fix_cycles ?? defaults.max_fix_cycles ?? config.default_max_fails,
    lintTier: gate.lint_tier ?? defaults.lint_tier ?? 'full',
  };
}

function reviewOutputPath(config, gate, reviewerLabel) {
  return path.join(
    swarmRoot(config),
    gate.review_output_dir || 'echo-reviews',
    `${reviewerLabel}-${gate.review_name}.json`
  );
}

/**
 * Extract actionable issues from a review result for Forge to fix.
 */
function extractReviewIssues(mergedResult) {
  if (!mergedResult) return [];
  const issues = [];

  for (const key of ['critical_issues', 'critical_blockers']) {
    if (Array.isArray(mergedResult[key])) {
      for (const item of mergedResult[key]) {
        issues.push({
          module: item.module || item.component || null,
          location: item.location || null,
          description: item.description || item.title || 'Unknown issue',
          recommended_fix: item.recommended_fix || item.fix || null,
        });
      }
    }
  }

  return issues;
}

function summarizeReviewNoGoReason(issues, mergedResult) {
  const descriptions = (issues || [])
    .map((issue) => issue?.description)
    .filter(Boolean);

  if (descriptions.length > 0) {
    return descriptions.slice(0, 2).join('; ');
  }

  const blockers = Array.isArray(mergedResult?.critical_blockers) ? mergedResult.critical_blockers.length : 0;
  const critical = Array.isArray(mergedResult?.critical_issues) ? mergedResult.critical_issues.length : 0;
  if (blockers > 0) return `${blockers} blocking issue(s) found during review`;
  if (critical > 0) return `${critical} critical issue(s) found during review`;
  return 'Review returned NO-GO';
}

function buildReviewGateFindings(issues = []) {
  return (issues || []).map((issue = {}, index) => ({
    code: `REVIEW_ISSUE_${index + 1}`,
    severity: 'error',
    message: issue.description || issue.title || 'Review issue',
    category: 'review',
    target: issue.location || issue.module || null,
    retryable: false,
    environmentIssue: false,
    metadata: {
      recommended_fix: issue.recommended_fix || null,
    },
  }));
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

function mapReviewLegacyExitToControl(result = {}) {
  switch (result?.exit) {
    case EXIT_OK:
      return { nextAction: 'pass', issueType: undefined, outcomeClass: 'passed' };
    case EXIT_RATE_LIMITED:
      return { nextAction: 'block', issueType: 'environment', outcomeClass: 'rate_limited' };
    case EXIT_NEEDS_NOVA:
      return { nextAction: 'block', issueType: 'code', outcomeClass: 'needs_nova' };
    case EXIT_ERROR:
    default:
      return { nextAction: 'block', issueType: 'unknown', outcomeClass: 'error' };
  }
}

function buildReviewControlSummary(gateId, result = {}) {
  if (result?.exit === EXIT_OK) {
    return `Review gate '${gateId}' passed`;
  }
  if (result?.exit === EXIT_RATE_LIMITED) {
    return result?.reason || `Review gate '${gateId}' exceeded max rate limit pauses`;
  }
  if (result?.exit === EXIT_NEEDS_NOVA) {
    return result?.reason || `Review gate '${gateId}' requires Nova intervention`;
  }
  return result?.reason || `Review gate '${gateId}' failed`;
}

export function buildReviewGateControlResult(config, gateId, gate, result = {}, opts = {}) {
  const mapped = mapReviewLegacyExitToControl(result);
  const runId = getRunId(config) || config?._runId || config?.run_id || null;
  const attempt = Number(result?.attempt || opts?.input?.ids?.attempt || 1);
  const summary = buildReviewControlSummary(gateId, result);
  const issues = extractReviewIssues(result?.last_review || null);
  const metadata = {
    gate_id: gateId,
    gate_type: gate?.type || 'review',
    run_id: runId,
    legacy_exit: result?.exit ?? EXIT_ERROR,
    legacy_status: result?.status || null,
    reason: result?.reason || null,
    attempt,
    fix_cycles: result?.fix_cycles ?? 0,
    gateway_label: result?.gateway_label || null,
    session_key: result?.session_key || null,
    rate_limit_exhausted: result?.rate_limit_exhausted === true,
    max_rate_limit_pauses: result?.max_rate_limit_pauses ?? null,
    last_review: cloneSerializable(result?.last_review || null),
    legacy_result: cloneSerializable(result),
  };

  return buildTypedGateControlResult({
    producerType: 'review',
    nextAction: mapped.nextAction,
    issueType: mapped.issueType,
    summary,
    findings: buildReviewGateFindings(issues),
    metadata,
    gateRunStatus: result?.status || null,
    outcomeClass: mapped.outcomeClass,
    recommendation: mapped.nextAction === 'pass' ? 'proceed' : 'stop',
    metrics: {
      attempt,
      fix_cycles: result?.fix_cycles ?? 0,
      issues_count: issues.length,
    },
  });
}

export function isReviewGateControlResult(result) {
  return isTypedGateControlResult(result, 'review');
}

export function coerceReviewGateControlResult(config, gateId, gate, result, opts = {}) {
  return coerceTypedGateControlResult(result, {
    producerType: 'review',
    build: () => buildReviewGateControlResult(config, gateId, gate, result, opts),
  });
}

export function extractReviewGateLegacyResult(result, gateId, gate) {
  return extractTypedGateLegacyResult(result, gateId, gate, {
    producerType: 'review',
    buildFallbackLegacyResult: ({ metadata, result: controlResult }) => ({
      exit: metadata?.legacy_exit ?? (controlResult?.nextAction === 'pass' ? EXIT_OK : EXIT_ERROR),
      status: metadata?.legacy_status || (controlResult?.nextAction === 'pass' ? STATUS.PASS : null),
      reason: metadata?.reason || controlResult?.diagnostics?.summary || null,
      attempt: metadata?.attempt || 1,
      fix_cycles: metadata?.fix_cycles ?? 0,
      gateway_label: metadata?.gateway_label || null,
      session_key: metadata?.session_key || null,
      rate_limit_exhausted: metadata?.rate_limit_exhausted === true,
      max_rate_limit_pauses: metadata?.max_rate_limit_pauses ?? null,
      last_review: metadata?.last_review || null,
      gate: gateId,
      gate_id: gateId,
      gate_type: gate?.type || 'review',
    }),
  });
}

/**
 * Build a Forge prompt to fix issues found by Echo review.
 */
function buildReviewFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory = []) {
  const header = [
    `## Review Fix: ${gate.title} (Attempt ${attempt}/${maxAttempts})`,
    '',
    `**Project:** ${config.project}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Working Directory:** \`${relPath(config, swarmRoot(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    '',
    'All code paths are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before modifying any files.`,
    '',
  ];

  if (fixHistory.length > 0) {
    header.push(
      '### ⛔ Previous Fix Attempts (Do NOT repeat these approaches)',
      '',
    );
    for (const prev of fixHistory) {
      if (!prev.hasChanges) {
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Forge crashed or produced no changes.`);
      } else {
        const issueList = prev.issues.map(i => i.description || i.title).join('; ');
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Applied changes but issues persisted: ${issueList}`);
      }
    }
    header.push('', 'Understand WHY these fixes failed and take a fundamentally different approach.', '');
  }

  const issueBlocks = issues.map((issue, i) => {
    const parts = [`### Issue ${i + 1}: ${issue.description}`];
    if (issue.module) parts.push(`**Module:** ${issue.module}`);
    if (issue.location) parts.push(`**Location:** ${issue.location}`);
    if (issue.recommended_fix) parts.push(`**Recommended Fix:** ${issue.recommended_fix}`);
    parts.push('');
    return parts.join('\n');
  });

  return [
    ...header,
    `Echo review found ${issues.length} critical issue(s). Fix ALL of the following:`,
    '',
    ...issueBlocks,
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEP (DO NOT SKIP)',
    '',
    'After fixing all issues above, you MUST commit and push your changes.',
    'This is how the pipeline knows you are done. If you do not do this, your work is lost.',
    '',
    '```bash',
    `cd ${config.repo_root}`,
    'git add -A',
    'git commit -m "[forge] Review fix: <brief description of what you fixed>"',
    'git push origin',
    '```',
    '',
    'This must be the LAST thing you do before your session ends.',
    '',
  ].join('\n');
}

/**
 * Clean up all review files before a re-review cycle.
 */
async function cleanupReviewFiles(config, gate, reviewers) {
  const cleaned = [];

  for (const reviewer of reviewers) {
    const filePath = reviewOutputPath(config, gate, reviewer.label);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        cleaned.push(filePath);
        log('INFO', `Cleaned up: ${path.basename(filePath)}`);
      }
    } catch { /* non-critical */ }
  }

  if (gate.output_file) {
    const mergedPath = path.join(swarmRoot(config), gate.output_file);
    try {
      if (fs.existsSync(mergedPath)) {
        fs.unlinkSync(mergedPath);
        cleaned.push(mergedPath);
      }
    } catch { /* ok */ }
  }

  // Commit the deletions so the worktree is clean for subsequent Echo polling.
  if (cleaned.length > 0) {
    try {
      gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
      gitExec(config.repo_root, ['commit', '-m',
        `[pipeline] Cleanup ${cleaned.length} review file(s) before re-review`],
        { stdio: 'ignore' });
      invalidateHeadHash();
      log('OK', `Review cleanup committed (${cleaned.length} file(s))`);
    } catch {
      log('DEBUG', 'Review cleanup: nothing to commit (files may have been untracked)');
    }
  }
}

/**
 * Run one complete review cycle: lint report → single reviewer → parse.
 *
 * Returns { ok: boolean, mergedResult: object|null, mergedFilePath: string|null, error?: string }
 * @private
 */
async function _runReviewOnce(deps, config, progress, gateId, gate, reviewConfig, reviewAttempt = 1) {
  const { reviewers, timeout, lintTier } = reviewConfig;

  if (reviewers.length === 0) {
    return { ok: false, error: 'No reviewers configured' };
  }

  getGateStats(config).total_echo_reviews++;

  const reviewer = reviewers[0];
  const outputFilePath = reviewOutputPath(config, gate, reviewer.label);
  const relOutput = relPath(config, outputFilePath);

  const outDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  log('STEP', `Review cycle: reviewer=${reviewer.label}, output=${path.basename(outputFilePath)}`);

  // ── Phase 1: Generate lint report ──
  let lintBlock = '';
  const tracePath = config._logDir ? path.join(gateLintLogDir(config, gateId), `full-trace-attempt-${reviewAttempt}.jsonl`) : null;
  const { report: lintReport, error: lintError } = deps.generateLintReport(config, lintTier || 'full', {
    moduleId: gateId,
    logPath: tracePath,
  });

  if (lintReport && config._logDir) {
    try {
      const lintDir = gateLintLogDir(config, gateId);
      fs.mkdirSync(lintDir, { recursive: true });
      fs.writeFileSync(path.join(lintDir, `full-attempt-${reviewAttempt}.json`), JSON.stringify(lintReport, null, 2));
    } catch { /* non-critical */ }
  }

  if (lintReport) {
    lintBlock = deps.formatLintReportForReviewer(lintReport);
    log('OK', `Lint report ready: ${lintReport.summary.total_errors} errors, ${lintReport.summary.total_warnings} warnings`);
  } else {
    log('WARN', `Lint report unavailable (${lintError}) — reviewer will run without static analysis data`);
    lintBlock = [
      '## 📊 STATIC ANALYSIS REPORT',
      '',
      '⚠️ Lint report generation failed. Review the code manually for type errors, lint issues, and security concerns.',
      `Error: ${lintError || 'unknown'}`,
      '',
      '---',
      '',
    ].join('\n');
  }

  // ── Phase 2: Build reviewer prompt ──
  let instructions;
  try { instructions = deps.readGateInstructions(config, gate); }
  catch (e) { return { ok: false, error: e.message }; }

  const reviewerPromptResult = deps.buildReviewerPrompt(config, gateId, gate, reviewer, instructions, lintBlock, relOutput);
  const reviewerPrompt = reviewerPromptResult.prompt;

  // ── Phase 3: Spawn reviewer ──
  try {
    const archived = deps.archiveGateOutputIfPresent(config, gateId, outputFilePath, { attempt: reviewAttempt, label: reviewer.label });
    if (archived) log('INFO', `Archived previous review output: ${relPath(config, archived)}`);
    if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
  } catch { /* ok */ }

  try {
    const logDir = gateLogDir(config, gateId);
    fs.mkdirSync(logDir, { recursive: true });
    writeRedactedPromptArtifact(path.join(logDir, `echo-prompt-attempt-${reviewAttempt}.md`), reviewerPrompt, { gate_id: gateId, attempt: reviewAttempt, agent_type: 'echo' });
  } catch { /* non-critical */ }

  const echoStartTime = Date.now();

  // Resolve and log reviewer model/thinking policy before spawn
  const reviewerPolicy = deps.resolvePolicy(config, progress, 'echo', {
    scopeModel: reviewer.model || null,
    scopeThinking: reviewer.thinking_level || null,
    dispatchPath: reviewer.dispatch === 'subagent' ? 'subagent' : 'acp',
  });
  deps.logEffectivePolicy(config, { scope: 'reviewer', agent: 'echo', gateId, ...reviewerPolicy });
  log('INFO', `Reviewer '${reviewer.label}' model: ${reviewerPolicy.model ?? '(none)'} [${reviewerPolicy.model_source}]${reviewerPolicy.thinking ? `, thinking: ${reviewerPolicy.thinking} [${reviewerPolicy.thinking_source}]` : ''}`);

  const echoTrackingKey = `echo-${reviewer.label}-${gateId}`;
  let pollRes = null;
  let echoStreamPath = null;
  let echoSessionKey = null;
  let echoDispatchId = null;
  const maxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;
  let rateLimitPauses = 0;
  try {
    clearGateActiveSession(config, gateId);
    try {
      await deps.spawnReviewerAgent(config, progress, gateId, reviewer, reviewerPrompt, {
        thinking: reviewerPolicy.thinking,
        gate_type: gate.type,
        attempt: reviewAttempt,
      });
      persistGateActiveSession(config, gateId, echoTrackingKey, deps.getTrackedAgent(echoTrackingKey), {
        phase: 'review',
        reviewer: reviewer.label,
        gate_type: gate.type,
        attempt: reviewAttempt,
      });
      echoSessionKey = deps.getTrackedAgent(echoTrackingKey)?.sessionKey || null;
      echoDispatchId = deps.getTrackedAgent(echoTrackingKey)?.telemetry_dispatch_id || deps.getTrackedAgent(echoTrackingKey)?.dispatch_id || null;
    } catch (e) {
      log('ERROR', `Reviewer spawn failed: ${reviewer.label} — ${e.message}`);
      return { ok: false, error: `Reviewer spawn failed: ${e.message}` };
    }

    // ── Phase 4: Poll for review output ──
    pollRes = await withSessionRateLimitRecovery(config,
      async () => {
        const result = await deps.pollForFile(config, outputFilePath, timeout, `Review '${gateId}'`, echoTrackingKey);
        echoStreamPath = deps.getTrackedAgent(echoTrackingKey)?.streamLogPath;
        return result;
      },
      createTrackedGateSessionRateLimitRecoveryOptions(config, {
        sleepFn: deps.sleep,
        discordFn: deps.discord,
        gateId,
        gateType: gate.type,
        agentTypeFallback: 'echo',
        runIdFallback: () => getRunId(config),
        attemptFallback: () => reviewAttempt,
        dispatchIdFallback: () => echoDispatchId || deps.getTrackedAgent(echoTrackingKey)?.telemetry_dispatch_id || deps.getTrackedAgent(echoTrackingKey)?.dispatch_id || null,
        gatewayLabelFallback: reviewer.label,
        sessionKeyFallback: () => echoSessionKey || deps.getTrackedAgent(echoTrackingKey)?.sessionKey || null,
        extraFields: [{ name: 'Reviewer', value: reviewer.label }],
        resumeDescription: `Resuming review for ${gate.title}`,
        pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `Review gate '${gateId}' reviewer rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
        resumeLogMessage: () => `Review gate '${gateId}' reviewer cooldown complete — retrying review attempt ${reviewAttempt}`,
        exhaustedResultConfig: {
          exit: EXIT_RATE_LIMITED,
          resultOverrides: () => ({
            review_attempt: reviewAttempt,
          }),
        },
      })
    );
    rateLimitPauses = pollRes?.rate_limit_pauses ?? rateLimitPauses;
    if (pollRes?.rate_limit_exhausted) return pollRes;
  } finally {
    echoStreamPath = echoStreamPath || deps.getTrackedAgent(echoTrackingKey)?.streamLogPath;
    const killed = await deps.killReviewerAgent(config, gateId, reviewer, pollRes?.ok || false);
    if (killed) clearGateActiveSession(config, gateId);

    // Save stream log to centralized log directory
    if (echoStreamPath) {
      try {
        if (fs.existsSync(echoStreamPath)) {
          const logDir = gateLogDir(config, gateId);
          const destPath = path.join(logDir, `echo-transcript-attempt-${reviewAttempt}.jsonl`);
          copyRedactedTranscriptArtifact(echoStreamPath, destPath);
          log('OK', `Echo stream metadata saved: gates/${gateId}/echo-transcript-attempt-${reviewAttempt}.jsonl`);
        }
      } catch (e) { log('DEBUG', `Echo stream log save failed (non-critical): ${e.message}`); }
    }
  }

  if (!pollRes?.ok) {
    const failureReason = formatReviewPollFailureReason(pollRes);
    log('WARN', `Review poll ended: ${failureReason}. Review file not received.`);
    return {
      ok: false,
      error: `Review file not received (${failureReason})`,
      session_key: resolveStatusSessionKey(pollRes?.status, echoSessionKey),
      transcript: pollRes?.transcript || null,
    };
  }

  // ── Discord: Echo completion summary ──
  const echoDurationSec = Math.round((Date.now() - echoStartTime) / 1000);
  const echoModel = deps.resolveModel(config, progress, 'echo', reviewer.model);
  await deps.discord(config, 'INFO', `Echo complete: ${gate.title}`, `Reviewer: ${reviewer.label}`, [
    ...buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: reviewAttempt, gateway_label: reviewer.label, session_key: echoSessionKey }),
    { name: 'Duration', value: `${Math.round(echoDurationSec / 60)}min` },
    { name: 'Model', value: echoModel },
    { name: 'Reviewer', value: reviewer.label },
  ]);

  // ── Phase 6: Commit review output ──
  await deps.gitCommitAndPush(config,
    `[pipeline] Review: ${gate.review_name} (${reviewer.label})`,
    { softFail: true }
  );

  // ── Phase 7: Parse review result ──
  if (gate.output_file) {
    const gateOutputPath = path.join(swarmRoot(config), gate.output_file);
    if (gateOutputPath !== outputFilePath) {
      try {
        fs.copyFileSync(outputFilePath, gateOutputPath);
      } catch (e) {
        log('WARN', `Could not copy review to gate output: ${e.message}`);
      }
    }
  }

  try {
    const content = fs.readFileSync(outputFilePath, 'utf8');
    try {
      const reviewResult = JSON.parse(content);
      const status = (reviewResult.status || '').toUpperCase();
      const isGo = status === 'GO' || status === 'PASS';
      log('INFO', `Review result: ${reviewResult.status} — ${isGo ? 'GO' : 'NO-GO'}`);
      return { ok: isGo, mergedResult: reviewResult, mergedFilePath: outputFilePath, gateway_label: reviewer.label, session_key: echoSessionKey };
    } catch {
      const isNoGo = /\bNO-GO\b|\bFAIL\b|\bcritical_blockers\b/i.test(content);
      log('INFO', `Review result (non-JSON): ${isNoGo ? 'NO-GO detected' : 'GO (no blockers found)'}`);
      return { ok: !isNoGo, mergedResult: { raw: content }, mergedFilePath: outputFilePath, gateway_label: reviewer.label, session_key: echoSessionKey };
    }
  } catch (e) {
    log('ERROR', `Failed to read review output: ${e.message}`);
    return { ok: false, error: e.message, gateway_label: reviewer.label, session_key: echoSessionKey };
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

function buildReviewRequestFixControlResult(config, gateId, gate, reviewResult, reviewConfig, opts = {}) {
  const attempt = Number(opts.attempt || 1);
  const issues = opts.issues || extractReviewIssues(reviewResult?.mergedResult);
  const reviewerLabel = opts.reviewerLabel || reviewConfig?.reviewers?.[0]?.label || null;
  const gatewayLabel = opts.gatewayLabel || resolveResultGatewayLabel(reviewResult, reviewerLabel);
  const sessionKey = opts.sessionKey || resolveResultSessionKey(reviewResult);
  const summary = summarizeReviewNoGoReason(issues, reviewResult?.mergedResult);

  return buildGateRemediationRequestControlResult({
    producerType: 'review',
    gateId,
    gateType: gate?.type || 'review',
    runId: getRunId(config) || config?._runId || config?.run_id || null,
    attempt,
    summary,
    findings: buildReviewGateFindings(issues),
    metadata: {
      gate_id: gateId,
      gate_type: gate?.type || 'review',
      run_id: getRunId(config) || config?._runId || config?.run_id || null,
      attempt,
      reason: summary,
      reviewer_label: reviewerLabel,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      issues_count: issues.length,
      last_review: cloneSerializable(reviewResult?.mergedResult || null),
      legacy_result: cloneSerializable(reviewResult || null),
    },
    remediation: {
      policy: {
        maxFixCycles: reviewConfig?.maxFixCycles ?? config.default_max_fails,
        nextFixCycle: attempt,
        rerunStageId: 'gate:review',
      },
      targetRef: `gate:${gateId}`,
      startedAt: opts.gateStartedAt ? new Date(opts.gateStartedAt).toISOString() : null,
      correlation: {
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      diagnostics: {
        issues: cloneSerializable(issues),
        last_review: cloneSerializable(reviewResult?.mergedResult || null),
        merged_file_path: reviewResult?.mergedFilePath || null,
      },
    },
  });
}

export async function buildReviewRemediationExhaustedLegacyResult(config, gateId, gate, controlResult, opts = {}) {
  const remediation = readGateRemediationSpec(controlResult) || {};
  const metadata = controlResult?.diagnostics?.metadata || {};
  const gateStartedAt = opts.gateStartedAt ?? (remediation?.startedAt ? new Date(remediation.startedAt).getTime() : Date.now());
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles || metadata?.fix_cycles || config.default_max_fails || 1);
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
        fields: buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: maxFixCycles, gateway_label: latestReviewGatewayLabel, session_key: latestReviewSessionKey }),
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

  return {
    exit: EXIT_NEEDS_NOVA,
    reason: `Review gate '${gateId}' NO-GO after ${maxFixCycles} fix cycles`,
    gate: gateId,
    fix_cycles: maxFixCycles,
    last_review: lastReview,
    gateway_label: latestReviewGatewayLabel,
    session_key: latestReviewSessionKey,
  };
}

export async function runReviewGateEvaluation(config, progress, gateId, opts = {}) {
  const deps = getDeps(config);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const reviewConfig = opts.reviewConfig || resolveReviewConfig(config, gate);
  const { reviewers } = reviewConfig;
  const noGoAction = gate.on_nogo || 'fix_and_rereview';
  const remediation = opts.remediation || readGateRemediationSpec(opts.controlResult) || null;
  const maxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;
  const attempt = Number(opts.attempt || 1);
  const gateStartedAt = opts.gateStartedAt ?? Date.now();

  if (!opts.skipStartedTelemetry) {
    log('STEP', `═══════════════════════════════════════════════════════`);
    log('STEP', `  REVIEW GATE: ${gate.title}`);
    log('STEP', `  Reviewer: ${reviewers[0]?.label || 'none'} | lint_tier: ${reviewConfig.lintTier}`);
    log('STEP', `  on_nogo: ${noGoAction} | max_fix_cycles: ${reviewConfig.maxFixCycles}`);
    log('STEP', `═══════════════════════════════════════════════════════`);
  }

  let skipInitialReview = false;
  if (attempt === 1 && gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    if (fs.existsSync(outPath)) {
      let isCompleted = true;
      try {
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const s = (data.status || '').toUpperCase();
        if (s === 'NO-GO' || s === 'FAIL') {
          isCompleted = false;
          if (opts.novaPrompt) {
            skipInitialReview = true;
            log('INFO', `Review gate '${gateId}' is ${data.status} + Nova prompt provided — skipping initial review, going to Forge fix`);
          } else {
            log('INFO', `Review gate '${gateId}' output file exists but status is '${data.status}' — re-running`);
          }
        }
      } catch { /* non-JSON (e.g. markdown) = completed */ }

      if (isCompleted) {
        log('OK', `Review gate '${gateId}' already completed — skipping`);
        return buildReviewGateControlResult(config, gateId, gate, { exit: EXIT_OK, status: STATUS.PASS, attempt }, opts);
      }
    }
  }

  if (reviewers.length === 0) {
    log('ERROR', `No reviewers configured for gate '${gateId}'`);
    if (!opts.skipStartedTelemetry) {
      await onGateStarted(_telemetryCtx(config), gateId, {
        ...gate,
        reviewers: [],
      });
    }
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      reason: `No reviewers configured for gate '${gateId}'`,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Review Gate Misconfigured: ${gate.title}`,
          description: `No reviewers configured for gate '${gateId}'.`,
          fields: buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt }),
        },
      },
    });
    return buildReviewGateControlResult(config, gateId, gate, { exit: EXIT_ERROR, reason: 'No reviewers configured', attempt }, opts);
  }

  const reviewerLabel = reviewers[0]?.label || null;
  if (!opts.skipStartedTelemetry) {
    await onGateStarted(_telemetryCtx(config), gateId, {
      ...gate,
      reviewers: reviewers.map(r => r.label || r.model || String(r)),
    }, {
      presentation: {
        discord: {
          level: 'INFO',
          title: `Review Gate: ${gate.title}`,
          description: `Reviewer: ${reviewerLabel || 'none'} with lint report (tier: ${reviewConfig.lintTier})`,
          fields: [
            ...buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, gateway_label: reviewerLabel }),
            { name: 'Reviewer', value: reviewerLabel || 'none' },
            { name: 'on_nogo', value: noGoAction },
          ],
        },
      },
    });
  }

  let reviewResult;
  if (skipInitialReview) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    const existingData = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    reviewResult = { ok: false, mergedResult: existingData };
    log('INFO', 'Loaded existing review result for Forge fix (skipped Echo)');
  } else {
    reviewResult = await (deps.runOnce || _runReviewOnce)(deps, config, progress, gateId, gate, reviewConfig, attempt);
  }

  if (reviewResult.rate_limit_exhausted) {
    const exhaustedReason = `Review gate '${gateId}' exceeded max rate limit pauses`;
    const reviewRateLimitExit = await finalizeGateSessionRateLimitExit(reviewResult, {
      config,
      gateId,
      gateType: gate.type,
      phase: attempt > 1 ? 'review_gate_rereview' : 'review_gate',
      exhaustedReason,
      runIdFallback: getRunId(config),
      attemptFallback: attempt,
      gatewayLabelFallback: reviewerLabel,
      maxPausesFallback: maxRateLimitPauses,
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
            fields: buildReviewGateDiscordFields({
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
    return buildReviewGateControlResult(config, gateId, gate, reviewRateLimitExit, { ...opts, input: { ids: { attempt } } });
  }

  if (reviewResult.error) {
    if (attempt > 1 && remediation) {
      log('ERROR', `Re-review failed after fix cycle ${attempt - 1}: ${reviewResult.error}`);
      await onGateFail(_telemetryCtx(config), gateId, {
        gate_type: gate.type,
        fix_cycle: attempt - 1,
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        reason: `Review re-review failed: ${reviewResult.error}`,
        session_key: resolveResultSessionKey(reviewResult) || remediation?.correlation?.session_key || null,
      });
      return buildReviewRequestFixControlResult(config, gateId, gate, {
        ...reviewResult,
        mergedResult: remediation?.diagnostics?.last_review || reviewResult?.mergedResult || null,
      }, reviewConfig, {
        attempt,
        reviewerLabel,
        gateStartedAt,
        issues: remediation?.diagnostics?.issues || [],
        gatewayLabel: remediation?.correlation?.gateway_label || reviewerLabel,
        sessionKey: remediation?.correlation?.session_key || null,
      });
    }

    log('ERROR', `Review gate '${gateId}' failed: ${reviewResult.error}`);
    const reviewSessionKey = resolveResultSessionKey(reviewResult);
    const reviewDispatchId = resolveResultDispatchId(reviewResult);
    const reviewGatewayLabel = resolveResultGatewayLabel(reviewResult, reviewerLabel);
    const reviewFailureFields = buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, dispatch_id: reviewDispatchId, gateway_label: reviewGatewayLabel, session_key: reviewSessionKey });
    const transcriptState = describeTranscriptActivityState(reviewResult.transcript);
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
          fields: buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, gateway_label: resolveResultGatewayLabel(reviewResult), session_key: reviewSessionKey }),
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
        fields: buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt, gateway_label: resolveResultGatewayLabel(reviewResult), session_key: resolveResultSessionKey(reviewResult) }, noGoFields),
      },
    },
  });

  if (noGoAction !== 'fix_and_rereview') {
    return buildReviewGateControlResult(config, gateId, gate, {
      exit: EXIT_NEEDS_NOVA,
      reason: `Review gate '${gateId}' NO-GO`,
      attempt,
      last_review: reviewResult.mergedResult,
      gateway_label: resolveResultGatewayLabel(reviewResult, reviewerLabel),
      session_key: resolveResultSessionKey(reviewResult),
    }, { ...opts, input: { ids: { attempt } } });
  }

  return buildReviewRequestFixControlResult(config, gateId, gate, reviewResult, reviewConfig, {
    attempt,
    reviewerLabel,
    gateStartedAt,
    issues,
  });
}

export async function runReviewGateFixAttempt(config, progress, gateId, controlResult, opts = {}) {
  const deps = getDeps(config);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const remediation = readGateRemediationSpec(controlResult) || {};
  const reviewConfig = opts.reviewConfig || resolveReviewConfig(config, gate);
  const cycle = Number(opts.cycle || remediation?.policy?.nextFixCycle || 1);
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles || reviewConfig.maxFixCycles || config.default_max_fails || 1);
  const gateStartedAt = opts.gateStartedAt ?? (remediation?.startedAt ? new Date(remediation.startedAt).getTime() : Date.now());
  const currentIssues = remediation?.diagnostics?.issues || [];
  const fixHistory = opts.fixHistory || [];

  log('STEP', `Review fix cycle ${cycle}/${maxFixCycles} (request_fix)`);
  if (currentIssues.length === 0) {
    log('WARN', 'NO-GO but no extractable issues — escalating');
    return {
      mode: 'terminal',
      result: buildReviewRemediationExhaustedLegacyResult(config, gateId, gate, controlResult, { gateStartedAt }),
    };
  }

  let fixPrompt = buildReviewFixPrompt(config, gate, currentIssues, cycle, maxFixCycles, fixHistory);
  if (opts.novaPrompt && cycle === 1) {
    fixPrompt = `## Nova Override\n\n${opts.novaPrompt}\n\n---\n\n${fixPrompt}`;
    log('INFO', `Nova prompt injected into Forge fix prompt (cycle 1, ${opts.novaPrompt.length} chars)`);
  }

  let fixSessionKey = remediation?.correlation?.session_key || null;
  let fixGatewayLabel = remediation?.correlation?.gateway_label || null;

  const fixStart = await startGateForgeFixCycleScaffold({
    config,
    progress,
    deps,
    gateId,
    gate,
    cycle,
    fixPrompt,
    fixLabelPrefix: 'reviewfix',
    policyScope: 'review_gate_forge_fix',
    initialCorrelation: {
      sessionKey: fixSessionKey,
      gatewayLabel: fixGatewayLabel,
    },
    buildActiveSessionExtra: () => ({
      phase: 'review_fix',
      reviewer: reviewConfig.reviewers[0]?.label || null,
      gate_type: gate.type,
      cycle,
    }),
  });
  const fixLabel = fixStart.fixLabel;
  fixSessionKey = fixStart.correlation.sessionKey;
  fixGatewayLabel = fixStart.correlation.gatewayLabel;

  if (!fixStart.ok && fixStart.stage === 'spawn') {
    const e = fixStart.error;
    log('ERROR', `Forge spawn failed for review fix: ${e.message}`);
    await deps.discord(config, 'CRITICAL', 'Review Fix: Forge Spawn Failed',
      `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Error: ${e.message}`,
      buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: e.gateway_label || fixGatewayLabel, session_key: fixSessionKey })
    );
    await emitReviewGateFixCycleFail(config, gateId, gate.type, cycle, gateStartedAt, `Review fix Forge spawn failed: ${e.message}`, {
      issues_count: currentIssues.length,
    });
    return { mode: 'retry_request_fix', controlResult };
  }

  if (!fixStart.ok && fixStart.stage === 'health_check') {
    await deps.discord(config, 'WARN', 'Review Fix: Forge Not Responding',
      `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Health check failed. Retrying.`,
      buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: fixGatewayLabel, session_key: fixSessionKey })
    );
    await emitReviewGateFixCycleFail(config, gateId, gate.type, cycle, gateStartedAt, 'Review fix Forge health check failed', {
      issues_count: currentIssues.length,
    });
    return { mode: 'retry_request_fix', controlResult };
  }

  const topIssueTitle = currentIssues[0]?.description || 'issue';
  const moreCount = currentIssues.length - 1;
  const fixingDesc = moreCount > 0 ? `Fixing: ${truncateForDiscord(topIssueTitle, 120)} (+ ${moreCount} more)` : `Fixing: ${truncateForDiscord(topIssueTitle, 150)}`;
  await deps.discord(config, 'INFO', 'Review Fix: Forge Working',
    `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. ${fixingDesc}`,
    buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: fixGatewayLabel, session_key: fixSessionKey })
  );

  const { sessionResult } = await finishGateForgeFixCycleScaffold({
    config,
    deps,
    gateId,
    gate,
    cycle,
    fixLabel,
    fixAcpLabel: fixStart.fixAcpLabel,
    timeoutMinutes: reviewConfig.timeout ?? config.default_timeout_minutes,
    artifactLogLabel: 'Review fix',
  });

  if (sessionResult.reason === 'rate_limit_exhausted') {
    const exhaustedReason = `Review fix '${fixLabel}' exceeded max rate limit pauses`;
    const reviewFixRateLimitExit = await finalizeGateSessionRateLimitExit(sessionResult, {
      config,
      gateId,
      gateType: gate.type,
      phase: 'review_gate_fix',
      exhaustedReason,
      runIdFallback: getRunId(config),
      attemptFallback: cycle,
      gatewayLabelFallback: fixGatewayLabel,
      sessionKeyFallback: fixSessionKey,
      maxPausesFallback: config.rate_limit?.max_pauses_per_module ?? 5,
      exit: EXIT_RATE_LIMITED,
      reason: exhaustedReason,
      telemetryCtx: _telemetryCtx(config),
      runId: getRunId(config),
      discordFn: deps.discord,
      discordTitle: `Review Fix Rate Limit Exhausted: ${gate.title}`,
      discordDescription: (exitResult) => `Fix attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      beforeReturn: () => {
        getGateStats(config).gates_failed.push(gateId);
      },
      gateFailureData: (exitResult) => ({
        issues_count: currentIssues.length,
        fix_cycle: cycle,
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: `Review Fix Rate Limit Exhausted: ${gate.title}`,
            description: `Fix attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
            fields: buildReviewGateDiscordFields({
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
      logMessage: `Review fix '${fixLabel}' rate limit pauses exhausted`,
    });
    return { mode: 'terminal', result: reviewFixRateLimitExit };
  }

  fixHistory.push({ attempt: cycle, hasChanges: sessionResult.hasChanges, issues: currentIssues });

  if (!sessionResult.hasChanges) {
    const transcript = sessionResult.transcript;
    const transcriptActive = transcriptShowsProgress(transcript);
    const reason = sessionResult.completed ? (transcriptActive ? 'no file changes' : 'no changes (crashed?)') : 'timeout';
    const transcriptField = transcript ? (transcriptActive ? `active (${transcript.eventCount} events)` : `stale (no activity for ${transcript.lastActivityPoll} polls)`) : 'unknown';
    log('WARN', `Review fix '${fixLabel}' ${reason}`);
    await deps.discord(config, 'WARN', `Review Fix ${reason}: ${gateId}`,
      `Fix cycle ${cycle}/${maxFixCycles} produced no usable output.`, [
        ...buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: fixGatewayLabel, session_key: fixSessionKey }),
        { name: 'Transcript', value: transcriptField },
      ]);
    await emitReviewGateFixCycleFail(config, gateId, gate.type, cycle, gateStartedAt, `Review fix produced no usable output (${reason})`, {
      issues_count: currentIssues.length,
      session_key: fixSessionKey,
    });
    return { mode: 'retry_request_fix', controlResult };
  }

  await deps.gitCommitAndPush(config, `[pipeline] Review fix: ${gateId} cycle ${cycle}`, { softFail: true });
  await deps.discord(config, 'INFO', 'Review Fix: Re-Reviewing with Echo',
    `Forge fix cycle ${cycle}/${maxFixCycles} committed. Running Echo review again...`,
    buildReviewGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: fixGatewayLabel, session_key: fixSessionKey })
  );
  await cleanupReviewFiles(config, gate, reviewConfig.reviewers);
  return { mode: 're_evaluate' };
}

export async function runReviewGate(config, progress, gateId, { novaPrompt } = {}) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const reviewConfig = resolveReviewConfig(config, gate);
  const gateStartedAt = Date.now();
  const fixHistory = [];

  const initialControlResult = await runReviewGateEvaluation(config, progress, gateId, {
    novaPrompt,
    attempt: 1,
    gateStartedAt,
    reviewConfig,
    skipStartedTelemetry: false,
  });

  return runRemediableGateControlLoop({
    initialControlResult,
    evaluateGate: ({ attempt, controlResult: remediationControlResult, remediation }) => runReviewGateEvaluation(config, progress, gateId, {
      attempt,
      gateStartedAt,
      reviewConfig,
      skipStartedTelemetry: true,
      controlResult: remediationControlResult,
      remediation,
    }),
    performFix: ({ controlResult, cycle }) => runReviewGateFixAttempt(config, progress, gateId, controlResult, {
      cycle,
      novaPrompt,
      gateStartedAt,
      reviewConfig,
      fixHistory,
    }),
    extractLegacyResult: extractReviewGateLegacyResult,
    buildExhaustedLegacyResult: ({ controlResult }) => buildReviewRemediationExhaustedLegacyResult(config, gateId, gate, controlResult, { gateStartedAt }),
    gateId,
    gate,
  });
}

export async function runReviewGateStage(config, progress, gateId, opts = {}) {
  return runReviewGateEvaluation(config, progress, gateId, opts);
}
