// runners/review-gate-task.ts — Echo review gate task execution
// Owns one Echo review cycle: lint report, reviewer spawn/poll/kill, artifact handling, and output parsing.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { relPath, gateLogDir, gateLintLogDir, gateOutputPath, reviewGateOutputPath } from '../core/paths.ts';
import {
  createTrackedGateSessionRateLimitRecoveryOptions,
  withSessionRateLimitRecovery,
} from '../services/rate-limit.ts';
import { resolveStatusSessionKey } from '../services/correlation.ts';
import { copyRedactedTranscriptArtifact, writeRedactedPromptArtifact } from '../redaction.ts';
import { transcriptShowsProgress } from '../agents/acp-monitor.ts';
import { persistGateActiveSession, clearGateActiveSession } from '../services/gate-active-session.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { emitGitCommitPushSoftFailDegraded } from '../services/git-soft-fail-observability.ts';
import { appendDurableOperatorAlert } from '../services/durable-operator-alert.ts';
import { parseReviewOutputContent } from './review-gate-output.ts';

function telemetryCtx(config) {
  return { config, runId: getRunId(config) };
}

export function reviewOutputPath(config, gate, reviewerLabel) {
  return reviewGateOutputPath(config, gate, reviewerLabel);
}

function trackedGatewayLabel(agent = null) {
  return agent?.gatewayLabel || agent?.gateway_label || null;
}

function formatReviewPollFailureReason(pollRes) {
  const reason = pollRes?.reason || 'unknown';
  const detail = pollRes?.status?.detail || null;
  return detail ? `${reason} (${detail})` : reason;
}

export function describeReviewTranscriptActivityState(transcript) {
  if (!transcript) return null;
  if (transcriptShowsProgress(transcript)) {
    return `active (${transcript.eventCount} events)`;
  }
  if (typeof transcript.lastActivityPoll === 'number') {
    return `stale (no activity for ${transcript.lastActivityPoll} polls)`;
  }
  return 'present';
}

function emitReviewArtifactObservability(config, gateId, gate, artifact, error, extra = {}) {
  const detail = error?.message || String(error || 'unknown artifact error');
  log('WARN', `Review artifact ${artifact} failed (non-authoritative): ${detail}`);
  appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
    reason: 'review_artifact_write_failed',
    artifact,
    detail,
    gate_id: gateId,
    gate_type: gate?.type || 'review',
    source: 'review_gate_artifact',
    ...extra,
  }, {
    severity: 'WARN',
    source: 'review_gate_artifact',
    emitter: 'nova/pipeline/runners/review-gate-task',
    gateId,
    gateType: gate?.type || 'review',
    attempt: extra.attempt ?? null,
  });
}

/**
 * Run one complete review cycle: lint report → single reviewer → parse.
 *
 * Returns { ok: boolean, mergedResult: object|null, mergedFilePath: string|null, error?: string }
 */
