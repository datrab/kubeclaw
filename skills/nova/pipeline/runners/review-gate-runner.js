// runners/review-gate-runner.js — Review gate runner
// Handles the review gate lifecycle:
//   1. Completion check (content-aware: NO-GO files are not complete)
//   2. Lint report generation (deterministic static analysis)
//   3. Echo reviewer spawn → poll output file → parse GO/NO-GO
//   4. Fix-and-rereview loop (Forge fixes issues, Echo re-reviews)

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA } from '../core/constants.js';
import { getRunStats } from '../core/runtime.js';
import { resolveModel, resolvePolicy, logEffectivePolicy } from '../core/config.js';
import { swarmRoot, relPath, projectSrcPath, gateLogDir, gateLintLogDir } from '../core/paths.js';
import { gitExec, invalidateHeadHash } from '../core/git.js';
import { discord } from '../integrations/discord.js';
import { gitCommitAndPush } from '../integrations/git.js';
import { archiveGateOutputIfPresent } from '../services/status-store.js';
import { truncateForDiscord } from '../services/failures.js';
import { pollForFile } from '../services/polling.js';
import { generateLintReport, formatLintReportForReviewer } from '../services/lint.js';
import { readGateInstructions } from '../prompts/buster-gate.js';
import { buildReviewerPrompt } from '../prompts/review.js';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive, spawnReviewerAgent, killReviewerAgent } from '../agents/lifecycle.js';
import { transcriptShowsProgress } from '../agents/acp-monitor.js';
import { getTrackedAgent } from '../agents/shutdown.js';
import { pollForSessionEnd } from '../services/polling.js';
import { getActiveContext } from '../core/logger.js';
import { onGateStarted, onGatePass, onGateFail } from '../services/telemetry.js';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