export async function runReviewGateOnce({ deps, config, progress, gateId, gate, reviewConfig, reviewAttempt = 1 }) {
  const { reviewers, timeout, lintTier, lintRequired } = reviewConfig;

  if (reviewers.length === 0) {
    return { ok: false, error: 'No reviewers configured' };
  }

  getRunStats(config).total_echo_reviews++;

  const reviewer = reviewConfig.primaryReviewer;
  if (!reviewer) {
    return { ok: false, error: `Review gate '${gateId}' requires typed primary reviewer policy` };
  }
  const outputFilePath = reviewOutputPath(config, gate, reviewer.label);
  const relOutput = relPath(config, outputFilePath);

  const outDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  log('STEP', `Review cycle: reviewer=${reviewer.label}, output=${path.basename(outputFilePath)}`);

  // ── Phase 1: Generate lint report ──
  let lintBlock = '';
  const lintDir = gateLintLogDir(config, gateId);
  const tracePath = lintDir ? path.join(lintDir, `full-trace-attempt-${reviewAttempt}.jsonl`) : null;
  const { report: lintReport, error: lintError } = deps.generateLintReport(config, lintTier || 'full', {
    moduleId: gateId,
    logPath: tracePath,
  });

  if (lintReport && lintDir) {
    try {
      fs.mkdirSync(lintDir, { recursive: true });
      fs.writeFileSync(path.join(lintDir, `full-attempt-${reviewAttempt}.json`), JSON.stringify(lintReport, null, 2));
    } catch (error) {
      emitReviewArtifactObservability(config, gateId, gate, 'lint_report_json', error, { attempt: reviewAttempt });
    }
  }

  if (lintReport) {
    lintBlock = deps.formatLintReportForReviewer(lintReport);
    log('OK', `Lint report ready: ${lintReport.summary.total_errors} errors, ${lintReport.summary.total_warnings} warnings`);
  } else {
    if (lintRequired) {
      const reason = `Review lint setup failed: ${lintError || 'unknown lint error'}`;
      appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
        reason: 'review_lint_setup_failed',
        detail: reason,
        lint_tier: lintTier || 'full',
        gate_id: gateId,
        gate_type: gate?.type || 'review',
        source: 'review_gate_setup',
      }, {
        severity: 'CRITICAL',
        source: 'review_gate_setup',
        emitter: 'nova/pipeline/runners/review-gate-task',
        gateId,
        gateType: gate?.type || 'review',
        attempt: reviewAttempt,
      });
      return {
        ok: false,
        error: reason,
        review_setup_failed: true,
        lint_required: true,
      };
    }
    log('WARN', `Optional lint report unavailable (${lintError}) — reviewer will run without static analysis data`);
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
  } catch (error) {
    emitReviewArtifactObservability(config, gateId, gate, 'stale_review_output_archive', error, { attempt: reviewAttempt });
  }
  try {
    if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
  } catch (error) {
    emitReviewArtifactObservability(config, gateId, gate, 'stale_review_output_removal', error, { attempt: reviewAttempt });
    return {
      ok: false,
      error: `Review setup failed: stale review output could not be removed: ${error.message}`,
      review_setup_failed: true,
    };
  }

  try {
    const logDir = gateLogDir(config, gateId);
    fs.mkdirSync(logDir, { recursive: true });
    writeRedactedPromptArtifact(path.join(logDir, `echo-prompt-attempt-${reviewAttempt}.md`), reviewerPrompt, { gate_id: gateId, attempt: reviewAttempt, agent_type: 'echo' });
  } catch (error) {
    emitReviewArtifactObservability(config, gateId, gate, 'review_prompt', error, { attempt: reviewAttempt });
  }

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
  let echoGatewayLabel = null;
  const maxRateLimitPauses = config.rate_limit.max_pauses_per_module;
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
      const trackedEcho = deps.getTrackedAgent(echoTrackingKey);
      echoSessionKey = trackedEcho?.sessionKey || null;
      echoDispatchId = trackedEcho?.telemetry_dispatch_id || trackedEcho?.dispatch_id || null;
      echoGatewayLabel = trackedGatewayLabel(trackedEcho);
    } catch (e) {
      log('ERROR', `Reviewer spawn failed: ${reviewer.label} — ${e.message}`);
      return { ok: false, error: `Reviewer spawn failed: ${e.message}` };
    }

    // ── Phase 4: Poll for review output ──
    pollRes = await withSessionRateLimitRecovery(config,
      async () => {
        const result = await deps.pollForFile(config, outputFilePath, timeout, `Review '${gateId}'`, echoTrackingKey);
        const trackedEcho = deps.getTrackedAgent(echoTrackingKey);
        echoStreamPath = trackedEcho?.streamLogPath;
        echoGatewayLabel = echoGatewayLabel || trackedGatewayLabel(trackedEcho);
        return result;
      },
      createTrackedGateSessionRateLimitRecoveryOptions(config, {
        sleepFn: deps.sleep,
        discordFn: deps.discord,
        gateId,
        gateType: gate.type,
        identity: {
          agent_type: 'echo',
          run_id: getRunId(config),
          attempt: reviewAttempt,
          dispatch_id: echoDispatchId || deps.getTrackedAgent(echoTrackingKey)?.telemetry_dispatch_id || deps.getTrackedAgent(echoTrackingKey)?.dispatch_id || null,
          gateway_label: echoGatewayLabel || trackedGatewayLabel(deps.getTrackedAgent(echoTrackingKey)),
          session_key: echoSessionKey || deps.getTrackedAgent(echoTrackingKey)?.sessionKey || null,
        },
        updateCorrelation: () => {
          const trackedEcho = deps.getTrackedAgent(echoTrackingKey);
          return {
            dispatch_id: echoDispatchId || trackedEcho?.telemetry_dispatch_id || trackedEcho?.dispatch_id || null,
            gateway_label: echoGatewayLabel || trackedGatewayLabel(trackedEcho),
          };
        },
        extraFields: [{ name: 'Reviewer', value: reviewer.label }],
        resumeDescription: `Resuming review for ${gate.title}`,
        pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `Review gate '${gateId}' reviewer rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
        resumeLogMessage: () => `Review gate '${gateId}' reviewer cooldown complete — retrying review attempt ${reviewAttempt}`,
        exhaustedResultConfig: {
          resultOverrides: {
            review_attempt: reviewAttempt,
            outcome_class: 'rate_limited',
          },
        },
      })
    );
    rateLimitPauses = pollRes?.rate_limit_pauses ?? rateLimitPauses;
    if (pollRes?.rate_limit_exhausted) return pollRes;
  } finally {
    echoStreamPath = echoStreamPath || deps.getTrackedAgent(echoTrackingKey)?.streamLogPath;
    const trackedEchoForCleanup = deps.getTrackedAgent(echoTrackingKey);
    const cleanupIdentity = {
      run_id: getRunId(config),
      attempt: reviewAttempt,
      dispatch_id: echoDispatchId || trackedEchoForCleanup?.telemetry_dispatch_id || trackedEchoForCleanup?.dispatch_id || null,
      gateway_label: echoGatewayLabel || trackedGatewayLabel(trackedEchoForCleanup),
      session_key: echoSessionKey || trackedEchoForCleanup?.sessionKey || null,
    };
    const killed = await deps.killReviewerAgent(config, gateId, reviewer, pollRes?.ok || false);
    if (killed) clearGateActiveSession(config, gateId, cleanupIdentity);

    // Save stream log to centralized log directory
    if (echoStreamPath) {
      try {
        if (fs.existsSync(echoStreamPath)) {
          const logDir = gateLogDir(config, gateId);
          const destPath = path.join(logDir, `echo-transcript-attempt-${reviewAttempt}.jsonl`);
          copyRedactedTranscriptArtifact(echoStreamPath, destPath);
          log('OK', `Echo stream metadata saved: gates/${gateId}/echo-transcript-attempt-${reviewAttempt}.jsonl`);
        }
      } catch (e) {
        emitReviewArtifactObservability(config, gateId, gate, 'echo_transcript', e, { attempt: reviewAttempt });
      }
    }
  }

  if (!pollRes?.ok) {
    const failureReason = formatReviewPollFailureReason(pollRes);
    log('WARN', `Review poll ended: ${failureReason}. Review file not received.`);
    return {
      ok: false,
      error: `Review file not received (${failureReason})`,
      session_key: resolveStatusSessionKey(pollRes?.status) ?? echoSessionKey ?? null,
      transcript: pollRes?.transcript || null,
    };
  }

  // ── Discord: Echo completion summary ──
  const echoDurationSec = Math.round((Date.now() - echoStartTime) / 1000);
  const echoModel = reviewerPolicy.model;
  echoGatewayLabel = echoGatewayLabel || trackedGatewayLabel(deps.getTrackedAgent(echoTrackingKey));
  await deps.discord(config, 'INFO', `Echo complete: ${gate.title}`, `Reviewer: ${reviewer.label}`, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type, attempt: reviewAttempt, gateway_label: echoGatewayLabel, session_key: echoSessionKey }),
    { name: 'Duration', value: `${Math.round(echoDurationSec / 60)}min` },
    { name: 'Model', value: echoModel },
    { name: 'Reviewer', value: reviewer.label },
  ]);

  // ── Phase 6: Parse review result before publication ──
  let parsedReview;
  try {
    const content = fs.readFileSync(outputFilePath, 'utf8');
    parsedReview = parseReviewOutputContent(content);
  } catch (e) {
    log('ERROR', `Failed to read review output: ${e.message}`);
    return { ok: false, error: e.message, gateway_label: echoGatewayLabel, session_key: echoSessionKey };
  }

  if (parsedReview.decision === 'invalid_contract') {
    log('ERROR', parsedReview.error);
    return {
      ok: false,
      error: parsedReview.error,
      invalid_contract: parsedReview.invalid_contract === true,
      ...(Object.prototype.hasOwnProperty.call(parsedReview, 'mergedResult') ? { mergedResult: parsedReview.mergedResult } : {}),
      mergedFilePath: outputFilePath,
      gateway_label: echoGatewayLabel,
      session_key: echoSessionKey,
    };
  }

  // ── Phase 7: Stage canonical review output before publication ──
  if (gate.output_file) {
    const mergedGateOutputPath = gateOutputPath(config, gate);
    if (mergedGateOutputPath !== outputFilePath) {
      try {
        fs.mkdirSync(path.dirname(mergedGateOutputPath), { recursive: true });
        fs.copyFileSync(outputFilePath, mergedGateOutputPath);
      } catch (e) {
        emitReviewArtifactObservability(config, gateId, gate, 'merged_gate_output', e, { attempt: reviewAttempt });
        return {
          ok: false,
          error: `Review output publication failed: canonical gate output could not be written: ${e.message}`,
          output_publication_failed: true,
          mergedFilePath: outputFilePath,
          gateway_label: echoGatewayLabel,
          session_key: echoSessionKey,
        };
      }
    }
  }

  // ── Phase 8: Commit review output ──
  const reviewGitResult = await deps.gitCommitAndPush(config,
    `[pipeline] Review: ${gate.review_name} (${reviewer.label})`,
    { softFail: true }
  );
  const reviewPublicationDegraded = emitGitCommitPushSoftFailDegraded(telemetryCtx(config), {
    error: reviewGitResult?.error,
    gate_id: gateId,
    gate_type: gate.type || 'review',
    attempt: reviewAttempt,
    session_key: resolveStatusSessionKey(pollRes?.status) ?? echoSessionKey ?? null,
  });
  if (reviewPublicationDegraded) {
    return {
      ok: false,
      error: `Review output publication failed: ${reviewGitResult?.error || 'unknown git error'}`,
      output_publication_failed: true,
      mergedFilePath: outputFilePath,
      gateway_label: echoGatewayLabel,
      session_key: echoSessionKey,
    };
  }

  if (parsedReview.decision === 'go') {
    log('INFO', `Review result: ${parsedReview.displayStatus} — GO`);
    return { ok: true, mergedResult: parsedReview.mergedResult, mergedFilePath: outputFilePath, gateway_label: echoGatewayLabel, session_key: echoSessionKey };
  }
  log('INFO', `Review result: ${parsedReview.displayStatus} — NO-GO`);
  return { ok: false, mergedResult: parsedReview.mergedResult, mergedFilePath: outputFilePath, gateway_label: echoGatewayLabel, session_key: echoSessionKey };
}