const DEFAULT_DEPS = {
  resolveModel,
  resolvePolicy,
  logEffectivePolicy,
  discord,
  gitCommitAndPush,
  archiveGateOutputIfPresent,
  pollForFile,
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
    fs.writeFileSync(path.join(logDir, `echo-prompt-attempt-${reviewAttempt}.md`), reviewerPrompt);
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

  try {
    await deps.spawnReviewerAgent(config, progress, gateId, reviewer, reviewerPrompt, { thinking: reviewerPolicy.thinking });
  } catch (e) {
    log('ERROR', `Reviewer spawn failed: ${reviewer.label} — ${e.message}`);
    return { ok: false, error: `Reviewer spawn failed: ${e.message}` };
  }

  // ── Phase 4: Poll for review output ──
  const echoTrackingKey = `echo-${reviewer.label}-${gateId}`;
  const pollRes = await deps.pollForFile(config, outputFilePath, timeout, `Review '${gateId}'`, echoTrackingKey);

  // ── Phase 5: Kill reviewer ──
  const echoStreamPath = deps.getTrackedAgent(echoTrackingKey)?.streamLogPath;
  await deps.killReviewerAgent(config, gateId, reviewer, pollRes.ok);

  // Save stream log to centralized log directory
  if (echoStreamPath) {
    try {
      if (fs.existsSync(echoStreamPath)) {
        const logDir = gateLogDir(config, gateId);
        const destPath = path.join(logDir, `echo-transcript-attempt-${reviewAttempt}.jsonl`);
        fs.copyFileSync(echoStreamPath, destPath);
        log('OK', `Echo stream log saved: gates/${gateId}/echo-transcript-attempt-${reviewAttempt}.jsonl`);
      }
    } catch (e) { log('DEBUG', `Echo stream log save failed (non-critical): ${e.message}`); }
  }

  if (!pollRes.ok) {
    log('WARN', `Review poll ended: ${pollRes.reason}. Review file not received.`);
    return { ok: false, error: `Review file not received (${pollRes.reason})` };
  }

  // ── Discord: Echo completion summary ──
  const echoDurationSec = Math.round((Date.now() - echoStartTime) / 1000);
  const echoModel = deps.resolveModel(config, progress, 'echo', reviewer.model);
  await deps.discord(config, 'INFO', `Echo complete: ${gate.title}`, `Reviewer: ${reviewer.label}`, [
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
      return { ok: isGo, mergedResult: reviewResult, mergedFilePath: outputFilePath };
    } catch {
      const isNoGo = /\bNO-GO\b|\bFAIL\b|\bcritical_blockers\b/i.test(content);
      log('INFO', `Review result (non-JSON): ${isNoGo ? 'NO-GO detected' : 'GO (no blockers found)'}`);
      return { ok: !isNoGo, mergedResult: { raw: content }, mergedFilePath: outputFilePath };
    }
  } catch (e) {
    log('ERROR', `Failed to read review output: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

export async function runReviewGate(config, progress, gateId, { novaPrompt } = {}) {
  const deps = getDeps(config);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const reviewConfig = resolveReviewConfig(config, gate);
  const { reviewers, maxFixCycles } = reviewConfig;

  log('STEP', `═══════════════════════════════════════════════════════`);
  log('STEP', `  REVIEW GATE: ${gate.title}`);
  log('STEP', `  Reviewer: ${reviewers[0]?.label || 'none'} | lint_tier: ${reviewConfig.lintTier}`);
  log('STEP', `  on_nogo: ${gate.on_nogo} | max_fix_cycles: ${maxFixCycles}`);
  log('STEP', `═══════════════════════════════════════════════════════`);

  // Already completed? Content-aware: a NO-GO file from a crashed fix cycle is NOT completed.
  let skipInitialReview = false;
  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    if (fs.existsSync(outPath)) {
      let isCompleted = true;
      try {
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const s = (data.status || '').toUpperCase();
        if (s === 'NO-GO' || s === 'FAIL') {
          isCompleted = false;
          if (novaPrompt) {
            skipInitialReview = true;
            log('INFO', `Review gate '${gateId}' is ${data.status} + Nova prompt provided — skipping initial review, going to Forge fix`);
          } else {
            log('INFO', `Review gate '${gateId}' output file exists but status is '${data.status}' — re-running`);
          }
        }
      } catch { /* non-JSON (e.g. markdown) = completed */ }

      if (isCompleted) {
        log('OK', `Review gate '${gateId}' already completed — skipping`);
        return { exit: EXIT_OK, status: STATUS.PASS };
      }
    }
  }

  if (reviewers.length === 0) {
    log('ERROR', `No reviewers configured for gate '${gateId}'`);
    return { exit: EXIT_ERROR, reason: 'No reviewers configured' };
  }

  await deps.discord(config, 'INFO', `Review Gate: ${gate.title}`,
    `Reviewer: ${reviewers[0]?.label || 'none'} with lint report (tier: ${reviewConfig.lintTier})`, [
      { name: 'Reviewer', value: reviewers[0]?.label || 'none' },
      { name: 'on_nogo', value: gate.on_nogo },
    ]);
  onGateStarted(_telemetryCtx(config), gateId, {
    ...gate,
    reviewers: reviewers.map(r => r.label || r.model || String(r)),
  });

  const _gateStartedAt = Date.now();

  // ── Initial review ──
  let reviewResult;
  if (skipInitialReview) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    const existingData = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    reviewResult = { ok: false, mergedResult: existingData };
    log('INFO', `Loaded existing review result for Forge fix (skipped Echo)`);
  } else {
    reviewResult = await (deps.runOnce || _runReviewOnce)(deps, config, progress, gateId, gate, reviewConfig);
  }

  if (reviewResult.error) {
    log('ERROR', `Review gate '${gateId}' failed: ${reviewResult.error}`);
    return { exit: EXIT_ERROR, reason: `Review failed: ${reviewResult.error}` };
  }

  if (reviewResult.ok) {
    log('OK', `Review gate '${gateId}' GO`);
    getGateStats(config).gates_completed.push(gateId);
    await deps.discord(config, 'OK', `Review: ${gate.title} GO`, 'Review approved');
    onGatePass(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: 0,
      duration_seconds: Math.round((Date.now() - _gateStartedAt) / 1000),
    });
    return { exit: EXIT_OK, status: STATUS.PASS };
  }

  // ── NO-GO ──
  log('WARN', `Review gate '${gateId}' NO-GO`);
  const issues = extractReviewIssues(reviewResult.mergedResult);
  log('INFO', `${issues.length} critical issue(s) extracted from review`);

  const noGoFields = [];
  for (let i = 0; i < Math.min(issues.length, 3); i++) {
    noGoFields.push({ name: `Issue ${i + 1}`, value: truncateForDiscord(issues[i].description, 200), inline: false });
  }
  if (issues.length > 3) {
    const artifactRef = reviewResult.mergedFilePath ? relPath(config, reviewResult.mergedFilePath) : 'review output';
    noGoFields.push({ name: `+ ${issues.length - 3} more`, value: `See full report: ${artifactRef}`, inline: false });
  }
  await deps.discord(config, 'WARN', `Review: ${gate.title} NO-GO — Fix & Re-Review`,
    `${issues.length} critical issue(s). Starting fix-and-rereview cycle.`, noGoFields);

  const fixHistory = [];
  for (let cycle = 1; cycle <= maxFixCycles; cycle++) {
    log('STEP', `Review fix cycle ${cycle}/${maxFixCycles} (fix_and_rereview)`);

    // ── Forge fix ──
    const currentIssues = extractReviewIssues(reviewResult.mergedResult);
    if (currentIssues.length === 0) {
      log('WARN', 'NO-GO but no extractable issues — escalating');
      break;
    }

    let fixPrompt = buildReviewFixPrompt(config, gate, currentIssues, cycle, maxFixCycles, fixHistory);
    if (novaPrompt && cycle === 1) {
      fixPrompt = `## Nova Override\n\n${novaPrompt}\n\n---\n\n${fixPrompt}`;
      log('INFO', `Nova prompt injected into Forge fix prompt (cycle 1, ${novaPrompt.length} chars)`);
    }
    const forgeFixPolicy = deps.resolvePolicy(config, progress, 'forge', {
      scopeModel: gate.forge_model || null,
      scopeThinking: gate.forge_thinking_level || null,
      dispatchPath: 'acp',
    });
    const forgeModel = forgeFixPolicy.model;
    deps.logEffectivePolicy(config, { scope: 'review_gate_forge_fix', agent: 'forge', gateId, ...forgeFixPolicy });
    const fixLabel = `reviewfix-${gateId}-${cycle}`;
    const fixAcpLabel = deps.acpLabel('forge', fixLabel);

    try {
      const logDir = gateLogDir(config, gateId);
      fs.writeFileSync(path.join(logDir, `forge-fix-prompt-cycle-${cycle}.md`), fixPrompt);
    } catch { /* non-critical */ }

    try { await deps.spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt, { thinking: forgeFixPolicy.thinking }); }
    catch (e) {
      log('ERROR', `Forge spawn failed for review fix: ${e.message}`);
      await deps.discord(config, 'CRITICAL', `Review Fix: Forge Spawn Failed`,
        `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Error: ${e.message}`);
      continue;
    }

    if (!(await deps.verifyAgentAlive(config, 'forge', fixLabel))) {
      await deps.discord(config, 'WARN', `Review Fix: Forge Not Responding`,
        `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Health check failed. Retrying.`);
      await deps.killAgent(config, 'forge', fixLabel);
      continue;
    }

    const topIssueTitle = currentIssues[0]?.description || 'issue';
    const moreCount = currentIssues.length - 1;
    const fixingDesc = moreCount > 0
      ? `Fixing: ${truncateForDiscord(topIssueTitle, 120)} (+ ${moreCount} more)`
      : `Fixing: ${truncateForDiscord(topIssueTitle, 150)}`;
    await deps.discord(config, 'INFO', `Review Fix: Forge Working`,
      `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. ${fixingDesc}`);

    const sessionResult = await deps.pollForSessionEnd(
      config, fixAcpLabel, reviewConfig.timeout ?? config.default_timeout_minutes, fixLabel);

    // Save Forge review-fix stream log
    const fixStreamPath = deps.getTrackedAgent(fixAcpLabel)?.streamLogPath;
    if (fixStreamPath) {
      try {
        if (fs.existsSync(fixStreamPath)) {
          const logDir = gateLogDir(config, gateId);
          const destPath = path.join(logDir, `forge-fix-transcript-cycle-${cycle}.jsonl`);
          fs.copyFileSync(fixStreamPath, destPath);
          log('OK', `Review fix stream log saved: gates/${gateId}/forge-fix-transcript-cycle-${cycle}.jsonl`);
        }
      } catch (e) { log('DEBUG', `Review fix stream log save failed (non-critical): ${e.message}`); }
    }

    await deps.killAgent(config, 'forge', fixLabel, sessionResult.hasChanges);

    fixHistory.push({ attempt: cycle, hasChanges: sessionResult.hasChanges, issues: currentIssues });

    if (!sessionResult.hasChanges) {
      const _transcript = sessionResult.transcript;
      const _tsActive = transcriptShowsProgress(_transcript);
      const reason = sessionResult.completed
        ? (_tsActive ? 'no file changes' : 'no changes (crashed?)')
        : 'timeout';
      const _tsField = _transcript
        ? (_tsActive
            ? `active (${_transcript.eventCount} events)`
            : `stale (no activity for ${_transcript.lastActivityPoll} polls)`)
        : 'unknown';
      log('WARN', `Review fix '${fixLabel}' ${reason}`);
      await deps.discord(config, 'WARN', `Review Fix ${reason}: ${gateId}`,
        `Fix cycle ${cycle}/${maxFixCycles} produced no usable output.`, [
          { name: 'Transcript', value: _tsField },
        ]);
      continue;
    }

    await deps.gitCommitAndPush(config, `[pipeline] Review fix: ${gateId} cycle ${cycle}`, { softFail: true });

    await deps.discord(config, 'INFO', `Review Fix: Re-Reviewing with Echo`,
      `Forge fix cycle ${cycle}/${maxFixCycles} committed. Running Echo review again...`);

    // ── Cleanup old review files and re-review ──
    await cleanupReviewFiles(config, gate, reviewers);

    reviewResult = await (deps.runOnce || _runReviewOnce)(deps, config, progress, gateId, gate, reviewConfig, cycle + 1);

    if (reviewResult.error) {
      log('ERROR', `Re-review failed: ${reviewResult.error}`);
      await deps.discord(config, 'WARN', `Review Fix: Re-Review Error`,
        `Cycle ${cycle}/${maxFixCycles}. Echo review failed: ${reviewResult.error}`);
      continue;
    }

    if (reviewResult.ok) {
      log('OK', `Review gate '${gateId}' GO after ${cycle} fix cycle(s)`);
      getGateStats(config).gates_completed.push(gateId);
      await deps.discord(config, 'OK', `Review: ${gate.title} GO`,
        `Passed after ${cycle} fix cycle(s)`);
      onGatePass(_telemetryCtx(config), gateId, {
        gate_type: gate.type,
        issues_count: issues.length,
        fix_cycle: cycle,
        duration_seconds: Math.round((Date.now() - _gateStartedAt) / 1000),
      });
      return { exit: EXIT_OK, status: STATUS.PASS };
    }

    log('WARN', `Re-review still NO-GO after fix cycle ${cycle}/${maxFixCycles}`);
    const reReviewIssues = extractReviewIssues(reviewResult.mergedResult);
    const reReviewFields = [];
    for (let i = 0; i < Math.min(reReviewIssues.length, 3); i++) {
      reReviewFields.push({ name: `Issue ${i + 1}`, value: truncateForDiscord(reReviewIssues[i].description, 200), inline: false });
    }
    if (reReviewIssues.length > 3) {
      const artifactRef = reviewResult.mergedFilePath ? relPath(config, reviewResult.mergedFilePath) : 'review output';
      reReviewFields.push({ name: `+ ${reReviewIssues.length - 3} more`, value: `See full report: ${artifactRef}`, inline: false });
    }
    await deps.discord(config, 'WARN', `Review Fix: Still NO-GO`,
      `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Echo still found ${reReviewIssues.length} issue(s).`, reReviewFields);
  }

  // Exhausted
  log('ERROR', `Review gate '${gateId}' fix_and_rereview exhausted (${maxFixCycles} cycles)`);
  getGateStats(config).gates_failed.push(gateId);
  await deps.discord(config, 'CRITICAL', `Review: ${gate.title} BLOCKED`,
    `Fix-and-rereview exhausted after ${maxFixCycles} cycles. Nova must intervene.`);
  onGateFail(_telemetryCtx(config), gateId, {
    gate_type: gate.type,
    issues_count: extractReviewIssues(reviewResult?.mergedResult).length,
    fix_cycle: maxFixCycles,
    duration_seconds: Math.round((Date.now() - _gateStartedAt) / 1000),
    reason: `NO-GO after ${maxFixCycles} fix cycles`,
  });

  return {
    exit: EXIT_NEEDS_NOVA,
    reason: `Review gate '${gateId}' NO-GO after ${maxFixCycles} fix cycles`,
    gate: gateId,
    fix_cycles: maxFixCycles,
    last_review: reviewResult.mergedResult,
  };
}
